# custommcp 개선 구현 계획

oh-my-opencode 벤치마킹 기반 부족한 기능 구현 계획

---

## 1. 구현 우선순위

### P0 - 핵심 기능 (필수)

| 순서 | 기능 | 예상 복잡도 | 파일 수 |
|------|------|------------|--------|
| 1 | TODO 강제 완료 | 중 | 1 |
| 2 | Boulder 상태 강화 | 중 | 1 |
| 3 | Sisyphus 오케스트레이터 | 상 | 1 |
| 4 | Agent 로더 | 중 | 3 |
| 5 | Command 로더 | 중 | 3 |
| 6 | CLI 설치 시스템 | 상 | 5+ |

### P1 - 중요 기능 (권장)

| 순서 | 기능 | 예상 복잡도 | 파일 수 |
|------|------|------------|--------|
| 7 | Think Mode | 중 | 2 |
| 8 | Preemptive Compaction | 중 | 1 |
| 9 | Rules Injector | 하 | 1 |
| 10 | Auto Update Checker | 하 | 1 |

---

## 2. Phase 1: Sisyphus 오케스트레이터 (P0)

### 2.1 TODO 강제 완료 메커니즘

**파일**: `src/hooks/builtin/todo-continuation-enforcer.ts`

**구현 내용**:

```typescript
// 핵심 로직
interface TodoEnforcerConfig {
  enabled: boolean;
  countdownSeconds: number;  // 기본값: 2
  excludedAgents: string[];  // 강제 완료 제외 에이전트
}

// 1. 세션 유휴 상태(session.idle) 이벤트 감지
// 2. TODO 목록에서 미완료 항목 확인
// 3. 카운트다운 시작 (사용자에게 알림)
// 4. 자동 프롬프트 주입: "[SYSTEM REMINDER - TODO CONTINUATION]"
// 5. 취소 조건: 사용자 입력, 복구 중, 배경 작업 실행 중
```

**주입 메시지 예시**:
```
[SYSTEM REMINDER - TODO CONTINUATION]

Incomplete tasks remain in your todo list. You must continue working on them.

Remaining tasks:
- Task 1 (in_progress)
- Task 2 (pending)
- Task 3 (pending)

Continue with the next task immediately.
```

### 2.2 Boulder 상태 추적 시스템 강화

**파일**: `src/features/boulder-state/manager.ts` (기존 파일 수정)

**추가 기능**:

```typescript
interface EnhancedBoulderState {
  // 기존 필드
  status: BoulderStatus;
  todos: Todo[];

  // 추가 필드
  activePlan: {
    id: string;
    description: string;
    startedAt: Date;
    phases: Phase[];
    currentPhase: number;
  } | null;

  continuationAttempts: number;
  lastContinuationAt: Date | null;
}

// 추가 메서드
class BoulderStateManager {
  // 활성 플랜 저장/복원
  savePlan(plan: ActivePlan): void;
  restorePlan(): ActivePlan | null;

  // 세션 유휴 시 남은 작업 감지
  hasIncompleteTasks(): boolean;
  getIncompleteTasksSummary(): string;

  // 볼더 연속 실행 프롬프트 생성
  generateContinuationPrompt(): string;
}
```

**볼더 연속 실행 프롬프트**:
```
[SYSTEM REMINDER - BOULDER CONTINUATION]

You have an active work plan with incomplete tasks.

Active Plan: "Implement user authentication feature"
Progress: Phase 2/4 (50%)

Incomplete items:
- Add JWT token validation
- Implement logout endpoint
- Write integration tests

Continue working on this plan. Do not abandon it.
```

### 2.3 Sisyphus 오케스트레이터 훅

**파일**: `src/hooks/builtin/sisyphus-orchestrator.ts` (신규)

**핵심 기능**:

