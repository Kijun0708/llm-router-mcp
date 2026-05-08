#!/usr/bin/env node
// scripts/build-release.js
// 배포용 패키지 생성 스크립트

import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { existsSync, mkdirSync, cpSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 콘솔 색상
const colors = {
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
};

// 패키지 정보 읽기
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
const version = packageJson.version;
const releaseName = `llm-router-mcp-v${version}`;
const releaseDir = join(projectRoot, 'release', releaseName);
const zipPath = join(projectRoot, 'release', `${releaseName}.zip`);

/**
 * 메인 빌드 함수
 */
async function buildRelease() {
  console.log(colors.blue(`\n🚀 LLM Router MCP v${version} 배포 패키지 생성\n`));

  // 1. 빌드 실행
  console.log(colors.yellow('📦 TypeScript 빌드 중...'));
  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
    console.log(colors.green('✅ 빌드 완료\n'));
  } catch (error) {
    console.log(colors.red('❌ 빌드 실패'));
    process.exit(1);
  }

  // 2. release 폴더 초기화
  console.log(colors.yellow('📁 release 폴더 준비 중...'));
  if (existsSync(releaseDir)) {
    rmSync(releaseDir, { recursive: true });
  }
  mkdirSync(releaseDir, { recursive: true });

  // 3. 필수 파일 복사
  console.log(colors.yellow('📋 파일 복사 중...'));

  const filesToCopy = [
    { src: 'dist', dest: 'dist' },
    { src: 'vendor/cliproxy', dest: 'vendor/cliproxy' },
    { src: 'scripts/setup.js', dest: 'scripts/setup.js' },
    { src: 'package.json', dest: 'package.json' },
    { src: '.env.example', dest: '.env.example' },
    { src: 'CLAUDE.md', dest: 'CLAUDE.md' },
    { src: 'README.md', dest: 'README.md' },
  ];

  for (const file of filesToCopy) {
    const srcPath = join(projectRoot, file.src);
    const destPath = join(releaseDir, file.dest);

    if (existsSync(srcPath)) {
      const destDir = dirname(destPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      cpSync(srcPath, destPath, { recursive: true });
      console.log(`   ✓ ${file.src}`);
    } else {
      console.log(colors.yellow(`   ⚠ ${file.src} (없음, 건너뜀)`));
    }
  }

  // 4. 배포용 package.json 생성 (devDependencies 제거)
  console.log(colors.yellow('\n📝 배포용 package.json 생성 중...'));
  const releasePackageJson = { ...packageJson };
  delete releasePackageJson.devDependencies;
  releasePackageJson.scripts = {
    start: packageJson.scripts.start,
    setup: packageJson.scripts.setup,
  };
  writeFileSync(
    join(releaseDir, 'package.json'),
    JSON.stringify(releasePackageJson, null, 2)
  );
  console.log(colors.green('✅ package.json 최적화 완료'));

  // 5. 설치 스크립트 생성
  console.log(colors.yellow('\n📜 설치 스크립트 생성 중...'));
  createInstallScripts();
  console.log(colors.green('✅ 설치 스크립트 생성 완료'));

  // 6. ZIP 파일 생성
  console.log(colors.yellow('\n🗜️  ZIP 파일 생성 중...'));
  try {
    if (existsSync(zipPath)) {
      rmSync(zipPath);
    }

    // PowerShell로 ZIP 생성 (Windows)
    execSync(
      `powershell -Command "Compress-Archive -Path '${releaseDir}' -DestinationPath '${zipPath}' -Force"`,
      { cwd: projectRoot }
    );
    console.log(colors.green(`✅ ${basename(zipPath)} 생성 완료`));
  } catch (error) {
    console.log(colors.yellow('⚠️  ZIP 생성 실패 - 폴더로 배포하세요'));
  }

  // 7. 완료 메시지
  console.log(colors.blue('\n' + '='.repeat(50)));
  console.log(colors.bold(colors.green('🎉 배포 패키지 생성 완료!\n')));
  console.log(colors.blue('📦 배포 파일:'));
  console.log(`   - 폴더: release/${releaseName}/`);
  if (existsSync(zipPath)) {
    console.log(`   - ZIP:  release/${releaseName}.zip`);
  }

  console.log(colors.blue('\n📖 다른 PC에서 설치 방법:'));
  console.log('   1. ZIP 압축 해제 또는 폴더 복사');
  console.log('   2. install.bat (Windows) 또는 install.sh (Mac/Linux) 실행');
  console.log('   3. Claude Code에 MCP 설정 추가\n');
  console.log(colors.blue('='.repeat(50) + '\n'));
}

/**
 * 설치 스크립트 생성
 */
function createInstallScripts() {
  // Windows용 install.bat
  const installBat = `@echo off
chcp 65001 > nul
echo.
echo 🚀 LLM Router MCP v${version} 설치
echo.

:: Node.js 확인
node --version > nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js가 설치되어 있지 않습니다.
    echo    https://nodejs.org 에서 설치해주세요.
    pause
    exit /b 1
)

:: 의존성 설치
echo 📦 의존성 설치 중...
call npm install --production
if %errorlevel% neq 0 (
    echo ❌ 의존성 설치 실패
    pause
    exit /b 1
)

echo.
echo ✅ 설치 완료!
echo.
echo 📋 Claude Code MCP 설정 방법:
echo.
echo    claude mcp add llm-router -- node "%cd%\\dist\\index.js"
echo.
echo    또는 수동으로 설정 파일 편집:
echo    %APPDATA%\\Claude\\claude_desktop_config.json
echo.
pause
`;

  // Mac/Linux용 install.sh
  const installSh = `#!/bin/bash
echo ""
echo "🚀 LLM Router MCP v${version} 설치"
echo ""

# Node.js 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    echo "   https://nodejs.org 에서 설치해주세요."
    exit 1
fi

# 의존성 설치
echo "📦 의존성 설치 중..."
npm install --production
if [ $? -ne 0 ]; then
    echo "❌ 의존성 설치 실패"
    exit 1
fi

echo ""
echo "✅ 설치 완료!"
echo ""
echo "📋 Claude Code MCP 설정 방법:"
echo ""
echo "   claude mcp add llm-router -- node \\"$(pwd)/dist/index.js\\""
echo ""
`;

  // Claude Code MCP 설정 예시
  const mcpConfigExample = `{
  "mcpServers": {
    "llm-router": {
      "command": "node",
      "args": ["<설치경로>/dist/index.js"],
      "env": {}
    }
  }
}
`;

  writeFileSync(join(releaseDir, 'install.bat'), installBat);
  writeFileSync(join(releaseDir, 'install.sh'), installSh);
  writeFileSync(join(releaseDir, 'mcp-config-example.json'), mcpConfigExample);

  // Linux/Mac에서 실행 권한 부여 시도
  try {
    execSync(`chmod +x "${join(releaseDir, 'install.sh')}"`, { stdio: 'ignore' });
  } catch (e) {
    // Windows에서는 실패해도 무시
  }
}

// 실행
buildRelease().catch((error) => {
  console.error(colors.red('❌ 오류 발생:'), error.message);
  process.exit(1);
});
