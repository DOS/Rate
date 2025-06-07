---
description: Smart Component Filter Plugin version management và build automation
globs: ["apps/strapi/src/plugins/smart-component-filter/**/*", "package.json"]
alwaysApply: true
---

# Smart Component Filter Plugin Version Management

## 🔢 Version Increment Pattern

### Current Version: v2.0.2

### Version History
- v2.0.1: Initial native Strapi MultiSelect implementation
- v2.0.2: Fixed intlLabel error + improved stability

### Automatic Version Increment Workflow

Khi build plugin, LUÔN increment version theo pattern:
1. **Patch version** (x.x.X) cho bug fixes
2. **Minor version** (x.X.x) cho new features  
3. **Major version** (X.x.x) cho breaking changes

### Build Automation Steps

```bash
# 1. Update package.json version
"version": "2.0.X"

# 2. Update strapi description
"description": "Smart Component Filter vX.X.X - Native Strapi MultiSelect with dynamic component loading and real-time filtering"

# 3. Update component hint
Field.Hint: "Smart Component Filter vX.X.X - Native Strapi MultiSelect with dynamic components from database"

# 4. Build plugin
cd apps/strapi/src/plugins/smart-component-filter && yarn build

# 5. Test functionality
npx playwright test test-version-X.X.X.spec.js --headed
```

## 📝 Version Documentation

### Changelog Template
```markdown
## vX.X.X - [Date]

### Added
- New features

### Fixed  
- Bug fixes

### Changed
- Improvements

### Technical
- Implementation details
```

## 🧪 Testing Pattern

Mỗi version mới PHẢI có test file:
- `test-version-X.X.X.spec.js`
- Verify API functionality
- Check UI components
- Validate no JavaScript errors

## 🎯 Quality Gates

Trước khi release version mới:
1. ✅ Plugin builds successfully
2. ✅ API endpoints working
3. ✅ Native MultiSelect functional
4. ✅ No console errors
5. ✅ Test suite passes

## 📦 Build Artifacts

Sau mỗi build, check:
- `dist/admin/index.mjs` updated
- `dist/server/index.mjs` updated  
- Version reflected trong UI hints
- No TypeScript errors

## 🔄 Continuous Integration

Auto-increment pattern:
- Bug fix → patch version
- New feature → minor version
- Breaking change → major version
- Always update all version references
- Always test after build 