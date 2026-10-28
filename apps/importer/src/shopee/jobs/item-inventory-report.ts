/**
 * Read-only Item migration inventory (DOS/Rate#1148, design doc
 * `Docs/Proposals/2026-10-27-item-variant-listing-model.md` sections 7 and 7.3, phase M0).
 *
 * Usage:
 *   pnpm --filter @repo/crawlers exec tsx src/shopee/jobs/item-inventory-report.ts
 *
 * Reads `rate.categories`, `rate.master_products` and `rate.products` with the public anon
 * key (SUPABASE_URL + SUPABASE_ANON_KEY, or the NEXT_PUBLIC_ pair the web uses) and prints
 * a JSON report. Besides the SQL checks of section 7.3, it runs today's `ProductNormalizer`
 * on every seed, master name and listing title, which SQL cannot do: that is how seed key
 * drift shows up.
 *
 * Safety invariant: SELECTs only. There is no write path and no flag that adds one.
 * Tables anon cannot read (`price_alerts`) are not queried; see the issue for the SQL.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { FLAGSHIP_DEVICES_TO_SEED, type FlagshipDeviceSeed } from '../flagship-seed-data.js';
import { createImporterLogger } from '../logger.js';
import { fetchAllPages, resolveBackfillSupabaseTarget } from '../paging.js';
import { ProductNormalizer } from '../product-normalizer.js';
import { scopeSupabaseToRate, type RateSupabaseClient, type ShopeeProduct } from '../types.js';

const logger = createImporterLogger('ItemInventoryReport');

export interface InventoryMaster {
  id: string;
  model_key: string;
  slug: string;
  name: string;
  brand: string | null;
  status: string | null;
  category_id: string | null;
  storage_gb: number | null;
}

export interface InventoryListing {
  id: string;
  cluster_id: string | null;
  title: string | null;
  platform: string | null;
  platform_item_id: string | null;
  price_min: number | string | null;
  price_max: number | string | null;
}

export interface InventoryCategory {
  id: string;
  slug: string;
}

/** Section 7.3 shape check: three `:`-separated segments. */
const KEY_SHAPE = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9.-]*:[a-z0-9-]+$/;
/** The suffix `rate.item_slug_from_master` strips (section 7.1). */
const VARIANT_SLUG_SUFFIX = /-(\d+(gb|tb)|standard|unknown)$/;
/** The trailing size `rate.item_name_from_master` strips (section 7.1). */
const VARIANT_NAME_SUFFIX = /\s\d+\s?(gb|tb)$/i;
/** Categories with no storage axis (section 4.2). */
const SIZELESS_CATEGORIES = new Set(['earbuds']);

/** `split_part(k, ':', 1) || ':' || split_part(k, ':', 2)`, as the M2 backfill groups. */
export const itemKeyOf = (modelKey: string): string => {
  const [brand = '', model = ''] = modelKey.split(':');
  return `${brand}:${model}`;
};
export const variantKeyOf = (modelKey: string): string => modelKey.split(':')[2] ?? '';
export const itemSlugOf = (slug: string): string => slug.replace(VARIANT_SLUG_SUFFIX, '');
export const itemNameOf = (name: string): string => name.replace(VARIANT_NAME_SUFFIX, '');

/** What the normalizer keys a bare title as, with no marketplace SKUs to help it. */
export function normalizedKeyOf(normalizer: ProductNormalizer, title: string): string {
  const raw: ShopeeProduct = {
    itemId: 'inventory',
    shopId: 'inventory',
    url: 'https://rate.vn',
    title,
    priceMin: 0,
    priceMax: 0,
    currency: 'VND',
    historicalSold: 0,
    ratingStar: 0,
    ratingCount: 0,
    images: [],
    models: [],
    attributes: [],
    shop: { shopId: 'inventory', name: 'inventory', isMall: false },
    reviews: [],
  };
  return normalizer.normalize(raw).model_key;
}

