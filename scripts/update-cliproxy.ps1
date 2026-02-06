#Requires -Version 5.1
<#
.SYNOPSIS
    CLIProxyAPI 자동 업데이트 스크립트

.DESCRIPTION
    GitHub Release에서 최신 버전을 다운로드하고 vendor/cliproxy에 설치합니다.
    config.yaml은 보존됩니다.

.EXAMPLE
    .\update-cliproxy.ps1

.EXAMPLE
    .\update-cliproxy.ps1 -Force
    # 같은 버전이어도 강제 재설치
#>

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# 설정
$RepoOwner = "router-for-me"
$RepoName = "CLIProxyAPI"
$VendorPath = Join-Path $PSScriptRoot "..\vendor\cliproxy"
$TempPath = Join-Path $PSScriptRoot "..\temp\cliproxy-update"
$VersionFile = Join-Path $VendorPath ".version"

# 색상 출력 함수
function Write-Status($message) { Write-Host "[*] $message" -ForegroundColor Cyan }
function Write-Success($message) { Write-Host "[+] $message" -ForegroundColor Green }
function Write-Warning($message) { Write-Host "[!] $message" -ForegroundColor Yellow }
function Write-Error($message) { Write-Host "[-] $message" -ForegroundColor Red }

# 메인 로직
try {
    Write-Status "CLIProxyAPI 업데이트 시작..."

    # 1. 최신 릴리즈 정보 가져오기
    Write-Status "최신 릴리즈 확인 중..."
    $releaseUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/releases/latest"
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers @{ "User-Agent" = "PowerShell" }
    $latestVersion = $release.tag_name

    Write-Status "최신 버전: $latestVersion"

    # 2. 현재 버전 확인
    $currentVersion = ""
    if (Test-Path $VersionFile) {
        $currentVersion = Get-Content $VersionFile -Raw
        $currentVersion = $currentVersion.Trim()
        Write-Status "현재 버전: $currentVersion"
    } else {
        Write-Warning "현재 버전 정보 없음 (최초 설치 또는 수동 설치)"
    }

    # 3. 버전 비교
    if ($currentVersion -eq $latestVersion -and -not $Force) {
        Write-Success "이미 최신 버전입니다!"
        exit 0
    }

    # 4. Windows amd64 에셋 찾기
    $asset = $release.assets | Where-Object { $_.name -like "*windows_amd64*" } | Select-Object -First 1
    if (-not $asset) {
        throw "Windows amd64 릴리즈 파일을 찾을 수 없습니다."
    }

    $downloadUrl = $asset.browser_download_url
    $fileName = $asset.name
    Write-Status "다운로드: $fileName"

    # 5. 임시 폴더 준비
    if (Test-Path $TempPath) {
        Remove-Item $TempPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $TempPath | Out-Null

    $zipPath = Join-Path $TempPath $fileName
    $extractPath = Join-Path $TempPath "extracted"

    # 6. 다운로드
    Write-Status "다운로드 중... ($('{0:N2}' -f ($asset.size / 1MB)) MB)"

    # 프로그레스 바 표시를 위한 설정
    $ProgressPreference = 'SilentlyContinue'  # 다운로드 속도 향상
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing
    $ProgressPreference = 'Continue'

    Write-Success "다운로드 완료"

    # 7. 압축 해제
    Write-Status "압축 해제 중..."
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    Write-Success "압축 해제 완료"

    # 8. 실행 중인 프로세스 종료
    $process = Get-Process -Name "cli-proxy-api" -ErrorAction SilentlyContinue
    if ($process) {
        Write-Warning "실행 중인 cli-proxy-api 종료 중..."
        Stop-Process -Name "cli-proxy-api" -Force
        Start-Sleep -Seconds 2
    }

    # 9. 파일 복사 (config.yaml 제외)
    Write-Status "파일 업데이트 중..."

    # exe 파일 복사
    $exeSource = Get-ChildItem -Path $extractPath -Filter "cli-proxy-api.exe" -Recurse | Select-Object -First 1
    if ($exeSource) {
        Copy-Item -Path $exeSource.FullName -Destination $VendorPath -Force
        Write-Success "cli-proxy-api.exe 업데이트됨"
    }

    # static 폴더 복사 (있으면)
    $staticSource = Get-ChildItem -Path $extractPath -Filter "static" -Directory -Recurse | Select-Object -First 1
    if ($staticSource) {
        $staticDest = Join-Path $VendorPath "static"
        if (Test-Path $staticDest) {
            Remove-Item $staticDest -Recurse -Force
        }
        Copy-Item -Path $staticSource.FullName -Destination $VendorPath -Recurse -Force
        Write-Success "static 폴더 업데이트됨"
    }

    # config.example.yaml 복사 (있으면)
    $configExample = Get-ChildItem -Path $extractPath -Filter "config.example.yaml" -Recurse | Select-Object -First 1
    if ($configExample) {
        Copy-Item -Path $configExample.FullName -Destination $VendorPath -Force
        Write-Success "config.example.yaml 업데이트됨"
    }

    # README, LICENSE 복사
    foreach ($file in @("README.md", "LICENSE")) {
        $source = Get-ChildItem -Path $extractPath -Filter $file -Recurse | Select-Object -First 1
        if ($source) {
            Copy-Item -Path $source.FullName -Destination $VendorPath -Force
        }
    }

    # 10. 버전 파일 저장
    $latestVersion | Out-File -FilePath $VersionFile -NoNewline -Encoding UTF8

    # 11. 정리
    Write-Status "임시 파일 정리 중..."
    Remove-Item $TempPath -Recurse -Force

    # 완료 메시지
    Write-Host ""
    Write-Success "========================================"
    Write-Success "  CLIProxyAPI 업데이트 완료!"
    Write-Success "  버전: $currentVersion -> $latestVersion"
    Write-Success "========================================"
    Write-Host ""
    Write-Warning "cli-proxy-api를 다시 시작하세요."

} catch {
    Write-Error "업데이트 실패: $_"

    # 임시 폴더 정리
    if (Test-Path $TempPath) {
        Remove-Item $TempPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    exit 1
}
