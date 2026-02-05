# LLM Router MCP

Claude Code를 팀 리더로, GPT/Gemini/Claude를 전문가 팀으로 활용하는 MCP 서버

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

## 개요

LLM Router MCP는 Claude Code가 팀 리더 역할을 하며, 특정 작업에 맞는 AI 전문가에게 업무를 위임하는 MCP 서버입니다.

| 항목 | 수량 |
|------|------|
| MCP 도구 | 108개 |
| 내장 훅 | 38개 |
| AI 전문가 | 22개 |
| 내장 스킬 | 10개 |

### 주요 특징

- **멀티 LLM 협업**: GPT 5.2, Claude Opus/Sonnet, Gemini Pro/Flash를 역할별로 활용
- **자동 폴백**: Rate limit 발생 시 자동으로 다른 전문가로 전환
- **동적 토론**: AI가 자동으로 페르소나를 설계하여 토론 진행
- **백그라운드 실행**: 장시간 작업을 백그라운드에서 비동기 실행
- **HUD Statusline**: 실시간 비용, 컨텍스트, 전문가 활동 모니터링

---

## 빠른 시작

### 1. 설치

```bash
git clone https://github.com/Kijun0708/llm-router-mcp.git
cd llm-router-mcp
npm install
npm run build
```

### 2. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일 편집:
```bash
CLIPROXY_URL=http://127.0.0.1:8319  # CLIProxyAPI 포트
EXA_API_KEY=your_exa_api_key        # 선택: 웹 검색
CONTEXT7_API_KEY=your_key           # 선택: 라이브러리 문서
```

### 3. Claude Code 연동

`~/.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["/path/to/llm-router-mcp/dist/index.js"],
      "env": {
        "CLIPROXY_URL": "http://127.0.0.1:8319"
      }
    }
  }
}
```

### 4. CLIProxyAPI 실행

```bash
cd vendor/cliproxy
./cli-proxy-api.exe -c config.yaml
```

### 5. AI 프로바이더 인증

브라우저에서 `http://127.0.0.1:8319` 접속 후 관리 패널에서 인증

---

## 전문가 시스템

### 기본 전문가 (11명)

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `strategist` | GPT 5.2 | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| `researcher` | Claude Sonnet | 문서 분석, 코드베이스 탐색 | reviewer → explorer |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석 | explorer → codex_reviewer |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| `writer` | Gemini Flash | 기술 문서 작성 | explorer |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리 | - |
| `multimodal` | GPT 5.2 | 이미지 분석, 시각적 콘텐츠 | strategist → researcher |
| `librarian` | Claude Sonnet | 지식 관리, 세션 히스토리 | researcher → explorer |
| `metis` | GPT 5.2 | 전략적 계획, 문제 분해 | strategist → researcher |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | reviewer → explorer |
| `prometheus` | Claude Sonnet | 창의적 솔루션, 혁신적 접근 | strategist → researcher |

### 특화 전문가 (4명)

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `security` | Claude Sonnet | OWASP/CWE 보안 취약점 분석 | reviewer → strategist |
| `tester` | Claude Sonnet | TDD/테스트 전략 설계 | reviewer → researcher |
| `data` | GPT 5.2 | DB 설계, 쿼리 최적화 | strategist → researcher |
| `codex_reviewer` | GPT Codex | GPT 관점 코드 리뷰 | reviewer → strategist |

### 동적 페르소나 전문가 (6명)

토론 시 AI가 자동으로 역할을 부여하는 빈 슬롯:

| 전문가 | 모델 |
|--------|------|
| `gpt_blank_1` | GPT 5.2 |
| `gpt_blank_2` | GPT Codex |
| `claude_blank_1` | Claude Opus |
| `claude_blank_2` | Claude Sonnet |
| `gemini_blank_1` | Gemini Pro |
| `gemini_blank_2` | Gemini Flash |

### 토론 조정자 (1명)

| 전문가 | 모델 | 역할 |
|--------|------|------|
| `debate_moderator` | Claude Sonnet | 토론 주제 분석 → 자동 페르소나 할당 |

---

## 핵심 도구

### 전문가 상담

