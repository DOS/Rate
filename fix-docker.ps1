# Script to fix Docker Desktop when containers list won't load
Write-Host "Fixing Docker Desktop..." -ForegroundColor Green

# Step 1: Stop Docker Desktop
Write-Host "Stopping Docker Desktop..." -ForegroundColor Yellow
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "com.docker.backend" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "com.docker.proxy" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "docker" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "dockerd" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# Step 2: Clear Docker cache
Write-Host "Clearing Docker cache..." -ForegroundColor Yellow
$dockerDataPath = "$env:LOCALAPPDATA\Docker"
if (Test-Path "$dockerDataPath\log.txt") {
    Remove-Item "$dockerDataPath\log.txt" -Force -ErrorAction SilentlyContinue
}

# Step 3: Reset Docker settings (optional - uncomment if needed)
# Write-Host "Resetting Docker settings..." -ForegroundColor Yellow
# Remove-Item "$env:APPDATA\Docker\settings.json" -Force -ErrorAction SilentlyContinue

# Step 4: Restart Docker Desktop
Write-Host "Starting Docker Desktop..." -ForegroundColor Yellow
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

Write-Host "Waiting for Docker to initialize (60 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

# Step 5: Test Docker
Write-Host "Testing Docker..." -ForegroundColor Yellow
docker version

Write-Host "`nDocker Desktop fix complete!" -ForegroundColor Green
Write-Host "If the issue persists, try:" -ForegroundColor Cyan
Write-Host "1. Open Docker Desktop Settings"
Write-Host "2. Go to 'Troubleshoot'"
Write-Host "3. Click 'Clean / Purge data'"
Write-Host "4. Restart Docker Desktop"