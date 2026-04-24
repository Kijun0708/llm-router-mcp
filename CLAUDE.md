# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLM Router MCP is a Model Context Protocol (MCP) server that enables multi-LLM collaboration via terminal CLI tools (gemini, codex). It allows Claude Code to orchestrate GPT and Gemini instances as team members, with automatic rate limit handling and fallback routing.

**Core Concept**: Claude Code acts as the team leader (handling all Claude-related tasks natively), delegating specialized tasks to GPT/Gemini "experts" for diverse perspectives.

**Note**: Claude models are NOT called via MCP - Claude Code handles Claude tasks directly to avoid nested session issues.

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

13 primary AI experts with specialized roles and automatic fallback chains (GPT/Gemini only), plus 4 blank debate slots and 1 debate moderator (18 total):

#### 기본 전문가 (5명)

| Expert | Model | Role | Fallbacks |
|--------|-------|------|-----------|
| `strategist` | GPT | 아키텍처 설계, 디버깅 전략 | codereview → momus |
| `codereview` | Gemini Pro + GPT | 통합 코드 리뷰 (perspectives로 GPT+Gemini 병렬 리뷰) | strategist → momus |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | strategist → momus |
| `metis` | GPT | 전략적 계획, 문제 분해 | strategist → codereview |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | codereview → strategist |

#### 특화 전문가 (8명)

| Expert | Model | Role | Fallbacks |
|--------|-------|------|-----------|
| `security` | GPT | OWASP/CWE 보안 분석 | codereview → strategist |
| `tester` | GPT | TDD/테스트 전략 | codereview → strategist |
| `data` | GPT | DB 설계, 쿼리 최적화 | strategist → codereview |
| `devops` | GPT | CI/CD, Docker, K8s | strategist → codereview |
| `reality_checker` | Gemini Pro | 현실 검증, dead code | momus → codereview |
| `lsp_index_engineer` | GPT | 심볼/참조 분석 | codereview → strategist |
| `codereview_gpt` | GPT | GPT 코드리뷰 - SOLID/설계/실무 관점 (READ-ONLY) | codereview → momus |
| `implementer` | GPT | 코드 구현 에이전트 (READ-WRITE, delegate_task 전용) | strategist → codereview_gpt |

#### 동적 페르소나 전문가 (4명) - 토론용

| Expert | Model | Description |
|--------|-------|-------------|
| `gpt_blank_1` | GPT | OpenAI 범용 모델 |
| `gpt_blank_2` | GPT | OpenAI 코드 특화 |
| `gemini_blank_1` | Gemini Pro | Google 고성능 |
| `gemini_blank_2` | Gemini Flash | Google 빠른 응답 |

#### 토론 중재자 (1명)

| Expert | Model | Role |
|--------|-------|------|
| `debate_moderator` | Gemini Pro | 패널 토론 중재 및 최종 요약 |

### Role Division (GPT vs Gemini)

| | GPT (codex) | Gemini |
|---|---|---|
| 코드 변경 | delegate_task | 금지 |
| 코드 리뷰 | 설계 관점 | 버그/보안/비판 |
| 파일 읽기 | 가능 | 가능 |

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

### Key Services

- `src/services/cliproxy-client.ts` - CLI tool orchestrator (child_process.spawn) with rate limit detection, model-specific timeouts
- `src/services/providers/` - CLI provider adapters (Gemini, Codex only - no Claude)
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
| GPT 5.x / Codex | 20분 | --full-auto 자율 실행 |
| Gemini Pro | 10분 | --yolo 자율 실행 |
| Gemini Flash | 5분 | --yolo 자율 실행 |
| 기타 | 1분 | 기본값 |

### Error Classification for Fallback

폴백 시도 여부 결정 기준 - `src/services/expert-router.ts`

| 에러 유형 | 폴백 시도 | 이유 |
|----------|----------|------|
| Rate Limit (429) | O | 다른 모델로 대체 가능 |
| Timeout | O | 다른 모델이 더 빠를 수 있음 |
| Server Error (5xx) | O | 일시적 문제 가능성 |
| Overloaded | O | 다른 모델로 분산 |
| Auth Error (401/403) | X | 폴백해도 동일 문제 |
| Bad Request (400) | X | 요청 자체 문제 |

### Ensemble Strategy Validation

전략별 필수 파라미터 검증 - `src/tools/ensemble.ts`

| 전략 | 필수 조건 | 심각도 |
|------|----------|--------|
| synthesize | synthesizer 필수 | error |
| vote | vote_options 2개 이상 | error |
| best_of_n | experts 1개만 | error |
| chain | experts 2개 이상 | error |
| parallel/synthesize | experts 2개 이상 권장 | warning |

## Key Principles

- 2명 이상 전문가 호출 시 반드시 병렬 (consult_experts_parallel 사용)
- delegate_task는 implementer 전문가 사용 (GPT, READ-WRITE)
- 파일 경로만 넘기면 CLI가 직접 읽음 (토큰 절약)
- codex는 AGENTS.md, gemini는 GEMINI.md 프로젝트 루트에서 자동 읽음

## Configuration

Environment variables (see `.env.example`):

```bash
# CLI 도구 경로 (PATH에 있으면 생략 가능)
CLI_GEMINI_PATH=gemini
CLI_CODEX_PATH=codex

# 선택적 API 키
EXA_API_KEY=your_key                   # Exa 웹 검색
CONTEXT7_API_KEY=your_key              # 라이브러리 문서

# 캐시/재시도 설정
CACHE_ENABLED=true                     # Response caching
CACHE_TTL_MS=1800000                   # 30 minute cache TTL
RETRY_MAX=3                            # Max retry attempts
CONCURRENCY_OPENAI=5                   # Concurrent requests per provider
CONCURRENCY_GOOGLE=10
```

## Rate Limit Handling

The system automatically:
1. Detects rate limits from CLI stderr patterns and error messages
2. Marks models as limited with retry-after tracking
3. Routes to fallback experts when primary is rate limited
4. Uses exponential backoff with jitter for retries

## Language

Design documents and code comments are in Korean. Maintain Korean for user-facing strings in expert responses.
