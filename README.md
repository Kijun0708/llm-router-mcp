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
| MCP 도구 | 109개 |
| 내장 훅 | 38개 |
| AI 전문가 | 17개 |
| 내장 스킬 | 15개 |

### 주요 특징

- **멀티 LLM 협업**: Claude Code(리더) + GPT/Gemini 전문가 협업
- **역할 분담**: GPT(`codex --full-auto`)는 코드 변경 가능, Gemini(`--yolo`)는 리뷰/분석 전용
- **자동 폴백**: Rate limit 발생 시 자동으로 다른 전문가로 전환
- **병렬 위임**: `delegate_task`로 GPT 에이전트 1~3명에게 구현 작업 병렬 위임
- **중재형 토론**: 중재자가 2라운드 패널 토론을 진행하고 최종 요약 반환
- **백그라운드 실행**: 장시간 작업을 백그라운드에서 비동기 실행
- **HUD Statusline**: 실시간 비용, 컨텍스트, 전문가 활동 모니터링

---

## 빠른 시작

### AI로 다른 프로젝트에 적용시키기

다른 프로젝트에서 AI에게 아래처럼 요청하면 이 저장소의 문서를 읽고 플러그인 적용 작업을 진행하도록 유도할 수 있습니다.

예시 프롬프트:

```text
이 저장소의 README.md를 읽고 우리 프로젝트에 llm-router 플러그인을 적용해줘.
프로젝트 CLAUDE.md는 300줄 이내로 유지해야 하니, 공용 사용법 문서는 별도 참조 문서로 연결해줘.
```

AI가 수행해야 하는 적용 작업:
1. 이 저장소의 `README.md`와 `plugin/README.md`를 읽고 설치 방식 확인
2. `llm-router-mcp` 저장소를 clone, `npm install`, `npm run build` 수행
3. 대상 환경의 Claude Code 설정 또는 플러그인 경로에 `plugin/.mcp.json` 기준으로 MCP 연결
4. 대상 프로젝트의 `CLAUDE.md`에 공용 템플릿 구조 반영
5. 프로젝트 `CLAUDE.md`에는 플러그인 사용 시 `plugin/docs/USAGE.md`를 읽으라고 적고, 프로젝트 고유 규칙만 유지
6. 설치 후 `llm_router_health` 등으로 연결 확인

### 1. 설치

```bash
git clone https://github.com/Kijun0708/llm-router-mcp.git
cd llm-router-mcp
npm install
npm run build
```

### 2. CLI 도구 준비

터미널에서 사용할 LLM CLI 도구가 인증된 상태여야 합니다:

- `gemini` — Google Gemini CLI (`--yolo` 모드로 자율 실행, 코드 변경 불가)
- `codex` — OpenAI Codex CLI (`--full-auto` 모드로 자율 실행, 코드 변경 가능)

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

프로젝트별 사용 규칙을 빠르게 붙이고 싶으면 공용 템플릿 [plugin/templates/CLAUDE.md](c:/Users/GJ.PARK/Desktop/auto/custommcp/plugin/templates/CLAUDE.md)를 프로젝트 루트 `CLAUDE.md`의 시작점으로 사용하고, 플러그인 상세 운영 규칙은 [plugin/docs/USAGE.md](c:/Users/GJ.PARK/Desktop/auto/custommcp/plugin/docs/USAGE.md)를 참조하면 됩니다.

---

## 역할 분담

| CLI 도구 | 모드 | 코드 변경 | 용도 | 자동 로드 |
|----------|------|----------|------|----------|
| `codex` (GPT) | `--full-auto` | 가능 | `delegate_task` 전용 구현 작업 | `AGENTS.md` |
| `gemini` (Gemini) | `--yolo` | 불가 | 리뷰/분석 전용 | `GEMINI.md` |

- 두 CLI 도구 모두 파일 경로를 넘기면 직접 읽음 (토큰 절약)
- 2명 이상 전문가 호출 시 반드시 병렬 (`consult_experts_parallel`)

---

## 전문가 시스템

> GPT/Gemini 전문가만 MCP를 통해 호출됩니다. Claude 관련 분석/판단은 Claude Code가 직접 수행합니다.

### 기본 전문가 (5명)

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `strategist` | GPT | 아키텍처 설계, 디버깅 전략 | codereview → momus |
| `codereview` | Gemini Pro + GPT | 통합 코드 리뷰 (perspectives로 GPT+Gemini 병렬 리뷰) | strategist → momus |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | strategist → momus |
| `metis` | GPT | 전략적 계획, 문제 분해 | strategist → codereview |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가 | codereview → strategist |

### 특화 전문가 (7명)

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `security` | GPT | OWASP/CWE 보안 분석 | codereview → strategist |
| `tester` | GPT | TDD/테스트 전략 | codereview → strategist |
| `data` | GPT | DB 설계, 쿼리 최적화 | strategist → codereview |
| `devops` | GPT | CI/CD, Docker, K8s | strategist → codereview |
| `reality_checker` | Gemini Pro | 현실 검증, dead code 탐지 | momus → codereview |
| `lsp_index_engineer` | GPT | 심볼/참조 분석 | codereview → strategist |
| `codereview_gpt` | GPT | GPT 코드리뷰 - SOLID/설계/실무 관점 (READ-ONLY) | codereview → momus |

