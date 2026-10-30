import type { MasterProduct } from '@repo/shared-data';
import { isCanonicalCategorySlug, usableImageUrls } from './rate-domain-core';

/**
 * The product fields the hero search box shows, filters on and links with.
 * Pages pass these instead of whole MasterProduct rows: full spec sheets made
 * up most of the home page's client payload (DOS/Rate#748).
 */
export type HeroProductSuggestion = Pick<
  MasterProduct,
  | 'id'
  | 'slug'
  | 'name'
  | 'brand'
  | 'model'
  | 'model_key'
  | 'variant_name'
  | 'key_specs'
  | 'storage_gb'
  | 'images'
  | 'thumbnail'
  | 'min_price'
  | 'merchant_count'
  | 'user_rating_weighted'
  | 'average_rating'
  | 'category_id'
  | 'metadata'
  | 'specifications'
>;

export const MAX_HERO_PRODUCTS = 200;

function sanitizeOptionalSpecText(
  value: unknown,
  maxLen = 160
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, maxLen);
  return cleaned || undefined;
}

// getMasterProductHref only reads category_slug from these two objects. An
// empty object, not null, matches their non-nullable schema type.
export const categorySlugOnly = <T>(value: T): T => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as T;
  }
  const raw = (value as Record<string, unknown>).category_slug;
  if (typeof raw !== 'string') return {} as T;
  const slug = raw
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .slice(0, 64);
  return (isCanonicalCategorySlug(slug) ? { category_slug: slug } : {}) as T;
};

// The box matches on and shows only the chip and the screen.
const searchKeySpecs = (
  keySpecs: HeroProductSuggestion['key_specs']
): HeroProductSuggestion['key_specs'] => {
  if (!keySpecs || typeof keySpecs !== 'object' || Array.isArray(keySpecs)) {
    return {};
  }
  return {
    chip: sanitizeOptionalSpecText(keySpecs.chip),
    screen: sanitizeOptionalSpecText(keySpecs.screen),
  };
};

export function toHeroProductSuggestions(
  products: readonly HeroProductSuggestion[]
): HeroProductSuggestion[] {
  if (!Array.isArray(products)) return [];
  return products
    .filter(
      (p): p is HeroProductSuggestion =>
        Boolean(p) && typeof p === 'object' && !Array.isArray(p)
    )
    .slice(0, MAX_HERO_PRODUCTS)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      model: p.model,
      model_key: p.model_key,
      variant_name: p.variant_name,
      key_specs: searchKeySpecs(p.key_specs),
      storage_gb: p.storage_gb,
      // The first usable image, not the first entry, which can be junk such as
      // "[object Object]" (DOS/Rate#810).
      images: usableImageUrls(p.images).slice(0, 1),
      thumbnail: p.thumbnail,
      min_price: p.min_price,
      merchant_count: p.merchant_count,
      user_rating_weighted: p.user_rating_weighted,
      average_rating: p.average_rating,
      category_id: p.category_id,
      metadata: categorySlugOnly(p.metadata),
      specifications: categorySlugOnly(p.specifications),
    }));
}

/**
 * A catalog row for a client list that shows names, prices, ratings and links:
 * the spec sheet and the long expert texts dropped, the category slug kept for
 * links. They were 27% of the watchlist page's HTML and 8% of a category
 * page's (DOS/Rate#1353).
 */
export function withoutSpecSheet<T extends MasterProduct>(p: T): T {
  return {
    ...p,
    specifications: categorySlugOnly(p.specifications),
    spec_provenance: {},
    expert_review_summary: null,
    description: null,
  };
}