```typescript
interface SisyphusConfig {
  enabled: boolean;
  delegationRequired: boolean;  // 직접 수정 금지
  verificationReminders: boolean;  // 검증 리마인더
  protectedPaths: string[];  // 직접 수정 허용 경로 (예: .sisyphus/)
}

interface SessionState {
  lastEventWasAbortError: boolean;
  pendingFilePaths: Set<string>;
  subagentTasks: Map<string, SubagentTask>;
}

// 핵심 훅 이벤트
const sisyphusHook: Hook = {
  events: ['tool.execute.before', 'tool.execute.after', 'session.idle'],

  async onToolExecuteBefore(context) {
    // 직접 수정 시도 감지 및 경고
    if (isDirectEditAttempt(context) && !isAllowedPath(context.path)) {
      return injectWarning(`
        ⚠️⚠️⚠️ [CRITICAL SYSTEM DIRECTIVE - DELEGATION REQUIRED]

        You are violating orchestrator protocol.
        You MUST delegate file modifications to subagents.

        Attempted to modify: ${context.path}

        Use the consult_expert or background_expert_start tool instead.
      `);
    }
  },

  async onToolExecuteAfter(context) {
    // 서브에이전트 작업 후 검증 리마인더
    if (isSubagentResponse(context)) {
      return injectReminder(`
        [VERIFICATION REQUIRED]

        ⚠️ Remember: Subagents may provide incomplete or incorrect information.

        Before marking this task complete, you MUST:
        1. Run LSP diagnostics (lsp_get_diagnostics)
        2. Run tests if applicable
        3. Review the actual code changes

        Never trust self-reported success from subagents.
      `);
    }
  }
};
```

---

## 3. Phase 2: Claude Code 통합 로더 (P0)

### 3.1 Agent 로더

**디렉토리**: `src/features/claude-code-agent-loader/`

#### types.ts

```typescript
export interface AgentDefinition {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  prompt: string;
  scope: 'user' | 'project';
}

export interface AgentFrontmatter {
  name?: string;
  description?: string;
  tools?: string;  // 쉼표 구분 문자열
  model?: string;
}
```

#### loader.ts

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const USER_AGENTS_PATH = path.join(os.homedir(), '.claude', 'agents');
const PROJECT_AGENTS_PATH = '.claude/agents';

export async function loadUserAgents(): Promise<Record<string, AgentDefinition>> {
  return loadAgentsFromDir(USER_AGENTS_PATH, 'user');
}

export async function loadProjectAgents(): Promise<Record<string, AgentDefinition>> {
  return loadAgentsFromDir(PROJECT_AGENTS_PATH, 'project');
}

async function loadAgentsFromDir(
  dirPath: string,
  scope: 'user' | 'project'
): Promise<Record<string, AgentDefinition>> {
  const agents: Record<string, AgentDefinition> = {};

  if (!fs.existsSync(dirPath)) {
    return agents;
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    const name = frontmatter.name || path.basename(file, '.md');

    agents[name] = {
      name,
      description: `(${scope}) ${frontmatter.description || 'Custom agent'}`,
      tools: parseToolsConfig(frontmatter.tools),
      model: frontmatter.model,
      prompt: body.trim(),
      scope
    };
  }

  return agents;
}

function parseFrontmatter(content: string): { frontmatter: AgentFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  return {
    frontmatter: yaml.load(match[1]) as AgentFrontmatter,
    body: match[2]
  };
}

function parseToolsConfig(tools?: string): string[] | undefined {
  if (!tools) return undefined;
  return tools.split(',').map(t => t.trim()).filter(Boolean);
}
```

### 3.2 Command 로더

**디렉토리**: `src/features/claude-code-command-loader/`

#### types.ts

```typescript
export interface CommandDefinition {
  name: string;
  description?: string;
  template: string;
  agent?: string;
  model?: string;
  scope: 'user' | 'project' | 'opencode-global' | 'opencode-project';
}

