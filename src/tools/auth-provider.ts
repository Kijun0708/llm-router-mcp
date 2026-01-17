// src/tools/auth-provider.ts

import { z } from 'zod';
import { spawn } from 'child_process';
import { existsSync, readdirSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * CLIProxyAPI 설정 파일 확인 및 자동 생성
 * @returns { valid: boolean, message?: string }
 */
function ensureCliproxyConfig(cliproxyPath: string): { valid: boolean; message?: string } {
  const cliproxyDir = dirname(cliproxyPath);
  const configPath = join(cliproxyDir, 'config.yaml');
  const examplePath = join(cliproxyDir, 'config.example.yaml');

  // config.yaml이 이미 있으면 OK
  if (existsSync(configPath)) {
    return { valid: true };
  }

  // config.example.yaml이 있으면 복사
  if (existsSync(examplePath)) {
    try {
      copyFileSync(examplePath, configPath);
      logger.info({ configPath }, 'Created config.yaml from config.example.yaml');
      return { valid: true };
    } catch (error) {
      logger.error({ error }, 'Failed to create config.yaml');
      return {
        valid: false,
        message: `config.yaml 생성 실패: ${error instanceof Error ? error.message : String(error)}\n\n수동으로 생성하세요:\n\`\`\`bash\ncd ${cliproxyDir}\ncopy config.example.yaml config.yaml\n\`\`\``
      };
    }
  }

  // 둘 다 없으면 에러
  return {
    valid: false,
    message: `CLIProxyAPI 설정 파일이 없습니다.\n\n필요한 파일: ${configPath}\n\nconfig.yaml 파일을 CLIProxyAPI 폴더에 생성하세요.\n참고: https://github.com/niceffyu/CLIProxyAPI`
  };
}

// 인증 상태 확인 스키마
export const authStatusSchema = z.object({}).strict();

export const authStatusTool = {
  name: "auth_status",
  description: `현재 AI 프로바이더 인증 상태를 확인합니다.

각 프로바이더(GPT, Claude, Gemini)의 인증 여부를 표시합니다.
인증되지 않은 프로바이더는 auth_gpt, auth_claude, auth_gemini 도구로 인증할 수 있습니다.`
};

// 프로바이더 인증 스키마 (개별 도구용 - 파라미터 없음)
export const authProviderSchema = z.object({}).strict();

export const authGptTool = {
  name: "auth_gpt",
  description: `GPT/Codex OAuth 인증을 시작합니다.

브라우저가 열리면 OpenAI/Codex 계정으로 로그인하세요.
인증 완료 후 GPT 5.x 모델을 사용할 수 있습니다.`
};

export const authClaudeTool = {
  name: "auth_claude",
  description: `Claude OAuth 인증을 시작합니다.

브라우저가 열리면 Anthropic 계정으로 로그인하세요.
인증 완료 후 Claude Sonnet/Opus 모델을 사용할 수 있습니다.`
};

export const authGeminiTool = {
  name: "auth_gemini",
  description: `Gemini OAuth 인증을 시작합니다.

브라우저가 열리면 Google 계정으로 로그인하세요.
인증 완료 후 Gemini Pro/Flash 모델을 사용할 수 있습니다.`
};

// 인증 파일 경로
const AUTH_DIR = join(homedir(), '.cli-proxy-api');

// 프로바이더별 인증 파일 패턴
const AUTH_PATTERNS: Record<string, RegExp> = {
  claude: /^claude-.*\.json$/,
  gpt: /^codex-.*\.json$/,
  gemini: /^.*-gen-lang-client-.*\.json$/
};

// 프로바이더별 로그인 플래그
const LOGIN_FLAGS: Record<string, string> = {
  gpt: '-codex-login',
  claude: '-claude-login',
  gemini: '-login'  // Google OAuth
};

/**
 * 인증 상태 확인
 */
export function checkAuthStatus(): Record<string, { authenticated: boolean; files: string[] }> {
  const status: Record<string, { authenticated: boolean; files: string[] }> = {
    gpt: { authenticated: false, files: [] },
    claude: { authenticated: false, files: [] },
    gemini: { authenticated: false, files: [] }
  };

  if (!existsSync(AUTH_DIR)) {
    return status;
  }

  try {
    const files = readdirSync(AUTH_DIR);

    for (const [provider, pattern] of Object.entries(AUTH_PATTERNS)) {
      const matchingFiles = files.filter(f => pattern.test(f));
      status[provider] = {
        authenticated: matchingFiles.length > 0,
        files: matchingFiles
      };
    }
  } catch (error) {
    logger.error({ error }, 'Failed to check auth status');
  }

  return status;
}

/**
 * 특정 프로바이더의 인증 파일 개수 확인
 */
function getAuthFileCount(provider: string): number {
  if (!existsSync(AUTH_DIR)) return 0;

  try {
    const files = readdirSync(AUTH_DIR);
    const pattern = AUTH_PATTERNS[provider];
    if (!pattern) return 0;
    return files.filter(f => pattern.test(f)).length;
  } catch {
    return 0;
  }
}

/**
 * 인증 파일이 새로 생성될 때까지 대기
 */
async function waitForAuthFile(provider: string, initialCount: number, timeoutMs: number = 120000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2초마다 확인

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const currentCount = getAuthFileCount(provider);
    if (currentCount > initialCount) {
      return true; // 새 인증 파일 생성됨
    }
  }

  return false;
}