| 도구 | 설명 |
|------|------|
| `consult_expert` | 전문가에게 직접 질문 |
| `route_by_category` | 카테고리 기반 자동 라우팅 |
| `ensemble_query` | 여러 전문가 의견 종합 |
| `auto_debate` | AI가 자동으로 페르소나 설계 후 토론 |
| `dynamic_debate` | 수동 페르소나 지정 토론 |

### 백그라운드 실행

| 도구 | 설명 |
|------|------|
| `background_expert_start` | 비동기 전문가 실행 시작 |
| `background_expert_result` | 작업 결과 확인 |
| `background_expert_cancel` | 실행 중인 작업 취소 |
| `background_expert_list` | 전체 백그라운드 작업 목록 |

### 워크플로우

| 도구 | 설명 |
|------|------|
| `design_with_experts` | 다중 전문가 설계 워크플로우 |
| `review_code` | 코드 리뷰 워크플로우 |
| `research_topic` | 주제 연구 (quick/normal/deep) |

### 코드 분석

| 도구 | 설명 |
|------|------|
| `lsp_get_definition` | 심볼 정의 위치 |
| `lsp_get_references` | 심볼 참조 찾기 |
| `lsp_get_hover` | 타입/문서 정보 |
| `ast_grep_search` | AST 패턴 검색 |
| `ast_grep_replace` | AST 패턴 치환 |

### Git

| 도구 | 설명 |
|------|------|
| `git_atomic_commit` | 자동 그룹화 커밋 |
| `git_history_search` | 커밋 히스토리 검색 |
| `git_rebase_planner` | 리베이스 계획 |
| `git_branch_analysis` | 브랜치 분석 |

### 기타

| 도구 | 설명 |
|------|------|
| `web_search` | Exa 웹 검색 |
| `get_library_docs` | 라이브러리 문서 조회 |
| `playwright_screenshot` | 웹 페이지 캡처 |
| `session_search` | 세션 히스토리 검색 |

---

## 훅 시스템

38개 내장 훅으로 동작 확장:

### 핵심 훅

| 훅 | 설명 |
|----|------|
| `sisyphus-orchestrator` | 작업 완료 강제 오케스트레이션 |
| `todo-continuation-enforcer` | TODO 완료 강제 |
| `think-mode` | 확장 사고 모드 |
| `rules-injector` | `.claude/rules/` 규칙 자동 주입 |
| `magic-keywords` | 매직 키워드 감지 |

### 안정성 훅

| 훅 | 설명 |
|----|------|
| `session-recovery` | 세션 에러 자동 복구 |
| `edit-error-recovery` | 편집 에러 복구 |
| `preemptive-compaction` | 선제적 컨텍스트 압축 |
| `context-window-monitor` | 컨텍스트 사용량 모니터링 |
| `doom-loop-detector` | 반복 패턴 감지 |
| `rate-limit-handler` | Rate limit 자동 처리 |

### UX 훅

| 훅 | 설명 |
|----|------|
| `auto-update-checker` | 버전 업데이트 알림 |
| `task-toast-manager` | 작업 완료 알림 |
| `hud-state-updater` | HUD 상태 업데이트 |
| `directory-injector` | AGENTS.md/README.md 자동 로드 |

---

## 스킬 시스템

10개 내장 스킬이 적합한 전문가에게 자동 라우팅:

| 스킬 | 전문가 | 용도 |
|------|--------|------|
| `deep-analyze` | strategist | 아키텍처/시스템 심층 분석 |
| `quick-search` | explorer | 빠른 파일/패턴 검색 |
| `code-review` | reviewer | 코드 리뷰 및 품질 분석 |
| `security-audit` | reviewer | 보안 취약점 감사 |
| `doc-writer` | writer | 기술 문서 작성 |
| `api-explore` | researcher | API/라이브러리 탐색 |
| `ui-design` | frontend | UI/UX 설계 |
| `git-workflow` | strategist | Git 전략 관리 |
| `test-runner` | researcher | 테스트 실행/분석 |
| `ensemble-debate` | (멀티) | 다중 전문가 토론 |

---

## 동적 토론

### auto_debate (자동 페르소나)

AI가 주제에 맞는 역할을 자동 설계:

