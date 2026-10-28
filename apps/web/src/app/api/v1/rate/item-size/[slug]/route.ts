import { NextResponse } from 'next/server';
import { loadItemSizePanel } from '@/server/rate/item-page';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
} from '@/server/rate/api-handler';

// Cached like the product pages: the route reads nothing from the request but
// its path, so each size's answer is cached and refreshed every 5 minutes.
export const revalidate = 300;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/v1/rate/item-size/{variant slug}
 * One size of an Item page, loaded when the size is picked on an Item with
 * many sizes (DOS/Rate#1285): its price strip data, history and offers. Only
 * while `RATE_ITEM_MODEL` is on; 404 otherwise.
 */
export async function GET(_request: Request, context: RouteContext) {
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
    const data = await loadItemSizePanel(cleanSlug);
    if (!data) {
      return NextResponse.json(
        { ok: false, error: 'Product not found', code: 'NOT_FOUND' },
        { status: 404, headers: PUBLIC_API_CORS_HEADERS }
      );
    }
    return NextResponse.json(
      { ok: true, data },
      {
        status: 200,
        headers: {
          ...PUBLIC_API_CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    return jsonApiError(
      500,
      'Failed to load the size',
      error,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
