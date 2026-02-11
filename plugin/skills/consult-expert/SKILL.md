---
name: consult-expert
description: "AI 전문가 상담 - 아키텍처 설계, 디버깅, 코드 분석, 성능 최적화, 데이터베이스, UI/UX, 문서 작성, DevOps 등 전문 분야별 AI 전문가에게 상담을 요청합니다. '전문가한테 물어봐', '다른 AI 의견', '이거 어떻게 생각해' 같은 요청에 반응합니다"
argument-hint: "<질문 또는 분석 요청>"
---

## LLM Router - 전문가 상담

다양한 AI 전문가에게 상담을 요청합니다. `consult_expert` MCP 도구를 사용하세요.

### 전문가 목록 (23명)

#### 핵심 전문가

| Expert ID | 모델 | 전문 분야 |
|-----------|------|----------|
| `strategist` | GPT 5.2 | 아키텍처 설계, 디버깅 전략, 시스템 설계 |
| `researcher` | Claude Sonnet | 문서 분석, 코드베이스 탐색, 기술 리서치 |
| `reviewer` | Gemini Pro | 코드 리뷰, 보안 분석, 품질 점검 |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계, 프론트엔드 |
| `writer` | Gemini Flash | 기술 문서 작성, API 문서화 |
| `explorer` | Gemini Flash | 빠른 검색, 간단한 쿼리, 탐색 |
| `multimodal` | GPT 5.2 | 이미지 분석, 시각적 콘텐츠 |
| `librarian` | Claude Sonnet | 지식 관리, 세션 히스토리 검색 |

#### 계획/분석 전문가

| Expert ID | 모델 | 전문 분야 |
|-----------|------|----------|
| `metis` | GPT 5.2 | 전략적 계획, 복잡한 문제 분해 |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가, 코드 단순화 |
| `prometheus` | Claude Sonnet | 창의적 솔루션, 혁신적 접근 |

#### 특화 전문가

| Expert ID | 모델 | 전문 분야 |
|-----------|------|----------|
| `security` | Claude Sonnet | OWASP/CWE 보안 취약점 분석 |
| `tester` | Claude Sonnet | TDD/테스트 전략 설계 |
| `data` | GPT 5.2 | DB 설계, 쿼리 최적화 |
| `codex_reviewer` | GPT Codex | GPT 관점 코드 리뷰 |
| `devops` | GPT 5.2 | CI/CD, Docker, Kubernetes, 인프라 자동화 |

### 사용법

```
consult_expert({
  expert: "strategist",
  message: "이 마이크로서비스 아키텍처의 문제점을 분석해줘",
  context: "선택: 추가 컨텍스트"
})
```

### 상황별 추천

- **아키텍처 결정**: `strategist` 또는 `metis`
- **코드 품질**: `reviewer` 또는 `codex_reviewer`
- **보안 점검**: `security`
- **성능 이슈**: `data` (DB) 또는 `strategist` (시스템)
- **UI/UX**: `frontend`
- **기술 조사**: `researcher`
- **빠른 답변**: `explorer`
- **비판적 검토**: `momus`
- **CI/CD/배포**: `devops`
- **테스트 전략**: `tester`
