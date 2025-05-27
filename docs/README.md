# Project Documentation

This folder contains important documentation and troubleshooting guides for the project.

## Available Guides

1. **[Strapi i18n Single Types](./strapi-i18n-single-types.md)** - Troubleshooting guide for i18n-enabled single types in Strapi (Navbar, Footer, etc.)
2. **[Adding New Locale](./adding-new-locale.md)** - Step-by-step guide to add a new language/locale to the project

## Quick Reference

### Common Issues

- **403 Error on Navbar/Footer**: See [Strapi i18n Single Types guide](./strapi-i18n-single-types.md)
- **CKEditor Plugin Error**: Plugin removed due to Vite compatibility issues
- **i18n Dropdown Bug**: All locales show as "not created" - see [Adding New Locale guide](./adding-new-locale.md#bug-i18n-trong-template)

### Project Structure

```
/apps
  /strapi    - Headless CMS
  /ui        - Next.js frontend
/docs        - Project documentation
/packages    - Shared packages
```

### Key Configurations

- **Strapi locales**: English (en), Czech (cs), Vietnamese (vi)
- **Database**: PostgreSQL
- **Admin URL**: http://localhost:1337/admin
- **UI URL**: http://localhost:3000
