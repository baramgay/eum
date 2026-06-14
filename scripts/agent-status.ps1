# eum_platform에서 agents 시스템의 update_status.py를 호출하는 브릿지 스크립트.
#
# 사용법:
#   .\scripts\agent-status.ps1 [agent_id] [status] "[message]"
#
# 예시:
#   .\scripts\agent-status.ps1 backend working "품질진단 엔진 개선 시작"
#   .\scripts\agent-status.ps1 backend done "품질진단 엔진 개선 완료"

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentId,

    [Parameter(Mandatory=$true)]
    [ValidateSet("working", "review", "done", "idle")]
    [string]$Status,

    [Parameter(Mandatory=$true)]
    [string]$Message
)

$AgentsRoot = "C:\업무\agents"
$UpdateStatus = "$AgentsRoot\scripts\update_status.py"

if (-not (Test-Path $UpdateStatus)) {
    Write-Error "agents 시스템 스크립트를 찾을 수 없습니다: $UpdateStatus"
    exit 1
}

python "$UpdateStatus" "$AgentId" "$Status" "$Message"
