# Script để tạo Windows Task Scheduler task cho Docker Auto-Fix
# Chạy script này với quyền Administrator

$TaskName = "DockerDesktopAutoFix"
$ScriptPath = "$PSScriptRoot\docker-auto-fix.ps1"

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "This script needs to be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# Remove existing task if exists
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Host "Removing existing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Create the scheduled task
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`"" `
    -WorkingDirectory $PSScriptRoot

# Trigger: Start at logon and run indefinitely
$Trigger = New-ScheduledTaskTrigger -AtLogOn

# Settings
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -RestartCount 3 `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)

# Principal (run with highest privileges)
$Principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Highest

# Register the task
$Task = Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Automatically detects and fixes Docker Desktop when it stops responding or fails to load container list"

if ($Task) {
    Write-Host "`nTask created successfully!" -ForegroundColor Green
    Write-Host "Task Name: $TaskName" -ForegroundColor Cyan
    Write-Host "The task will run automatically at system startup" -ForegroundColor Cyan
    
    # Start the task immediately
    $startChoice = Read-Host "`nDo you want to start the task now? (Y/N)"
    if ($startChoice -eq 'Y' -or $startChoice -eq 'y') {
        Start-ScheduledTask -TaskName $TaskName
        Write-Host "Task started!" -ForegroundColor Green
        Write-Host "Check the log file at: $PSScriptRoot\docker-auto-fix.log" -ForegroundColor Yellow
    }
} else {
    Write-Host "Failed to create scheduled task!" -ForegroundColor Red
}

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")