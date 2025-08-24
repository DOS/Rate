# Force lowercase user 'joy' for database connection
Write-Host "Setting environment variables for lowercase user 'joy'..." -ForegroundColor Green

# Clear any existing DATABASE environment variables
Remove-Item Env:DATABASE_* -ErrorAction SilentlyContinue

# Set lowercase user explicitly
$env:DATABASE_USERNAME = "joy"
$env:DATABASE_PASSWORD = "***REMOVED-SECRET***"
$env:DATABASE_URL = "postgres://joy:***REMOVED-SECRET***@localhost:5432/rate"
$env:DATABASE_CLIENT = "postgres"
$env:DATABASE_HOST = "localhost"
$env:DATABASE_PORT = "5432"
$env:DATABASE_NAME = "rate"

Write-Host "Environment variables set:" -ForegroundColor Yellow
Write-Host "DATABASE_USERNAME: $env:DATABASE_USERNAME" -ForegroundColor Cyan
Write-Host "DATABASE_URL: $env:DATABASE_URL" -ForegroundColor Cyan

# Start Strapi
Write-Host "`nStarting Strapi with lowercase user..." -ForegroundColor Green
yarn workspace @repo/strapi develop 