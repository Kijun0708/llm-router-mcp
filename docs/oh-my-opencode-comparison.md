# oh-my-opencode vs custommcp 비교 분석

## 1. 프로젝트 개요

| 항목 | oh-my-opencode | custommcp (현재 프로젝트) |
|------|----------------|-------------------------|
| 버전 | 3.0.0-beta.5 | 2.0.0 |
| 런타임 | Bun (ESM) | Node.js 18+ |
| 언어 | TypeScript | TypeScript |
| 핵심 철학 | Sisyphus - 작업 완료 강제 | 전문가 라우팅 시스템 |
| 레포지토리 | https://github.com/Kijun0708/oh-my-opencode | - |

---

## 2. 기능 비교표

### 2.1 전문가/에이전트 시스템

| 기능 | oh-my-opencode | custommcp | 상태 |
|------|----------------|-----------|------|
| 에이전트 수 | 7개 | 11개 | ✅ 더 많음 |
| Sisyphus (메인 오케스트레이터) | ✅ | ❌ | ❌ 없음 |
| Oracle (GPT) | ✅ | strategist | ✅ 유사 |
| Librarian | ✅ | ✅ | ✅ 동일 |
| Explorer | ✅ | ✅ | ✅ 동일 |
| Frontend Engineer | ✅ | ✅ | ✅ 동일 |
| Document Writer | ✅ | writer | ✅ 유사 |
| Multimodal | ✅ | ✅ | ✅ 동일 |
| Metis (전략적 계획) | ❌ | ✅ | ✅ 추가 |
| Momus (비판적 분석) | ❌ | ✅ | ✅ 추가 |
| Prometheus (창의적 솔루션) | ❌ | ✅ | ✅ 추가 |

#### oh-my-opencode 에이전트 모델 할당

| Agent | Model |
|-------|-------|
| Sisyphus | anthropic/claude-opus-4-5 |
| Oracle | openai/gpt-5.2 |
| Librarian | opencode/glm-4.7-free |
| Explore | opencode/grok-code |
| Frontend-ui-ux-engineer | google/gemini-3-pro-preview |
| Document-writer | google/gemini-3-pro-preview |
| Multimodal-looker | google/gemini-3-flash |

### 2.2 훅 시스템

| 훅 | oh-my-opencode | custommcp | 상태 |
|----|----------------|-----------|------|
| 훅 수 | 23+ 폴더 | 38개 내장 | ✅ 더 많음 |
| context-window-monitor | ✅ | ✅ | ✅ |
| todo-continuation-enforcer | ✅ | ❌ | ⚠️ 없음 |
| sisyphus-orchestrator | ✅ | ❌ | ⚠️ 없음 |
| think-mode | ✅ | ❌ | ⚠️ 없음 |
| thinking-block-validator | ✅ | ❌ | ⚠️ 없음 |
| preemptive-compaction | ✅ | ❌ | ⚠️ 없음 |
| ralph-loop | ✅ | ✅ | ✅ |
| rules-injector | ✅ | ❌ | ⚠️ 없음 |
| directory-agents-injector | ✅ | directory-injector | ✅ 유사 |
| comment-checker | ✅ | ✅ | ✅ |
| edit-error-recovery | ✅ | ✅ | ✅ |
| session-recovery | ✅ | ✅ | ✅ |
| keyword-detector | ✅ | ✅ | ✅ |
| auto-update-checker | ✅ | ❌ | ⚠️ 없음 |
| background-notification | ✅ | ❌ | ⚠️ 없음 |
| task-resume-info | ✅ | ❌ | ⚠️ 없음 |

#### oh-my-opencode 훅 목록 (23개 폴더)

```
src/hooks/
├── agent-usage-reminder
├── anthropic-context-window-limit-recovery
├── auto-slash-command
├── auto-update-checker
├── background-compaction
├── background-notification
├── claude-code-hooks
├── comment-checker
├── compaction-context-injector
├── directory-agents-injector
├── directory-readme-injector
├── edit-error-recovery
├── empty-message-sanitizer
├── interactive-bash-session
├── keyword-detector
├── non-interactive-env
├── preemptive-compaction
├── prometheus-md-only
├── ralph-loop
├── rules-injector
├── session-recovery
├── sisyphus-orchestrator
├── start-work
├── task-resume-info
├── think-mode
└── thinking-block-validator
```

### 2.3 MCP/도구 시스템

