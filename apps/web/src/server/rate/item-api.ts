import 'server-only';
import {
  ItemModelUnavailableError,
  RateDataUnavailableError,
  getItemById,
  getItemOffers,
  getRateClient,
  getItemVariants,
  getItemVariantsBatch,
  listItems,
  resolveCatalogSlug,
  type ItemListParams,
  type MerchantOffer,
  type RateItem,
  type RateItemVariant,
} from '../../lib/rate-api';
import { createLogger } from '@/lib/logger';
import { isItemModelOn, sanitizeVariantParam } from './item-model';

const log = createLogger('server.item-api');

/**
 * API v1 and the extension under the Item model (DOS/Rate#1158, design doc
 * 5.2). Everything here is additive: with `RATE_ITEM_MODEL` off, or while the
 * Item tables are missing, callers get null and answer exactly as before.
 */

/** A catalogue slug read as an Item, with the variant a response is about. */
export interface ApiItemContext {
  item: RateItem;
  variants: RateItemVariant[];
  /** The variant the response's `product` is: `?v=`, the slug's, the default, the first. */
  selected: RateItemVariant;
  /** True when the slug or `?v=` named the size; false for a default pick. */
  sizeChosen: boolean;
}

/** The public Item object of API v1. */
export interface ApiItem {
  id: string;
  item_key: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category_id: string | null;
  min_price: number;
  max_price: number;
  price_variant_count: number;
  merchant_count: number;
  listing_count: number;
  unknown_variant_listing_count: number;
}

/** A public variant of an Item. */
export interface ApiItemVariant {
  id: string;
  slug: string;
  name: string;
  variant_key: string;
  variant_name: string | null;
  storage_gb: number | null;
  min_price: number;
  max_price: number;
  merchant_count: number;
}

/** The fields `/products/{slug}` adds under the Item model. */
export interface ApiItemFields {
  item: ApiItem;
  variants: ApiItemVariant[];
  selected_variant: string | null;
  unknown_variant_offers: MerchantOffer[];
}

export function toApiItem(item: RateItem): ApiItem {
  return {
    id: item.id,
    item_key: item.item_key,
    slug: item.slug,
    name: item.name,
    brand: item.brand,
    model: item.model,
    category_id: item.category_id,
    min_price: item.min_price,
    max_price: item.max_price,
    price_variant_count: item.price_variant_count,
    merchant_count: item.merchant_count,
    listing_count: item.listing_count,
    unknown_variant_listing_count: item.unknown_variant_listing_count,
  };
}

export function toApiItemVariant(variant: RateItemVariant): ApiItemVariant {
  return {
    id: variant.id,
    slug: variant.slug,
    name: variant.name,
    variant_key: variant.variant_key,
    variant_name: variant.variant_name,
    storage_gb: variant.storage_gb,
    min_price: variant.min_price,
    max_price: variant.max_price,
    merchant_count: variant.merchant_count,
  };
}

/** Runs an Item read; null when the Item tables are missing (M1+M2 not applied). */
async function orUnavailable<T>(
  what: string,
  read: () => Promise<T>
): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof ItemModelUnavailableError) {
      log.warn('item model on but its tables are missing', {
        what,
        message: err.message,
      });
      return null;
    }
    throw err;
  }
}

/**
 * The Item a catalogue slug belongs to, and the variant to answer with: the
 * one `?v=` names, else the old variant slug's own size, else the Item's
 * default variant, else its first. Null while the flag is off, the tables are
 * missing, or the slug is no published Item or variant of one (callers then
 * answer as before).
 */
export async function resolveApiItemContext(
  slug: string,
  rawVariant?: unknown
): Promise<ApiItemContext | null> {
  if (!isItemModelOn()) return null;
  return orUnavailable('slug', async () => {
    const resolution = await resolveCatalogSlug(slug);
    if (!resolution || resolution.kind === 'unlinked') return null;
    const variants = await getItemVariants(resolution.item.id);
    const requested = sanitizeVariantParam(rawVariant);
    const byParam = requested
      ? variants.find((v) => v.variant_key === requested)
      : undefined;
    const bySlug =
      resolution.kind === 'variant' && !resolution.retired
        ? variants.find((v) => v.id === resolution.variant.id)
        : undefined;
    const selected =
      byParam ??
      bySlug ??
      variants.find((v) => v.id === resolution.item.default_variant_id) ??
      variants[0];
    if (!selected) return null;
    return {
      item: resolution.item,
      variants,
      selected,
      sizeChosen: Boolean(byParam ?? bySlug),
    };
  });
}

