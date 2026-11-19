import 'server-only';
import { cache } from 'react';
import { parseCompareToken } from '@/lib/item-compare';
import { createLogger } from '@/lib/logger';
import { getRateClient, RateDataUnavailableError } from '@/lib/rate-api';
import {
  getCachedCompareMasterProducts,
  sanitizeCachedProductSlug,
} from './index';
import { RATE_CACHE_TAGS, withRateDataCache } from './cache-tags';
import { resolveCompareSlugs } from './item-compare';
import { ITEM_VARIANT_SLUG_SUFFIX } from './item-model';

type CompareSearchParams = Record<string, string | string[] | undefined>;

function validMasterSlug(slug: string) {
  return slug.length > 0 && sanitizeCachedProductSlug(slug) === slug;
}

function regexLiteral(value: string) {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

/** Keep the first requested size per Item. Pins and represented-master hints are exact. */
function legacyTargets(tokens: readonly string[], params: CompareSearchParams) {
  const seen = new Set<string>();
  const targets: Array<{ master: string; bare: boolean }> = [];
  for (const token of tokens) {
    const { slug, variantKey } = parseCompareToken(token);
    if (
      seen.has(slug) ||
      slug.includes('..') ||
      slug.endsWith('.') ||
      (!variantKey && !validMasterSlug(slug))
    )
      continue;
    const value = params[`variant.${token.toLowerCase()}`];
    const hint = (Array.isArray(value) ? value[0] : value)?.toLowerCase() ?? '';
    const hasHint = validMasterSlug(hint);
    const suffix =
      variantKey &&
      variantKey !== 'standard' &&
      !slug.endsWith(`-${variantKey}`)
        ? `-${variantKey}`
        : '';
    const master = hasHint ? hint : slug + suffix;
    if (!validMasterSlug(master)) continue;
    seen.add(slug);
    targets.push({ master, bare: !variantKey && !hasHint });
  }
  return targets;
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

/** Read full comparison rows in URL order, without relying on the visitor's tray. */
export async function getRequestedComparison(
  tokens: string[],
  params: CompareSearchParams
) {
  if (!tokens.length) return { products: [], resolvedSelection: undefined };
  const resolvedSelection = await resolveCompareSlugs(tokens);
  if (resolvedSelection !== null) {
    return {
      products: await getCachedCompareMasterProducts(
        resolvedSelection.join(',')
      ),
      resolvedSelection,
    };
  }

  const targets = legacyTargets(tokens, params);
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
  return { products, resolvedSelection };
}
