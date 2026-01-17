# LLM Router MCP

Claude Code에서 여러 AI 모델(GPT, Claude, Gemini)을 전문가 팀으로 활용할 수 있게 해주는 MCP(Model Context Protocol) 서버입니다.

## 개요

Claude Code가 팀 리더 역할을 하며, 특정 작업에 맞는 AI 전문가에게 업무를 위임합니다. 각 전문가는 자동으로 웹 검색과 라이브러리 문서 조회 도구를 사용할 수 있습니다.

## 전문가 시스템

| 전문가 | 모델 | 역할 | 폴백 |
|--------|------|------|------|
| `strategist` | GPT 5.2 | 아키텍처 설계, 디버깅 전략 | researcher → reviewer |
| `researcher` | Claude Sonnet | 문서 분석, 코드베이스 탐색 | reviewer → explorer |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석 | explorer |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계 | writer → explorer |
| `writer` | Gemini Flash | 기술 문서 작성 | explorer |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리 | - |
| `multimodal` | GPT 5.2 | 이미지 분석, 시각적 콘텐츠 | strategist → researcher |

## 주요 기능

### Function Calling
전문가들이 직접 도구를 호출하여 최신 정보를 수집합니다:
- **web_search**: Exa API를 통한 웹 검색
- **get_library_docs**: Context7 API를 통한 라이브러리 문서 조회
- **search_libraries**: 라이브러리 검색

### 자동 폴백
Rate limit 발생 시 자동으로 다른 전문가로 전환됩니다.

### 응답 캐싱
동일한 질문에 대한 응답을 캐싱하여 비용과 지연 시간을 절약합니다.

### LSP Integration
IDE급 코드 이해 능력을 제공합니다:
- **정의로 이동**: 심볼의 정의 위치 찾기
- **참조 찾기**: 심볼이 사용된 모든 위치
- **타입 정보**: Hover 시 타입/문서 정보
- **워크스페이스 심볼**: 프로젝트 전체 심볼 검색

### AST-Grep
25+ 언어를 지원하는 AST 기반 코드 검색/변환:
- **패턴 검색**: 구조적 코드 패턴 매칭
- **코드 변환**: 안전한 대규모 리팩토링
- **지원 언어**: TypeScript, JavaScript, Python, Rust, Go, Java 등

### Context Management
장시간 세션 안정성을 위한 컨텍스트 관리:
- **Context Monitor**: 토큰 사용량 추적, 70%+ 경고
- **Output Truncator**: 남은 컨텍스트 기반 동적 출력 조절
- **Todo Enforcer**: 미완료 작업 감지 및 강제 완료

### Stability & Recovery
API 에러 및 편집 실패 자동 복구:
- **Session Recovery**: API 에러 분류, 서킷 브레이커, 자동 재시도
- **Edit Recovery**: 편집 에러 분류, 복구 제안
- **Comment Checker**: AI 생성 불필요 코멘트 감지

