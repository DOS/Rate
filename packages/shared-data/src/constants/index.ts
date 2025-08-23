/**
 * Shared constants used across the application
 */

// Export route constants
export * from './routes';

// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/local',
    REGISTER: '/auth/local/register',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
    ME: '/users/me',
  },
  LISTINGS: {
    BASE: '/listings',
    BY_ID: (id: string) => `/listings/${id}`,
    SEARCH: '/listings/search',
    FEATURED: '/listings/featured',
  },
  REVIEWS: {
    BASE: '/reviews',
    BY_ID: (id: string) => `/reviews/${id}`,
    BY_LISTING: (listingId: string) => `/reviews?filters[listingId][$eq]=${listingId}`,
  },
  UPLOAD: '/upload',
} as const;

// Status codes
export const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Pagination defaults
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;

// File upload limits
export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const;

// Cache TTL (in seconds)
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_REVIEWS: true,
  ENABLE_RATINGS: true,
  ENABLE_UPLOAD: true,
  ENABLE_SEARCH: true,
  ENABLE_ADVANCED_FILTERS: true,
} as const;