/** The Item fields of `/products/{slug}` for a resolved context. */
export async function buildApiItemFields(
  context: ApiItemContext
): Promise<ApiItemFields> {
  const offers = await orUnavailable('offers', () =>
    getItemOffers(context.item.id, [])
  );
  return {
    item: toApiItem(context.item),
    variants: context.variants.map(toApiItemVariant),
    selected_variant: context.selected.variant_key,
    unknown_variant_offers: offers?.unknownVariant ?? [],
  };
}

/** The Item URL on rate.vn, with the variant preselected when one is known. */
export function itemProductPath(
  categoryPath: string,
  itemSlug: string,
  variantKey?: string | null
): string {
  const base = `/${categoryPath}/${encodeURIComponent(itemSlug)}`;
  return variantKey ? `${base}?v=${encodeURIComponent(variantKey)}` : base;
}

// undefined_table, undefined_column, and PostgREST's schema-cache misses.
const MISSING_SCHEMA_CODES = new Set([
  '42P01',
  '42703',
  'PGRST204',
  'PGRST205',
]);

/**
 * The Item of a marketplace listing with no variant (`cluster_id` NULL,
 * `item_id` set, design doc 4.4), answered with the Item's default variant
 * and no size chosen. Null while the flag is off, the columns are missing, or
 * no such listing exists.
 */
export async function resolveListingItemContext(
  platformItemIds: readonly string[]
): Promise<ApiItemContext | null> {
  if (!isItemModelOn() || platformItemIds.length === 0) return null;
  const client = getRateClient();
  if (!client) return null;
  // `item_id` is not in the generated types until #1150 lands.
  const { data, error } = await (
    client.from('products') as unknown as {
      select: (cols: string) => {
        in: (
          col: string,
          values: readonly string[]
        ) => {
          is: (
            col: string,
            value: null
          ) => {
            not: (
              col: string,
              op: string,
              value: null
            ) => {
              limit: (n: number) => PromiseLike<{
                data: Array<{ item_id: string | null }> | null;
                error: { message: string; code?: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .select('item_id, platform_item_id')
    .in('platform_item_id', platformItemIds)
    .is('cluster_id', null)
    .not('item_id', 'is', null)
    .limit(5);
  if (error) {
    if (error.code && MISSING_SCHEMA_CODES.has(error.code)) {
      log.warn('item model on but products.item_id is missing', {
        message: error.message,
      });
      return null;
    }
    log.error('listing item lookup failed', { message: error.message });
    throw new RateDataUnavailableError('products', error);
  }
  const itemId = (data ?? []).find(
    (r) => typeof r.item_id === 'string'
  )?.item_id;
  if (!itemId) return null;
  return orUnavailable('listing item', async () => {
    const item = await getItemById(itemId);
    if (!item) return null;
    const variants = await getItemVariants(item.id);
    const selected =
      variants.find((v) => v.id === item.default_variant_id) ?? variants[0];
    return selected ? { item, variants, selected, sizeChosen: false } : null;
  });
}

/**
 * A matched variant's Item context. The size counts as chosen only when the
 * listing itself is that variant (`exactListing`) or the page states a size
 * the Item has, which then selects that variant; a catalogue guess from a
 * title without a size chooses none.
 */
export async function resolveVariantItemContext(
  variantSlug: string,
  storageGb: number | null,
  exactListing: boolean
): Promise<ApiItemContext | null> {
  const context = await resolveApiItemContext(variantSlug);
  if (!context) return null;
  const sized = storageGb
    ? context.variants.find((v) => v.storage_gb === storageGb)
    : undefined;
  if (sized) return { ...context, selected: sized, sizeChosen: true };
  return { ...context, sizeChosen: exactListing };
}

/** One row of `/products?group=item`: the Item and its variants. */
export interface ApiItemListRow extends ApiItem {
  variants: ApiItemVariant[];
}

/**
 * `/products?group=item` (DOS/Rate#1158): a page of published Items with their
 * variants. Null while the flag is off or the Item tables are missing, so the
 * route answers the variant list as before.
 */
export async function listApiItems(
  categorySlug: string,
  params: Omit<ItemListParams, 'categoryId'>
): Promise<ApiItemListRow[] | null> {
  if (!isItemModelOn()) return null;
  return orUnavailable('item list', async () => {
    let categoryId: string | null = null;
    if (categorySlug && categorySlug !== 'all') {
      const client = getRateClient();
      const { data, error } = await client
        .from('categories')
        .select('id')
        .eq('slug', categorySlug)
        .maybeSingle();
      if (error) throw new RateDataUnavailableError('categories', error);
      if (!data) return [];
      categoryId = (data as { id: string }).id;
    }
    const items = await listItems({ ...params, categoryId });
    const variants = await getItemVariantsBatch(items.map((i) => i.id));
    return items.map((item) => ({
      ...toApiItem(item),
      variants: (variants.get(item.id) ?? []).map(toApiItemVariant),
    }));
  });
}
