# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Router MCP is a Model Context Protocol (MCP) server that enables multi-LLM collaboration via terminal CLI tools. It allows Claude Code to orchestrate GPT and Gemini instances as team members, with automatic quota handling and fallback routing.

**Core Concept**: Claude Code acts as the team leader, delegating specialized tasks to GPT/Gemini "experts" for diverse perspectives — offloading work onto *other vendors'* quotas.

### CLI 프로바이더 (3종)

| Provider | Binary | 서빙 모델 | 역할 |
|---|---|---|---|
| `codex` | `codex` (OpenAI Codex CLI) | `gpt-5.5` | GPT 전문가 11명 |
| `agy` | `agy` (Antigravity CLI) | Gemini 3.1 Pro / 3.5·3.6·3.7 Flash, Claude 4.6, GPT-OSS | Gemini 전문가 7명 |
| `claude` | `claude -p` (Claude Code CLI) | `opus`, `sonnet` | **opt-in 전용** |

**Gemini CLI(`@google/gemini-cli`)는 2026-06-18 공식 종료되어 제거됐다.** Google 계열은 agy만 쓴다.

**Claude는 어떤 전문가의 기본 모델도 아니다.** `consult_expert`에 `model: "opus"`를 명시할
때만 도달하며, 사용자 본인의 Claude 구독 한도를 소모한다. 한도 소진 시 전문가 기본
모델로 자동 강등된다. 3중 가드: `model-registry`의 `scarce` 플래그(폴백 꼬리로 도달 불가)
+ 기본 OFF + `--max-budget-usd`.

**모델명으로 프로바이더를 추론하지 말 것.** agy 하나가 Gemini·Claude·GPT-OSS를 모두
서빙하므로 `"claude-opus-4-6-thinking"`이 agy로 갈지 claude CLI로 갈지 이름만으로는
결정할 수 없다. 라우팅은 `Expert.provider`(명시), 과금 라벨은 `billingProviderOf()`.

## Tech Stack

- **Language**: TypeScript (ESM, strict)
- **Runtime**: Node.js >= 18
- **Transport**: stdio (for Claude Code local integration)
- **Validation**: Zod (runtime type validation)
- **Logging**: pino
- **Caching**: lru-cache
- **Testing**: `node:test` (의존성 없음)

## Build and Run Commands

```bash
npm install
npm run build          # tsc
npm run typecheck      # tsc --noEmit
npm test               # dist-test/로 빌드 후 node --test
npm run probe          # 실 CLI 스모크 (codex/agy/claude 전부)
node dist/index.js     # MCP 서버 실행
```

`npm run probe`는 실제 CLI를 호출해 argv·인증·응답 파싱을 검증한다.
개별 실행: `node scripts/probe-cli.js --agy --deny-probe`
(`--deny-probe`는 `--dangerously-skip-permissions`를 일부러 빼고 `permission_denied`로
분류되는지 확인하는 회귀 테스트다.)

## Architecture

### Expert System

전문가 18명. 각 전문가는 `provider` / `model` / `sandbox`를 명시한다
(`src/model-defaults.ts`의 `EXPERT_RUNTIME_DEFAULTS`가 단일 소스).

**`implementer`만 `workspace-write`이고 나머지 17명은 `read-only`다.**
codex는 `--sandbox read-only`, agy는 `--sandbox`, claude는 `--tools "Read,Grep,Glob"`으로
강제된다. 쓰기가 필요하면 `delegate_task`(→ implementer)를 쓸 것.

#### 기본 전문가 (5명)

| Expert | Provider / Model | Role | Fallbacks |
|--------|------------------|------|-----------|
| `strategist` | codex / gpt-5.5 | 아키텍처 설계, 디버깅 전략 | codereview → momus |
| `codereview` | agy / gemini-3.1-pro-high | 통합 코드 리뷰 (perspectives로 GPT+Gemini 병렬) | strategist → momus |
| `frontend` | agy / gemini-3.7-flash-high | UI/UX, 컴포넌트 설계 | strategist → momus |
| `metis` | codex / gpt-5.5 | 전략적 계획, 문제 분해 | strategist → codereview |
| `momus` | agy / gemini-3.1-pro-high | 비판적 분석, 품질 평가 | codereview → strategist |

