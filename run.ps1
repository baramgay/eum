#Requires -Version 5
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 3001
$url  = "http://localhost:$port"

Set-Location $projectDir

function Get-ChromePath {
    $candidates = @(
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Open-Browser {
    param($TargetUrl)
    $chrome = Get-ChromePath
    if ($chrome) {
        Start-Process $chrome $TargetUrl
    } else {
        Start-Process $TargetUrl
    }
}

function Test-Server {
    param($TargetUrl)
    try {
        $res = Invoke-WebRequest $TargetUrl -UseBasicParsing -TimeoutSec 2
        return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 400)
    } catch {
        return $false
    }
}

# 이미 실행 중이면 브라우저만 오픈
if (Test-Server $url) {
    Write-Host "  서버가 이미 실행 중입니다. 브라우저를 엽니다..." -ForegroundColor Green
    Open-Browser $url
    exit 0
}

# 백그라운드 폴링 - 서버 응답 시 브라우저 오픈
Start-Job -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 90; $i++) {
        Start-Sleep 1
        try {
            $res = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 2
            if ($res.StatusCode -ge 200 -and $res.StatusCode -lt 400) {
                $chrome = $null
                $candidates = @(
                    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
                    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
                )
                foreach ($c in $candidates) { if (Test-Path $c) { $chrome = $c; break } }
                if ($chrome) { Start-Process $chrome $u } else { Start-Process $u }
                break
            }
        } catch [System.Net.WebException] {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode -eq 307) {
                $chrome = $null
                $candidates = @(
                    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
                    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
                    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
                )
                foreach ($c in $candidates) { if (Test-Path $c) { $chrome = $c; break } }
                if ($chrome) { Start-Process $chrome $u } else { Start-Process $u }
                break
            }
        } catch {}
    }
} -ArgumentList $url | Out-Null

Write-Host ""
Write-Host "  EUM Platform 개발 서버를 시작합니다..." -ForegroundColor Cyan
Write-Host "  준비가 완료되면 Chrome(또는 기본 브라우저)이 자동으로 열립니다." -ForegroundColor DarkGray
Write-Host "  서버 종료: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

# 개발 서버 시작 (포그라운드)
npm run dev
