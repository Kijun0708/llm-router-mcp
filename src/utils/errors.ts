// src/utils/errors.ts
//
// 에러 분류 단일 소스.
//
// 이전에는 같은 일을 하는 표가 5벌 있었고 서로 결론이 달랐다:
//   utils/rate-limit.ts, services/failure-handler.ts, hooks/builtin/session-recovery.ts,
//   services/cliproxy-client.ts(인라인), services/expert-router.ts(인라인)
// 새 CLI 에러 문자열 하나를 처리하려면 최대 5곳을 고쳐야 했다.
//
// 판정 순서가 곧 사양이다. 아래 ORDERED_RULES의 순서를 바꾸면 동작이 바뀐다.

/** 분류 결과. 하나의 실패는 정확히 하나의 kind를 갖는다. */
export type ErrorKind =
  | 'quota'             // 한도/레이트리밋 소진 — 다른 모델로 넘어가면 풀림
  | 'timeout'           // 시간 초과
  | 'auth'              // 인증/로그인 실패 — 같은 조건으로는 뭘 해도 실패
  | 'bad_request'       // 요청 자체가 잘못됨
  | 'bad_model'         // 모델 슬러그가 틀림 — 다른 모델로는 성공 가능
  | 'permission_denied' // CLI가 툴 권한을 자동 거부 — 우리 argv가 틀렸다는 뜻
  | 'network'           // 연결 실패
  | 'server'            // 5xx / 일시적 서버 문제
  | 'context_overflow'  // 컨텍스트 초과
  | 'unknown';

export interface ErrorPolicy {
  /** 같은 모델로 다시 시도해도 되는가. */
  retrySameModel: boolean;
  /** 체인의 다음 모델로 넘어가도 되는가. */
  tryNextModel: boolean;
  /** 폴백 전문가로 넘어가도 되는가. */
  tryFallbackExpert: boolean;
  /** 이 실패로 모델을 차단할 기간(ms). 미지정이면 차단 안 함. */
  blockModelMs?: number;
}

const QUOTA_BLOCK_MS = 90 * 60 * 1000;

export const ERROR_POLICY: Record<ErrorKind, ErrorPolicy> = {
  // 다른 모델이면 풀린다. 이 모델은 한동안 차단.
  quota: {
    retrySameModel: false,
    tryNextModel: true,
    tryFallbackExpert: true,
    blockModelMs: QUOTA_BLOCK_MS,
  },

  // 같은 모델 재시도 금지 — 15분 타임아웃을 재시도하면 30분이 된다.
  timeout: { retrySameModel: false, tryNextModel: false, tryFallbackExpert: true },

  // 로그인 문제는 어디로 가도 같다. 크게 실패시켜 사용자가 고치게 한다.
  auth: { retrySameModel: false, tryNextModel: false, tryFallbackExpert: false },

  // 요청이 틀렸다. 모델을 바꿔도 똑같이 틀렸다.
  bad_request: { retrySameModel: false, tryNextModel: false, tryFallbackExpert: false },

  // 슬러그 오타 하나가 요청 전체를 죽이면 안 된다. 다음 모델로 강등.
  bad_model: { retrySameModel: false, tryNextModel: true, tryFallbackExpert: false },

  // 우리가 argv를 잘못 만들었다는 신호. 조용히 폴백하면 원인이 영영 안 드러난다.
  permission_denied: { retrySameModel: false, tryNextModel: false, tryFallbackExpert: false },

  network: { retrySameModel: true, tryNextModel: true, tryFallbackExpert: true },
  server: { retrySameModel: true, tryNextModel: true, tryFallbackExpert: true },

  // 프롬프트를 줄이지 않는 한 재시도는 무의미.
  context_overflow: { retrySameModel: false, tryNextModel: false, tryFallbackExpert: true },

  unknown: { retrySameModel: true, tryNextModel: true, tryFallbackExpert: true },
};

/**
 * 구조화된 kind를 직접 들고 다니는 에러.
 * 프로바이더는 문자열을 하류에서 다시 파싱하게 두지 말고 이걸 던진다.
 */
export class ClassifiedError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly raw?: string
  ) {
    super(message);
    this.name = 'ClassifiedError';
  }
}

interface Rule {
  kind: ErrorKind;
  pattern: RegExp;
}

/**
 * 판정 순서. 위에서부터 처음 걸리는 규칙이 이긴다.
 *
 * 순서가 중요한 이유(전부 이전 코드의 실제 오분류다):
 *  1. quota를 auth보다 먼저 — 예전 failure-handler의 /...|auth|permission/i 가
 *     "auth"를 포함한 모든 문자열을 삼켜 non-recoverable로 만들었다. agy의 권한
 *     경고나 quota 메시지가 여기 걸리면 폴백 체인 전체가 중단됐다.
 *  2. bad_model을 bad_request보다 먼저 — agy의 "invalid model selection"이
 *     expert-router의 /invalid/ 에 걸려 폴백이 막혔다.
 *  3. context_overflow를 bad_request보다 먼저 — "too long"을 bad_request가 가져갔다.
 *  4. 숫자 상태코드는 단어 경계로 — 이전엔 message.includes('400')이라
 *     "14002ms" 같은 문자열에도 걸렸다.
 */
