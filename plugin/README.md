# LLM Router Plugin for Claude Code

GPT와 Gemini 전문가 팀을 통한 코드 리뷰, 보안 감사, 아키텍처 설계, 리서치를 Claude Code에서 자동으로 사용할 수 있는 플러그인입니다.

## 설치

### 사전 요구사항

- **Node.js** 18+
- **Claude Code** (CLI 또는 VSCode 익스텐션)
- **CLI 도구** — gemini, codex 가 터미널에 인증된 상태

### Step 1: 저장소 클론 및 빌드

```bash
git clone https://github.com/Kijun0708/llm-router-mcp.git
cd llm-router-mcp
npm install
npm run build
```

### Step 2: MCP 서버 경로 설정

`plugin/.mcp.json` 파일에서 `REPLACE_WITH_ABSOLUTE_PATH`를 **자신의 절대 경로**로 변경합니다:

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["c:/your/actual/path/to/llm-router-mcp/dist/index.js"]
    }
  }
}
```

### Step 3: CLI 도구 인증 확인

터미널에서 사용할 LLM CLI 도구가 인증된 상태인지 확인합니다:

```bash
gemini --version    # Google Gemini CLI
codex --version     # OpenAI Codex CLI
```

### Step 4: 플러그인 로드

**터미널 CLI:**

```bash
# 내 프로젝트 디렉토리에서 실행 (플러그인 경로는 절대 경로)
claude --plugin-dir /absolute/path/to/llm-router-mcp/plugin
```

**VSCode 익스텐션:**

```
/plugin marketplace add Kijun0708/llm-router-mcp
/plugin install llm-router
```

### Step 5: 동작 확인

새 대화에서 다음을 입력하여 MCP 연결을 확인합니다:

```
LLM Router 서버 상태 확인해줘
```

`llm_router_health` 도구가 호출되고 서버 상태가 표시되면 설치 성공입니다.

### 설치 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| MCP 서버 시작 실패 | `npm run build` 미실행 | `npm run build` 실행 |
| `REPLACE_WITH_ABSOLUTE_PATH` 에러 | `.mcp.json` 경로 미수정 | 실제 절대 경로로 변경 |
| 전문가 호출 실패 | CLI 도구 미인증 | 각 CLI 도구에서 인증 실행 |
| 스킬이 안 보임 | 이전 세션에서 설정 | 새 대화 시작 (MCP는 세션 시작 시 로드) |

---

## 사용법

### 자연어로 요청 (추천)

슬래시 커맨드를 외울 필요 없이, **자연스럽게 요청**하면 Claude가 적절한 전문가를 자동으로 선택합니다:

```
> 이 코드 리뷰해줘
→ reviewer(Gemini) + codex_reviewer(GPT) 2명이 교차 검증

> 보안 취약점 있는지 확인해줘
→ security 전문가가 OWASP Top 10 기반 분석

> 이 시스템 아키텍처 설계해줘
→ strategist가 설계 → researcher가 리서치 → reviewer가 검토

> CI/CD 파이프라인 최적화 방법 알려줘
→ devops 전문가가 분석

> Redis vs Memcached 비교해줘
→ 중재형 전문가 토론으로 비교 분석
```

### 개발 중 전문가 활용

Claude가 구현하다가 선택지를 제시할 때:

```
Claude: A안(Redis 캐시)과 B안(인메모리 캐시) 중 어떤 걸로 하시겠습니까?

나: 전문가 토론으로 추천받아봐

→ moderated_debate 호출 → 자동 페르소나 배정(또는 수동 지정) → 패널 토론 → 최종 정리
```

### 슬래시 커맨드 (선택 사항)

자연어로 요청하면 자동 호출되지만, 직접 실행할 수도 있습니다:

```
/llm-router:moderated-debate 마이크로서비스 vs 모놀리스
/llm-router:design-workflow 사용자 인증 시스템
/llm-router:tdd-workflow 사용자 등록 기능
/llm-router:background-task 아키텍처 분석
```

---

## 워크플로우

### 설계 → 구현

```
/llm-router:design-workflow 결제 시스템

1. strategist가 아키텍처 설계
2. researcher가 기술 리서치
3. reviewer가 설계안 검토
4. plan 모드 진입 → 구현 계획 작성
5. 사용자 승인 후 구현 시작
```

### 코드 리뷰 → 수정

```
이 코드 리뷰해줘

1. reviewer(Gemini) + codex_reviewer(GPT) 교차 검증
2. 발견된 이슈를 plan 모드로 수정 계획 작성
3. 사용자 승인 후 자동 수정
4. 수정 후 빌드/타입 체크로 검증
```

### TDD 개발

```
/llm-router:tdd-workflow 사용자 등록 기능