| 도구 | oh-my-opencode | custommcp | 상태 |
|------|----------------|-----------|------|
| 총 도구 수 | 13개 폴더 | 118개 도구 | ✅ 훨씬 많음 |
| ast-grep | ✅ | ✅ | ✅ |
| lsp | ✅ | ✅ | ✅ |
| interactive-bash | ✅ | ✅ | ✅ |
| background-task | ✅ | ✅ | ✅ |
| skill/skill-mcp | ✅ | ✅ | ✅ |
| session-manager | ✅ | session-transcript | ✅ 유사 |
| call-omo-agent | ✅ | ❌ | ❌ 없음 |
| sisyphus-task | ✅ | ❌ | ❌ 없음 |
| glob/grep 자체 구현 | ✅ | ❌ (MCP 의존) | ⚠️ 다름 |
| look-at (멀티모달) | ✅ | multimodal expert | ✅ 유사 |
| slashcommand | ✅ | ❌ | ⚠️ 없음 |

#### oh-my-opencode 도구 목록 (13개 폴더)

```
src/tools/
├── ast-grep
├── background-task
├── call-omo-agent
├── glob
├── grep
├── interactive-bash
├── look-at
├── lsp
├── session-manager
├── sisyphus-task
├── skill
├── skill-mcp
└── slashcommand
```

### 2.4 Features 모듈

| 기능 | oh-my-opencode | custommcp | 상태 |
|------|----------------|-----------|------|
| boulder-state | ✅ | ✅ | ✅ |
| background-agent | ✅ | background-manager | ✅ 유사 |
| builtin-commands | ✅ | command-discovery | ✅ 유사 |
| builtin-skills | ✅ | skill-system | ✅ 유사 |
| claude-code-agent-loader | ✅ | ❌ | ❌ **핵심 누락** |
| claude-code-command-loader | ✅ | ❌ | ❌ **핵심 누락** |
| claude-code-mcp-loader | ✅ | mcp-loader | ✅ 유사 |
| claude-code-plugin-loader | ✅ | ❌ | ❌ **핵심 누락** |
| claude-code-session-state | ✅ | ❌ | ⚠️ 없음 |
| context-injector | ✅ | ✅ | ✅ |
| hook-message-injector | ✅ | ❌ | ⚠️ 없음 |
| skill-mcp-manager | ✅ | ✅ | ✅ |
| task-toast-manager | ✅ | ❌ | ⚠️ 없음 |

#### oh-my-opencode Features 목록 (14개)

```
src/features/
├── background-agent
├── boulder-state
├── builtin-commands
├── builtin-skills
├── claude-code-agent-loader
├── claude-code-command-loader
├── claude-code-mcp-loader
├── claude-code-plugin-loader
├── claude-code-session-state
├── context-injector
├── hook-message-injector
├── opencode-skill-loader
├── skill-mcp-manager
└── task-toast-manager
```

### 2.5 외부 API 통합

| API | oh-my-opencode | custommcp | 상태 |
|-----|----------------|-----------|------|
| Context7 | ✅ | ✅ | ✅ |
| Grep.app | ✅ | ✅ | ✅ |
| Exa (웹 검색) | ✅ | ✅ | ✅ |
| Playwright | ❌ | ✅ | ✅ 추가 기능 |

### 2.6 인프라/설치

| 기능 | oh-my-opencode | custommcp | 상태 |
|------|----------------|-----------|------|
| CLI 설치 (bunx/npx) | ✅ | ❌ | ❌ **없음** |
| 플러그인 시스템 | ✅ (@opencode-ai/plugin) | ❌ | ❌ **없음** |
| Google OAuth | ✅ (@openauthjs/openauth) | ❌ | ⚠️ 없음 |
| OpenCode SDK 통합 | ✅ | ❌ | ⚠️ 없음 |
| 다국어 README | ✅ (KO, JA, ZH-CN) | ❌ | ⚠️ 없음 |
| 자동 업데이트 | ✅ | ❌ | ⚠️ 없음 |

---

## 3. oh-my-opencode 핵심 기능 분석

### 3.1 Sisyphus 오케스트레이터

oh-my-opencode의 핵심 철학인 "작업 완료 강제" 메커니즘.

#### 핵심 아키텍처

**위임 기반 오케스트레이션** 패턴:
- 오케스트레이터는 직접 구현하지 않고 서브에이전트에게 작업 위임
- 검증과 조율 역할 수행

#### 작업 완료 강제 메커니즘

1. **볼더(Boulder) 상태 추적**
   - 활성 플랜과 진행도를 파일 시스템에 저장
   - 세션이 유휴 상태가 될 때마다 "남은 작업" 감지
   - 자동으로 계속 진행하도록 프롬프트 주입

2. **강제 지속성**
   ```
   "[SYSTEM REMINDER - BOULDER CONTINUATION]
   You have an active work plan with incomplete tasks. Continue working."
   ```
   완료되지 않은 작업이 있으면 자동으로 프롬프트를 주입하여 계속 진행 강제

