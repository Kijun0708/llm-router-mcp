---
name: llm-debate
description: "중재형 전문가 토론 및 비교 분석 - GPT와 Gemini 전문가들이 주제를 다각도로 분석합니다. '비교해줘', 'A vs B', '뭐가 나을까', '장단점 분석', '어떤 걸 선택할지', '전문가 의견', '토론해봐' 같은 요청에 반응합니다. 실행 전 사용자에게 확인을 구합니다"
argument-hint: "<토론 주제 또는 기술적 질문>"
---

## Moderated Debate (중재형 전문가 토론)

여러 전문가가 동일한 주제에 대해 병렬로 의견을 내고, 중재자가 종합 브리프와 최종 정리를 만듭니다.

> **자동 호출 시 확인 필수**: 이 스킬이 상황에 적합하다고 판단되면, 바로 실행하지 말고 먼저 사용자에게 "이 주제는 여러 전문가의 토론을 통해 다각도로 분석하면 좋겠습니다. 전문가 토론을 진행할까요?"와 같이 확인을 구한 후 실행하세요.

### moderated_debate 사용 (추천)

`moderated_debate` MCP 도구를 사용합니다. Claude는 실행 전에 보통 AI 수(2-4명)와 재질의 횟수를 확인합니다.

```
moderated_debate({
  agenda: "마이크로서비스 vs 모놀리스 아키텍처",
  participant_count: 3,
  repeat_count: 1
})
```

- `debate_moderator`가 필요하면 blank 전문가들에게 페르소나를 자동 할당
- 각 전문가가 1차 의견을 병렬로 제출
- 중재자가 종합 브리프를 만들고 재질의
- 마지막에 중재자가 최종 정리 반환

직접 페르소나를 주고 싶으면 수동 참가자 모드도 가능합니다:

```
moderated_debate({
  agenda: "토론 주제",
  participants: [
    { expert: "gpt_blank_1", persona: "실용주의 아키텍트" },
    { expert: "gemini_blank_1", persona: "리스크 중심 검토자" }
  ],
  repeat_count: 1
})
```

### 사용 시나리오

- 아키텍처 의사결정 (마이크로서비스 vs 모놀리스)
- 기술 스택 선택 (React vs Vue vs Svelte)
- 성능 vs 유지보수성 트레이드오프
- 리팩토링 전략
- 보안 정책 수립
