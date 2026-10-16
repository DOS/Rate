import { NextResponse } from 'next/server';
import { buildRateOpenApiSpec } from '@/server/rate/openapi';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const serverOrigin = `${url.protocol}//${url.host}`;
    const spec = buildRateOpenApiSpec(serverOrigin);

    return NextResponse.json(spec, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[API /api/v1/rate/openapi] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
