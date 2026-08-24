#!/usr/bin/env node
// scripts/probe-cli.js
//
// 실 CLI 스모크 테스트. 유닛 테스트로는 잡을 수 없는 것들을 확인한다:
//  - CLI가 설치돼 있고 인증돼 있는가
//  - 우리가 만드는 argv를 CLI가 실제로 받아들이는가
//  - 응답 파싱이 실제 출력에 대해 동작하는가
//
// 사용법 (npm run build 이후):
//   node scripts/probe-cli.js --codex
//   node scripts/probe-cli.js --agy [--model gemini-3.1-pro-high]
//   node scripts/probe-cli.js --claude
//   node scripts/probe-cli.js --all
//   node scripts/probe-cli.js --agy --deny-probe   # 권한 거부 분류 회귀 테스트

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const PROBE_PROMPT = 'Reply with exactly this one word and nothing else: PROBE_OK';
const EXPECTED = 'PROBE_OK';

function parseArgs(argv) {
  const args = { targets: [], model: undefined, denyProbe: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.targets = ['codex', 'agy', 'claude'];
    else if (a === '--codex') args.targets.push('codex');
    else if (a === '--agy') args.targets.push('agy');
    else if (a === '--claude') args.targets.push('claude');
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--deny-probe') args.denyProbe = true;
  }
  return args;
}

async function loadDist() {
  if (!existsSync(join(DIST, 'index.js'))) {
    console.error('dist/ 가 없습니다. 먼저 `npm run build` 를 실행하세요.');
    process.exit(2);
  }
  const url = (rel) => pathToFileURL(join(DIST, rel)).href;
  return {
    providers: await import(url('services/providers/index.js')),
    registry: await import(url('services/providers/registry.js')),
    agyProvider: await import(url('services/providers/agy-provider.js')),
    agyParse: await import(url('services/providers/agy-parse.js')),
    spawner: await import(url('services/providers/cli-spawner.js')),
    config: await import(url('config.js')),
  };
}

const DEFAULT_MODEL = { codex: 'gpt-5.5', agy: 'gemini-3.1-pro-high', claude: 'sonnet' };

