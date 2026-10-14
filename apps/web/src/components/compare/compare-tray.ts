'use client';

export interface CompareTrayItem {
  slug: string;
  name: string;
  brand: string;
  thumbnail: string | null;
  min_price: number;
}

const STORAGE_KEY = 'rate_compare_tray_v1';
const EVENT_NAME = 'rate:compare-tray-change';
export const MAX_COMPARE_ITEMS = 4;

export function getCompareTray(): CompareTrayItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is CompareTrayItem =>
        Boolean(
          item && typeof item.slug === 'string' && typeof item.name === 'string'
        )
      )
      .slice(0, MAX_COMPARE_ITEMS);
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
    deduped.push(item);
    if (deduped.length >= MAX_COMPARE_ITEMS) break;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: deduped }));
  } catch {
    // Ignore storage quota errors in private mode
  }
  return deduped;
}

export function toggleCompareTrayItem(item: CompareTrayItem): {
  items: CompareTrayItem[];
  added: boolean;
  limitReached: boolean;
} {
  const current = getCompareTray();
  const exists = current.some((x) => x.slug === item.slug);
  if (exists) {
    const next = setCompareTray(current.filter((x) => x.slug !== item.slug));
    return { items: next, added: false, limitReached: false };
  }
  if (current.length >= MAX_COMPARE_ITEMS) {
    return { items: current, added: false, limitReached: true };
  }
  const next = setCompareTray([...current, item]);
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
