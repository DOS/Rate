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
 * a key of another shape, which has no variants to find. A key with "_" or
 * "%" gets none either: the prefix then needs no LIKE escaping
 * (DOS/Rate#1436).
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
  /** Null for a variant whose size is not stated: the page labels it. */
  label: string | null;
  /** Lowest stored in-stock price, 0 when there is none. */
  minPrice: number;
  current: boolean;
}

interface SiblingRow {
  slug: string;
  name: string;
  category_id?: string | null;
  variant_name?: string | null;
  model_key: string;
  storage_gb?: number | null;
  min_price?: unknown;
  max_price?: unknown;
  merchant_count?: unknown;
}

const isUnknownVariant = (row: SiblingRow) =>
  row.model_key.endsWith(':unknown');

/**
 * One link per variant of the page's own master, smallest storage first, the
 * current one marked; null when there is no other variant to offer, and the
 * area collapses. The current master is passed in itself, so a bounded read
 * that left it out still counts it. Only masters of its category count, so a
 * link never crosses to another category's path. A variant whose size is not
 * stated (`:unknown`) is no choice to offer and is left out, unless it is the
 * page's own. Two variants with the same label (colours with no name of their
 * own) fall back to their full names.
 */
export function buildProductVariantLinks(
  current: SiblingRow,
  siblings: readonly SiblingRow[]
): ProductVariantLink[] | null {
  const rows = [current, ...siblings]
    .filter(
      (row, i, all) =>
        all.findIndex((other) => other.slug === row.slug) === i &&
        (row.slug === current.slug ||
          ((row.category_id ?? null) === (current.category_id ?? null) &&
            !isUnknownVariant(row)))
    )
    .sort(
      (a, b) =>
        (a.storage_gb ?? Number.MAX_SAFE_INTEGER) -
          (b.storage_gb ?? Number.MAX_SAFE_INTEGER) ||
        a.slug.localeCompare(b.slug)
    );
  if (rows.length < 2) return null;
  const labels = rows.map((row) =>
    isUnknownVariant(row) && !row.variant_name?.trim() && !row.storage_gb
      ? null
      : itemVariantLabel({
          variant_key: row.model_key.slice(row.model_key.lastIndexOf(':') + 1),
          variant_name: row.variant_name,
          storage_gb: row.storage_gb,
        })
  );
  return rows.map((row, i) => {
    const label = labels[i] ?? null;
    return {
      slug: row.slug,
      label:
        label === null || labels.indexOf(label) === labels.lastIndexOf(label)
          ? label
          : row.name,
      minPrice: productMarketStats(row).minPrice,
      current: row.slug === current.slug,
    };
  });
}
