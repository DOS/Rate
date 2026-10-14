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

  return intlMiddleware(req);
}

export const config = {
  matcher: [
    '/',
    '/(cs|en|vi)/:path*',
    '/((?!_next|_vercel|api|robots.txt|favicon.ico|sitemap|.*\\..*).*)',
  ],
};
