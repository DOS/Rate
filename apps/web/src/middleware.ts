import { NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import { isDevelopment } from './lib/general-helpers';
import { routing } from './lib/navigation';

const intlMiddleware = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const xForwardedProtoHeader = req.headers.get('x-forwarded-proto');
  const host = req.headers.get('host') || '';
  const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');

  if (
    !isDevelopment() &&
    !isLocalHost &&
    (xForwardedProtoHeader === null ||
      xForwardedProtoHeader.includes('https') === false)
  ) {
    return NextResponse.redirect(`https://${host}${req.nextUrl.pathname}`, 301);
  }

  // Strip any explicit /vi, /en, /cs URL prefix so URLs never contain a locale slug
  const pathname = req.nextUrl.pathname;
  const localePrefixMatch = pathname.match(/^\/(vi|en|cs)(\/.*)?$/);
  if (localePrefixMatch) {
    const matchedLocale = localePrefixMatch[1]!;
    const cleanPath = localePrefixMatch[2] || '/';
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
  if (!cookieLocale || !routing.locales.includes(cookieLocale as any)) {
    req.cookies.set('NEXT_LOCALE', routing.defaultLocale);
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: [
    '/',
    '/(cs|en|vi)/:path*',
    '/((?!_next|_vercel|api|monitoring|robots.txt|favicon.ico|sitemap|.*\\..*).*)',
  ],
};
