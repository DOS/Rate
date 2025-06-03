# Development Guide - Turborepo Monorepo

This project uses **Turborepo** to manage the Strapi + Next.js monorepo. Always use the correct commands to avoid dependency issues.

## 🚀 Quick Start

### Development Commands (from root directory)

```bash
# ✅ Run both Strapi + Next.js
npm run dev

# ✅ Run individually
npm run dev:strapi    # Strapi only (port 1337)
npm run dev:ui        # Next.js only (port 3000)
```

### Build Commands

```bash
npm run build               # Build all packages
npm run build:strapi        # Build Strapi only
npm run build:ui           # Build Next.js only
```

## 🌐 URLs

- **Strapi Admin**: http://localhost:1337/admin
- **Next.js Frontend**: http://localhost:3000
- **Demo Page**: http://localhost:3000/demo

## ❌ Common Mistakes

**DON'T do this:**
```bash
cd apps/strapi && npm run develop
cd apps/ui && npm run dev
```

**Why it fails:**
- Bypasses Turborepo dependency pipeline
- Shared packages not built (`@repo/shared-data`, `@repo/design-system`)
- Missing workspace linking → 404 errors

## 🛠️ Troubleshooting

### Content Type Builder 404 Error
```bash
# Kill all processes
taskkill /f /im node.exe

# Restart with Turbo
npm run dev:strapi
```

### Next.js Import Errors
```bash
# Ensure shared packages built
npm run build

# Then start development
npm run dev
```

### Port Conflicts
```bash
# Kill specific port
npx kill-port 1337
npx kill-port 3000
```

## 📦 Project Structure

```
Rate-New/
├── apps/
│   ├── strapi/          # Strapi v5 CMS
│   └── ui/              # Next.js 15 Frontend
├── packages/
│   ├── shared-data/     # Shared types & constants
│   └── design-system/   # UI components
└── turbo.json          # Turborepo configuration
```

## 🔧 Dependencies

The Turborepo setup ensures:
1. **Shared packages** build before apps
2. **Workspace linking** works correctly
3. **Hot reloading** across packages
4. **Efficient caching** and builds

Always use Turborepo commands for the best experience!