3. **검증 강요**
   - "Subagents LIE" 경고: 서브에이전트의 자체 보고를 신뢰하지 말 것
   - 오케스트레이터가 직접 진단(LSP), 테스트, 코드 검토 수행 요구

#### 위임 강제

오케스트레이터가 `.sisyphus/` 디렉토리 외부 파일을 직접 수정하려 하면 경고:
```
"⚠️⚠️⚠️ [CRITICAL SYSTEM DIRECTIVE - DELEGATION REQUIRED]
You are violating orchestrator protocol."
```

### 3.2 TODO 강제 완료 메커니즘 (todo-continuation-enforcer)

#### 핵심 작동 원리

**세션 유휴 상태** 감지 → 미완료 작업 자동 재개

#### 주요 단계

1. **유휴 상태 감지**
   ```
   "session.idle" 이벤트 수신 → TODO 목록 확인 → 미완료 항목 카운트
   ```

2. **카운트다운 시작**
   - 2초 대기 시간 설정
   - 사용자에게 "Resuming in Xs..." 알림 토스트 표시
   - 각 1초마다 카운트다운 업데이트

3. **자동 프롬프트 주입**
   2초 후 시스템 메시지 자동 전송:
   ```
   "[SYSTEM REMINDER - TODO CONTINUATION]
   Incomplete tasks remain in your todo list..."
   ```

#### 강제 완료 스킵 조건

- 회복 중인 세션
- 배경 작업 실행 중
- 특정 에이전트 목록 제외 ("Prometheus (Planner)" 등)
- 쓰기 권한 없음
- 사용자가 카운트다운 중 입력 (500ms 유예 기간)
- 마지막 메시지가 중단됨

### 3.3 Claude Code 통합 로더

#### Agent 로더 (claude-code-agent-loader)

**로드 경로**:
- 사용자 에이전트: `~/.claude/agents/*.md`
- 프로젝트 에이전트: `./.claude/agents/*.md`

**마크다운 파싱**:
- Frontmatter에서 메타데이터 추출 (name, description, tools)
- 본문을 프롬프트로 활용
- `mode: subagent` 설정

#### Command 로더 (claude-code-command-loader)

**4단계 로드 경로** (우선순위 순):
1. 사용자: `~/.claude/commands/`
2. 프로젝트: `.claude/commands/`
3. Opencode 전역: `~/.config/opencode/command/`
4. Opencode 프로젝트: `.opencode/command/`

**재귀적 네임스페이싱**:
- 디렉토리 = 네임스페이스
- 예: `.claude/commands/git/commit.md` → `git:commit`

**병합 우선순위**:
```javascript
{ ...projectOpencode, ...global, ...project, ...user }
```

### 3.4 CLI 설치 시스템

#### 설치 방식

```bash
# 대화형 설치
bunx oh-my-opencode install

# 비대화형 설치
bunx oh-my-opencode install --no-tui \
  --claude=<yes|no|max20> \
  --chatgpt=<yes|no> \
  --gemini=<yes|no>
```

#### 설치 과정

1. 구독 선택 (Claude, ChatGPT, Gemini)
2. OpenCode 플러그인 설정 추가
3. 인증 플러그인 설치 (선택한 모델 기반)
4. 제공자 구성 파일 작성
5. oMo 설정 파일 생성

#### 모델 자동 할당

| 에이전트 | Claude有 | ChatGPT有 | Gemini有 |
|---------|---------|----------|---------|
| Sisyphus | claude-opus-4-5 | - | - |
| Oracle | gpt-5.2 | claude-opus-4-5 | - |
| Librarian | glm-4.7-free | glm-4.7-free | - |
| Frontend | antigravity-gemini-3 | claude-opus-4-5 | glm-4.7-free |

### 3.5 매직 키워드 (Ultrawork)

프롬프트에 `ultrawork` (또는 `ulw`) 포함 시:
- 모든 기능 자동 활성화
- 병렬 에이전트, 배경 작업, 깊은 탐색 자동 실행
- 추가 설정 불필요

---

## 4. oh-my-opencode 프로젝트 구조

