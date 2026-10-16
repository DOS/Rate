# Development Setup (Monorepo Rate)

## 🎯 Overview

This guide helps you set up a complete Rate Platform development environment on Windows 11 with PowerShell. The project uses a Turborepo monorepo structure with Claude Code and Cursor agents working collaboratively.

## 🛠️ Prerequisites

### Required Software

```powershell
# PowerShell 7 (Windows 11)
$PSVersionTable.PSVersion

# Tools
winget install Git.Git
winget install Docker.DockerDesktop
winget install OpenJS.NodeJS  # Node.js 22.x required
winget install PostgreSQL.PostgreSQL  # PostgreSQL 17 required
```

### Development Tools

```powershell
# Yarn v1.22.x (enforced by only-allow)
corepack enable
yarn --version  # Should be 1.22.x
```

### AI Agents Setup (Optional)

- **Claude Code**: Frontend development (React/Next.js)
- **Cursor**: Backend development (Strapi/PostgreSQL)
- See [COLLABORATION.md](../../COLLABORATION.md) for agent workflow

## 📁 Project Structure

```
D:\Projects\Rate\
├── apps\
│   ├── strapi\          # Strapi 5.23.0 backend (Cursor ownership)
│   └── ui\              # Next.js 15 frontend (Claude Code ownership)
├── packages\
│   ├── ai\              # AI analysis service (GPT-5-mini)
│   ├── shared-data\     # API contracts & schemas (shared)
│   ├── design-system\   # TailwindCSS 4 & CKEditor configs
│   ├── eslint-config\   # Shared ESLint rules
│   ├── prettier-config\ # Shared Prettier rules
│   ├── typescript-config\ # Shared TypeScript configs
│   └── validator\       # TypeScript validation
├── Modules\
│   ├── Extension\       # Browser extension (Claude Code)
│   ├── Importer\        # Data crawler (Cursor)
│   └── Validator\       # Python validator (Cursor)
├── Docs\                # Documentation
├── CLAUDE.md            # Claude Code instructions
├── COLLABORATION.md     # Agent collaboration guide
└── CODEOWNERS          # Code ownership mapping
```

## 🚀 Quick Setup

### 1. Clone and Install

```powershell
cd D:\Projects\Rate
yarn install  # Install all dependencies
```

### 2. Environment Setup

```powershell
# Setup environment files for all apps
yarn setup:apps

# Or manually copy and edit
Copy-Item "apps\strapi\.env.example" "apps\strapi\.env"
Copy-Item "apps\web\.env.local.example" "apps\web\.env.local"

# Edit environment files
code apps\strapi\.env
code apps\web\.env.local
```

### 3. Database Setup (PostgreSQL 17)

```powershell
# Option 1: Using local PostgreSQL
# Ensure PostgreSQL 17 is running with user "JOY" and database "rate_db"

# Option 2: Using Docker
cd apps/strapi
docker compose up -d db
cd ../..
```

### 4. Start Development

```powershell
# Start all services (Strapi + Next.js)
yarn dev

# Or start individually
yarn dev:strapi  # Backend only (port 1337)
yarn dev:web      # Frontend only (port 3000)
```

## 🔄 Complete Data Flow with AI

### Data Processing Pipeline

```bash
# 1. Crawl data from sources
cd apps\importer
ts-node-esm Scripts\crawl.ts links     # Get links
ts-node-esm Scripts\crawl.ts crawl     # Crawl details

# 2. Process with AI analysis
ts-node-esm Scripts\ai-batch-processor.ts \
  -i ./Data/crawled \
  -o ./Data/processed \
  -b 50  # 50 records per batch

# 3. Push to validation queue
ts-node-esm Scripts\push-to-validation-with-ai.ts

# 4. Monitor in Strapi Admin
# http://localhost:1337/admin
```

### AI Processing Features

- **Scam Detection**: GPT-5-mini analyzes patterns in Vietnamese & English
- **Batch Processing**: 50 records/batch, ~12s processing time
- **Caching**: Redis cache with 90%+ hit rate for duplicates
- **Cost Optimization**: ~$0.0003/request with GPT-5-mini
- **Confidence Scoring**: 0-1 scale with severity levels

## 🔧 Module-Specific Setup

