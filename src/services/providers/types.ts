// src/services/providers/types.ts

import type { ErrorKind } from '../../utils/errors.js';
import type { ProviderId } from './model-registry.js';

export type { ProviderId };

/**
 * 전문가 역할별 권한.
 *  - read-only:       파일 읽기만. 전문가 17명이 여기 해당.
 *  - workspace-write: 워크스페이스 쓰기 허용. implementer 전용.
 */
export type SandboxMode = 'read-only' | 'workspace-write';

export interface CliCallParams {
  prompt: string;
  systemPrompt?: string;
  /**
   * 실제 CLI 슬러그. 프로바이더는 반드시 이 값을 --model 로 전달해야 한다.
   * (이전 코드는 codex에 --model을 아예 안 넘겨서 MODEL_* env가 전부 무의미했다.)
   */
  model: string;
  timeoutMs: number;
  sandbox: SandboxMode;
  /** CLI 작업 루트. codex -C / agy --project / claude cwd. 기본 process.cwd(). */
  workspaceDir?: string;
  /** 추가 읽기 가능 경로. 세 CLI 모두 --add-dir 를 반복 지정. */
  addDirs?: string[];
  /** codex만 -i 로 지원. agy/claude는 bad_request로 거절. */
  imagePaths?: string[];
  /** 로깅 전용. */
  expertId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  /** claude -p 만 실제 금액을 준다. */
  costUsd?: number;
}

/**
 * 프로바이더가 던지는 유일한 에러 타입.
 * kind를 구조적으로 들고 다니므로 하류에서 메시지 문자열을 다시 파싱할 필요가 없다.
 */
export class CliProviderError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly provider: ProviderId,
    readonly model: string,
    message: string,
    readonly raw?: string
  ) {
    super(message);
    this.name = 'CliProviderError';
  }
}

export interface CliCallResult {
  content: string;
  rawOutput: string;
  provider: ProviderId;
  /** 실제로 응답한 모델. */
  model: string;
  usage?: TokenUsage;
  durationMs: number;
}

/**
 * 프로바이더는 "CLI 1회 실행 + 실패 분류"만 한다.
 * 모델 체인 순회와 quota 차단은 model-chain.ts의 책임이다.
 */
export interface CliProvider {
  readonly id: ProviderId;
  call(params: CliCallParams): Promise<CliCallResult>;
}

/** 파서가 프로바이더에 돌려주는 판정 결과. */
export type ParseOutcome =
  | { ok: true; content: string; usage?: TokenUsage }
  | { ok: false; kind: ErrorKind; message: string };
