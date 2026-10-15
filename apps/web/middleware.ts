import createMiddleware from 'next-intl/middleware'
import { routing } from './src/lib/navigation'

// Serve default locale at "/" (localePrefix: 'as-needed') and handle i18n routes
export default createMiddleware(routing)

export const config = {
  matcher: [
    '/',
    // Exclude Next internals and assets
    '/((?!_next|.*\\..*|monitoring|api).*)',
  ],
}


