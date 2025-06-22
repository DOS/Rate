@echo off
echo Setting up PostgreSQL database with lowercase superuser...

echo Removing old users...
docker exec DB psql -U postgres -c "DROP USER IF EXISTS joy CASCADE;"
docker exec DB psql -U postgres -c "DROP USER IF EXISTS \"JOY\" CASCADE;"

echo Creating new lowercase user 'joy' with SUPERUSER privileges...
docker exec DB psql -U postgres -c "CREATE USER joy WITH PASSWORD '***REMOVED-SECRET***' SUPERUSER CREATEDB CREATEROLE;"

echo Granting permissions on database 'rate'...
docker exec DB psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE rate TO joy;"
docker exec DB psql -U postgres -c "ALTER DATABASE rate OWNER TO joy;"

echo Granting permissions on schema...
docker exec DB psql -U postgres -d rate -c "GRANT ALL ON SCHEMA public TO joy;"
docker exec DB psql -U postgres -d rate -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO joy;"
docker exec DB psql -U postgres -d rate -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO joy;"
docker exec DB psql -U postgres -d rate -c "ALTER SCHEMA public OWNER TO joy;"

echo Testing connection with lowercase user...
docker exec DB psql -U joy -d rate -c "SELECT current_database(), current_user, current_setting('is_superuser');"

echo.
echo Database setup completed!
echo User: joy (SUPERUSER)
echo Password: ***REMOVED-SECRET***
echo Database: rate
echo.
pause 