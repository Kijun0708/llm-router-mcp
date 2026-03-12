---
name: llm-router-guide
description: "LLM Router 시스템 가이드 - 전문가 목록, 폴백 체인, MCP 도구, 사용 패턴 레퍼런스"
user-invocable: false
---

## LLM Router MCP — 시스템 레퍼런스

이 문서는 LLM Router MCP 시스템의 전체 레퍼런스입니다. Claude가 적절한 전문가와 도구를 선택하는 데 사용합니다.

### 전문가 시스템

#### 핵심 전문가 (8명)

| ID | 모델 | 역할 | 폴백 |
|----|------|------|------|
| `strategist` | GPT | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| `researcher` | Gemini Pro | 문서 분석, 코드베이스 탐색 | reviewer → explorer |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석 | explorer → writer → codex_reviewer |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| `writer` | Gemini Flash | 기술 문서 작성 | explorer → reviewer |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리 | writer → researcher |
| `multimodal` | Gemini Pro | 이미지 분석, 시각적 콘텐츠 | researcher → reviewer |
| `librarian` | Gemini Flash | 지식 관리, 세션 히스토리 | researcher → explorer |

#### 계획/분석 전문가 (3명)

| ID | 모델 | 역할 | 폴백 |
|----|------|------|------|
| `metis` | GPT | 전략적 계획, 문제 분해 | prometheus → strategist |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | reviewer → strategist |
| `prometheus` | GPT | 창의적 솔루션, 혁신 | strategist → metis |

#### 특화 전문가 (7명)

| ID | 모델 | 역할 | 폴백 |
|----|------|------|------|
| `security` | Gemini Pro | OWASP/CWE 보안 분석 | reviewer → strategist |
| `tester` | GPT | TDD/테스트 전략 | reviewer → researcher |
| `data` | GPT | DB 설계, 쿼리 최적화 | strategist → researcher |
| `codex_reviewer` | GPT | GPT 관점 코드 리뷰 | reviewer → strategist |
| `devops` | GPT | CI/CD, Docker, K8s, 인프라 | strategist → researcher |
| `reality_checker` | Gemini Pro | refactor 잔재, dead code, 혼재 경로 현실 검증 | momus → reviewer |
| `lsp_index_engineer` | GPT | 심볼/참조/인덱스 기반 코드 인텔리전스 분석 | reviewer → researcher |

#### 동적 페르소나 (4명) — 토론 전용

| ID | 모델 |
|----|------|
| `gpt_blank_1` | GPT |
| `gpt_blank_2` | GPT |
| `gemini_blank_1` | Gemini Pro |
| `gemini_blank_2` | Gemini Flash |

#### 토론 조정자 (1명)

| ID | 모델 | 역할 |
|----|------|------|
| `debate_moderator` | Gemini Pro | 자동 페르소나 할당, 중간 종합, 최종 정리 |

### MCP 도구 목록

#### 핵심 도구
- `consult_expert` — 전문가 직접 상담 (자동 폴백 포함)
- `route_by_category` — 카테고리 기반 라우팅 (visual, business-logic, research, quick, review, documentation)

#### 워크플로우 도구
- `review_code` — 코드 리뷰 워크플로우 (reviewer + 선택적 설계 관점)
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

#### 관리 도구
- `llm_router_health` — 서버 상태, 캐시 관리, 작업 정리

### 사용자 의도 → 스킬 자동 매핑

Claude는 사용자의 자연어 요청을 분석하여 최적의 스킬과 전문가를 자동 선택합니다. 사용자는 슬래시 커맨드나 전문가 이름을 알 필요 없습니다.

#### 명시적 요청 (사용자가 직접 언급)

