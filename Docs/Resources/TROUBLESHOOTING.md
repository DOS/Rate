# Troubleshooting Guide

This document contains solutions to common issues encountered in the Rate Platform.

## Table of Contents
- [Strapi Content Manager Shows Empty Despite Data in Database](#strapi-content-manager-shows-empty-despite-data-in-database)
- [Database Connection Issues](#database-connection-issues)
- [PostgreSQL Container Connection Terminated Unexpectedly](#postgresql-container-connection-terminated-unexpectedly)
- [Strapi Admin Panel Reload Loop with Error 500](#strapi-admin-panel-reload-loop-with-error-500)
- [Port Already in Use Errors](#port-already-in-use-errors)
- [JWT_SECRET Duplicated in .env File](#jwt_secret-duplicated-in-env-file)
- [Build and Deployment Issues](#build-and-deployment-issues)

---

## Strapi Content Manager Shows Empty Despite Data in Database

### Problem
Content Manager in Strapi 5 shows empty collections even though data exists in PostgreSQL database tables.

### Root Cause
Strapi 5 uses a **document versioning system** that requires specific data structure:
- Each document must have both draft and published versions
- All versions of the same document must share the same `document_id`
- The `document_id` must be in Strapi 5's cuid2/nanoid format (25 lowercase alphanumeric characters)

### Symptoms
- Database queries show data exists (`SELECT * FROM items` returns records)
- Content Manager shows "No content found" or empty collections
- API endpoints return 200 OK but empty data arrays
- Logs show successful queries but no results

### Solution

1. **Check if document_id is properly set:**
```sql
-- Check for NULL or invalid document_ids
SELECT id, document_id, title, published_at, locale 
FROM items 
WHERE document_id IS NULL OR document_id = '';
```

2. **Create backup of existing data:**
```sql
CREATE TABLE items_backup_$(date +%Y%m%d) AS SELECT * FROM items;
CREATE TABLE categories_backup_$(date +%Y%m%d) AS SELECT * FROM categories;
```

3. **Fix document_id format and create draft versions:**

Run the fix script located at: `apps/strapi/scripts/fix-document-ids.sql`

Or manually fix with:
```sql
-- Create function to generate Strapi-compatible document_id
CREATE OR REPLACE FUNCTION generate_strapi_document_id() RETURNS text AS $$
DECLARE
    chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..25 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Fix existing records
DO $$
DECLARE
    rec RECORD;
    new_doc_id text;
BEGIN
    FOR rec IN SELECT DISTINCT id FROM items WHERE published_at IS NOT NULL LOOP
        new_doc_id := generate_strapi_document_id();
        
        -- Update published version
        UPDATE items SET document_id = new_doc_id WHERE id = rec.id;
        
        -- Create draft version
        INSERT INTO items (document_id, title, slug, /* other fields */, published_at, locale)
        SELECT document_id, title, slug, /* other fields */, NULL, locale
        FROM items WHERE id = rec.id;
    END LOOP;
END $$;
```

4. **Verify the fix:**
```sql
SELECT 'Items' as table_name, 
       COUNT(*) as total,
       SUM(CASE WHEN published_at IS NULL THEN 1 ELSE 0 END) as drafts,
       SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END) as published
FROM items;
```

### Prevention
- Always use Strapi's Content Manager or API to create/update content
- Avoid direct database manipulation without understanding Strapi 5's document structure
- When migrating from Strapi 4 to 5, ensure proper document_id migration
- Regular database backups before any major changes

### Related Files
- `/apps/strapi/scripts/fix-document-ids.sql` - Full fix script
- `/apps/strapi/scripts/fix-categories-reviews.sql` - Fix for other content types
- `/apps/strapi/scripts/backup-db.ps1` - PowerShell backup script

---

## Database Connection Issues

### Problem: "Database connection refused" or timeout errors

### Solutions:

1. **Check Docker container status:**
```bash
docker ps -a | grep postgres
# If not running:
docker start 0bb0bcdc8306
```

2. **Verify connection settings:**
Check `/apps/strapi/.env` and `/apps/strapi/config/database.ts`:
- Host: localhost (or container name if using Docker)
- Port: 5432
- Database: rate (not rate_db)
- Username: joy (lowercase)
- Password: postgres

3. **Test connection directly:**
```bash
docker exec DB psql -U joy -d rate -c "SELECT 1;"
```

---

## PostgreSQL Container Connection Terminated Unexpectedly

### Problem
Error: "Connection terminated unexpectedly" when Strapi tries to connect to PostgreSQL

### Symptoms
- Strapi fails to start with connection error
- Docker container shows as running but connections fail
- Node.js applications can't connect to database
- Error appears after container has been running for a while

### Root Cause
PostgreSQL container may crash or become unresponsive, requiring a restart

### Solution

1. **Check container status:**
```bash
docker ps | findstr DB
# Should show (healthy) status
```

2. **Check PostgreSQL logs:**
```bash
docker logs DB --tail 50
# Look for crash or recovery messages
```

3. **Restart PostgreSQL container:**
```bash
docker restart DB
# Wait 10-15 seconds for startup
```

4. **Test connection after restart:**
```bash
# From command line
docker exec DB psql -U joy -d rate -c "SELECT version();"

# Or create test script (test-db.js)
const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'rate',
  user: 'joy',
  password: 'postgres'
});

client.connect()
  .then(() => console.log('Connected successfully!'))
  .catch(err => console.error('Connection error:', err.message));
```

5. **If problem persists, check max connections:**
```bash
docker exec DB psql -U joy -d rate -c "SHOW max_connections;"
docker exec DB psql -U joy -d rate -c "SELECT count(*) FROM pg_stat_activity;"
```

### Prevention
- Monitor container health regularly
- Set up auto-restart policy: `docker update --restart=unless-stopped DB`
- Regular database backups
- Monitor connection pool usage

---

## Strapi Admin Panel Reload Loop with Error 500

### Problem
Strapi admin panel continuously reloads with "/admin/init 500 Internal Server Error"

### Symptoms
- Admin panel shows "An error occurred while requesting the API"
- Browser console shows repeated GET /admin/init 500 errors
- Frontend may still work but admin panel is inaccessible

### Root Cause
Usually related to database connection issues or corrupted session data

### Solution

1. **First, fix database connection (see above)**

2. **Clear Strapi cache and rebuild:**
```bash
# Stop Strapi
# Then clear cache
rm -rf apps/strapi/.cache
rm -rf apps/strapi/build
rm -rf apps/strapi/dist

# Rebuild
cd apps/strapi
yarn build
yarn develop
```

3. **Check for port conflicts:**
```bash
netstat -ano | findstr :1337
# Kill any conflicting process
powershell -Command "Stop-Process -Id [PID] -Force"
```

4. **Verify environment variables:**
Check `apps/strapi/.env` for proper configuration

---

## Port Already in Use Errors

### Problem
"The port XXXX is already used by another application"

### Common Ports
- 3000: Next.js frontend
- 1337: Strapi backend
- 5432: PostgreSQL
- 6379: Redis

### Solution

1. **Find process using port:**
```bash
# Windows
netstat -ano | findstr :[PORT]

# Example for port 1337
netstat -ano | findstr :1337
```

2. **Kill specific process by PID:**
```bash
# Windows PowerShell
Stop-Process -Id [PID] -Force

# Example
Stop-Process -Id 140824 -Force
```

3. **IMPORTANT: Never kill all Node processes:**
```bash
# DON'T DO THIS - it will kill other projects
# taskkill /F /IM node.exe

# Instead, always kill by specific PID
```

---

## JWT_SECRET Duplicated in .env File

### Problem
Multiple JWT_SECRET entries appear in `apps/strapi/.env` file

### Symptoms
- File has many duplicate JWT_SECRET lines
- Strapi adds a new JWT_SECRET on each startup
- File grows unnecessarily large

### Root Cause
Strapi's Users & Permissions plugin auto-generates JWT_SECRET if not found, but doesn't check for duplicates

### Solution

1. **Remove duplicate entries:**
Keep only the FIRST JWT_SECRET entry (around line 23) and delete all others at the end of file

2. **Manual cleanup:**
```bash
# Check for duplicates
grep "JWT_SECRET" apps/strapi/.env | wc -l

# If more than 1, edit file and remove extras
```

3. **Prevent future duplicates:**
- Ensure JWT_SECRET exists in correct location (after TRANSFER_TOKEN_SALT)
- Don't delete the original JWT_SECRET line
- Monitor file size periodically

---

## Build and Deployment Issues

### Problem: "Module not found" or dependency errors

### Solutions:

1. **Clean install dependencies:**
```bash
# Remove all node_modules and lock files
rm -rf node_modules packages/*/node_modules apps/*/node_modules
rm yarn.lock packages/*/yarn.lock apps/*/yarn.lock

# Fresh install
yarn install
```

2. **Build in correct order:**
```bash
# Build shared packages first
yarn workspace @repo/shared-data build
yarn workspace @repo/design-system build

# Then build apps
yarn workspace @repo/strapi build
yarn workspace @app/ui build
```

3. **Check Node version:**
```bash
node --version  # Should be 22.x
yarn --version  # Should be 1.22.x
```

### Problem: TypeScript errors in monorepo

### Solutions:

1. **Fix tsconfig target:**
Ensure all `tsconfig.json` files use compatible targets:
```json
{
  "compilerOptions": {
    "target": "ES2020",  // Not ES5
    "module": "commonjs"
  }
}
```

2. **Clear TypeScript cache:**
```bash
rm -rf .turbo
rm -rf apps/*/.turbo
yarn type-check
```

---

## Common Commands for Debugging

```bash
# Check Strapi logs
yarn workspace @repo/strapi develop

# Database queries
docker exec 0bb0bcdc8306 psql -U JOY rate_db

# Check API response
curl http://localhost:1337/api/items

# Rebuild Strapi admin
yarn workspace @repo/strapi build --clean

# Clear Strapi cache
rm -rf apps/strapi/.cache
rm -rf apps/strapi/build
```

---

## When to Contact Support

If issues persist after trying these solutions:
1. Check GitHub Issues: https://github.com/strapi/strapi/issues
2. Strapi Discord community
3. Create detailed bug report with:
   - Strapi version (currently 5.23.0)
   - PostgreSQL version (currently 17)
   - Error logs
   - Steps to reproduce