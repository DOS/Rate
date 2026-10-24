import { NextResponse } from 'next/server';
import { checkDatabase } from '@/server/health';

export const dynamic = 'force-dynamic';

// 503 when the app cannot read its database, so an uptime monitor sees an
// outage that only uncached pages would otherwise show (DOS/Rate#829).
export async function GET() {
  const database = await checkDatabase();
  const healthy = database === 'ok';
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'rate-web',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      // The Git commit this deployment was built from, so a release check can
      // compare it with main (scripts/ops/verify-live.mjs). Null off Vercel.
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      checks: { database },
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
