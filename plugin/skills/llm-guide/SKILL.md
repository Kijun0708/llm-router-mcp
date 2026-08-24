---
name: llm-guide
description: "LLM Router 시스템 가이드 - 전문가 목록, 폴백 체인, MCP 도구, 사용 패턴 레퍼런스"
user-invocable: false
---

## LLM Router MCP — 시스템 레퍼런스

이 문서는 LLM Router MCP 시스템의 전체 레퍼런스입니다. Claude가 적절한 전문가와 도구를 선택하는 데 사용합니다.

### 전문가 시스템

#### 핵심 전문가 (3명)

| ID | 프로바이더 / 모델 | 역할 | 폴백 |
|----|------|------|------|
| `strategist` | codex / gpt-5.5 | 아키텍처 설계, 디버깅 전략 | codereview → momus |
| `codereview` | agy / gemini-3.1-pro-high | 통합 코드 리뷰 (perspectives로 병렬 리뷰) | strategist → momus |
| `frontend` | agy / gemini-3.7-flash-high | UI/UX, 컴포넌트 설계 | strategist → momus |

#### 계획/분석 전문가 (2명)

| ID | 프로바이더 / 모델 | 역할 | 폴백 |
|----|------|------|------|
| `metis` | codex / gpt-5.5 | 전략적 계획, 문제 분해 | strategist → codereview |
| `momus` | agy / gemini-3.1-pro-high | 비판적 분석, 품질 평가 | codereview → strategist |

#### 특화 전문가 (7명)

| ID | 프로바이더 / 모델 | 역할 | 폴백 |
|----|------|------|------|
| `security` | codex / gpt-5.5 | OWASP/CWE 보안 분석 | codereview → strategist |
| `tester` | codex / gpt-5.5 | TDD/테스트 전략 | codereview → strategist |
| `data` | codex / gpt-5.5 | DB 설계, 쿼리 최적화 | strategist → codereview |
| `devops` | codex / gpt-5.5 | CI/CD, Docker, K8s, 인프라 | strategist → codereview |
| `reality_checker` | agy / gemini-3.1-pro-high | 현실 검증, dead code 탐지 | momus → codereview |
| `lsp_index_engineer` | codex / gpt-5.5 | 심볼/참조 분석 | codereview → strategist |
| `codereview_gpt` | codex / gpt-5.5 | GPT 코드리뷰 - SOLID/설계/실무 관점 | codereview → momus |

#### 동적 페르소나 (4명) — 토론 전용

| ID | 프로바이더 / 모델 |
|----|------|
| `gpt_blank_1` | codex / gpt-5.5 |
| `gpt_blank_2` | codex / gpt-5.5 |
| `gemini_blank_1` | agy / gemini-3.1-pro-high |
| `gemini_blank_2` | agy / gemini-3.6-flash-high |

#### 토론 조정자 (1명)

| ID | 프로바이더 / 모델 | 역할 |
|----|------|------|
| `debate_moderator` | agy / gemini-3.1-pro-high | 자동 페르소나 할당, 중간 종합, 최종 정리 |

### MCP 도구 목록

#### 핵심 도구
- `consult_expert` — 전문가 직접 상담 (자동 폴백 포함)
- `route_by_category` — 카테고리 기반 라우팅 (visual, business-logic, research, quick, review, documentation)

#### 워크플로우 도구
- `review_code` — GPT+Gemini 2중 병렬 코드 리뷰 (perspectives로 관점 수 조절, 각 관점 GPT+Gemini 쌍)
- `research_topic` — 주제 리서치 (quick/normal/deep)
- `design_with_experts` — 멀티 전문가 설계 워크플로우

#### 앙상블/토론 도구
- `moderated_debate` — 중재형 토론 (자동/수동 페르소나, 2-4명, repeat_count 지원)
- `ensemble_query` — 일반 앙상블 쿼리 (parallel/synthesize/vote/chain/best_of_n)

