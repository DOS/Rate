import type {
  ExtractedPageProductSignal,
  SupportedEcommercePlatform,
} from './types.js';
import { t, type MessageKey } from './i18n.js';

export const DEFAULT_API_BASE_URL = 'https://rate.vn';

export const MAX_VALID_EXTENSION_VND_PRICE = 1_000_000_000;

const ALLOWED_EXTENSION_PLATFORMS: ReadonlySet<SupportedEcommercePlatform> =
  new Set<SupportedEcommercePlatform>([
    'shopee',
    'lazada',
    'tiki',
    'tiktok',
    'cellphones',
    'tgdd',
    'fptshop',
    'hoangha',
    'didongviet',
    'phongvu',
  ]);

export const ALLOWED_API_BASE_ORIGINS = [
  'https://rate.vn',
  'https://www.rate.vn',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;

export function normalizeAllowedApiBaseUrl(
  rawUrl: string | null | undefined
): string {
  if (typeof rawUrl !== 'string') return DEFAULT_API_BASE_URL;
  let trimmed = rawUrl.trim();
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  if (!trimmed || trimmed.length > 2048 || /[\s\p{Cc}]/u.test(trimmed)) {
    return DEFAULT_API_BASE_URL;
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname && parsed.pathname !== '/')
    ) {
      return DEFAULT_API_BASE_URL;
    }
    const origin = parsed.origin.toLowerCase();
    const isAllowed = (ALLOWED_API_BASE_ORIGINS as readonly string[]).includes(
      origin
    );
    if (!isAllowed) {
      return DEFAULT_API_BASE_URL;
    }
    return origin;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

export function isPrivilegedExtensionSender(
  sender: {
    id?: string;
    tab?: unknown;
    url?: string;
  },
  expectedRuntimeId?: string
): boolean {
  if (!sender || typeof sender !== 'object' || Array.isArray(sender)) {
    return false;
  }
  if (sender.tab != null) {
    return false;
  }
  const runtimeId =
    expectedRuntimeId ??
    (typeof globalThis !== 'undefined' &&
    typeof (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome
      ?.runtime?.id === 'string' &&
    (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome!.runtime!
      .id!.length > 0
      ? (globalThis as { chrome?: { runtime?: { id?: string } } }).chrome!
          .runtime!.id
      : undefined);

  if (
    runtimeId &&
    typeof sender.id === 'string' &&
    sender.id.length > 0 &&
    sender.id !== runtimeId
  ) {
    return false;
  }

  if (typeof sender.url === 'string' && sender.url.length > 0) {
    if (!sender.url.startsWith('chrome-extension://')) {
      return false;
    }
    if (
      runtimeId &&
      !sender.url.startsWith(`chrome-extension://${runtimeId}/`)
    ) {
      return false;
    }
    return true;
  }
  return true;
}

export function normalizeFiveStarRating(val: unknown): number | null {
  const num =
    typeof val === 'number'
      ? val
      : typeof val === 'string' && val.trim() !== ''
        ? Number(val.trim().replace(',', '.'))
        : NaN;
  if (!Number.isFinite(num) || num <= 0 || num > 100) {
    return null;
  }
  const scaled = num > 10 ? num / 20 : num > 5 ? num / 2 : num;
  if (scaled <= 0 || scaled > 5) return null;
  return Number(scaled.toFixed(2));
}

export interface SessionSignalEntry {
  signal?: ExtractedPageProductSignal;
  updatedAt?: number;
  source?: 'page' | 'quick_query';
}

export function selectFreshestSessionSignal<T extends SessionSignalEntry>(
  tabEntry: T | null | undefined,
  latestEntry: T | null | undefined
): ExtractedPageProductSignal | null {
  const tabSignal = tabEntry?.signal ?? null;
  const latestSignal = latestEntry?.signal ?? null;
  if (tabSignal && latestSignal) {
    if (latestEntry?.source === 'quick_query') {
      const tabTs =
        typeof tabEntry?.updatedAt === 'number' ? tabEntry.updatedAt : 0;
      const latestTs =
        typeof latestEntry?.updatedAt === 'number' ? latestEntry.updatedAt : 0;
      return latestTs > tabTs ? latestSignal : tabSignal;
    }
    return tabSignal;
  }
  return tabSignal ?? latestSignal ?? null;
}

const SAFE_EXTERNAL_ID_REGEX = /^[a-zA-Z0-9_.-]{1,120}$/;
const RESERVED_EXTERNAL_ID_REGEX =
  /^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i;

function sanitizeExternalIdentifier(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/\p{Cc}+/gu, '').trim();
  if (
    !cleaned ||
    !SAFE_EXTERNAL_ID_REGEX.test(cleaned) ||
    !/[a-zA-Z0-9]/.test(cleaned) ||
    cleaned.startsWith('.') ||
    cleaned.endsWith('.') ||
    cleaned.includes('..') ||
    RESERVED_EXTERNAL_ID_REGEX.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

function isValidHttpUrlHostname(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    Boolean(lower) &&
    !lower.startsWith('.') &&
    !lower.endsWith('.') &&
    !lower.includes('..')
  );
}

function sanitizeCanonicalSignalUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  const cleaned = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 2048 || /\s/.test(cleaned)) return '';
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    if (parsed.username || parsed.password) {
      return '';
    }
    if (!isValidHttpUrlHostname(parsed.hostname)) {
      return '';
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return '';
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '';
  }
}

export function sanitizeExtensionProductSignal(
  signal: ExtractedPageProductSignal
): ExtractedPageProductSignal {
  const safeSignal =
    signal && typeof signal === 'object'
      ? signal
      : ({} as Partial<ExtractedPageProductSignal>);

  const rawPlatform =
    typeof safeSignal.platform === 'string'
      ? (safeSignal.platform.trim().toLowerCase() as SupportedEcommercePlatform)
      : 'shopee';
  const validPlatform: SupportedEcommercePlatform =
    ALLOWED_EXTENSION_PLATFORMS.has(rawPlatform) ? rawPlatform : 'shopee';

  const validPrice =
    typeof safeSignal.price === 'number' &&
    Number.isFinite(safeSignal.price) &&
    safeSignal.price > 0 &&
    safeSignal.price <= MAX_VALID_EXTENSION_VND_PRICE
      ? Math.round(safeSignal.price)
      : null;

  const validOriginalPrice =
    typeof safeSignal.originalPrice === 'number' &&
    Number.isFinite(safeSignal.originalPrice) &&
    safeSignal.originalPrice > 0 &&
    safeSignal.originalPrice <= MAX_VALID_EXTENSION_VND_PRICE &&
    (validPrice === null || safeSignal.originalPrice >= validPrice)
      ? Math.round(safeSignal.originalPrice)
      : null;

  const validRatingStar =
    typeof safeSignal.ratingStar === 'number' &&
    Number.isFinite(safeSignal.ratingStar) &&
    safeSignal.ratingStar >= 0 &&
    safeSignal.ratingStar <= 5
      ? Number(safeSignal.ratingStar.toFixed(2))
      : null;

  const validRatingCount =
    typeof safeSignal.ratingCount === 'number' &&
    Number.isFinite(safeSignal.ratingCount) &&
    safeSignal.ratingCount >= 0 &&
    safeSignal.ratingCount <= 100_000_000
      ? Math.round(safeSignal.ratingCount)
      : null;

  const trimmedTitle =
    typeof safeSignal.title === 'string'
      ? safeSignal.title
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500)
      : '';
  const trimmedVariant =
    typeof safeSignal.selectedVariant === 'string'
      ? safeSignal.selectedVariant
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200) || null
      : null;

  return {
    ...safeSignal,
    platform: validPlatform,
    canonicalUrl: sanitizeCanonicalSignalUrl(safeSignal.canonicalUrl),
    externalItemId: sanitizeExternalIdentifier(safeSignal.externalItemId),
    externalShopId: sanitizeExternalIdentifier(safeSignal.externalShopId),
    title: trimmedTitle,
    selectedVariant: trimmedVariant,
    price: validPrice,
    originalPrice: validOriginalPrice,
    ratingStar: validRatingStar,
    ratingCount: validRatingCount,
  };
}