### Core Platform Access Points

- **Strapi Admin**: http://localhost:1337/admin
- **Next.js Frontend**: http://localhost:3000
- **API Endpoint**: http://localhost:1337/api
- **GraphQL Playground**: http://localhost:1337/graphql

### Shared Data Package

```powershell
# Build shared data package
yarn workspace @repo/shared-data build

# Watch mode for development
yarn workspace @repo/shared-data dev
```

### Browser Extension

```powershell
cd Modules\Extension
npm install
npm run build
# Load unpacked extension from dist\ folder in Chrome/Edge
```

### Data Importer Module

```powershell
cd Modules\Importer
# Setup FlareSolverr with Docker
docker run -d --name flaresolverr -p 8191:8191 flaresolverr/flaresolverr
# Configure and run
python main.py
```

### Validator Service

```powershell
cd Modules\Validator
pip install -r requirements.txt
python worker.py
```

### AI Service Integration

```powershell
# AI service is now integrated as a package
cd packages\ai
yarn build

# Test AI service
node examples\test-gpt5-mini.js

# Configure AI in root .env
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-5-mini
AI_CACHE_ENABLED=true
```

## 🐳 Docker (local DB only)

Compose cho DB đã có sẵn: `apps/strapi/docker-compose.yml` (service `db`).

```powershell
cd apps/strapi
docker compose up -d db
```

## 🧪 Testing Setup

### Unit Tests

```powershell
# Run all tests
yarn test

# Test specific workspace
yarn workspace @repo/web test
yarn workspace @repo/strapi test
```

### Integration Tests

```powershell
# Start test database
docker run -d `
  --name rate-test-db `
  -e POSTGRES_DB=rate_test `
  -e POSTGRES_USER=JOY `
  -e POSTGRES_PASSWORD=password `
  -p 5433:5432 `
  postgres:17

# Run integration tests
yarn test:integration
```

### E2E Tests (Playwright)

```powershell
# Install Playwright browsers
yarn playwright install

# Run E2E tests
yarn test:e2e

# Run smart-component-filter plugin tests
yarn test-plugin

# Run with UI mode
yarn playwright test --ui
```

### Automated Test Workflow

```powershell
# Run PowerShell automated test
yarn auto-test
```

## 🔍 Development Tools

### VS Code Extensions

```json
// .vscode/extensions.json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "ms-python.python",
    "ms-vscode.powershell"
  ]
}
```

### VS Code Settings

```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.associations": {
    "*.env.*": "dotenv"
  }
}
```

## 📊 Monitoring & Debugging

### Health Checks

```powershell
# Check service health
curl http://localhost:1337/api/health
curl http://localhost:8191/v1

# Database connection test
docker exec -it ratebox-db psql -U ratebox -d ratebox -c "SELECT version();"
```

### Log Monitoring

```powershell
# View application logs
docker-compose logs -f rate-new
docker-compose logs -f rate-importer

# Database logs
docker logs ratebox-db

# FlareSolverr logs
docker logs flaresolverr
```

### Performance Monitoring

Sử dụng công cụ sẵn có (Windows, Docker Desktop). Port chính: 1337, 3000, 5432.

### AI Service Monitoring

```powershell
# Check AI service metrics
node -e "
const { AIAnalysisService } = require('./packages/ai/dist/index.js');
const ai = new AIAnalysisService();
const metrics = ai.getMetrics();
console.log('AI Metrics:', metrics);
"

# Monitor Redis cache
docker exec -it redis-container redis-cli
> INFO stats
> KEYS ai:analysis:*
```

Key AI Metrics:

- **API Calls Count**: Total OpenAI API calls made
- **Cache Hit Rate**: Target 90%+ for cost optimization
- **Scams Detected**: Count of confirmed scams (confidence > 0.8)
- **Estimated Cost**: Running cost estimate ($0.0003/request)
- **Avg Response Time**: Target < 15s per batch

## 🔧 Common Development Tasks

### Database Management

```powershell
# Reset database
docker exec -it rate-db psql -U JOY -d rate_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Backup database
docker exec -t rate-db pg_dump -U JOY rate_db > backup.sql

# Restore database
docker exec -i rate-db psql -U JOY rate_db < backup.sql
```

### Code Generation