export interface CommandFrontmatter {
  description?: string;
  agent?: string;
  model?: string;
}
```

#### loader.ts

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LOAD_PATHS = [
  { path: () => path.join(os.homedir(), '.claude', 'commands'), scope: 'user' },
  { path: () => '.claude/commands', scope: 'project' },
  { path: () => path.join(os.homedir(), '.config', 'opencode', 'command'), scope: 'opencode-global' },
  { path: () => '.opencode/command', scope: 'opencode-project' }
] as const;

export async function loadAllCommands(): Promise<Record<string, CommandDefinition>> {
  const results = await Promise.all(
    LOAD_PATHS.map(({ path: getPath, scope }) =>
      loadCommandsFromDir(getPath(), scope as CommandDefinition['scope'])
    )
  );

  // 병합 (우선순위: projectOpencode < global < project < user)
  const [user, project, global, projectOpencode] = results;
  return { ...projectOpencode, ...global, ...project, ...user };
}

async function loadCommandsFromDir(
  dirPath: string,
  scope: CommandDefinition['scope'],
  prefix: string = '',
  visited: Set<string> = new Set()
): Promise<Record<string, CommandDefinition>> {
  const commands: Record<string, CommandDefinition> = {};

  // 순환 참조 방지
  const realPath = fs.realpathSync(dirPath);
  if (visited.has(realPath)) return commands;
  visited.add(realPath);

  if (!fs.existsSync(dirPath)) return commands;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // 재귀적 네임스페이싱
      const newPrefix = prefix ? `${prefix}:${entry.name}` : entry.name;
      const subCommands = await loadCommandsFromDir(fullPath, scope, newPrefix, visited);
      Object.assign(commands, subCommands);
    } else if (entry.name.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);

      const baseName = path.basename(entry.name, '.md');
      const commandName = prefix ? `${prefix}:${baseName}` : baseName;

      commands[commandName] = {
        name: commandName,
        description: frontmatter.description,
        template: wrapTemplate(body),
        agent: frontmatter.agent,
        model: sanitizeModelField(frontmatter.model),
        scope
      };
    }
  }

  return commands;
}

function wrapTemplate(template: string): string {
  // $ARGUMENTS 플레이스홀더 분리
  const parts = template.split('$ARGUMENTS');
  if (parts.length === 1) {
    return `<command-instruction>\n${template}\n</command-instruction>`;
  }

  return `<command-instruction>\n${parts[0]}\n</command-instruction>\n$ARGUMENTS${parts.slice(1).join('$ARGUMENTS')}`;
}

function sanitizeModelField(model?: string): string | undefined {
  if (!model) return undefined;
  // 모델 유효성 검사
  const validModels = ['claude-opus-4-5', 'claude-sonnet-4-5', 'gpt-5.2', 'gemini-3-pro'];
  return validModels.includes(model) ? model : undefined;
}
```

---

## 4. Phase 3: CLI 설치 시스템 (P0)

### 4.1 CLI 진입점

**파일**: `src/cli/index.ts`

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { install } from './install.js';
import { doctor } from './commands/doctor.js';
import { update } from './commands/update.js';

const program = new Command();

program
  .name('custommcp')
  .description('LLM Router MCP - Multi-LLM collaboration for Claude Code')
  .version('2.0.0');

program
  .command('install')
  .description('Install and configure custommcp for Claude Code')
  .option('--no-tui', 'Non-interactive installation')
  .option('--claude <mode>', 'Claude subscription mode (yes/no/max20)', 'yes')
  .option('--chatgpt <mode>', 'ChatGPT subscription mode (yes/no)', 'no')
  .option('--gemini <mode>', 'Gemini subscription mode (yes/no)', 'no')
  .action(install);

program
  .command('doctor')
  .description('Diagnose installation and configuration')
  .action(doctor);

program
  .command('update')
  .description('Check for and install updates')
  .action(update);

program.parse();
```

### 4.2 설치 스크립트

**파일**: `src/cli/install.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as prompts from '@clack/prompts';
import pc from 'picocolors';

interface InstallOptions {
  tui: boolean;
  claude: string;
  chatgpt: string;
  gemini: string;
}

export async function install(options: InstallOptions) {
  console.log(pc.bold('\n🚀 custommcp 설치 시작\n'));

  let config: InstallConfig;

  if (options.tui) {
    config = await interactiveInstall();
  } else {
    config = parseNonInteractiveOptions(options);
  }

  // 1. MCP 설정 추가
  await addMcpConfiguration(config);

  // 2. 기본 에이전트 설치
  await installDefaultAgents(config);

  // 3. 기본 명령어 설치
  await installDefaultCommands(config);

  // 4. 완료 안내
  printCompletionMessage(config);
}

