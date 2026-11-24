import { collapseRun } from './locale-format';
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

/** The longest meta description a search result shows uncut (DOS/Rate#793). */
export const MAX_DESCRIPTION_LENGTH = 160;

/**
 * The first candidate that fits a search result, longest first. When none
 * does, the last one is cut at a word boundary with an ellipsis
 * (DOS/Rate#777).
 */
export function fitTitle(
  candidates: readonly string[],
  max: number = MAX_TITLE_LENGTH,
  locale?: string | null
): string {
  if (!Array.isArray(candidates)) return '';
  const rawMax = typeof max === 'number' ? max : NaN;
  const limit = Number.isFinite(rawMax)
    ? Math.max(1, Math.min(1000, Math.floor(rawMax)))
    : MAX_TITLE_LENGTH;
  const cleanedCandidates = candidates
    .slice(0, 50)
    .map((c) =>
      typeof c === 'string'
        ? c
            .slice(0, 2000)
            .replace(/\p{Cc}+/gu, ' ')
            .replace(/\s+/g, (run) => collapseRun(run, locale))
            .trim()
        : ''
    )
    .filter(Boolean);
  for (const candidate of cleanedCandidates) {
    if (candidate.length <= limit) return candidate;
  }
  const last = cleanedCandidates[cleanedCandidates.length - 1];
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
 * A meta description built from names that fits a search result: cut at a
 * word boundary with an ellipsis when long names push it past the limit
 * (DOS/Rate#793).
 */
export function fitDescription(text: string, locale?: string | null): string {
  return fitTitle([text], MAX_DESCRIPTION_LENGTH, locale);
}

/**
 * Structured data needs absolute URLs; Next only resolves metadata URLs
 * against metadataBase (DOS/Rate#738).
 */
export function absoluteUrl(pathOrUrl: string): string {
  if (typeof pathOrUrl !== 'string') return SITE_URL;
  const cleaned = pathOrUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 2048 || /\s/.test(cleaned)) return SITE_URL;
  if (
    cleaned.startsWith('//') ||
    cleaned.startsWith('/\\') ||
    cleaned.startsWith('\\')
  ) {
    return SITE_URL;
  }
  try {
    const isAbsolute = /^https?:\/\//i.test(cleaned);
    if (
      !isAbsolute &&
      (cleaned.includes('\\') || /(?:^|\/)\.\.(?:\/|$)/.test(cleaned))
    ) {
      return SITE_URL;
    }
    const parsed = isAbsolute ? new URL(cleaned) : new URL(cleaned, SITE_URL);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return SITE_URL;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.username ||
      parsed.password ||
      !host ||
      host.startsWith('.') ||
      host.startsWith('[') ||
      host.endsWith('.') ||
      host.includes('..') ||
      !host.includes('.') ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      /\.(?:local|internal|localhost)$/i.test(host) ||
      Boolean(parsed.port)
    ) {
      return SITE_URL;
    }
    if (!isAbsolute && parsed.origin !== SITE_URL) {
      return SITE_URL;
    }
    return isAbsolute ? cleaned : parsed.toString();
  } catch {
    return SITE_URL;
  }
}

/** Organization and WebSite JSON-LD for the home page (DOS/Rate#738). */
export function siteJsonLd(locale: string, description: string) {
  const safeLocale = locale === 'en' || locale === 'cs' ? locale : 'vi';
  const safeDescription =
    typeof description === 'string'
      ? description
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500)
      : '';
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
        description: safeDescription,
        inLanguage: safeLocale,
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

export const OG_TRUTH_CARD_WIDTH = 1200;
export const OG_TRUTH_CARD_HEIGHT = 630;
export const SOCIAL_TRUTH_CARD_WIDTH = 1080;
export const SOCIAL_TRUTH_CARD_HEIGHT = 1350;

export const OG_COMBO_SHIPPING_PRESETS = [
  0, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000, 100_000,
] as const;

export type OgComboShippingPreset = (typeof OG_COMBO_SHIPPING_PRESETS)[number];

export function isOgComboShippingPreset(
  value: unknown
): value is OgComboShippingPreset {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    (OG_COMBO_SHIPPING_PRESETS as readonly number[]).includes(value)
  );
}

export function isOgComboMinTrust(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 100 &&
    value % 5 === 0
  );
}

