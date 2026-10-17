/** The default share card for rate.vn links (1200x630, see scripts/og-image/rate-og.html). */
export const SHARE_IMAGE = {
  url: '/img/rate-og.png',
  width: 1200,
  height: 630,
  alt: 'Rate.vn',
} as const;

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
