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

function sanitizeWatchlistPrice(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  const pathMatch =
    typeof item.categoryPath === 'string'
      ? /^\/(smartphones|tablets|laptops|smartwatches|earbuds)(?:\/|$)/.exec(
          item.categoryPath.trim()
        )
      : null;
  const catSlug = getMasterProductCategorySlug({
    slug: item.slug,
    name: item.name,
    metadata: pathMatch ? { category_slug: pathMatch[1] } : undefined,
  });
  const priceWhenAdded = sanitizeWatchlistPrice(item.priceWhenAdded);
  const targetPrice = sanitizeWatchlistPrice(item.targetPrice);
  return {
    ...item,
    slug: item.slug.trim(),
    name: item.name.trim(),
    brand: typeof item.brand === 'string' ? item.brand.trim() : '',
    categoryPath: getCategoryRouteHref(catSlug),
    thumbnail: resolveProductImageUrl(item.slug.trim(), item.thumbnail),
    priceWhenAdded,
    targetPrice,
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
      if (seen.has(normalized.slug)) continue;
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