```
oh-my-opencode/
├── .github/          # GitHub Actions/문서
├── .opencode/        # 설정 샘플
├── assets/           # 프로젝트 이미지/자료
├── docs/             # 상세 문서
├── script/           # 설치 및 유틸리티 스크립트
├── signatures/       # 서명 파일
├── src/
│   ├── agents/       # 에이전트 정의
│   ├── auth/         # 인증 시스템
│   ├── cli/          # CLI 도구
│   │   ├── commands/
│   │   ├── doctor/
│   │   ├── get-local-version/
│   │   ├── run/
│   │   ├── config-manager.ts
│   │   ├── index.ts
│   │   ├── install.ts
│   │   └── types.ts
│   ├── config/       # 설정 관리
│   ├── features/     # 기능 모듈 (14개)
│   ├── hooks/        # 훅 시스템 (23개)
│   ├── mcp/          # MCP 연동
│   │   ├── context7.ts
│   │   ├── grep-app.ts
│   │   ├── websearch.ts
│   │   └── index.ts
│   ├── plugin-handlers/
│   ├── shared/
│   ├── tools/        # 도구 (13개)
│   ├── google-auth.ts
│   ├── index.ts
│   ├── plugin-config.ts
│   └── plugin-state.ts
├── package.json
├── tsconfig.json
├── README.md
├── README.ja.md
├── README.zh-cn.md
├── AGENTS.md
├── CLA.md
├── CONTRIBUTING.md
└── LICENSE.md
```

---

## 5. oh-my-opencode 의존성

```json
{
  "dependencies": {
    "@ast-grep/cli": "^0.40.0",
    "@ast-grep/napi": "^0.40.0",
    "@clack/prompts": "^0.11.0",
    "@code-yeongyu/comment-checker": "^0.6.1",
    "@modelcontextprotocol/sdk": "^1.25.1",
    "@openauthjs/openauth": "^0.4.3",
    "@opencode-ai/plugin": "^1.1.1",
    "@opencode-ai/sdk": "^1.1.1",
    "commander": "^14.0.2",
    "hono": "^4.10.4",
    "js-yaml": "^4.1.1",
    "jsonc-parser": "^3.3.1",
    "open": "^11.0.0",
    "picocolors": "^1.1.1",
    "picomatch": "^4.0.2",
    "xdg-basedir": "^5.1.0",
    "zod": "^4.1.8"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/picomatch": "^3.0.2",
    "bun-types": "latest",
    "typescript": "^5.7.3"
  }
}
```

---

## 6. 핵심 차이점 요약

### 🔴 Critical - 핵심 기능 누락

1. **Claude Code 직접 통합 로더들**
   - `claude-code-agent-loader`
   - `claude-code-command-loader`
   - `claude-code-plugin-loader`
   - `claude-code-session-state`

   **custommcp는 MCP 서버로만 동작하며, Claude Code의 내부 시스템에 접근하지 못함**

2. **Sisyphus 오케스트레이터**
   - `sisyphus-orchestrator`
   - `todo-continuation-enforcer`
   - `sisyphus-task`

   **custommcp는 작업 완료를 강제하는 메커니즘이 없음**

3. **CLI 설치 시스템**
   - oh-my-opencode: `bunx oh-my-opencode install`
   - custommcp: 수동 설정 필요

### 🟡 Medium - 유용한 기능 누락

4. **Think Mode / Extended Thinking**
5. **Preemptive Compaction**
6. **Rules Injector**
7. **자동 업데이트 체커**
8. **플러그인 시스템**
9. **Ultrawork 매직 키워드**
10. **Task Toast Manager**

### 🟢 Minor - 있으면 좋은 기능

11. **Slash Command 도구**
12. **call-omo-agent**
13. **Hook Message Injector**
14. **Task Resume Info**

---

## 7. custommcp의 장점

### ✅ 더 많은 도구 (118개 vs 13개 폴더)
- Playwright 브라우저 자동화
- Git Master 도구 (5개)
- 비용 추적 시스템 (6개)
- 권한 시스템 (7개)
- 앙상블 쿼리 (3개)

### ✅ 더 많은 전문가 (11개 vs 7개)
- Metis (전략적 계획)
- Momus (비판적 분석)
- Prometheus (창의적 솔루션)

### ✅ 더 많은 훅 (38개 vs 23개)

### ✅ CLI 직접 호출
- 터미널 CLI 도구(gemini, claude, codex) 직접 호출로 프로바이더 통합

### ✅ Node.js 호환성
- Bun 없이도 실행 가능

---

## 8. 결론

custommcp는 MCP 도구 수와 전문가 수에서는 oh-my-opencode를 앞서지만, **Claude Code와의 깊은 통합**과 **작업 완료 강제 메커니즘**이 핵심적으로 부족합니다.

oh-my-opencode의 핵심 가치:
1. **Sisyphus** - 작업이 완료될 때까지 계속 진행
2. **Claude Code 네이티브 통합** - 단순 MCP가 아닌 내부 시스템 통합
3. **원클릭 설치** - CLI로 간편 설치

이 세 가지를 구현하면 custommcp가 oh-my-opencode와 동등한 수준의 "배터리 포함" 에이전트 프레임워크가 될 수 있습니다.
