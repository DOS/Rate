'use client';

import {
  MAX_VALID_VND_PRICE,
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  resolveProductImageUrl,
} from '@/lib/rate-domain';

export interface WatchlistItem {
  slug: string;
  name: string;
  brand: string;
  categoryPath: string;
  thumbnail: string | null;
  priceWhenAdded: number;
  targetPrice: number;
  addedAt: string;
}

const STORAGE_KEY = 'rate_price_watchlist_v1';
const EVENT_NAME = 'rate:watchlist:change';
export const MAX_WATCHLIST_ITEMS = 50;
export const MIN_WATCHLIST_TARGET_PRICE = 10_000;

function sanitizeWatchlistPrice(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

/**
 * Computes a clean rounded target price for a given discount percentage (`discountPct`),
 * using 10,000 VND steps below 2M VND and 100,000 VND steps at or above 2M VND,
 * and guaranteeing that the target price is strictly below `basePrice` when `basePrice > step`.
 */
export function computeWatchlistTargetPrice(
  basePrice: unknown,
  discountPct = 5
): number {
  const safeBase = sanitizeWatchlistPrice(basePrice);
  if (safeBase <= 0) return 10_000_000;
  const rawPct = Number(discountPct);
  const safePct = Number.isFinite(rawPct)
    ? Math.max(1, Math.min(90, rawPct))
    : 5;
  const step = safeBase < 2_000_000 ? 10_000 : 100_000;
  const rawDiscounted = safeBase * (1 - safePct / 100);
  let rounded = Math.round(rawDiscounted / step) * step;
  if (safeBase > step && rounded >= safeBase) {
    rounded = safeBase - step;
  }
  return Math.max(
    MIN_WATCHLIST_TARGET_PRICE,
    Math.min(MAX_VALID_VND_PRICE, rounded)
  );
}

/**
 * Sanitizes a user-supplied custom target price into `[MIN_WATCHLIST_TARGET_PRICE, MAX_VALID_VND_PRICE]`,
 * falling back to `computeWatchlistTargetPrice(fallbackBasePrice, 5)` when non-positive or NaN.
 */
export function sanitizeWatchlistTargetPrice(
  customTarget: unknown,
  fallbackBasePrice?: unknown
): number {
  const num = Number(customTarget);
  if (!Number.isFinite(num) || num <= 0) {
    return computeWatchlistTargetPrice(fallbackBasePrice, 5);
  }
  return Math.max(
    MIN_WATCHLIST_TARGET_PRICE,
    Math.min(MAX_VALID_VND_PRICE, Math.round(num))
  );
}

const WATCHLIST_CONTROL_CHAR_RE = /\p{Cc}+/gu;

function sanitizeWatchlistText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(WATCHLIST_CONTROL_CHAR_RE, '').trim().slice(0, maxLen);
}

export function resolveWatchlistItemCurrentPrices(
  item: Pick<WatchlistItem, 'priceWhenAdded'>,
  liveDeal?: {
    readonly current_min_price?: unknown;
    readonly current_max_price?: unknown;
  } | null,
  liveProd?: {
    readonly min_price?: unknown;
    readonly max_price?: unknown;
  } | null
): { currentMin: number; currentMax: number } {
  const dealMin = sanitizeWatchlistPrice(liveDeal?.current_min_price);
  const prodMin = sanitizeWatchlistPrice(liveProd?.min_price);
  const fallbackMin = sanitizeWatchlistPrice(item.priceWhenAdded);
  const currentMin =
    dealMin > 0 ? dealMin : prodMin > 0 ? prodMin : fallbackMin;

  const dealMax = sanitizeWatchlistPrice(liveDeal?.current_max_price);
  const prodMax = sanitizeWatchlistPrice(liveProd?.max_price);
  const rawMax = dealMax > 0 ? dealMax : prodMax > 0 ? prodMax : currentMin;
  const currentMax = Math.max(currentMin, rawMax);

  return { currentMin, currentMax };
}

export function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  const cleanSlug = sanitizeWatchlistText(item.slug, 256);
  const cleanName = sanitizeWatchlistText(item.name, 300);
  const cleanBrand = sanitizeWatchlistText(item.brand, 128);
  const pathMatch =
    typeof item.categoryPath === 'string'
      ? /^\/(smartphones|tablets|laptops|smartwatches|earbuds)(?:\/|$)/.exec(
          item.categoryPath.trim()
        )
      : null;
  const catSlug = getMasterProductCategorySlug({
    slug: cleanSlug,
    name: cleanName,
    metadata: pathMatch ? { category_slug: pathMatch[1] } : undefined,
  });
  const priceWhenAdded = sanitizeWatchlistPrice(item.priceWhenAdded);
  const targetPrice = sanitizeWatchlistPrice(item.targetPrice);
  const parsedAddedAt =
    typeof item.addedAt === 'string' ? Date.parse(item.addedAt) : Number.NaN;
  const safeAddedAt = Number.isFinite(parsedAddedAt)
    ? new Date(parsedAddedAt).toISOString()
    : new Date().toISOString();
  return {
    ...item,
    slug: cleanSlug,
    name: cleanName,
    brand: cleanBrand,
    categoryPath: getCategoryRouteHref(catSlug),
    thumbnail: resolveProductImageUrl(cleanSlug, item.thumbnail),
    priceWhenAdded,
    targetPrice,
    addedAt: safeAddedAt,
  };
}

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const deduped: WatchlistItem[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (
        !item ||
        typeof item.slug !== 'string' ||
        !item.slug.trim() ||
        typeof item.name !== 'string' ||
        !item.name.trim()
      ) {
        continue;
      }
      const normalized = normalizeWatchlistItem(item as WatchlistItem);
      if (!normalized.slug || !normalized.name || seen.has(normalized.slug)) {
        continue;
      }
      seen.add(normalized.slug);
      deduped.push(normalized);
      if (deduped.length >= MAX_WATCHLIST_ITEMS) break;
    }
    return deduped;
  } catch {
    return [];
  }
}

function saveWatchlist(items: WatchlistItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_WATCHLIST_ITEMS))
    );
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Ignore private mode storage quota errors
  }
}

export function upsertWatchlistItem(item: WatchlistItem): WatchlistItem[] {
  const normalized = normalizeWatchlistItem(item);
  const current = getWatchlist();
  if (!normalized.slug || !normalized.name) return current;
  const idx = current.findIndex((x) => x.slug === normalized.slug);
  const next = (
    idx >= 0
      ? current.map((x, i) => (i === idx ? normalized : x))
      : [normalized, ...current]
  ).slice(0, MAX_WATCHLIST_ITEMS);
  saveWatchlist(next);
  return next;
}

export function removeWatchlistItem(slug: string): WatchlistItem[] {
  const current = getWatchlist();
  const next = current.filter((x) => x.slug !== slug);
  saveWatchlist(next);
  return next;
}

export function subscribeWatchlist(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
  };
}