function fmt(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

async function probe(mods, providerId, modelOverride) {
  const model = modelOverride || DEFAULT_MODEL[providerId];
  const spec = mods.providers.MODELS[model];
  if (!spec) {
    return { providerId, model, ok: false, error: `미등록 모델: ${model}` };
  }
  if (spec.provider !== providerId) {
    return { providerId, model, ok: false, error: `${model}은 ${spec.provider} 소속입니다` };
  }

  const provider = mods.registry.providerFor(providerId);
  const started = Date.now();

  try {
    const result = await provider.call({
      prompt: PROBE_PROMPT,
      systemPrompt: 'You are a terse probe responder. Output nothing but what is asked.',
      model,
      // 프로브는 오래 기다릴 이유가 없다. 실패하면 빨리 알아야 한다.
      timeoutMs: Math.min(spec.timeoutMs, 240_000),
      sandbox: 'read-only',
      workspaceDir: process.cwd(),
      expertId: 'probe',
    });

    const content = result.content.trim();
    return {
      providerId,
      model: result.model,
      ok: content === EXPECTED,
      content,
      usage: result.usage,
      durationMs: Date.now() - started,
      error: content === EXPECTED ? undefined : `기대 "${EXPECTED}", 실제 "${content.slice(0, 120)}"`,
    };
  } catch (err) {
    return {
      providerId,
      model,
      ok: false,
      durationMs: Date.now() - started,
      error: `${err?.kind ? `[${err.kind}] ` : ''}${err?.message ?? String(err)}`,
    };
  }
}

/**
 * 권한 거부 회귀 테스트.
 * --dangerously-skip-permissions를 일부러 빼고 파일 읽기를 시켜서
 * agy가 status:"SUCCESS" + 빈 응답을 내는지, 그리고 우리가 그걸
 * permission_denied로 분류하는지 확인한다. 유닛 테스트로는 불가능하다.
 */
async function denyProbe(mods, modelOverride) {
  const model = modelOverride || DEFAULT_MODEL.agy;
  const started = Date.now();

  const params = {
    prompt: 'Read package.json in the current directory and reply with only the version value.',
    model,
    timeoutMs: 180_000,
    sandbox: 'read-only',
    workspaceDir: process.cwd(),
    expertId: 'deny-probe',
  };

  // 정상 argv에서 권한 플래그만 제거
  const args = mods.agyProvider
    .buildAgyArgs(params, params.prompt)
    .filter((a) => a !== '--dangerously-skip-permissions');

  const result = await mods.spawner.spawnCli(mods.config.config.cli.agyPath, args, {
    timeoutMs: params.timeoutMs,
    env: { TZ: 'UTC' },
    shell: false,
    label: 'agy(deny-probe)',
  });

  const { envelope, preamble } = mods.agyParse.parseAgyStdout(result.stdout);
  const outcome = mods.agyParse.classifyAgy(envelope, preamble, result.exitCode, result.stderr);

  const kind = outcome.ok ? 'ok' : outcome.kind;
  const note = `exit=${result.exitCode} status=${envelope?.status ?? 'null'} kind=${kind}`;

  if (kind === 'permission_denied') {
    return { providerId: 'agy', model, ok: true, durationMs: Date.now() - started, note };
  }

  // 호출이 그냥 성공했다면 이 머신의 agy 설정이 툴을 미리 승인해 둔 것이다.
  // 그 경우 "거부" 시나리오 자체를 만들 수 없으므로 실패가 아니라 건너뛴 것으로 본다.
  // (분류 로직 자체는 agy-parse.test.ts 가 실측 페이로드로 검증한다)
  if (kind === 'ok') {
    const allow = readAgyAllowRules();
    if (allow.length > 0) {
      return {
        providerId: 'agy',
        model,
        ok: true,
        skipped: true,
        durationMs: Date.now() - started,
        note: `${note} — agy settings.json 의 permissions.allow [${allow.join(', ')}] 때문에 사전 승인됨. 거부 시나리오 재현 불가.`,
      };
    }
  }

  return {
    providerId: 'agy',
    model,
    ok: false,
    durationMs: Date.now() - started,
    note,
    error: `permission_denied로 분류되지 않음 (${kind})`,
  };
}

/** ~/.gemini/antigravity-cli/settings.json 의 permissions.allow 목록. 없으면 []. */
function readAgyAllowRules() {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const p = join(home, '.gemini', 'antigravity-cli', 'settings.json');
    if (!existsSync(p)) return [];
    const json = JSON.parse(readFileSync(p, 'utf-8'));
    const allow = json?.permissions?.allow;
    return Array.isArray(allow) ? allow : [];
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.targets.length === 0 && !args.denyProbe) {
    console.error('대상을 지정하세요: --codex | --agy | --claude | --all [--deny-probe]');
    process.exit(2);
  }

  const mods = await loadDist();
  const results = [];

  for (const target of args.targets) {
    process.stderr.write(`▶ ${target} 프로브 중...\n`);
    results.push(await probe(mods, target, args.model));
  }

  if (args.denyProbe) {
    process.stderr.write('▶ agy 권한 거부 회귀 프로브 중...\n');
    try {
      results.push(await denyProbe(mods, args.model));
    } catch (err) {
      results.push({ providerId: 'agy', model: '-', ok: false, error: `deny-probe 실패: ${err?.message ?? err}` });
    }
  }

  console.log('');
  for (const r of results) {
    const mark = r.skipped ? '⏭️' : r.ok ? '✅' : '❌';
    const time = r.durationMs !== undefined ? ` (${fmt(r.durationMs)})` : '';
    console.log(`${mark} ${r.providerId} / ${r.model}${time}`);
    if (r.note) console.log(`   ${r.note}`);
    if (r.usage) {
      const u = r.usage;
      const cost = u.costUsd !== undefined ? `, $${u.costUsd.toFixed(4)}` : '';
      console.log(`   토큰 in=${u.inputTokens} out=${u.outputTokens}${u.reasoningTokens ? ` think=${u.reasoningTokens}` : ''}${cost}`);
    }
    if (r.error) console.log(`   ${r.error}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
