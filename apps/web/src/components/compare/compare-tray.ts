'use client';

import {
  type CanonicalCategorySlug,
  MAX_VALID_VND_PRICE,
  getMasterProductCategorySlug,
  resolveProductImageUrl,
} from '@/lib/rate-domain';

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
const TRAY_CONTROL_CHARS_RE = /\p{Cc}+/gu;
const CANONICAL_TRAY_CATEGORIES = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

export const MAX_COMPARE_ITEMS = 4;

export function sanitizeTrayText(value: unknown, maxLen = 200): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(TRAY_CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function sanitizeTraySlug(value: unknown, maxLen = 160): string {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(TRAY_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function sanitizeTrayPriceVnd(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function isCanonicalTrayCategorySlug(
  value: unknown
): value is CanonicalCategorySlug {
  return (
    typeof value === 'string' &&
    CANONICAL_TRAY_CATEGORIES.has(value as CanonicalCategorySlug)
  );
}

export function normalizeTrayItem(item: CompareTrayItem): CompareTrayItem {
  const safeSlug = sanitizeTraySlug(item?.slug, 160);
  const safeName = sanitizeTrayText(item?.name, 200);
  const safeBrand = sanitizeTrayText(item?.brand, 80);
  const categorySlug = isCanonicalTrayCategorySlug(item?.categorySlug)
    ? item.categorySlug
    : getMasterProductCategorySlug({
        slug: safeSlug,
        name: safeName,
      });
  const safePrice = sanitizeTrayPriceVnd(item?.min_price);
  return {
    ...item,
    slug: safeSlug,
    name: safeName,
    brand: safeBrand,
    thumbnail: resolveProductImageUrl(safeSlug, item?.thumbnail ?? null),
    min_price: safePrice,
    categorySlug,
  };
}

function enforceSameCategoryTray(items: CompareTrayItem[]): CompareTrayItem[] {
  const normalized = items
    .map(normalizeTrayItem)
    .filter((item) => item.slug && item.name);
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
    const deduped: CompareTrayItem[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const slugKey = sanitizeTraySlug((item as { slug?: unknown }).slug, 160);
      const nameVal = sanitizeTrayText((item as { name?: unknown }).name, 200);
      if (!slugKey || !nameVal || seen.has(slugKey)) {
        continue;
      }
      seen.add(slugKey);
      deduped.push(item as CompareTrayItem);
      if (deduped.length >= MAX_COMPARE_ITEMS) break;
    }
    return enforceSameCategoryTray(deduped);
  } catch {
    return [];
  }
}

export function setCompareTray(items: CompareTrayItem[]): CompareTrayItem[] {
  if (typeof window === 'undefined') return [];
  const deduped: CompareTrayItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const normalized = normalizeTrayItem(item);
      if (!normalized.slug || !normalized.name || seen.has(normalized.slug)) {
        continue;
      }
      seen.add(normalized.slug);
      deduped.push(normalized);
      if (deduped.length >= MAX_COMPARE_ITEMS) break;
    }
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
  if (!normalizedItem.slug || !normalizedItem.name) {
    return { items: current, added: false, limitReached: false };
  }
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
