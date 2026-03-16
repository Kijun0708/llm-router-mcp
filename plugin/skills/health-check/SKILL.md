---
name: health-check
description: "서버 상태 확인 - LLM Router 서버 상태, 대시보드 URL, 캐시 현황, 백그라운드 작업 상태를 확인합니다. '상태 확인', '서버 상태', '헬스체크', '대시보드', '캐시 정리' 같은 요청에 반응합니다"
argument-hint: "<옵션: clear_cache, cleanup_tasks>"
---

## Health Check (서버 상태 확인)

LLM Router MCP 서버의 상태를 확인하고, 대시보드 URL을 제공합니다.

### 기본 상태 확인

```
llm_router_health({})
```

### 캐시 초기화

```
llm_router_health({ clear_cache: true })
```

### 완료된 백그라운드 작업 정리

```
llm_router_health({ cleanup_tasks: true })
```

### 반환 정보

- **서버 상태**: uptime, 버전
- **대시보드 URL**: 브라우저에서 열어서 실시간 모니터링
- **캐시 현황**: 캐시된 응답 수, 히트율
- **백그라운드 작업**: 실행 중/대기 중/완료 작업 수
- **Rate Limit 상태**: 현재 제한된 모델 목록
