#Requires -Version 5
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3001
$url  = "http://localhost:$port"

Set-Location $projectDir

# 이미 실행 중이면 Chrome만 오픈
try {
    if ((Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200) {
        Write-Host "  서버 이미 실행 중 - Chrome 오픈" -ForegroundColor Green
        Start-Process "chrome" $url
        exit 0
    }
} catch {}

# 백그라운드 HTTP 폴링 - 200 응답 받으면 즉시 Chrome 오픈
Start-Job -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep 1
        try {
            if ((Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200) {
                Start-Process "chrome" $u
                break
            }
        } catch {}
    }
} -ArgumentList $url | Out-Null

Write-Host ""
Write-Host "  EUM Platform 개발 서버 시작 중..." -ForegroundColor Cyan
Write-Host "  준비 완료 시 Chrome 이 자동으로 열립니다." -ForegroundColor DarkGray
Write-Host "  종료: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

# 개발 서버 시작 (포그라운드)
npm run dev
