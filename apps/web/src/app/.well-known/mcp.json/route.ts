import { NextResponse } from 'next/server';
import {
  MCP_DISCOVERY_CORS_HEADERS,
  buildRateWellKnownMcpDescriptor,
} from '@/server/rate/mcp';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(buildRateWellKnownMcpDescriptor(), {
    status: 200,
    headers: {
      ...MCP_DISCOVERY_CORS_HEADERS,
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
