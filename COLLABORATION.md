# Collaboration Guide: Claude Code + Cursor

This document outlines the collaboration workflow between Claude Code and Cursor agents working on the Rate platform.

## Agent Responsibilities

### Claude Code (Frontend Focus)
- **Primary**: UI/UX implementation with React/Next.js
- **Components**: Shadcn/ui, TailwindCSS styling
- **Features**: User-facing features, responsive design
- **Testing**: Frontend E2E tests with Playwright

### Cursor (Backend Focus)
- **Primary**: Strapi API development
- **Database**: PostgreSQL schema, migrations
- **Services**: Business logic, data validation
- **Performance**: Query optimization, caching

## Workflow

### 1. Feature Planning (10-15 minutes)
```
1. Define feature requirements
2. Design API contract in packages/shared-data
3. Create feature branches: feat/<area>-<feature>
4. Assign ownership via CODEOWNERS
```

### 2. Parallel Development
```
Backend (Cursor):                Frontend (Claude):
1. Create Strapi content type    1. Create UI structure
2. Implement services/controllers 2. Build components
3. Define API endpoints          3. Integrate with API client
4. Add validation                4. Add error handling
```

### 3. Integration Points

#### Shared Data Package (`packages/shared-data`)
- **Owner**: Both (Backend leads changes)
- **Purpose**: API contracts, types, schemas
- **Process**: Backend defines → Frontend consumes

Example:
```typescript
// Backend adds new schema
export const FeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  // ...
});

// Frontend imports and uses
import { FeatureSchema } from '@repo/shared-data';
```

### 4. Git Workflow

#### Branch Naming
```
feat/<area>-<short-description>
fix/<area>-<issue-number>
chore/<area>-<task>
```

Examples:
- `feat/ui-user-profile`
- `feat/api-authentication`
- `fix/ui-responsive-layout`

#### Commit Convention
```
<type>(<scope>): <subject>

<body>

<footer>
```

Examples:
```
feat(ui): add user profile page
fix(api): resolve N+1 query in listings
chore(shared): update Zod schemas
```

### 5. Pull Request Process

1. **Create PR** using template in `.github/pull_request_template.md`
2. **Label appropriately**:
   - `area:frontend` or `area:backend`
   - `feature:<name>`
   - `breaking:api` if applicable
3. **Cross-review**:
   - Claude reviews backend DX/API design
   - Cursor reviews frontend performance/patterns
4. **Merge strategy**: Squash and merge

### 6. Avoiding Conflicts

#### File Ownership
```
Claude Code:                    Cursor:
apps/ui/src/**                 apps/strapi/src/api/**
Modules/Extension/**           apps/strapi/config/**
                              Modules/Importer/**
                              Modules/Validator/**
```

#### Shared Areas (Coordinate First)
- `packages/shared-data/` - Discuss schema changes
- Root config files - Announce changes in PR
- Documentation - Update collaboratively

### 7. Communication Patterns

#### API Changes
```typescript
// packages/shared-data/CHANGELOG.md
## [1.1.0] - 2025-01-23
### Added
- New UserPreferences schema
### Breaking
- Renamed User.name to User.displayName
```

#### Feature Handoff
```markdown
## Feature: User Authentication
### Backend Complete ✓
- [x] JWT implementation
- [x] Refresh token logic
- [x] Rate limiting

### Frontend TODO
- [ ] Login/Register forms
- [ ] Token management
- [ ] Protected routes
```

## Quick Reference

### Commands
```bash
# Create feature branch
git checkout -b feat/ui-dashboard

# Run only your area
yarn dev --filter=@repo/ui      # Claude
yarn dev --filter=@repo/strapi  # Cursor

# Test your changes
yarn build --filter=@repo/ui
yarn type-check --filter=@repo/strapi

# Sync with main
git fetch origin
git rebase origin/main
```

### Environment Separation (Optional)
```bash
# Claude's env
DATABASE_URL=postgresql://JOY@localhost/rate_db?schema=claude

# Cursor's env  
DATABASE_URL=postgresql://JOY@localhost/rate_db?schema=cursor
```

## Troubleshooting

### Merge Conflicts
1. Pull latest from main
2. Resolve in feature branch
3. Test both frontend and backend
4. Request review from other agent

### API Contract Mismatch
1. Check `packages/shared-data` version
2. Rebuild packages: `yarn build --filter=@repo/shared-data`
3. Restart dev servers

### Type Errors
1. Regenerate types: `yarn strapi ts:generate-types`
2. Update shared-data exports
3. Clear TypeScript cache: `rm -rf node_modules/.cache`

## Best Practices

1. **Small PRs**: Keep changes focused and reviewable
2. **Frequent Syncs**: Merge main daily to avoid conflicts
3. **Clear Communication**: Use PR descriptions and comments
4. **Test Integration**: Always test frontend with backend
5. **Document Changes**: Update relevant README files

## Example Feature Implementation

### Feature: Product Reviews

#### 1. API Contract (Both)
```typescript
// packages/shared-data/src/schemas/product-review.schema.ts
export const ProductReviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string(),
});
```

#### 2. Backend Implementation (Cursor)
```typescript
// apps/strapi/src/api/product-review/
- content-types/product-review/schema.json
- controllers/product-review.ts
- services/product-review.ts
- routes/product-review.ts
```

#### 3. Frontend Implementation (Claude)
```typescript
// apps/ui/src/app/(features)/reviews/
- components/ReviewList.tsx
- components/ReviewForm.tsx
- hooks/useReviews.ts
- page.tsx
```

#### 4. Integration Test
```bash
# Both agents test together
yarn dev
# Create review via UI
# Verify in Strapi admin
# Check API response
```

## Questions?

- Technical issues: Create GitHub issue
- Process questions: Update this document
- Urgent blocks: Comment in PR for quick resolution