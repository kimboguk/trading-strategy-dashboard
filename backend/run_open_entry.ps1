# run_open_entry.ps1
# 개장(09:00) 자동 진입 — Windows 스케줄 작업이 실행.
# auto_trade ON + 장중일 때만 arm된 pending 진입을 키움에 시장가 제출.
# uvicorn 실행 여부와 무관(백엔드 패키지 직접 import).

$ErrorActionPreference = "Stop"

$Py = "C:\Users\aleph\.conda\envs\dashboard\python.exe"
if (-not (Test-Path $Py)) { throw "Python 인터프리터 없음: $Py" }

$env:PGPASSWORD     = "postgres"
$env:DB_NAME        = "equity"
$env:PYTHONUTF8     = "1"
$env:PYTHONWARNINGS = "ignore"

$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Dir

$LogDir = Join-Path $Dir "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir ("open_entry_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log")

# 네이티브 실행 (2>&1 이 Stop 모드와 충돌하지 않게 Continue 로)
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$out = & $Py "run_open_entries.py" 2>&1
$ErrorActionPreference = $prev
$out | Out-File -FilePath $LogFile -Append -Encoding utf8

# 결과 파싱 → 제출/실패 있으면 알림 팝업 (60초 자동닫힘)
try {
    $obj = ($out | Select-Object -Last 1) | ConvertFrom-Json
    if ($obj.submitted -gt 0 -or $obj.failed -gt 0) {
        $msg = "개장 자동 진입`n제출 $($obj.submitted) · 실패 $($obj.failed) · 스킵 $($obj.skipped)"
        (New-Object -ComObject WScript.Shell).Popup($msg, 60, "ATH 개장 진입", 64) | Out-Null
    }
} catch { }
