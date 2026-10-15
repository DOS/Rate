# Frontend Development Guide

## 🏗️ Architecture Overview

### Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Runtime**: Node.js 22
- **Language**: TypeScript
- **Styling**: TailwindCSS 4 + Bootstrap 5 + SCSS
- **Icons**: Lucide React + React Icons (FA6)
- **State**: React Query + React Hooks
- **i18n**: next-intl (vi/en locales)
- **Backend**: Strapi CMS v5.23+

### Project Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/          # Internationalized routes
│   │   │   ├── components/    # Page-specific components
│   │   │   ├── page.tsx       # Homepage (ListingHub template)
│   │   │   └── layout.tsx     # Locale layout
│   │   ├── api/               # Next.js API routes (Strapi proxies)
│   │   └── layout.tsx         # Root layout
│   ├── components/            # Shared components
│   │   └── IconRegistry.tsx   # Lucide icon mapping
│   ├── lib/                   # Utilities & configs
│   └── types/                 # TypeScript definitions
└── public/                    # Static assets
```

## 🔌 Strapi Integration

### API Routes Pattern

All Strapi calls go through Next.js API routes for security:

```typescript
// apps/web/src/app/api/categories/route.ts
const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337"
const STRAPI_TOKEN = process.env.STRAPI_REST_READONLY_API_KEY

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const queryString = searchParams.toString()

  const response = await fetch(
    `${STRAPI_URL}/api/categories${queryString ? `?${queryString}` : ""}`,
    {
      headers: {
        ...(STRAPI_TOKEN && { Authorization: `Bearer ${STRAPI_TOKEN}` }),
      },
    }
  )
  return NextResponse.json(await response.json())
}
```

### Available API Endpoints

- `GET /api/categories` - Fetch categories with populate & filters
- `GET /api/asset/[...path]` - Proxy Strapi media files
- `GET /api/listings` - Fetch listings
- `GET /api/items` - Fetch items
- `GET /api/reviews` - Fetch reviews

### Data Fetching Patterns

#### Client Components (React Query)

```tsx
"use client"

import { useEffect, useState } from "react"

export default function CategoryTwo() {
  const [categories, setCategories] = useState([])
  const locale = useLocale()

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const query = `populate[Image]=true&filters[isActive][$eq]=true&locale=${locale}`
        const res = await fetch(`/api/categories?${query}`)
        const json = await res.json()
        setCategories(json.data || [])
      } catch (e) {
        console.error("Failed to load categories", e)
      }
    }
    fetchCategories()
  }, [locale])
}
```

#### Server Components

```tsx
async function fetchCategories(locale: string) {
  const query = `populate[Image]=true&filters[isActive][$eq]=true&locale=${locale}`
  const res = await fetch(
    `${process.env.APP_PUBLIC_URL}/api/categories?${query}`
  )
  return res.json()
}

export default async function CategoriesPage({
  params,
}: {
  params: { locale: string }
}) {
  const data = await fetchCategories(params.locale)
  return <div>{/* Render categories */}</div>
}
```

## 🎨 Component Development

### Icon System

Using IconRegistry for consistent icon management:

```tsx
import { IconRegistry } from "@/components/IconRegistry"

// In Strapi: IconKey = "Banknote" (Lucide icon name)

;<IconRegistry name={category.IconKey} size={24} />
```

**Supported Icon Sources:**

1. **Lucide React** (primary) - via IconKey field
2. **React Icons FA6** (fallback) - for specific icons
3. **Custom SVG paths** - for template-specific icons

### Styling Guidelines

#### TailwindCSS + Bootstrap Hybrid

```tsx
// Use cn() for class merging
import { cn } from "@/lib/styles"

;<div
  className={cn(
    "flex items-center", // Tailwind utilities
    "btn btn-primary", // Bootstrap components
    className // Dynamic classes
  )}
/>
```

#### Responsive Design

```tsx
// Bootstrap breakpoints in Swiper
breakpoints={{
  320: { slidesPerView: 1 },   // Mobile
  640: { slidesPerView: 3 },   // Tablet
  1024: { slidesPerView: 6 },  // Desktop
}}
```

### Component Structure

```tsx
"use client"

import React, { useEffect, useState } from "react"
import { useLocale } from "next-intl"

interface ComponentProps {
  // TypeScript interface
}

