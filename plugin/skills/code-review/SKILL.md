---
name: code-review
description: "코드 리뷰 - 버그 탐지, 보안 점검, 성능 분석, 코딩 스타일 검토. GPT와 Gemini 두 전문가가 교차 검증하여 더 정확한 리뷰를 제공합니다"
argument-hint: "<리뷰할 파일/PR/코드 범위>"
---

## Code Review (교차 검증)

**항상 2명의 전문가**를 사용하여 교차 검증된 코드 리뷰를 수행합니다.

### 리뷰 프로세스

1. **`review_code` MCP 도구를 호출**하여 코드 리뷰를 실행합니다:

```
review_code({
  target: "리뷰 대상 코드 또는 파일 경로",
  review_type: "comprehensive",
  include_design: true
})
```

2. 또는 **2명의 전문가를 각각 호출**합니다:

- `consult_expert({ expert: "reviewer", message: "..." })` — Gemini Pro: 코드 품질, 보안, 구조적 문제
- `consult_expert({ expert: "codex_reviewer", message: "..." })` — GPT Codex: GPT 관점 코드 분석, 다른 시각

3. **두 전문가의 결과를 종합**하여 교차 검증된 리뷰를 사용자에게 제공합니다.

### 리뷰 기준

1. **정확성**: 로직 오류, 엣지 케이스, off-by-one 에러
2. **성능**: 불필요한 연산, N+1 쿼리, 메모리 누수 가능성
3. **보안**: 인젝션, XSS, 인증/인가 문제
4. **유지보수성**: 네이밍, 복잡도, 중복 코드, 테스트 가능성
5. **코딩 표준**: 프로젝트 컨벤션 준수 여부

### 출력 형식

각 이슈에 대해:
- **위치**: 파일:라인
- **심각도**: Critical / Major / Minor / Suggestion
- **설명**: 문제 설명
- **수정 제안**: 구체적 코드 변경안
- **검증 상태**: 두 전문가 일치 여부
