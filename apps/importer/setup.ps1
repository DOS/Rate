# Rate-Importer CheckScam Crawler Setup Script
# PowerShell script for Windows setup

Write-Host "🚀 Rate-Importer CheckScam Crawler Setup" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green

# Check Node.js
Write-Host "`n📦 Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js 18+ first." -ForegroundColor Red
    exit 1
}

# Check Docker
Write-Host "`n🐳 Checking Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker found: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker not found. Please install Docker first." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "`n📥 Installing Node.js dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Setup environment file
Write-Host "`n⚙️ Setting up environment configuration..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env file from template" -ForegroundColor Green
    Write-Host "📝 Please edit .env file with your settings" -ForegroundColor Cyan
} else {
    Write-Host "ℹ️ .env file already exists" -ForegroundColor Blue
}

# Start FlareSolverr
Write-Host "`n🔥 Starting FlareSolverr service..." -ForegroundColor Yellow

# Check if docker compose is available
try {
    docker compose version | Out-Null
    $useCompose = $true
    Write-Host "✅ Docker Compose detected" -ForegroundColor Green
} catch {
    $useCompose = $false
    Write-Host "⚠️ Docker Compose not found, using docker run" -ForegroundColor Yellow
}

$flaresolverr = docker ps -q -f name=flaresolverr
if ($flaresolverr) {
    Write-Host "ℹ️ FlareSolverr already running" -ForegroundColor Blue
} else {
    if ($useCompose) {
        Write-Host "🚀 Starting FlareSolverr with Docker Compose..." -ForegroundColor Cyan
        docker compose up -d
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ FlareSolverr started successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to start FlareSolverr with Docker Compose" -ForegroundColor Red
        }
    } else {
        Write-Host "🚀 Starting FlareSolverr with Docker Run..." -ForegroundColor Cyan
        docker run -d --name=flaresolverr -p 8191:8191 -e LOG_LEVEL=info --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ FlareSolverr started successfully" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to start FlareSolverr" -ForegroundColor Red
        }
    }
    
    # Wait for service to be ready
    Write-Host "⏳ Waiting for FlareSolverr to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15
    
    # Test FlareSolverr
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8191/v1" -Method GET -TimeoutSec 10
        Write-Host "✅ FlareSolverr is responding" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ FlareSolverr may still be starting up" -ForegroundColor Yellow
        Write-Host "   Try: docker compose logs flaresolverr" -ForegroundColor Cyan
    }
}

# Create Results directory
Write-Host "`n📁 Creating Results directory..." -ForegroundColor Yellow
if (!(Test-Path "Results")) {
    New-Item -ItemType Directory -Name "Results"
    Write-Host "✅ Results directory created" -ForegroundColor Green
} else {
    Write-Host "ℹ️ Results directory already exists" -ForegroundColor Blue
}

# Setup complete
Write-Host "`n🎉 Setup Complete!" -ForegroundColor Green
Write-Host "==================" -ForegroundColor Green

Write-Host "`n📋 Quick Start Commands:" -ForegroundColor Cyan
Write-Host "  node crawl.js links    # Extract scammer links" -ForegroundColor White
Write-Host "  node crawl.js crawl    # Crawl detailed data" -ForegroundColor White
Write-Host "  node crawl.js cleanup  # Clean up project" -ForegroundColor White

Write-Host "`n🔧 Services:" -ForegroundColor Cyan
Write-Host "  FlareSolverr: http://localhost:8191" -ForegroundColor White

Write-Host "`n📖 Documentation:" -ForegroundColor Cyan
Write-Host "  README.md - Complete usage guide" -ForegroundColor White
Write-Host "  CHANGELOG.md - Version history" -ForegroundColor White

Write-Host "`n⚠️ Important Notes:" -ForegroundColor Yellow
Write-Host "  - Edit .env file with your configuration" -ForegroundColor White
Write-Host "  - Ensure FlareSolverr is running before crawling" -ForegroundColor White
Write-Host "  - Check Results/ directory for output files" -ForegroundColor White

Write-Host "`n🚀 Ready to crawl CheckScam.vn!" -ForegroundColor Green
