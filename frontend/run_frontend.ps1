# run_frontend.ps1
# 대시보드 프런트엔드(Next.js dev :3000) 상시 실행 — 로그온 시 자동, VSCode 무관.
# 스케줄 작업(ATH-Frontend)이 hidden VBS 런처로 호출 → 콘솔 창 없이 백그라운드.

$ErrorActionPreference = "Continue"

$Dir = "D:\study\finance\trading\dashboard\frontend"
Set-Location $Dir

$LogDir = Join-Path $Dir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "frontend_service.log"

# npm 은 PATH 로 해석 (로그인 세션 PATH 에 node/npm 포함). 현재 콘솔(hidden) 내에서 실행.
& npm run dev *>> $LogFile
