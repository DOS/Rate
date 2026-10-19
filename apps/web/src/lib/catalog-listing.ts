import type {
  CanonicalCategorySlug,
  MasterProductFilterParams,
} from './rate-api';

const PLAIN_LISTING_KEYS = new Set(['categorySlug', 'sort', 'limit', 'offset']);

const CANONICAL_CATEGORY_SLUGS: ReadonlySet<string> =
  new Set<CanonicalCategorySlug>([
    'smartphones',
    'tablets',
    'laptops',
    'smartwatches',
    'earbuds',
  ]);

/**
 * True when a catalogue read sets no filter: only one of the five canonical
 * categories (the `?category=` value is user input), the sort and the page
 * window. Those reads share the data cache; a filter added later is treated
 * as free-form and stays uncached until listed here (DOS/Rate#495).
 */
export function isPlainListing(params: MasterProductFilterParams): boolean {
  return (
    typeof params.categorySlug === 'string' &&
    CANONICAL_CATEGORY_SLUGS.has(params.categorySlug) &&
    Object.entries(params).every(
      ([key, value]) => value === undefined || PLAIN_LISTING_KEYS.has(key)
    )
  );
}