export function buildInventoryReport(input: {
  categories: InventoryCategory[];
  masters: InventoryMaster[];
  listings: InventoryListing[];
  seeds?: FlagshipDeviceSeed[];
  normalizer?: ProductNormalizer;
}) {
  const normalizer = input.normalizer ?? new ProductNormalizer();
  const seeds = input.seeds ?? FLAGSHIP_DEVICES_TO_SEED;
  const categorySlug = new Map(input.categories.map(c => [c.id, c.slug]));
  const masters = input.masters;
  const byId = new Map(masters.map(m => [m.id, m]));
  const byKey = new Map(masters.map(m => [m.model_key, m]));

  const items = new Map<string, InventoryMaster[]>();
  for (const m of masters) {
    const list = items.get(itemKeyOf(m.model_key)) ?? [];
    list.push(m);
    items.set(itemKeyOf(m.model_key), list);
  }

  const counts = {
    total: masters.length,
    published: masters.filter(m => m.status === 'published').length,
    draft: masters.filter(m => m.status === 'draft').length,
    archived: masters.filter(m => m.status === 'archived').length,
    null_status: masters.filter(m => m.status === null).length,
    bad_shape: masters.filter(m => !KEY_SHAPE.test(m.model_key)).length,
    khc_keys: masters.filter(m => m.model_key.startsWith('khc:')).length,
    unknown_masters: masters.filter(m => variantKeyOf(m.model_key) === 'unknown').length,
    standard_masters: masters.filter(m => variantKeyOf(m.model_key) === 'standard').length,
    items: items.size,
    multi_variant_items: [...items.values()].filter(v => v.length > 1).length,
    listings: input.listings.length,
    listings_without_master: input.listings.filter(p => !p.cluster_id).length,
    listings_on_missing_master: input.listings.filter(p => p.cluster_id && !byId.has(p.cluster_id))
      .length,
  };

  const legacyKeys = masters
    .filter(m => !KEY_SHAPE.test(m.model_key) || m.model_key.startsWith('khc:'))
    .map(m => ({ model_key: m.model_key, status: m.status }));

  const itemConflicts = [...items.entries()]
    .filter(
      ([, v]) =>
        // count(DISTINCT ...) ignores NULLs, so a missing brand or category is not a conflict.
        new Set(v.map(m => m.brand).filter(b => b !== null)).size > 1 ||
        new Set(v.map(m => m.category_id).filter(c => c !== null)).size > 1
    )
    .map(([item_key, v]) => ({ item_key, variants: v.map(m => m.model_key) }));

  const sizelessWithSize = masters
    .filter(
      m =>
        SIZELESS_CATEGORIES.has(categorySlug.get(m.category_id ?? '') ?? '') &&
        variantKeyOf(m.model_key) !== 'unknown'
    )
    .map(m => ({ model_key: m.model_key, status: m.status, storage_gb: m.storage_gb }));

  const seedDrift = seeds
    .map(s => {
      const normalized = normalizedKeyOf(normalizer, s.name);
      const stored = byKey.get(s.model_key);
      return {
        seed_key: s.model_key,
        normalized_key: normalized,
        stored_status: stored?.status ?? null,
        normalized_key_stored: byKey.has(normalized),
      };
    })
    .filter(d => d.seed_key !== d.normalized_key);

  const masterDrift = masters
    .map(m => ({
      model_key: m.model_key,
      normalized_key: normalizedKeyOf(normalizer, m.name),
      status: m.status,
    }))
    .filter(d => d.model_key !== d.normalized_key);

  // Listings whose own title keys elsewhere: another Item, the same Item at another size, or
  // the same Item with no size stated (the listings that lose their variant on multi-size Items).
  const listingDrift = input.listings.flatMap(p => {
    const master = p.cluster_id ? byId.get(p.cluster_id) : undefined;
    if (!master || !p.title) return [];
    const normalized = normalizedKeyOf(normalizer, p.title);
    if (normalized === master.model_key) return [];
    return [
      {
        kind:
          itemKeyOf(normalized) !== itemKeyOf(master.model_key)
            ? 'item'
            : variantKeyOf(normalized) === 'unknown'
              ? 'size_not_stated'
              : 'variant',
        master_key: master.model_key,
        normalized_key: normalized,
        platform: p.platform,
        platform_item_id: p.platform_item_id,
        title: p.title.slice(0, 120),
      },
    ];
  });

  // Item slugs from the section 7.1 helper. Two Items on one slug abort the M2 backfill. This
  // also covers an Item slug that is another Item's variant slug: that variant slug carries no
  // size suffix, so it strips to itself. An Item whose masters strip to different slugs gets
  // whichever one the backfill's representative master has, and a slug that still ends in a
  // size after stripping fails the post-M2 check of section 7.3.
  const itemSlugOwners = new Map<string, Set<string>>();
  const itemSlugsByItem = new Map<string, Set<string>>();
  for (const m of masters) {
    const slug = itemSlugOf(m.slug);
    const owners = itemSlugOwners.get(slug) ?? new Set<string>();
    owners.add(itemKeyOf(m.model_key));
    itemSlugOwners.set(slug, owners);
    const slugs = itemSlugsByItem.get(itemKeyOf(m.model_key)) ?? new Set<string>();
    slugs.add(slug);
    itemSlugsByItem.set(itemKeyOf(m.model_key), slugs);
  }
  const slugCollisions = [
    ...[...itemSlugOwners.entries()]
      .filter(([, owners]) => owners.size > 1)
      .map(([slug, owners]) => ({ kind: 'two_items', slugs: [slug], items: [...owners] })),
    ...[...itemSlugsByItem.entries()]
      .filter(([, slugs]) => slugs.size > 1)
      .map(([item, slugs]) => ({ kind: 'item_slug_differs', slugs: [...slugs], items: [item] })),
    ...[...itemSlugOwners.entries()]
      .filter(([slug]) => /-\d+(gb|tb)$/.test(slug))
      .map(([slug, owners]) => ({ kind: 'still_sized', slugs: [slug], items: [...owners] })),
  ];

  // Broader than the section 7.3 check (a size anywhere, not only at the end), so a name such as
  // "12GB RAM" is flagged too; those rows are read by hand.
  const sizedItemNames = masters
    .filter(m => /\d+\s?(gb|tb)\b/i.test(itemNameOf(m.name)))
    .map(m => ({ model_key: m.model_key, name: m.name }));

  const storageMismatch = masters
    .filter(m => {
      const v = variantKeyOf(m.model_key);
      // `1tb` and suffixed keys such as `256gb-cellular` (section 4.2) are sized too.
      const sized = /^(\d+)(gb|tb)(?:-|$)/.exec(v);
      if (!sized) return m.storage_gb !== null;
      return Number(sized[1]) * (sized[2] === 'tb' ? 1024 : 1) !== m.storage_gb;
    })
    .map(m => ({ model_key: m.model_key, storage_gb: m.storage_gb }));

  const multiSkuListings = input.listings
    .filter(
      p =>
        p.price_min !== null && p.price_max !== null && Number(p.price_min) !== Number(p.price_max)
    )
    .map(p => ({
      master_key: p.cluster_id ? (byId.get(p.cluster_id)?.model_key ?? null) : null,
      platform: p.platform,
      platform_item_id: p.platform_item_id,
      price_min: Number(p.price_min),
      price_max: Number(p.price_max),
    }));

  return {
    counts,
    legacy_keys: legacyKeys,
    item_conflicts: itemConflicts,
    sizeless_with_size: sizelessWithSize,
    seed_drift: seedDrift,
    master_drift: masterDrift,
    listing_drift: listingDrift,
    slug_collisions: slugCollisions,
    sized_item_names: sizedItemNames,
    storage_mismatch: storageMismatch,
    multi_sku_listings: multiSkuListings,
  };
}

