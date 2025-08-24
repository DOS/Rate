# Setup PostgreSQL database với lowercase user
Write-Host "Setting up PostgreSQL database with lowercase user..." -ForegroundColor Green

# Xóa user cũ (cả uppercase và lowercase)
Write-Host "Removing old users..." -ForegroundColor Yellow
docker exec DB psql -U postgres -c "DROP USER IF EXISTS joy CASCADE;"
docker exec DB psql -U postgres -c "DROP USER IF EXISTS `"JOY`" CASCADE;"

# Tạo user mới với lowercase và quyền SUPERUSER
Write-Host "Creating new lowercase user 'joy' with SUPERUSER privileges..." -ForegroundColor Yellow
docker exec DB psql -U postgres -c "CREATE USER joy WITH PASSWORD '***REMOVED-SECRET***' SUPERUSER;"
docker exec DB psql -U postgres -c "ALTER USER joy CREATEDB;"

# Grant permissions trên database rate
Write-Host "Granting permissions on database 'rate'..." -ForegroundColor Yellow
docker exec DB psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE rate TO joy;"
docker exec DB psql -U postgres -c "ALTER DATABASE rate OWNER TO joy;"

# Grant permissions trên schema public
Write-Host "Granting permissions on schema..." -ForegroundColor Yellow
docker exec DB psql -U postgres -d rate -c "GRANT ALL ON SCHEMA public TO joy;"
docker exec DB psql -U postgres -d rate -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO joy;"
docker exec DB psql -U postgres -d rate -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO joy;"
docker exec DB psql -U postgres -d rate -c "ALTER SCHEMA public OWNER TO joy;"

# Test connection
Write-Host "Testing connection with lowercase user..." -ForegroundColor Yellow
docker exec DB psql -U joy -d rate -c "SELECT current_database(), current_user;"

Write-Host "Database setup completed!" -ForegroundColor Green
Write-Host "User: joy" -ForegroundColor Cyan
Write-Host "Password: ***REMOVED-SECRET***" -ForegroundColor Cyan
Write-Host "Database: rate" -ForegroundColor Cyan 