/**
 * Content Security Policy for the pages (DOS/Rate#1311). The proxy sends it as
 * `Content-Security-Policy-Report-Only` with a fresh nonce per request, and puts
 * the same header on the request so Next.js adds the nonce to its own scripts.
 * Enforce it (rename the header) only after a clean report window.
 *
 * - `script-src`: the nonce plus `'strict-dynamic'`, so a script the nonced
 *   Next.js runtime loads (chunks, `/_vercel/*` analytics if added) is allowed
 *   and no other inline or injected script is. JSON-LD blocks
 *   (`type="application/ld+json"`) are data, not scripts, and need nothing.
 * - Styles stay `'unsafe-inline'`: React `style` attributes and Next.js inline
 *   styles have no nonce.
 * - Images come from any HTTPS shop CDN (as `images.remotePatterns`).
 * - `connect-src` adds the Supabase project for the browser auth client.
 */
export const CSP_HEADER = 'Content-Security-Policy-Report-Only';
export const CSP_REPORT_PATH = '/api/csp-report';

/** A base64 nonce from 128 random bits. */
export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The origin of an http(s) URL, or null. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { origin, protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? origin : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(
  nonce: string,
  options: { dev?: boolean; supabaseUrl?: string } = {}
): string {
  const supabase = originOf(options.supabaseUrl);
  const connect = ["'self'"];
  if (supabase) {
    connect.push(supabase, supabase.replace(/^http/, 'ws'));
  }
  if (options.dev) connect.push('ws:');
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  // React Refresh evaluates code in development.
  if (options.dev) script.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ');
}
