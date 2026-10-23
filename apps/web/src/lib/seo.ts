/** The default share card for rate.vn links (1200x630, see scripts/og-image/rate-og.html). */
export const SHARE_IMAGE = {
  url: '/img/rate-og.png',
  width: 1200,
  height: 630,
  alt: 'Rate.vn',
} as const;

export const SITE_URL = 'https://rate.vn';

/** The longest title a search result shows uncut (DOS/Rate#765). */
export const MAX_TITLE_LENGTH = 65;

/**
 * The first candidate that fits a search result, longest first. When none
 * does, the last one is cut at a word boundary with an ellipsis
 * (DOS/Rate#777).
 */
export function fitTitle(
  candidates: readonly string[],
  max: number = MAX_TITLE_LENGTH
): string {
  const limit = Math.max(1, Math.floor(max));
  for (const candidate of candidates) {
    if (candidate.length <= limit) return candidate;
  }
  const last = candidates[candidates.length - 1];
  if (!last) return '';
  // Whole code points, so an emoji is never split, within the same UTF-16
  // length the candidates are measured in.
  let cut = '';
  for (const ch of last) {
    if (cut.length + ch.length > limit - 1) break;
    cut += ch;
  }
  const space = cut.lastIndexOf(' ');
  const kept = (space > limit / 2 ? cut.slice(0, space) : cut)
    // No dangling joiner such as "vs" before the ellipsis.
    .replace(/\s+(vs|và|-|\+|\||:)$/u, '')
    .trimEnd();
  return `${kept}…`;
}

/**
 * Structured data needs absolute URLs; Next only resolves metadata URLs
 * against metadataBase (DOS/Rate#738).
 */
export function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : new URL(pathOrUrl, SITE_URL).toString();
}

/** Organization and WebSite JSON-LD for the home page (DOS/Rate#738). */
export function siteJsonLd(locale: string, description: string) {
  const organizationId = `${SITE_URL}/#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'Rate.vn',
        url: SITE_URL,
        logo: absoluteUrl('/icon.png'),
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: 'Rate.vn',
        url: SITE_URL,
        description,
        inLanguage: locale,
        publisher: { '@id': organizationId },
      },
    ],
  };
}

const OG_LOCALES: Record<string, string> = {
  vi: 'vi_VN',
  en: 'en_US',
  cs: 'cs_CZ',
};

/**
 * Base Open Graph fields shared by every route. A page that sets its own
 * `openGraph` replaces the layout's object, so it spreads this first and adds
 * its title, description, url and (when it has one) its own image.
 * Title and description are left out on purpose: Next fills them from the
 * page's resolved title and description.
 */
export function defaultOpenGraph(locale: string) {
  return {
    type: 'website' as const,
    siteName: 'Rate.vn',
    locale: OG_LOCALES[locale] ?? OG_LOCALES.vi,
    images: [SHARE_IMAGE],
  };
}
