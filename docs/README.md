# Rate-New Documentation

## Project Overview

Rate-New is a modern review and rating platform built with:

- **Backend**: Strapi 5.13.1 + PostgreSQL
- **Frontend**: Next.js 15 + Tailwind CSS
- **Architecture**: Monorepo with Turborepo

## Project Structure

```
Rate-New/
├── apps/
│   ├── strapi/          # Backend API
│   └── ui/              # Frontend Next.js app
├── docs/                # Documentation
├── packages/            # Shared packages
└── scripts/             # Build scripts
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Yarn or npm

### Development Setup

1. **Clone and install**:

```bash
git clone <repository>
cd Rate-New
yarn install
```

2. **Database setup**:

```bash
# Create PostgreSQL database
createdb rate_new_dev
```

3. **Environment configuration**:

```bash
# Copy environment files
cp apps/strapi/.env.example apps/strapi/.env.local
cp apps/ui/.env.example apps/ui/.env.local

# Update database credentials in apps/strapi/.env.local
DATABASE_URL=postgresql://username:password@localhost:5432/rate_new_dev
```

4. **Start development servers**:

```bash
# Terminal 1: Start Strapi
cd apps/strapi
yarn develop

# Terminal 2: Start Next.js
cd apps/ui
yarn dev
```

5. **Access applications**:

- Strapi Admin: http://localhost:1337/admin
- Next.js Frontend: http://localhost:3001

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

### Architecture & Design

- 📚 **[Dynamic Content Architecture](./dynamic-content-architecture.md)** - Core system design, API patterns, review system và user profiles
- 🚀 **[Implementation Plan - Dynamic Zone Native](./implementation-plan-dynamic-zone-native.md)** - Smart Loading + Smart Component Filter Plugin
- 🔧 **[Backup & Disaster Recovery](./backup-disaster-recovery.md)** - Production deployment và recovery procedures

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
- **Workaround**:
  - Strapi: http://localhost:1337
  - Next.js: http://localhost:3001

### TailwindCSS v4 Compatibility

- **Issue**: Crashes with Turborepo (exit code 3221225786)
- **Status**: Under investigation
- **Workaround**: Run services separately

## Development Workflow

### Dynamic Content Development

1. **Define Listing Type** in Strapi admin
2. **Create Components** for field groups
3. **Configure Criteria** for rating system
4. **Set Permissions** and display rules
5. **Implement Frontend** renderers
6. **Test User Flows** end-to-end

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

#### Dynamic Form Not Loading

1. Check Listing Type configuration
2. Verify component definitions
3. Review browser console for errors
4. Test API connectivity

#### JSON Query Performance

1. Add JSONB indexes for frequently queried fields
2. Use PostgreSQL 12+ generated columns
3. Implement caching layer
4. Consider query optimization

#### Schema Validation Errors

1. Check component field definitions
2. Verify required field constraints
3. Review validation middleware logs
4. Test with minimal data first

### Performance Monitoring

- Database query analysis
- JSON field access patterns
- Cache hit rates
- API response times

## Contributing

### Development Guidelines

1. **Follow Architecture**: Use JSON fields for dynamic content
2. **Component Reuse**: Create reusable field components
3. **Performance First**: Consider query optimization
4. **Documentation**: Update docs with new content types

### Code Style

- Use TypeScript for type safety
- Comment complex JSON transformations
- Test dynamic field handling
- Validate against schemas

---

**Last Updated**: 2024-12-19  
**Version**: 2.0  
**Architecture**: Dynamic Content System
