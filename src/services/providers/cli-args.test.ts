// src/services/providers/cli-args.test.ts
//
// argv 스냅샷. 각 단언은 실측으로 확인된 CLI 제약을 고정한다.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgyArgs, buildAgyPrompt, toGoDuration, ARGV_PROMPT_LIMIT } from './agy-provider.js';
import { buildCodexArgs, buildCodexPrompt } from './codex-provider.js';
import { buildClaudeArgs } from './claude-provider.js';
import type { CliCallParams } from './types.js';

function params(over: Partial<CliCallParams> = {}): CliCallParams {
  return {
    prompt: '질문입니다',
    systemPrompt: '너는 전문가다',
    model: 'gemini-3.1-pro-high',
    timeoutMs: 900_000,
    sandbox: 'read-only',
    workspaceDir: 'C:\\work\\repo',
    expertId: 'momus',
    ...over,
  };
}

/** --flag 다음 값을 꺼낸다. 없으면 undefined. */
function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

// ── agy ────────────────────────────────────────────────────────────────────

describe('buildAgyArgs', () => {
  test('--effort는 절대 넘기지 않는다', () => {
    // 레지스트리의 모든 agy 슬러그는 effort가 이름에 인코딩돼 있고
    // (-high/-low/-thinking), 그런 모델에 --effort를 주면 agy가 거절한다.
    for (const model of ['gemini-3.1-pro-high', 'claude-opus-4-6-thinking', 'gemini-3.6-flash-low']) {
      const args = buildAgyArgs(params({ model }), '프롬프트');
      assert.equal(args.includes('--effort'), false, `${model}에 --effort가 들어갔다`);
    }
  });

  test('--dangerously-skip-permissions는 항상 있다 (없으면 모든 툴이 자동 거부됨)', () => {
    for (const sandbox of ['read-only', 'workspace-write'] as const) {
      const args = buildAgyArgs(params({ sandbox }), 'p');
      assert.ok(args.includes('--dangerously-skip-permissions'));
    }
  });

  test('--sandbox는 read-only일 때만 붙는다 (역할 게이트)', () => {
    assert.ok(buildAgyArgs(params({ sandbox: 'read-only' }), 'p').includes('--sandbox'));
    assert.equal(buildAgyArgs(params({ sandbox: 'workspace-write' }), 'p').includes('--sandbox'), false);
  });

  test('--model을 반드시 전달한다', () => {
    assert.equal(valueOf(buildAgyArgs(params(), 'p'), '--model'), 'gemini-3.1-pro-high');
  });

  test('--output-format json (파일 우회 해킹 폐기의 근거)', () => {
    assert.equal(valueOf(buildAgyArgs(params(), 'p'), '--output-format'), 'json');
  });

  test('--log-file을 더 이상 쓰지 않는다 (quota는 봉투에서 읽는다)', () => {
    assert.equal(buildAgyArgs(params(), 'p').includes('--log-file'), false);
  });

  test('--print-timeout은 우리 kill 타이머보다 여유가 있다', () => {
    const args = buildAgyArgs(params({ timeoutMs: 600_000 }), 'p');
    const printTimeout = valueOf(args, '--print-timeout');
    assert.equal(printTimeout, '615s'); // 600s + 15s 여유
  });

  test('--project는 쓰지 않는다 (경로가 아니라 프로젝트 ID/이름이다)', () => {
    assert.equal(buildAgyArgs(params(), 'p').includes('--project'), false);
  });

  test('워크스페이스를 --add-dir로 넣는다 (agy 1.1.19는 프로세스 cwd를 무시한다)', () => {
    // 실측 2026-08-24: --add-dir 없으면 상대 경로를 엉뚱한 기본 디렉터리에서 찾아
    // 205초 태우고 실패한다. 넣으면 21초에 성공.
    const args = buildAgyArgs(params(), 'p');
    const dirs = args.filter((_, i) => args[i - 1] === '--add-dir');
    assert.deepEqual(dirs, ['C:\\work\\repo']);
  });

  test('워크스페이스 + addDirs + 추가 디렉터리가 모두 --add-dir로 반복된다', () => {
    const args = buildAgyArgs(params({ addDirs: ['/a'] }), 'p', ['/tmp']);
    const dirs = args.filter((_, i) => args[i - 1] === '--add-dir');
    assert.deepEqual(dirs, ['C:\\work\\repo', '/a', '/tmp']);
  });

  test('중복 디렉터리는 한 번만 넣는다', () => {
    const args = buildAgyArgs(params({ addDirs: ['C:\\work\\repo'] }), 'p', ['C:\\work\\repo']);
    const dirs = args.filter((_, i) => args[i - 1] === '--add-dir');
    assert.deepEqual(dirs, ['C:\\work\\repo']);
  });

  test('프롬프트가 argv 첫 값으로 들어간다', () => {
    assert.equal(valueOf(buildAgyArgs(params(), '내 프롬프트'), '--print'), '내 프롬프트');
  });
});

