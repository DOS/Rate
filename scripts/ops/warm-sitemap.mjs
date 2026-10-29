#!/usr/bin/env node
// Warms the pages in a site's sitemap after a promote, so visitors do not pay
// the cold render: Vercel keeps ISR per deployment, so every page is cold after
// a promote and a product page MISS takes 5-6 s (DOS/Rate#1344, #1352).
// Optional step after verify-live, Docs/Resources/RELEASE.md step 7.
//
//   node scripts/ops/warm-sitemap.mjs --base-url https://rate.vn
//     [--concurrency 4] [--timeout 30] [--check]
//
// Read-only: plain GETs without credentials or cookies, only to sitemap URLs
// on the --base-url origin and without a query string, at most 4 at a time;
// redirects are not followed, so no request leaves that origin. A request that
// fails (timeout, network error, 5xx) is retried once; the sitemap itself too,
// since it renders cold like any page. Prints one line per URL (status,
// X-Vercel-Cache, time to first byte, and x-vercel-mitigated when Vercel
// challenged the request) and a summary. --check reads every URL once more
// and lists those not cached yet.
//
// Exit 1 only on a real error: a URL still failing after its retry, a 4xx, or
// a sitemap that cannot be read. A 5xx or timeout on the first (cold) request
// that the retry answers is expected and only counted. Exit 2 on bad arguments.

import { parseArgs } from 'node:util';
import { fail, isMain } from './lib.mjs';

export const MAX_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_S = 30;
const USER_AGENT = 'rate-warm-sitemap (+https://github.com/DOS/Rate)';
// X-Vercel-Cache values of a page served from the cache.
const CACHED = /^(HIT|STALE|PRERENDER|REVALIDATED)$/i;

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Whether the XML is a sitemap index (its <loc>s are other sitemaps, not pages). */
export const isSitemapIndex = (xml) => /<sitemapindex[\s>]/i.test(xml);

/** The sitemap's page URLs on `baseUrl`'s origin, without query strings, deduplicated. */
export function sitemapUrls(xml, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const urls = new Set();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    let url;
    try {
      url = new URL(decodeEntities(m[1]));
    } catch {
      continue;
    }
    if (url.origin !== origin || url.search || url.username || url.password)
      continue;
    url.hash = '';
    urls.add(url.href);
  }
  return [...urls];
}

/**
 * The outcome of one URL from its attempts ({ status } or { error }):
 * 'ok' (2xx/3xx first time), 'cold' (first attempt failed with a 5xx,
 * a timeout or a network error, the retry succeeded), 'error' otherwise.
 */
export function classify(attempts) {
  const okStatus = (a) => a.status >= 200 && a.status < 400;
  const [first, second] = attempts;
  if (first && okStatus(first)) return 'ok';
  if (first && first.status >= 400 && first.status < 500) return 'error';
  return second && okStatus(second) ? 'cold' : 'error';
}

/** Should a first attempt be retried: a timeout, a network error or a 5xx. */
export const retryable = (attempt) =>
  Boolean(attempt.error) || attempt.status >= 500;

/** Runs `fn` over `items`, at most `limit` at a time, keeping the input order. */
export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

/**
 * One GET: status, X-Vercel-Cache, x-vercel-mitigated and time to first byte
 * (and the body when `keepBody`), or the error. Redirects are not followed.
 */
export async function getOnce(
  url,
  {
    timeoutMs,
    fetchImpl = fetch,
    now = () => performance.now(),
    keepBody = false,
  }
) {
  const start = now();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      credentials: 'omit',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ttfbMs = Math.round(now() - start);
    // Read the body so the render completes and is cached.
    const body = keepBody
      ? await res.text()
      : (await res.arrayBuffer(), undefined);
    const mitigated = res.headers.get('x-vercel-mitigated');
    return {
      status: res.status,
      cache: res.headers.get('x-vercel-cache') ?? '-',
      ttfbMs,
      ...(mitigated ? { mitigated } : {}),
      ...(keepBody ? { body } : {}),
    };
  } catch (err) {
    return {
      error:
        err?.name === 'TimeoutError' ? 'timeout' : String(err?.message ?? err),
    };
  }
}

/** GET with one retry on a timeout, a network error or a 5xx. */
export async function warmUrl(url, opts) {
  const attempts = [await getOnce(url, opts)];
  if (retryable(attempts[0])) attempts.push(await getOnce(url, opts));
  return { url, attempts, outcome: classify(attempts) };
}