/**
 * 프로바이더 인증 시작
 */
export async function startProviderAuth(provider: string): Promise<{ success: boolean; message: string; pending?: boolean }> {
  const cliproxyPath = config.cliproxyPath;

  if (!cliproxyPath || !existsSync(cliproxyPath)) {
    return {
      success: false,
      message: `CLIProxyAPI 경로를 찾을 수 없습니다. config.ts의 cliproxyPath를 확인하세요.\n현재 경로: ${cliproxyPath || '(설정 안됨)'}`
    };
  }

  // config.yaml 확인 및 자동 생성
  const configCheck = ensureCliproxyConfig(cliproxyPath);
  if (!configCheck.valid) {
    return {
      success: false,
      message: configCheck.message || 'config.yaml 설정 오류'
    };
  }

  const loginFlag = LOGIN_FLAGS[provider];
  if (!loginFlag) {
    return {
      success: false,
      message: `알 수 없는 프로바이더: ${provider}`
    };
  }

  // 현재 인증 파일 개수 기록 (새 파일 생성 감지용)
  const initialAuthCount = getAuthFileCount(provider);

  logger.info({ provider, cliproxyPath, initialAuthCount }, 'Starting provider authentication');

  // MCP는 stdio로 통신하므로, 자식 프로세스는 stdio를 완전히 분리
  const proc = spawn(cliproxyPath, [loginFlag], {
    stdio: 'ignore',  // 모든 stdio 무시
    detached: true,   // 독립 프로세스로 실행
    shell: false,
    windowsHide: false
  });

  // 에러 핸들링
  proc.on('error', (error) => {
    logger.error({ error, provider }, 'Auth process spawn failed');
  });

  // 부모 프로세스와 완전히 분리
  proc.unref();

  // 잠시 대기 후 프로세스 시작 확인
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 인증 파일 생성 대기 (최대 2분)
  logger.info({ provider }, 'Waiting for auth file to be created...');
  const authSuccess = await waitForAuthFile(provider, initialAuthCount, 120000);

  if (authSuccess) {
    return {
      success: true,
      message: `${provider.toUpperCase()} 인증이 완료되었습니다.`
    };
  } else {
    // 타임아웃 - 아직 인증 중일 수 있음
    return {
      success: false,
      pending: true,
      message: `인증 대기 시간이 초과되었습니다. 브라우저에서 인증을 완료했다면 \`auth_status\`로 확인해주세요.`
    };
  }
}

