import { NextResponse, type NextRequest } from 'next/server';
import { buildRateOpenApiSpec } from '@/server/rate/openapi';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin || 'https://rate.vn';
  const spec = buildRateOpenApiSpec(origin);

  return NextResponse.json(spec, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  });
}
