import { NextRequest, NextResponse } from 'next/server';
import {
  getMasterProductBySlug,
  getMasterProductOffers,
  getMasterProductPriceHistory,
  getMasterProductReviews,
  getMasterProductReviewSummary,
} from '@/lib/rate-api';
import { computeProductRadarSignal } from '@/server/rate/deals';

type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/v1/rate/products/[slug]
 * Returns canonical Master Product (10 Field Groups), cross-platform merchant offers,
 * time-series Price History + Fake Discount Detection, and JReviews Dual-Rating & AI Review Summary.
 * Designed for Rate Web UI, Rate Browser Extension (MV3), and ecosystem consumers.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const product = await getMasterProductBySlug(slug);

    if (!product) {
      return NextResponse.json(
        { ok: false, error: 'Product not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const [offers, reviews] = await Promise.all([
      getMasterProductOffers(product.id),
      getMasterProductReviews(product.id),
    ]);

    const [reviewSummary, priceHistory] = await Promise.all([
      getMasterProductReviewSummary(product.id, reviews),
      getMasterProductPriceHistory(product.id, offers),
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
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