### 동적 페르소나 전문가 (4명)

토론 시 AI가 자동으로 역할을 부여하는 빈 슬롯 (GPT/Gemini only):

| 전문가 | 모델 |
|--------|------|
| `gpt_blank_1` | GPT |
| `gpt_blank_2` | GPT |
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
| `consult_experts_parallel` | 2명 이상 전문가 병렬 상담 |
| `route_by_category` | 카테고리 기반 자동 라우팅 |
| `ensemble_query` | 여러 전문가 의견 종합 |
| `moderated_debate` | 중재자가 2라운드 패널 토론 진행 |

### 작업 위임

| 도구 | 설명 |
|------|------|
| `delegate_task` | GPT 에이전트 1~3명에게 구현 작업 병렬 위임 (plan → execute → report) |
| `review_code` | 멀티 관점 코드 리뷰 (files 경로 기반, context_docs, 1~3 perspectives 병렬) |

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
| `directory-injector` | AGENTS.md/GEMINI.md 자동 로드 |

---

## 스킬 시스템

15개 내장 스킬이 자연어 요청을 인식하여 자동으로 호출됩니다:

| 스킬 | 설명 | 호출 방식 |
|------|------|----------|
| `llm-plan` | Claude 설계 후 Agent 자체 검토 + GPT 설계 검토를 거쳐 GPT 전체 구현 위임 | 자동 |
| `llm-planAll` | Claude와 GPT가 설계 검토를 거친 뒤 역할을 나눠 동시 작업 | 자동 |
| `llm-codereview` | 9단계 코드 리뷰 파이프라인 | 자동 |
| `llm-validate` | 코드 검증 (빌드/타입/참조) | 자동 |
| `llm-security` | OWASP 보안 감사 | 자동 |
| `llm-research` | 기술 리서치 | 자동 |
| `llm-design` | 설계 워크플로우 | 자동 (확인 후) |
| `llm-tdd` | TDD 워크플로우 | 자동 (확인 후) |
| `llm-background` | 백그라운드 작업 | 자동 (확인 후) |
| `llm-debate` | 중재형 토론 | 자동 (확인 후) |
| `llm-consult` | 전문가 상담 | 자동 |
| `llm-verify` | 교차 검증 | 자동 |
| `llm-analyze` | 깊은 분석 | 자동 |
| `llm-health` | 헬스체크 | 자동 |
| `llm-guide` | 시스템 가이드 | 자동 참조 |

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

## 설계 위임 스킬

`llm-plan`과 `llm-planAll`은 바로 구현에 들어가지 않고, 설계 검토 게이트를 먼저 통과합니다.

### `llm-plan`

흐름:
1. Claude가 plan 모드에서 설계와 GPT 서브태스크를 작성
2. Claude가 `Agent` 도구로 설계 검토를 수행
3. GPT 설계 전문가가 2차 검토
4. 두 검토를 통과하면 사용자 확인 후 GPT 에이전트 1~3명에게 구현 위임
5. 구현 결과를 멀티 관점으로 리뷰

특징:
- Claude는 설계와 리뷰만 수행
- 실제 코드 변경은 GPT만 수행
- 설계 검토 중 이슈가 나오면 plan으로 돌아가 수정 후 재검토

### `llm-planAll`

흐름:
1. Claude가 plan 모드에서 자신의 작업과 GPT 작업을 분리해 설계
2. Claude가 `Agent` 도구로 설계 검토를 수행
3. GPT 설계 전문가가 2차 검토
4. 두 검토를 통과하면 사용자 확인
5. GPT 작업을 먼저 백그라운드 위임하고, Claude도 자기 파일 범위에서 동시 구현
6. 전체 결과를 통합 리뷰

특징:
- Claude와 GPT가 같은 파일을 수정하면 안 됨
- Claude 작업과 GPT 작업은 독립적이어야 함
- 설계 검토 전에는 위임이나 구현을 시작하지 않음

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
| GPT 5.x / Codex | 20분 | `--full-auto` 자율 실행 |
| Gemini Pro | 10분 | `--yolo` 자율 실행 |
| Gemini Flash | 5분 | `--yolo` 자율 실행 |
| 기타 | 1분 | 기본값 |

---

## 프로젝트 구조

```
llm-router-mcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── experts/              # 전문가 정의 (11개 + 토론 전용 슬롯)
│   ├── tools/                # MCP 도구 (109개)
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
├── plugin/skills/            # 내장 스킬 (15개)
└── dist/                     # 빌드 출력
```

---

## CLI 도구 연동

터미널에 설치된 CLI 도구를 `child_process.spawn()`으로 직접 호출합니다.

### 지원 CLI 도구

- `gemini` — Gemini Pro/Flash 모델 (`--yolo` 모드, 리뷰/분석 전용)
- `codex` — GPT 계열 모델 (`--full-auto` 모드, 코드 변경 가능)

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
