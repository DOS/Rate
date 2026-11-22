import { NextResponse } from 'next/server';
import { buildRateOpenApiSpec } from '@/server/rate/openapi';
import {
  PUBLIC_API_CORS_HEADERS,
  jsonApiError,
} from '@/server/rate/api-handler';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api.openapi');

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: PUBLIC_API_CORS_HEADERS,
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const serverOrigin = `${url.protocol}//${url.host}`;
    const spec = buildRateOpenApiSpec(serverOrigin);

    return NextResponse.json(spec, {
      status: 200,
      headers: {
        ...PUBLIC_API_CORS_HEADERS,
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    log.error('openapi build failed', { error: serializeError(err) });
    return jsonApiError(
      500,
      'Failed to build OpenAPI specification',
      err,
      PUBLIC_API_CORS_HEADERS
    );
  }
}