#### 특화 전문가 (8명)

| Expert | Provider / Model | Role | Fallbacks |
|--------|------------------|------|-----------|
| `security` | codex / gpt-5.5 | OWASP/CWE 보안 분석 | codereview → strategist |
| `tester` | codex / gpt-5.5 | TDD/테스트 전략 | codereview → strategist |
| `data` | codex / gpt-5.5 | DB 설계, 쿼리 최적화 | strategist → codereview |
| `devops` | codex / gpt-5.5 | CI/CD, Docker, K8s | strategist → codereview |
| `reality_checker` | agy / gemini-3.1-pro-high | 현실 검증, dead code | momus → codereview |
| `lsp_index_engineer` | codex / gpt-5.5 | 심볼/참조 분석 | codereview → strategist |
| `codereview_gpt` | codex / gpt-5.5 | GPT 코드리뷰 - SOLID/설계/실무 관점 | codereview → momus |
| `implementer` | codex / gpt-5.5 | 코드 구현 (**유일한 READ-WRITE**, delegate_task 전용) | strategist → codereview_gpt |

#### 동적 페르소나 전문가 (4명) - 토론용

| Expert | Provider / Model | Description |
|--------|------------------|-------------|
| `gpt_blank_1` | codex / gpt-5.5 | OpenAI 범용 |
| `gpt_blank_2` | codex / gpt-5.5 | OpenAI 코드 특화 |
| `gemini_blank_1` | agy / gemini-3.1-pro-high | Google 고성능 |
| `gemini_blank_2` | agy / gemini-3.6-flash-high | Google 빠른 응답 |

#### 토론 중재자 (1명)

| Expert | Provider / Model | Role |
|--------|------------------|------|
| `debate_moderator` | agy / gemini-3.1-pro-high | 패널 토론 중재 및 최종 요약 |

### 모델 선택 근거 (2026-08-24 실측)

같은 과제(`model-chain.ts`를 읽고 진짜 버그 찾기)로 측정한 결과:

| 모델 | 시간 | thinking | 결과 |
|---|---|---|---|
| `gemini-3.1-pro-high` | 162초 | 12.4k | 진짜 버그 4건 (가장 깊음) |
| `gemini-3.7-flash-high` | 92~100초 | 21~27k | 진짜 버그 2건 (Pro가 놓친 것 포함) |
| `gemini-3.6-flash-high` | 58초 | 20.7k | 진짜 버그 1건 |
| `gemini-3.7-flash-medium` | 85초 | 17.2k | — |
| `gemini-3.7-flash-low` | 21초 | **0** | 근거 없는 지적 |

**effort는 항상 `-high`를 쓴다.** `-low`는 thinking 토큰이 0인데 줄번호를 22번
인용했다 — 파일을 읽지 않고 지어낸다. `-medium`은 시간이 high와 거의 같은데
(85초 vs 92초) 사고량만 적어 선택할 이유가 없다.

**리뷰는 Pro, UI는 Flash.** codereview/momus는 깊이가 값어치라 3.1 Pro,
frontend는 구조·제안이 중요하고 속도가 값어치라 3.7 Flash.
Pro와 Flash가 서로 다른 버그를 찾았으므로 `review_code`의 perspectives로
섞어 쓰면 커버리지가 넓어진다.

**주의**: `gemini-3.7-flash-high`는 2회 중 1회 agy 내부 오류
(`ContentOffset ... exceeds line range size`)로 실패했다. 새 모델 + 새 agy
조합이라 관찰이 필요하다. 실패해도 폴백 전문가로 넘어간다.

### 모델 오버라이드 (Claude opt-in 포함)

`consult_expert`에 `model` 파라미터를 넘기면 그 모델이 체인 0번이 되고, 전문가 기본
모델이 뒤에 붙어 한도 소진 시 자동 강등된다.

```
consult_expert(expert: "momus", question: "...", model: "opus")
  → 체인 [claude:opus, agy:gemini-3.1-pro-high]
  → Claude Opus가 먼저. 한도 소진 시 90분 차단 후 Gemini로 강등 + 사용자에게 알림
```

