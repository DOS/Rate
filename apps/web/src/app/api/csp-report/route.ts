import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('csp');

// Browsers post a few hundred bytes; anything larger is not a report.
const MAX_REPORT_BYTES = 8 * 1024;

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

/**
 * POST /api/csp-report: violation reports of the report-only Content Security
 * Policy (DOS/Rate#1311). Logged without query strings, so the report window
 * can be read from the logs before the policy is enforced. Always 204.
 */
export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > MAX_REPORT_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
    const text = (await request.text()).slice(0, MAX_REPORT_BYTES);
    const parsed = JSON.parse(text) as {
      'csp-report'?: Record<string, unknown>;
    };
    const report = parsed?.['csp-report'];
    if (report && typeof report === 'object') {
      log.warn('csp violation', {
        directive: String(
          report['effective-directive'] ?? report['violated-directive'] ?? ''
        ).slice(0, 60),
        blocked: shortUrl(report['blocked-uri']),
        page: shortUrl(report['document-uri']),
        source: shortUrl(report['source-file']),
        line: Number(report['line-number']) || undefined,
      });
    }
  } catch {
    // Not a report: nothing to log.
  }
  return new NextResponse(null, { status: 204 });
}
