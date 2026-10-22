import type { MasterProduct } from '@repo/shared-data';

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

// getMasterProductHref only reads category_slug from these two objects. An
// empty object, not null, matches their non-nullable schema type.
const categorySlugOnly = <T>(value: T): T =>
  (value &&
  typeof value === 'object' &&
  typeof (value as Record<string, unknown>).category_slug === 'string'
    ? { category_slug: (value as Record<string, unknown>).category_slug }
    : {}) as T;

// The box matches on and shows only the chip and the screen.
const searchKeySpecs = (
  keySpecs: HeroProductSuggestion['key_specs']
): HeroProductSuggestion['key_specs'] =>
  keySpecs && { chip: keySpecs.chip, screen: keySpecs.screen };

export function toHeroProductSuggestions(
  products: readonly HeroProductSuggestion[]
): HeroProductSuggestion[] {
  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    model: p.model,
    model_key: p.model_key,
    variant_name: p.variant_name,
    key_specs: searchKeySpecs(p.key_specs),
    storage_gb: p.storage_gb,
    images: p.images?.slice(0, 1) ?? p.images,
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
