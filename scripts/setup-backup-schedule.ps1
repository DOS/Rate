# =============================================================================
# Setup Windows Task Scheduler cho Rate Database Backup
# =============================================================================
# Tao scheduled task chay backup database moi ngay luc 2h sang

# Kiem tra quyen admin
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[X] Script nay can chay voi quyen Administrator!" -ForegroundColor Red
    Write-Host "[!] Click phai PowerShell va chon 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n[*] Dang setup backup schedule cho Rate Database...`n" -ForegroundColor Cyan

# Thong tin task
$taskName = "Rate-Database-Backup"
$taskPath = "\Rate\"
$scriptPath = "D:\Projects\Rate\scripts\backup-database.ps1"
$taskTime = "02:00"  # 2h sang

# Xoa task cu neu ton tai
$existingTask = Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "[~] Tim thay task cu, dang xoa..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -TaskPath $taskPath -Confirm:$false
    Write-Host "[OK] Da xoa task cu`n" -ForegroundColor Green
}

# Tao action - chay PowerShell script
$action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

# Tao trigger - moi ngay luc 2h sang
$trigger = New-ScheduledTaskTrigger -Daily -At $taskTime

# Tao settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Tao principal - chay voi user hien tai
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Highest

# Dang ky task
try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -TaskPath $taskPath `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "Tu dong backup Rate Platform database moi ngay luc 2h sang" | Out-Null

    Write-Host "[OK] Da tao scheduled task thanh cong!" -ForegroundColor Green
} catch {
    Write-Host "[X] Loi khi tao task: $_" -ForegroundColor Red
    exit 1
}

# Hien thi thong tin task
Write-Host "`n[STATS] Thong tin backup schedule:" -ForegroundColor Cyan
Write-Host "  [+] Task name: $taskName" -ForegroundColor White
Write-Host "  [+] Task path: $taskPath" -ForegroundColor White
Write-Host "  [+] Schedule: Moi ngay luc $taskTime" -ForegroundColor White
Write-Host "  [+] Script: $scriptPath" -ForegroundColor White
Write-Host "  [+] Backup dir: D:\Backup\Postgre" -ForegroundColor White
Write-Host "  [+] Retention: 30 ngay`n" -ForegroundColor White

# Huong dan
Write-Host "[INFO] Cach quan ly task:" -ForegroundColor Yellow
Write-Host "  - Xem task: taskschd.msc (Task Scheduler)" -ForegroundColor Gray
Write-Host "  - Run thu: powershell D:\Projects\Rate\scripts\backup-database.ps1" -ForegroundColor Gray
Write-Host "  - Xoa task: Unregister-ScheduledTask -TaskName '$taskName' -TaskPath '$taskPath'`n" -ForegroundColor Gray

Write-Host "[DONE] Setup hoan tat! Backup se tu dong chay moi ngay luc 2h sang." -ForegroundColor Green
