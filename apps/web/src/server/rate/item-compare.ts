import 'server-only';
import {
  compareTarget,
  dedupeCompareTargets,
  lookupSlugAnyCase,
  parseCompareToken,
  pickItemVariant,
  planVersusRoute,
  type CompareResolution,
  type VersusPlan,
} from '@/lib/item-compare';
import { whenItemModel } from './item-directory';
import {
  getCachedCatalogSlugResolution,
  getCachedItemVariants,
} from './item-route';

// Compare, versus and watchlist per Item while `RATE_ITEM_MODEL` is on
// (DOS/Rate#1156). Off, or with the Item tables missing or failing, every
// helper returns null and the caller does exactly what it did before.

// Capitals allowed: an Item slug may carry them, and the catalogue lookup is
// exact (DOS/Rate#1383).
const SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;

async function resolveSlugAnyCase(
  slug: string
): Promise<{ slug: string; resolution: CompareResolution }> {
  if (!SLUG_REGEX.test(slug)) return { slug, resolution: null };
  // As typed, then lower-cased: the catalogue lookup is exact (#1383).
  const found = await lookupSlugAnyCase(slug, getCachedCatalogSlugResolution);
  return {
    slug: found.slug,
    resolution: await toCompareResolution(found.found),
  };
}

async function resolveSlug(slug: string): Promise<CompareResolution> {
  return (await resolveSlugAnyCase(slug)).resolution;
}

async function toCompareResolution(
  resolution: Awaited<ReturnType<typeof getCachedCatalogSlugResolution>>
): Promise<CompareResolution> {
  // No published Item for this slug: it compares as a plain master, as with
  // the flag off (a master of a draft Item, or an unknown slug that the
  // compare read then drops) (#1275).
  if (!resolution) return { kind: 'unlinked' };
  if (resolution.kind === 'unlinked') return { kind: 'unlinked' };
  const variants = await getCachedItemVariants(resolution.item);
  return resolution.kind === 'item'
    ? { kind: 'item', item: resolution.item, variants }
    : {
        kind: 'variant',
        item: resolution.item,
        variant: resolution.variant,
        variants,
        retired: resolution.retired,
      };
}

/**
 * The variant slugs to compare for the requested tokens (Item or variant
 * slugs, `slug@256gb` pinning a size), one per Item, in request order; null
 * while the Item model is off.
 */
export function resolveCompareSlugs(
  tokens: readonly string[]
): Promise<string[] | null> {
  return whenItemModel('compare slugs', async () => {
    const targets = await Promise.all(
      tokens.map(async (raw) => {
        const token = parseCompareToken(raw);
        // Looked up as typed, then lower-cased (#1383).
        const typed = parseCompareToken(raw, true).slug;
        return compareTarget(await resolveSlug(typed), token);
      })
    );
    return dedupeCompareTargets(targets).map((t) => t.variantSlug);
  });
}

/** The versus route for two URL slugs; null while the Item model is off. */
export function resolveVersusPlan(
  slugA: string,
  slugB: string
): Promise<VersusPlan | null> {
  return whenItemModel('versus route', async () => {
    // Each side is looked up as typed, then lower-cased, and is planned under
    // the slug it was found under, so an unlinked side keeps the case the
    // compare read knows (DOS/Rate#1383).
    const [sideA, sideB] = await Promise.all([
      resolveSlugAnyCase(parseCompareToken(slugA, true).slug),
      resolveSlugAnyCase(parseCompareToken(slugB, true).slug),
    ]);
    const plan = planVersusRoute(sideA, sideB);
    return plan.kind === 'legacy' ? null : plan;
  });
}

/**
 * The variant a watchlist slug watches. Alerts stay per size (Q5): an old
 * variant slug watches its size, an Item with one size that size, and an
 * Item with several needs a size first (`sizeRequired`, with its default
 * size for the price shown meanwhile). Null while the Item model is off or
 * the slug is no Item.
 */
export function resolveWatchlistSlug(
  slug: string
): Promise<{ variantSlug: string; sizeRequired: boolean } | null> {
  return whenItemModel('watchlist slug', async () => {
    const resolution = await resolveSlug(slug);
    if (!resolution || resolution.kind === 'unlinked') return null;
    if (resolution.kind === 'variant' && !resolution.retired) {
      return { variantSlug: resolution.variant.slug, sizeRequired: false };
    }
    const { item, variants } = resolution;
    // An Item may share its slug with one of its sizes (design doc 5.1):
    // that size is the one watched, as before the Item model.
    const sameSlug = variants.find((v) => v.slug === slug);
    if (resolution.kind === 'item' && sameSlug) {
      return { variantSlug: sameSlug.slug, sizeRequired: false };
    }
    const shown = pickItemVariant(item, variants, null);
    // A retired size is never swapped for another one silently: the alert
    // was for that size, so a size is asked for again (review round 1).
    const retired = resolution.kind === 'variant';
    return shown
      ? {
          variantSlug: shown.slug,
          sizeRequired: retired || variants.length > 1,
        }
      : null;
  });
}