const ORDERED_RULES: Rule[] = [
  // ── quota (최우선) ───────────────────────────────────────────────────────
  { kind: 'quota', pattern: /RESOURCE_EXHAUSTED/i },
  { kind: 'quota', pattern: /individual quota reached/i },
  { kind: 'quota', pattern: /quota\s*(exceeded|reached|exhausted)/i },
  { kind: 'quota', pattern: /rate[\s._-]?limit/i },
  { kind: 'quota', pattern: /too[\s._-]?many[\s._-]?requests/i },
  { kind: 'quota', pattern: /(?<!\d)429(?!\d)/ },
  { kind: 'quota', pattern: /usage limit reached/i },

  // ── bad_model (bad_request보다 먼저) ─────────────────────────────────────
  { kind: 'bad_model', pattern: /invalid model selection/i },
  { kind: 'bad_model', pattern: /--effort is not supported/i },
  { kind: 'bad_model', pattern: /(unknown|unrecognized|unsupported) model/i },
  { kind: 'bad_model', pattern: /model .* is not recognized/i },

  // ── context_overflow (bad_request보다 먼저) ──────────────────────────────
  { kind: 'context_overflow', pattern: /context[\s._-]?(length|window).*(exceed|too)/i },
  { kind: 'context_overflow', pattern: /maximum context/i },
  { kind: 'context_overflow', pattern: /prompt is too long/i },

  // ── timeout ──────────────────────────────────────────────────────────────
  { kind: 'timeout', pattern: /\btimed?[\s._-]?out\b/i },
  { kind: 'timeout', pattern: /\btimeout\b/i },
  { kind: 'timeout', pattern: /\bETIMEDOUT\b/ },
  { kind: 'timeout', pattern: /deadline exceeded/i },

  // ── auth ─────────────────────────────────────────────────────────────────
  { kind: 'auth', pattern: /not (logged[\s._-]?in|authenticated|signed[\s._-]?in)/i },
  { kind: 'auth', pattern: /\bunauthorized\b/i },
  { kind: 'auth', pattern: /\bforbidden\b/i },
  { kind: 'auth', pattern: /authentication (failed|required|error)/i },
  { kind: 'auth', pattern: /invalid api[\s._-]?key/i },
  { kind: 'auth', pattern: /please (run )?`?(codex |claude |agy )?login`?/i },
  { kind: 'auth', pattern: /(?<!\d)40[13](?!\d)/ },

  // ── network ──────────────────────────────────────────────────────────────
  { kind: 'network', pattern: /\bE(CONNREFUSED|CONNRESET|NOTFOUND|AI_AGAIN|PIPE|HOSTUNREACH)\b/ },
  { kind: 'network', pattern: /socket hang up/i },
  { kind: 'network', pattern: /network (error|failure|unreachable)/i },
  { kind: 'network', pattern: /spawn failed/i },
  { kind: 'network', pattern: /\bENOENT\b/ },

  // ── server / overload ────────────────────────────────────────────────────
  { kind: 'server', pattern: /\boverloaded\b/i },
  { kind: 'server', pattern: /service unavailable/i },
  { kind: 'server', pattern: /(internal|upstream) (server )?error/i },
  { kind: 'server', pattern: /bad gateway/i },
  { kind: 'server', pattern: /(?<!\d)5\d{2}(?!\d)/ },

  // ── bad_request (마지막) ─────────────────────────────────────────────────
  { kind: 'bad_request', pattern: /bad request/i },
  { kind: 'bad_request', pattern: /invalid (argument|parameter|request|json|schema)/i },
  { kind: 'bad_request', pattern: /(?<!\d)400(?!\d)/ },
];

/**
 * 자유 텍스트 → ErrorKind.
 *
 * 'permission_denied'는 여기서 절대 나오지 않는다. 그건 구조적 신호(agy 파서가
 * auto-deny 프리앰블을 직접 확인한 경우)로만 설정한다. 정규식으로 유도하면
 * 모델이 답변 중에 "permission denied"라고 말한 것까지 실패로 잡는다.
 */
export function classifyErrorText(text: string | null | undefined): ErrorKind {
  if (!text) return 'unknown';
  for (const rule of ORDERED_RULES) {
    if (rule.pattern.test(text)) return rule.kind;
  }
  return 'unknown';
}

/**
 * 임의의 throw 값 → ErrorKind.
 * 구조적 kind(ClassifiedError 또는 .kind를 가진 객체)가 있으면 그것을 신뢰하고,
 * 없을 때만 메시지 텍스트로 떨어진다.
 */
export function kindOf(err: unknown): ErrorKind {
  if (err instanceof ClassifiedError) return err.kind;

  if (err && typeof err === 'object') {
    const kind = (err as { kind?: unknown }).kind;
    if (typeof kind === 'string' && kind in ERROR_POLICY) {
      return kind as ErrorKind;
    }
    // HTTP 상태코드가 구조적으로 붙어 있는 경우
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') {
      if (status === 429) return 'quota';
      if (status === 401 || status === 403) return 'auth';
      if (status === 400) return 'bad_request';
      if (status >= 500) return 'server';
    }
  }

  const message = err instanceof Error ? err.message : String(err ?? '');
  return classifyErrorText(message);
}

export function policyOf(err: unknown): ErrorPolicy {
  return ERROR_POLICY[kindOf(err)];
}

/** 사람이 읽는 짧은 사유 라벨. 로그/에러 메시지 조립용. */
export function describeKind(kind: ErrorKind): string {
  switch (kind) {
    case 'quota': return '한도 소진';
    case 'timeout': return '시간 초과';
    case 'auth': return '인증 실패';
    case 'bad_request': return '잘못된 요청';
    case 'bad_model': return '알 수 없는 모델';
    case 'permission_denied': return 'CLI 권한 자동 거부';
    case 'network': return '네트워크 오류';
    case 'server': return '서버 오류';
    case 'context_overflow': return '컨텍스트 초과';
    default: return '알 수 없는 오류';
  }
}
