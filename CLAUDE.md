# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Router MCP is a Model Context Protocol (MCP) server that enables multi-LLM collaboration via CLIProxyAPI. It allows Claude Code to orchestrate GPT, Gemini, and other Claude instances as team members, with automatic rate limit handling and fallback routing.

**Core Concept**: Claude Code acts as the team leader, delegating specialized tasks to different LLM "experts" based on their strengths.

## Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Transport**: stdio (for Claude Code local integration)
- **Validation**: Zod (runtime type validation)
- **Logging**: pino
- **Caching**: lru-cache

## Build and Run Commands

```bash
# Install dependencies
npm install

# Build
npm run build

# Run the MCP server
node dist/index.js
```

## Architecture

### Expert System

22 AI experts with specialized roles and automatic fallback chains:

#### 기본 전문가 (11명)

| Expert | Model | Role | Fallbacks |
|--------|-------|------|-----------|
| `strategist` | GPT 5.2 | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| `researcher` | Claude Sonnet | 문서 분석, 코드베이스 탐색 | reviewer → explorer |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석 | explorer → codex_reviewer |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| `writer` | Gemini Flash | 기술 문서 작성 | explorer |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리 | - |
| `multimodal` | GPT 5.2 | 이미지 분석, 시각적 콘텐츠 | strategist → researcher |
| `librarian` | Claude Sonnet | 지식 관리, 세션 히스토리 검색 | researcher → explorer |
| `metis` | GPT 5.2 | 전략적 계획, 복잡한 문제 분해 | strategist → researcher |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | reviewer → explorer |
| `prometheus` | Claude Sonnet | 창의적 솔루션, 혁신적 접근 | strategist → researcher |

#### 특화 전문가 (4명)

| Expert | Model | Role | Fallbacks |
|--------|-------|------|-----------|
| `security` | Claude Sonnet | OWASP/CWE 보안 취약점 분석 | reviewer → strategist |
| `tester` | Claude Sonnet | TDD/테스트 전략 설계 | reviewer → researcher |
| `data` | GPT 5.2 | DB 설계, 쿼리 최적화 | strategist → researcher |
| `codex_reviewer` | GPT Codex | GPT 관점 코드 리뷰 | reviewer → strategist |

#### 동적 페르소나 전문가 (6명) - 토론용

| Expert | Model | Description |
|--------|-------|-------------|
| `gpt_blank_1` | GPT 5.2 | OpenAI 범용 모델 |
| `gpt_blank_2` | GPT Codex | OpenAI 코드 특화 |
| `claude_blank_1` | Claude Opus | Anthropic 최고 성능 |
| `claude_blank_2` | Claude Sonnet | Anthropic 빠른 모델 |
| `gemini_blank_1` | Gemini Pro | Google 고성능 |
| `gemini_blank_2` | Gemini Flash | Google 빠른 응답 |

#### 토론 조정자 (1명)

| Expert | Model | Role |
|--------|-------|------|
| `debate_moderator` | Claude Sonnet | 토론 주제 분석 → 자동 페르소나 할당 |

### MCP Tools

**Core Tools:**
- `consult_expert` - Direct expert consultation with automatic fallback
- `route_by_category` - Category-based routing (visual, business-logic, research, quick, review, documentation)

**Background Execution:**
- `background_expert_start` - Async expert execution
- `background_expert_result` - Check task results
- `background_expert_cancel` - Cancel running tasks
- `background_expert_list` - List all background tasks

**Workflows:**
- `design_with_experts` - Multi-expert design workflow (strategist + optional researcher/reviewer)
- `review_code` - Code review workflow with optional design perspective
- `research_topic` - Topic research with depth options (quick/normal/deep)

**Administration:**
- `llm_router_health` - Server health check, cache management, task cleanup

### Key Services

