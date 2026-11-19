import { NextRequest, NextResponse } from 'next/server';
import { productRatingScore5 } from '@/lib/rate-domain';
import {
  getCachedCompareMasterProducts,
  getCachedMasterProductBySlug,
  getMasterProductCategorySlug,
  getMasterProductHref,
  getMasterProductOffersBatch,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import { radarExportFields } from '@/lib/deal-radar';
import { isOfferUnavailable } from '@/lib/product-market-stats';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { listingCountForSaleState, saleStateOfMaster } from '@/lib/sale-state';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
  parseCompareSlugsParam,
  splitComparePinToken,
} from '@/server/rate/api-handler';
import {
  compareTarget,
  lookupSlugAnyCase,
  type CompareResolution,
} from '@/lib/item-compare';
import { resolveCompareSlugs } from '@/server/rate/item-compare';
import { whenItemModel } from '@/server/rate/item-directory';
import {
  getCachedCatalogSlugResolution,
  getCachedItemVariants,
} from '@/server/rate/item-route';

const ITEM_RESOLVER_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;

async function resolveCompareEntries(
  requestedTokens: readonly string[]
): Promise<
  Array<{
    requested: string;
    variantSlug: string | null;
    deduplicated: boolean;
  }>
> {
  if ((await resolveCompareSlugs([])) === null) {
    return requestedTokens.map((requested) => ({
      requested,
      variantSlug: requested,
      deduplicated: false,
    }));
  }

  const resolved = await whenItemModel('compare route tokens', async () => {
    const rawTargets = await Promise.all(
      requestedTokens.map(async (requested) => {
        const typed = splitComparePinToken(requested, true);
        const lower = splitComparePinToken(requested, false);
        if (!ITEM_RESOLVER_SLUG_REGEX.test(typed.slug)) {
          return typed.variantKey === null
            ? {
                requested,
                target: {
                  variantSlug: lower.slug,
                  itemId: null,
                  itemSlug: null,
                },
              }
            : { requested, target: null };
        }
        const found = await lookupSlugAnyCase(
          typed.slug,
          getCachedCatalogSlugResolution
        );
        const catalogRes = found.found;
        const cmpRes: CompareResolution =
          !catalogRes || catalogRes.kind === 'unlinked'
            ? { kind: 'unlinked' }
            : catalogRes.kind === 'item'
              ? {
                  kind: 'item',
                  item: catalogRes.item,
                  variants: await getCachedItemVariants(catalogRes.item),
                }
              : {
                  kind: 'variant',
                  item: catalogRes.item,
                  variant: catalogRes.variant,
                  variants: await getCachedItemVariants(catalogRes.item),
                  retired: catalogRes.retired,
                };
        return {
          requested,
          target: compareTarget(cmpRes, lower),
        };
      })
    );

    const seenItems = new Set<string>();
    const seenVariantSlugs = new Set<string>();
    return rawTargets.map(({ requested, target }) => {
      if (!target) {
        return { requested, variantSlug: null, deduplicated: false };
      }
      const lowerVariantSlug = target.variantSlug.toLowerCase();
      if (
        seenVariantSlugs.has(lowerVariantSlug) ||
        (target.itemId !== null && seenItems.has(target.itemId))
      ) {
        return {
          requested,
          variantSlug: target.variantSlug,
          deduplicated: true,
        };
      }
      seenVariantSlugs.add(lowerVariantSlug);
      if (target.itemId !== null) seenItems.add(target.itemId);
      return {
        requested,
        variantSlug: target.variantSlug,
        deduplicated: false,
      };
    });
  });

  return (
    resolved ??
    requestedTokens.map((requested) => ({
      requested,
      variantSlug: requested,
      deduplicated: false,
    }))
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/compare?slugs=slug1,slug2
 * Returns side-by-side 10-Field-Groups comparison data for 2 to 4 Master Products
 * strictly locked to the same canonical category (Same-Category Comparison Lock).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const slugs = parseCompareSlugsParam(sp.get('slugs'), 4);

    if (slugs.length === 0) {
      return jsonApiError(
        400,
        'Missing or invalid ?slugs= parameter (provide 1 to 4 comma-separated master product slugs)',
        undefined,
        PUBLIC_API_CORS_HEADERS
      );
    }

    const resolvedEntries = await resolveCompareEntries(slugs);
    const comparedSlugs = resolvedEntries
      .filter(
        (
          entry
        ): entry is {
          requested: string;
          variantSlug: string;
          deduplicated: boolean;
        } => !entry.deduplicated && entry.variantSlug !== null
      )
      .map((entry) => entry.variantSlug);
    const products =
      comparedSlugs.length > 0
        ? await getCachedCompareMasterProducts(comparedSlugs.join(','))
        : [];
    // Slugs are looked up lowercased, so `IPhone-16` came back as `iphone-16`.
    const returnedSlugSet = new Set(products.map((p) => p.slug.toLowerCase()));
    const lockedCategory = products[0]
      ? getMasterProductCategorySlug(products[0])
      : null;
    // A requested slug that did not come back is either a published product
    // of another category, dropped by the lock, or no published product at
    // all (DOS/Rate#1364). Report the caller's original token in the exclusions.
    const missingEntries = resolvedEntries.filter(
      (entry) =>
        !entry.deduplicated &&
        (entry.variantSlug === null ||
          !returnedSlugSet.has(entry.variantSlug.toLowerCase()))
    );
    const [offersByMasterId, missingFound] = await Promise.all([
      getMasterProductOffersBatch(products.map((p) => p.id)),
      Promise.all(
        missingEntries.map((entry) =>
          entry.variantSlug === null
            ? Promise.resolve(false)
            : getCachedMasterProductBySlug(entry.variantSlug).then(
                (product) => product !== null,
                () => true
              )
        )
      ),
    ]);
    const excludedCrossCategorySlugs = missingEntries
      .filter((_, i) => missingFound[i])
      .map((entry) => entry.requested);
    const notFoundSlugs = missingEntries
      .filter((_, i) => !missingFound[i])
      .map((entry) => entry.requested);

    return NextResponse.json(
      {
        ok: true,
        count: products.length,
        locked_category: lockedCategory,
        requested_slugs: slugs,
        excluded_cross_category_slugs: excludedCrossCategorySlugs,
        not_found_slugs: notFoundSlugs,
        data: products.map((p) => {
          const offers = offersByMasterId.get(p.id) ?? [];
          return {
            // The category's spec view, as /compare shows it (DOS/Rate#1166).
            ...applyCategorySpecTemplate(lockedCategory, p),
            canonical_href: getMasterProductHref(p),
            rating_score_5: productRatingScore5(p),
            deal_radar: radarExportFields(computeProductRadarSignal(p, offers)),
            sale_state: saleStateOfMaster(
              p,
              listingCountForSaleState(
                offers.length,
                offers.filter((o) => !isOfferUnavailable(o)).length
              )
            ),
          };
        }),
      },
      {
        status: 200,
        headers: {
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to compare products',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
