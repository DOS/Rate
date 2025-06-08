# Redis Stream Validator - Docker Deployment Script
# PowerShell script for Windows deployment

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("start", "stop", "restart", "logs", "status", "test", "monitor", "clean")]
    [string]$Action = "start",
    
    [Parameter(Mandatory=$false)]
    [switch]$Build = $false
)

Write-Host "🐳 Redis Stream Validator Docker Management" -ForegroundColor Cyan
Write-Host "Action: $Action" -ForegroundColor Yellow

switch ($Action) {
    "start" {
        Write-Host "🚀 Starting Redis Stream Validator Stack..." -ForegroundColor Green
        
        # Check if .env exists
        if (-not (Test-Path ".env")) {
            Write-Host "⚠️  .env file not found. Copying from .env.example..." -ForegroundColor Yellow
            Copy-Item ".env.example" ".env"
            Write-Host "📝 Please edit .env file with your configuration before continuing." -ForegroundColor Red
            return
        }
        
        if ($Build) {
            docker-compose build --no-cache
        }
        
        docker-compose up -d redis postgres
        Write-Host "⏳ Waiting for services to be healthy..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        
        docker-compose up -d validator-worker
        Write-Host "✅ Validator Worker started successfully!" -ForegroundColor Green
    }
    
    "stop" {
        Write-Host "🛑 Stopping Redis Stream Validator Stack..." -ForegroundColor Red
        docker-compose down
        Write-Host "✅ All services stopped." -ForegroundColor Green
    }
    
    "restart" {
        Write-Host "🔄 Restarting Redis Stream Validator Stack..." -ForegroundColor Yellow
        docker-compose restart
        Write-Host "✅ All services restarted." -ForegroundColor Green
    }
    
    "logs" {
        Write-Host "📋 Showing logs for all services..." -ForegroundColor Blue
        docker-compose logs -f --tail=50
    }
    
    "status" {
        Write-Host "📊 Service Status:" -ForegroundColor Blue
        docker-compose ps
        Write-Host "`n🔍 Container Health:" -ForegroundColor Blue
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    }
    
    "test" {
        Write-Host "🧪 Starting Test Producer..." -ForegroundColor Magenta
        docker-compose --profile testing up -d stream-producer
        Write-Host "✅ Test producer started. Check logs with: docker-compose logs stream-producer" -ForegroundColor Green
    }
    
    "monitor" {
        Write-Host "📈 Starting Stream Monitor..." -ForegroundColor Magenta
        docker-compose --profile monitoring up -d stream-monitor
        Write-Host "✅ Monitor started. Check logs with: docker-compose logs stream-monitor" -ForegroundColor Green
    }
    
    "clean" {
        Write-Host "🧹 Cleaning up Docker resources..." -ForegroundColor Red
        docker-compose down -v --remove-orphans
        docker system prune -f
        Write-Host "✅ Cleanup completed." -ForegroundColor Green
    }
    
    default {
        Write-Host "❌ Unknown action: $Action" -ForegroundColor Red
        Write-Host "Available actions: start, stop, restart, logs, status, test, monitor, clean" -ForegroundColor Yellow
    }
}

Write-Host "`n📚 Usage Examples:" -ForegroundColor Cyan
Write-Host "  .\docker-deploy.ps1 start          # Start the stack" -ForegroundColor Gray
Write-Host "  .\docker-deploy.ps1 start -Build   # Start with rebuild" -ForegroundColor Gray
Write-Host "  .\docker-deploy.ps1 status         # Check status" -ForegroundColor Gray
Write-Host "  .\docker-deploy.ps1 logs           # View logs" -ForegroundColor Gray
Write-Host "  .\docker-deploy.ps1 test           # Start test producer" -ForegroundColor Gray
Write-Host "  .\docker-deploy.ps1 monitor        # Start monitor" -ForegroundColor Gray
