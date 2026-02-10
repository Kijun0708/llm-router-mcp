---
name: design-workflow
description: "설계 워크플로우 - 여러 전문가가 협업하여 시스템/기능 설계를 수행합니다. 전략 설계, 리서치, 리뷰를 포함"
disable-model-invocation: true
argument-hint: "<설계할 시스템/기능 설명>"
---

## Design Workflow (설계 워크플로우)

여러 전문가가 협업하여 시스템/기능 설계를 수행합니다. `design_with_experts` MCP 도구를 사용하세요.

### 사용법

```
design_with_experts({
  task: "사용자 인증 시스템 설계",
  include_research: true,
  include_review: true
})
```

### 워크플로우

1. **전략 설계** (`strategist`): 아키텍처, 컴포넌트 구조, 기술 선택
2. **리서치** (`researcher`, 선택): 관련 기술/라이브러리 조사, 모범 사례 수집
3. **리뷰** (`reviewer`, 선택): 설계안의 품질, 보안, 확장성 검토

### 옵션

| 파라미터 | 기본값 | 설명 |
|---------|-------|------|
| `include_research` | `true` | 리서치 단계 포함 여부 |
| `include_review` | `true` | 리뷰 단계 포함 여부 |

### 사용 시나리오

- 새 프로젝트 아키텍처 설계
- 기존 시스템 리팩토링 계획
- API 설계
- 데이터베이스 스키마 설계
- 마이그레이션 전략 수립