describe('buildAgyPrompt / toGoDuration', () => {
  test('시스템 프롬프트를 본문에 합친다 (agy는 별도 채널이 없다)', () => {
    const p = buildAgyPrompt(params());
    assert.match(p, /^\[System Instructions\]\n너는 전문가다\n\n질문입니다$/);
  });

  test('시스템 프롬프트가 없으면 원문 그대로', () => {
    assert.equal(buildAgyPrompt(params({ systemPrompt: undefined })), '질문입니다');
  });

  test('Go duration 변환', () => {
    assert.equal(toGoDuration(900_000), '900s');
    assert.equal(toGoDuration(500), '1s'); // 0초로 떨어지지 않는다
  });

  test('argv 상한은 Windows 32767자보다 충분히 아래다', () => {
    assert.ok(ARGV_PROMPT_LIMIT < 32767);
  });
});

// ── codex ──────────────────────────────────────────────────────────────────

describe('buildCodexArgs', () => {
  const codexParams = (over: Partial<CliCallParams> = {}) =>
    params({ model: 'gpt-5.5', expertId: 'strategist', ...over });

  test('--model을 반드시 전달한다 (이전에는 아예 안 넘겨서 MODEL_* env가 무의미했다)', () => {
    assert.equal(valueOf(buildCodexArgs(codexParams(), '/tmp/out'), '--model'), 'gpt-5.5');
  });

  test('read-only 전문가는 --sandbox read-only', () => {
    const args = buildCodexArgs(codexParams({ sandbox: 'read-only' }), '/tmp/out');
    assert.equal(valueOf(args, '--sandbox'), 'read-only');
  });

  test('implementer만 workspace-write', () => {
    const args = buildCodexArgs(codexParams({ sandbox: 'workspace-write' }), '/tmp/out');
    assert.equal(valueOf(args, '--sandbox'), 'workspace-write');
  });

  test('-o로 최종 답변 파일을 지정한다 (5단 폴백 파서 폐기의 근거)', () => {
    assert.equal(valueOf(buildCodexArgs(codexParams(), '/tmp/out.txt'), '--output-last-message'), '/tmp/out.txt');
  });

  test('--json도 함께 쓴다 (토큰 사용량 수집용, -o와 독립)', () => {
    const args = buildCodexArgs(codexParams(), '/tmp/out');
    assert.ok(args.includes('--json'));
    assert.ok(args.includes('--output-last-message'));
  });

  test('git 저장소 밖에서도 동작하도록 --skip-git-repo-check', () => {
    assert.ok(buildCodexArgs(codexParams(), '/tmp/out').includes('--skip-git-repo-check'));
  });

  test('일회성 호출이므로 --ephemeral', () => {
    assert.ok(buildCodexArgs(codexParams(), '/tmp/out').includes('--ephemeral'));
  });

  test('--strict-config는 붙이지 않는다 (사용자 config의 deprecated 키가 치명적이 된다)', () => {
    assert.equal(buildCodexArgs(codexParams(), '/tmp/out').includes('--strict-config'), false);
  });

  test('--ignore-user-config도 붙이지 않는다 (인증이 날아간다)', () => {
    assert.equal(buildCodexArgs(codexParams(), '/tmp/out').includes('--ignore-user-config'), false);
  });

  test('프롬프트는 stdin (exec -)', () => {
    const args = buildCodexArgs(codexParams(), '/tmp/out');
    assert.equal(args[0], 'exec');
    assert.equal(args[1], '-');
  });

  test('이미지는 -i로 반복 전달 (codex만 지원)', () => {
    const args = buildCodexArgs(codexParams({ imagePaths: ['./a.png', './b.png'] }), '/tmp/out');
    const imgs = args.filter((a, i) => args[i - 1] === '-i');
    assert.deepEqual(imgs, ['./a.png', './b.png']);
  });

  test('reasoning effort는 -c 설정으로 (CLI 플래그가 없다)', () => {
    const args = buildCodexArgs(codexParams(), '/tmp/out');
    const ci = args.indexOf('-c');
    assert.equal(args[ci + 1], 'model_reasoning_effort=high');
    assert.equal(args.includes('--reasoning-effort'), false);
  });
});

