# Migration Guide: Docker Stack → Supabase Stack

## Tổng quan

Migration từ stack cũ (PostgreSQL + Redis + FlareSolverr) sang Supabase stack đầy đủ.

**Supabase Services:**
- ✅ **PostgreSQL** with pgvector extension
- ✅ **Supabase Auth** - Authentication & Authorization
- ✅ **Supabase Storage** - S3-compatible object storage with CDN
- ✅ **Supabase Realtime** - WebSocket for live updates
- ✅ **Supabase Studio** - Web UI for database management (http://localhost:54323)
- ✅ **PostgREST** - Auto-generated REST API
- ✅ **Redis** - Cache for AI results
- ✅ **FlareSolverr** - Cloudflare bypass

---

## Bước 1: Backup dữ liệu hiện tại

```bash
# Backup PostgreSQL
docker exec DB pg_dump -U joy -d rate > backup-rate-$(date +%Y%m%d).sql

# Backup Redis (optional)
docker exec redis redis-cli SAVE
docker cp redis:/data/dump.rdb backup-redis-$(date +%Y%m%d).rdb
```

---

## Bước 2: Dừng stack cũ

```bash
# Dừng containers cũ (KHÔNG XÓA DATA)
docker stop DB redis flaresolverr

# Optional: Remove containers (giữ volumes)
docker rm DB redis flaresolverr
```

---

## Bước 3: Setup Supabase

### 3.1. Copy và cấu hình .env

```bash
# Copy template
cp .env.supabase .env.local

# Update các values:
# - POSTGRES_PASSWORD: mật khẩu PostgreSQL mới
# - JWT_SECRET: random string 32+ characters
# - SMTP settings (nếu dùng email auth)
```

### 3.2. Khởi động Supabase stack

```bash
# Start full stack
docker compose -f docker-compose.supabase.yml --env-file .env.local up -d

# Hoặc chỉ start một số services
docker compose -f docker-compose.supabase.yml up -d db redis flaresolverr
```

### 3.3. Đợi services khởi động

```bash
# Check health
docker compose -f docker-compose.supabase.yml ps

# Check logs
docker compose -f docker-compose.supabase.yml logs -f db
```

---

## Bước 4: Restore dữ liệu

```bash
# Restore PostgreSQL
docker exec -i rate-supabase-db psql -U postgres -d postgres < backup-rate-YYYYMMDD.sql

# Verify data
docker exec rate-supabase-db psql -U postgres -d postgres -c "\dt"
```

---

## Bước 5: Update Strapi config

### 5.1. Update `apps/strapi/.env`

```env
# Database (no change - still localhost:5432)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=<POSTGRES_PASSWORD từ .env.local>

# Supabase (NEW)
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=<ANON_KEY từ .env.local>
SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY từ .env.local>
```

### 5.2. Update Upload Provider (thay AWS S3)

```bash
# Install Supabase provider
yarn workspace @repo/strapi add @strapi/provider-upload-supabase
```

Update `apps/strapi/config/plugins.ts`:

```typescript
export default ({ env }) => ({
  upload: {
    config: {
      provider: 'supabase',
      providerOptions: {
        apiUrl: env('SUPABASE_URL'),
        apiKey: env('SUPABASE_SERVICE_KEY'),
        bucket: 'strapi-uploads',
        directory: '',
        options: {}
      }
    }
  }
});
```

---

## Bước 6: Update Next.js config

### 6.1. Install Supabase client

```bash
yarn workspace @repo/web add @supabase/supabase-js
```

### 6.2. Update `apps/web/.env.local`

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

### 6.3. Create Supabase client

Create `apps/web/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

---

## Bước 7: Test services

### 7.1. PostgreSQL

```bash
docker exec rate-supabase-db psql -U postgres -c "SELECT version();"
```

### 7.2. Supabase Studio

Open http://localhost:54323

### 7.3. Supabase Storage

```bash
# Create bucket
curl -X POST http://localhost:8000/storage/v1/bucket \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"id":"strapi-uploads","name":"strapi-uploads","public":true}'
```

### 7.4. Redis

```bash
docker exec rate-redis redis-cli ping
# Expected: PONG
```

### 7.5. FlareSolverr

```bash
curl http://localhost:8191/
# Expected: FlareSolverr version info
```

---

## Bước 8: Start Strapi

```bash
cd apps/strapi
yarn dev
```

Check:
- ✅ Strapi connects to PostgreSQL
- ✅ File uploads work (to Supabase Storage)
- ✅ All existing data intact

---

## Services URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| **Supabase Studio** | http://localhost:54323 | Auto-login |
| **Kong API Gateway** | http://localhost:8000 | - |
| **PostgreSQL** | localhost:5432 | postgres / <POSTGRES_PASSWORD> |
| **Redis** | localhost:6379 | No auth |
| **FlareSolverr** | http://localhost:8191 | No auth |
| **Strapi** | http://localhost:1337 | Existing admin |
| **Next.js** | http://localhost:3000 | - |

---

## Troubleshooting

### PostgreSQL connection refused

```bash
# Check if DB is running
docker compose -f docker-compose.supabase.yml ps

# Check logs
docker logs rate-supabase-db

# Restart DB
docker compose -f docker-compose.supabase.yml restart db
```

### Supabase Studio không load

```bash
# Check Kong gateway
docker logs rate-supabase-kong

# Restart Studio
docker compose -f docker-compose.supabase.yml restart studio
```

### Storage upload fails

```bash
# Check storage service
docker logs rate-supabase-storage

# Check bucket exists
docker exec rate-supabase-db psql -U postgres -c "SELECT * FROM storage.buckets;"
```

---

## Rollback (nếu cần)

```bash
# Stop Supabase stack
docker compose -f docker-compose.supabase.yml down

# Start old stack
docker start DB redis flaresolverr

# Restore old Strapi .env
git checkout apps/strapi/.env
```

---

## Next Steps

Sau khi migration thành công:

1. **Setup Supabase Auth** - Migrate từ NextAuth
2. **Use Supabase Storage** - Upload images từ crawlers
3. **Enable Realtime** - Live notifications cho reviews
4. **Setup Row Level Security (RLS)** - Data privacy
5. **Deploy to Supabase Cloud** - Production ready
