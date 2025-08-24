# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rate Platform is an anti-scam ecosystem for Vietnamese users, consisting of a Strapi CMS backend, Next.js frontend, browser extension, and data validation services in a Turborepo monorepo structure.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, TailwindCSS 4, Shadcn/ui
- **Backend**: Strapi 5.20.0 (TypeScript), PostgreSQL 17
- **Languages**: Node.js 22.x, TypeScript 5.x, Python (validator)
- **Package Manager**: Yarn 1.22.x workspaces

## Essential Commands

### Development
```bash
# Install dependencies (use yarn, not npm)
yarn install

# Setup environment files
yarn setup:apps

# Start all services
yarn dev

# Access points:
# Frontend: http://localhost:3000
# Strapi Admin: http://localhost:1337/admin
```

### Build & Deploy
```bash
# Build all apps
yarn build

# Build specific app
yarn build:ui        # Next.js frontend
yarn build:strapi    # Strapi backend
```

### Code Quality
```bash
# Lint code
yarn lint

# Format code
yarn format

# Type checking
yarn type-check

# Run all quality checks before commit
yarn lint && yarn format && yarn type-check
```

### Testing
```bash
# Run automated test workflow (PowerShell)
yarn auto-test

# Run Playwright tests for smart-component-filter plugin
yarn test-plugin
```

## Architecture

### Monorepo Structure
```
apps/
├── strapi/           # Strapi CMS with custom plugins
│   └── src/plugins/smart-component-filter/  # Production plugin
└── ui/               # Next.js frontend application

packages/             # Shared packages
├── design-system/    # TailwindCSS and CkEditor configs
├── eslint-config/    # Shared ESLint rules
├── prettier-config/  # Shared Prettier rules
├── typescript-config/# Shared TypeScript configs
└── validator/        # TypeScript validation package

Modules/             # Independent services
├── Extension/       # Browser extension (Manifest V3)
├── Importer/        # Data crawler with FlareSolverr
└── Validator/       # Python async validation worker
```

### Key Architectural Patterns

1. **Smart Component Filter Plugin**: Strapi plugin that reduces UI complexity by 43% through intelligent filtering
2. **Mirror Fields Pattern**: Custom field mirroring system for data synchronization (see docs/architecture/)
3. **Data Pipeline**: Crawler → Validator → Importer flow with quality scoring
4. **Anti-Detection**: Browser extension uses stealth techniques for scam detection

### Database

- PostgreSQL 17 with user `JOY` and database `rate_db`
- UUID v7 extension for efficient ID generation
- Migrations handled by Strapi

### Environment Variables

Required `.env` files:
- `apps/strapi/.env`: Database credentials, AWS S3, API keys
- `apps/ui/.env.local`: Strapi API URL/tokens, NextAuth secrets

## Development Guidelines

### Package Management
- Always use `yarn` commands, never `npm`
- Add dependencies to specific workspace: `yarn workspace @app/ui add <package>`
- Root dependencies: `yarn add -W <package>`

### TypeScript
- Strict mode enabled
- Use path aliases configured in tsconfig.json
- Validator package provides shared validation schemas

### Strapi Development
- Custom plugins in `apps/strapi/src/plugins/`
- API extensions in `apps/strapi/src/api/`
- Admin customizations in `apps/strapi/src/admin/`

### Next.js Development
- App Router with Server Components
- TailwindCSS 4 with custom design system
- Shadcn/ui components in `apps/ui/components/ui/`
- API routes in `apps/ui/app/api/`

### Testing Approach
- Playwright for E2E testing (smart-component-filter plugin)
- PowerShell automation scripts for workflow testing
- Manual testing for browser extension

## Module-Specific Information

### Browser Extension (`Modules/Extension/`)
- Manifest V3 for Chrome/Edge
- Build: `npm run build` in Extension directory
- Load unpacked extension from `dist/` folder

### Data Importer (`Modules/Importer/`)
- Requires FlareSolverr Docker container running
- Config in `config.json`
- Run: `python main.py`

### Validator Service (`Modules/Validator/`)
- Redis streams for job queue
- PostgreSQL for data storage
- Run: `python worker.py`

## Production Deployment

- **Frontend**: Vercel/Heroku with standalone Next.js output
- **Backend**: Docker containers with managed PostgreSQL
- **Storage**: AWS S3 for Strapi file uploads
- **Monitoring**: Sentry integration for error tracking

## Critical Notes

1. **Node Version**: Must use Node.js 22.x (enforced by engines)
2. **Database**: PostgreSQL 17 required (use Docker if needed)
3. **Localization**: Vietnamese (vi), English (en), Czech (cs) supported
4. **API Tokens**: Strapi API tokens required for frontend-backend communication
5. **File Uploads**: Configure AWS S3 for production Strapi deployments

## Docker Services

**IMPORTANT**: PostgreSQL and Redis run in Docker containers:
- **PostgreSQL**: Container name `DB`, user `JOY`, database `rate_db`
- **Redis**: Container name `redis`, used for job queues and caching
- Access PostgreSQL: `docker exec DB psql -U JOY -d rate_db -c "SQL_QUERY"`
- Access Redis: `docker exec redis redis-cli COMMAND`