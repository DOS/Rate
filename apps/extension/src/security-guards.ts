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
