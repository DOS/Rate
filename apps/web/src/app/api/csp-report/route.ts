import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('csp');

// Browsers post a few hundred bytes; anything larger is not a report.
const MAX_REPORT_BYTES = 8 * 1024;
// One log line per distinct violation per window and instance, at most this many
// distinct ones: an endpoint anyone can post to must not flood the logs.
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const MAX_DISTINCT = 200;
const seen = new Map<string, number>();

/** The path of a URL, or the scheme/keyword a CSP report gives ("inline", "eval"). */
function shortUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 200);
  } catch {
    return value.slice(0, 40);
  }
}

/** The body as text, or null once it passes `limit` bytes (stops reading there). */
async function readCapped(
  request: Request,
  limit: number
): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** True the first time a key is seen in the window, while the table has room. */
function firstInWindow(key: string, now: number): boolean {
  const last = seen.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  if (last === undefined && seen.size >= MAX_DISTINCT) {
    for (const [k, t] of seen) {
      if (now - t >= DEDUPE_WINDOW_MS) seen.delete(k);
    }
    if (seen.size >= MAX_DISTINCT) return false;
  }
  seen.set(key, now);
  return true;
}

/**
 * POST /api/csp-report: violation reports of the report-only Content Security
 * Policy (DOS/Rate#1311). A report needs a directive and a page on this site's
 * origin; each distinct one is logged once per window, without query strings, so
 * the report window can be read from the logs before the policy is enforced.
 * Always 204.
 */
export async function POST(request: Request) {
  try {
    const text = await readCapped(request, MAX_REPORT_BYTES);
    if (!text) return new NextResponse(null, { status: 204 });
    const parsed = JSON.parse(text) as {
      'csp-report'?: Record<string, unknown>;
    };
    const report = parsed?.['csp-report'];
    if (!report || typeof report !== 'object') {
      return new NextResponse(null, { status: 204 });
    }
    const directive = String(
      report['effective-directive'] ?? report['violated-directive'] ?? ''
    ).slice(0, 60);
    const page = shortUrl(report['document-uri']);
    const origin = new URL(request.url).origin;
    if (!/^[a-z-]+$/.test(directive) || !page?.startsWith(`${origin}/`)) {
      return new NextResponse(null, { status: 204 });
    }
    const blocked = shortUrl(report['blocked-uri']);
    const source = shortUrl(report['source-file']);
    if (
      firstInWindow(`${directive}|${blocked}|${page}|${source}`, Date.now())
    ) {
      log.warn('csp violation', {
        directive,
        blocked,
        page,
        source,
        line: Number(report['line-number']) || undefined,
      });
    }
  } catch {
    // Not a report: nothing to log.
  }
  return new NextResponse(null, { status: 204 });
}
