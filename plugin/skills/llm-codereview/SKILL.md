---
name: llm-codereview
description: "코드 리뷰 - GPT+Gemini 2중 병렬 리뷰. 각 관점마다 GPT와 Gemini가 동시에 분석하여 교차 검증합니다. '코드 봐줘', '리뷰해줘', '이거 괜찮아?', '버그 있는지 확인', '코드 점검' 같은 요청에 반응합니다"
argument-hint: "<리뷰할 파일/PR/코드 범위>"
---

## Code Review (GPT+Gemini 2중 병렬)

각 관점마다 GPT와 Gemini가 독립적으로 분석하여 교차 검증합니다.

### 핵심 구조

```
perspectives=1: [버그/보안] → GPT + Gemini = 2 에이전트
perspectives=2: [버그/보안] + [아키텍처] → 각각 GPT+Gemini = 4 에이전트
perspectives=3: [버그/보안] + [아키텍처] + [비판적] → 각각 GPT+Gemini = 6 에이전트
```

### 실행 흐름

#### 1단계: 리뷰 대상 파악

`git diff` 또는 사용자가 지정한 파일로 리뷰 대상을 결정합니다.

#### 2단계: `review_code` MCP 도구 호출

```
review_code({
  files: ["변경된 파일 경로들"],
  context_docs: ["CLAUDE.md"],
  perspectives: 2,
  focus: "all"
})
```

**이 한 번의 호출로** GPT+Gemini 2중 병렬 리뷰가 자동 실행됩니다.

- perspectives=1: 2 에이전트 (GPT + Gemini)
- perspectives=2: 4 에이전트 (2관점 × GPT+Gemini)
- perspectives=3: 6 에이전트 (3관점 × GPT+Gemini)

#### 3단계: 관점 종합

결과에서 다음을 확인합니다:
- **GPT와 Gemini 모두 지적** → 신뢰도 높음, 최우선 수정 대상
- **한쪽만 지적** → 추가 검토 필요
- **여러 관점에서 반복 지적** → 구조적 문제 가능성

#### 4단계: Plan 모드 진입

수정이 필요한 이슈가 있으면 plan 모드에 진입합니다:
- 심각도순 정렬: Critical → High → Medium → Low
- 파일별 수정 사항, 영향 범위 명시

#### 5단계: 승인 후 수정

사용자 승인 후 수정을 적용합니다.

#### 6단계: llm-validate 검증

수정 후 `/llm-validate`를 실행하여 빌드/타입 체크를 확인합니다.

### 리뷰 관점별 포커스

| 관점 | 포커스 | GPT 전문가 | Gemini 전문가 |
|------|--------|-----------|-------------|
| 1. 버그/보안 | 버그, 보안 취약점, 성능, 에러 처리 | codereview_gpt | codereview |
| 2. 아키텍처 | SOLID, 코드 스멜, 설계 패턴, 리팩토링 | codereview_gpt | codereview |
| 3. 비판적 | 숨겨진 가정, 리스크, 확장성, 유지보수 | codereview_gpt | codereview |

### 병렬 실행 원칙

> **`review_code` 도구가 내부적으로 모든 에이전트를 Promise.all로 병렬 실행합니다.**
> 별도로 `consult_experts_parallel`를 호출할 필요 없습니다.

### 백그라운드 결과 확인 주기

`review_code`는 백그라운드로 실행됩니다. 다음 간격으로 `background_expert_result`를 호출하여 결과를 확인하세요:

| 회차 | 대기 시간 | 누적 |
|------|----------|------|
| 1차 | 3분 | 3분 |
| 2차 | 2분 | 5분 |
| 3차 | 1분 | 6분 |
| 4차 | 1분 | 7분 |
| 5차 | 1분 | 8분 |

완료되지 않았으면 이후 1분 간격으로 계속 확인합니다.