async function addMcpConfiguration(config: InstallConfig) {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  let settings: any = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  }

  settings.mcpServers = settings.mcpServers || {};
  settings.mcpServers['llm-router'] = {
    command: 'node',
    args: [path.join(__dirname, '..', '..', 'dist', 'index.js')]
  };

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  console.log(pc.green('✓ MCP 서버 설정 완료'));
}

async function installDefaultAgents(config: InstallConfig) {
  const agentsDir = path.join(os.homedir(), '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  const defaultAgents = getDefaultAgents(config);

  for (const [name, content] of Object.entries(defaultAgents)) {
    const filePath = path.join(agentsDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content);
      console.log(pc.green(`✓ 에이전트 설치: ${name}`));
    }
  }
}

function getDefaultAgents(config: InstallConfig): Record<string, string> {
  return {
    'sisyphus': `---
name: sisyphus
description: Main orchestrator that ensures task completion
tools: consult_expert, background_expert_start, boulder_status
---

You are Sisyphus, the tireless orchestrator.

Your role:
1. Break down complex tasks into smaller, manageable pieces
2. Delegate work to specialized experts
3. Verify all work is completed correctly
4. Never give up until the task is done

Remember: You must DELEGATE, not implement directly.
`,
    'oracle': `---
name: oracle
description: Strategic advisor for architecture and debugging
tools: lsp_get_definition, lsp_get_references, ast_grep_search
---

You are Oracle, the strategic advisor.

Your expertise:
1. System architecture design
2. Complex debugging strategies
3. Performance optimization
4. Security analysis

Provide thoughtful, strategic advice.
`
  };
}
```

### 4.3 Config Manager

**파일**: `src/cli/config-manager.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ConfigManager {
  private settingsPath: string;

  constructor() {
    this.settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  }

  read(): ClaudeSettings {
    if (!fs.existsSync(this.settingsPath)) {
      return { mcpServers: {} };
    }
    return JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
  }

  write(settings: ClaudeSettings): void {
    fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
  }

  addMcpServer(name: string, config: McpServerConfig): void {
    const settings = this.read();
    settings.mcpServers = settings.mcpServers || {};
    settings.mcpServers[name] = config;
    this.write(settings);
  }

  removeMcpServer(name: string): void {
    const settings = this.read();
    if (settings.mcpServers) {
      delete settings.mcpServers[name];
      this.write(settings);
    }
  }

  isMcpServerInstalled(name: string): boolean {
    const settings = this.read();
    return !!(settings.mcpServers && settings.mcpServers[name]);
  }
}
```

---

## 5. Phase 4: Think Mode 지원 (P1)

### 5.1 Think Mode 훅

**파일**: `src/hooks/builtin/think-mode.ts`

```typescript
import { Hook, HookContext } from '../types.js';

interface ThinkModeConfig {
  enabled: boolean;
  autoActivateComplexity: number;  // 복잡도 임계값
  maxThinkingTokens: number;
}

export const thinkModeHook: Hook = {
  name: 'think-mode',
  description: 'Manages extended thinking mode for complex tasks',
  events: ['assistant.message.before'],

  async handler(context: HookContext) {
    const config = getThinkModeConfig();
    if (!config.enabled) return;

    const complexity = assessTaskComplexity(context);

    if (complexity >= config.autoActivateComplexity) {
      return {
        ...context,
        systemPrompt: context.systemPrompt + `

<extended_thinking>
For this complex task, use extended thinking to:
1. Break down the problem thoroughly
2. Consider multiple approaches
3. Identify potential issues before implementing
4. Plan verification steps

Think step by step before acting.
</extended_thinking>`
      };
    }
  }
};

