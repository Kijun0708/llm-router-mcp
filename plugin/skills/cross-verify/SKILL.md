---
name: cross-verify
description: "교차 검증 - 서로 다른 LLM(GPT, Gemini, Claude)으로 결과를 교차 검증합니다. '확실해?', '다른 AI도 확인해봐', '검증해줘', '정말 맞아?', '이거 신뢰할 수 있어?' 같은 요청에 반응합니다"
argument-hint: "<검증할 코드/분석/결정 사항>"
---

## Cross-Verification (교차 검증)

서로 다른 LLM 프로바이더의 전문가 2명에게 동일한 질문을 보내고, 결과를 교차 검증합니다.

### 왜 교차 검증인가?

단일 LLM의 자기 검증은 동일한 편향을 반복할 수 있습니다. 서로 **다른 프로바이더**(GPT vs Gemini vs Claude)를 사용하면:
- 각 모델의 고유한 관점과 강점을 활용
- 한 모델이 놓친 문제를 다른 모델이 발견
- 불일치 항목이 곧 주의가 필요한 부분

### 프로세스

1. **2명의 전문가에게 병렬로 동일 질문 전송** (서로 다른 프로바이더)

```
consult_experts_parallel({
  experts: [
    { expert: "strategist", message: "다음을 분석해줘: [대상]" },
    { expert: "reviewer", message: "다음을 분석해줘: [대상]" }
  ]
})
```

2. **결과 종합** — 두 전문가의 결과를 비교하여 불일치 항목을 표로 정리

### 추천 조합

| 검증 대상 | 전문가 A | 전문가 B | 이유 |
|----------|---------|---------|------|
| 아키텍처 결정 | `strategist` (GPT) | `prometheus` (Claude) | 서로 다른 전략적 관점 |
| 코드 품질 | `reviewer` (Gemini) | `codex_reviewer` (GPT) | 이미 code-review 스킬에서 사용 |
| 보안 분석 | `security` (Claude) | `reviewer` (Gemini) | 보안 전문 + 일반 리뷰 |
| DB 설계 | `data` (GPT) | `researcher` (Claude) | 실무 + 이론적 검증 |
| 인프라/DevOps | `devops` (GPT) | `momus` (Gemini) | 실무 + 비판적 검토 |

### 출력 형식

```
## 교차 검증 결과

### 일치하는 분석
- [두 전문가가 동의한 내용]

### 불일치 항목
| 항목 | 전문가 A 의견 | 전문가 B 의견 | 판단 |
|------|-------------|-------------|------|

### 최종 권장사항
[교차 검증을 기반으로 한 종합 판단]
```
