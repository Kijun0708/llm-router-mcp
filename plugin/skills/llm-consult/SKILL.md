---
name: llm-consult
description: "AI 전문가 상담 - 아키텍처 설계, 디버깅, 코드 분석, 성능 최적화, 데이터베이스, UI/UX, 문서 작성, DevOps, 현실 검증 등 전문 분야별 AI 전문가에게 상담을 요청합니다. '전문가한테 물어봐', '다른 AI 의견', '이거 어떻게 생각해' 같은 요청에 반응합니다"
argument-hint: "<질문 또는 분석 요청>"
---

## LLM Router - 전문가 상담

다양한 AI 전문가에게 상담을 요청합니다. `consult_expert` MCP 도구를 사용하세요.

### 전문가 목록 (20명)

#### 핵심 전문가

| Expert ID | 모델 | 전문 분야 |
|-----------|------|----------|
| `strategist` | GPT | 아키텍처 설계, 디버깅 전략, 시스템 설계 |
| `codereview` | Gemini Pro + GPT | 통합 코드 리뷰 (perspectives로 병렬 리뷰) |
| `frontend` | Gemini Pro | UI/UX, 컴포넌트 설계, 프론트엔드 |

#### 계획/분석 전문가

| Expert ID | 모델 | 전문 분야 |
|-----------|------|----------|
| `metis` | GPT | 전략적 계획, 복잡한 문제 분해 |
| `momus` | Gemini Pro | 비판적 분석, 품질 평가, 코드 단순화 |

#### 특화 전문가

| Expert ID | 모델 | 전문 분야 |
|-----------|------|----------|
| `security` | GPT | OWASP/CWE 보안 취약점 분석 |
| `tester` | GPT | TDD/테스트 전략 설계 |
| `data` | GPT | DB 설계, 쿼리 최적화 |
| `devops` | GPT | CI/CD, Docker, Kubernetes, 인프라 자동화 |
| `reality_checker` | Gemini Pro | refactor 잔재, dead code, 혼재 경로 현실 검증 |
| `lsp_index_engineer` | GPT | 심볼/참조/인덱스 기반 코드 인텔리전스 분석 |

#### 동적 페르소나 전문가 (persona 필수)

| Expert ID | 모델 | 설명 |
|-----------|------|------|
| `gpt_blank_1` | GPT | 사용자 정의 GPT 범용 |
| `gpt_blank_2` | GPT | 사용자 정의 GPT 코드특화 |
| `gemini_blank_1` | Gemini Pro | 사용자 정의 Gemini 고성능 |
| `gemini_blank_2` | Gemini Flash | 사용자 정의 Gemini 빠른응답 |

비개발 자문(투자, 마케팅, 법률 등)에 적합. `persona` 파라미터로 원하는 역할을 지정하면 중재자가 페르소나를 정제한 후 해당 역할로 응답합니다.

### 사용법

```
consult_expert({
  expert: "strategist",
  question: "이 마이크로서비스 아키텍처의 문제점을 분석해줘",
  context: "선택: 추가 컨텍스트"
})
```

#### 동적 페르소나 전문가 사용 예시

```
consult_expert({
  expert: "gpt_blank_1",
  persona: "투자 전문가",
  question: "2024년 미국 주식 시장 전망은 어떤가요?"
})
```

```
consult_expert({
  expert: "gemini_blank_1",
  persona: "마케팅 전략가",
  question: "B2B SaaS 제품의 초기 마케팅 전략을 세워줘"
})
```

### 상황별 추천

- **아키텍처 결정**: `strategist` 또는 `metis`
- **코드 품질**: `codereview`
- **보안 점검**: `security`
- **성능 이슈**: `data` (DB) 또는 `strategist` (시스템)
- **UI/UX**: `frontend`
- **기술 조사**: `strategist`
- **빠른 답변**: `momus`
- **비판적 검토**: `momus`
- **CI/CD/배포**: `devops`
- **테스트 전략**: `tester`
- **리팩토링 잔재 검증**: `reality_checker`
- **참조/심볼 추적**: `lsp_index_engineer`
- **비개발 자문** (투자, 마케팅, 법률 등): `gpt_blank_1` 또는 `gemini_blank_1` + persona

### 병렬 실행 원칙

> **2명 이상의 전문가를 호출할 때는 반드시 `consult_experts_parallel` 도구를 사용하세요.**
> `consult_expert`를 여러 번 순차 호출하지 마세요. 시간이 낭비됩니다.
