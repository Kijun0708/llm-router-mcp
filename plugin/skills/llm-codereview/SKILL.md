---
name: llm-codereview
description: "코드 리뷰 - GPT+Gemini 2중 병렬 리뷰. 각 관점마다 GPT와 Gemini가 동시에 분석하여 교차 검증합니다. '코드 봐줘', '리뷰해줘', '이거 괜찮아?', '버그 있는지 확인', '코드 점검' 같은 요청에 반응합니다"
argument-hint: "<리뷰할 파일/PR/코드 범위>"
---

## Code Review (GPT+Gemini 2중 병렬)

모든 관점에서 **GPT와 Gemini가 동시에** 리뷰합니다.

### 핵심 구조

```
perspectives=1: [버그/보안] → GPT + Gemini = 2 에이전트
perspectives=2: [버그/보안] + [아키텍처] → (GPT+Gemini) × 2 = 4 에이전트
perspectives=3: [버그/보안] + [아키텍처] + [비판적] → (GPT+Gemini) × 3 = 6 에이전트
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

**이 한 번의 호출로** GPT+Gemini 병렬 리뷰가 자동 실행됩니다.

- perspectives=1: 2 에이전트 (GPT+Gemini, 버그/보안)
- perspectives=2: 4 에이전트 (GPT+Gemini × 2관점)
- perspectives=3: 6 에이전트 (GPT+Gemini × 3관점)

#### 3단계: 교차 검증

결과에서 다음을 확인합니다:
- **같은 관점에서 GPT와 Gemini가 동일 지적** → 높은 신뢰도
- **여러 관점에서 반복 지적** → 최우선 수정 대상
- 한쪽만 지적한 이슈 → 추가 검토 필요

#### 4단계: 신뢰도 판단

- **90-100%**: GPT+Gemini 모두 지적 + 여러 관점에서 반복
- **75-89%**: GPT+Gemini 중 하나가 지적 + 근거 명확
- **50-74%**: 한 에이전트만 지적, 추가 맥락 필요
- **50% 미만**: 보고하지 않음 (거짓 양성)

#### 5단계: Plan 모드 진입

수정이 필요한 이슈가 있으면 plan 모드에 진입합니다:
- 심각도순 정렬: Critical → High → Medium → Low
- 파일별 수정 사항, 영향 범위 명시

#### 6단계: 승인 후 수정

사용자 승인 후 수정을 적용합니다.

#### 7단계: llm-validate 검증

수정 후 `/llm-validate`를 실행하여 빌드/타입 체크를 확인합니다.

### 리뷰 관점별 포커스

| 관점 | 포커스 | Gemini 전문가 | GPT 전문가 |
|------|--------|-------------|-----------|
| 1. 버그/보안 | 버그, 보안 취약점, 성능, 에러 처리 | codereview | codereview_gpt |
| 2. 아키텍처 | SOLID, 코드 스멜, 설계 패턴, 리팩토링 | codereview | codereview_gpt |
| 3. 비판적 | 숨겨진 가정, 리스크, 확장성, 유지보수 | momus | codereview_gpt |

### 병렬 실행 원칙

> **`review_code` 도구가 내부적으로 모든 에이전트를 Promise.all로 병렬 실행합니다.**
> 별도로 `consult_experts_parallel`를 호출할 필요 없습니다.
