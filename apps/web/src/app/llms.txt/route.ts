import { NextResponse } from 'next/server';
import {
  MCP_DISCOVERY_CORS_HEADERS,
  buildRateLlmsTxt,
} from '@/server/rate/mcp';

export const dynamic = 'force-static';

export async function GET() {
  return new NextResponse(buildRateLlmsTxt(), {
    status: 200,
    headers: {
      ...MCP_DISCOVERY_CORS_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
