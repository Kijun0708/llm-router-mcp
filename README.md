# LLM Router MCP

Claude Code를 팀 리더로, GPT/Gemini를 전문가 팀으로 활용하는 MCP 서버

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)

## 개요

LLM Router MCP는 Claude Code가 팀 리더 역할을 하며, GPT/Gemini 전문가에게 업무를 위임하는 MCP 서버입니다.

> **Note**: Claude 모델은 MCP를 통해 호출되지 않습니다. Claude Code가 직접 Claude 역할을 수행하므로, 중첩 세션 문제를 피하면서 진정한 다중 LLM 협업이 가능합니다.

| 항목 | 수량 |
|------|------|
| MCP 도구 | 108개 |
| 내장 훅 | 38개 |
| AI 전문가 | 19개 |
| 내장 스킬 | 12개 |

### 주요 특징

- **멀티 LLM 협업**: Claude Code(리더) + GPT 5.4 + Gemini Pro/Flash
- **자동 폴백**: Rate limit 발생 시 자동으로 다른 전문가로 전환
- **중재형 토론**: 중재자가 2라운드 패널 토론을 진행하고 최종 요약 반환
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

### 2. CLI 도구 준비

터미널에서 사용할 LLM CLI 도구가 인증된 상태여야 합니다:

- `gemini` — Google Gemini CLI
- `codex` — OpenAI Codex CLI

> **Note**: `claude` CLI는 필요하지 않습니다. Claude Code가 직접 Claude 역할을 수행합니다.

### 3. 환경변수 설정 (선택)

```bash
cp .env.example .env
```

`.env` 파일 편집:
```bash
EXA_API_KEY=your_exa_api_key        # 선택: 웹 검색
CONTEXT7_API_KEY=your_key           # 선택: 라이브러리 문서
```

### 4. Claude Code 연동

`~/.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["/path/to/llm-router-mcp/dist/index.js"]
    }
  }
}
```

---

## 전문가 시스템

> GPT/Gemini 전문가만 MCP를 통해 호출됩니다. Claude 관련 분석/판단은 Claude Code가 직접 수행합니다.

### 기본 전문가 (11명)

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `strategist` | GPT 5.4 | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| `researcher` | Gemini Pro | 문서 분석, 코드베이스 탐색 | reviewer → explorer |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석 | explorer → codex_reviewer |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| `writer` | Gemini Flash | 기술 문서 작성 | explorer |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리 | - |
| `multimodal` | Gemini Pro | 이미지 분석, 시각적 콘텐츠 | strategist → researcher |
| `librarian` | Gemini Flash | 지식 관리, 세션 히스토리 | researcher → explorer |
| `metis` | GPT 5.4 | 전략적 계획, 문제 분해 | strategist → researcher |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | reviewer → explorer |
| `prometheus` | GPT 5.4 | 창의적 솔루션, 혁신적 접근 | strategist → metis |

### 특화 전문가 (7명)

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `security` | Gemini Pro | OWASP/CWE 보안 취약점 분석 | reviewer → strategist |
| `tester` | GPT 5.4 | TDD/테스트 전략 설계 | reviewer → researcher |
| `data` | GPT 5.4 | DB 설계, 쿼리 최적화 | strategist → researcher |
| `codex_reviewer` | GPT 5.4 | GPT 관점 코드 리뷰 | reviewer → strategist |
| `devops` | GPT 5.4 | CI/CD, Docker, K8s, 인프라 자동화 | strategist → researcher |
| `reality_checker` | Gemini Pro | refactor 잔재, dead code, 혼재 경로 현실 검증 | momus → reviewer |
| `lsp_index_engineer` | GPT 5.4 | 참조/심볼/인덱스 기반 코드 인텔리전스 분석 | reviewer → researcher |

### 동적 페르소나 전문가 (4명)

토론 시 AI가 자동으로 역할을 부여하는 빈 슬롯 (GPT/Gemini only):

| 전문가 | 모델 |
|--------|------|
| `gpt_blank_1` | GPT 5.4 |
| `gpt_blank_2` | GPT 5.4 |
| `gemini_blank_1` | Gemini Pro |
| `gemini_blank_2` | Gemini Flash |

### 토론 중재자 (1명)

| 전문가 | 모델 | 역할 |
|--------|------|------|
| `debate_moderator` | Gemini Pro | 패널 토론 중재 및 최종 요약 |

