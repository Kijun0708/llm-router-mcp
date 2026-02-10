---
name: background-task
description: "백그라운드 작업 - 전문가 상담을 비동기로 실행하고 나중에 결과를 확인합니다"
disable-model-invocation: true
argument-hint: "<백그라운드로 실행할 작업>"
---

## Background Task (백그라운드 실행)

전문가 상담을 비동기로 실행하여, 다른 작업을 하면서 결과를 나중에 확인할 수 있습니다.

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

1. `background_expert_start({ expert: "reviewer", ... })` → task_id_1
2. `background_expert_start({ expert: "security", ... })` → task_id_2
3. `background_expert_start({ expert: "devops", ... })` → task_id_3
4. 각각 `background_expert_result`로 결과 수집
5. 결과 종합하여 사용자에게 제공
