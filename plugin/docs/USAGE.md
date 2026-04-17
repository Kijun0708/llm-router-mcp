# LLM Router Plugin Usage Guide

This document is the shared operating guide for projects that use the `llm-router` plugin.

## Overview

`llm-router` lets Claude work with GPT and Gemini specialists.

Role split:
- Claude: primary driver, repo understanding, planning, integration, final decisions
- GPT: implementation, architecture reasoning, test strategy, code modification through delegated flows
- Gemini: review, critique, security analysis, alternative viewpoints, fast cross-checking

Default expectations:
- Prefer the plugin when a task benefits from specialist review, delegation, or structured workflow.
- Prefer file paths and concise task framing over pasting large code blocks.
- If 2 or more experts are needed, prefer parallel execution.
- GPT may modify code through approved delegation flows.
- Gemini is review and analysis oriented; do not rely on it for code modification.

## Skill Routing Guide

Use these skills by default when the request matches:

| User intent | Recommended skill |
|------|------|
| 설계만 하고 구현은 GPT에게 맡기기 | `llm-plan` |
| Claude와 GPT가 나눠서 병렬 구현 | `llm-planAll` |
| 코드 리뷰, 버그 찾기, 회귀 위험 점검 | `llm-codereview` |
| 빌드, 타입, 참조, 검증 체크 | `llm-validate` |
| 보안 취약점, OWASP 관점 점검 | `llm-security` |
| 기술 조사, 라이브러리 비교, 최신 흐름 파악 | `llm-research` |
| 설계 워크플로우 전체 진행 | `llm-design` |
| 테스트 주도 개발 | `llm-tdd` |
| 오래 걸리는 전문가 작업 백그라운드 실행 | `llm-background` |
| 여러 관점 비교, 전문가 토론 | `llm-debate` |
| 어떤 전문가를 부를지 애매할 때 상담 | `llm-consult` |
| 교차 검증, 상반된 의견 비교 | `llm-verify` |
| 코드베이스나 구조를 깊게 분석 | `llm-analyze` |
| 서버/환경 상태 확인 | `llm-health` |
| 전체 시스템 사용법 참고 | `llm-guide` |

## Workflow Guide

### `llm-plan`

Use when Claude should design only and GPT should implement everything.

Flow:
1. Claude creates the plan and GPT subtask split.
2. Claude performs design review using the `Agent` tool.
3. GPT design specialist performs a second design review.
4. If review finds issues, revise the plan and review again.
5. Only after both reviews pass, ask for user confirmation.
6. Delegate implementation to GPT agents.
7. Review the delivered changes before closing.

Rules:
- Claude does not directly modify code in this flow.
- Do not start implementation before both design reviews are done.
- Use 1 to 3 review agents depending on design size.

### `llm-planAll`

Use when Claude and GPT should split the work and implement in parallel.

Flow:
1. Claude creates the plan and separates Claude-owned files from GPT-owned files.
2. Claude performs design review using the `Agent` tool.
3. GPT design specialist performs a second design review.
4. If review finds issues, revise the plan and review again.
5. Only after both reviews pass, ask for user confirmation.
6. Start GPT delegated work first.
7. Claude implements its own file set in parallel.
8. Run integrated review before closing.

Rules:
- Claude-owned files and GPT-owned files must not overlap.
- Claude's work must not depend on GPT finishing first.
- Do not start implementation before both design reviews are done.

### `llm-design`

Use when the user wants design exploration before implementation starts.

Expectations:
- Gather architecture options.
- Use experts to pressure-test the design.
- Produce a concrete implementation plan before code changes.
- Get user confirmation before implementation when the workflow expects it.

### `llm-codereview`

Use for code review requests, risk inspection, bug hunting, and post-change validation planning.

Expectations:
- Findings first, ordered by severity.
- Focus on bugs, regressions, design problems, and missing tests.
- If fixes are needed, move into a plan before editing.

### `llm-validate`

Use after meaningful changes or before closing risky tasks.

Expectations:
- Run available build, typecheck, lint, or targeted verification commands.
- Report concrete failures or confirm clean results.

### `llm-security`

Use for security-sensitive changes or explicit security review.

Expectations:
- Check auth, secrets, validation, injection, access control, file handling, SSRF/LFI/path traversal risks, and dependency exposure.
- Prefer actionable findings over generic advice.

### `llm-research`

Use when the task needs comparison, external patterns, API or library understanding, or technology choices.

Expectations:
- Summarize tradeoffs.
- Distinguish facts from recommendations.
- Feed useful results back into implementation or design decisions.

### `llm-debate`

Use when competing options need structured comparison.

Expectations:
- Invite multiple perspectives.
- Produce a final recommendation with tradeoffs.
- Use when architecture, framework, or strategy choices are genuinely ambiguous.

### `llm-background`

Use for expensive analysis or long-running expert work that should not block current progress.

Expectations:
- Start the work asynchronously.
- Return to it later for results.
- Use only when background execution clearly helps throughput.

## Expert Usage Rules

Core principles:
- If only one specialist opinion is needed, use a single expert.
- If the task benefits from disagreement or comparison, use multiple experts in parallel.
- Prefer `review_code` or structured workflows over ad hoc expert chatter when code risk is involved.
- Use GPT-oriented experts for implementation strategy and code-writing tasks.
- Use Gemini-oriented experts for criticism, review, and second opinions.

Typical expert mapping:
- Architecture or debugging strategy: `strategist`, `metis`
- Code review and regressions: `codereview`, `codereview_gpt`, `momus`
- Frontend and UX: `frontend`
- Security: `security`
- Testing strategy: `tester`
- Data and schema issues: `data`
- CI/CD and infra: `devops`
- Reality check, dead code, mixed-path issues: `reality_checker`
- Symbol/reference analysis: `lsp_index_engineer`

## Review And Validation Rules

- After delegated or parallel implementation, run review before closing the task.
- Use `llm-codereview` when behavior changed or risk is non-trivial.
- Use `llm-validate` after edits if the repo has build, typecheck, lint, or test commands available.
- If the task is security-sensitive, add `llm-security`.
- If design changed materially, confirm the final code still matches the approved plan.

## Natural Language Prompt Patterns

Examples users can say naturally:

- "설계만 하고 구현은 GPT에게 맡겨"
- "같이 나눠서 병렬로 구현하자"
- "이 변경 코드 리뷰해줘"
- "보안 관점에서 점검해줘"
- "변경 후 빌드와 타입 검증까지 해줘"
- "이 라이브러리 선택이 맞는지 조사해줘"
- "전문가 토론으로 React와 Vue 비교해줘"
- "백그라운드로 아키텍처 분석 돌려줘"
