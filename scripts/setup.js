#!/usr/bin/env node
// scripts/setup.js
// npm install 후 자동 실행되는 설정 스크립트

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { createServer } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const vendorDir = join(projectRoot, 'vendor', 'cliproxy');

const configPath = join(vendorDir, 'config.yaml');
const configExamplePath = join(vendorDir, 'config.example.yaml');
const envPath = join(projectRoot, '.env');
const envExamplePath = join(projectRoot, '.env.example');

// 콘솔 색상
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
};

/**
 * 포트가 사용 가능한지 확인
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * 사용 가능한 포트 찾기
 */
async function findAvailablePort(startPort = 8787, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

/**
 * config.yaml 생성/업데이트
 */
async function setupConfig() {
  console.log(colors.blue('\n📦 LLM Router MCP - 자동 설정\n'));

  // 1. config.yaml 확인 및 생성
  if (!existsSync(configPath)) {
    if (existsSync(configExamplePath)) {
      console.log(colors.yellow('⚙️  config.yaml이 없습니다. 생성 중...'));
      copyFileSync(configExamplePath, configPath);
      console.log(colors.green('✅ config.yaml 생성 완료'));
    } else {
      console.log(colors.red('❌ config.example.yaml을 찾을 수 없습니다.'));
      return;
    }
  } else {
    console.log(colors.green('✅ config.yaml이 이미 존재합니다.'));
  }

  // 2. 포트 설정 확인 및 조정
  let configContent = readFileSync(configPath, 'utf-8');
  const portMatch = configContent.match(/^port:\s*(\d+)/m);
  let currentPort = portMatch ? parseInt(portMatch[1]) : 8787;

  console.log(colors.blue(`🔍 포트 ${currentPort} 확인 중...`));

  const isAvailable = await isPortAvailable(currentPort);

  if (!isAvailable) {
    console.log(colors.yellow(`⚠️  포트 ${currentPort}이(가) 이미 사용 중입니다.`));
    const newPort = await findAvailablePort(currentPort + 1);

    if (newPort) {
      console.log(colors.blue(`🔄 새 포트 ${newPort}(으)로 변경 중...`));

      // config.yaml 포트 업데이트
      configContent = configContent.replace(/^port:\s*\d+/m, `port: ${newPort}`);
      writeFileSync(configPath, configContent);

      // .env 파일도 업데이트
      updateEnvPort(newPort);

      console.log(colors.green(`✅ 포트가 ${newPort}(으)로 변경되었습니다.`));
      currentPort = newPort;
    } else {
      console.log(colors.red('❌ 사용 가능한 포트를 찾을 수 없습니다.'));
    }
  } else {
    console.log(colors.green(`✅ 포트 ${currentPort}이(가) 사용 가능합니다.`));
    // .env 파일 포트 동기화
    updateEnvPort(currentPort);
  }

  // 3. .env 파일 확인
  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      console.log(colors.yellow('⚙️  .env 파일이 없습니다. 생성 중...'));
      let envContent = readFileSync(envExamplePath, 'utf-8');
      envContent = envContent.replace(/CLIPROXY_URL=.*/, `CLIPROXY_URL=http://127.0.0.1:${currentPort}`);
      writeFileSync(envPath, envContent);
      console.log(colors.green('✅ .env 파일 생성 완료'));
    }
  }

  console.log(colors.blue('\n📋 설정 요약:'));
  console.log(`   - CLIProxyAPI 포트: ${currentPort}`);
  console.log(`   - config.yaml: ${configPath}`);
  console.log(`   - .env: ${envPath}`);
  console.log(colors.green('\n✨ 설정이 완료되었습니다!\n'));
}

/**
 * .env 파일의 포트 업데이트
 */
function updateEnvPort(port) {
  if (existsSync(envPath)) {
    let envContent = readFileSync(envPath, 'utf-8');
    if (envContent.includes('CLIPROXY_URL=')) {
      envContent = envContent.replace(/CLIPROXY_URL=http:\/\/[^:\s]+:\d+/, `CLIPROXY_URL=http://127.0.0.1:${port}`);
    } else {
      envContent += `\nCLIPROXY_URL=http://127.0.0.1:${port}`;
    }
    writeFileSync(envPath, envContent);
  }
}

// 실행
setupConfig().catch(console.error);
