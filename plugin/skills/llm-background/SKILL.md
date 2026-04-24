---
name: llm-background
description: "백그라운드 작업 - 시간이 오래 걸리는 전문가 분석을 백그라운드에서 실행하고, 다른 작업을 하면서 나중에 결과를 확인합니다. '백그라운드에서 해줘', '나중에 결과 알려줘', '동시에 분석해줘' 같은 요청에 반응합니다. 실행 전 사용자에게 확인을 구합니다"
argument-hint: "<백그라운드로 실행할 작업>"
---

## Background Task (백그라운드 실행)

전문가 상담을 비동기로 실행하여, 다른 작업을 하면서 결과를 나중에 확인할 수 있습니다.

> **자동 호출 시 확인 필수**: 이 스킬이 상황에 적합하다고 판단되면, 바로 실행하지 말고 먼저 사용자에게 "이 작업을 백그라운드에서 비동기로 실행할 수 있습니다. 백그라운드로 진행할까요?"와 같이 확인을 구한 후 실행하세요.

### 작업 시작

```
background_expert_start({
  expert: "strategist",
  message: "이 시스템의 아키텍처를 분석해줘: [대상]",
  task_name: "아키텍처 분석"
})
```

반환값: `task_id` (결과 조회에 사용)

### 결과 확인

```
background_expert_result({
  task_id: "반환된 task_id"
})
```

**상태:**
- `pending` — 대기 중
- `running` — 실행 중
- `completed` — 완료 (결과 포함)
- `failed` — 실패 (에러 메시지 포함)

### 작업 관리

**목록 조회:**
```
background_expert_list()
```

**작업 취소:**
```
background_expert_cancel({
  task_id: "취소할 task_id"
})
```

### 활용 패턴

#### 병렬 분석

여러 전문가에게 동시에 작업을 맡기고, 모두 완료되면 결과를 종합:

1. `background_expert_start({ expert: "codereview", ... })` → task_id_1
2. `background_expert_start({ expert: "security", ... })` → task_id_2
3. `background_expert_start({ expert: "devops", ... })` → task_id_3
4. 각각 `background_expert_result`로 결과 수집
5. 결과 종합하여 사용자에게 제공

### 백그라운드 결과 확인 주기

백그라운드로 실행한 경우, 다음 간격으로 `background_expert_result`를 호출하여 결과를 확인하세요:

| 회차 | 대기 시간 | 누적 |
|------|----------|------|
| 1차 | 3분 | 3분 |
| 2차 | 2분 | 5분 |
| 3차 | 1분 | 6분 |
| 4차 | 1분 | 7분 |
| 5차 | 1분 | 8분 |

완료되지 않았으면 이후 1분 간격으로 계속 확인합니다.