- `src/services/cliproxy-client.ts` - CLIProxyAPI client with rate limit detection, model-specific timeouts
- `src/services/expert-router.ts` - Expert selection and fallback routing with error classification
- `src/services/background-manager.ts` - Async task queue with concurrency control and JSON persistence

### Utilities

- `src/utils/rate-limit.ts` - Rate limit detection and tracking per model/provider
- `src/utils/retry.ts` - Exponential backoff with jitter
- `src/utils/cache.ts` - LRU cache with TTL for response caching

### Security Features

**Image Path Validation (LFI/SSRF Prevention)** - `src/tools/consult-expert.ts`
- HTTPS URL만 허용 (HTTP 차단)
- 내부 IP/localhost 차단 (SSRF 방지)
- 상대 경로만 허용, 경로 탈출(..) 차단 (LFI 방지)
- 허용된 디렉토리: `./uploads`, `./images`, `./screenshots`, `./assets`
- 허용된 확장자: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`

### Memory & Performance

**Doom Loop Detector** - `src/hooks/builtin/doom-loop-detector.ts`
- 슬라이딩 윈도우 히스토리 (최대 100개)
- 유사도 검사 제한 (최근 20개만)
- 주기적 정리 (매 10번째 호출)
- JSON 키 정렬로 일관된 해시 생성

### Persistence

**Background Task Persistence** - `src/services/background-manager.ts`
- 저장 위치: `.llm-router-data/background-tasks.json`
- 자동 저장 간격: 5초
- 프로세스 재시작 시 작업 상태 복원
- running 상태였던 작업은 pending으로 복원
- 최대 복원 가능 작업 나이: 1시간

### Model-Specific Timeouts

| Model | Timeout | Reason |
|-------|---------|--------|
| GPT 5.x / Codex | 5분 | Deep thinking 모드 |
| Claude Opus | 3분 | Deep thinking 모드 |
| Claude Sonnet/Haiku | 2분 | 일반 추론 |
| Gemini | 1.5분 | 빠른 응답 |
| 기타 | 1분 | 기본값 |

### Error Classification for Fallback

폴백 시도 여부 결정 기준 - `src/services/expert-router.ts`

| 에러 유형 | 폴백 시도 | 이유 |
|----------|----------|------|
| Rate Limit (429) | ✅ | 다른 모델로 대체 가능 |
| Timeout | ✅ | 다른 모델이 더 빠를 수 있음 |
| Server Error (5xx) | ✅ | 일시적 문제 가능성 |
| Overloaded | ✅ | 다른 모델로 분산 |
| Auth Error (401/403) | ❌ | 폴백해도 동일 문제 |
| Bad Request (400) | ❌ | 요청 자체 문제 |

### Ensemble Strategy Validation

전략별 필수 파라미터 검증 - `src/tools/ensemble.ts`

| 전략 | 필수 조건 | 심각도 |
|------|----------|--------|
| synthesize | synthesizer 필수 | error |
| debate | synthesizer 권장 | warning |
| vote | vote_options 2개 이상 | error |
| best_of_n | experts 1개만 | error |
| chain | experts 2개 이상 | error |
| parallel/synthesize | experts 2개 이상 권장 | warning |

## Configuration

Environment variables (see `.env.example`):

```bash
CLIPROXY_URL=http://127.0.0.1:<PORT>  # CLIProxyAPI endpoint (필수 - 실제 포트로 설정)
CACHE_ENABLED=true                     # Response caching
CACHE_TTL_MS=1800000                   # 30 minute cache TTL
RETRY_MAX=3                            # Max retry attempts
CONCURRENCY_ANTHROPIC=3                # Concurrent requests per provider
```

## Rate Limit Handling

The system automatically:
1. Detects rate limits from HTTP 429 and error message patterns
2. Marks models as limited with retry-after tracking
3. Routes to fallback experts when primary is rate limited
4. Uses exponential backoff with jitter for retries

## Language

Design documents and code comments are in Korean. Maintain Korean for user-facing strings in expert responses.
