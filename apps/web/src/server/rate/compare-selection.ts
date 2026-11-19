import 'server-only';
import { cache } from 'react';
import { compareCategoryParam } from '@/lib/compare-params';
import { dedupeCompareTargets, parseCompareToken } from '@/lib/item-compare';
import { createLogger } from '@/lib/logger';
import {
  getItemById,
  getRateClient,
  RateDataUnavailableError,
} from '@/lib/rate-api';
import {
  getCachedCompareMasterProducts,
  getCachedMasterProducts,
  getMasterProductCategorySlug,
  isCanonicalCategorySlug,
  sanitizeCachedProductSlug,
} from './index';
import { RATE_CACHE_TAGS, withRateDataCache } from './cache-tags';
import { resolveCompareTargets } from './item-compare';
import { whenItemModel } from './item-directory';
import { ITEM_VARIANT_SLUG_SUFFIX } from './item-model';

type CompareSearchParams = Record<string, string | string[] | undefined>;

export function parseCompareSlugs(value?: string | string[]): string[] {
  const csv = Array.isArray(value) ? value[0] : value;
  if (!csv) return [];
  return Array.from(
    new Set(
      csv
        .split(',')
        .map((slug) => slug.trim())
        .filter(Boolean)
    )
  ).slice(0, 4);
}

function validMasterSlug(slug: string) {
  return slug.length > 0 && sanitizeCachedProductSlug(slug) === slug;
}

function regexLiteral(value: string) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

/** A pin or represented-master hint names an exact catalogue row. */
function legacyTarget(token: string, params: CompareSearchParams) {
  const { slug, variantKey } = parseCompareToken(token);
  if (
    slug.includes('..') ||
    slug.endsWith('.') ||
    (!variantKey && !validMasterSlug(slug))
  )
    return null;
  const value = params[`variant.${token.toLowerCase()}`];
  const hint = (Array.isArray(value) ? value[0] : value)?.toLowerCase() ?? '';
  const hasHint = validMasterSlug(hint);
  const suffix =
    variantKey && variantKey !== 'standard' && !slug.endsWith(`-${variantKey}`)
      ? `-${variantKey}`
      : '';
  const master = hasHint ? hint : slug + suffix;
  return validMasterSlug(master)
    ? { slug, master, bare: !variantKey && !hasHint }
    : null;
}

// The picker only holds 50 rows. Check the published catalogue for the exact
// slug and every conventional size, including variants outside that window.
async function readUniqueCompareMaster(alias: string): Promise<string | null> {
  const db = getRateClient();
  const pattern = `^${regexLiteral(alias)}(${ITEM_VARIANT_SLUG_SUFFIX})?$`;
  const { data, error, count } = await db
    .from('master_products')
    .select('slug,model_key', { count: 'exact' })
    .eq('status', 'published')
    .regexMatch('slug', pattern)
    .limit(1);
  if (error) throw new RateDataUnavailableError('compare alias', error);
  const candidate = data?.[0];
  if (
    count !== 1 ||
    !candidate ||
    candidate.slug === alias ||
    !validMasterSlug(candidate.slug)
  )
    return null;

  // M1 groups by the first two model_key segments. A missing segment is
  // empty, including on legacy keys with no colons. A retail slug can differ.
  const [brand, model] = candidate.model_key.split(':', 2);
  if (!brand) return null;
  const family = model
    ? `^${regexLiteral(brand + ':' + model)}(:|$)`
    : `^${regexLiteral(brand)}($|:$|::)`;
  const { data: siblings, error: siblingError } = await db
    .from('master_products')
    .select('slug')
    .eq('status', 'published')
    .regexMatch('model_key', family)
    .neq('slug', candidate.slug)
    .limit(1);
  if (siblingError)
    throw new RateDataUnavailableError('compare siblings', siblingError);
  return siblings?.length === 0 ? candidate.slug : null;
}

const getUniqueCompareMaster = cache(
  withRateDataCache(readUniqueCompareMaster, ['rate-compare-bare-alias'], {
    revalidate: 300,
    tags: [RATE_CACHE_TAGS.PRODUCTS],
  })
);
const log = createLogger('server.item-compare');

