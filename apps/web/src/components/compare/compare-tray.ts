'use client';

import {
  type CanonicalCategorySlug,
  MAX_VALID_VND_PRICE,
  getCategoryRouteHref,
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
  categoryPath?: string;
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
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_VALID_VND_PRICE) {
      return 0;
    }
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(TRAY_CONTROL_CHARS_RE, '').trim();
    if (!cleaned || /^0[xbo]/i.test(cleaned)) {
      return 0;
    }
    const num = Number(cleaned);
    if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
      return 0;
    }
    return Math.round(num);
  }
  return 0;
}

export function isCanonicalTrayCategorySlug(
  value: unknown
): value is CanonicalCategorySlug {
  return (
    typeof value === 'string' &&
    CANONICAL_TRAY_CATEGORIES.has(value as CanonicalCategorySlug)
  );
}

export function parseTrayCategorySlugFromPath(
  categoryPath: unknown
): CanonicalCategorySlug | undefined {
  if (typeof categoryPath !== 'string') return undefined;
  const withoutQueryOrHash =
    categoryPath
      .replace(TRAY_CONTROL_CHARS_RE, '')
      .trim()
      .split(/[?#]/, 1)[0] ?? '';
  if (
    !withoutQueryOrHash ||
    /\s/.test(withoutQueryOrHash) ||
    withoutQueryOrHash.includes(':') ||
    withoutQueryOrHash.startsWith('//') ||
    withoutQueryOrHash.includes('\\')
  ) {
    return undefined;
  }
  const trimmed = withoutQueryOrHash.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!trimmed) return undefined;
  const segments = trimmed.split('/');
  if (
    segments.some(
      (seg) => !seg || seg === '.' || seg === '..' || /%2e/i.test(seg)
    )
  ) {
    return undefined;
  }
  if (segments.length <= 2 && isCanonicalTrayCategorySlug(segments[0])) {
    return segments[0];
  }
  if (
    segments.length <= 3 &&
    (segments[0] === 'vi' || segments[0] === 'en' || segments[0] === 'cs') &&
    isCanonicalTrayCategorySlug(segments[1])
  ) {
    return segments[1];
  }
  return undefined;
}

export function normalizeTrayItem(item: CompareTrayItem): CompareTrayItem {
  const safeItem =
    item && typeof item === 'object' && !Array.isArray(item)
      ? item
      : ({} as Partial<CompareTrayItem>);
  const safeSlug = sanitizeTraySlug(safeItem.slug, 160);
  const safeName = sanitizeTrayText(safeItem.name, 200);
  const safeBrand = sanitizeTrayText(safeItem.brand, 80);
  const explicitSlug =
    typeof safeItem.categorySlug === 'string'
      ? safeItem.categorySlug
          .replace(TRAY_CONTROL_CHARS_RE, '')
          .trim()
          .toLowerCase()
      : '';
  const categorySlug = isCanonicalTrayCategorySlug(explicitSlug)
    ? explicitSlug
    : (parseTrayCategorySlugFromPath(safeItem.categoryPath) ??
      getMasterProductCategorySlug({
        slug: safeSlug,
        name: safeName,
      }));
  const safePrice = sanitizeTrayPriceVnd(safeItem.min_price);
  const normalized: CompareTrayItem = {
    ...(safeItem as CompareTrayItem),
    slug: safeSlug,
    name: safeName,
    brand: safeBrand,
    thumbnail: resolveProductImageUrl(safeSlug, safeItem.thumbnail ?? null),
    min_price: safePrice,
    categorySlug,
  };
  if (safeItem.categoryPath !== undefined) {
    normalized.categoryPath = getCategoryRouteHref(categorySlug);
  } else {
    delete normalized.categoryPath;
  }
  return normalized;
}

export function normalizeCompareTrayItems(
  items: readonly CompareTrayItem[]
): CompareTrayItem[] {
  if (!Array.isArray(items)) return [];
  const sameCategory: CompareTrayItem[] = [];
  const seen = new Set<string>();
  let primaryCategory: CanonicalCategorySlug | undefined;
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const normalized = normalizeTrayItem(item);
    if (!normalized.slug || !normalized.name || seen.has(normalized.slug)) {
      continue;
    }
    const itemCategory = normalized.categorySlug || 'smartphones';
    if (!primaryCategory) {
      primaryCategory = itemCategory;
    } else if (itemCategory !== primaryCategory) {
      continue;
    }
    seen.add(normalized.slug);
    sameCategory.push(normalized);
    if (sameCategory.length >= MAX_COMPARE_ITEMS) break;
  }
  return sameCategory;
}

export function getCompareTray(): CompareTrayItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeCompareTrayItems(parsed as CompareTrayItem[]);
  } catch {
    return [];
  }
}

export function setCompareTray(items: CompareTrayItem[]): CompareTrayItem[] {
  if (typeof window === 'undefined') return [];
  const sameCategory = normalizeCompareTrayItems(items);
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