---

## 핵심 도구

### 전문가 상담

| 도구 | 설명 |
|------|------|
| `consult_expert` | 전문가에게 직접 질문 |
| `route_by_category` | 카테고리 기반 자동 라우팅 |
| `ensemble_query` | 여러 전문가 의견 종합 |
| `moderated_debate` | 중재자가 2라운드 패널 토론 진행 |

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

12개 내장 스킬이 자연어 요청을 인식하여 자동으로 호출됩니다:

| 스킬 | 설명 | 호출 방식 |
|------|------|----------|
| `consult-expert` | 18명의 AI 전문가 상담 라우팅 | 자동 |
| `code-review` | GPT + Gemini 교차 검증 코드 리뷰 | 자동 |
| `deep-analyze` | 아키텍처/시스템 깊은 분석 | 자동 |
| `security-audit` | OWASP Top 10 보안 감사 | 자동 |
| `research-topic` | API/라이브러리/기술 리서치 | 자동 |
| `cross-verify` | 서로 다른 LLM 교차 검증 | 자동 |
| `code-validate` | 빌드/타입/참조 오류 자동 탐지 | 자동 |
| `design-workflow` | 다중 전문가 설계 워크플로우 | 자동 (확인 후) |
| `moderated-debate` | 멀티 전문가 토론 및 비교 분석 | 자동 (확인 후) |
| `tdd-workflow` | TDD 테스트 주도 개발 | 자동 (확인 후) |
| `background-task` | 백그라운드 비동기 전문가 실행 | 자동 (확인 후) |
| `llm-router-guide` | 시스템 레퍼런스 (Claude 전용) | 자동 참조 |

---

## 중재형 토론

중재자가 안건을 모든 참여자에게 병렬로 던지고, 1차 응답을 종합한 뒤 다시 한 번 병렬 재질의합니다.

```
moderated_debate({
  agenda: "마이크로서비스 vs 모놀리식",
  participant_count: 3,
  repeat_count: 1
})
```

직접 페르소나를 주고 싶으면 `participants`를 넘기고, 아니면 `participant_count`(2-4)만 넘겨 자동 페르소나 배정을 사용합니다.

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
| Gemini Pro | 2분 | 일반 추론 |
| Gemini Flash | 1.5분 | 빠른 응답 |
| 기타 | 1분 | 기본값 |

---

## 프로젝트 구조

```
llm-router-mcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── experts/              # 전문가 정의 (19개 + 토론 전용 슬롯)
│   ├── tools/                # MCP 도구 (108개)
│   ├── hooks/builtin/        # 내장 훅 (38개)
│   ├── hud/                  # HUD 상태 관리
│   ├── features/             # 기능 모듈
│   │   ├── skill-system/     # 스킬 시스템
│   │   ├── mcp-loader/       # MCP 서버 관리
│   │   └── boulder-state/    # 볼더 상태 관리
│   ├── services/             # 핵심 서비스
│   │   ├── expert-router.ts  # 전문가 라우팅
│   │   ├── cliproxy-client.ts # CLI 도구 오케스트레이터
│   │   ├── providers/         # CLI 프로바이더 (Gemini/Codex only)
│   │   └── background-manager.ts # 백그라운드 작업 관리
│   └── utils/                # 유틸리티
├── skills/                   # 내장 스킬 (10개)
└── dist/                     # 빌드 출력
```

---

## CLI 도구 연동

터미널에 설치된 CLI 도구를 `child_process.spawn()`으로 직접 호출합니다.

### 지원 CLI 도구

- `gemini` — Gemini Pro/Flash 모델
- `codex` — GPT 5.4 모델

> **Note**: `claude` CLI는 사용하지 않습니다. Claude Code가 직접 Claude 역할을 수행합니다.

### 사전 요구사항

각 CLI 도구가 터미널에서 인증 완료된 상태여야 합니다.
CLI 도구 경로는 `.env`에서 설정 가능합니다 (PATH에 있으면 생략 가능):

```bash
CLI_GEMINI_PATH=gemini
CLI_CODEX_PATH=codex
```

---

## 문제 해결

### CLI 도구 연결 실패

```bash
# CLI 도구 설치 확인
gemini --version
codex --version

# 인증 상태 확인
gemini auth status
codex auth status
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
