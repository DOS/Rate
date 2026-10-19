import type { MasterProductFilterParams } from './rate-api';

const PLAIN_LISTING_KEYS = new Set(['categorySlug', 'sort', 'limit', 'offset']);

/**
 * True when a catalogue read sets no filter: only the category, the sort and
 * the page window. Those reads share the data cache; a filter added later is
 * treated as free-form and stays uncached until listed here (DOS/Rate#495).
 */
export function isPlainListing(params: MasterProductFilterParams): boolean {
  return Object.entries(params).every(
    ([key, value]) => value === undefined || PLAIN_LISTING_KEYS.has(key)
  );
}
