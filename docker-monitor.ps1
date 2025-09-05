# Docker Health Monitor - Auto-fix when containers list hangs
# Run this in background to auto-detect and fix Docker issues

while ($true) {
    Write-Host "Checking Docker health..." -ForegroundColor Cyan
    
    # Test Docker responsiveness
    $startTime = Get-Date
    $timeout = 5 # seconds
    
    $job = Start-Job -ScriptBlock {
        docker ps 2>&1
    }
    
    Wait-Job $job -Timeout $timeout | Out-Null
    
    if ($job.State -eq 'Running') {
        # Docker is hanging - fix it
        Write-Host "Docker is not responding! Auto-fixing..." -ForegroundColor Red
        
        Stop-Job $job -Force
        Remove-Job $job -Force
        
        # Kill Docker processes
        Get-Process | Where-Object {$_.ProcessName -like "*docker*"} | Stop-Process -Force -ErrorAction SilentlyContinue
        
        Start-Sleep -Seconds 5
        
        # Restart Docker Desktop
        Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        Write-Host "Docker Desktop restarted. Waiting 60s for initialization..." -ForegroundColor Green
        Start-Sleep -Seconds 60
    } else {
        $result = Receive-Job $job
        Remove-Job $job -Force
        Write-Host "Docker is healthy ✓" -ForegroundColor Green
    }
    
    # Check every 5 minutes
    Start-Sleep -Seconds 300
}