describe('buildCodexPrompt', () => {
  test('시스템 프롬프트를 본문에 합친다', () => {
    const p = buildCodexPrompt(params({ model: 'gpt-5.5' }));
    assert.match(p, /\[System Instructions\][\s\S]*\[Task\][\s\S]*질문입니다/);
  });
});

// ── claude ─────────────────────────────────────────────────────────────────

describe('buildClaudeArgs', () => {
  const claudeParams = (over: Partial<CliCallParams> = {}) =>
    params({ model: 'opus', expertId: 'momus', ...over });

  test('--strict-mcp-config는 항상 있다 (llm-router MCP 재귀 로딩 차단)', () => {
    assert.ok(buildClaudeArgs(claudeParams(), 1).includes('--strict-mcp-config'));
  });

  test('--bare는 절대 쓰지 않는다 (구독 OAuth 인증이 깨진다)', () => {
    assert.equal(buildClaudeArgs(claudeParams(), 1).includes('--bare'), false);
  });

  test('시스템 프롬프트는 파일로 넘긴다 (argv는 여러 줄 프롬프트에서 깨진다)', () => {
    // 실측: momus 시스템 프롬프트(3787자, 줄바꿈+따옴표 포함)를 argv로 넘기면
    // `option '--system-prompt <prompt>' argument missing` 으로 실패한다.
    const args = buildClaudeArgs(claudeParams(), 1, '/tmp/sp.md');
    assert.equal(valueOf(args, '--system-prompt-file'), '/tmp/sp.md');
    assert.equal(args.includes('--system-prompt'), false, 'argv 인라인 방식이 남아 있다');
  });

  test('시스템 프롬프트가 없으면 관련 플래그도 없다', () => {
    const args = buildClaudeArgs(claudeParams({ systemPrompt: undefined }), 1);
    assert.equal(args.includes('--system-prompt-file'), false);
    assert.equal(args.includes('--system-prompt'), false);
  });

  test('read-only는 툴을 읽기 전용으로 게이팅한다', () => {
    assert.equal(valueOf(buildClaudeArgs(claudeParams({ sandbox: 'read-only' }), 1), '--tools'), 'Read,Grep,Glob');
  });

  test('workspace-write는 전체 툴', () => {
    assert.equal(valueOf(buildClaudeArgs(claudeParams({ sandbox: 'workspace-write' }), 1), '--tools'), 'default');
  });

  test('--max-budget-usd로 호출당 비용 상한', () => {
    assert.equal(valueOf(buildClaudeArgs(claudeParams(), 0.5), '--max-budget-usd'), '0.5');
  });

  test('상한이 0이면 플래그를 생략한다', () => {
    assert.equal(buildClaudeArgs(claudeParams(), 0).includes('--max-budget-usd'), false);
  });

  test('세션을 남기지 않는다', () => {
    assert.ok(buildClaudeArgs(claudeParams(), 1).includes('--no-session-persistence'));
  });

  test('--model을 반드시 전달한다', () => {
    assert.equal(valueOf(buildClaudeArgs(claudeParams(), 1), '--model'), 'opus');
  });
});
