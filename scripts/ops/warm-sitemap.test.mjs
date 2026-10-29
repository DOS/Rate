import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classify,
  getOnce,
  mapPool,
  MAX_CONCURRENCY,
  notCached,
  sitemapUrls,
  summarize,
  warmUrl,
} from './warm-sitemap.mjs';

const BASE = 'https://rate.vn';

test('reads the page URLs of the base origin only, without query strings', () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://rate.vn/</loc></url>
    <url><loc> https://rate.vn/smartphones </loc></url>
    <url><loc>https://rate.vn/smartphones</loc></url>
    <url><loc>https://rate.vn/compare?a=1&amp;b=2</loc></url>
    <url><loc>https://evil.example/x</loc></url>
    <url><loc>http://rate.vn/insecure</loc></url>
    <url><loc>https://user:pw@rate.vn/x</loc></url>
    <url><loc>not a url</loc></url>
    <url><loc>https://rate.vn/merchants/abc#top</loc></url>
  </urlset>`;
  assert.deepEqual(sitemapUrls(xml, BASE), [
    'https://rate.vn/',
    'https://rate.vn/smartphones',
    'https://rate.vn/merchants/abc',
  ]);
});

test('a first 5xx or timeout that the retry answers is cold, not an error', () => {
  assert.equal(classify([{ status: 200 }]), 'ok');
  assert.equal(classify([{ status: 308 }]), 'ok');
  assert.equal(classify([{ status: 504 }, { status: 200 }]), 'cold');
  assert.equal(classify([{ error: 'timeout' }, { status: 200 }]), 'cold');
  assert.equal(classify([{ status: 500 }, { status: 502 }]), 'error');
  assert.equal(classify([{ error: 'timeout' }, { error: 'timeout' }]), 'error');
  assert.equal(classify([{ status: 404 }]), 'error');
});

test('a 5xx is retried once and a 4xx is not', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const status =
      url.endsWith('/cold') && calls.length === 1
        ? 504
        : url.endsWith('/gone')
          ? 404
          : 200;
    return new Response('x', { status, headers: { 'x-vercel-cache': 'MISS' } });
  };
  const cold = await warmUrl(`${BASE}/cold`, { timeoutMs: 1000, fetchImpl });
  assert.equal(cold.outcome, 'cold');
  assert.equal(calls.length, 2);
  // Read-only and anonymous: a GET with no credentials or auth header.
  for (const c of calls) {
    assert.equal(c.init.method, 'GET');
    assert.equal(c.init.credentials, 'omit');
    assert.equal(c.init.body, undefined);
    assert.equal('authorization' in c.init.headers, false);
    assert.equal('cookie' in c.init.headers, false);
  }
  calls.length = 0;
  const gone = await warmUrl(`${BASE}/gone`, { timeoutMs: 1000, fetchImpl });
  assert.equal(gone.outcome, 'error');
  assert.equal(calls.length, 1, 'no retry on a 4xx');
});

test('a timeout is reported as such', async () => {
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    });
  const r = await getOnce(`${BASE}/slow`, { timeoutMs: 20, fetchImpl });
  assert.deepEqual(r, { error: 'timeout' });
});

test('never more than the given number of requests at once, results in order', async () => {
  let active = 0;
  let peak = 0;
  const out = await mapPool(
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    MAX_CONCURRENCY,
    async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return n * 2;
    }
  );
  assert.equal(peak, MAX_CONCURRENCY);
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14, 16, 18]);
});

test('summary and the check pass', () => {
  assert.deepEqual(
    summarize([
      { outcome: 'ok' },
      { outcome: 'cold' },
      { outcome: 'ok' },
      { outcome: 'error' },
    ]),
    { ok: 2, cold: 1, error: 1 }
  );
  assert.deepEqual(
    notCached([
      { url: 'a', cache: 'HIT' },
      { url: 'b', cache: 'STALE' },
      { url: 'c', cache: 'MISS' },
      { url: 'd', error: 'timeout' },
    ]),
    ['c', 'd']
  );
});
