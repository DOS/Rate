import {
  parseExtensionObservationV1,
  type ExtensionObservationV1,
} from '@repo/shared-data/rules';
import type {
  ExtractedPageProductSignal,
  SupportedEcommercePlatform,
} from './types.js';
import { t, type MessageKey } from './i18n.js';
import {
  encodeSurrogateSafeUriComponent,
  sliceCodePoints,
  stripLoneSurrogates,
} from './surrogate-safe.js';

export {
  encodeSurrogateSafeUriComponent,
  sliceCodePoints,
  stripLoneSurrogates,
};

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
    'dienmayxanh',
    'topzone',
    'fptshop',
    'hoangha',
    'didongviet',
    'phongvu',
    'gearvn',
    'nguyenkim',
    'shopdunk',
    'hacom',
    'clickbuy',
    'viettelstore',
    'pico',
    'mediamart',
    'memoryzone',
    'anphatpc',
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

/** The consent page opened once at install (DOS/Rate#1603). */
export const ONBOARDING_PAGE_PATH = 'onboarding/onboarding.html';

/**
 * The install consent page, an extension page in a tab: exactly its URL in
 * this extension, never a content script (whose url is the web page). It may
 * only set the opt-in (DOS/Rate#1603).
 */
export function isOnboardingSender(
  sender: { id?: string; tab?: unknown; url?: string } | null | undefined,
  expectedRuntimeId?: string
): boolean {
  if (!sender || typeof sender !== 'object' || Array.isArray(sender)) {
    return false;
  }
  const runtimeId =
    expectedRuntimeId ??
    (typeof chrome !== 'undefined' ? chrome.runtime?.id : undefined);
  if (!runtimeId) return false;
  if (typeof sender.id === 'string' && sender.id !== runtimeId) return false;
  return (
    sender.url === `chrome-extension://${runtimeId}/${ONBOARDING_PAGE_PATH}`
  );
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

  if (sender.tab != null) {
    return false;
  }

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

function parseDecimalNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return NaN;
  const cleaned = val.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
    return NaN;
  }
  return Number(cleaned.replace(',', '.'));
}

export function roundHalfUpDecimal(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const d = Math.max(0, Math.min(6, Math.floor(decimals)));
  if (d === 0) {
    return (value < 0 ? -Math.round(-value) : Math.round(value)) || 0;
  }
  const sign = value < 0 ? -1 : 1;
  const [coef, exp = '0'] = Math.abs(value).toExponential().split('e');
  const shifted = Number(`${coef}e${Number(exp) + d}`);
  if (!Number.isFinite(shifted) || shifted >= 1e15) return value;
  const rounded = Math.round(shifted);
  return rounded === 0 ? 0 : sign * Number(`${rounded}e-${d}`);
}

export function normalizeFiveStarRating(val: unknown): number | null {
  const num = parseDecimalNumber(val);
  if (!Number.isFinite(num) || num <= 0 || num > 100) {
    return null;
  }
  const scaled = num > 10 ? num / 20 : num > 5 ? num / 2 : num;
  if (scaled <= 0 || scaled > 5) return null;
  const rounded = roundHalfUpDecimal(scaled, 3);
  return rounded > 0 ? rounded : null;
}

export interface ExtensionMasterRatingSource {
  rating_score_5?: unknown;
  rating_score?: unknown;
  user_rating_weighted?: unknown;
  average_rating?: unknown;
}

function parseStrictFiveStarScore(val: unknown): number | null {
  const num = parseDecimalNumber(val);
  if (!Number.isFinite(num) || num <= 0 || num > 5) return null;
  const rounded = roundHalfUpDecimal(num, 1);
  return rounded > 0 ? rounded : null;
}

/**
 * Resolves the 0-5 product rating in site priority order
 * (`rating_score_5 ?? rating_score ?? user_rating_weighted ?? average_rating`)
 * rounded once half-up to 1 decimal (DOS/Rate#1656).
 */