1. tester 전문가가 테스트 전략 설계
2. Red: 실패하는 테스트 작성
3. Green: 최소 구현으로 테스트 통과
4. Refactor: 코드 개선
```

### 전문가 토론

```
전문가 토론으로 비교해줘: React vs Vue vs Svelte

1. Claude가 몇 명의 AI(2-4명), 몇 번 재질의할지 확인
2. `moderated_debate`가 자동 페르소나를 배정하거나 수동 페르소나를 사용
3. 각 AI가 1차 의견을 병렬 제출
4. 중재자가 종합 브리프를 만들고 재질의 후 최종 정리
```

---

## 포함된 Skills (12개)

### 자동 호출 (Claude가 자연어 요청을 인식하여 자동 실행)

| 스킬 | 설명 | 비고 |
|------|------|------|
| `consult-expert` | 18명의 AI 전문가 상담 라우팅 | |
| `code-review` | GPT + Gemini 교차 검증 코드 리뷰 → plan 모드로 수정 계획 | |
| `deep-analyze` | 아키텍처/시스템 깊은 분석 | |
| `security-audit` | OWASP Top 10 보안 감사 | |
| `research-topic` | API/라이브러리/기술 리서치 | |
| `cross-verify` | 서로 다른 LLM 교차 검증 | |
| `code-validate` | 빌드 체크, 변수 참조 오류, 타입 에러 자동 탐지 | |
| `design-workflow` | 다중 전문가 설계 워크플로우 | 사용자 확인 후 실행 |
| `moderated-debate` | 중재형 전문가 토론 및 비교 분석 | 사용자 확인 후 실행 |
| `tdd-workflow` | TDD 테스트 주도 개발 | 사용자 확인 후 실행 |
| `background-task` | 백그라운드 비동기 전문가 실행 | 사용자 확인 후 실행 |

### Claude 전용 (자동 참조)

| 스킬 | 설명 |
|------|------|
| `llm-router-guide` | 전체 시스템 레퍼런스 (전문가 목록, 도구, 폴백 체인) |

---

## 전문가 목록

### 핵심 전문가

| 전문가 | 모델 | 전문 분야 | 폴백 |
|--------|------|----------|------|
| strategist | GPT | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| researcher | Gemini Pro | 문서 분석, 기술 리서치 | reviewer → explorer |
| reviewer | Gemini Pro | 코드 리뷰, 보안 분석 | explorer → codex_reviewer |
| frontend | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| writer | Gemini Flash | 기술 문서 작성 | explorer → reviewer |
| explorer | Gemini Flash | 빠른 검색, 간단한 쿼리 | writer → researcher |
| multimodal | Gemini Pro | 이미지 분석 | researcher → reviewer |
| librarian | Gemini Flash | 지식 관리 | researcher → explorer |

### 계획/분석 전문가

| 전문가 | 모델 | 전문 분야 | 폴백 |
|--------|------|----------|------|
| metis | GPT | 전략적 계획, 문제 분해 | prometheus → strategist |
| momus | Gemini Pro | 비판적 분석, 품질 평가 | reviewer → strategist |
| prometheus | GPT | 창의적 솔루션 | strategist → metis |

### 특화 전문가

| 전문가 | 모델 | 전문 분야 | 폴백 |
|--------|------|----------|------|
| security | Gemini Pro | OWASP/CWE 보안 분석 | reviewer → strategist |
| tester | GPT | TDD/테스트 전략 | reviewer → researcher |
| data | GPT | DB 설계, 쿼리 최적화 | strategist → researcher |
| codex_reviewer | GPT | GPT 관점 코드 리뷰 | reviewer → strategist |
| devops | GPT | CI/CD, Docker, K8s | strategist → researcher |
| reality_checker | Gemini Pro | refactor 잔재, dead code, 혼재 경로 검증 | momus → reviewer |
| lsp_index_engineer | GPT | 참조/심볼/인덱스 기반 분석 | reviewer → researcher |

### 토론 전용

- 동적 페르소나 4명 (`gpt_blank_1`, `gpt_blank_2`, `gemini_blank_1`, `gemini_blank_2`) — 토론 시 자동 또는 수동 할당
- 토론 중재자 1명 (`debate_moderator`) — 페르소나 배정, 중간 종합, 최종 정리

---

## 에러 처리

| 에러 유형 | 동작 |
|----------|------|
| Rate Limit (429) | 자동으로 폴백 전문가로 전환 |
| Timeout | 더 빠른 모델의 폴백 전문가로 전환 |
| Server Error (5xx) | 폴백 시도 |
| Auth Error (401/403) | 폴백 불가, 사용자에게 알림 |
