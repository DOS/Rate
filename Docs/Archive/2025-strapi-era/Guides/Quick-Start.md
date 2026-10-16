# Quick Start (Monorepo Rate)

## 🚀 Get Running in 15 Minutes

This guide gets you up and running with RateBox platform quickly for development and testing.

## 📋 Prerequisites

```powershell
node --version    # 22.x
docker --version  # latest (for DB)
git --version     # recent
```

## ⚡ Quick Setup

### 1. Cài dependencies (monorepo)

```powershell
cd D:\Projects\Rate
yarn install
```

### 2. Khởi động PostgreSQL (compose)

```powershell
cd apps/strapi
docker compose up -d db
cd ../..
```

### 3. Chạy dev

```powershell
yarn dev
# hoặc
yarn dev:strapi
yarn dev:ui
```

Access: http://localhost:1337/admin (Strapi) + http://localhost:3000 (Next.js)

### 4. Rate-Importer

- Xem `Docs/Modules/Importer/*` để setup riêng nếu cần.

**Required Environment Variables:**

```bash
FLARESOLVERR_URL=http://localhost:8191
CHECKSCAM_BASE_URL=https://checkscam.vn
API_BASE_URL=http://localhost:1337/api
```

```powershell
# Install dependencies
npm install

# Test crawler
npx ts-node src/test-crawler.ts 0901234567
```

## 🧪 Test Integration

### 1. Verify Services

```powershell
# Check DB container
docker ps

# Check Strapi admin
curl http://localhost:1337/admin/init
```

### 2. Test Data Flow

```powershell
# Run crawler test
cd Rate-Importer
npm run test:integration

# Check data in Rate-New
cd ..\Rate-New
pnpm run db:query "SELECT COUNT(*) FROM scam_reports;"
```

## 📊 Verify Setup

### Health Checks

```powershell
netstat -an | findstr ":1337"
netstat -an | findstr ":3000"
```

### Access Points

- **Strapi Admin**: http://localhost:1337/admin
- **Next.js Frontend**: http://localhost:3000
- **FlareSolverr**: http://localhost:8191
- **Database**: localhost:5432

## 🎯 Next Steps

1. **Read Documentation**: Browse `RateBox-Docs/` for detailed guides
2. **Explore Modules**: Check individual module documentation
3. **Development**: Follow [Development Setup](development-setup.md) for full environment
4. **Contribute**: See [Contributing Guide](../resources/contributing.md)

## 🚨 Common Issues

**Port Conflicts:**

```powershell
# Kill processes using ports
Get-Process -Id (Get-NetTCPConnection -LocalPort 1337).OwningProcess | Stop-Process
```

**Docker Issues:**

```powershell
# Restart services
docker restart ratebox-db flaresolverr
```

**Database Connection:**

```powershell
# Reset database
docker exec -it ratebox-db psql -U ratebox -d ratebox -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

---

Next: [Development Setup](development-setup.md)