function assessTaskComplexity(context: HookContext): number {
  // 복잡도 평가 로직
  let complexity = 0;

  const message = context.userMessage?.toLowerCase() || '';

  // 키워드 기반 복잡도
  const complexKeywords = ['refactor', 'migrate', 'redesign', 'architect', 'optimize'];
  complexity += complexKeywords.filter(k => message.includes(k)).length * 2;

  // 파일 수 기반 복잡도
  const fileCount = (message.match(/\.(ts|js|py|go|rs|java|cpp)x?/g) || []).length;
  complexity += Math.min(fileCount, 5);

  return complexity;
}
```

### 5.2 Thinking Block Validator

**파일**: `src/hooks/builtin/thinking-block-validator.ts`

```typescript
import { Hook, HookContext } from '../types.js';

export const thinkingBlockValidator: Hook = {
  name: 'thinking-block-validator',
  description: 'Validates and sanitizes thinking block output',
  events: ['assistant.message.after'],

  async handler(context: HookContext) {
    const content = context.assistantMessage?.content || '';

    // thinking 블록 추출 및 검증
    const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/g);

    if (!thinkingMatch) return;

    for (const block of thinkingMatch) {
      // 잘못된 형식 감지
      if (block.includes('</thinking><thinking>')) {
        console.warn('[thinking-block-validator] Nested thinking blocks detected');
      }

      // 빈 thinking 블록 감지
      const innerContent = block.replace(/<\/?thinking>/g, '').trim();
      if (!innerContent) {
        console.warn('[thinking-block-validator] Empty thinking block detected');
      }
    }
  }
};
```

---

## 6. Phase 5: 추가 기능 (P1-P2)

### 6.1 Preemptive Compaction

**파일**: `src/hooks/builtin/preemptive-compaction.ts`

```typescript
import { Hook, HookContext } from '../types.js';

interface PreemptiveCompactionConfig {
  enabled: boolean;
  threshold: number;  // 기본값: 0.7 (70%)
  targetReduction: number;  // 목표 감소율
}

export const preemptiveCompactionHook: Hook = {
  name: 'preemptive-compaction',
  description: 'Proactively compacts context before hitting limits',
  events: ['context.update'],

  async handler(context: HookContext) {
    const config = getCompactionConfig();
    if (!config.enabled) return;

    const usage = context.contextUsage || 0;

    if (usage >= config.threshold && usage < 0.9) {
      // 선제적 압축 시작
      console.log(`[preemptive-compaction] Usage at ${(usage * 100).toFixed(1)}%, initiating compaction`);

      return {
        ...context,
        compactionRequested: true,
        compactionConfig: {
          preserveRecent: 10,  // 최근 10개 메시지 보존
          summarizePrevious: true,
          targetUsage: 0.5
        }
      };
    }
  }
};
```

### 6.2 Rules Injector

**파일**: `src/hooks/builtin/rules-injector.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { Hook, HookContext } from '../types.js';

const RULES_PATHS = [
  '.claude/rules',
  '.opencode/rules'
];

export const rulesInjectorHook: Hook = {
  name: 'rules-injector',
  description: 'Injects project-specific rules into context',
  events: ['session.start', 'context.compact'],

  async handler(context: HookContext) {
    const rules = await loadProjectRules();

    if (rules.length === 0) return;

    const rulesContent = rules.map(r => `## ${r.name}\n${r.content}`).join('\n\n');

    return {
      ...context,
      systemPrompt: context.systemPrompt + `

<project-rules>
The following project-specific rules MUST be followed:

${rulesContent}
</project-rules>`
    };
  }
};

async function loadProjectRules(): Promise<Rule[]> {
  const rules: Rule[] = [];

  for (const rulesPath of RULES_PATHS) {
    if (!fs.existsSync(rulesPath)) continue;

    const files = fs.readdirSync(rulesPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(rulesPath, file), 'utf-8');
      rules.push({
        name: path.basename(file, '.md'),
        content: content.trim()
      });
    }
  }

  return rules;
}
```

### 6.3 Auto Update Checker

**파일**: `src/hooks/builtin/auto-update-checker.ts`

```typescript
import { Hook, HookContext } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CHECK_INTERVAL = 24 * 60 * 60 * 1000;  // 24시간
let lastCheck = 0;
let cachedUpdate: UpdateInfo | null = null;

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

