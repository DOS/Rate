import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import {
  CSP_HEADER,
  buildContentSecurityPolicy,
  createCspNonce,
} from './lib/csp';
import { isDevelopment } from './lib/general-helpers';
import { routing } from './lib/navigation';
import {
  createCookieSupabase,
  hasSupabaseAuthCookie,
} from './lib/supabase/cookies';

const intlMiddleware = createMiddleware(routing);

/**
 * Refreshes an expiring Supabase cookie session so Server Components and route
 * handlers see a valid one. Visitors without an auth cookie skip the network call.
 */
async function refreshSupabaseSession(
  req: NextRequest,
  response: NextResponse
): Promise<void> {
  if (!hasSupabaseAuthCookie(req.cookies.getAll())) return;
  const supabase = createCookieSupabase({
    getAll: () => req.cookies.getAll(),
    setAll: (cookies, headers) => {
      for (const { name, value, options } of cookies) {
        req.cookies.set(name, value);
        response.cookies.set(name, value, options);
      }
      // A response carrying a refreshed session must never be cached and
      // replayed to another visitor.
      for (const [header, value] of Object.entries(headers)) {
        response.headers.set(header, value);
      }
    },
  });
  if (!supabase) return;
  try {
    // getClaims() validates the JWT and refreshes it when it is about to expire.
    await supabase.auth.getClaims();
  } catch {
    // An unreachable auth server must not take the page down; routes re-check auth.
  }
}

/** HTTPS + locale routing (synchronous, so it is testable without a network). */
export function localeProxy(req: NextRequest): NextResponse {
  const xForwardedProtoHeader = req.headers.get('x-forwarded-proto');
  const host = req.headers.get('host') || '';
  const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');

  if (
    !isDevelopment() &&
    !isLocalHost &&
    (xForwardedProtoHeader === null ||
      xForwardedProtoHeader.includes('https') === false)
  ) {
    return NextResponse.redirect(
      `https://${host}${req.nextUrl.pathname}${req.nextUrl.search}`,
      301
    );
  }

  // Strip any explicit /vi, /en, /cs URL prefix so URLs never contain a locale slug
  const pathname = req.nextUrl.pathname;
  const localePrefixMatch = pathname.match(/^\/(vi|en|cs)(\/.*)?$/);
  if (localePrefixMatch) {
    const matchedLocale = localePrefixMatch[1]!;
    // One leading slash: "/en//host" must not become a protocol-relative Location.
    const cleanPath = `/${(localePrefixMatch[2] ?? '').replace(/^\/+/, '')}`;
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = cleanPath;
    const response = NextResponse.redirect(redirectUrl, 308);
    response.cookies.set('NEXT_LOCALE', matchedLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  }

  // Default to Vietnamese ('vi') when no valid NEXT_LOCALE cookie is present
  // so browser Accept-Language headers do not unexpectedly override default locale,
  // while still honoring explicit NEXT_LOCALE=vi|en|cs cookies via next-intl middleware.
  const cookieLocale = req.cookies.get('NEXT_LOCALE')?.value;
  if (
    !cookieLocale ||
    !(routing.locales as readonly string[]).includes(cookieLocale)
  ) {
    req.cookies.set('NEXT_LOCALE', routing.defaultLocale);
  }

  // A nonce per request: on the request so Next.js puts it on its scripts (it
  // reads the report-only header too), and on the response (DOS/Rate#1311).
  const csp = buildContentSecurityPolicy(createCspNonce(), {
    dev: isDevelopment(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  req.headers.set(CSP_HEADER, csp);
  // Next.js reads an enforcing policy before the report-only one, so one sent
  // by the client must not pick the nonce (DOS/Rate#1345).
  req.headers.delete('content-security-policy');
  const response = intlMiddleware(req);
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const response = localeProxy(req);
  // Redirects carry no page; refresh the session on the request that renders.
  if (response.status >= 300 && response.status < 400) return response;
  await refreshSupabaseSession(req, response);
  return response;
}

export const config = {
  matcher: [
    '/',
    '/(cs|en|vi)/:path*',
    '/((?!_next|_vercel|api|monitoring|sitemap|.*\\..*).*)',
  ],
};
