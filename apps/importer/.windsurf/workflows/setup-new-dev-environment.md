---
description: Setup New Dev Environment
---

Setup complete development environment for Rate-Importer project on a new machine.

Steps:
1. Check and install prerequisites: Node.js 18+, pnpm, Docker Desktop, Python 3.9+
2. Clone repository and setup git hooks
3. Create .env files from .env.example for all services
4. Install dependencies: pnpm install for Node projects, pip requirements for Python
5. Build and start all Docker containers: docker compose up -d
6. Run database migrations for PostgreSQL
7. Seed initial data for Strapi CMS
8. Verify all services are running: Next.js (3000), Strapi (1337), PostgreSQL (5432)
9. Run smoke tests to ensure everything works
10. Update memory bank with environment setup details