export const autoUpdateCheckerHook: Hook = {
  name: 'auto-update-checker',
  description: 'Checks for package updates periodically',
  events: ['session.start'],

  async handler(context: HookContext) {
    const now = Date.now();

    if (now - lastCheck < CHECK_INTERVAL && cachedUpdate) {
      if (cachedUpdate.updateAvailable) {
        notifyUpdate(cachedUpdate);
      }
      return;
    }

    try {
      const updateInfo = await checkForUpdates();
      cachedUpdate = updateInfo;
      lastCheck = now;

      if (updateInfo.updateAvailable) {
        notifyUpdate(updateInfo);
      }
    } catch (error) {
      console.warn('[auto-update-checker] Failed to check for updates:', error);
    }
  }
};

async function checkForUpdates(): Promise<UpdateInfo> {
  const packageJson = require('../../package.json');
  const currentVersion = packageJson.version;

  const { stdout } = await execAsync('npm view llm-router-mcp version');
  const latestVersion = stdout.trim();

  return {
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion !== currentVersion
  };
}

function notifyUpdate(info: UpdateInfo) {
  console.log(`
╔════════════════════════════════════════════════════════╗
║  🆕 Update available: ${info.currentVersion} → ${info.latestVersion}
║  Run: npm update -g llm-router-mcp
╚════════════════════════════════════════════════════════╝
`);
}
```

---

## 7. 파일 목록

### 신규 파일

```
src/hooks/builtin/
├── todo-continuation-enforcer.ts    # TODO 강제 완료
├── sisyphus-orchestrator.ts         # 오케스트레이터
├── think-mode.ts                    # Think Mode
├── thinking-block-validator.ts      # Thinking 검증
├── preemptive-compaction.ts         # 선제적 압축
├── rules-injector.ts                # 규칙 주입
└── auto-update-checker.ts           # 자동 업데이트

src/features/
├── claude-code-agent-loader/
│   ├── index.ts
│   ├── loader.ts
│   └── types.ts
└── claude-code-command-loader/
    ├── index.ts
    ├── loader.ts
    └── types.ts

src/cli/
├── index.ts                         # CLI 진입점
├── install.ts                       # 설치 스크립트
├── config-manager.ts                # 설정 관리
├── types.ts
└── commands/
    ├── doctor.ts                    # 진단 명령
    └── update.ts                    # 업데이트 명령
```

### 수정 파일

```
src/features/boulder-state/manager.ts  # 볼더 상태 강화
src/hooks/index.ts                     # 새 훅 등록
package.json                           # bin 필드 추가, 의존성
```

---

## 8. 의존성 추가

```json
{
  "dependencies": {
    "commander": "^14.0.0",
    "@clack/prompts": "^0.11.0",
    "picocolors": "^1.1.1"
  },
  "bin": {
    "custommcp": "./dist/cli/index.js"
  }
}
```

---

## 9. 검증 계획

### 9.1 Sisyphus 오케스트레이터 테스트

```bash
# MCP 서버 시작
npm run build && node dist/index.js

# Claude Code에서 테스트
1. 복잡한 작업 요청 (예: "여러 파일에 걸친 리팩토링")
2. 작업 중 세션 유휴 상태 유도
3. TODO 강제 완료 동작 확인
4. 볼더 연속 실행 확인
```

### 9.2 Claude Code 통합 테스트

```bash
# 에이전트 로드 테스트
1. ~/.claude/agents/test-agent.md 생성
2. Claude Code 재시작
3. 에이전트 목록에서 test-agent 확인

# 명령어 로드 테스트
1. .claude/commands/test/hello.md 생성
2. /test:hello 명령어 실행 확인
```

### 9.3 CLI 설치 테스트

```bash
# 로컬 테스트
npm link
custommcp install --no-tui --claude=yes

# 설정 확인
cat ~/.claude/settings.json
ls ~/.claude/agents/
```