export function isOgComboMaxStores(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

export type OgTruthCardLocale = 'vi' | 'en' | 'cs';
export type OgTruthCardFormat = 'og' | 'social';

export type OgTruthCardTarget =
  | {
      readonly type: 'product';
      readonly slug: string;
      readonly variant?: string | null;
      readonly locale?: string | null;
      readonly format?: OgTruthCardFormat;
      readonly download?: boolean;
    }
  | {
      readonly type: 'versus';
      readonly versus: string;
      readonly locale?: string | null;
      readonly format?: OgTruthCardFormat;
      readonly download?: boolean;
    }
  | {
      readonly type: 'deals';
      readonly locale?: string | null;
      readonly format?: OgTruthCardFormat;
      readonly download?: boolean;
    }
  | {
      readonly type: 'combo';
      readonly items: readonly string[];
      readonly officialOnly?: boolean;
      readonly minTrust?: number;
      readonly maxStores?: number;
      readonly shippingVnd?: number;
      readonly locale?: string | null;
      readonly format?: OgTruthCardFormat;
      readonly download?: boolean;
    };

const OG_CATALOG_SLUG_REGEX = /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9._-]+$/;
const OG_VERSUS_SIDE_LEADING_RE = /^[a-zA-Z0-9]/;
const OG_VARIANT_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,40}$/;
const DISALLOWED_OG_SLUG_TOKENS = new Set([
  'null',
  'undefined',
  'nan',
  'na',
  'none',
  'infinity',
  '-infinity',
  'true',
  'false',
  '__proto__',
  'constructor',
  'prototype',
  ...Object.getOwnPropertyNames(Object.prototype).map((key) =>
    key.toLowerCase()
  ),
]);

export function normalizeOgLocale(locale: unknown): OgTruthCardLocale {
  const cleaned =
    typeof locale === 'string'
      ? locale
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  return cleaned === 'en' || cleaned === 'cs' ? cleaned : 'vi';
}

export function isValidOgSlug(slug: unknown, maxLength = 120): boolean {
  if (typeof slug !== 'string') return false;
  const safeMax =
    typeof maxLength === 'number' && Number.isFinite(maxLength) && maxLength > 0
      ? Math.min(240, Math.floor(maxLength))
      : 120;
  if (
    !slug ||
    slug.length > safeMax ||
    /[\s\p{Cc}\p{Cf}]/u.test(slug) ||
    slug in Object.prototype
  ) {
    return false;
  }
  const lower = slug.toLowerCase();
  return (
    OG_CATALOG_SLUG_REGEX.test(slug) &&
    (!slug.includes('.') || OG_VERSUS_SIDE_LEADING_RE.test(slug)) &&
    !slug.startsWith('.') &&
    !/^0+$/.test(slug) &&
    !slug.endsWith('.') &&
    !slug.includes('..') &&
    !DISALLOWED_OG_SLUG_TOKENS.has(lower)
  );
}

export function isValidOgVariantKey(variant: unknown): variant is string {
  return (
    typeof variant === 'string' &&
    OG_VARIANT_KEY_REGEX.test(variant) &&
    !(variant in Object.prototype) &&
    !DISALLOWED_OG_SLUG_TOKENS.has(variant)
  );
}

export function parseOgVersusPair(
  versus: unknown,
  maxSlugLength = 120,
  keepCase = false
): [string, string] | null {
  if (typeof versus !== 'string') return null;
  const trimmed = versus.replace(/\p{Cc}+/gu, '').trim();
  const safeMax =
    typeof maxSlugLength === 'number' &&
    Number.isFinite(maxSlugLength) &&
    maxSlugLength > 0
      ? Math.min(240, Math.floor(maxSlugLength))
      : 120;
  if (!trimmed || trimmed.length > safeMax * 2 + 4 || /\s/.test(trimmed)) {
    return null;
  }
  const parts = trimmed.split(/-vs-/i);
  if (parts.length !== 2) return null;
  const rawA = parts[0] ?? '';
  const rawB = parts[1] ?? '';
  const sideA = keepCase ? rawA : rawA.toLowerCase();
  const sideB = keepCase ? rawB : rawB.toLowerCase();
  if (
    !isValidOgSlug(sideA, safeMax) ||
    !isValidOgSlug(sideB, safeMax) ||
    !OG_VERSUS_SIDE_LEADING_RE.test(sideA) ||
    !OG_VERSUS_SIDE_LEADING_RE.test(sideB) ||
    sideA.toLowerCase() === sideB.toLowerCase()
  ) {
    return null;
  }
  return [sideA, sideB];
}

