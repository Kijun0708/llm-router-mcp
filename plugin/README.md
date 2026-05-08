# LLM Router Plugin for Claude Code

GPT와 Gemini 전문가 팀을 통한 코드 리뷰, 보안 감사, 아키텍처 설계, 리서치를 Claude Code에서 자동으로 사용할 수 있는 플러그인입니다.

## 설치

### AI에게 적용 작업 맡기기

다른 프로젝트에서 AI에게 아래처럼 요청하면 글로벌 CLI 설치와 Claude Code MCP 등록을 수행하도록 유도할 수 있습니다.

예시 프롬프트:

```text
LLM Router MCP를 npm 글로벌 설치 방식으로 설치하고 Claude Code에 등록해줘.
CLAUDE.md는 짧게 유지하고, 플러그인 사용법은 별도 문서를 참조하도록 구성해줘.
```

AI가 해야 할 일:
1. 이 문서와 루트 `README.md`를 읽고 설치 구조 파악
2. `npm install -g llm-router-mcp` 실행
3. `custommcp install`로 Claude Code MCP 설정 자동 등록
4. `custommcp doctor`로 MCP 등록과 `codex`/`gemini` CLI 상태 확인
5. 프로젝트 루트 `CLAUDE.md`를 [plugin/templates/CLAUDE.md](templates/CLAUDE.md) 구조로 반영
6. 플러그인 상세 운영 규칙은 [plugin/docs/USAGE.md](docs/USAGE.md)를 참조하도록 연결
7. `LLM Router 서버 상태 확인해줘` 같은 요청으로 연결 확인

### 사전 요구사항

- **Node.js** 18+
- **Claude Code**
- **CLI 도구** — gemini, codex 가 터미널에 인증된 상태

### Step 1: 글로벌 설치

```bash
npm install -g llm-router-mcp
```

### Step 2: Claude Code 자동 등록

```bash
custommcp install
custommcp doctor
```

`custommcp install`은 `~/.claude/settings.json`을 백업한 뒤 `llm-router-mcp` MCP 서버를 자동 등록합니다. 기존 등록이 있으면 현재 설치 경로로 교체합니다.
전역 설치 단계에서는 레거시 CLIProxy 설정 스크립트를 자동 실행하지 않습니다. Claude Code 등록과 검증은 `custommcp install`과 `custommcp doctor`가 담당합니다.

### Step 3: CLI 도구 인증 확인

터미널에서 사용할 LLM CLI 도구가 인증된 상태인지 확인합니다:

```bash
gemini --version    # Google Gemini CLI
codex --version     # OpenAI Codex CLI
```

### Step 4: 선택 사항 - 플러그인/수동 경로

일반 사용자는 `custommcp install`을 사용하면 됩니다. `plugin/.mcp.json`은 수동 연결이 꼭 필요한 경우에만 참고하는 템플릿입니다.

```bash
claude --plugin-dir /absolute/path/to/llm-router-mcp/plugin
```

기존 Claude 플러그인 마켓플레이스 방식은 레거시/고급 설치 경로로만 유지합니다:

```
/plugin marketplace add Kijun0708/llm-router-mcp
/plugin install llm-router
```

로컬에서 이 저장소를 clone해 개발할 때는 GitHub 저장소 이름과 같은 `llm-router-mcp/` 폴더명을 권장합니다. CLI 명령어 `custommcp`는 기존 사용자 호환성을 위해 유지합니다.

### Step 5: 동작 확인

새 대화에서 다음을 입력하여 MCP 연결을 확인합니다:

```
LLM Router 서버 상태 확인해줘
```

`llm_router_health` 도구가 호출되고 서버 상태가 표시되면 설치 성공입니다.

### Step 6: 프로젝트용 `CLAUDE.md` 준비

프로젝트 루트의 `CLAUDE.md`는 짧게 유지하고, 플러그인 사용법은 공용 문서를 참조하도록 두는 방식을 권장합니다.

권장 구성:

```text
plugin/templates/CLAUDE.md
plugin/docs/USAGE.md
```

- `plugin/templates/CLAUDE.md`: 프로젝트 루트에 복사해 쓰는 짧은 템플릿
- `plugin/docs/USAGE.md`: 플러그인 전체 운영 가이드

즉, 프로젝트 `CLAUDE.md`에는 "이 플러그인을 사용할 때는 `plugin/docs/USAGE.md`를 읽을 것"만 적고, 프로젝트 고유 규칙만 추가하면 됩니다.

### 설치 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| MCP 서버 시작 실패 | MCP 설정 경로가 현재 설치와 다름 | `custommcp install` 재실행 |
| `REPLACE_WITH_ABSOLUTE_PATH_TO_DIST_INDEX_JS` 에러 | 수동 `.mcp.json` 템플릿 경로 미수정 | 일반 설치는 `custommcp install` 사용, 수동 연결 시 실제 `dist/index.js` 절대 경로로 변경 |
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

### 설계 위임

```
설계만 하고 GPT한테 구현 맡겨줘

1. Claude가 plan 모드에서 설계와 GPT 서브태스크 작성
2. Claude가 Agent 도구로 설계 검토 수행
3. GPT 설계 전문가가 2차 검토
4. 검토 통과 후 사용자 승인
5. GPT 에이전트 1~3명에게 병렬 구현 위임
6. 구현 결과를 통합 리뷰
```

### 설계 분업

```
같이 나눠서 구현하자

1. Claude가 plan 모드에서 Claude 작업과 GPT 작업을 분리 설계
2. Claude가 Agent 도구로 설계 검토 수행
3. GPT 설계 전문가가 2차 검토
4. 검토 통과 후 사용자 승인
5. GPT 작업은 먼저 위임하고 Claude도 자기 범위 구현 시작
6. 전체 결과를 통합 리뷰
```

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

## 포함된 Skills

### 자동 호출 (Claude가 자연어 요청을 인식하여 자동 실행)

| 스킬 | 설명 | 비고 |
|------|------|------|
| `llm-plan` | Claude 설계 후 Agent 자체 검토 + GPT 설계 검토를 거쳐 GPT 전체 구현 위임 | 사용자 확인 후 실행 |
| `llm-planAll` | Claude와 GPT가 설계 검토를 거친 뒤 역할을 나눠 동시 구현 | 사용자 확인 후 실행 |
| `llm-codereview` | GPT + Gemini 교차 검증 코드 리뷰 → plan 모드로 수정 계획 | |
| `llm-validate` | 빌드 체크, 변수 참조 오류, 타입 에러 자동 탐지 | |
| `llm-security` | OWASP Top 10 보안 감사 | |
| `llm-research` | API/라이브러리/기술 리서치 | |
| `llm-design` | 다중 전문가 설계 워크플로우 | 사용자 확인 후 실행 |
| `llm-tdd` | TDD 테스트 주도 개발 | 사용자 확인 후 실행 |
| `llm-background` | 백그라운드 비동기 전문가 실행 | 사용자 확인 후 실행 |
| `llm-debate` | 중재형 전문가 토론 및 비교 분석 | 사용자 확인 후 실행 |
| `llm-consult` | AI 전문가 상담 라우팅 | |
| `llm-verify` | 서로 다른 LLM 교차 검증 | |
| `llm-analyze` | 아키텍처/시스템 깊은 분석 | |
| `llm-health` | 서버/환경 상태 점검 | |

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
