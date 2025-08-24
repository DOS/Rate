param([int]$Port = 1337)
$conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -Property OwningProcess -Unique
foreach ($conn in $conns) {
    try {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "⚡️ Killed process $($conn.OwningProcess) on port $Port"
    }
    catch {
        Write-Warning ("Unable to kill process on port {0}: {1}" -f $Port, $_)
    }
} 