### Directory Injector
프로젝트 컨텍스트 자동 주입:
- **AGENTS.md**: 에이전트 지시사항 자동 로드
- **README.md**: 프로젝트 설명 자동 로드
- **.claude/rules/**: 커스텀 규칙 자동 로드

### Magic Keywords
프롬프트에 키워드를 포함하면 자동으로 해당 모드가 활성화됩니다:

| 키워드 | 트리거 | 용도 |
|--------|--------|------|
| 🚀 ultrawork | ultrawork, ulw | 최대 성능 오케스트레이션 |
| 🔍 search | search, find, 찾아 | 멀티 에이전트 병렬 검색 |
| 🔬 analyze | analyze, 분석 | 심층 분석 모드 |
| 🏊 deepdive | deepdive, 철저히 | 철저한 연구 모드 |
| ⚡ quickfix | quickfix, 빨리 | 빠른 버그 수정 |
| 🔧 refactor | refactor, 리팩토링 | 코드 리팩토링 |
| 👀 review | review, 리뷰 | 코드 리뷰 |
| 📝 document | document, 문서화 | 문서화 모드 |

### Ensemble System
여러 전문가의 응답을 조합하여 더 나은 결과를 도출:
- **parallel**: 병렬 실행 후 모든 응답 반환
- **synthesize**: 응답들을 하나로 합성
- **debate**: 전문가 간 토론
- **vote**: 투표로 결정
- **best_of_n**: 최선의 응답 선택

### Cost Tracking
API 비용 추적 및 예산 관리:
- 세션/일간/월간 비용 추적
- 예산 한도 설정 및 알림
- 프로바이더/전문가/모델별 통계

### Hook System
이벤트 기반 확장 시스템:
- 도구 호출 전/후 인터셉트
- 전문가 호출 전/후 인터셉트
- 외부 쉘 명령 훅 지원

## 설치

```bash
# 저장소 클론
git clone https://github.com/Kijun0708/custommcp.git
cd custommcp

# 의존성 설치
npm install

# 빌드
npm run build
```

**CLIProxyAPI가 포함되어 있습니다** (`vendor/cliproxy/cli-proxy-api.exe`)

## 설정

### 환경변수 (.env)

```bash
# Exa API (웹 검색) - 필수
EXA_API_KEY=your_exa_api_key

# Context7 API (라이브러리 문서) - 선택
CONTEXT7_API_KEY=your_context7_api_key

# CLIProxyAPI 설정 (기본값 사용 시 생략 가능)
# CLIPROXY_URL=http://localhost:8787
# CLIPROXY_PATH=vendor/cliproxy/cli-proxy-api.exe

# 캐시 설정 (선택)
# CACHE_ENABLED=true
# CACHE_TTL_MS=1800000
```

### Claude Code 연동

`claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["C:/project/custommcp/dist/index.js"]
    }
  }
}
```

### AI 프로바이더 인증

MCP 연동 후 각 AI 프로바이더 OAuth 인증:

```
"인증 상태 확인해줘"  → auth_status로 현재 상태 확인
"GPT 인증해줘"       → auth_gpt로 브라우저 OAuth 진행
"Claude 인증해줘"    → auth_claude
"Gemini 인증해줘"    → auth_gemini
```

인증 정보는 `~/.cli-proxy-api/` 폴더에 저장됩니다.

## MCP 도구 목록

### 전문가 상담
| 도구 | 설명 |
|------|------|
| `consult_expert` | 전문가에게 직접 질문 |
| `route_by_category` | 카테고리 기반 자동 라우팅 |

### 백그라운드 실행
| 도구 | 설명 |
|------|------|
| `background_expert_start` | 비동기 전문가 실행 |
| `background_expert_result` | 결과 조회 |
| `background_expert_cancel` | 작업 취소 |
| `background_expert_list` | 작업 목록 |

### 워크플로우
| 도구 | 설명 |
|------|------|
| `design_with_experts` | 다중 전문가 설계 워크플로우 |
| `review_code` | 코드 리뷰 워크플로우 |
| `research_topic` | 주제 리서치 워크플로우 |

### 검색 및 문서
| 도구 | 설명 |
|------|------|
| `web_search` | Exa 웹 검색 |
| `get_library_docs` | 라이브러리 문서 조회 |
| `search_libraries` | 라이브러리 검색 |

### 인증 관리
| 도구 | 설명 |
|------|------|
| `auth_status` | 모든 프로바이더 인증 상태 확인 |
| `auth_gpt` | GPT/Codex OAuth 인증 |
| `auth_claude` | Claude OAuth 인증 |
| `auth_gemini` | Gemini OAuth 인증 |

### 관리
| 도구 | 설명 |
|------|------|
| `llm_router_health` | 서버 상태 확인, 캐시 관리 |
| `set_expert_model` | 전문가별 모델 변경 |

### LSP & AST-Grep
| 도구 | 설명 |
|------|------|
| `lsp_get_definition` | 심볼 정의 위치 찾기 |
| `lsp_get_references` | 심볼 참조 찾기 |
| `lsp_get_hover` | 타입/문서 정보 조회 |
| `lsp_workspace_symbols` | 워크스페이스 심볼 검색 |
| `lsp_check_server` | LSP 서버 상태 확인 |
| `ast_grep_search` | AST 패턴 검색 |
| `ast_grep_replace` | AST 패턴 치환 |
| `ast_grep_languages` | 지원 언어 목록 |

### Context Management
| 도구 | 설명 |
|------|------|
| `context_status` | 컨텍스트 사용량 조회 |
| `context_config` | 컨텍스트 모니터 설정 |
| `truncator_config` | 출력 truncator 설정 |
| `todo_enforcer` | 미완료 작업 관리 |

### Stability & Recovery
| 도구 | 설명 |
|------|------|
| `session_recovery` | 세션 복구 상태/설정 |
| `edit_recovery` | 편집 복구 상태/설정 |
| `comment_checker` | 코멘트 체커 상태/설정 |

### Directory & Keywords
| 도구 | 설명 |
|------|------|
| `directory_injector` | 디렉토리 인젝터 관리 |
| `magic_keywords` | 매직 키워드 관리 |

### Ensemble System
| 도구 | 설명 |
|------|------|
| `ensemble_query` | 앙상블 쿼리 실행 |
| `ensemble_preset` | 프리셋으로 앙상블 실행 |
| `ensemble_presets_list` | 프리셋 목록 조회 |

### Cost Tracking
| 도구 | 설명 |
|------|------|
| `cost_status` | 비용 현황 조회 |
| `cost_history` | 비용 히스토리 |
| `cost_stats` | 비용 통계 |
| `cost_reset` | 비용 초기화 |
| `cost_budget` | 예산 설정 |
| `cost_system_toggle` | 비용 추적 활성화/비활성화 |

### Hook System
| 도구 | 설명 |
|------|------|
| `hook_status` | 훅 상태 조회 |
| `hook_toggle` | 개별 훅 활성화/비활성화 |
| `hook_system_toggle` | 훅 시스템 전체 토글 |
| `external_hook_add` | 외부 훅 추가 |
| `external_hook_remove` | 외부 훅 제거 |
| `external_hook_list` | 외부 훅 목록 |

### Keyword Detector
| 도구 | 설명 |
|------|------|
| `keyword_add` | 키워드 규칙 추가 |
| `keyword_remove` | 키워드 규칙 제거 |
| `keyword_list` | 키워드 규칙 목록 |
| `keyword_detect` | 텍스트에서 키워드 감지 |
| `keyword_toggle` | 키워드 규칙 토글 |
| `keyword_system_toggle` | 키워드 시스템 토글 |

### Permission System
| 도구 | 설명 |
|------|------|
| `permission_check` | 권한 확인 |
| `permission_grant` | 권한 승인 |
| `permission_deny` | 권한 거부 |
| `permission_list` | 권한 목록 |
| `permission_pattern_toggle` | 패턴 토글 |
| `permission_system_toggle` | 시스템 토글 |
| `permission_clear_session` | 세션 권한 초기화 |

### Session Memory
| 도구 | 설명 |
|------|------|
| `memory_add` | 메모리 추가 |
| `memory_list` | 메모리 목록 |
| `memory_clear` | 메모리 초기화 |

### Orchestration
| 도구 | 설명 |
|------|------|
| `orchestrate_task` | 자동 태스크 오케스트레이션 |
| `ralph_loop_start` | Ralph Loop 시작 |
| `ralph_loop_cancel` | Ralph Loop 취소 |
| `ralph_loop_status` | Ralph Loop 상태 |

### Boulder State
| 도구 | 설명 |
|------|------|
| `boulder_status` | 볼더 상태 조회 |
| `boulder_recover` | 볼더 복구 |
| `boulder_detail` | 볼더 상세 정보 |

## 사용 예시

### 전문가 상담
```
"strategist에게 이 아키텍처에 대해 물어봐줘"
"React 19 새 기능을 researcher에게 조사시켜줘"
```

### 코드 리뷰
```
"이 코드 리뷰해줘" → review_code 워크플로우 실행
```

### 설계 워크플로우
```
"인증 시스템 설계해줘" → design_with_experts 실행
```

### 매직 키워드 사용
```
"ultrawork로 전체 기능 구현해줘"  → 최대 성능 오케스트레이션 모드
"이 버그 quickfix 해줘"         → 빠른 버그 수정 모드
"코드 deepdive 분석해줘"        → 철저한 연구 모드
```

### LSP 활용
```
"이 함수의 정의 위치 찾아줘"     → lsp_get_definition
"이 변수가 어디서 사용되는지"    → lsp_get_references
```

### AST-Grep 활용
```
"console.log 호출 전부 찾아줘"   → ast_grep_search
"deprecated 함수를 새 함수로 변경" → ast_grep_replace
```

### 앙상블 쿼리
```
"여러 전문가 의견 종합해줘"      → ensemble_query (synthesize)
"전문가들 토론시켜줘"           → ensemble_query (debate)
```

## 기술 스택

- **Language**: TypeScript
- **Runtime**: Node.js
- **Transport**: stdio
- **Validation**: Zod
- **Logging**: pino
- **Caching**: lru-cache

## 라이선스

MIT
