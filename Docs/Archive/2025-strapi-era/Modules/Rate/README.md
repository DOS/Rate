# Rate (Strapi + Next.js) Documentation

## Overview

Nền tảng đánh giá và cảnh báo lừa đảo, triển khai trong monorepo Turborepo tại `D:\Projects\Rate`.

- **Backend**: Strapi 5.23.0 + PostgreSQL 17 (DB chạy bằng Docker Compose trong `apps/strapi`)
- **Frontend**: Next.js 15 + Tailwind CSS
- **Monorepo**: Turborepo + Yarn Workspaces

## Project Structure

```
Rate/                                # Monorepo root
├── apps/
│   ├── strapi/                      # Backend API (Strapi)
│   └── ui/                          # Frontend Next.js app
├── packages/                        # Shared packages (UI, types, config, ...)
│   ├── design-system/
│   ├── shared-data/
│   ├── eslint-config/
│   ├── prettier-config/
│   └── typescript-config/
├── Docs/                            # Documentation
├── turbo.json
├── package.json
└── yarn.lock
```

- **`modules/Rate-Importer/`**: Batch crawler, API import, CLI tools
- **`modules/Rate-Extension/`**: Chrome extension (browser automation, AJAX crawling)
- **`modules/Core-Validator/`**: Shared validation, enrichment, dedup, fraud scoring