#### 백그라운드 실행 도구
- `background_expert_start` — 비동기 전문가 실행
- `background_expert_result` — 작업 결과 조회
- `background_expert_cancel` — 작업 취소
- `background_expert_list` — 작업 목록

#### 코드 인텔리전스 도구
- `lsp_get_definition` / `lsp_get_references` / `lsp_get_hover` / `lsp_workspace_symbols` /
  `lsp_prepare_rename` / `lsp_rename` / `lsp_check_server` — LSP 기반 심볼 분석.
  Claude Code 네이티브에 없는 기능이라 텍스트 검색으로 대체 불가
- `ast_grep_search` / `ast_grep_replace` / `ast_grep_languages` — 구조적 검색/치환

#### 관리 도구
- `llm_router_health` — 서버 상태, 프로바이더 가용성, 한도 차단 현황, 동시 실행 현황

### 모델 오버라이드 (Claude opt-in)

`consult_expert`의 `model` 파라미터로 이번 호출에만 쓸 모델을 지정할 수 있다.
지정한 모델이 체인 0번이 되고 전문가 기본 모델이 뒤에 붙어 한도 소진 시 자동 강등된다.

```
consult_expert(expert: "momus", question: "...", model: "opus")
```

| 값 | 실제 모델 | 주의 |
|---|---|---|
| `opus` / `sonnet` | Claude Opus/Sonnet (claude -p) | **사용자 본인 Claude 구독 한도 소모** |
| `claude-opus-4-6-thinking` | Claude Opus 4.6 (agy 경유) | agy Claude 쿼터가 작다 |
| `gemini-3.7-flash-high` | 최신 Flash | Pro의 60% 시간, UI/구조 논의에 |
| `gemini-3.6-flash-high` | 빠른 Gemini | 간단한 작업에 |
| `gpt-oss-120b-medium` | GPT-OSS 120B (agy 경유) | |

기본 전문가 모델은 codex(GPT)와 agy(Gemini)뿐이다. Claude는 위처럼 명시할 때만 쓰인다.
습관적으로 쓰면 이 MCP의 존재 이유(타 벤더 오프로드)가 무너지므로, 3자 검증이
꼭 필요한 비평 작업에만 쓸 것.

### 사용자 의도 → 스킬 자동 매핑

Claude는 사용자의 자연어 요청을 분석하여 최적의 스킬과 전문가를 자동 선택합니다. 사용자는 슬래시 커맨드나 전문가 이름을 알 필요 없습니다.

#### 명시적 요청 (사용자가 직접 언급)

| 사용자 요청 패턴 | 최적 스킬/도구 | 확인 필요 |
|----------------|--------------|----------|
| "코드 리뷰/봐줘/점검" | `llm-codereview` (review_code) | 아니오 |
| "보안 점검/취약점/해킹 가능성" | `llm-security` (security) | 아니오 |
| "설계/아키텍처/구조 잡아줘" | `llm-design` (design_with_experts) | 예 |
| "비교/A vs B/뭐가 나을까/장단점" | `llm-debate` (moderated_debate) | 예 |
| "테스트 먼저/TDD/테스트 전략" | `llm-tdd` (tester) | 예 |
| "조사/찾아봐/라이브러리 추천" | `llm-research` (research_topic) | 아니오 |
| "깊이 분석/구조 파악/아키텍처 분석" | `llm-analyze` (strategist) | 아니오 |
| "확실해?/다른 AI 확인/검증해줘" | `llm-verify` | 아니오 |
| "전문가한테 물어봐/다른 AI 의견" | `llm-consult` (consult_expert) | 아니오 |
| "문서 작성해줘" | `llm-consult` (strategist) | 아니오 |
| "CI/CD/배포/Docker" | `llm-consult` (devops) | 아니오 |
| "DB 설계/쿼리 최적화" | `llm-consult` (data) | 아니오 |
| "dead code/안쓰는 코드/레거시 잔재" | `llm-consult` (reality_checker) | 아니오 |
| "참조 추적/심볼 분석/LSP" | `llm-consult` (lsp_index_engineer) | 아니오 |

