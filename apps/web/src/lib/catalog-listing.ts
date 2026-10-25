import type {
  CanonicalCategorySlug,
  MasterProductFilterParams,
} from './rate-api';

const PLAIN_LISTING_KEYS = new Set(['categorySlug', 'sort', 'limit', 'offset']);

const VALID_PLAIN_LISTING_SORTS: ReadonlySet<string> = new Set([
  'default',
  'price_asc',
  'price_desc',
  'rating_desc',
  'merchants_desc',
  'newest',
]);

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
const MAX_PLAIN_LISTING_LIMIT = 500;
const MAX_PLAIN_LISTING_OFFSET = 100_000;

export function isPlainListing(params: MasterProductFilterParams): boolean {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return false;
  }
  if (
    params.sort !== undefined &&
    (typeof params.sort !== 'string' ||
      !VALID_PLAIN_LISTING_SORTS.has(params.sort))
  ) {
    return false;
  }
  if (
    params.limit !== undefined &&
    (typeof params.limit !== 'number' ||
      !Number.isInteger(params.limit) ||
      params.limit < 1 ||
      params.limit > MAX_PLAIN_LISTING_LIMIT)
  ) {
    return false;
  }
  if (
    params.offset !== undefined &&
    (typeof params.offset !== 'number' ||
      !Number.isInteger(params.offset) ||
      params.offset < 0 ||
      params.offset > MAX_PLAIN_LISTING_OFFSET)
  ) {
    return false;
  }
  return (
    typeof params.categorySlug === 'string' &&
    CANONICAL_CATEGORY_SLUGS.has(params.categorySlug) &&
    Object.entries(params).every(
      ([key, value]) => value === undefined || PLAIN_LISTING_KEYS.has(key)
    )
  );
}