export function resolveExtensionMasterRating(
  master: ExtensionMasterRatingSource | null | undefined
): number | null {
  if (!master || typeof master !== 'object' || Array.isArray(master)) {
    return null;
  }
  const storedScore5 = parseStrictFiveStarScore(master.rating_score_5);
  if (storedScore5 !== null) return storedScore5;
  const storedScore = parseStrictFiveStarScore(master.rating_score);
  if (storedScore !== null) return storedScore;
  const weighted = normalizeFiveStarRating(master.user_rating_weighted);
  if (weighted !== null) {
    const rounded = roundHalfUpDecimal(weighted, 1);
    if (rounded > 0) return rounded;
  }
  const average = normalizeFiveStarRating(master.average_rating);
  if (average !== null) {
    const rounded = roundHalfUpDecimal(average, 1);
    if (rounded > 0) return rounded;
  }
  return null;
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

const SAFE_EXTERNAL_ID_CHARS_REGEX = /^[a-zA-Z0-9_.-]+$/;
const RESERVED_EXTERNAL_ID_REGEX =
  /^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i;

function sanitizeExternalIdentifier(val: unknown, maxLen = 120): string | null {
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/\p{Cc}+/gu, '').trim();
  if (
    !cleaned ||
    cleaned.length > maxLen ||
    !SAFE_EXTERNAL_ID_CHARS_REGEX.test(cleaned) ||
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
      ? sliceCodePoints(
          stripLoneSurrogates(safeSignal.title)
            .replace(/\p{Cc}+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
          500
        )
      : '';
  const trimmedVariant =
    typeof safeSignal.selectedVariant === 'string'
      ? sliceCodePoints(
          stripLoneSurrogates(safeSignal.selectedVariant)
            .replace(/\p{Cc}+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim(),
          200
        ) || null
      : null;

  return {
    ...safeSignal,
    platform: validPlatform,
    canonicalUrl: sanitizeCanonicalSignalUrl(safeSignal.canonicalUrl),
    externalItemId: sanitizeExternalIdentifier(
      safeSignal.externalItemId,
      validPlatform === 'anphatpc' ? 128 : 120
    ),
    externalShopId: sanitizeExternalIdentifier(safeSignal.externalShopId),
    title: trimmedTitle,
    selectedVariant: trimmedVariant,
    price: validPrice,
    originalPrice: validOriginalPrice,
    ratingStar: validRatingStar,
    ratingCount: validRatingCount,
    // The v1 observation fields (DOS/Rate#1606), checked like the rest.
    skuId: (() => {
      const sku = sanitizeExternalIdentifier(safeSignal.skuId);
      return sku && sku.length <= 64 ? sku : null;
    })(),
    stockState: (
      ['in_stock', 'low_stock', 'out_of_stock', 'unknown'] as const
    ).includes(safeSignal.stockState as never)
      ? safeSignal.stockState
      : 'unknown',
    // A quantity only with a known state (DOS/Rate#1606).
    stockQty:
      ['in_stock', 'low_stock', 'out_of_stock'].includes(
        safeSignal.stockState as string
      ) &&
      typeof safeSignal.stockQty === 'number' &&
      Number.isInteger(safeSignal.stockQty) &&
      safeSignal.stockQty >= 0 &&
      safeSignal.stockQty <= 1_000_000
        ? safeSignal.stockQty
        : null,
    extractorSource: (['json_ld', 'dom', 'mixed'] as const).includes(
      safeSignal.extractorSource as never
    )
      ? safeSignal.extractorSource
      : 'dom',
  };
}

/**
 * Deduplication key for SPA content-script observations (DOS/Rate#1664).
 * Includes normalized `originalPrice` and `title` so strikethrough-price or
 * product-title hydration triggers a fresh lookup instead of suppressing
 * `inflated_fake_sale` verdicts.
 */
export function buildProductSignalSignature(
  rawSignal: ExtractedPageProductSignal
): string {
  const signal = sanitizeExtensionProductSignal(rawSignal);
  const originalPrice =
    signal.originalPrice !== null &&
    (signal.price === null || signal.originalPrice > signal.price)
      ? String(signal.originalPrice)
      : '';
  return JSON.stringify([
    signal.canonicalUrl,
    signal.selectedVariant ?? '',
    signal.price ?? '',
    originalPrice,
    signal.title,
  ]);
}

/**
 * The query of the product lookup: exactly the fields the disclosures name
 * (store, cleaned URL, title, item and shop ids, variant, price, original
 * price) and the mode. A test pins its output (DOS/Rate#1606).
 */
export function buildLookupParams(
  rawSignal: ExtractedPageProductSignal,
  mode: 'pill' | 'full'
): URLSearchParams {
  const signal = sanitizeExtensionProductSignal(rawSignal);
  const params = new URLSearchParams();
  params.set('platform', signal.platform);
  params.set('url', signal.canonicalUrl);
  params.set('title', signal.title);
  params.set('mode', mode);
  if (signal.externalItemId) params.set('externalId', signal.externalItemId);
  if (signal.externalShopId) params.set('shopId', signal.externalShopId);
  if (signal.selectedVariant) {
    params.set('selectedVariant', signal.selectedVariant);
  }
  if (signal.price && signal.price > 0) {
    params.set('price', String(signal.price));
  }
  if (signal.originalPrice && signal.originalPrice > 0) {
    params.set('originalPrice', String(signal.originalPrice));
  }
  return params;
}

/**
 * The ExtensionObservation v1 an opted-in install sends for `signal`
 * (DOS/Rate#1606), or null when the page lacks what v1 needs (an item id, a
 * price).
 */
export function buildExtensionObservationV1(
  rawSignal: ExtractedPageProductSignal,
  observedAt: Date,
  extensionVersion: string
): ExtensionObservationV1 | null {
  const signal = sanitizeExtensionProductSignal(rawSignal);
  const parsed = parseExtensionObservationV1(
    {
      schema_version: 1,
      marketplace: signal.platform,
      listing_url: signal.canonicalUrl,
      external_item_id: signal.externalItemId,
      external_shop_id: signal.externalShopId,
      sku_id: signal.skuId ?? null,
      // v1 allows 120 characters; a longer label is cut, not a reason to
      // drop the observation.
      variant_label: signal.selectedVariant
        ? sliceCodePoints(signal.selectedVariant, 120).trim() || null
        : null,
      price_vnd: signal.price,
      list_price_vnd: signal.originalPrice,
      stock_state: signal.stockState ?? 'unknown',
      stock_qty: signal.stockQty ?? null,
      observed_at: observedAt.toISOString(),
      extractor: {
        source: signal.extractorSource ?? 'dom',
        extension_version: extensionVersion,
      },
    },
    observedAt.getTime()
  );
  return parsed.ok ? parsed.value : null;
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

const CZECH_NBSP = '\u00A0';

function isCzechExtensionLocale(locale: unknown): boolean {
  if (typeof locale !== 'string') return false;
  const primary = locale.trim().slice(0, 32).toLowerCase().split(/[-_]/)[0];
  return primary === 'cs';
}

function groupCzechIntegerString(intStr: string): string {
  if (!/^-?\d+$/.test(intStr)) return intStr;
  const negative = intStr.startsWith('-');
  const digits = negative ? intStr.slice(1) : intStr;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, CZECH_NBSP);
  return negative ? `-${grouped}` : grouped;
}

function formatCzechDecimalString(fixedAscii: string): string {
  if (!/^-?\d+(?:\.\d+)?$/.test(fixedAscii)) return fixedAscii;
  const [intPart = '0', fracPart] = fixedAscii.split('.');
  const groupedInt = groupCzechIntegerString(intPart);
  return fracPart !== undefined ? `${groupedInt},${fracPart}` : groupedInt;
}

export function formatSafeExtensionVnd(
  val: number | null | undefined,
  fallbackText = t('notAvailable'),
  locale?: string
): string {
  if (
    typeof val !== 'number' ||
    !Number.isFinite(val) ||
    val <= 0 ||
    val > MAX_VALID_EXTENSION_VND_PRICE
  ) {
    return fallbackText;
  }
  const rounded = Math.round(val);
  if (rounded <= 0) {
    return fallbackText;
  }
  if (isCzechExtensionLocale(locale)) {
    return `${groupCzechIntegerString(String(rounded))}${CZECH_NBSP}₫`;
  }
  return `${rounded.toLocaleString('vi-VN')} ₫`;
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
    locale?: string;
  } = {},
  locale?: string
): string {
  const safeOpts = options && typeof options === 'object' ? options : {};
  const effectiveLocale = locale ?? safeOpts.locale;
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
    const decimals = Math.min(6, Math.floor(safeOpts.decimals));
    const fixed = roundHalfUpDecimal(clamped, decimals).toFixed(decimals);
    return isCzechExtensionLocale(effectiveLocale)
      ? formatCzechDecimalString(fixed)
      : fixed;
  }
  const roundedInt = String(roundHalfUpDecimal(clamped, 0));
  return isCzechExtensionLocale(effectiveLocale)
    ? formatCzechDecimalString(roundedInt)
    : roundedInt;
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
 * What an opted-in install sends (ExtensionObservation v1, DOS/Rate#1606),
 * with the message key of the words the opt-in texts use for each field;
 * every locale's opt-in and consent texts name each one, plus the submitter
 * id and the network hash the server adds.
 */
export const OBSERVATION_FIELD_LABELS = {
  marketplace: 'crowdFieldPlatform',
  listing_url: 'crowdFieldUrl',
  external_item_id: 'crowdFieldExternalItemId',
  external_shop_id: 'crowdFieldExternalShopId',
  sku_id: 'observationFieldSku',
  variant_label: 'crowdFieldSelectedVariant',
  price_vnd: 'crowdFieldPrice',
  list_price_vnd: 'crowdFieldOriginalPrice',
  stock_state: 'observationFieldStock',
  stock_qty: 'observationFieldStock',
  observed_at: 'observationFieldObservedAt',
  extractor: 'observationFieldExtractor',
} as const satisfies Record<
  Exclude<keyof ExtensionObservationV1, 'schema_version'>,
  MessageKey
>;

/** What else an observation carries: the submitter id and the network hash. */
export const OBSERVATION_EXTRA_LABELS = [
  'observationFieldSubmitter',
  'observationFieldNetwork',
] as const satisfies readonly MessageKey[];

/**
 * The legacy opt-in crowd signal (still accepted by the ingest route for the
 * contact form); the extension now sends v1. What it sends, with the message key of the words the
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