/**
 * 인증 상태 핸들러
 */
export async function handleAuthStatus() {
  const status = checkAuthStatus();

  let response = `## 🔐 AI 프로바이더 인증 상태\n\n`;

  const providers = [
    { key: 'gpt', name: 'GPT/Codex', models: 'GPT 5.x' },
    { key: 'claude', name: 'Claude', models: 'Sonnet, Opus' },
    { key: 'gemini', name: 'Gemini', models: 'Pro, Flash' }
  ];

  for (const { key, name, models } of providers) {
    const { authenticated, files } = status[key];
    const icon = authenticated ? '✅' : '❌';
    const statusText = authenticated ? '인증됨' : '미인증';

    response += `### ${icon} ${name}\n`;
    response += `- **상태**: ${statusText}\n`;
    response += `- **사용 가능 모델**: ${models}\n`;

    if (authenticated && files.length > 0) {
      response += `- **인증 파일**: ${files[0]}\n`;
    } else {
      response += `- **인증 방법**: \`auth_${key}\` 도구 사용\n`;
    }
    response += '\n';
  }

  // 미인증 프로바이더가 있으면 안내
  const unauthenticated = providers.filter(p => !status[p.key].authenticated);
  if (unauthenticated.length > 0) {
    response += `---\n💡 **Tip**: 미인증 프로바이더는 해당 전문가 사용 시 폴백됩니다.\n`;
  }

  return {
    content: [{
      type: "text" as const,
      text: response
    }]
  };
}

/**
 * 프로바이더 인증 핸들러
 */
export async function handleAuthProvider(provider: string) {
  const providerNames: Record<string, string> = {
    gpt: 'GPT/Codex',
    claude: 'Claude',
    gemini: 'Gemini'
  };

  const name = providerNames[provider] || provider;

  // 이미 인증되어 있는지 확인
  const status = checkAuthStatus();
  if (status[provider]?.authenticated) {
    return {
      content: [{
        type: "text" as const,
        text: `## ✅ ${name} 이미 인증됨\n\n이미 ${name} 인증이 완료되어 있습니다.\n\n**인증 파일**: ${status[provider].files[0]}\n\n재인증이 필요하면 기존 인증 파일을 삭제 후 다시 시도하세요.`
      }]
    };
  }

  // 인증 시작 안내
  const result = await startProviderAuth(provider);

  if (result.success) {
    return {
      content: [{
        type: "text" as const,
        text: `## ✅ ${name} 인증 완료\n\n${result.message}\n\n이제 ${name} 기반 전문가를 사용할 수 있습니다.`
      }]
    };
  } else if (result.pending) {
    // 인증 대기 중 (타임아웃)
    return {
      content: [{
        type: "text" as const,
        text: `## ⏳ ${name} 인증 대기 중\n\n${result.message}\n\n브라우저에서 로그인을 완료한 후 \`auth_status\` 도구로 인증 상태를 확인하세요.`
      }]
    };
  } else {
    return {
      content: [{
        type: "text" as const,
        text: `## ❌ ${name} 인증 실패\n\n${result.message}\n\n### 수동 인증 방법\n\`\`\`bash\ncd ${config.cliproxyPath?.replace(/[/\\][^/\\]+$/, '') || 'CLIProxyAPI폴더'}\n./${config.cliproxyPath?.split(/[/\\]/).pop() || 'cli-proxy-api'} ${LOGIN_FLAGS[provider]}\n\`\`\``
      }],
      isError: true
    };
  }
}

// 개별 프로바이더 핸들러
export async function handleAuthGpt() {
  return handleAuthProvider('gpt');
}

export async function handleAuthClaude() {
  return handleAuthProvider('claude');
}

export async function handleAuthGemini() {
  return handleAuthProvider('gemini');
}
