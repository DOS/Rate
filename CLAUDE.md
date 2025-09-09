# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Language Requirement
**ALWAYS respond in Vietnamese (Tiếng Việt) unless explicitly asked to use another language.**

## Project Overview

Rate Platform is an anti-scam ecosystem for Vietnamese users, built as a Turborepo monorepo with AI-powered features including fake review detection, sentiment analysis, and fraud prevention using GPT-4o-mini.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, TailwindCSS 4, Shadcn/ui
- **Backend**: Strapi 5.23.1 (TypeScript), PostgreSQL 17
- **AI Service**: OpenAI GPT-4o-mini for scam detection and analysis
- **Languages**: Node.js 22.x, TypeScript 5.x, Python (validator)
- **Package Manager**: Yarn 1.22.x workspaces (NEVER use npm/npx)
- **Infrastructure**: Docker, Redis, FlareSolverr

## Essential Commands

### Development

```bash
# Install dependencies (ALWAYS use yarn, NEVER npm)
yarn install

# Setup environment files
yarn setup:apps

# Start all services (Strapi + Next.js)
yarn dev

# Start specific service
yarn dev:strapi      # Backend only (port 1337)
yarn dev:web         # Frontend only (port 3000)

# Access points:
# Frontend: http://localhost:3000
# Strapi Admin: http://localhost:1337/admin
# API: http://localhost:1337/api
# GraphQL: http://localhost:1337/graphql

# IMPORTANT: Only this project uses ports 3000 and 1337
# If port conflict occurs, kill specific process by PID:
# Windows: Get-Process node | Where-Object {$_.CommandLine -like "*1337*"}
# Then: Stop-Process -Id [PID]
```

### Build & Deploy

```bash
# Build all apps
yarn build

# Build specific app
yarn build:strapi    # Strapi backend
yarn build:web       # Next.js frontend

# Type generation for Strapi
yarn workspace @repo/strapi generate:types
```

### Code Quality

```bash
# Run all quality checks before commit
yarn lint            # ESLint
yarn format          # Prettier
yarn type-check      # TypeScript

# Run tests
yarn test            # All tests
yarn test-plugin     # Smart-component-filter plugin tests
yarn auto-test       # PowerShell automated test workflow
```

## Architecture

### Monorepo Structure

```
apps/
├── strapi/              # Strapi CMS backend
│   ├── src/api/         # API endpoints and content types
│   ├── src/admin/       # Admin panel customizations
│   ├── src/components/  # Strapi components
│   ├── src/services/    # Business logic services
│   └── config/          # Strapi configuration
├── web/                 # Next.js frontend application
│   ├── app/            # App Router pages and layouts
│   ├── components/     # React components
│   └── lib/            # Utilities and helpers
└── importer/           # Data crawler with AI processing

packages/               # Shared packages
├── ai/                 # OpenAI GPT-4o-mini integration
├── design-system/      # TailwindCSS 4 and CKEditor configs
├── eslint-config/      # Shared ESLint rules
├── prettier-config/    # Shared Prettier rules
├── shared-data/        # API contracts and TypeScript schemas
├── typescript-config/  # Shared TypeScript configs
└── validator/          # TypeScript validation package

Modules/                # Independent services (legacy structure)
├── Extension/          # Browser extension (Manifest V3)
├── Importer/          # Legacy crawler module
└── Validator/         # Python async validation worker
```

### Key Architectural Patterns

1. **Turborepo Monorepo**: Efficient build system with caching
2. **Shared Data Package**: TypeScript API contracts between frontend and backend
3. **AI Processing Pipeline**: Crawler → AI Analysis → Validator → Database
4. **Redis Caching**: 90%+ cache hit rate for AI results
5. **Docker Services**: PostgreSQL and Redis run in containers

### Database

- **PostgreSQL 17**: Container name `DB`, user `JOY`, database `rate_db`
- **UUID v7 extension**: For efficient ID generation
- **Migrations**: Handled by Strapi
- **Access**: `docker exec DB psql -U JOY -d rate_db`

### Environment Variables

Required `.env` files:

- `apps/strapi/.env`: Database credentials, AWS S3, API keys, Strapi secrets
- `apps/web/.env.local`: Strapi API URL/tokens, NextAuth secrets, app URLs
- Root `.env`: OpenAI API key and AI service configuration