export default function ComponentName({ ...props }: ComponentProps) {
  // State & effects
  // Helper functions
  // Render JSX
}
```

## 🌍 Internationalization

### Locale Support

- **Primary**: `vi` (Vietnamese)
- **Secondary**: `en` (English)

### URL Structure

```
/vi/              # Vietnamese homepage
/en/              # English homepage
/vi/about-us      # Vietnamese about page
```

### Component Locale Handling

```tsx
import { useLocale } from "next-intl"

export default function LocalizedComponent() {
  const locale = useLocale()

  // Fetch data with locale
  const query = `locale=${encodeURIComponent(locale)}`
  // ...
}
```

## 🖼️ Media & Assets

### Image Handling

```tsx
// For Strapi media via proxy
const getImageUrl = (strapiUrl: string) => {
  if (!strapiUrl) return "/img/placeholder.png"
  const clean = strapiUrl.startsWith("/") ? strapiUrl.substring(1) : strapiUrl
  return `/api/asset/${clean}`
}

// Standard img tag (recommended for template compatibility)
;<img
  src={getImageUrl(category.Image?.data?.attributes?.url)}
  alt={category.Name}
/>
```

### Static Assets

```
public/
├── img/           # Template images
├── brand/         # Brand logos
├── team/          # Team photos
└── favicon.ico    # Site icon
```

## 🔧 Development Workflow

### Commands

```bash
# Start development
yarn dev:web

# Build for production
yarn build:web

# Type checking
yarn --cwd apps/web run typecheck

# Linting
yarn --cwd apps/web run lint
```

### Environment Variables

```env
# Required in .env.local
STRAPI_URL=http://localhost:1337
STRAPI_REST_READONLY_API_KEY=your_token_here
APP_PUBLIC_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret_here
```

### Port Management

- **Frontend**: http://localhost:3000
- **Strapi**: http://localhost:1337

Kill specific port when needed:

```powershell
netstat -ano | findstr :3000
taskkill /PID [PID] /F
```

## 🐛 Common Issues & Solutions

### Swiper Loop Warning

```
Warning: The number of slides is not enough for loop mode
```

**Solution**: Add more categories in Strapi or disable loop:

```tsx
<Swiper loop={categories.length >= 6} />
```

### Missing Placeholder Images

```
404: /img/placeholder.png
```

**Solution**: Add placeholder image to `public/img/`

### TypeScript Memory Issues

```
FATAL ERROR: JavaScript heap out of memory
```

**Solution**: Increase Node.js memory:

```powershell
setx NODE_OPTIONS "--max-old-space-size=6144"
```

### API Integration Issues

1. **Check token**: Ensure `STRAPI_REST_READONLY_API_KEY` is set
2. **Check Strapi**: Verify running at `http://localhost:1337`
3. **Check permissions**: Public role needs `find/findOne` for content types

## 📦 Component Library

### Category Components

- `CategoryTwo` - Horizontal slider with Strapi integration
- `CategoryOne` - Grid layout (template default)
- `CategoryThree/Four/Five` - Alternative layouts

### Listing Components

- `PopularListingOne` - Featured listings slider
- `PopularListingTwo` - Alternative layout

### Form Components

- `FormOne` - Search form with filters

### Layout Components

- `NavbarDark` - Main navigation
- `Footer` - Site footer
- `BackToTop` - Scroll to top button

## 🎯 Best Practices

### Performance

- Use `unoptimized: true` for images (Strapi handles optimization)
- Implement proper error boundaries
- Use React.memo for expensive components

### SEO

- Set proper meta titles/descriptions
- Use semantic HTML structure
- Implement structured data for listings

### Accessibility

- Use proper ARIA labels
- Ensure keyboard navigation
- Maintain color contrast ratios

### Code Quality

- Use TypeScript strict mode
- Follow ESLint rules
- Use Prettier for formatting
- Write meaningful component names

## 🚀 Deployment

### Build Process

```bash
yarn build:web
```

### Environment Setup

- Development: `.env.local`
- Production: Set environment variables in hosting platform

### Docker Support

```dockerfile
# apps/web/Dockerfile
FROM node:22-alpine
# ... build process
```

---

**Last Updated**: January 2025
**Maintainer**: JOY
**Project**: Rate-New Turborepo
