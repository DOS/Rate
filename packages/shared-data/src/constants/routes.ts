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
  TVS: '/tvs',
  AIR_CONDITIONERS: '/air-conditioners',
  REFRIGERATORS: '/refrigerators',
  WASHING_MACHINES: '/washing-machines',
  AIR_PURIFIERS: '/air-purifiers',
  BANK_SAVINGS: '/bank-savings',
  INTERNET_TELECOM: '/internet-telecom',
  SUPPLEMENTS: '/supplements',
  COSMETICS: '/cosmetics',
  MOTHER_BABY: '/mother-baby',
  RESTAURANTS: '/restaurants',
  CAFES: '/cafes',
  HOTELS: '/hotels',
  HOMESTAYS: '/homestays',
  DENTAL_CLINICS: '/dental-clinics',
  GYMS_FITNESS: '/gyms-fitness',
  SPAS_AESTHETICS: '/spas-aesthetics',
  ENGLISH_CENTERS: '/english-centers',
  CREDIT_CARDS: '/credit-cards',
  DEALS: '/deals',
  LEADERBOARD: '/leaderboard',
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

// Unpaired UTF-16 surrogates cause encodeURIComponent to throw URIError.
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function sliceUtf16Safe(value: string, maxLen: number): string {
  if (!Number.isFinite(maxLen) || maxLen <= 0) return '';
  const limit = Math.floor(maxLen);
  if (value.length <= limit) return value;
  const sliced = value.slice(0, limit);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  return lastCode >= 0xd800 && lastCode <= 0xdbff
    ? sliced.slice(0, -1)
    : sliced;
}

function sanitizePathSegment(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  const stripped = raw
    .replace(LONE_SURROGATE_RE, '')
    .replace(/\p{Cc}+/gu, '')
    .trim();
  const cleaned = sliceUtf16Safe(stripped, maxLen).trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return '';
  return cleaned;
}

export const RATE_API_V1_ENDPOINTS = {
  BASE: '/api/v1/rate',
  PRODUCTS: '/api/v1/rate/products',
  PRODUCT_DETAIL: (slug: string) =>
    `/api/v1/rate/products/${encodeURIComponent(sanitizePathSegment(slug, 180))}`,
  COMPARE: '/api/v1/rate/compare',
  VERSUS: '/api/v1/rate/versus',
  DEALS: '/api/v1/rate/deals',
  LEADERBOARD: '/api/v1/rate/leaderboard',
  MERCHANTS: '/api/v1/rate/merchants',
  MERCHANT_DETAIL: (id: string) =>
    `/api/v1/rate/merchants/${encodeURIComponent(sanitizePathSegment(id, 128))}`,
  LOOKUP: '/api/v1/rate/lookup',
  INSPECT: '/api/v1/rate/inspect',
  WATCHLIST: '/api/v1/rate/watchlist',
  STATS: '/api/v1/rate/stats',
  REVIEWS: '/api/v1/rate/reviews',
  OPENAPI: '/api/v1/rate/openapi',
  OPENAPI_JSON: '/api/v1/rate/openapi.json',
  REVALIDATE: '/api/v1/rate/revalidate',
  EXTENSION_LOOKUP: '/api/v1/rate/extension/lookup',
  EXTENSION_INGEST: '/api/v1/rate/extension/ingest',
  EXTENSION_SUBMITTER: '/api/v1/rate/extension/submitter',
  EXTENSION_OBSERVATION: '/api/v1/rate/extension/observation',
  REVIEW_VOTE: (reviewId: string) =>
    `/api/reviews/${encodeURIComponent(sanitizePathSegment(reviewId, 128))}/vote`,
  HEALTH: '/api/health',
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
