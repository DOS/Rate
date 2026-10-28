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
import { saleStateOfMaster } from '@/lib/sale-state';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
} from '@/server/rate/api-handler';

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
 */
export async function GET(_request: NextRequest, context: RouteContext) {
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

    const storedProduct = await getCachedMasterProductBySlug(cleanSlug);

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
          product: { ...product, sale_state: saleStateOfMaster(product) },
          offers,
          priceHistory,
          reviewSummary,
          reviews,
          radarSignal,
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