| 사용자 요청 패턴 | 최적 스킬/도구 | 확인 필요 |
|----------------|--------------|----------|
| "코드 리뷰/봐줘/점검" | `code-review` (review_code) | 아니오 |
| "보안 점검/취약점/해킹 가능성" | `security-audit` (security) | 아니오 |
| "설계/아키텍처/구조 잡아줘" | `design-workflow` (design_with_experts) | 예 |
| "비교/A vs B/뭐가 나을까/장단점" | `moderated-debate` (moderated_debate) | 예 |
| "테스트 먼저/TDD/테스트 전략" | `tdd-workflow` (tester) | 예 |
| "조사/찾아봐/라이브러리 추천" | `research-topic` (research_topic) | 아니오 |
| "깊이 분석/구조 파악/아키텍처 분석" | `deep-analyze` (strategist) | 아니오 |
| "확실해?/다른 AI 확인/검증해줘" | `cross-verify` | 아니오 |
| "전문가한테 물어봐/다른 AI 의견" | `consult-expert` (consult_expert) | 아니오 |
| "이미지 분석/스크린샷 봐줘" | `consult-expert` (multimodal) | 아니오 |
| "문서 작성해줘" | `consult-expert` (writer) | 아니오 |
| "CI/CD/배포/Docker" | `consult-expert` (devops) | 아니오 |
| "DB 설계/쿼리 최적화" | `consult-expert` (data) | 아니오 |
| "dead code/안쓰는 코드/레거시 잔재" | `consult-expert` (reality_checker) | 아니오 |
| "참조 추적/심볼 분석/LSP" | `consult-expert` (lsp_index_engineer) | 아니오 |

#### 암묵적 요청 (간접적 표현)

| 사용자 표현 | 추론 스킬 | 제안 방식 |
|------------|----------|----------|
| "이거 좀 이상한데" | code-review | 자동 실행 |
| "A안이랑 B안 중에..." | moderated-debate | "AI 2-4명으로 몇 번 재질의할지 정해서 전문가 토론할까요?" |
| "이거 안전해?" | security-audit | 자동 실행 |
| "어떻게 만들지..." | design-workflow | "전문가 설계부터 진행할까요?" |
| "테스트 없는데..." | tdd-workflow | "TDD로 테스트부터 작성할까요?" |
| "이게 맞나?" | cross-verify | 자동 실행 |
| "이전 코드가 아직 남아 있나?" | consult-expert | 자동 실행 |

#### 상황적 자동 제안 (Claude가 작업 중 판단)

| 상황 | 제안 스킬 | 제안 방식 |
|------|----------|----------|
| 구현 중 기술 선택지를 만남 | moderated-debate | "AI 수와 재질의 횟수를 정해서 전문가 토론할까요?" |
| 복잡한 기능 구현 요청 | design-workflow | "전문가 설계부터 진행할까요?" |
| 코드 수정 완료 후 | code-validate | 자동 실행 |
| 보안 관련 코드 수정 시 | security-audit | "보안 점검도 할까요?" |

### 스킬 간 충돌 해결 규칙

같은 요청에 여러 스킬이 매칭될 때 우선순위:

1. "코드 리뷰" → `code-review` 우선 (consult-expert보다)
2. "보안 리뷰/점검" → `security-audit` 우선 (code-review보다)
3. "분석" → 코드 분석이면 `deep-analyze`, 기술 비교면 `research-topic`
4. "검토" → 코드면 `code-review`, 설계면 `design-workflow`
5. "비교" → `moderated-debate` 우선 (research-topic보다)

### 내부 용어 번역 규칙

Claude는 전문가 응답을 사용자에게 전달할 때 내부 용어를 자연어로 번역합니다:

| 내부 용어 | 사용자에게 보여줄 표현 |
|----------|---------------------|
| strategist | GPT 아키텍처 전문가 |
| reviewer | Gemini 코드 리뷰 전문가 |
| codex_reviewer | GPT 코드 분석 전문가 |
| security | 보안 전문가 |
| researcher | Gemini 리서치 전문가 |
| tester | 테스트 전문가 |
| devops | DevOps 전문가 |
| data | 데이터베이스 전문가 |
| reality_checker | 현실 검증 전문가 |
| lsp_index_engineer | 코드 인텔리전스 전문가 |
| "폴백 발생" | "자동으로 다른 전문가로 전환되었습니다" |
| "rate limit" | 언급하지 않음 (자동 처리) |

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
