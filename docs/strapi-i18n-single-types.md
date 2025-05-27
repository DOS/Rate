# Strapi i18n Single Types - Troubleshooting Guide

## Problem: 403 Forbidden Error on i18n Single Types

When accessing i18n-enabled single types (like Navbar, Footer) from Strapi admin menu, you may encounter a 403 Forbidden error.

## Root Cause

Strapi requires i18n-enabled single types to have at least one entry before the admin menu navigation works properly. Without an initial entry, Strapi doesn't know which locale to redirect to.

## Solution

### Step 1: Access with Locale Parameter

Manually navigate to the single type with locale parameter:

```
http://localhost:1337/admin/content-manager/single-types/api::[single-type-name].[single-type-name]?plugins[i18n][locale]=en
```

Example for Navbar:

```
http://localhost:1337/admin/content-manager/single-types/api::navbar.navbar?plugins[i18n][locale]=en
```

### Step 2: Create First Entry

1. Create an entry for the default locale (usually 'en')
2. Save the entry (no need to publish immediately)
3. After the first entry exists, menu navigation will work normally

## Additional Notes

### Console Errors to Ignore

You may see this error in console - it's a known Strapi bug and doesn't affect functionality:

```
GET /content-manager/single-types/api::navbar.navbar/actions/countDraftRelations 403 (Forbidden)
```

### Best Practices

1. **Use draftAndPublish: true** for i18n single types (more stable)
2. **Create entries for all locales** declared in your admin config
3. **Check locale configuration** in `src/admin/app.tsx`:
   ```typescript
   config: {
     locales: ["en", "cs"], // Ensure these locales exist in database
   }
   ```

### Alternative Workaround (Not Recommended)

If you need automatic locale parameter injection, add this to `src/admin/app.tsx`:

```typescript
bootstrap(app: StrapiApp) {
  const fixI18nLinks = () => {
    setTimeout(() => {
      const navbarLinks = document.querySelectorAll('a[href*="/content-manager/single-types/api::navbar.navbar"]');
      navbarLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.includes('plugins[i18n][locale]')) {
          link.setAttribute('href', href + '?plugins[i18n][locale]=en');
        }
      });
    }, 1000);
  };

  fixI18nLinks();
  window.addEventListener('hashchange', fixI18nLinks);
  window.addEventListener('popstate', fixI18nLinks);
}
```

**Note**: This is a temporary workaround. The proper solution is to ensure entries exist for your single types.

## References

- [Strapi i18n Documentation](https://docs.strapi.io/developer-docs/latest/plugins/i18n.html)
- Related Strapi GitHub issues: #12345, #67890 (example references)
