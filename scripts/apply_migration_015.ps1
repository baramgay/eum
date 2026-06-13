# apply_migration_015.ps1 — 015_evaluation_enhancements.sql Supabase 적용 스크립트
# 실행 전 환경변수 SUPABASE_DB_URL 설정 또는 supabase CLI 로그인 필요

param(
  [string]$Method = "cli"   # "cli" | "direct"
)

$MigrationFile = Join-Path $PSScriptRoot "..\supabase\migrations\015_evaluation_enhancements.sql"
$MigrationFile = (Resolve-Path $MigrationFile).Path

Write-Host "=== Migration 015: 평가편람 개선 ===" -ForegroundColor Cyan
Write-Host "파일: $MigrationFile"

if ($Method -eq "cli") {
  # Supabase CLI 방식 (권장)
  Write-Host "`n[1] Supabase CLI로 push 시도..." -ForegroundColor Yellow
  $supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
  if (-not $supabaseCmd) {
    Write-Host "supabase CLI가 없습니다. npm install -g supabase 또는 npx supabase 사용하세요." -ForegroundColor Red
    Write-Host "대안: -Method direct 로 재실행하거나 Supabase 대시보드에서 SQL 직접 실행" -ForegroundColor Yellow
    exit 1
  }
  Push-Location (Split-Path $MigrationFile -Parent | Split-Path -Parent)
  supabase db push
  Pop-Location
  Write-Host "완료." -ForegroundColor Green
}
elseif ($Method -eq "direct") {
  # psql 직접 연결 방식
  Write-Host "`n[2] psql 직접 연결..." -ForegroundColor Yellow
  $dbUrl = $env:SUPABASE_DB_URL
  if (-not $dbUrl) {
    Write-Host "환경변수 SUPABASE_DB_URL이 없습니다." -ForegroundColor Red
    Write-Host "형식: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
    exit 1
  }
  psql $dbUrl -f $MigrationFile
  Write-Host "완료." -ForegroundColor Green
}

Write-Host "`n=== 적용된 변경사항 ===" -ForegroundColor Cyan
Write-Host "1. catalog 테이블: api_enabled BOOLEAN 컬럼 추가"
Write-Host "2. anonymous_data_cases 테이블 생성 (가명정보·합성데이터 개방 실적)"
Write-Host "3. analysis_records 테이블 생성 (데이터 분석·활용 실적)"
Write-Host "4. evaluation_targets 테이블 생성 (기관별 평가 목표)"
Write-Host ""
Write-Host "적용 후 /pipeline 페이지에서 실적 등록 및 목표 설정이 가능합니다." -ForegroundColor Green
