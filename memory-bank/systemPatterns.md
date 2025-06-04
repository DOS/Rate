# System Patterns

## Code Organization
- Follows monorepo structure with `apps/` for applications
- Strapi plugins and customizations in `apps/strapi/src/`
- Shared components in `packages/`

## Naming Conventions
- Components: PascalCase (e.g., `Navbar.tsx`)
- Files and directories: kebab-case (e.g., `nav-item.tsx`)
- Environment variables: UPPER_SNAKE_CASE

## Internationalization (i18n)
- Primary languages: English (en) and Vietnamese (vi)
- Strapi i18n plugin for content management
- Frontend uses next-intl for translations

## API Conventions
- RESTful endpoints
- JSON:API specification for Strapi responses
- Error handling with consistent response format

## State Management
- React Context API for global state
- Server state management with React Query
- Local component state for UI-specific state

## Styling
- Tailwind CSS for utility-first styling
- CSS Modules for component-scoped styles
- Dark/light theme support via theme provider