명시 모델은 **1차 전문가에만** 적용된다. 폴백 전문가는 자기 기본 모델을 쓴다 —
scarce 모델이 폴백 체인 전체로 번지면 opt-in 가드가 무의미해지기 때문이다.

`MODEL_<전문가ID 대문자>` 환경변수로도 오버라이드 가능하며, 미등록 슬러그는
**부팅 시점에** 유효 목록과 함께 실패한다.

### Role Division

| | GPT (codex) | Gemini (agy) | Claude (opt-in) |
|---|---|---|---|
| 코드 변경 | delegate_task (implementer만) | 금지 | 금지 |
| 코드 리뷰 | 설계/SOLID 관점 | 버그/보안/비판 | 3자 검증 |
| 파일 읽기 | 가능 | 가능 | 가능 |
| 이미지 입력 | `-i` 지원 | 미지원 | 미지원 |
| 시스템 프롬프트 | 프롬프트에 합침 | 프롬프트에 합침 | `--system-prompt` 네이티브 |

### MCP Tools

**Core Tools:**
- `consult_expert` - Direct expert consultation with automatic fallback
- `consult_experts_parallel` - 2명 이상 전문가 병렬 호출 (반드시 사용)
- `route_by_category` - Category-based routing (visual, business-logic, research, quick, review, documentation)

**Task Delegation:**
- `delegate_task` - GPT(codex) 에이전트 1~3명에게 구현 위임 (병렬, plan->execute->report)

**Background Execution:**
- `background_expert_start` - Async expert execution
- `background_expert_result` - Check task results
- `background_expert_cancel` - Cancel running tasks
- `background_expert_list` - List all background tasks

**Workflows:**
- `design_with_experts` - Multi-expert design workflow (strategist + codereview, parallel=true 기본)
- `review_code` - Code review with files parameter, context_docs, perspectives (1~3 멀티관점 병렬)
- `research_topic` - Topic research with depth options (quick/normal/deep)

**Administration:**
- `llm_router_health` - Server health check, cache management, task cleanup

### Category Routing

| Category | Default Expert | Description |
|----------|---------------|-------------|
| visual | frontend | UI/UX, 디자인, 프론트엔드 |
| business-logic | strategist | 백엔드 로직, 아키텍처 |
| research | strategist | 조사, 분석, 문서 탐색 |
| quick | momus | 빠른 판단, 간단한 질문 |
| review | codereview | 코드 리뷰, 버그 탐지 |
| documentation | strategist | 문서 작성, API 문서화 |

### Skills (17, all with llm- prefix)

llm-plan, llm-planAll, llm-codereview, llm-validate, llm-security, llm-research, llm-design, llm-tdd, llm-background, llm-debate, llm-consult, llm-verify, llm-analyze, llm-health, llm-guide, llm-planreview, llm-persona

### Plugin Cache Sync (중요)

플러그인이 `~/.claude/plugins/cache/llm-router/llm-router/<version>/` 에 캐시되어 사용됩니다.
실제 캐시 경로는 `~/.claude/plugins/installed_plugins.json`의 `installPath`에서 확인 가능합니다.
**스킬을 추가/수정하면 캐시에도 동기화해야** VSCode Claude Code에서 반영됩니다.

```bash
# 캐시 경로 확인
CACHE_DIR=$(cat ~/.claude/plugins/installed_plugins.json | grep -A1 llm-router | grep installPath | sed 's/.*": "//;s/".*//')

# 새 스킬 추가 시
cp -r plugin/skills/<new-skill> "$CACHE_DIR/skills/"

# 기존 스킬 수정 시
cp plugin/skills/<skill>/SKILL.md "$CACHE_DIR/skills/<skill>/SKILL.md"
```

동기화 후 VSCode 재시작 필요.

### Key Services

**프로바이더 계층** — `src/services/providers/`

