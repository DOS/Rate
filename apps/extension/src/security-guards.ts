import type { ExtractedPageProductSignal } from './types.js';

export const DEFAULT_API_BASE_URL = 'https://rate.vn';

export const MAX_VALID_EXTENSION_VND_PRICE = 1_000_000_000;

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
  if (!trimmed) return DEFAULT_API_BASE_URL;

  try {
    const parsed = new URL(trimmed);
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

export function sanitizeExtensionProductSignal(
  signal: ExtractedPageProductSignal
): ExtractedPageProductSignal {
  const validPrice =
    typeof signal.price === 'number' &&
    Number.isFinite(signal.price) &&
    signal.price > 0 &&
    signal.price <= MAX_VALID_EXTENSION_VND_PRICE
      ? Math.round(signal.price)
      : null;

  const validOriginalPrice =
    typeof signal.originalPrice === 'number' &&
    Number.isFinite(signal.originalPrice) &&
    signal.originalPrice > 0 &&
    signal.originalPrice <= MAX_VALID_EXTENSION_VND_PRICE &&
    (validPrice === null || signal.originalPrice >= validPrice)
      ? Math.round(signal.originalPrice)
      : null;

  const validRatingStar =
    typeof signal.ratingStar === 'number' &&
    Number.isFinite(signal.ratingStar) &&
    signal.ratingStar >= 0 &&
    signal.ratingStar <= 5
      ? Number(signal.ratingStar.toFixed(2))
      : null;

  const validRatingCount =
    typeof signal.ratingCount === 'number' &&
    Number.isFinite(signal.ratingCount) &&
    signal.ratingCount >= 0 &&
    signal.ratingCount <= 100_000_000
      ? Math.round(signal.ratingCount)
      : null;

  const trimmedTitle =
    typeof signal.title === 'string' ? signal.title.trim().slice(0, 500) : '';
  const trimmedVariant =
    typeof signal.selectedVariant === 'string' && signal.selectedVariant.trim()
      ? signal.selectedVariant.trim().slice(0, 200)
      : null;

  return {
    ...signal,
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
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallbackUrl;
  try {
    const parsed = new URL(trimmed, 'https://rate.vn');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
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
  fallbackText = 'Chưa có'
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
  const fallback = options.fallback ?? 0;
  const num =
    typeof val === 'number'
      ? val
      : typeof val === 'string' && val.trim() !== ''
        ? Number(val)
        : NaN;
  const resolved = Number.isFinite(num) ? num : fallback;
  const min = options.min ?? -Infinity;
  const max = options.max ?? Infinity;
  const clamped = Math.min(max, Math.max(min, resolved));
  if (typeof options.decimals === 'number' && options.decimals >= 0) {
    return clamped.toFixed(Math.min(6, Math.floor(options.decimals)));
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

export function filterValidSparklinePrices(
  points: ReadonlyArray<{ price: number }> | null | undefined
): number[] {
  if (!Array.isArray(points)) return [];
  return points
    .map((p) => Number(p?.price))
    .filter(
      (p) => Number.isFinite(p) && p > 0 && p <= MAX_VALID_EXTENSION_VND_PRICE
    );
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
