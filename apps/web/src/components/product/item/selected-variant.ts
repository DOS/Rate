'use client';

import { useSyncExternalStore } from 'react';
import { cleanVariantKey } from '@/lib/item-page';

// The size on an Item page lives in `?v=` and is read in the browser only, so
// the page itself stays static (ISR) for every size (DOS/Rate#1154, Q1).
const VARIANT_EVENT = 'rate:item-variant';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(VARIANT_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(VARIANT_EVENT, onChange);
  };
}

function readVariantParam(): string | null {
  return cleanVariantKey(new URLSearchParams(window.location.search).get('v'));
}

/** The selected size: `?v=` when it names one of `keys`, else the default. */
export function useSelectedVariant(
  keys: readonly string[],
  defaultKey: string
): string {
  const requested = useSyncExternalStore(
    subscribe,
    readVariantParam,
    () => null
  );
  return requested && keys.includes(requested) ? requested : defaultKey;
}

/** Selects a size: rewrites `?v=` in place (no navigation, no new entry). */
export function selectVariant(key: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('v', key);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event(VARIANT_EVENT));
}