export function buildOgTruthCardPath(target: OgTruthCardTarget): string {
  if (!target || typeof target !== 'object') return SHARE_IMAGE.url;
  const locale = normalizeOgLocale(target.locale);
  const format: OgTruthCardFormat =
    target.format === 'social' ? 'social' : 'og';
  const params = new URLSearchParams();

  if (target.type === 'product') {
    const cleanSlug =
      typeof target.slug === 'string'
        ? target.slug.replace(/\p{Cc}+/gu, '').trim()
        : '';
    if (!isValidOgSlug(cleanSlug)) return SHARE_IMAGE.url;
    params.set('type', 'product');
    params.set('slug', cleanSlug);
    if (typeof target.variant === 'string' && target.variant.trim()) {
      const cleanVar = target.variant.trim().toLowerCase();
      if (!isValidOgVariantKey(cleanVar)) return SHARE_IMAGE.url;
      params.set('variant', cleanVar);
    }
  } else if (target.type === 'versus') {
    const pair = parseOgVersusPair(target.versus, 120, true);
    if (!pair) return SHARE_IMAGE.url;
    params.set('type', 'versus');
    params.set('versus', `${pair[0]}-vs-${pair[1]}`);
  } else if (target.type === 'deals') {
    params.set('type', 'deals');
  } else if (target.type === 'combo') {
    if (!Array.isArray(target.items)) return SHARE_IMAGE.url;
    const cleanItems: string[] = [];
    const seenLower = new Set<string>();
    for (const raw of target.items) {
      if (typeof raw !== 'string') return SHARE_IMAGE.url;
      const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
      if (!isValidOgSlug(cleaned, 120)) return SHARE_IMAGE.url;
      const lower = cleaned.toLowerCase();
      if (seenLower.has(lower)) return SHARE_IMAGE.url;
      seenLower.add(lower);
      cleanItems.push(cleaned);
    }
    if (cleanItems.length < 2 || cleanItems.length > 5) {
      return SHARE_IMAGE.url;
    }
    if (
      target.officialOnly !== undefined &&
      typeof target.officialOnly !== 'boolean'
    ) {
      return SHARE_IMAGE.url;
    }
    const officialOnly = Boolean(target.officialOnly);
    const minTrust = target.minTrust ?? 80;
    const maxStores = target.maxStores ?? 3;
    const shippingVnd = target.shippingVnd ?? 0;
    if (
      !isOgComboMinTrust(minTrust) ||
      !isOgComboMaxStores(maxStores) ||
      !isOgComboShippingPreset(shippingVnd)
    ) {
      return SHARE_IMAGE.url;
    }
    params.set('type', 'combo');
    params.set('items', cleanItems.join(','));
    params.set('officialOnly', officialOnly ? '1' : '0');
    params.set('minTrust', String(minTrust));
    params.set('maxStores', String(maxStores));
    params.set('shippingVnd', String(shippingVnd));
  } else {
    return SHARE_IMAGE.url;
  }

  params.set('locale', locale);
  if (format === 'social') {
    params.set('format', 'social');
  }
  if (target.download === true) {
    params.set('download', '1');
  }
  return `/api/v1/rate/og?${params.toString()}`;
}

export function buildOgTruthCardImage(
  target: OgTruthCardTarget & { readonly alt?: string | null }
) {
  const relPath = buildOgTruthCardPath(target);
  if (relPath === SHARE_IMAGE.url) {
    return SHARE_IMAGE;
  }
  const safeAlt =
    typeof target.alt === 'string'
      ? target.alt
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160) || 'Rate.vn'
      : 'Rate.vn';
  const isSocial = target.format === 'social';
  return {
    url: absoluteUrl(relPath),
    width: isSocial ? SOCIAL_TRUTH_CARD_WIDTH : OG_TRUTH_CARD_WIDTH,
    height: isSocial ? SOCIAL_TRUTH_CARD_HEIGHT : OG_TRUTH_CARD_HEIGHT,
    type: 'image/png' as const,
    alt: safeAlt,
  };
}

export function defaultTwitterCard(
  image:
    | {
        readonly url: string;
        readonly width?: number;
        readonly height?: number;
        readonly alt?: string;
      }
    | string = SHARE_IMAGE
) {
  return {
    card: 'summary_large_image' as const,
    site: '@rate_vn',
    images: [image],
  };
}

/**
 * Base Open Graph fields shared by every route. A page that sets its own
 * `openGraph` replaces the layout's object, so it spreads this first and adds
 * its title, description, url and (when it has one) its own image.
 * Title and description are left out on purpose: Next fills them from the
 * page's resolved title and description.
 */
export function defaultOpenGraph(locale: string) {
  const cleanLocale =
    typeof locale === 'string'
      ? locale
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  const resolvedOgLocale = Object.hasOwn(OG_LOCALES, cleanLocale)
    ? OG_LOCALES[cleanLocale]!
    : OG_LOCALES.vi;
  return {
    type: 'website' as const,
    siteName: 'Rate.vn',
    locale: resolvedOgLocale,
    images: [SHARE_IMAGE],
  };
}