```
auto_debate({
  topic: "주식 손절 타이밍 전략",
  participant_count: 3,
  max_rounds: 2
})
```

→ AI가 "기술적 분석가", "펀더멘털 분석가", "리스크 관리자" 등 역할 설계 후 토론

### dynamic_debate (수동 페르소나)

```
dynamic_debate({
  topic: "마이크로서비스 vs 모놀리식",
  participants: [
    { expert: "gpt_blank_1", persona: "마이크로서비스 옹호자" },
    { expert: "claude_blank_1", persona: "모놀리식 옹호자" },
    { expert: "gemini_blank_1", persona: "중립적 아키텍트" }
  ],
  max_rounds: 2
})
```

---

## Think Mode

복잡한 문제에 대한 깊은 분석:

| 키워드 | 레벨 | 토큰 예산 |
|--------|------|----------|
| `think`, `생각` | normal | 10,000 |
| `think hard`, `깊이 생각` | deep | 20,000 |
| `ultrathink` | extreme | 50,000 |

---

## 모델별 타임아웃

| 모델 | 타임아웃 | 이유 |
|------|---------|--------|
| GPT 5.x / Codex | 5분 | Deep thinking |
| Claude Opus | 3분 | Deep thinking |
| Claude Sonnet/Haiku | 2분 | 일반 추론 |
| Gemini | 1.5분 | 빠른 응답 |
| 기타 | 1분 | 기본값 |

---

## 프로젝트 구조

```
llm-router-mcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── experts/              # 전문가 정의 (22개)
│   ├── tools/                # MCP 도구 (108개)
│   ├── hooks/builtin/        # 내장 훅 (38개)
│   ├── hud/                  # HUD 상태 관리
│   ├── features/             # 기능 모듈
│   │   ├── skill-system/     # 스킬 시스템
│   │   ├── mcp-loader/       # MCP 서버 관리
│   │   └── boulder-state/    # 볼더 상태 관리
│   ├── services/             # 핵심 서비스
│   │   ├── expert-router.ts  # 전문가 라우팅
│   │   ├── cliproxy-client.ts # CLIProxyAPI 클라이언트
│   │   └── background-manager.ts # 백그라운드 작업 관리
│   └── utils/                # 유틸리티
├── skills/                   # 내장 스킬 (10개)
├── vendor/cliproxy/          # CLIProxyAPI 바이너리
└── dist/                     # 빌드 출력
```

---

## CLIProxyAPI

LLM Router MCP는 [CLIProxyAPI](https://github.com/anthropics/cli-proxy-api)를 통해 여러 LLM 프로바이더에 연결합니다.

### 지원 프로바이더

- **Gemini**: OAuth 또는 API Key
- **Claude**: OAuth 또는 API Key
- **OpenAI Codex**: OAuth
- **Qwen**: OAuth
- **OpenAI 호환**: OpenRouter 등

### 인증 파일 위치

```
~/.cli-proxy-api/
├── claude-{email}.json
├── codex-{email}.json
└── {email}-gen-lang-client-{id}.json
```

### 원격 배포

Linux 서버에 배포 시:
1. Linux 바이너리 다운로드 (`linux-amd64` 또는 `linux-arm64`)
2. 로컬 인증 파일을 서버로 복사
3. config.yaml에서 `allow-remote: true` 설정

---

## 문제 해결

### CLIProxyAPI 연결 실패

```bash
# 1. CLIProxyAPI 실행 확인
tasklist | grep cli-proxy

# 2. 포트 확인
cat vendor/cliproxy/config.yaml | grep port

# 3. 환경변수 설정
CLIPROXY_URL=http://127.0.0.1:8319
```

### 인증 문제

```
auth_status     # 현재 인증 상태 확인
auth_gemini     # Gemini 재인증
auth_claude     # Claude 재인증
auth_gpt        # GPT 재인증
```

### Rate Limit

시스템이 자동으로:
1. HTTP 429 및 에러 메시지 패턴 감지
2. 모델을 제한 상태로 표시
3. 폴백 전문가로 라우팅
4. 지수 백오프로 재시도

---

## 영감을 받은 프로젝트

- [oh-my-opencode](https://github.com/nicepkg/oh-my-opencode)
- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)

---

## 라이선스

MIT
