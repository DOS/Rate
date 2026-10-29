/**
 * Pure helpers for the product page per Item (DOS/Rate#1154; design doc
 * `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, section 5.1).
 */

/** The `?v=` value shape the redirects write (a literal `variant_key`). */
const VARIANT_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function cleanVariantKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().toLowerCase();
  return VARIANT_KEY_REGEX.test(clean) ? clean : null;
}

/**
 * A variant's display label: its stored name, else its size from storage
 * (1024 GB reads as 1TB), else the key itself. Labels are never keys (4.2).
 */
export function itemVariantLabel(variant: {
  variant_key: string;
  variant_name?: string | null;
  storage_gb?: number | null;
}): string {
  const name = variant.variant_name?.trim();
  if (name) return name;
  const gb = Number(variant.storage_gb);
  if (Number.isFinite(gb) && gb > 0) {
    return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024}TB` : `${gb}GB`;
  }
  const sized = /^(\d+)(gb|tb)$/i.exec(variant.variant_key);
  if (sized) {
    const n = Number(sized[1]);
    return sized[2]!.toLowerCase() === 'gb' && n >= 1024 && n % 1024 === 0
      ? `${n / 1024}TB`
      : `${n}${sized[2]!.toUpperCase()}`;
  }
  return variant.variant_key;
}

/**
 * The Item's "from" stats over its sized variants only: the cheapest priced
 * size, the top of the dearest, and the most sellers any one size has (a
 * floor for distinct sellers). Listings whose size is not stated never count
 * (Q2); the Item row's merchant_count includes them, so it is not used.
 */
export function itemFromStats(
  variants: readonly {
    min_price?: number | null;
    max_price?: number | null;
    merchant_count?: number | null;
  }[]
): { minPrice: number; maxPrice: number; sellerCount: number } {
  const priced = variants.filter((v) => Number(v.min_price) > 0);
  if (priced.length === 0) return { minPrice: 0, maxPrice: 0, sellerCount: 0 };
  const minPrice = Math.min(...priced.map((v) => Number(v.min_price)));
  const maxPrice = Math.max(
    ...priced.map((v) =>
      Math.max(Number(v.max_price) || 0, Number(v.min_price))
    )
  );
  const sellerCount = Math.max(
    1,
    ...priced.map((v) => Math.max(0, Math.floor(Number(v.merchant_count) || 0)))
  );
  return { minPrice, maxPrice, sellerCount };
}

/** Category peers without the Item's own sizes: a sibling is no competitor. */
export function withoutItemSiblings<T extends { slug: string }>(
  peers: readonly T[],
  siblingSlugs: Iterable<string>
): T[] {
  const skip = new Set(siblingSlugs);
  return peers.filter((peer) => !skip.has(peer.slug));
}

export interface ItemJsonLdVariant {
  variantKey: string;
  label: string;
  minPrice: number;
  maxPrice: number;
  sellerCount: number;
}

/**
 * The schema.org `ProductGroup` node of an Item page: one Product per priced
 * size, each with its own sku and AggregateOffer, and one Item-level rating
 * (Q4). A size with no price is left out: a variant Product needs an offer.
 * The variant URLs carry `?v=`, and the group URL is the canonical (Q1).
 */
export function buildItemProductGroupNode(input: {
  itemKey: string;
  name: string;
  brand: string;
  canonicalUrl: string;
  description: string;
  images: readonly string[];
  variants: readonly ItemJsonLdVariant[];
  aggregateRating?: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    '@type': 'ProductGroup',
    name: input.name,
    brand: { '@type': 'Brand', name: input.brand },
    productGroupID: input.itemKey,
    url: input.canonicalUrl,
    description: input.description,
    image: [...input.images],
    variesBy: ['https://schema.org/size'],
    hasVariant: input.variants
      .filter((v) => v.minPrice > 0)
      .map((v) => ({
        '@type': 'Product',
        name: `${input.name} ${v.label}`,
        sku: `${input.itemKey}:${v.variantKey}`,
        inProductGroupWithID: input.itemKey,
        size: v.label,
        url: `${input.canonicalUrl}?v=${encodeURIComponent(v.variantKey)}`,
        ...(input.images.length > 0 ? { image: [...input.images] } : {}),
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'VND',
          lowPrice: v.minPrice,
          highPrice: Math.max(v.maxPrice, v.minPrice),
          offerCount: v.sellerCount,
        },
      })),
    ...(input.aggregateRating
      ? { aggregateRating: input.aggregateRating }
      : {}),
  };
}