| 파일 | 책임 |
|---|---|
| `model-registry.ts` | 모델 → (프로바이더, 타임아웃, 동시성, scarce) 단일 표. **모델을 추가하려면 여기부터** |
| `types.ts` | `CliCallParams` / `CliCallResult` / `CliProviderError` |
| `registry.ts` | 프로바이더 싱글톤 3개 |
| `model-chain.ts` | 체인 순회 + scarce 가드 + quota 강등 + 스텝 단위 세마포어 |
| `quota-registry.ts` | 한도 소진 모델 차단 (프로바이더 무관) |
| `cli-spawner.ts` | 유일한 `child_process.spawn`. Windows 프로세스 트리 kill, stdin EPIPE, 출력 잘림 감지 |
| `{agy,codex,claude}-provider.ts` | argv 조립 + 1회 실행. **체인 순회는 하지 않는다** |
| `{agy,codex,claude}-parse.ts` | 순수 파서. 실측 페이로드가 테스트 픽스처로 고정돼 있다 |

- `src/services/cliproxy-client.ts` — 캐시/재시도/체인 실행 오케스트레이션
- `src/services/expert-router.ts` — 전문가 폴백 라우팅
- `src/services/background-manager.ts` — 비동기 작업 큐 + JSON 영속화

### Utilities

- `src/utils/errors.ts` — **에러 분류 단일 소스**. `ErrorKind` + `ERROR_POLICY`.
  판정 순서가 곧 사양이므로 `ORDERED_RULES` 순서를 바꾸면 동작이 바뀐다
- `src/utils/rate-limit.ts` — 모델별 한도 추적 (분류는 `errors.ts`에 위임)
- `src/utils/retry.ts` — 지수 백오프 + 지터
- `src/utils/cache.ts` — TTL LRU 응답 캐시

### Security Features