export function escapeSafeExternalHref(
  rawUrl: string | null | undefined,
  fallbackUrl = 'https://rate.vn'
): string {
  if (typeof rawUrl !== 'string') return fallbackUrl;
  const trimmed = rawUrl.replace(/\p{Cc}+/gu, '').trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed))
    return fallbackUrl;
  try {
    const parsed = new URL(trimmed, 'https://rate.vn');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallbackUrl;
    }
    if (parsed.username || parsed.password) {
      return fallbackUrl;
    }
    if (!isValidHttpUrlHostname(parsed.hostname)) {
      return fallbackUrl;
    }
    return parsed.href
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  } catch {
    return fallbackUrl;
  }
}

export function formatSafeExtensionVnd(
  val: number | null | undefined,
  fallbackText = t('notAvailable')
): string {
  if (
    typeof val !== 'number' ||
    !Number.isFinite(val) ||
    val <= 0 ||
    val > MAX_VALID_EXTENSION_VND_PRICE
  ) {
    return fallbackText;
  }
  return `${Math.round(val).toLocaleString('vi-VN')} ₫`;
}

export function resolveSafeApiRelativeUrl(
  apiBaseUrl: string | null | undefined,
  pathOrUrl: unknown,
  fallbackPath = '/'
): string {
  const safeBase = normalizeAllowedApiBaseUrl(apiBaseUrl);
  const safeFallbackPath =
    typeof fallbackPath === 'string' &&
    fallbackPath.startsWith('/') &&
    !fallbackPath.startsWith('//') &&
    !fallbackPath.startsWith('/\\')
      ? fallbackPath
      : '/';
  const fallbackHref = escapeSafeExternalHref(
    `${safeBase}${safeFallbackPath}`,
    safeBase
  );

  if (typeof pathOrUrl !== 'string') return fallbackHref;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return fallbackHref;

  try {
    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
        return fallbackHref;
      }
      const resolved = new URL(trimmed, safeBase);
      if (resolved.origin.toLowerCase() !== safeBase.toLowerCase()) {
        return fallbackHref;
      }
      return escapeSafeExternalHref(resolved.href, fallbackHref);
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const resolved = new URL(trimmed);
      if (resolved.origin.toLowerCase() !== safeBase.toLowerCase()) {
        return fallbackHref;
      }
      return escapeSafeExternalHref(resolved.href, fallbackHref);
    }

    return fallbackHref;
  } catch {
    return fallbackHref;
  }
}