export async function loadInventory(supabase: RateSupabaseClient) {
  const categories = await fetchAllPages<InventoryCategory>('categories', (from, to) =>
    supabase.from('categories').select('id, slug').order('id').range(from, to)
  );
  const masters = await fetchAllPages<InventoryMaster>('master_products', (from, to) =>
    supabase
      .from('master_products')
      .select('id, model_key, slug, name, brand, status, category_id, storage_gb')
      .order('id')
      .range(from, to)
  );
  const listings = await fetchAllPages<InventoryListing>('products', (from, to) =>
    supabase
      .from('products')
      .select('id, cluster_id, title, platform, platform_item_id, price_min, price_max')
      .order('id')
      .range(from, to)
  );
  return { categories, masters, listings };
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '../../.env', quiet: true });
  (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    // The anon key on purpose: the report must see what any visitor sees, and nothing more.
    const key = (
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
    ).trim();
    if (!rawUrl.trim() || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.');
    }
    const { url, host } = resolveBackfillSupabaseTarget(rawUrl);
    const supabase = scopeSupabaseToRate(
      createClient(url, key, { auth: { persistSession: false } })
    );
    // stderr, so stdout stays one JSON document.
    process.stderr.write(`Target: ${host} (read-only)
`);
    const report = buildInventoryReport(await loadInventory(supabase));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  })().catch((err: unknown) => {
    logger.error(
      'inventory.fatal',
      `Item inventory report failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
