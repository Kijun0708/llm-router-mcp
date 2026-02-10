# LLM Router Plugin for Claude Code

GPT, Gemini, Claude 전문가 23명을 통한 코드 리뷰, 보안 감사, 아키텍처 설계, 리서치를 Claude Code에서 자동으로 사용할 수 있는 플러그인입니다.

## 설치

### Step 1: MCP 서버 빌드

```bash
git clone https://github.com/Kijun0708/llm-router-mcp.git
cd llm-router-mcp
npm install
npm run build
```

### Step 2: MCP 서버 경로 설정

`plugin/.mcp.json` 파일에서 `REPLACE_WITH_ABSOLUTE_PATH`를 실제 경로로 변경:

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["c:/your/path/to/llm-router-mcp/dist/index.js"]
    }
  }
}
```

### Step 3: 플러그인 로드

**VSCode 익스텐션** (마켓플레이스 방식):

```
/plugin marketplace add Kijun0708/llm-router-mcp
/plugin install llm-router
```

**터미널 CLI**:

```bash
claude --plugin-dir /path/to/llm-router-mcp/plugin
```

## 사전 요구사항

- **Node.js** 18+
- **CLIProxyAPI** — MCP 서버 시작 시 자동으로 감지/실행됩니다 (`vendor/cliproxy/`에 번들됨)

## 포함된 Skills (12개)

### 자동 호출 (Claude가 상황에 맞게 자동으로 로드)

| 스킬 | 설명 |
|------|------|
| `consult-expert` | 23명의 AI 전문가 상담 라우팅 |
| `code-review` | GPT + Gemini 교차 검증 코드 리뷰 → plan 모드로 수정 계획 |
| `deep-analyze` | 아키텍처/시스템 깊은 분석 |
| `security-audit` | OWASP Top 10 보안 감사 |
| `research-topic` | API/라이브러리/기술 리서치 |
| `cross-verify` | 서로 다른 LLM 교차 검증 |
| `code-validate` | 빌드 체크, 변수 참조 오류, 타입 에러 자동 탐지 |

### 수동 호출 (`/llm-router:스킬명`)

| 스킬 | 사용법 |
|------|-------|
| `ensemble-debate` | `/llm-router:ensemble-debate 마이크로서비스 vs 모놀리스` |
| `design-workflow` | `/llm-router:design-workflow 사용자 인증 시스템` |
| `background-task` | `/llm-router:background-task 아키텍처 분석` |
| `tdd-workflow` | `/llm-router:tdd-workflow 사용자 등록 기능` |

### Claude 전용 (자동 참조)

| 스킬 | 설명 |
|------|------|
| `llm-router-guide` | 전체 시스템 레퍼런스 (전문가 목록, 도구, 폴백 체인) |

## 전문가 목록 (23명)

| 전문가 | 모델 | 전문 분야 |
|--------|------|----------|
| strategist | GPT 5.2 | 아키텍처 설계, 디버깅 전략 |
| researcher | Claude Sonnet | 문서 분석, 기술 리서치 |
| reviewer | Gemini Pro | 코드 리뷰, 보안 분석 |
| frontend | Gemini Pro | UI/UX, 컴포넌트 설계 |
| writer | Gemini Flash | 기술 문서 작성 |
| explorer | Gemini Flash | 빠른 검색, 간단한 쿼리 |
| multimodal | GPT 5.2 | 이미지 분석 |
| librarian | Claude Sonnet | 지식 관리 |
| metis | GPT 5.2 | 전략적 계획, 문제 분해 |
| momus | Gemini Pro | 비판적 분석, 품질 평가 |
| prometheus | Claude Sonnet | 창의적 솔루션 |
| security | Claude Sonnet | OWASP/CWE 보안 분석 |
| tester | Claude Sonnet | TDD/테스트 전략 |
| data | GPT 5.2 | DB 설계, 쿼리 최적화 |
| codex_reviewer | GPT Codex | GPT 관점 코드 리뷰 |
| devops | GPT 5.2 | CI/CD, Docker, K8s |

\+ 동적 페르소나 6명 (토론용) + 토론 조정자 1명

## 사용 예시

플러그인 설치 후 Claude Code에서 자연스럽게 사용:

```
> 이 코드 리뷰해줘
→ code-review 스킬 자동 로드 → reviewer + codex_reviewer 2명이 교차 검증

> 보안 취약점 있는지 확인해줘
→ security-audit 스킬 자동 로드 → security 전문가가 OWASP 기반 분석

> CI/CD 파이프라인 최적화 방법 알려줘
→ consult-expert 스킬 자동 로드 → devops 전문가가 분석

> /llm-router:ensemble-debate React vs Vue vs Svelte
→ 3명의 전문가가 각각 독립 분석 후 토론
```
