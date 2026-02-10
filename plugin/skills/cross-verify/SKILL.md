---
name: cross-verify
description: "교차 검증 - 서로 다른 LLM(GPT, Gemini, Claude)으로 결과를 교차 검증합니다. 코드 분석, 설계 결정, 기술 판단의 정확성을 높입니다"
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

1. **전문가 A에게 분석 요청** (예: GPT 계열)

```
consult_expert({
  expert: "strategist",
  message: "다음을 분석해줘: [대상]"
})
```

2. **전문가 B에게 동일 대상 + A의 결과를 포함하여 검증 요청** (다른 프로바이더)

```
consult_expert({
  expert: "reviewer",
  message: "다음 분석 결과를 검증해줘. 동의하는 부분과 동의하지 않는 부분을 명시해줘: [A의 결과]\n\n원본 코드/대상: [대상]"
})
```

3. **결과 종합** — 불일치 항목을 표로 정리하여 사용자에게 제공

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
