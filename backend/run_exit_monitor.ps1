# run_exit_monitor.ps1
# 장중 청산 감시 — Windows 스케줄 작업이 장중 5분 주기로 실행.
# 보유종목 현재가가 TP/SL 도달 시 시장가 매도 (auto_trade ON + 장중).

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
$LogFile = Join-Path $LogDir ("exit_monitor_" + (Get-Date -Format "yyyyMMdd") + ".log")

$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$out = & $Py "run_exit_monitor.py" 2>&1
$ErrorActionPreference = $prev
("[" + (Get-Date -Format "HH:mm:ss") + "] " + ($out | Select-Object -Last 1)) |
    Out-File -FilePath $LogFile -Append -Encoding utf8

# 실제 청산이 발생했을 때만 팝업 (5분마다 뜨면 소음이므로)
try {
    $obj = ($out | Select-Object -Last 1) | ConvertFrom-Json
    if ($obj.sold -gt 0 -or $obj.failed -gt 0) {
        $msg = "장중 청산`n매도 $($obj.sold) · 실패 $($obj.failed)"
        (New-Object -ComObject WScript.Shell).Popup($msg, 60, "ATH 청산 실행", 48) | Out-Null
    }
} catch { }
