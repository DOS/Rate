// Rate Platform Environment Configuration (Zero-Strapi 2026 Architecture)
const coerceRevalidate = (v) => {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isNaN(n) ? false : n
}

export const env = {
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL ?? "https://rate.vn",
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    "",
  NEXT_OUTPUT: process.env.NEXT_OUTPUT,
  WEBPACK_CACHE_TYPE: process.env.WEBPACK_CACHE_TYPE,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
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