**Image Path Validation (LFI/SSRF Prevention)** - `src/tools/consult-expert.ts`
- HTTPS URL만 허용 (HTTP 차단)
- 내부 IP/localhost 차단 (SSRF 방지)
- 상대 경로만 허용, 경로 탈출(..) 차단 (LFI 방지)
- 허용된 디렉토리: `./uploads`, `./images`, `./screenshots`, `./assets`
- 허용된 확장자: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`

**File Path Validation** - `src/tools/delegate-task.ts`, `src/tools/review-workflow.ts`
- 상대 경로만 허용 (절대경로 차단)
- 경로 탈출(..) 차단
- Windows 절대경로 (C:\) 차단

### Memory & Performance

**Doom Loop Detector** - `src/hooks/builtin/doom-loop-detector.ts`
- 슬라이딩 윈도우 히스토리 (최대 100개)
- 유사도 검사 제한 (최근 20개만)
- 주기적 정리 (매 10번째 호출)
- JSON 키 정렬로 일관된 해시 생성

### 응답 캐시

`src/utils/cache.ts` — TTL 30분 LRU(100개). 캐시 키:

```
sha256(expertId : prompt : context + [chain:...] + [files:<지문>])
```

**파일 지문이 키에 들어간다.** 전문가 프롬프트는 파일 *경로*만 담고 내용은 CLI가
직접 읽는 설계라(토큰 절약), 예전 키는 파일 변경을 전혀 보지 못했다. 리뷰 →
지적된 버그 수정 → 재리뷰 시 프롬프트가 동일해 **30분 동안 고치기 전 코드의
리뷰가 재생**됐다. 코드 리뷰 도구로서 오동작이라, 프롬프트/컨텍스트에서 실제로
존재하는 파일 경로를 추출해 `mtime+size` 지문을 키에 섞는다
(`fingerprintReferencedFiles`).

- 워크스페이스 밖(절대경로·상위 탈출)과 URL은 제외한다
- 존재하지 않는 토큰은 조용히 버린다 — 오탐해도 캐시가 보수적이 될 뿐이다
- 후보는 최대 40개로 묶어 큰 프롬프트에서도 비용이 일정하다

**모델도 키에 들어간다.** 전문가 기본 모델을 바꿔도(`MODEL_*`, `set_expert_model`,
기본값 변경) 옛 모델의 답변이 계속 나오던 문제를 막는다.

따라서 `llm_router_health(clear_cache: true)`를 습관적으로 쓸 필요가 없다.
그래도 필요하면 그 파라미터는 그대로 있다.

### Persistence

**Background Task Persistence** - `src/services/background-manager.ts`
- 저장 위치: `.llm-router-data/background-tasks.json`
- 자동 저장 간격: 5초
- 프로세스 재시작 시 작업 상태 복원
- running 상태였던 작업은 pending으로 복원
- 최대 복원 가능 작업 나이: 1시간

### Model-Specific Timeouts

`src/services/providers/model-registry.ts`가 단일 소스다 (substring 추론 아님).

| Model | Timeout |
|-------|---------|
| `gpt-5.5` | 20분 |
| `gemini-3.1-pro-high` | 15분 |
| `gemini-3.7-flash-high` | 10분 |
| `gemini-3.1-pro-low`, `gpt-oss-120b-medium`, `claude-sonnet-4-6` | 10분 |
| `claude-opus-4-6-thinking` | 15분 |
| `gemini-3.5/3.6-flash-*`, `gemini-3.7-flash-medium/low` | 5분 |
| `opus`, `sonnet` (claude -p) | 5분 |

agy는 단순 파일 읽기 1건에도 실측 147초가 걸린다. 짧게 잡지 말 것.

### Error Classification

`src/utils/errors.ts` 단일 표. 각 모듈은 `ErrorKind → 자기 타입` 매핑만 갖는다.

| ErrorKind | 같은 모델 재시도 | 다음 모델 | 폴백 전문가 | 비고 |
|---|---|---|---|---|
| `quota` | X | O | O | 90분 차단 |
| `timeout` | X | X | O | 재시도하면 대기시간이 배가 된다 |
| `auth` | X | X | X | 어디로 가도 같다 |
| `bad_request` | X | X | X | 요청 자체 문제 |
| `bad_model` | X | O | X | 슬러그 오타가 요청을 죽이면 안 된다 |
| `permission_denied` | X | X | X | 우리 argv 버그 신호 — 조용히 우회 금지 |
| `network` / `server` | O | O | O | 일시적 |
| `context_overflow` | X | X | O | 프롬프트를 줄여야 한다 |

**판정 순서가 사양이다.** `quota`가 `auth`보다, `bad_model`이 `bad_request`보다 먼저다.
숫자 상태코드는 단어 경계로만 매칭한다(예전엔 `"14002ms"`가 400으로 잡혔다).
`permission_denied`는 정규식으로 유도하지 않고 파서가 구조적으로만 설정한다.

### Ensemble Strategy Validation

전략별 필수 파라미터 검증 - `src/tools/ensemble.ts`

| 전략 | 필수 조건 | 심각도 |
|------|----------|--------|
| synthesize | synthesizer 필수 | error |
| vote | vote_options 2개 이상 | error |
| best_of_n | experts 1개만 | error |
| chain | experts 2개 이상 | error |
| parallel/synthesize | experts 2개 이상 권장 | warning |

## CLI 제약 (실측 기준, 2026-08-07)

코드를 고치기 전에 반드시 알아야 하는 것들. 전부 실제 CLI 출력으로 확인했다.

### agy 1.1.11
- `--output-format json`이 stdout으로 정상 출력한다. (1.0.x의 임시파일 우회는 폐기됐다)
- **에러도 exit 1과 함께 정상 JSON 봉투로 나온다** → exit code를 1차 신호로 쓰지 말 것
- **툴 권한 자동 거부 시 `status:"SUCCESS"` + `response:""`** 를 반환하고
  JSON 앞에 평문 경고가 먼저 찍힌다 → 마지막 JSON 라인을 파싱하고 빈 응답을 실패로 잡아야 한다
- **`--effort`는 슬러그에 effort가 박힌 모델에서 거부된다** → 절대 넘기지 말 것.
  effort는 모델 슬러그 선택으로 표현한다(`-high`/`-low`/`-thinking`)
- `--dangerously-skip-permissions` 없으면 모든 툴 사용이 자동 거부된다.
  역할 게이트는 `--sandbox`가 담당한다
- stdin 프롬프트 모드가 없어 프롬프트가 argv를 탄다 → Windows 32767자 상한.
  24000자 초과분만 임시파일로 우회한다

### codex 0.146.1
- `-o/--output-last-message <FILE>`이 최종 답변만 정확히 기록한다
- `--json`은 토큰 사용량(`turn.completed.usage`)과 error item 수집용으로 병행
- **`item.type === 'error'`는 실패 신호가 아니다.** 사용자 `~/.codex/config.toml`의
  deprecated `features.codex_hooks`가 매 실행 error item을 하나씩 만든다
- `--strict-config` 금지(그 deprecated 키가 치명적이 된다), `--ignore-user-config` 금지(인증이 날아간다)
- reasoning effort는 CLI 플래그가 없고 `-c model_reasoning_effort=high`로만 지정한다

### claude -p (Claude Code 2.1.132)
- 중첩 세션에서도 동작한다 (예전 제약은 해소됨)
- **`--strict-mcp-config` 필수** — 없으면 llm-router MCP가 재귀 로딩된다
- **`--bare` 금지** — 인증이 `ANTHROPIC_API_KEY` 전용이 되어 구독 OAuth가 깨진다
- 유일하게 진짜 `--system-prompt` 채널이 있다

## Key Principles

- 2명 이상 전문가 호출 시 반드시 병렬 (consult_experts_parallel 사용)
- 코드 변경은 delegate_task(→ implementer)만. 나머지 17명은 read-only로 강제된다
- 파일 경로만 넘기면 CLI가 직접 읽음 (토큰 절약)
- codex는 AGENTS.md를 프로젝트 루트에서 자동으로 읽는다
- Claude(`model: "opus"`)는 사용자 본인 한도를 쓴다. 습관적으로 쓰면 이 MCP의
  존재 이유(타 벤더 오프로드)가 무너진다

## Configuration

Environment variables (see `.env.example`):

```bash
# CLI 도구 경로 (PATH에 있으면 생략 가능)
CLI_AGY_PATH=agy                       # 구버전 별칭: CLI_ANTIGRAVITY_PATH
CLI_CODEX_PATH=codex
CLI_CLAUDE_PATH=claude