const getPublishedCompareItem = cache((id: string) =>
  whenItemModel('compare pin owner', () => getItemById(id))
);

async function readItemComparison(
  targets: { variantSlug: string; itemId: string | null }[]
) {
  // Compare cache keys are limited to 120 characters. A truncated slug
  // could name a different published master.
  const selection = dedupeCompareTargets(targets)
    .map((target) => target.variantSlug)
    .filter((slug) => validMasterSlug(slug.toLowerCase()));
  const products = await getCachedCompareMasterProducts(selection.join(','));
  const publishedOwners = new Set(targets.map((target) => target.itemId));
  const seenOwners = new Set<string>();
  const duplicateSlugs = new Set<string>();
  for (const product of products) {
    // An old alias and a current Item slug can name two of its masters.
    // Check publication only for a repeated owner; draft Items stay unlinked.
    const owner = 'item_id' in product ? product.item_id : null;
    if (typeof owner !== 'string' || !owner) continue;
    if (
      seenOwners.has(owner) &&
      (publishedOwners.has(owner) || (await getPublishedCompareItem(owner)))
    ) {
      duplicateSlugs.add(product.slug);
    }
    seenOwners.add(owner);
  }
  return {
    products: products.filter((product) => !duplicateSlugs.has(product.slug)),
    resolvedSelection: selection.filter(
      (slug) => !duplicateSlugs.has(slug.toLowerCase())
    ),
  };
}

/** Read full comparison rows in URL order, without relying on the visitor's tray. */
export async function getRequestedComparison(
  tokens: readonly string[],
  params: CompareSearchParams
) {
  if (!tokens.length) return { products: [], resolvedSelection: undefined };
  const itemTargets = await resolveCompareTargets(
    tokens,
    (pin) => legacyTarget(pin, params)?.master
  );
  if (itemTargets !== null) {
    return readItemComparison(itemTargets);
  }

  const seen = new Set<string>();
  const targets = tokens.flatMap((token) => {
    const target = legacyTarget(token, params);
    if (!target || seen.has(target.slug)) return [];
    seen.add(target.slug);
    return [target];
  });
  const direct = targets.map((target) => target.master).join(',');
  const exact = await getCachedCompareMasterProducts(direct);
  const found = new Set(exact.map((row) => row.slug));
  const slugs = await Promise.all(
    targets.map(async ({ master, bare }) => {
      if (!bare || found.has(master)) return master;
      try {
        return (await getUniqueCompareMaster(master)) ?? master;
      } catch (err) {
        log.warn('compare alias lookup failed', {
          slug: master,
          message: String(err),
        });
        return master;
      }
    })
  );
  // A recovered first column sets the category. Reapply the category lock to
  // the complete selection instead of appending recovered rows to the matrix.
  const selection = slugs.join(',');
  const products =
    selection === direct
      ? exact
      : await getCachedCompareMasterProducts(selection);
  return { products, resolvedSelection: null };
}

/** Initial columns and picker candidates for a visit to the compare page. */
export async function getComparePageSelection(params: CompareSearchParams) {
  const tokens = parseCompareSlugs(params.slugs);
  const [catalogCandidates, { products, resolvedSelection }] =
    await Promise.all([
      getCachedMasterProducts({ categorySlug: 'all', limit: 50 }),
      getRequestedComparison(tokens, params),
    ]);
  const categoryParam = compareCategoryParam(params);
  const defaultCategory = isCanonicalCategorySlug(categoryParam)
    ? categoryParam
    : 'smartphones';
  const activeCategory = products[0]
    ? getMasterProductCategorySlug(products[0])
    : defaultCategory;
  const hasExplicitSlugs = tokens.length > 0;
  const initialProducts = hasExplicitSlugs
    ? products
    : catalogCandidates
        .filter(
          (product) => getMasterProductCategorySlug(product) === activeCategory
        )
        .slice(0, 3);
  return {
    catalogCandidates,
    activeCategory,
    initialProducts,
    hasExplicitSlugs,
    resolvedSelection,
  };
}
