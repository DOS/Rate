# PowerShell Database backup script for Rate Platform
# Usage: .\backup-db.ps1

$ContainerID = "0bb0bcdc8306"
$DBName = "rate_db"
$DBUser = "JOY"
$BackupDir = ".\backups"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = "$BackupDir\rate_db_backup_$Timestamp.sql"

# Create backup directory if not exists
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

Write-Host "🔄 Starting database backup..." -ForegroundColor Yellow

# Create backup
docker exec $ContainerID pg_dump -U $DBUser $DBName > $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup successful: $BackupFile" -ForegroundColor Green
    $FileSize = (Get-Item $BackupFile).Length / 1MB
    Write-Host "📊 File size: $([math]::Round($FileSize, 2)) MB" -ForegroundColor Cyan
    
    # Keep only last 10 backups
    $OldBackups = Get-ChildItem "$BackupDir\*.sql" | Sort-Object CreationTime -Descending | Select-Object -Skip 10
    if ($OldBackups) {
        $OldBackups | Remove-Item -Force
        Write-Host "🧹 Cleaned old backups (keeping last 10)" -ForegroundColor Yellow
    }
    
    # Show recent backups
    Write-Host "`n📁 Recent backups:" -ForegroundColor Cyan
    Get-ChildItem "$BackupDir\*.sql" | Sort-Object CreationTime -Descending | Select-Object -First 5 | ForEach-Object {
        Write-Host "  - $($_.Name) ($([math]::Round($_.Length / 1MB, 2)) MB)"
    }
} else {
    Write-Host "❌ Backup failed!" -ForegroundColor Red
    exit 1
}