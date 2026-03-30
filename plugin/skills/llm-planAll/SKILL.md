---
name: llm-planAll
description: "Claude+GPT 협업 - Claude와 GPT가 동시에 작업합니다. Claude가 설계 후 작업을 나누고, GPT에게 일부를 위임하면서 자신도 동시에 코드 작업을 진행합니다. '같이 하자', '나눠서 작업', '병렬로 구현', '동시에 작업', '협업' 같은 요청에 반응합니다. 실행 전 사용자에게 확인을 구합니다"
argument-hint: "<구현할 작업 설명>"
---

## Claude + GPT 협업 (동시 작업)

Claude와 GPT가 **동시에** 작업합니다. Claude는 핵심 로직을, GPT는 독립 모듈을 담당합니다.

### 실행 흐름

#### 1단계: 분석 & 설계 (plan 모드)

plan 모드에 진입하여 사용자 요청을 분석합니다:
- 관련 파일을 Read/Glob/Grep으로 파악
- 전체 아키텍처 설계

plan에 반드시 다음 섹션을 포함하세요:

```
## [Claude 작업]
- 작업 A: (설명) - 대상 파일: ...
- 작업 B: (설명) - 대상 파일: ...

## [GPT 서브태스크]

### 서브태스크 1: (설명)
- 대상 파일: ...
- 변경 내용: ...

### 서브태스크 2: (설명)
- 대상 파일: ...
- 변경 내용: ...
```

#### 2단계: 작업 분할 기준

| Claude 작업 (직접) | GPT 작업 (위임) |
|---|---|
| 핵심 로직 | 독립적인 모듈 |
| 다른 작업에 의존적인 것 | 유틸리티 함수 |
| 통합/조율 작업 | 테스트 코드 |
| 설정/구성 변경 | 반복적 패턴 구현 |

**중요**: Claude 작업과 GPT 작업의 파일이 겹치면 안 됩니다.

#### 3단계: plan 탈출 → 사용자 확인

> "Claude: 작업 A, B 직접 수행 / GPT 에이전트 N명에게 서브태스크 위임. 진행할까요?"

#### 4단계: GPT 위임 먼저 시작

**GPT 작업을 먼저** 백그라운드로 시작합니다:

```
delegate_task({
  task: "전체 작업 설명",
  files: ["GPT가 작업할 파일들"],
  context: "plan에서 설계한 내용",
  context_docs: ["CLAUDE.md"],
  parallel_agents: N,
  agent_tasks: ["서브태스크1", "서브태스크2", ...]
})
```

#### 5단계: Claude 자기 작업 동시 진행

GPT가 백그라운드에서 작업하는 동안, Claude는 **자신의 작업을 즉시 시작**합니다:
- plan의 [Claude 작업]에 따라 파일 수정
- Write, Edit 도구로 직접 코드 작성

#### 6단계: GPT 결과 수집

Claude 작업이 완료되면 GPT 리포트를 확인합니다:
- 변경된 파일 목록
- 작업 요약
- 이슈 사항

#### 7단계: 통합 리뷰

Claude 작업 + GPT 작업 전체를 리뷰합니다 (3관점 × GPT+Gemini = 6 에이전트 병렬):

```
review_code({
  files: [Claude가 변경한 파일 + GPT가 변경한 파일],
  context_docs: ["CLAUDE.md"],
  perspectives: 3,
  focus: "all"
})
```

#### 8단계: 최종 보고

- Claude 작업 결과
- GPT 위임 결과
- 통합 리뷰 결과
- 빌드/검증 상태

### 핵심 원칙

- **GPT 위임을 먼저 시작**하고 Claude 작업을 동시 진행 (시간 절약)
- **파일 충돌 방지**: Claude와 GPT가 같은 파일을 수정하면 안 됨
- **GPT만 코드 변경** (codex --full-auto), **Gemini는 리뷰만**
- **2명 이상 호출 시 반드시 병렬** (consult_experts_parallel 또는 delegate_task)
- **Claude의 핵심 작업이 GPT 결과에 의존하면 안 됨** (독립성 보장)
