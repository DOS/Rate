# Docker Desktop Auto-Fix Service
# Tự động detect và fix khi Docker Desktop không load được containers list

param(
    [int]$CheckIntervalSeconds = 300,  # Check mỗi 5 phút
    [int]$DockerTimeoutSeconds = 5,    # Timeout cho docker ps
    [bool]$RunOnce = $false            # Chỉ chạy 1 lần để test
)

$LogFile = "$PSScriptRoot\docker-auto-fix.log"

function Write-Log {
    param($Message, $Type = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Type] $Message"
    Write-Host $logMessage -ForegroundColor $(if($Type -eq "ERROR"){"Red"}elseif($Type -eq "WARNING"){"Yellow"}else{"Green"})
    Add-Content -Path $LogFile -Value $logMessage
}

function Test-DockerHealth {
    Write-Log "Checking Docker health..."
    
    # Test 1: Check if Docker Desktop is running
    $dockerProcess = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $dockerProcess) {
        Write-Log "Docker Desktop is not running" "WARNING"
        return $false
    }
    
    # Test 2: Check if docker daemon responds
    $job = Start-Job -ScriptBlock {
        docker ps 2>&1
    }
    
    Wait-Job $job -Timeout $DockerTimeoutSeconds | Out-Null
    
    if ($job.State -eq 'Running') {
        Stop-Job $job -Force
        Remove-Job $job -Force
        Write-Log "Docker daemon not responding (timeout after ${DockerTimeoutSeconds}s)" "ERROR"
        return $false
    }
    
    $result = Receive-Job $job
    Remove-Job $job -Force
    
    # Test 3: Check for specific errors
    if ($result -match "error|cannot connect|daemon") {
        Write-Log "Docker daemon returned error: $result" "ERROR"
        return $false
    }
    
    # Test 4: Try to get container count (more comprehensive test)
    try {
        $containerCount = (docker ps -aq 2>$null | Measure-Object).Count
        Write-Log "Docker is healthy. Found $containerCount containers"
        return $true
    } catch {
        Write-Log "Failed to get container count: $_" "ERROR"
        return $false
    }
}

function Restart-DockerDesktop {
    Write-Log "Starting Docker Desktop fix procedure..." "WARNING"
    
    # Step 1: Kill all Docker processes
    Write-Log "Killing Docker processes..."
    $processesToKill = @(
        "Docker Desktop",
        "com.docker.backend",
        "com.docker.proxy",
        "docker",
        "dockerd",
        "Docker Desktop Service"
    )
    
    foreach ($processName in $processesToKill) {
        Get-Process -Name $processName -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Log "Killing process: $($_.ProcessName) (PID: $($_.Id))"
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Step 2: Wait for processes to fully terminate
    Write-Log "Waiting for processes to terminate..."
    Start-Sleep -Seconds 10
    
    # Step 3: Clear Docker named pipes (if accessible)
    Write-Log "Clearing Docker temporary files..."
    $tempPaths = @(
        "$env:TEMP\docker-*",
        "$env:LOCALAPPDATA\Docker\log.txt"
    )
    
    foreach ($path in $tempPaths) {
        if (Test-Path $path) {
            Remove-Item $path -Force -Recurse -ErrorAction SilentlyContinue
            Write-Log "Cleared: $path"
        }
    }
    
    # Step 4: Restart Docker Desktop
    Write-Log "Starting Docker Desktop..."
    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Log "Docker Desktop started. Waiting 60s for initialization..."
        Start-Sleep -Seconds 60
    } else {
        Write-Log "Docker Desktop not found at: $dockerPath" "ERROR"
        return $false
    }
    
    # Step 5: Verify Docker is working
    if (Test-DockerHealth) {
        Write-Log "Docker Desktop successfully restarted and healthy!" "INFO"
        
        # Send notification (optional)
        $notification = New-Object System.Windows.Forms.NotifyIcon
        $notification.Icon = [System.Drawing.SystemIcons]::Information
        $notification.BalloonTipTitle = "Docker Auto-Fix"
        $notification.BalloonTipText = "Docker Desktop was automatically fixed and restarted"
        $notification.Visible = $true
        $notification.ShowBalloonTip(5000)
        
        return $true
    } else {
        Write-Log "Docker Desktop still not healthy after restart" "ERROR"
        return $false
    }
}

# Main monitoring loop
Write-Log "Docker Auto-Fix Service Started"
Write-Log "Check interval: ${CheckIntervalSeconds}s, Timeout: ${DockerTimeoutSeconds}s"

$consecutiveFailures = 0
$maxConsecutiveFailures = 3

do {
    if (Test-DockerHealth) {
        $consecutiveFailures = 0
    } else {
        $consecutiveFailures++
        Write-Log "Docker health check failed ($consecutiveFailures/$maxConsecutiveFailures)" "WARNING"
        
        if ($consecutiveFailures -ge $maxConsecutiveFailures) {
            Write-Log "Maximum consecutive failures reached. Attempting auto-fix..." "WARNING"
            
            if (Restart-DockerDesktop) {
                $consecutiveFailures = 0
                
                # Extra wait after successful fix
                Write-Log "Waiting additional 60s before next check..."
                Start-Sleep -Seconds 60
            } else {
                Write-Log "Auto-fix failed. Manual intervention may be required." "ERROR"
                
                # Wait longer before retry
                Write-Log "Waiting 10 minutes before next attempt..."
                Start-Sleep -Seconds 600
            }
        }
    }
    
    if (-not $RunOnce) {
        Start-Sleep -Seconds $CheckIntervalSeconds
    }
} while (-not $RunOnce)

Write-Log "Docker Auto-Fix Service Stopped"