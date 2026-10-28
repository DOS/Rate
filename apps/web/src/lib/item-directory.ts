import type { MasterProduct } from '@repo/shared-data';

// Directory, leaderboard, facets and sitemap per Item (DOS/Rate#1155; design
// doc `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, 5.1): one
// card, one leaderboard slot and one sitemap URL per Item, built from the
// variant rows the catalogue reads already return. Pure: the server layer
// reads the links and applies these only while `RATE_ITEM_MODEL` is on.

/** One size of an Item, as a chip on its card. */
export interface ItemVariantChip {
  /** The literal key segment: 256gb, 1024gb, standard, unknown. */
  variant_key: string;
  storage_gb: number | null;
  min_price: number;
}

/**
 * A catalogue row standing for a whole Item: the best-ranked of its variants
 * in this read, with the Item's name and a price range over its matching
 * variants. `slug` stays the variant's (deal radar and compare are keyed by
 * variant); links use `item_slug`.
 */
export type ItemCatalogRow = MasterProduct & {
  item_slug?: string;
  /** The Item's published sizes, in order; absent on a row with no Item. */
  item_variants?: ItemVariantChip[];
};

/** The Item fields grouping needs (a subset of `MasterItemLink`). */
export interface ItemLinkInput {
  item: { id: string; slug: string; name: string; merchant_count: number };
  variants: readonly {
    variant_key: string;
    storage_gb: number | null;
    min_price: number;
  }[];
}

const positivePrice = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * One row per Item, in the order of each Item's first (best-ranked) variant;
 * a row with no Item stays as it is. The price range covers the variants
 * this read returned, so a `?storage=` filter shows the matching sizes'
 * prices (the filter means "has a variant of that size").
 */
export function groupRowsByItem<T extends MasterProduct>(
  rows: readonly T[],
  links: ReadonlyMap<string, ItemLinkInput>
): Array<T & ItemCatalogRow> {
  const out: Array<T & ItemCatalogRow> = [];
  const byItem = new Map<string, number>();
  for (const row of rows) {
    const link = row?.id ? links.get(row.id) : undefined;
    if (!link) {
      out.push(row as T & ItemCatalogRow);
      continue;
    }
    const min = positivePrice(row.min_price);
    const max = Math.max(positivePrice(row.max_price), min);
    const at = byItem.get(link.item.id);
    if (at === undefined) {
      byItem.set(link.item.id, out.length);
      out.push({
        ...row,
        name: link.item.name || row.name,
        min_price: min,
        max_price: max,
        merchant_count: Math.max(
          Number(link.item.merchant_count) || 0,
          Number(row.merchant_count) || 0
        ),
        item_slug: link.item.slug,
        item_variants: link.variants.map((v) => ({
          variant_key: v.variant_key,
          storage_gb: v.storage_gb,
          min_price: positivePrice(v.min_price),
        })),
      });
      continue;
    }
    const card = out[at]!;
    const cardMin = positivePrice(card.min_price);
    if (min > 0 && (cardMin === 0 || min < cardMin)) card.min_price = min;
    if (max > positivePrice(card.max_price)) card.max_price = max;
  }
  return out;
}

/** The link target of a catalogue row: its Item when it has one. */
export function catalogRowSlug(row: {
  slug: string;
  item_slug?: string;
}): string {
  return row.item_slug || row.slug;
}

/** Brand facets with one count per grouping key (an Item, or a lone master). */
export function countBrandsByItem(
  rows: readonly { brand: string; key: string }[]
): { name: string; count: number }[] {
  const byLower = new Map<string, { name: string; keys: Set<string> }>();
  for (const r of rows) {
    const brand = typeof r.brand === 'string' ? r.brand.trim() : '';
    if (!brand || !r.key) continue;
    const lower = brand.toLowerCase();
    const entry = byLower.get(lower);
    if (entry) {
      entry.keys.add(r.key);
      // Prefer a cased spelling ("Apple") over an all-lowercase one.
      if (entry.name === entry.name.toLowerCase() && brand !== lower) {
        entry.name = brand;
      }
    } else {
      byLower.set(lower, { name: brand, keys: new Set([r.key]) });
    }
  }
  return Array.from(byLower.values())
    .map((e) => ({ name: e.name, count: e.keys.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Sitemap product entries per Item: one URL per Item (its slug) with the
 * newest `updated_at` over its variants; a master with no Item keeps its own
 * URL. `itemSlugByVariantSlug` maps a variant slug to its Item's slug.
 */
export function sitemapRowsByItem<
  R extends { slug: string; updated_at: string | null },
>(rows: readonly R[], itemSlugByVariantSlug: ReadonlyMap<string, string>): R[] {
  const out: R[] = [];
  const bySlug = new Map<string, number>();
  for (const row of rows) {
    const itemSlug = itemSlugByVariantSlug.get(row.slug);
    if (!itemSlug) {
      out.push(row);
      continue;
    }
    const at = bySlug.get(itemSlug);
    if (at === undefined) {
      bySlug.set(itemSlug, out.length);
      out.push({ ...row, slug: itemSlug });
      continue;
    }
    const kept = out[at]!;
    const keptTime = Date.parse(kept.updated_at ?? '') || 0;
    const rowTime = Date.parse(row.updated_at ?? '') || 0;
    if (rowTime > keptTime) out[at] = { ...kept, updated_at: row.updated_at };
  }
  return out;
}

/** A size chip on an Item card: its label and the Item URL preselecting it. */
export interface ItemSizeChip {
  label: string;
  href: string;
}

/**
 * The size chips of an Item card: its sized variants, each linking to the
 * Item URL with `?v=` (design doc 5.1). None for a row with no Item or with
 * fewer than two sizes: a single size is no choice.
 */
export function itemSizeChips(
  row: ItemCatalogRow,
  itemHref: string,
  formatStorage: (gb: number) => string
): ItemSizeChip[] {
  const sized = (row.item_variants ?? []).filter(
    (v) => typeof v.storage_gb === 'number' && v.storage_gb > 0
  );
  if (sized.length < 2) return [];
  return sized.map((v) => ({
    label: formatStorage(v.storage_gb as number),
    href: `${itemHref}?v=${encodeURIComponent(v.variant_key)}`,
  }));
}