```powershell
# Generate Strapi types
yarn workspace @repo/strapi ts:generate-types

# Build shared data schemas
yarn workspace @repo/shared-data build
```

### Package Management

```powershell
# Add dependency to specific workspace
yarn workspace @repo/web add <package>
yarn workspace @repo/strapi add <package>

# Add to root (use sparingly)
yarn add -W <package>

# Update all dependencies
yarn upgrade-interactive

# Check for security vulnerabilities
yarn audit
```

### Code Quality

```powershell
# Run linting
yarn lint

# Format code
yarn format

# Type checking
yarn type-check

# Run all checks before commit
yarn lint && yarn format && yarn type-check
```

## 🚨 Troubleshooting

### Common Issues

**Port Conflicts:**

```powershell
# Find processes using ports
netstat -ano | findstr :1337
netstat -ano | findstr :3000

# Kill process by PID
taskkill /PID <PID> /F
```

**Docker Issues:**

```powershell
# Reset Docker
docker system prune -a

# Restart Docker Desktop
Restart-Service docker
```

**Database Connection:**

```powershell
# Test database connection
docker exec -it rate-db psql -U JOY -d rate_db -c "SELECT 1;"

# Check database logs
docker logs rate-db
```

**TypeScript Errors:**

```powershell
# Clear TypeScript cache
Remove-Item -Recurse -Force node_modules\.cache

# Regenerate types
yarn workspace @repo/strapi ts:generate-types
```

**Yarn Workspace Issues:**

```powershell
# Clear yarn cache
yarn cache clean

# Reinstall dependencies
Remove-Item -Recurse -Force node_modules
Remove-Item yarn.lock
yarn install
```

### Development Workflow

1. **Start Database**: PostgreSQL or Docker container
2. **Install Dependencies**: `yarn install`
3. **Setup Environment**: Configure `.env` files
4. **Start Services**: `yarn dev`
5. **Verify Access**: Check http://localhost:1337/admin and http://localhost:3000
6. **Monitor Logs**: Check terminal output for errors

### Collaborative Development (Claude Code + Cursor)

1. **Check CODEOWNERS**: Understand file ownership
2. **Create Feature Branch**: `feat/<area>-<feature>`
3. **Update Shared Data**: Define API contracts first
4. **Develop in Parallel**: Frontend and backend simultaneously
5. **Create PR**: Use template in `.github/pull_request_template.md`
6. **Cross-Review**: Agents review each other's code

## 📚 Additional Resources

### Project Documentation

- **[CLAUDE.md](../../CLAUDE.md)** - Claude Code instructions and project overview
- **[COLLABORATION.md](../../COLLABORATION.md)** - Claude Code + Cursor collaboration guide
- **[CODEOWNERS](../../CODEOWNERS)** - Code ownership mapping

### Architecture Documentation

- **[Platform Overview](../platform/overview.md)** - System architecture
- **[Integration Guide](../platform/integration-guide.md)** - Module integration
- **[MVP Architecture](../platform/mvp-architecture.md)** - Development roadmap
- **[Mirror Fields Pattern](../architecture/)** - Custom field mirroring system

### Module Documentation

- **[Strapi Backend](../../apps/strapi/README.md)** - Backend API documentation
- **[Next.js Frontend](../../apps/web/README.md)** - Frontend application docs
- **[Shared Data](../../packages/shared-data/README.md)** - API contracts & schemas
- **[Browser Extension](../../Modules/Extension/README.md)** - Extension documentation
- **[Data Importer](../../Modules/Importer/README.md)** - Crawler documentation
- **[Validator Service](../../Modules/Validator/README.md)** - Validation worker docs

### Quick Links

- **Strapi Admin**: http://localhost:1337/admin
- **Next.js App**: http://localhost:3000
- **API Docs**: http://localhost:1337/documentation
- **GraphQL**: http://localhost:1337/graphql

---

**Environment**: Windows 11 + PowerShell 7  
**Stack**: Node.js 22.x, Yarn 1.22.x, PostgreSQL 17, Docker  
**Architecture**: Turborepo monorepo  
**Frameworks**: Strapi 5.23.0, Next.js 15, TailwindCSS 4  
**AI Agents**: Claude Code (Frontend), Cursor (Backend)
