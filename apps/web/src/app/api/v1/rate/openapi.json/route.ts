import { NextResponse, type NextRequest } from 'next/server';
import { buildRateOpenApiSpec } from '@/server/rate/openapi';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
} from '@/server/rate/api-handler';

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl?.origin || 'https://rate.vn';
    const spec = buildRateOpenApiSpec(origin);

    return NextResponse.json(spec, {
      status: 200,
      headers: {
        ...PUBLIC_API_CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    return jsonApiError(
      500,
      'Failed to build OpenAPI specification',
      err,
      PUBLIC_API_CORS_HEADERS
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}
