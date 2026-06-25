# Antigravity CLI(agy) 통합 개발 가이드

LLM Router MCP에서 Antigravity CLI(`agy`)를 child_process로 spawn 호출하면서 발견한 문제와 우회책을 정리한 문서. agy를 자동화/서버/CI 환경에서 통합하려는 개발자를 위한 실전 가이드.

> **최신 검증 기준**: agy 1.0.8 / LLM Router MCP v2.4.4 (2026-06-09)
> **공식 GitHub**: <https://github.com/google-antigravity/antigravity-cli>

---

## TL;DR — 자동화 환경에서 agy 호출 시 반드시 알아야 할 5가지

1. **`agy -p` print mode는 TTY가 아닐 때 stdout으로 응답을 출력하지 않는다** (1.0.0~1.0.8 전 버전 미해결, [Issue #7](https://github.com/google-antigravity/antigravity-cli/issues/7))
2. **우회책**: prompt에 임시 파일 경로를 명시하고 agy의 file editing tool로 답변을 받는다 (`--dangerously-skip-permissions` 필수)
3. **`--model` argv**는 1.0.5부터 공식 지원. 그 이전은 `~/.gemini/antigravity-cli/settings.json`의 `model` 필드를 mutate해야 했고 동시 호출 race 위험이 있었음
4. **`child_process.spawn`은 `shell: false` 필수**: Windows cmd.exe가 prompt의 백슬래시 경로/줄바꿈을 깨트림
5. **인증 셸 lifetime 의존성**: 인증한 셸이 살아있을 때만 자식 프로세스가 인증을 상속받음 (Windows). Linux headless는 [Issue #53](https://github.com/google-antigravity/antigravity-cli/issues/53) 워크어라운드 필요

---

## 1. 설치

### 1.1 공식 설치 스크립트
```bash
# macOS / Linux
curl -fsSL https://antigravity.google/cli/install.sh | bash

# Windows PowerShell
irm https://antigravity.google/cli/install.ps1 | iex
```

### 1.2 설치 위치 (Windows 기본값)
- 바이너리: `%LOCALAPPDATA%\agy\bin\agy.exe` (예: `C:\Users\<USER>\AppData\Local\agy\bin\agy.exe`)
- PATH 자동 추가 안 됨 → 수동 추가 필요:
  ```powershell
  [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$env:LOCALAPPDATA\agy\bin", "User")
  ```
  새 셸을 열어야 적용됨.

### 1.3 npm 패키지 없음
- `@google/antigravity-cli` npm registry에 **존재하지 않음** (404)
- Go로 재작성된 네이티브 바이너리. Gemini CLI(Node.js)와 다름
- 따라서 `npm install -g`로 agy를 받을 수 없고, OS별 인스톨러만 사용

### 1.4 특정 버전 다운로드 (downgrade 등)
GitHub Releases에서 직접 받기:
```bash
# 예: 1.0.5로 다운그레이드 (Windows x64)
curl -L -o agy-1.0.5.zip https://github.com/google-antigravity/antigravity-cli/releases/download/1.0.5/agy_cli_windows_x64.zip
unzip agy-1.0.5.zip                                              # antigravity.exe 추출
cp "$LOCALAPPDATA/agy/bin/agy.exe" "$LOCALAPPDATA/agy/bin/agy.exe.bak"  # 백업
cp antigravity.exe "$LOCALAPPDATA/agy/bin/agy.exe"               # 교체
agy --version                                                    # 1.0.5 확인
```

Linux/macOS는 `agy_cli_linux_x64.tar.gz` 등 다른 asset 사용.

### 1.5 자동 업데이트
- agy는 **15분마다 update 체크** (로그에 `auto_updater.go: Last check was less than 15 minutes ago, skipping update`)
- 명시적 비활성화 환경변수는 공식 문서에 없음 (2026-06 기준)
- downgrade해도 다음 자동 업데이트에서 다시 올라갈 위험 → 회귀 발견 시 반복 대응 필요

---

## 2. 인증

### 2.1 기본 흐름
- `agy` 단독 실행 시 OAuth (Google Sign-In) — 브라우저 자동 열림
- 토큰은 OS keyring에 저장 (Windows Credential Manager, macOS Keychain, Linux DBus secret service)
- `/logout` 명령으로 세션 종료

### 2.2 핵심 제약 — 인증 셸 lifetime 의존성 (Windows)
**현상**: 인증한 셸을 닫으면 새 셸에서 재인증 요구
- PowerShell A에서 `agy` 실행 → OAuth 완료
- A를 그대로 두고 새 셸 B에서 `agy` → 인증된 상태
- A를 닫고 새 셸 C → 재인증 요구

**원인 추정**: keyring 접근이 부모 프로세스의 인증 세션에 묶임

**자동화 환경에서의 의미**:
- MCP 서버, CI/CD, 데몬 환경에서 spawn한 agy 자식은 부모(MCP 서버) 셸의 인증을 상속받음
- 부모가 인증된 상태로 살아있어야 자식이 동작

### 2.3 headless Linux 인증 — [Issue #53](https://github.com/google-antigravity/antigravity-cli/issues/53)
SSH headless 환경에서 무한 인증 루프 발생. 원인:
1. keyring(libsecret/dbus) collection이 잠겨있어 silent 실패
2. 한국(KST UTC+9)/태평양(CST UTC+8) 타임존에서 FileKeychain 토큰 expiry 산술 버그로 토큰이 즉시 만료됨

**워크어라운드**:
```bash
export GEMINI_FORCE_FILE_STORAGE=true    # keyring 우회, 파일 토큰 저장
export TZ=UTC                            # timezone 버그 회피
agy                                       # OAuth 한 번 진행
```
- 한 번 인증 후엔 토큰이 파일에 저장되어 같은 env로 spawn 시 인증 상속

### 2.4 서비스 계정 토큰 (CI/headless용)
`ANTIGRAVITY_TOKEN` 환경변수로 비대화형 인증 가능 (문서에 언급되나 발급 방법은 명시 안 됨). 일반적인 OAuth refresh token을 export하는 방식으로 추정.

### 2.5 인증 디렉토리 위치
- `~/.gemini/antigravity-cli/` (디렉토리 이름이 `.gemini`인 건 Gemini CLI에서 마이그레이션 흔적)
  - `settings.json` — 설정 (model, colorScheme, trustedWorkspaces)
  - `cache/` — 캐시
  - `conversations/*.pb` — protobuf 대화 기록
  - `log/cli-YYYYMMDD_HHMMSS.log` — 호출별 로그
  - `history.jsonl` — 호출 히스토리
- `~/.antigravitycli/` — 프로젝트 메타데이터 (Windows에선 symlink 권한 부족으로 자주 실패하지만 critical 아님)

---

## 3. CLI 인터페이스 명세

### 3.1 핵심 인자 (1.0.8 기준)
| 인자 | 설명 |
|---|---|
| `-p` / `--print` / `--prompt` | 비대화형 단일 prompt 모드 |
| `--print-timeout <duration>` | print mode timeout (기본 `5m`, Go duration 형식: `30s`, `2m`, `1h30m`) |
| `--model <name>` | **1.0.5부터** 모델 지정. 표시명 형식 ("Gemini 3.1 Pro (High)" 등) |
| `--dangerously-skip-permissions` | 자동 도구 승인 (기존 Gemini CLI의 `--yolo` 대체) |
| `--add-dir <path>` | 워크스페이스 디렉토리 추가 (repeatable) |
| `--continue` / `-c` | 가장 최근 대화 이어가기 |
| `--conversation <id>` | 특정 대화 ID resume |
| `--sandbox` | sandbox 모드 |
| `--log-file <path>` | CLI 로그 파일 경로 override |
| `--prompt-interactive` / `-i` | 초기 prompt 후 인터랙티브 모드 진입 |

### 3.2 Subcommands
- `changelog` — 버전 changelog 표시
- `models` — 사용 가능 모델 목록 (인증 필요)
- `install` — PATH/shell 설정
- `update` — agy 업데이트
- `plugin` — 플러그인 관리
- `help` — 서브커맨드 도움말

### 3.3 미지원 / 명시되지 않음 (자동화 영향)
| 항목 | 상태 |
|---|---|
| `--output-format json` | ❌ 미지원 — plain text만 |
| stdout 응답 보장 | ❌ TTY가 아닐 때 미작동 (Issue #7) |
| stdin pipe로 prompt 전달 | ⚠️ 불안정 (NonInteractive 환경에서 빈 응답 사례) |
| API key 인증 | ❌ ChatGPT 플랜 OAuth만 |
| --output-format json | ❌ 미지원 |

### 3.4 모델 ID 형식
- argv `--model` 값은 **표시명** 그대로: `"Gemini 3.1 Pro (High)"`, `"Claude Opus 4.6 (Thinking)"`, `"Gemini 3.5 Flash (Medium)"` 등
- 슬러그 형식(`gemini-3.1-pro-preview`)이 아님
- 공백/괄호 포함된 문자열이라 spawn 시 quoting 주의 (`shell: false` 권장, 아래 §5.1 참조)

### 3.5 모델 라우팅 우선순위 (1.0.x 기준)
1. **argv `--model`** (1.0.5+) — 가장 강력. per-call 지정
2. **`settings.json`의 `model` 필드** — fallback. argv 없을 때 사용
3. **사용자가 `/model` 슬래시 명령으로 선택한 default** — settings.json에 영구 저장됨

자동화 코드에서 `settings.json`을 mutate하면 사용자 데스크톱 GUI default를 흔들 위험 — argv `--model` 우선 권장.

---

## 4. 핵심 블로커: `-p` print mode stdout 무응답

### 4.1 증상
```bash
# TTY 환경 (사용자가 직접 PowerShell에서)
$ agy -p "ping"
Hello! How can I help you?  # ← 정상 응답

# child_process.spawn 환경
const { spawn } = require('child_process');
const p = spawn('agy', ['-p', 'ping'], { stdio: ['pipe', 'pipe', 'pipe'] });
// → exit 0, stdout 0B, stderr 0B (모든 1.0.x 버전)
```

### 4.2 원인 (추정)
- agy의 print mode 응답 출력 경로가 TTY 또는 인터랙티브 컨텍스트에 의존
- `--sandbox` deprecation, `--yolo` → `--dangerously-skip-permissions` 개명 등 print mode 코드 영역 변경이 잦지만 stdout 흐름 자체는 미해결
- [Issue #7](https://github.com/google-antigravity/antigravity-cli/issues/7) open 상태 유지

### 4.3 검증된 우회책 — 파일 출력 트릭

prompt에 임시 파일 경로를 명시하고 agy의 file editing tool로 답변을 받는다. agy는 응답을 stdout으로 못 보내지만, **tool calling 흐름은 정상 동작**한다는 점을 활용.

```typescript
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';

async function callAgy(prompt: string): Promise<string> {
  const outputPath = join(tmpdir(), `agy-out-${randomUUID()}.txt`);
  const wrapped = `${prompt}

---
IMPORTANT OUTPUT INSTRUCTION:
Write your COMPLETE answer to this exact file path: ${outputPath}
Write ONLY the answer content to that file. Do not include explanations about saving the file.
Do not create any other files or modify anything else.`;

  return new Promise((resolve, reject) => {
    const proc = spawn('agy', [
      '-p', wrapped,
      '--model', 'Gemini 3.1 Pro (High)',
      '--dangerously-skip-permissions',  // 도구 자동 승인 필수
      '--print-timeout', '120s',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,                       // ⚠️ 반드시 false (§5.1 참조)
      env: { ...process.env, GEMINI_FORCE_FILE_STORAGE: 'true', TZ: 'UTC' },
    });

    proc.stdin.end();
    proc.on('close', () => {
      try {
        if (!existsSync(outputPath)) {
          reject(new Error('agy did not write output file'));
          return;
        }
        const content = readFileSync(outputPath, 'utf-8').trim();
        unlinkSync(outputPath);
        resolve(content);
      } catch (err) {
        reject(err);
      }
    });
    proc.on('error', reject);
  });
}
```

### 4.4 안전 고려사항 — `--dangerously-skip-permissions` 사용
- 이 인자는 agy의 **모든 도구 호출을 자동 승인** (file write, shell exec 등)
- 우리 prompt는 임시 파일 한 곳만 명시하지만, 모델이 prompt 지시를 100% 따른다는 보장은 없음
- 코드 리뷰/분석 같은 read-only 작업에선 비교적 안전
- 코드 수정 prompt에선 의도된 파일 외 다른 곳을 수정할 이론적 리스크 있음
- 자동화 권한 범위를 좁히려면 `--sandbox` 옵션 고려 가능 (단, sandbox는 우리 검증 범위 밖)

### 4.5 응답 latency
- TTY 직접 호출: 5~15초 (모델 의존)
- spawn 파일 우회: **15~40초** (cold-start + 모델 + file write 추가)
- Gemini 3.1 Pro (High): 26~40초
- Claude Opus 4.6 (Thinking): quota 차단 시 즉시 fallback (수십 ms 추가)

### 4.6 버전별 회귀 이력
| agy 버전 | TTY 직접 | spawn stdout 직접 | spawn 파일 우회 |
|---|---|---|---|
| 1.0.0 ~ 1.0.5 | ✅ | ❌ | ✅ |
| **1.0.6** | ✅ | ❌ | **❌ 회귀** — file tool 호출조차 막힘 (changelog의 `--sandbox flag propagation in headless print mode` fix가 부수효과) |
| 1.0.7 | ✅ | ❌ | ✅ (1.0.6 회귀 풀림) |
| 1.0.8 | ✅ | ❌ | ✅ |

⚠️ **1.0.6은 명시적으로 회피해야 함**. 자동 업데이트로 올라가면 1.0.5 또는 1.0.7로 downgrade.

---

## 5. spawn 환경 주의사항

### 5.1 `shell: false` 필수 (Windows)

```typescript
spawn('agy', args, {
  shell: false,    // ⚠️ true면 cmd.exe 경유, 백슬래시 경로/줄바꿈 quoting 깨짐
  windowsHide: true,
});
```

`shell: true`로 호출하면 `cmd.exe`가 인자를 한 번 더 파싱하면서:
- 임시 파일 경로 `C:\Users\...\agy-out-<uuid>.txt`의 백슬래시가 escape 시퀀스로 해석됨
- prompt 안의 `\n` (줄바꿈)이 깨져서 agy가 잘못된 prompt를 받음
- 결과: agy가 파일을 안 만들고 silent 종료

### 5.2 stdin 즉시 close
```typescript
proc.stdin.end();  // 안 닫으면 agy가 인터랙티브 입력 대기로 들어가 hang
```

특히 `--print` 모드라도 stdin이 안 닫히면 agy가 인터랙티브 fallback할 수 있음 (1.0.6+ 일부 버전에서 관찰됨).

### 5.3 환경변수 정리
spawn 시 부모 환경에서 Claude Code 등의 자체 환경변수가 자식에게 상속되면 충돌 가능. clean env 사용 권장:
```typescript
const { CLAUDECODE, ...cleanEnv } = process.env;
spawn('agy', args, {
  env: { ...cleanEnv, GEMINI_FORCE_FILE_STORAGE: 'true', TZ: 'UTC' },
});
```

### 5.4 timeout 처리
- agy의 `--print-timeout`는 모델 응답 대기만 처리. 프로세스 자체 hang은 별도
- 부모에서도 `setTimeout` + `proc.kill('SIGTERM')` → fallback `SIGKILL` 권장
- Windows는 SIGTERM이 안 먹는 케이스가 있어 SIGKILL 예비 필수

---

## 6. 모델 관리

### 6.1 권장: `--model` argv per-call (1.0.5+)
- settings.json mutate 없음 → race condition 사라짐
- 동시 호출 진정한 병렬 가능
- 데스크톱 GUI default model 영향 없음

### 6.2 비권장: settings.json mutate (1.0.4 이하)
- 글로벌 단일 파일이라 동시 호출 시 race
- 회피하려면 mutex 직렬화 필요 → 병렬성 손상 (호출당 25초일 때 7명 expert = 3분+)
- 데스크톱 GUI default가 매번 흔들림

### 6.3 quota 차단 자동 fallback 패턴
agy는 quota 소진 시 RESOURCE_EXHAUSTED (429) 에러를 로그에 남김. `--log-file`로 로그를 캡처하면 quota 감지 가능:

```typescript
const QUOTA_PATTERN = /RESOURCE_EXHAUSTED|code 429|Individual quota reached|quota exceeded/i;
const QUOTA_BLOCK_MS = 90 * 60 * 1000;  // 1h30m — agy quota reset 주기 관찰값

const quotaExhausted = new Map<string, number>();

function pickAvailableModel(priority: string[]): string | null {
  const now = Date.now();
  for (const model of priority) {
    const unblock = quotaExhausted.get(model);
    if (!unblock || unblock < now) {
      if (unblock) quotaExhausted.delete(model);
      return model;
    }
  }
  return null;
}

async function callWithFallback(priority: string[], prompt: string): Promise<string> {
  for (let i = 0; i < priority.length; i++) {
    const model = pickAvailableModel(priority);
    if (!model) throw new Error('All models quota-exhausted');

    const { content, logContent } = await spawnAgy(model, prompt);
    if (QUOTA_PATTERN.test(logContent)) {
      quotaExhausted.set(model, Date.now() + QUOTA_BLOCK_MS);
      continue;  // 다음 모델로
    }
    return content;
  }
  throw new Error('Fallback exhausted');
}
```

### 6.4 표시명 형식 주의
- "Gemini 3.1 Pro (High)" — 공백/괄호 포함
- `shell: false` + args 배열로 전달하면 OS가 알아서 quoting 처리
- shell 경유 시 따옴표 escape 주의

---

## 7. 자주 마주치는 에러 메시지

| 에러 메시지 | 원인 | 해결 |
|---|---|---|
| `You are not logged into Antigravity` | keyring에서 토큰 못 가져옴 | 인증 셸 살려두기 또는 `GEMINI_FORCE_FILE_STORAGE=true` |
| `Failed to poll FetchAvailableModels: ... not logged into Antigravity` | 위와 동일 | 위와 동일 |
| `project: symlink ... A required privilege is not held by the client` | Windows symlink 권한 부족 | 무시 가능 (Developer Mode 켜면 해소). agy는 그래도 계속 진행 |
| `Print mode: not authenticated, trying silent auth` | print mode가 인증 자동 시도 중 | 정상. 그 다음 줄 `authenticated via keyring` 보이면 성공 |
| `flags provided but not defined: -model` | agy 1.0.4 이하에서 `--model` argv 사용 | 1.0.5 이상으로 업그레이드 또는 settings.json mutate |
| `CLI ready for user input` 후 hang | `-p`가 인터랙티브 모드로 fallback (1.0.6 회귀) | 1.0.5 또는 1.0.7+로 downgrade/upgrade |
| `Antigravity CLI did not write expected output file` | 파일 우회 실패 (agy가 응답 안 함 또는 잘못된 경로) | 1.0.6이면 downgrade, 그 외엔 prompt 검토 |

---

## 8. 디버깅 팁

### 8.1 agy CLI 로그 확인
호출별 로그가 `~/.gemini/antigravity-cli/log/cli-YYYYMMDD_HHMMSS.log`에 자동 기록.
```bash
# 가장 최근 로그 보기
ls -t ~/.gemini/antigravity-cli/log/ | head -1 | xargs -I{} tail -50 ~/.gemini/antigravity-cli/log/{}
```

주요 로그 패턴:
- `printmode.go:71 Print mode: starting (promptLength=N, model=X, conversationID=)` — print mode 진입
- `auth.go:114 ChainedAuth: authenticated via keyring` — 인증 성공
- `model_resolver.go: Resolving model X` — `--model` argv 인식
- `URL: https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` — API 호출 시작
- `CLI ready for user input` — ⚠️ 인터랙티브 모드 진입 (print mode 실패 신호)

### 8.2 별도 로그 파일로 디버깅
```bash
agy -p "ping" --log-file /tmp/agy-debug.log --dangerously-skip-permissions
cat /tmp/agy-debug.log
```

### 8.3 호출 흐름 비교
직접 호출 vs spawn 호출 결과가 다르면 환경변수/cwd/stdin 차이일 가능성:
```bash
# 직접
agy -p "test"

# spawn 시뮬레이션
echo "" | agy -p "test"      # stdin pipe
agy -p "test" > out.txt      # stdout redirect (TTY 깨짐)
```

`out.txt`가 비어있으면 TTY 의존 = spawn에서도 안 됨.

---

## 9. 관련 GitHub Issues

추적할 가치 있는 open issue들 ([repo](https://github.com/google-antigravity/antigravity-cli/issues)):

| # | 제목 | 우리 영향 |
|---|---|---|
| **7** | feat(--print): emit per-conversation ID for headless callers | print mode 개선 — 풀리면 stdout 직접 응답도 같이 풀릴 가능성 |
| 35 | Feature request: Add a `--model` command line parameter | ✅ 1.0.5에서 해결 |
| 53 | Bug: Infinite authentication loop on headless Linux | headless Linux 인증 — `GEMINI_FORCE_FILE_STORAGE=true` + `TZ=UTC` 워크어라운드 적용 |
| 60 | Project-local `.antigravitycli/mcp_config.json` is read but ignored | 워크스페이스별 settings 무시 — HOME-level만 동작 |
| 66 | fails to sync MCP OAuth tokens and crashes on empty config | MCP 토큰 안정성 |
| 13 | No models available [WSL2] | WSL keyring 이슈 |

---

## 10. LLM Router MCP에서의 구현 참고

본 프로젝트에서 위 모든 내용이 실제로 반영된 파일:

- **Provider 구현**: `src/services/providers/antigravity-provider.ts`
  - 파일 우회, `shell: false`, env 자동 주입, quota 로그 감지
- **모델 관리**: `src/services/providers/antigravity-model-manager.ts`
  - 우선순위 + quota 차단 + 1h30m reset (mutex 없음, argv 기반)
- **Provider 라우팅**: `src/services/providers/index.ts`
  - `USE_ANTIGRAVITY=true` 토글로 Gemini CLI / Antigravity CLI 전환
- **spawn 헬퍼**: `src/services/providers/cli-spawner.ts`
  - `shell` 옵션 노출 (Antigravity는 `false` 전달)

환경변수 운영:
```bash
# .env
USE_ANTIGRAVITY=true
CLI_ANTIGRAVITY_PATH=C:\Users\GJ.PARK\AppData\Local\agy\bin\agy.exe  # PATH 미설정시
ANTIGRAVITY_MODEL_PRIORITY=Claude Opus 4.6 (Thinking),Gemini 3.1 Pro (High)
```

---

## 11. 권장 운영 패턴

1. **버전 핀**: 자동 업데이트가 회귀를 가져올 수 있어 1.0.5 또는 1.0.7+를 명시적으로 핀하고 changelog를 매번 확인
2. **모델 우선순위**: 비싼 모델(Claude Opus 4.6 Thinking) → 저렴한 모델(Gemini 3.1 Pro High) 순서로 priority 리스트 구성. quota 소진 자동 fallback
3. **인증 monitoring**: 자동화 환경에선 인증 갱신 자동 감지/알림 (cli log에서 `not logged into Antigravity` 패턴 감지)
4. **timeout 보수적**: agy cold-start가 길어 `--print-timeout 120s` 이상 + 부모 timeout은 추가 30초 마진
5. **MCP 서버 안정성**: agy 호출이 어딘가에서 throw해도 부모 프로세스가 죽지 않도록 `uncaughtException`/`unhandledRejection` 핸들러 필수 (silent crash로 dashboard 등 부수 서비스가 같이 사라지는 현상 방지)

---

## 12. 시행착오 일지 (LLM Router MCP)

| 날짜 | 버전 | 발견/조치 |
|---|---|---|
| 2026-05-21 | agy 1.0.0 | 처음 도입. `-p` spawn stdout 무응답 발견 → 파일 우회 방식 채택. v2.4.0 |
| 2026-05-22 | agy 1.0.1 | 마이너 패치. 우리 영향 없음 |
| 2026-05-22 | v2.4.1 | quota 차단 자동 fallback (settings.json mutate + mutex 직렬화 기반) |
| 2026-06-03 | agy 1.0.5 | `--model` argv 공식 지원 → settings.json mutate 폐기, mutex 제거. **진정한 병렬 회복** (3배 빠름). v2.4.2 |
| 2026-06-04 | v2.4.3 | `uncaughtException` 핸들러 추가 — dashboard silent crash 방지 |
| 2026-06-04 | v2.4.4 | codex GPT `reasoning_effort=high` + `service_tier=fast` 채택 (별개 작업) |
| 2026-06-06 | agy 1.0.6 | **회귀**: 파일 우회조차 작동 안 함 (file editing tool 호출 봉쇄). 1.0.5로 downgrade |
| 2026-06-09 | agy 1.0.7~1.0.8 | 회귀 풀림. 우리 v2.4.4가 1.0.8에서도 정상 동작 확인 |

---

마지막 갱신: 2026-06-09
