---
name: tdd-workflow
description: "TDD 워크플로우 - Red-Green-Refactor 사이클 기반 테스트 주도 개발. 테스트 전략 설계, 실패 테스트 작성, 최소 구현, 리팩토링"
disable-model-invocation: true
argument-hint: "<TDD로 구현할 기능 설명>"
---

## TDD Workflow (테스트 주도 개발)

`tester` 전문가를 활용하여 TDD 워크플로우를 수행합니다.

### 워크플로우 단계

#### 1단계: 테스트 전략 설계

`consult_expert`로 테스트 전략을 먼저 설계합니다:

```
consult_expert({
  expert: "tester",
  message: "다음 기능에 대한 TDD 테스트 전략을 설계해줘: [기능 설명]\n\n포함할 항목:\n- 테스트 케이스 목록 (정상/엣지/에러)\n- 테스트 우선순위\n- 모킹 전략"
})
```

#### 2단계: Red (실패하는 테스트 작성)

전문가의 전략을 기반으로 실패하는 테스트를 작성합니다:
- 각 테스트는 하나의 동작만 검증
- 엣지 케이스 포함
- 명확한 테스트명 (given-when-then)

#### 3단계: 테스트 실행 → 모두 실패 확인

```bash
npm test  # 또는 프로젝트의 테스트 명령어
```

모든 테스트가 실패하는 것을 확인합니다.

#### 4단계: Green (최소한의 구현)

테스트를 통과시키는 **최소한의** 코드를 작성합니다:
- 과도한 설계 금지
- 테스트가 요구하는 것만 구현

#### 5단계: 테스트 실행 → 통과 확인

```bash
npm test
```

#### 6단계: Refactor (리팩토링)

테스트가 통과한 상태에서 코드를 개선합니다:
- 중복 제거
- 네이밍 개선
- 추상화 정리

리팩토링 후 다시 테스트를 실행하여 깨지지 않았는지 확인합니다.

### 커밋 전략

각 단계에서 커밋:
1. `test: add failing tests for [기능]`
2. `feat: implement [기능]`
3. `refactor: clean up [기능] implementation`