# 전문가별 모델 (미등록 슬러그면 부팅 실패)
MODEL_STRATEGIST=gpt-5.5
MODEL_MOMUS=gemini-3.1-pro-high

# Claude opt-in 비용 상한 (USD/호출, 0이면 무제한)
CLAUDE_MAX_BUDGET_USD=1.0

# 선택적 API 키
EXA_API_KEY=your_key                   # Exa 웹 검색
CONTEXT7_API_KEY=your_key              # 라이브러리 문서

# 캐시/재시도/동시성
CACHE_ENABLED=true
CACHE_TTL_MS=1800000
RETRY_MAX=3
CONCURRENCY_CODEX=5                    # 구버전 별칭: CONCURRENCY_OPENAI
CONCURRENCY_AGY=10                     # 구버전 별칭: CONCURRENCY_GOOGLE
CONCURRENCY_CLAUDE=2
```

## Quota Handling

2단 강등이다.

1. **모델 체인** (`model-chain.ts`) — 한도 소진 시 그 모델을 90분 차단하고
   같은 전문가의 다음 모델로 넘어간다. `scarce` 모델은 0번 스텝일 때만 선택되므로
   폴백 꼬리로는 절대 도달하지 않는다.
2. **전문가 폴백** (`expert-router.ts`) — 체인이 전부 소진되면 `FALLBACK_CHAIN`의
   다른 전문가로 넘어간다.

차단 현황은 `llm_router_health`에 노출된다.

## 코드 수정 시 주의

- **모델을 추가/변경하려면** `model-registry.ts`의 `MODELS`부터. 그다음
  `model-defaults.ts`. 부팅 시 `validateExpertRegistry()`가 6개 목록의 정합성을
  검증하므로 어긋나면 서버가 뜨지 않는다.
- **에러 문자열 처리는 `utils/errors.ts` 한 곳에서만.** 예전에 같은 일을 하는 표가
  5벌 있었고 서로 결론이 달라 실제 오분류가 있었다.
- **프로바이더는 CLI 1회 실행만 한다.** 체인 순회/재시도/세마포어를 프로바이더 안에
  넣지 말 것.
- 파서를 고쳤으면 `*-parse.test.ts`의 실측 픽스처로 검증하고, argv를 고쳤으면
  `npm run probe`로 실제 CLI에 물어볼 것.

## Language

Design documents and code comments are in Korean. Maintain Korean for user-facing strings in expert responses.