const describe = (a) =>
  a.error
    ? a.error
    : `${a.status} ${a.cache} ${a.ttfbMs} ms${a.mitigated ? ` (x-vercel-mitigated: ${a.mitigated})` : ''}`;

/** One printed line per URL. */
export const formatResult = (r) =>
  `${r.outcome.padEnd(5)} ${r.attempts.map(describe).join(' -> ')}  ${r.url}`;

/** Counts per outcome. */
export function summarize(results) {
  const count = { ok: 0, cold: 0, error: 0 };
  for (const r of results) count[r.outcome] += 1;
  return count;
}

/** A check that failed: an error, or a 4xx/5xx whatever its cache header. */
const checkFailed = (c) =>
  Boolean(c.error) || !(c.status >= 200 && c.status < 400);

/** The URLs a check pass found failing (they make the run exit 1). */
export const checkErrors = (checks) =>
  checks.filter(checkFailed).map((c) => c.url);

/** The URLs a check pass found answering but not served from the cache yet. */
export const notCached = (checks) =>
  checks
    .filter((c) => !checkFailed(c) && !CACHED.test(c.cache))
    .map((c) => c.url);

/**
 * The sitemap's XML, read with the same single retry as a page; an error
 * message instead when it cannot be read.
 */
export async function readSitemap(url, opts) {
  const { attempts, outcome } = await warmUrl(url, { ...opts, keepBody: true });
  const last = attempts[attempts.length - 1];
  if (outcome === 'error' || last.status !== 200) {
    return {
      error: `cannot read ${url}: ${attempts.map(describe).join(' -> ')}`,
    };
  }
  return { xml: last.body };
}

function usage(message) {
  console.error(message);
  console.error(
    'usage: node scripts/ops/warm-sitemap.mjs --base-url https://rate.vn [--concurrency 4] [--timeout 30] [--check]'
  );
  process.exit(2);
}

async function main() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      concurrency: { type: 'string', default: String(MAX_CONCURRENCY) },
      timeout: { type: 'string', default: String(DEFAULT_TIMEOUT_S) },
      check: { type: 'boolean', default: false },
    },
  });
  if (!values['base-url'])
    usage('--base-url is required (the host is never assumed)');
  let base;
  try {
    base = new URL(values['base-url']);
  } catch {
    usage(`--base-url is not a URL: ${values['base-url']}`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !local) {
    usage('--base-url must be https (or a local host)');
  }
  const concurrency = Number(values.concurrency);
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > MAX_CONCURRENCY
  ) {
    usage(`--concurrency must be 1 to ${MAX_CONCURRENCY}`);
  }
  const timeoutS = Number(values.timeout);
  if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > 120) {
    usage('--timeout must be a whole number of seconds from 1 to 120');
  }
  const opts = { timeoutMs: timeoutS * 1000 };

  const sitemapUrl = new URL('/sitemap.xml', base.origin).href;
  const sitemap = await readSitemap(sitemapUrl, opts);
  if (sitemap.error) fail(sitemap.error);
  if (isSitemapIndex(sitemap.xml)) {
    fail(
      `${sitemapUrl} is a sitemap index; pass the site whose sitemap lists pages`
    );
  }
  const urls = sitemapUrls(sitemap.xml, base.origin);
  if (urls.length === 0) fail(`no page URL on ${base.origin} in ${sitemapUrl}`);
  console.log(
    `Warming ${urls.length} URLs from ${sitemapUrl}, ${concurrency} at a time`
  );
  const started = Date.now();
  const results = await mapPool(urls, concurrency, async (url) => {
    const r = await warmUrl(url, opts);
    console.log(formatResult(r));
    return r;
  });
  const count = summarize(results);
  console.log(
    `Summary: ${urls.length} URLs in ${Math.round((Date.now() - started) / 1000)} s: ${count.ok} ok, ${count.cold} cold (5xx or timeout, then ok), ${count.error} error`
  );

  if (values.check) {
    const checks = await mapPool(urls, concurrency, async (url) => ({
      url,
      ...(await getOnce(url, opts)),
    }));
    const failed = checkErrors(checks);
    const pending = notCached(checks);
    const cached = urls.length - failed.length - pending.length;
    console.log(
      `Check: ${cached}/${urls.length} served from the cache${pending.length ? `; not yet: ${pending.join(' ')}` : ''}${failed.length ? `; failing: ${failed.join(' ')}` : ''}`
    );
    count.error += failed.length;
  }
  // exitCode, not exit(): let piped stdout flush.
  process.exitCode = count.error > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) {
  await main();
}
