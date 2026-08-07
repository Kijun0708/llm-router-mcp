// src/services/providers/model-chain.ts
//
// 모델 체인 순회. antigravity-model-manager.ts의 withAntigravityModel 대체.
//
// 이전 구조의 문제:
//  - agy 전용이었고 우선순위가 전역 상수라 전문가별 지정이 불가능했다.
//  - 세마포어를 cliproxy-client가 체인 바깥에서 하나 잡고 있어, 멈춘 Claude 호출이
//    Gemini 슬롯을 통째로 점유했다. 여기서는 스텝 단위로 잡고 놓는다.

import { logger } from '../../utils/logger.js';
import { ERROR_POLICY, kindOf, describeKind, type ErrorKind } from '../../utils/errors.js';
import { CliProviderError, type CliProvider, type CliCallParams, type CliCallResult, type ProviderId } from './types.js';
import { isScarce, concurrencyFor, quotaBlockMsFor } from './model-registry.js';
import { isBlocked, block, unblockAt } from './quota-registry.js';
import { providerFor } from './registry.js';
import { getSemaphore } from './concurrency.js';

export interface ChainStep {
  provider: ProviderId;
  model: string;
}

export interface ChainAttempt {
  step: ChainStep;
  kind: ErrorKind;
  message: string;
}

export interface ChainResult extends CliCallResult {
  attempts: ChainAttempt[];
}

export interface ChainContext {
  expertId: string;
  /** 프로바이더별 동시성 상한. config.concurrency.byProvider. */
  providerConcurrency?: Record<string, number>;
  /** 테스트용 프로바이더 주입. 미지정 시 실제 싱글톤. */
  resolveProvider?: (id: ProviderId) => CliProvider;
}

function stepKey(step: ChainStep): string {
  return `${step.provider}:${step.model}`;
}

/**
 * 체인을 순회하며 처음 성공하는 스텝의 결과를 반환한다.
 *
 * scarce 모델 규칙: scarce: true인 모델은 **0번 스텝일 때만** 허용된다.
 * 즉 명시적으로 요청됐을 때만 쓰이고, 폴백 꼬리로는 절대 도달하지 않는다.
 * Claude 계열(사용자 한도 / agy 소량 쿼터)을 실수로 태우지 않기 위한 유일한 방어선이다.
 */
export async function runModelChain(
  chain: ChainStep[],
  build: (step: ChainStep) => CliCallParams,
  ctx: ChainContext
): Promise<ChainResult> {
  if (chain.length === 0) {
    throw new Error(`runModelChain: empty chain for expert "${ctx.expertId}"`);
  }

  const attempts: ChainAttempt[] = [];
  const skipped: string[] = [];

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];

    // scarce 가드 — 0번이 아니면 건너뛴다
    if (i > 0 && isScarce(step.model)) {
      skipped.push(`${stepKey(step)} (scarce, 명시 요청 아님)`);
      continue;
    }

    // quota 차단 중이면 건너뛴다
    if (isBlocked(step.provider, step.model)) {
      const until = unblockAt(step.provider, step.model);
      skipped.push(`${stepKey(step)} (한도 차단, 해제 ${until ? new Date(until).toISOString() : '?'})`);
      continue;
    }

    const providerSem = getSemaphore(step.provider, ctx.providerConcurrency?.[step.provider]);
    const modelSem = getSemaphore(stepKey(step), concurrencyFor(step.model));

    await providerSem.acquire();
    await modelSem.acquire();

    try {
      const params = build(step);
      const provider = (ctx.resolveProvider ?? providerFor)(step.provider);

      logger.debug(
        { expertId: ctx.expertId, step: stepKey(step), attempt: i + 1, of: chain.length },
        'Model chain attempt'
      );

      return { ...(await provider.call(params)), attempts };
    } catch (err) {
      const kind = kindOf(err);
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({ step, kind, message });

      const policy = ERROR_POLICY[kind];

      if (policy.blockModelMs !== undefined) {
        block(step.provider, step.model, quotaBlockMsFor(step.model));
      }

      if (!policy.tryNextModel) {
        // auth / bad_request / permission_denied / timeout — 다음 모델로 가도 소용없거나
        // 조용히 넘어가면 원인이 묻힌다. 즉시 전파.
        throw err;
      }

      logger.warn(
        { expertId: ctx.expertId, step: stepKey(step), kind, message: message.slice(0, 200) },
        'Model chain step failed, trying next model'
      );
    } finally {
      modelSem.release();
      providerSem.release();
    }
  }

  // 체인 소진
  const last = attempts[attempts.length - 1];
  const summary = attempts
    .map(a => `${stepKey(a.step)}(${describeKind(a.kind)}: ${a.message.slice(0, 80)})`)
    .join(' -> ');
  const skippedNote = skipped.length > 0 ? ` 건너뜀: ${skipped.join(', ')}.` : '';

  if (attempts.length === 0) {
    // 전부 건너뛰었다 — 실제 실패가 아니라 전부 차단/scarce였다는 뜻
    const earliest = chain
      .map(s => unblockAt(s.provider, s.model))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)[0];
    throw new CliProviderError(
      'quota',
      chain[0].provider,
      chain[0].model,
      `전문가 "${ctx.expertId}"의 모든 모델을 사용할 수 없습니다.${skippedNote}` +
        (earliest ? ` 가장 이른 해제: ${new Date(earliest).toISOString()}` : ''),
    );
  }

  throw new CliProviderError(
    last.kind,
    last.step.provider,
    last.step.model,
    `전문가 "${ctx.expertId}"의 모델 체인이 모두 실패했습니다. 시도: ${summary}.${skippedNote}`
  );
}

/**
 * 전문가 기본 체인 + 명시 요청 모델을 합성한다.
 *
 * requestedModel이 주어지면 그것이 0번 스텝이 되고(=scarce 모델도 허용),
 * 기존 기본 체인이 뒤에 붙어 한도 소진 시 자동 강등된다.
 * 중복 스텝은 제거한다.
 */
export function composeChain(
  defaultChain: ChainStep[],
  requested?: ChainStep
): ChainStep[] {
  if (!requested) return defaultChain;
  const seen = new Set<string>([stepKey(requested)]);
  const out: ChainStep[] = [requested];
  for (const s of defaultChain) {
    const k = stepKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
