'use client';

import {
  type CanonicalCategorySlug,
  getMasterProductCategorySlug,
  resolveProductImageUrl,
} from '@/lib/rate-api';

export interface CompareTrayItem {
  slug: string;
  name: string;
  brand: string;
  thumbnail: string | null;
  min_price: number;
  categorySlug?: CanonicalCategorySlug;
}

const STORAGE_KEY = 'rate_compare_tray_v1';
const EVENT_NAME = 'rate:compare-tray-change';
export const MAX_COMPARE_ITEMS = 4;

function normalizeTrayItem(item: CompareTrayItem): CompareTrayItem {
  const categorySlug =
    item.categorySlug ||
    getMasterProductCategorySlug({
      slug: item.slug,
      name: item.name,
    });
  return {
    ...item,
    thumbnail: resolveProductImageUrl(item.slug, item.thumbnail),
    categorySlug,
  };
}

function enforceSameCategoryTray(items: CompareTrayItem[]): CompareTrayItem[] {
  const normalized = items.map(normalizeTrayItem);
  if (normalized.length <= 1) return normalized;
  const primaryCategory = normalized[0]!.categorySlug || 'smartphones';
  return normalized.filter((item) => item.categorySlug === primaryCategory);
}

export function getCompareTray(): CompareTrayItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .filter((item): item is CompareTrayItem =>
        Boolean(
          item && typeof item.slug === 'string' && typeof item.name === 'string'
        )
      )
      .slice(0, MAX_COMPARE_ITEMS);
    return enforceSameCategoryTray(valid);
  } catch {
    return [];
  }
}

export function setCompareTray(items: CompareTrayItem[]): CompareTrayItem[] {
  if (typeof window === 'undefined') return [];
  const deduped: CompareTrayItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.slug || seen.has(item.slug)) continue;
    seen.add(item.slug);
    deduped.push(normalizeTrayItem(item));
    if (deduped.length >= MAX_COMPARE_ITEMS) break;
  }
  const sameCategory = enforceSameCategoryTray(deduped);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sameCategory));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: sameCategory }));
  } catch {
    // Ignore storage quota errors in private mode
  }
  return sameCategory;
}

export function toggleCompareTrayItem(item: CompareTrayItem): {
  items: CompareTrayItem[];
  added: boolean;
  limitReached: boolean;
  categorySwitched?: boolean;
} {
  const normalizedItem = normalizeTrayItem(item);
  const current = getCompareTray();
  const exists = current.some((x) => x.slug === normalizedItem.slug);
  if (exists) {
    const next = setCompareTray(
      current.filter((x) => x.slug !== normalizedItem.slug)
    );
    return { items: next, added: false, limitReached: false };
  }

  // Never allow mixing different categories (e.g. Smartphone vs Earbuds).
  // If user selects a product from a different category, switch the tray to the new category.
  if (
    current.length > 0 &&
    current[0]!.categorySlug &&
    normalizedItem.categorySlug &&
    current[0]!.categorySlug !== normalizedItem.categorySlug
  ) {
    const next = setCompareTray([normalizedItem]);
    return {
      items: next,
      added: true,
      limitReached: false,
      categorySwitched: true,
    };
  }

  if (current.length >= MAX_COMPARE_ITEMS) {
    return { items: current, added: false, limitReached: true };
  }
  const next = setCompareTray([...current, normalizedItem]);
  return { items: next, added: true, limitReached: false };
}

export function clearCompareTray(): void {
  setCompareTray([]);
}

export function subscribeCompareTray(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
  };
}
