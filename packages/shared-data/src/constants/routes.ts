/**
 * Route constants shared across the application
 */

export const ROOT_PAGE_PATH = '/' as const;

export const ROUTES = {
  HOME: ROOT_PAGE_PATH,
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  ADMIN: '/admin',
  API: {
    BASE: '/api',
    AUTH: '/api/auth',
    USERS: '/api/users',
    LISTINGS: '/api/listings',
    REVIEWS: '/api/reviews',
  },
} as const;

export const ADMIN_ROUTES = {
  DASHBOARD: '/admin',
  USERS: '/admin/users',
  CONTENT: '/admin/content-manager',
  SETTINGS: '/admin/settings',
  PLUGINS: '/admin/plugins',
} as const;