#### 암묵적 요청 (간접적 표현)

| 사용자 표현 | 추론 스킬 | 제안 방식 |
|------------|----------|----------|
| "이거 좀 이상한데" | llm-codereview | 자동 실행 |
| "A안이랑 B안 중에..." | llm-debate | "AI 2-4명으로 몇 번 재질의할지 정해서 전문가 토론할까요?" |
| "이거 안전해?" | llm-security | 자동 실행 |
| "어떻게 만들지..." | llm-design | "전문가 설계부터 진행할까요?" |
| "테스트 없는데..." | llm-tdd | "TDD로 테스트부터 작성할까요?" |
| "이게 맞나?" | llm-verify | 자동 실행 |
| "이전 코드가 아직 남아 있나?" | llm-consult | 자동 실행 |

#### 상황적 자동 제안 (Claude가 작업 중 판단)

| 상황 | 제안 스킬 | 제안 방식 |
|------|----------|----------|
| 구현 중 기술 선택지를 만남 | llm-debate | "AI 수와 재질의 횟수를 정해서 전문가 토론할까요?" |
| 복잡한 기능 구현 요청 | llm-design | "전문가 설계부터 진행할까요?" |
| 코드 수정 완료 후 | llm-validate | 자동 실행 |
| 보안 관련 코드 수정 시 | llm-security | "보안 점검도 할까요?" |

### 스킬 간 충돌 해결 규칙

같은 요청에 여러 스킬이 매칭될 때 우선순위:

1. "코드 리뷰" → `llm-codereview` 우선 (llm-consult보다)
2. "보안 리뷰/점검" → `llm-security` 우선 (llm-codereview보다)
3. "분석" → 코드 분석이면 `llm-analyze`, 기술 비교면 `llm-research`
4. "검토" → 코드면 `llm-codereview`, 설계면 `llm-design`
5. "비교" → `llm-debate` 우선 (llm-research보다)

### 내부 용어 번역 규칙

Claude는 전문가 응답을 사용자에게 전달할 때 내부 용어를 자연어로 번역합니다:

| 내부 용어 | 사용자에게 보여줄 표현 |
|----------|---------------------|
| strategist | GPT 아키텍처 전문가 |
| codereview | Gemini 코드 리뷰 전문가 |
| security | 보안 전문가 |
| tester | 테스트 전문가 |
| devops | DevOps 전문가 |
| data | 데이터베이스 전문가 |
| reality_checker | 현실 검증 전문가 |
| lsp_index_engineer | 코드 인텔리전스 전문가 |
| codereview_gpt | GPT 코드 리뷰 전문가 |
| "폴백 발생" | "자동으로 다른 전문가로 전환되었습니다" |
| "rate limit" | 언급하지 않음 (자동 처리) |

### 워크플로우 가이드

| 워크플로우 | 스킬 | 동작 |
|-----------|------|------|
| 설계 → 구현 | `llm-design` | 전문가 설계 → plan 모드 → 승인 → 구현 |
| 코드 리뷰 → 수정 | `llm-codereview` | 교차 검증 리뷰 → plan 모드 → 승인 → 자동 수정 |
| TDD 개발 | `llm-tdd` | 테스트 전략 → Red-Green-Refactor |
| 코드 검증 | `llm-validate` | 빌드 체크, 변수 참조 확인, 타입 검증 |

### 에러 처리

- **Rate Limit (429)**: 자동으로 폴백 전문가로 전환
- **Timeout**: 폴백 전문가로 전환 (더 빠른 모델)
- **Server Error (5xx)**: 폴백 시도
- **Auth Error (401/403)**: 폴백 불가, 사용자에게 알림
