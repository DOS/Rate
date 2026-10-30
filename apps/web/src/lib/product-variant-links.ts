/**
 * The product page's variant links with the Item flag off: the other
 * published masters of the same model, by `brand:model:` key prefix
 * (DOS/Rate#1436).
 */
import { itemVariantLabel } from './item-page';
import { productMarketStats } from './product-market-stats';

/**
 * The model part of a `brand:model:variant` key, "apple:iphone-16e:" for
 * "apple:iphone-16e:128gb": every variant of that model shares it. Empty for
 * a key of another shape, which has no variants to find (DOS/Rate#1436).
 */
export function masterSiblingKeyPrefix(modelKey: unknown): string {
  if (typeof modelKey !== 'string') return '';
  const match =
    /^([a-z0-9][a-z0-9-]{0,59}):([a-z0-9][a-z0-9.-]{0,119}):[a-z0-9.-]{1,60}$/.exec(
      modelKey
    );
  return match ? `${match[1]}:${match[2]}:` : '';
}

export interface ProductVariantLink {
  slug: string;
  label: string;
  /** Lowest stored in-stock price, 0 when there is none. */
  minPrice: number;
  current: boolean;
}

interface SiblingRow {
  slug: string;
  name: string;
  variant_name?: string | null;
  model_key: string;
  storage_gb?: number | null;
  min_price?: unknown;
  max_price?: unknown;
  merchant_count?: unknown;
}

/**
 * One link per sibling, the current master marked, or null when the model has
 * no other variant to offer: the area then collapses. A variant whose size is
 * not stated (`:unknown`) is no choice to offer and is left out, unless it is
 * the page's own. Two variants with the same label (colours with no name of
 * their own) fall back to their full names.
 */
export function buildProductVariantLinks(
  currentSlug: string,
  siblings: readonly SiblingRow[]
): ProductVariantLink[] | null {
  const rows = siblings.filter(
    (row, i) =>
      siblings.findIndex((other) => other.slug === row.slug) === i &&
      (row.slug === currentSlug || !row.model_key.endsWith(':unknown'))
  );
  if (rows.length < 2 || !rows.some((row) => row.slug === currentSlug)) {
    return null;
  }
  const labels = rows.map((row) =>
    itemVariantLabel({
      variant_key: row.model_key.slice(row.model_key.lastIndexOf(':') + 1),
      variant_name: row.variant_name,
      storage_gb: row.storage_gb,
    })
  );
  return rows.map((row, i) => ({
    slug: row.slug,
    label:
      labels.indexOf(labels[i]!) === labels.lastIndexOf(labels[i]!)
        ? labels[i]!
        : row.name,
    minPrice: productMarketStats(row).minPrice,
    current: row.slug === currentSlug,
  }));
}