> **Mỗi module là 1 workspace/package độc lập, dễ phát triển song song, chia sẻ code qua packages/**

---

### Recommended Dev Workflow

- Mỗi dev có thể mở riêng từng folder module (Importer, Extension, Validator, ...) bằng nhiều cửa sổ IDE/Windsurf.
- Khi phát triển/tối ưu core logic (validator, adapter, ...), chỉ cần sửa ở module tương ứng, các module khác sẽ tự động nhận update khi build lại.
- Sử dụng lệnh build/test/lint từ root hoặc từng workspace.

---

### Multi-Module/Package Development

- **Không bị conflict khi mở nhiều cửa sổ IDE cho từng module** (chỉ cần tránh sửa cùng 1 file ở nhiều nơi cùng lúc).
- Có thể chạy test/build/lint cho từng module hoặc toàn bộ project bằng Turborepo/Yarn workspaces.
- Khi move các module vào monorepo, giữ nguyên git history bằng lệnh `git mv` hoặc các tool merge history nếu cần.

---

### Tài liệu bổ sung

- Cập nhật thêm docs cho từng module tại `modules/Rate-Importer/README.md`, `modules/Rate-Extension/README.md`, `modules/Core-Validator/README.md` để hướng dẫn dev, build, test từng phần.

### Importer/Extension

Importer/Extension được quản lý ở tài liệu riêng trong `Docs/Modules/Importer/*` và `Docs/Modules/Extension/*`.

### Quick Start

### Prerequisites

- Node.js 22
- Docker Desktop (chỉ cho PostgreSQL local)
- Yarn 1.22 (không dùng npm/pnpm trong monorepo này)
- PowerShell 7 (Windows 11)

### Development Setup

1.  **Install** (từ project root):

    ```powershell
    cd D:\Projects\Rate
    yarn install
    ```

2.  **Database (compose)**:

    ```powershell
    cd apps/strapi
    docker compose up -d db
    cd ../..
    ```

    **Database Connection Info (default)**
    *   Host: localhost:5432
    *   Database: từ `.env` (`apps/strapi/.env`)
    *   User/Pass: từ `.env`

3.  **Environment configuration**:

    ```bash
    # Copy environment files
    cp apps/strapi/.env.example apps/strapi/.env.local
    cp apps/web/.env.example apps/web/.env.local

    # Update database credentials in apps/strapi/.env.local
    DATABASE_URL=postgresql://JOY:your_password@localhost:5432/ratebox
    ```

3.  **Start development (từ root)**:

    ```powershell
    yarn dev
    # Hoặc riêng lẻ
    yarn dev:strapi
    yarn dev:ui
    yarn build
    ```

    **⚠️ Lưu ý quan trọng:**
    *   Luôn chạy lệnh từ thư mục root của dự án
    *   Sử dụng yarn, tuyệt đối không dùng npm
    *   Trên PowerShell 7 Windows 11

5.  **Access applications**:

    - Strapi Admin: http://localhost:1337/admin
    - Next.js Frontend: http://localhost:3000

### Development Tools

- **MCP Browser Automation**: Port 8931 (tuỳ chọn)
- **PostgreSQL**: Docker Compose service `db` (5432)
- **Turborepo**: Parallel task execution và caching

## Core Architecture

### Dynamic Content System

Rate-New implements a flexible Content Construction Kit (CCK) similar to JReviews:

#### **Core Concepts**

- **Listing Type**: Schema definition for content categories (Scammer, Gamer, Product, etc.)
- **Item**: Unique entities/profiles (master records)
- **Listing**: Multiple instances/reports about an Item
- **Components**: Reusable field groups for different content types

#### **Key Features**

- ✅ **Schema Flexibility**: Define any content type without code changes
- ✅ **Dynamic Forms**: Admin UI adapts to content type schemas
- ✅ **JSON Field Data**: Efficient storage for varied field structures
- ✅ **Performance Optimized**: JSONB indexes for fast queries
- ✅ **Scalable**: Handle millions of records with 60-70% of full table performance

### Content Flow Example

```
Directory (People)
  └── Category (Romance Scam)
      └── Listing Type (Scammer)
          └── Item (Nguyễn Văn A Profile)
              └── Listings (Individual victim reports)
```

## Core Features

### Multi-language Support

- Internationalization (i18n) with locale-specific content
- Supported locales: `en`, `cs`, `vi`
- URL structure: `/[locale]/[...path]`

### Dynamic Content Management

- **Listing Types**: Define schemas for any content category
- **Field Groups**: Reusable component-based field definitions
- **Dynamic Forms**: Auto-generated admin interfaces
- **Validation**: Server-side schema validation
- **Custom Criteria**: Flexible rating systems per content type

### Review & Rating System

- Multi-criteria rating based on Listing Type configuration
- Comment moderation
- User-generated content with evidence upload
- Report submission workflows

## Documentation

### System Architecture

- 📚 **[Dynamic Content Architecture](./dynamic-content-architecture.md)** - Core system design, API patterns, review system và user profiles
- 🚀 **[Implementation Plan - Dynamic Zone Native](./implementation-plan-dynamic-zone-native.md)**
- 🔧 **[Backup & Disaster Recovery](./backup-disaster-recovery.md)** - Production deployment và recovery procedures
- 🧭 Xem tổng quan tại: [Platform Overview](../../Platform/Overview.md) và [Integration Guide](../../Platform/Integration-Guide.md)

### Module Documentation

- 🕷️ **[Crawler Module](./modules/crawler.md)** - Data crawling and extraction overview
- 📡 **[Crawler API Reference](./modules/crawler-api.md)** - CLI commands and data schemas
- 🏛️ **[Crawler Architecture](./modules/crawler-architecture.md)** - Technical implementation details
- 🚀 **[Crawler Deployment](./modules/crawler-deployment.md)** - Setup and deployment guide
- 🗺️ **[Crawler Roadmap](./crawler-roadmap.md)** - Development phases and milestones

### Development Guides

- 🌍 **[Adding New Locale Guide](./adding-new-locale.md)** - i18n implementation steps
- 🏗️ **[Strapi i18n Single Types](./strapi-i18n-single-types.md)** - Troubleshooting i18n issues
- 🚀 **[Dynamic Zone Native + Smart Loading Implementation](./implementation-plan-dynamic-zone-native.md)** - Native i18n với zero-downtime deployment

## Known Issues

### i18n URL Encoding

- **Issue**: URL parameters show `%5B` instead of `[` for array parameters
- **Status**: ✅ Fixed with middleware
- **Solution**: Added `normalize-i18n-params.ts` middleware

### Port Conflicts

- **Issue**: Default ports conflict with other projects
- **Current Setup**:
  - Strapi: http://localhost:1337
  - Next.js: http://localhost:3000
  - PostgreSQL: localhost:5432 (Docker container `DB`)
  - MCP Server: http://localhost:8931

### TailwindCSS v4 Compatibility

- **Issue**: Crashes with Turborepo (exit code 3221225786)
- **Status**: Under investigation
- **Workaround**: Run services separately

## Development Workflow

### Dynamic Content Development

1.  **Define Listing Type** in Strapi admin
2.  **Create Components** for field groups
3.  **Configure Criteria** for rating system
4.  **Set Permissions** and display rules
5.  **Implement Frontend** renderers
6.  **Test User Flows** end-to-end

### Architecture Decisions

Rate-New chose **Generic Component Strategy** for dynamic content management:

| Approach               | Zero Downtime | Native UX | Complexity | Verdict         |
| ---------------------- | ------------- | --------- | ---------- | --------------- |
| **JSON Fields**        | ❌ Custom UI  | ⭐⭐⭐    | ⭐⭐⭐     | ❌ Replaced     |
| **Virtual Components** | ✅            | ✅        | ⭐⭐⭐     | ❌ Complex      |
| **Generic Component**  | ✅            | ✅        | ⭐⭐⭐⭐⭐ | ✅ **Selected** |

#### **Generic Component Benefits**

- ✅ **Zero Downtime**: Add field groups without deployment
- ✅ **Native UX**: Full Strapi Design System integration
- ✅ **Business Self-Service**: Marketing team can create fields
- ✅ **Simple Maintenance**: Single component system
- ✅ **Future-Proof**: Can optimize incrementally

## Implementation Status

### ✅ Completed

- Core Strapi + Next.js setup
- Basic content types and API structure
- Multi-language support framework
- Development environment configuration

### 🚧 In Progress

- **[Dynamic Zone Native + Smart Loading](./implementation-plan-dynamic-zone-native.md)** (6-week implementation plan)
- Dynamic field group system
- Zero-downtime content schema management

### 📋 Planned

- Review and rating system
- User profile management
- Advanced search capabilities
- Content moderation workflows

## API Documentation

### Core Endpoints

- `/api/listing-types` - Schema definitions and content type configuration
- `/api/items` - Master entities with dynamic field data
- `/api/listings` - Content instances and reports
- `/api/directories` - Content organization structure

### Dynamic Data Structure

```javascript
// Item with dynamic fields
{
  "Title": "Scammer Profile",
  "listing_type": "scammer_type_id",
  "field_data": {
    "known_accounts": { "phone": "0901234567" },
    "risk_assessment": { "level": "High", "confidence": 85 }
  }
}
```

## Deployment

### Environment Variables

Required for production:

- `DATABASE_URL` - PostgreSQL connection
- `NEXTAUTH_SECRET` - Authentication secret
- `NEXTAUTH_URL` - Base application URL
- `STRAPI_TOKEN` - API authentication

### Performance Optimization

```sql
-- JSONB indexes for dynamic fields
CREATE INDEX idx_items_risk_level ON items
  USING GIN ((field_data->>'risk_level'));
```

## Troubleshooting

### Common Issues

#### Strapi Không Khởi Động

1.  **Custom Field Registration Error**:
    ```bash
    Error: Custom field: 'plugin::smart-component-filter.component-multi-select' has already been registered
    ```
    *   **Solution**: Rebuild plugin với `npx @strapi/sdk-plugin@latest build`
    *   **Location**: `apps/strapi/src/plugins/smart-component-filter/`

2.  **Database Connection Failed**:
    ```bash
    docker start DB  # Khởi động PostgreSQL container
    ```

3.  **Plugin Build Issues**:
    ```bash
    cd apps/strapi/src/plugins/smart-component-filter
    npx @strapi/sdk-plugin@latest build
    ```

#### Dynamic Form Not Loading

1.  Check Listing Type configuration
2.  Verify component definitions
3.  Review browser console for errors
4.  Test API connectivity

#### JSON Query Performance

1.  Add JSONB indexes for frequently queried fields
2.  Use PostgreSQL 12+ generated columns
3.  Implement caching layer
4.  Consider query optimization

#### Schema Validation Errors

1.  Check component field definitions
2.  Verify required field constraints
3.  Review validation middleware logs
4.  Test with minimal data first

#### MCP Browser Automation Issues

1.  **Server Not Running**:
    ```bash
    npx @playwright/mcp@latest --port 8931 --config D:\\Projects\\JOY\\Rate-New\\playwright-mcp-config.json
    ```

2.  **Port Check**:
    ```bash
    netstat -an | findstr 8931
    ```
