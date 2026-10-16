# Supabase Stack Setup Guide

## Cấu trúc

```
Rate/                           # Monorepo root = Supabase project root
├── docker-compose.yml          # Supabase full stack + Redis + FlareSolverr
├── docker-compose.dev.yml      # Development overrides (mail catcher)
├── .env                        # Supabase environment variables
├── volumes/                    # Supabase config files
│   └── api/kong.yml
├── apps/
│   ├── strapi/                 # Backend CMS
│   │   └── .env               # Strapi environment variables
│   └── web/                    # Next.js frontend
│       └── .env.local         # Next.js environment variables
└── packages/
```

---

## Services

| Service | URL | Description |
|---------|-----|-------------|
| **Supabase Studio** | http://localhost:3000 | Database UI |
| **Kong Gateway** | http://localhost:8000 | API Gateway |
| **PostgreSQL** | localhost:5432 | Database (user: postgres) |
| **Redis** | localhost:6379 | Cache |
| **FlareSolverr** | http://localhost:8191 | Cloudflare bypass |
| **Inbucket Mail** | http://localhost:9000 | Email testing (dev only) |

---

## Quick Start

### 1. Cấu hình .env

```bash
# Edit .env tại root
POSTGRES_PASSWORD=<mật-khẩu-mạnh>
JWT_SECRET=<random-32-chars>
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=<mật-khẩu-mạnh>
```

### 2. Start Supabase

```bash
# Production mode
docker compose up -d

# Development mode (với mail catcher)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### 3. Verify services

```bash
# Check status
docker compose ps

# Check logs
docker logs supabase-db
docker logs rate-redis
docker logs rate-flaresolverr
```

### 4. Access Supabase Studio

Open http://localhost:3000 (auto-login in dev mode)

---

## Migration từ Stack Cũ

### Backup dữ liệu hiện tại

```bash
# Backup PostgreSQL
docker exec DB pg_dump -U joy -d rate > backup-$(date +%Y%m%d).sql

# Backup Redis (optional)
docker exec redis redis-cli SAVE
docker cp redis:/data/dump.rdb backup-redis.rdb
```

### Stop containers cũ

```bash
docker stop DB redis flaresolverr
docker rm DB redis flaresolverr
```

### Start Supabase stack

```bash
docker compose up -d
```

### Restore dữ liệu

```bash
# Wait for DB to be ready
docker compose exec db pg_isready -U postgres

# Restore data
docker exec -i supabase-db psql -U postgres < backup-YYYYMMDD.sql
```

---

## Update Strapi Config

### apps/strapi/.env

```env
# Database
DATABASE_CLIENT=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=<POSTGRES_PASSWORD từ root .env>

# Supabase
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=<ANON_KEY từ root .env>
SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY từ root .env>
```

### Install Supabase Upload Provider

```bash
cd apps/strapi
yarn add @strapi/provider-upload-supabase
```

### Update apps/strapi/config/plugins.ts

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

## Update Next.js Config

### apps/web/.env.local

```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
```

### Install Supabase Client

```bash
cd apps/web
yarn add @supabase/supabase-js
```

### Create lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
```

---

## Useful Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f [service-name]

# Restart a service
docker compose restart [service-name]

# Reset everything (⚠️ mất hết data)
docker compose down -v
```

---

## Troubleshooting

### PostgreSQL connection refused

```bash
# Check if running
docker compose ps db

# Check logs
docker logs supabase-db

# Restart
docker compose restart db
```

### Supabase Studio không load

```bash
# Check Kong
docker logs supabase-kong

# Restart
docker compose restart kong studio
```

### Port conflicts

```bash
# Check ports in use
netstat -ano | findstr :5432
netstat -ano | findstr :8000

# Update ports in .env
POSTGRES_HOST_PORT=5433
KONG_HTTP_PORT=8001
```

---

## Next Steps

1. ✅ Setup Supabase Storage buckets
2. ✅ Configure Supabase Auth providers
3. ✅ Enable Row Level Security (RLS)
4. ✅ Setup Realtime subscriptions
5. ✅ Deploy to Supabase Cloud (production)
