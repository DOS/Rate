# =============================================================================
# Rate Platform Database Backup Script
# =============================================================================
# Tu dong backup PostgreSQL database tu Docker container
# Luu vao D:\Backup\Postgre voi timestamp

param(
    [string]$BackupDir = "D:\Backup\Postgre",
    [string]$Container = "rate-db",
    [string]$Database = "rate",
    [string]$User = "supabase_admin",
    [int]$RetentionDays = 30
)

# Mau sac cho output
function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

# Tao timestamp
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $BackupDir "rate_db_$timestamp.sql"

Write-ColorOutput "`n[*] Bat dau backup Rate Database..." "Cyan"
Write-ColorOutput "[+] Container: $Container" "Gray"
Write-ColorOutput "[+] Database: $Database" "Gray"
Write-ColorOutput "[+] File: $backupFile`n" "Gray"

# Kiem tra container co dang chay khong
Write-ColorOutput "[~] Kiem tra container..." "Yellow"
$containerRunning = docker ps --filter "name=$Container" --filter "status=running" --format "{{.Names}}"

if (-not $containerRunning) {
    Write-ColorOutput "[X] Container '$Container' khong chay!" "Red"
    exit 1
}

Write-ColorOutput "[OK] Container dang chay`n" "Green"

# Tao thu muc backup neu chua ton tai
if (-not (Test-Path $BackupDir)) {
    Write-ColorOutput "[DIR] Tao thu muc backup: $BackupDir" "Yellow"
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

# Backup database
Write-ColorOutput "[SAVE] Dang backup database..." "Yellow"
try {
    $result = docker exec $Container pg_dump -U $User -d $Database 2>&1

    if ($LASTEXITCODE -eq 0) {
        $result | Out-File -FilePath $backupFile -Encoding UTF8
        $fileSize = (Get-Item $backupFile).Length / 1MB
        Write-ColorOutput "[OK] Backup thanh cong! Size: $([math]::Round($fileSize, 2)) MB" "Green"
    } else {
        Write-ColorOutput "[X] Backup that bai: $result" "Red"
        exit 1
    }
} catch {
    Write-ColorOutput "[X] Loi: $_" "Red"
    exit 1
}

# Xoa backup cu (giu lai 30 ngay gan nhat)
Write-ColorOutput "`n[CLEAN] Don dep backup cu (giu $RetentionDays ngay)..." "Yellow"
$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
$oldBackups = Get-ChildItem -Path $BackupDir -Filter "rate_db_*.sql" |
              Where-Object { $_.LastWriteTime -lt $cutoffDate }

if ($oldBackups) {
    foreach ($file in $oldBackups) {
        Write-ColorOutput "  [DEL] Xoa: $($file.Name)" "Gray"
        Remove-Item $file.FullName -Force
    }
    Write-ColorOutput "[OK] Da xoa $($oldBackups.Count) backup cu" "Green"
} else {
    Write-ColorOutput "[OK] Khong co backup cu can xoa" "Green"
}

# Thong ke
Write-ColorOutput "`n[STATS] Thong ke:" "Cyan"
$totalBackups = (Get-ChildItem -Path $BackupDir -Filter "rate_db_*.sql").Count
$totalSize = (Get-ChildItem -Path $BackupDir -Filter "rate_db_*.sql" | Measure-Object -Property Length -Sum).Sum / 1GB
Write-ColorOutput "  [BOX] Tong so backup: $totalBackups files" "White"
Write-ColorOutput "  [DISK] Tong dung luong: $([math]::Round($totalSize, 2)) GB`n" "White"

Write-ColorOutput "[DONE] Backup hoan tat!" "Green"