export function formatSafeNumber(
  val: unknown,
  options: {
    min?: number;
    max?: number;
    decimals?: number;
    fallback?: number;
  } = {}
): string {
  const safeOpts = options && typeof options === 'object' ? options : {};
  const rawFallback =
    typeof safeOpts.fallback === 'number'
      ? safeOpts.fallback
      : typeof safeOpts.fallback === 'string' &&
          String(safeOpts.fallback).trim() !== ''
        ? Number(safeOpts.fallback)
        : 0;
  const fallback = Number.isFinite(rawFallback) ? rawFallback : 0;
  const num =
    typeof val === 'number'
      ? val
      : typeof val === 'string' && val.trim() !== ''
        ? Number(val)
        : NaN;
  const resolved = Number.isFinite(num) ? num : fallback;
  const min =
    typeof safeOpts.min === 'number' && Number.isFinite(safeOpts.min)
      ? safeOpts.min
      : -Infinity;
  const max =
    typeof safeOpts.max === 'number' && Number.isFinite(safeOpts.max)
      ? safeOpts.max
      : Infinity;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  const clamped = Math.min(high, Math.max(low, resolved));
  if (
    typeof safeOpts.decimals === 'number' &&
    Number.isFinite(safeOpts.decimals) &&
    safeOpts.decimals >= 0
  ) {
    return clamped.toFixed(Math.min(6, Math.floor(safeOpts.decimals)));
  }
  return String(Math.round(clamped));
}

