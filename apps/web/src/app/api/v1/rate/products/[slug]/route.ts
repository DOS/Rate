import { NextRequest, NextResponse } from 'next/server';
import {
  getCachedMasterProductBySlug,
  getCachedMasterProductOffers,
  getCachedMasterProductPriceHistory,
  getCachedMasterProductReviews,
  getCachedMasterProductReviewSummary,
} from '@/server/rate';
import { computeProductRadarSignal } from '@/server/rate/deals';
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

    const product = await getCachedMasterProductBySlug(cleanSlug);

    if (!product) {
      return NextResponse.json(
        { ok: false, error: 'Product not found', code: 'NOT_FOUND' },
        { status: 404, headers: PUBLIC_API_CORS_HEADERS }
      );
    }

    const [offers, reviews] = await Promise.all([
      getCachedMasterProductOffers(product.id),
      getCachedMasterProductReviews(product.id),
    ]);

    const [reviewSummary, priceHistory] = await Promise.all([
      getCachedMasterProductReviewSummary(product.id, reviews),
      getCachedMasterProductPriceHistory(product.id, offers),
    ]);
    const radarSignal = computeProductRadarSignal(product, offers);

    return NextResponse.json(
      {
        ok: true,
        data: {
          product,
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
