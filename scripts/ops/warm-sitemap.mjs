#!/usr/bin/env node
// Warms the pages in a site's sitemap after a promote, so visitors do not pay
// the cold render: Vercel keeps ISR per deployment, so every page is cold after
// a promote and a product page MISS takes 5-6 s (DOS/Rate#1344, #1352).
// Optional step after verify-live, Docs/Resources/RELEASE.md step 6.
//
//   node scripts/ops/warm-sitemap.mjs --base-url https://rate.vn
//     [--concurrency 4] [--timeout 30] [--check]
//
// Read-only: plain GETs without credentials or cookies, only to sitemap URLs
// on the --base-url origin and without a query string, at most 4 at a time.
// A request that fails (timeout, network error, 5xx) is retried once. Prints
// one line per URL (status, X-Vercel-Cache, time to first byte) and a summary.
// --check reads every URL once more and reports which do not answer HIT or
// STALE yet.
//
// Exit 1 only on a real error: a URL still failing after its retry, a 4xx, or
// an unreadable sitemap. A 5xx on the first (cold) request that the retry
// answers is expected and only counted.

import { parseArgs } from 'node:util';
import { isMain } from './lib.mjs';

export const MAX_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_S = 30;
const USER_AGENT = 'rate-warm-sitemap (+https://github.com/DOS/Rate)';

/** The sitemap's page URLs on `baseUrl`'s origin, without query strings, deduplicated. */
export function sitemapUrls(xml, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const urls = new Set();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const raw = m[1].replace(/&amp;/g, '&');
    let url;
    try {
      url = new URL(raw);
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

/** One GET: status, X-Vercel-Cache and time to first byte, or the error. */
export async function getOnce(
  url,
  { timeoutMs, fetchImpl = fetch, now = () => performance.now() }
) {
  const start = now();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ttfbMs = Math.round(now() - start);
    // Read the body so the render completes and is cached.
    await res.arrayBuffer();
    return {
      status: res.status,
      cache: res.headers.get('x-vercel-cache') ?? '-',
      ttfbMs,
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
  a.error ? a.error : `${a.status} ${a.cache} ${a.ttfbMs} ms`;

/** One printed line per URL. */
export const formatResult = (r) =>
  `${r.outcome.padEnd(5)} ${r.attempts.map(describe).join(' -> ')}  ${r.url}`;

/** Counts per outcome. */
export function summarize(results) {
  const count = { ok: 0, cold: 0, error: 0 };
  for (const r of results) count[r.outcome] += 1;
  return count;
}

/** The URLs a check pass found not cached yet (not HIT or STALE, or failed). */
export const notCached = (checks) =>
  checks
    .filter((c) => c.error || !/^(HIT|STALE)$/i.test(c.cache))
    .map((c) => c.url);

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
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    usage('--base-url must be https (or localhost)');
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
  if (!Number.isFinite(timeoutS) || timeoutS <= 0 || timeoutS > 120) {
    usage('--timeout must be 1 to 120 seconds');
  }
  const opts = { timeoutMs: timeoutS * 1000 };

  const sitemapUrl = new URL('/sitemap.xml', base.origin).href;
  const sitemap = await getSitemap(sitemapUrl, opts);
  const urls = sitemapUrls(sitemap, base.origin);
  if (urls.length === 0) {
    console.error(`no page URL on ${base.origin} in ${sitemapUrl}`);
    process.exit(1);
  }
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
    const pending = notCached(checks);
    console.log(
      `Check: ${urls.length - pending.length}/${urls.length} answer HIT or STALE${pending.length ? `; not yet: ${pending.join(' ')}` : ''}`
    );
  }
  process.exit(count.error > 0 ? 1 : 0);
}

async function getSitemap(url, opts) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    credentials: 'omit',
    signal: AbortSignal.timeout(opts.timeoutMs),
  }).catch((err) => {
    console.error(`cannot read ${url}: ${err?.message ?? err}`);
    process.exit(1);
  });
  if (res.status !== 200) {
    console.error(`cannot read ${url}: HTTP ${res.status}`);
    process.exit(1);
  }
  return res.text();
}

if (isMain(import.meta.url)) {
  await main();
}
