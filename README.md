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

## 기술 스택

- **Language**: TypeScript
- **Runtime**: Node.js
- **Transport**: stdio
- **Validation**: Zod
- **Logging**: pino
- **Caching**: lru-cache

## 라이선스

MIT
