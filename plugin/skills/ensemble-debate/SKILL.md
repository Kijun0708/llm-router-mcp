---
name: ensemble-debate
description: "멀티 전문가 토론 및 비교 분석 - GPT, Gemini, Claude 전문가들이 주제를 다각도로 분석합니다. '비교해줘', 'A vs B', '뭐가 나을까', '장단점 분석', '어떤 걸 선택할지', '전문가 의견', '토론해봐' 같은 요청에 반응합니다. 실행 전 사용자에게 확인을 구합니다"
argument-hint: "<토론 주제 또는 기술적 질문>"
---

## Ensemble Debate (멀티 전문가 토론)

여러 전문가가 동일한 주제에 대해 독립적으로 분석한 후 토론합니다.

> **자동 호출 시 확인 필수**: 이 스킬이 상황에 적합하다고 판단되면, 바로 실행하지 말고 먼저 사용자에게 "이 주제는 여러 전문가의 토론을 통해 다각도로 분석하면 좋겠습니다. 전문가 토론을 진행할까요?"와 같이 확인을 구한 후 실행하세요.

### 자동 토론 (추천)

`auto_debate` MCP 도구를 사용하면 자동으로 페르소나가 할당됩니다:

```
auto_debate({
  topic: "마이크로서비스 vs 모놀리스 아키텍처",
  max_rounds: 2,
  participant_count: 3
})
```

- `debate_moderator`가 주제를 분석하여 적절한 페르소나를 각 전문가에게 자동 할당
- GPT, Gemini, Claude 전문가가 각각 독립적으로 분석
- 라운드별로 다른 전문가의 의견을 반박/보완
- 최종 합의안 도출

### 수동 토론

`ensemble_query` MCP 도구로 직접 전문가를 선택할 수도 있습니다:

```
ensemble_query({
  prompt: "토론 주제",
  experts: ["strategist", "reviewer", "researcher"],
  strategy: "debate",
  synthesizer: "strategist"
})
```

**전략 옵션:**
- `debate` — 라운드별 토론 후 합의
- `parallel` — 독립 분석 후 병렬 취합
- `synthesize` — 분석 후 synthesizer가 종합
- `vote` — 투표 방식
- `chain` — 순차 분석 (앞 전문가 결과를 다음 전문가에게 전달)
- `best_of_n` — 동일 전문가 N번 실행 후 최선 선택

### 사용 시나리오

- 아키텍처 의사결정 (마이크로서비스 vs 모놀리스)
- 기술 스택 선택 (React vs Vue vs Svelte)
- 성능 vs 유지보수성 트레이드오프
- 리팩토링 전략
- 보안 정책 수립
