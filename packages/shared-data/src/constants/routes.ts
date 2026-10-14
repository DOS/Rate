/**
 * Route constants shared across the Rate.vn Open-Core platform (Zero-Strapi 2026)
 */

export const ROOT_PAGE_PATH = '/' as const;

export const RATE_ROUTES = {
  HOME: ROOT_PAGE_PATH,
  SMARTPHONES: '/smartphones',
  LAPTOPS: '/laptops',
  TABLETS: '/tablets',
  SMARTWATCHES: '/smartwatches',
  EARBUDS: '/earbuds',
  MERCHANTS: '/merchants',
  COMPARE: '/compare',
  WATCHLIST: '/watchlist',
  INSPECT: '/inspect',
  DEVELOPERS: '/developers',
  ABOUT_US: '/about-us',
  FAQ: '/faq',
  PRIVACY_POLICY: '/privacy-policy',
  CONTACT_US: '/contact-us',
} as const;

export const RATE_API_V1_ENDPOINTS = {
  BASE: '/api/v1/rate',
  PRODUCTS: '/api/v1/rate/products',
  PRODUCT_DETAIL: (slug: string) => `/api/v1/rate/products/${encodeURIComponent(slug)}`,
  COMPARE: '/api/v1/rate/compare',
  MERCHANTS: '/api/v1/rate/merchants',
  MERCHANT_DETAIL: (id: string) => `/api/v1/rate/merchants/${encodeURIComponent(id)}`,
  LOOKUP: '/api/v1/rate/lookup',
  INSPECT: '/api/v1/rate/inspect',
  WATCHLIST: '/api/v1/rate/watchlist',
  STATS: '/api/v1/rate/stats',
  REVIEWS: '/api/v1/rate/reviews',
  EXTENSION_LOOKUP: '/api/v1/rate/extension/lookup',
  EXTENSION_INGEST: '/api/v1/rate/extension/ingest',
  REVIEW_VOTE: (reviewId: string) => `/api/reviews/${encodeURIComponent(reviewId)}/vote`,
} as const;

export const ROUTES = {
  HOME: ROOT_PAGE_PATH,
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  ADMIN: '/admin',
  RATE: RATE_ROUTES,
  API: {
    BASE: '/api',
    AUTH: '/api/auth',
    USERS: '/api/users',
    LISTINGS: '/api/v1/rate/products',
    REVIEWS: '/api/reviews',
    RATE_V1: RATE_API_V1_ENDPOINTS,
  },
} as const;

export const ADMIN_ROUTES = {
  DASHBOARD: '/admin',
  USERS: '/admin/users',
  CONTENT: '/admin/content-manager',
  SETTINGS: '/admin/settings',
  PLUGINS: '/admin/plugins',
} as const;