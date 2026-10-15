'use client';

import {
  getCategoryRouteHref,
  getMasterProductCategorySlug,
  resolveProductImageUrl,
} from '@/lib/rate-api';

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

function normalizeWatchlistItem(item: WatchlistItem): WatchlistItem {
  const catSlug = getMasterProductCategorySlug({
    slug: item.slug,
    name: item.name,
  });
  return {
    ...item,
    categoryPath:
      item.categoryPath && item.categoryPath.startsWith('/')
        ? item.categoryPath
        : getCategoryRouteHref(catSlug),
    thumbnail: resolveProductImageUrl(item.slug, item.thumbnail),
  };
}

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is WatchlistItem =>
        Boolean(
          item && typeof item.slug === 'string' && typeof item.name === 'string'
        )
      )
      .map(normalizeWatchlistItem);
  } catch {
    return [];
  }
}

function saveWatchlist(items: WatchlistItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Ignore private mode storage quota errors
  }
}

export function upsertWatchlistItem(item: WatchlistItem): WatchlistItem[] {
  const normalized = normalizeWatchlistItem(item);
  const current = getWatchlist();
  const idx = current.findIndex((x) => x.slug === normalized.slug);
  const next =
    idx >= 0
      ? current.map((x, i) => (i === idx ? normalized : x))
      : [normalized, ...current];
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
