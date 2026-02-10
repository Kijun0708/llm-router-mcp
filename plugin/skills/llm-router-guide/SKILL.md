---
name: llm-router-guide
description: "LLM Router 시스템 가이드 - 전문가 목록, 폴백 체인, MCP 도구, 사용 패턴 레퍼런스"
user-invocable: false
---

## LLM Router MCP — 시스템 레퍼런스

이 문서는 LLM Router MCP 시스템의 전체 레퍼런스입니다. Claude가 적절한 전문가와 도구를 선택하는 데 사용합니다.

### 전문가 시스템 (23명)

#### 핵심 전문가 (8명)

| ID | 모델 | 역할 | 폴백 |
|----|------|------|------|
| `strategist` | GPT 5.2 | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| `researcher` | Claude Sonnet | 문서 분석, 코드베이스 탐색 | reviewer → explorer |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석 | explorer → writer → codex_reviewer |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| `writer` | Gemini Flash | 기술 문서 작성 | explorer → reviewer |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리 | writer → researcher |
| `multimodal` | GPT 5.2 | 이미지 분석, 시각적 콘텐츠 | researcher → reviewer |
| `librarian` | Claude Sonnet | 지식 관리, 세션 히스토리 | researcher → explorer |

#### 계획/분석 전문가 (3명)

| ID | 모델 | 역할 | 폴백 |
|----|------|------|------|
| `metis` | GPT 5.2 | 전략적 계획, 문제 분해 | prometheus → strategist |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | reviewer → strategist |
| `prometheus` | Claude Sonnet | 창의적 솔루션, 혁신 | strategist → metis |

#### 특화 전문가 (5명)

| ID | 모델 | 역할 | 폴백 |
|----|------|------|------|
| `security` | Claude Sonnet | OWASP/CWE 보안 분석 | reviewer → strategist |
| `tester` | Claude Sonnet | TDD/테스트 전략 | reviewer → researcher |
| `data` | GPT 5.2 | DB 설계, 쿼리 최적화 | strategist → researcher |
| `codex_reviewer` | GPT Codex | GPT 관점 코드 리뷰 | reviewer → strategist |
| `devops` | GPT 5.2 | CI/CD, Docker, K8s, 인프라 | strategist → researcher |

#### 동적 페르소나 (6명) — 토론 전용

| ID | 모델 |
|----|------|
| `gpt_blank_1` | GPT 5.2 |
| `gpt_blank_2` | GPT Codex |
| `claude_blank_1` | Claude Opus |
| `claude_blank_2` | Claude Sonnet |
| `gemini_blank_1` | Gemini Pro |
| `gemini_blank_2` | Gemini Flash |

#### 토론 조정자 (1명)

| ID | 모델 | 역할 |
|----|------|------|
| `debate_moderator` | Claude Sonnet | 토론 주제 분석 → 자동 페르소나 할당 |

### MCP 도구 목록

#### 핵심 도구
- `consult_expert` — 전문가 직접 상담 (자동 폴백 포함)
- `route_by_category` — 카테고리 기반 라우팅 (visual, business-logic, research, quick, review, documentation)

#### 워크플로우 도구
- `review_code` — 코드 리뷰 워크플로우 (reviewer + 선택적 설계 관점)
- `research_topic` — 주제 리서치 (quick/normal/deep)
- `design_with_experts` — 멀티 전문가 설계 워크플로우

#### 앙상블/토론 도구
- `auto_debate` — 자동 페르소나 할당 토론
- `ensemble_query` — 수동 앙상블 쿼리 (debate/parallel/synthesize/vote/chain/best_of_n)

#### 백그라운드 실행 도구
- `background_expert_start` — 비동기 전문가 실행
- `background_expert_result` — 작업 결과 조회
- `background_expert_cancel` — 작업 취소
- `background_expert_list` — 작업 목록

#### 관리 도구
- `llm_router_health` — 서버 상태, 캐시 관리, 작업 정리

### 자동 라우팅 가이드

사용자가 명시적으로 전문가를 지정하지 않을 때:

| 사용자 요청 패턴 | 추천 전문가/도구 |
|----------------|----------------|
| "코드 리뷰해줘" | `review_code` 또는 `reviewer` + `codex_reviewer` |
| "보안 점검해줘" | `security` |
| "아키텍처 설계해줘" | `design_with_experts` 또는 `strategist` |
| "이거 조사해줘" | `research_topic` 또는 `researcher` |
| "성능 분석해줘" | `strategist` (시스템) 또는 `data` (DB) |
| "CI/CD 설정해줘" | `devops` |
| "테스트 전략 세워줘" | `tester` |
| "비교 분석해줘" | `auto_debate` |
| "이 이미지 분석해줘" | `multimodal` |
| "문서 작성해줘" | `writer` |
| "빠르게 알려줘" | `explorer` |

### 워크플로우 가이드

| 워크플로우 | 스킬 | 동작 |
|-----------|------|------|
| 설계 → 구현 | `design-workflow` | 전문가 설계 → plan 모드 → 승인 → 구현 |
| 코드 리뷰 → 수정 | `code-review` | 교차 검증 리뷰 → plan 모드 → 승인 → 자동 수정 |
| TDD 개발 | `tdd-workflow` | 테스트 전략 → Red-Green-Refactor |
| 코드 검증 | `code-validate` | 빌드 체크, 변수 참조 확인, 타입 검증 |

### 에러 처리

- **Rate Limit (429)**: 자동으로 폴백 전문가로 전환
- **Timeout**: 폴백 전문가로 전환 (더 빠른 모델)
- **Server Error (5xx)**: 폴백 시도
- **Auth Error (401/403)**: 폴백 불가, 사용자에게 알림
