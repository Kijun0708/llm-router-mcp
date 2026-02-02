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

- `src/services/cliproxy-client.ts` - CLIProxyAPI client with rate limit detection
- `src/services/expert-router.ts` - Expert selection and fallback routing
- `src/services/background-manager.ts` - Async task queue with concurrency control

### Utilities

- `src/utils/rate-limit.ts` - Rate limit detection and tracking per model/provider
- `src/utils/retry.ts` - Exponential backoff with jitter
- `src/utils/cache.ts` - LRU cache with TTL for response caching

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
