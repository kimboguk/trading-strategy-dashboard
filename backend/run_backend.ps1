# run_backend.ps1
# 대시보드 백엔드(uvicorn :8000) 상시 실행 — 로그온 시 자동, VSCode 무관.
# 스케줄 작업(ATH-Backend)이 hidden VBS 런처로 호출 → 콘솔 창 없이 백그라운드.

$ErrorActionPreference = "Continue"
$env:PYTHONUTF8 = "1"

$Py = "C:\Users\aleph\.conda\envs\dashboard\python.exe"
$Dir = "D:\study\finance\trading\dashboard\backend"
Set-Location $Dir

$LogDir = Join-Path $Dir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir "backend_service.log"

& $Py -m uvicorn main:app --host 0.0.0.0 --port 8000 *>> $LogFile
