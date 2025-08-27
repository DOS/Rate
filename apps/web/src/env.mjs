// Temporary fallback to dist path to avoid missing package entry due to partial installs
// Lightweight env shim to avoid build failures while packages are being installed
const coerceRevalidate = (v) => {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? false : n
}

export const env = {
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL ?? "http://localhost:3000",
  STRAPI_URL: process.env.STRAPI_URL ?? "http://localhost:1337",
  STRAPI_REST_READONLY_API_KEY: process.env.STRAPI_REST_READONLY_API_KEY ?? "",
  STRAPI_REST_CUSTOM_API_KEY: process.env.STRAPI_REST_CUSTOM_API_KEY,
  NEXT_OUTPUT: process.env.NEXT_OUTPUT,
  WEBPACK_CACHE_TYPE: process.env.WEBPACK_CACHE_TYPE,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  STRAPI_PREVIEW_SECRET: process.env.STRAPI_PREVIEW_SECRET,
  SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING:
    process.env.SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_PREVENT_UNUSED_FUNCTIONS_ERROR_LOGS:
    process.env.NEXT_PUBLIC_PREVENT_UNUSED_FUNCTIONS_ERROR_LOGS,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
  NEXT_PUBLIC_REVALIDATE: coerceRevalidate(process.env.NEXT_PUBLIC_REVALIDATE),
  NODE_ENV: process.env.NODE_ENV,
  APP_ENV: process.env.APP_ENV,
}
