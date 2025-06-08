# PowerShell script to run end-to-end test in Docker network
Write-Host "[TEST] Running End-to-End Integration Test in Docker Network" -ForegroundColor Green

# Build test image if needed
Write-Host "[BUILD] Building test container..." -ForegroundColor Yellow
docker build -t validator-e2e-test .

# Run test in Docker network with access to services
Write-Host "[RUN] Executing end-to-end test..." -ForegroundColor Yellow
docker run --rm --network Gateway `
    -e REDIS_URL=redis://redis:6379 `
    -e POSTGRES_DSN="postgresql://JOY:***REMOVED-SECRET***@DB:5432/validator" `
    validator-e2e-test python end_to_end_test.py

Write-Host "[DONE] End-to-end test completed" -ForegroundColor Green