Key variables:
```bash
# Root .env
OPENAI_API_KEY=sk-proj-xxxxx
OPENAI_MODEL=gpt-4o-mini
AI_CACHE_ENABLED=true

# apps/strapi/.env
DATABASE_CLIENT=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=ratebox
DATABASE_USERNAME=JOY
DATABASE_PASSWORD=<password>

# apps/web/.env.local
STRAPI_URL=http://127.0.0.1:1337
STRAPI_REST_READONLY_API_KEY=<api-key>
APP_PUBLIC_URL=http://localhost:3000
```

## Development Guidelines

### CRITICAL RULES - NEVER VIOLATE
1. **NEVER hardcode fake/test data** - Always use real data from sources
2. **NEVER use fallback values with fake content** - Use empty strings or skip processing
3. **NEVER cheat or create fake listings** - Validate and reject if data insufficient
4. **ALWAYS validate data completeness** - Skip/warn if missing critical fields
5. **ALWAYS log clearly when data is missing** - Help debug data issues

### Package Management

- **CRITICAL**: Always use `yarn`, NEVER use `npm` or `npx`
- Add dependencies: `yarn workspace @repo/[workspace] add <package>`
- Root dependencies: `yarn add -W <package>`
- Install: `yarn install` (NOT npm install)
- Scripts: Use yarn scripts defined in package.json

### TypeScript

- Strict mode enabled across all packages
- Use path aliases from tsconfig.json
- Generate Strapi types: `yarn workspace @repo/strapi generate:types`
- Shared types in `packages/shared-data`

### Strapi Development

- Custom content types in `apps/strapi/src/api/`
- Services for business logic in `apps/strapi/src/services/`
- Admin customizations in `apps/strapi/src/admin/`
- API tokens required for frontend-backend communication

### Next.js Development

- App Router with Server Components (app/ directory)
- TailwindCSS 4 with custom design system
- Shadcn/ui components in `components/ui/`
- API routes in `app/api/`
- Use environment variables from `.env.local`

### AI Integration

```bash
# AI Processing Pipeline
cd apps/importer

# 1. Crawl data
ts-node-esm Scripts/crawl.ts links
ts-node-esm Scripts/crawl.ts crawl

# 2. Process with AI (GPT-4o-mini)
ts-node-esm Scripts/ai-batch-processor.ts \
  -i ./Data/crawled \
  -o ./Data/processed \
  -b 50  # 50 records per batch

# 3. Push to validation
ts-node-esm Scripts/push-to-validation-with-ai.ts
```

### Testing Approach

- Playwright for E2E testing
- Jest for unit tests
- PowerShell automation scripts: `yarn auto-test`
- Manual testing for browser extension

## Docker Services

**IMPORTANT**: Core services run in Docker:

- **PostgreSQL**: Container `DB`, port 5432
- **Redis**: Container `redis`, port 6379
- **FlareSolverr**: For anti-bot bypass, port 8191

Docker commands:
```bash
# Start database
cd apps/strapi && docker compose up -d db

# Access PostgreSQL
docker exec DB psql -U JOY -d rate_db

# Access Redis
docker exec redis redis-cli
```

## Process Management

**CRITICAL**: NEVER kill all Node.js processes indiscriminately

- Identify specific process: `Get-Process node`
- Kill by PID only: `Stop-Process -Id <PID>`
- Check port usage: `netstat -ano | findstr :[PORT]`

## Common Development Tasks

### Database Operations

```bash
# Backup database
docker exec -t DB pg_dump -U JOY rate_db > backup.sql

# Restore database
docker exec -i DB psql -U JOY rate_db < backup.sql

# Reset database
docker exec DB psql -U JOY -d rate_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

### Debugging

```bash
# Check service health
curl http://localhost:1337/api/health
curl http://localhost:3000/api/health

# View logs
docker logs DB
docker logs redis

# Clear caches
yarn cache clean
Remove-Item -Recurse -Force node_modules/.cache
```

## Critical Notes

1. **Node Version**: Must use Node.js 22.x
2. **Yarn Version**: Must use Yarn 1.22.x (enforced by preinstall script)
3. **Never use npm**: Project uses Yarn workspaces exclusively
4. **Database**: PostgreSQL 17 in Docker container named `DB`
5. **Ports**: 3000 (Next.js), 1337 (Strapi) - ensure no conflicts
6. **API Tokens**: Configure Strapi API tokens for frontend access
7. **File Uploads**: AWS S3 configuration required for production
8. **AI Service**: OpenAI API key required for scam detection features
9. **Language**: Always respond in Vietnamese unless specified otherwise