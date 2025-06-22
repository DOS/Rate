@echo off
echo Setting environment variables for lowercase user 'joy'...

set DATABASE_USERNAME=joy
set DATABASE_PASSWORD=***REMOVED-SECRET***
set DATABASE_URL=postgres://joy:***REMOVED-SECRET***@localhost:5432/rate
set DATABASE_CLIENT=postgres
set DATABASE_HOST=localhost
set DATABASE_PORT=5432
set DATABASE_NAME=rate

echo.
echo Environment variables set:
echo DATABASE_USERNAME: %DATABASE_USERNAME%
echo DATABASE_URL: %DATABASE_URL%
echo.
echo Starting Strapi with lowercase user...

yarn workspace @repo/strapi develop 