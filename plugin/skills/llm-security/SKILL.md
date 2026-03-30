---
name: llm-security
description: "보안 감사 - OWASP Top 10 기반 취약점 분석, CWE 분류, 보안 취약점 탐지, 인증/인가 검토, 인젝션 탐지. '보안 점검', '취약점 있어?', '해킹 가능성', '보안 괜찮아?', 'XSS/SQL injection 확인' 같은 요청에 반응합니다"
argument-hint: "<감사 대상 모듈/API/시스템>"
---

## Security Audit

OWASP Top 10 기반의 보안 취약점 감사를 수행합니다. `consult_expert` MCP 도구로 `security` 전문가를 호출하세요.

### 사용법

```
consult_expert({
  expert: "security",
  message: "다음 코드의 보안 취약점을 분석해줘: [대상 코드/시스템]",
  context: "프로젝트 보안 요구사항"
})
```

### 점검 항목 (OWASP Top 10)

1. **A01: Broken Access Control** — 권한 상승, IDOR
2. **A02: Cryptographic Failures** — 약한 암호화, 하드코딩된 키
3. **A03: Injection** — SQL, NoSQL, OS 명령어 인젝션
4. **A04: Insecure Design** — 위협 모델링 부재, 안전하지 않은 비즈니스 로직
5. **A05: Security Misconfiguration** — 기본 설정, 불필요한 기능
6. **A06: Vulnerable Components** — 취약한 의존성, 알려진 CVE
7. **A07: Authentication Failures** — 약한 비밀번호 정책, 세션 관리
8. **A08: Data Integrity Failures** — 안전하지 않은 역직렬화
9. **A09: Security Logging Failures** — 감사 로그 부재
10. **A10: SSRF** — 검증되지 않은 URL, 내부 네트워크 접근

### 출력

- 발견된 취약점 목록 (CVSS 점수 포함)
- 영향 분석 및 공격 시나리오
- 수정 권장사항 (우선순위별)
- CWE 참조 링크
