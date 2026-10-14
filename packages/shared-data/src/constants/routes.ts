/**
 * Route constants shared across the Rate.vn Open-Core platform (Zero-Strapi 2026)
 */

export const ROOT_PAGE_PATH = '/' as const;

export const RATE_ROUTES = {
  HOME: ROOT_PAGE_PATH,
  SMARTPHONES: '/smartphones',
  LAPTOPS: '/laptops',
  TABLETS: '/tablets',
  MERCHANTS: '/merchants',
  COMPARE: '/compare',
  WATCHLIST: '/watchlist',
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
  MERCHANTS: '/api/v1/rate/merchants',
  MERCHANT_DETAIL: (id: string) => `/api/v1/rate/merchants/${encodeURIComponent(id)}`,
  INSPECT_URL: '/api/v1/rate/inspect',
  EXTENSION_LOOKUP: '/api/v1/rate/extension/lookup',
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