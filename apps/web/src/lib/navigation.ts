import { env } from '@/env.mjs';
import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['cs', 'en', 'vi'],

  // Used when no locale matches
  defaultLocale: 'vi',

  localePrefix: 'never',
  localeDetection: true,
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
  },
});

// https://next-intl-docs.vercel.app/docs/routing/navigation
export const {
  Link,
  redirect: _redirect,
  usePathname,
  useRouter,
} = createNavigation(routing);

// Help TypeScript detect unreachable code
// https://next-intl-docs.vercel.app/docs/routing/navigation#redirect
export const redirect: typeof _redirect = _redirect;

export const getAppPublicUrl = () => {
  // Determine the base URL: use APP_PUBLIC_URL on the server or window.location.origin on the client
  const baseUrl =
    typeof window === 'undefined' ? env.APP_PUBLIC_URL : window.location.origin;
  return baseUrl;
};

const MAX_HREF_LEN = 2_048;

function sanitizeHrefInput(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\p{Cc}+/gu, '').trim();
}

export const isAppLink = (link: string): boolean => {
  const cleaned = sanitizeHrefInput(link);
  if (
    !cleaned ||
    cleaned.length > MAX_HREF_LEN ||
    cleaned.startsWith('//') ||
    cleaned.startsWith('/\\') ||
    cleaned.startsWith('\\')
  ) {
    return false;
  }
  try {
    const baseUrl = getAppPublicUrl();
    if (!baseUrl) {
      throw new Error('Base URL is not defined.');
    }

    const base = new URL(baseUrl);
    const url = new URL(cleaned, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    if (url.username || url.password) {
      return false;
    }
    return url.origin === base.origin;
  } catch {
    return false;
  }
};

export const formatHref = (href: string | undefined | null): string => {
  const cleaned = sanitizeHrefInput(href);
  if (!cleaned || cleaned === '#' || cleaned.length > MAX_HREF_LEN) {
    // Empty or over-length path -> return hash to prevent unwanted issues
    return '#';
  }

  if (
    cleaned.startsWith('//') ||
    cleaned.startsWith('/\\') ||
    cleaned.startsWith('\\')
  ) {
    return '#';
  }

  if (cleaned.startsWith('#')) {
    return cleaned;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(cleaned)) {
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        if (parsed.username || parsed.password || !parsed.hostname) {
          return '#';
        }
        return cleaned;
      }
      if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
        return /\s/.test(cleaned) ? '#' : cleaned;
      }
      return '#';
    } catch {
      return '#';
    }
  }

  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
};