const ALLOWED_VERDICT_CLASS_SUFFIXES = new Set([
  'genuine_deal',
  'fair_market_price',
  'above_market',
  'inflated_fake_sale',
  'insufficient_data',
  'accessory_skip',
  'normal_price',
  'suspicious_discount',
  'fake_discount',
  'fake_sale_trap',
  'fair_market',
  'ambiguous_variant',
  'skipped_accessory',
  'untracked',
]);

export function sanitizeVerdictClassSuffix(
  verdict: string | null | undefined
): string {
  if (typeof verdict !== 'string') return 'insufficient_data';
  const cleaned = verdict.trim().toLowerCase();
  return ALLOWED_VERDICT_CLASS_SUFFIXES.has(cleaned)
    ? cleaned
    : 'insufficient_data';
}

export const MAX_SPARKLINE_POINTS = 365;

export function filterValidSparklinePrices(
  points: ReadonlyArray<{ price: number }> | null | undefined
): number[] {
  if (!Array.isArray(points)) return [];
  const valid = points
    .filter(
      (p) =>
        Boolean(p && typeof p === 'object' && !Array.isArray(p)) &&
        typeof p.price !== 'boolean'
    )
    .map((p) => Number(p.price))
    .filter(
      (p) => Number.isFinite(p) && p > 0 && p <= MAX_VALID_EXTENSION_VND_PRICE
    );
  return valid.length > MAX_SPARKLINE_POINTS
    ? valid.slice(-MAX_SPARKLINE_POINTS)
    : valid;
}

export function shouldRenderTrustPill(
  lookup:
    | {
        isAccessoryOrPart?: boolean | null;
        matchStatus?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!lookup || typeof lookup !== 'object') return false;
  if (lookup.isAccessoryOrPart) return false;
  if (
    lookup.matchStatus === 'accessory_skip' ||
    lookup.matchStatus === 'not_found'
  ) {
    return false;
  }
  return (
    lookup.matchStatus === 'exact_listing' ||
    lookup.matchStatus === 'canonical_model' ||
    lookup.matchStatus === 'ambiguous_variant'
  );
}

/**
 * What the opt-in crowd signal sends, with the message key of the words the
 * side panel uses for each field. The opt-in text in every locale names
 * each one, so a field added here is disclosed too (DOS/Rate#1230, #1304).
 */
export const CROWD_INGEST_FIELD_LABELS = {
  platform: 'crowdFieldPlatform',
  externalItemId: 'crowdFieldExternalItemId',
  externalShopId: 'crowdFieldExternalShopId',
  url: 'crowdFieldUrl',
  title: 'crowdFieldTitle',
  selectedVariant: 'crowdFieldSelectedVariant',
  price: 'crowdFieldPrice',
  originalPrice: 'crowdFieldOriginalPrice',
  ratingStar: 'crowdFieldRatingStar',
  ratingCount: 'crowdFieldRatingCount',
} as const satisfies Record<string, MessageKey>;

export function buildCrowdIngestPayload(
  signal: ExtractedPageProductSignal
): Record<keyof typeof CROWD_INGEST_FIELD_LABELS, unknown> & {
  userConsentOptIn: true;
} {
  return {
    platform: signal.platform,
    externalItemId: signal.externalItemId,
    externalShopId: signal.externalShopId,
    url: signal.canonicalUrl,
    title: signal.title,
    selectedVariant: signal.selectedVariant,
    price: signal.price,
    originalPrice: signal.originalPrice,
    ratingStar: signal.ratingStar,
    ratingCount: signal.ratingCount,
    userConsentOptIn: true,
  };
}
