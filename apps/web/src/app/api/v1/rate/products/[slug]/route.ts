import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCachedMasterProductPriceHistory,
  getCachedMasterProductReviews,
  getCachedMasterProductReviewSummary,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
import { isOfferUnavailable } from '@/lib/product-market-stats';
import { getMasterProductCategorySlug } from '@/lib/rate-domain';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { listingCountForSaleState, saleStateOfMaster } from '@/lib/sale-state';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
} from '@/server/rate/api-handler';
import {
  buildApiItemFields,
  resolveApiItemContext,
} from '@/server/rate/item-api';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

/**
 * GET /api/v1/rate/products/[slug]
 * Returns canonical Master Product (10 Field Groups), cross-platform merchant offers,
 * time-series Price History + Fake Discount Detection, and JReviews Dual-Rating & AI Review Summary.
 * Designed for Rate Web UI, Rate Browser Extension (MV3), and ecosystem consumers.
 * The product carries the category's spec view, as rate.vn shows it: no
 * screen, RAM, storage or camera for earbuds and no 5G for a watch
 * (DOS/Rate#1166).
 * With `RATE_ITEM_MODEL` on, the slug may be an Item's or an old variant's;
 * `product` is the selected variant (`?v=`, the slug's own, else the Item's
 * default) and the response adds `item`, `variants`, `selected_variant` and
 * `unknown_variant_offers` (DOS/Rate#1158). With the flag off the response
 * is unchanged.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const cleanSlug = (slug ?? '').trim();
    if (
      !cleanSlug ||
      cleanSlug.length > 120 ||
      !/^[a-zA-Z0-9._-]+$/.test(cleanSlug)
    ) {
      return jsonApiError(
        400,
        'Invalid product slug',
        undefined,
        PUBLIC_API_CORS_HEADERS
      );
    }

    let itemContext = await resolveApiItemContext(
      cleanSlug,
      request.nextUrl?.searchParams?.get('v')
    );
    // Read before the product, so missing Item columns fall back to the
    // whole response as before, not only to fewer fields.
    const itemFields = itemContext
      ? await buildApiItemFields(itemContext)
      : null;
    if (!itemFields) itemContext = null;
    const storedProduct = await getCachedMasterProductBySlug(
      itemContext ? itemContext.selected.slug : cleanSlug
    );

    if (!storedProduct) {
      return NextResponse.json(
        { ok: false, error: 'Product not found', code: 'NOT_FOUND' },
        { status: 404, headers: PUBLIC_API_CORS_HEADERS }
      );
    }

    const product = applyCategorySpecTemplate(
      getMasterProductCategorySlug(storedProduct),
      storedProduct
    );
    const [offers, reviews] = await Promise.all([
      getCachedMasterProductOffers(product.id),
      getCachedMasterProductReviews(product.id),
    ]);

    const [reviewSummary, priceHistory] = await Promise.all([
      getCachedMasterProductReviewSummary(product.id, reviews),
      getCachedMasterProductPriceHistory(product.id, offers),
    ]);
    // A sold-out listing's last price is no deal (DOS/Rate#1141).
    const radarSignal = computeProductRadarSignal(
      product,
      offers.filter((o) => !isOfferUnavailable(o))
    );

    return NextResponse.json(
      {
        ok: true,
        data: {
          // Why there is no price, when there is none (DOS/Rate#1188).
          product: {
            ...product,
            sale_state: saleStateOfMaster(
              product,
              listingCountForSaleState(
                offers.length,
                offers.filter((o) => !isOfferUnavailable(o)).length
              )
            ),
          },
          offers,
          priceHistory,
          reviewSummary,
          reviews,
          radarSignal,
          ...(itemFields ?? {}),
        },
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
      'Failed to fetch product detail',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
