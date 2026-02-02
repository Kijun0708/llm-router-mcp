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

Six AI experts with specialized roles and automatic fallback chains:

| Expert | Model | Role | Fallbacks |
|--------|-------|------|-----------|
| `strategist` | GPT 5.2 | Architecture, design, debugging strategy | researcher → reviewer |
| `researcher` | Claude Sonnet | Documentation analysis, codebase exploration | reviewer → explorer |
| `reviewer` | Gemini Pro | Code review, bug detection, security analysis | explorer |
| `frontend` | Gemini Pro | UI/UX, component design, accessibility | writer → explorer |
| `writer` | Gemini Flash | Technical documentation, README, API docs | explorer |
| `explorer` | Gemini Flash | Quick file search, pattern matching, simple queries | none |

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
