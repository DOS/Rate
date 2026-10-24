import assert from 'node:assert/strict';
import { fetchAllPages, parseShopeeEnqueueUrl, resolveBackfillSupabaseTarget } from '../paging.js';
import { mergeKeySpecs, sanitizeKeySpecKey } from '../jobs/backfill-specs.js';

// A fake query over `total` rows that, like PostgREST, never returns more than
// `maxRows` per response whatever range is asked for.
function fakeTable(total: number, maxRows: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + maxRows);
    return Promise.resolve({ data: rows.slice(from, end), error: null });
  };
  return { page, calls };
}

async function run() {
  console.log('🧪 fetchAllPages & parseShopeeEnqueueUrl suite');

  const big = fakeTable(2500, 1000);
  const all = await fetchAllPages('rows', big.page);
  assert.equal(all.length, 2500, 'reads every row past the 1000-row cap');
  assert.deepEqual(all.at(-1), { id: 2500 });
  assert.equal(big.calls.length, 4, '3 full or partial pages, then the empty page');

  // max-rows lowered below the page size: still complete, just more requests.
  const lowered = fakeTable(1200, 500);
  assert.equal((await fetchAllPages('rows', lowered.page)).length, 1200);

  assert.deepEqual(await fetchAllPages('rows', fakeTable(0, 1000).page), []);

  await assert.rejects(
    fetchAllPages('Failed to read', () =>
      Promise.resolve({ data: null, error: { message: 'boom' } })
    ),
    /Failed to read: boom/
  );

  // Exact boundary: 3 non-empty pages followed by an empty page with maxPages=3 succeeds
  const exactBoundary = fakeTable(30, 10);
  const boundaryRows = await fetchAllPages('boundary', exactBoundary.page, 10, 3);
  assert.equal(boundaryRows.length, 30);

  // Server ignoring .range() and always returning non-empty rows throws after maxPages
  await assert.rejects(
    fetchAllPages('broken_range', () => Promise.resolve({ data: [{ id: 1 }], error: null }), 10, 3),
    /broken_range: exceeded maxPages \(3\)/
  );

  // parseShopeeEnqueueUrl tests (#393)
  assert.deepEqual(
    parseShopeeEnqueueUrl('https://shopee.vn/Điện-thoại-Apple-iPhone-16-i.88201679.27110898667'),
    {
      shopId: '88201679',
      itemId: '27110898667',
      normalizedUrl:
        'https://shopee.vn/%C4%90i%E1%BB%87n-tho%E1%BA%A1i-Apple-iPhone-16-i.88201679.27110898667',
    }
  );
  assert.deepEqual(parseShopeeEnqueueUrl('https://shopee.vn/product/88201679/27110898667'), {
    shopId: '88201679',
    itemId: '27110898667',
    normalizedUrl: 'https://shopee.vn/product/88201679/27110898667',
  });
  assert.deepEqual(parseShopeeEnqueueUrl('https://shopee.vn/opaanlp/88201679/27110898667'), {
    shopId: '88201679',
    itemId: '27110898667',
    normalizedUrl: 'https://shopee.vn/opaanlp/88201679/27110898667',
  });
  assert.equal(
    parseShopeeEnqueueUrl('https://evil.com/i.88201679.27110898667'),
    null,
    'must reject non-Shopee host'
  );
  assert.equal(
    parseShopeeEnqueueUrl('javascript:alert(1)//i.88201679.27110898667'),
    null,
    'must reject non-HTTP(S) scheme'
  );
  assert.equal(
    parseShopeeEnqueueUrl('https://user:pass@shopee.vn/product/88201679/27110898667'),
    null,
    'must reject URLs with embedded userinfo credentials (#838)'
  );
  assert.equal(
    parseShopeeEnqueueUrl('https://shopee.vn/product/0/27110898667'),
    null,
    'must reject zero shopId (#838)'
  );
  assert.equal(
    parseShopeeEnqueueUrl('https://shopee.vn/product/88201679/0'),
    null,
    'must reject zero itemId (#838)'
  );
  assert.equal(
    parseShopeeEnqueueUrl('https://shopee.vn/product/88201679/123456789012345678901'),
    null,
    'must reject oversized >20-digit itemId (#838)'
  );

  // Oversized pageSize is clamped to 1000 (#838)
  const clampedCalls: Array<[number, number]> = [];
  await fetchAllPages(
    'clamped',
    (from, to) => {
      clampedCalls.push([from, to]);
      return Promise.resolve({ data: [], error: null });
    },
    999_999
  );
  assert.deepEqual(clampedCalls, [[0, 999]], 'fetchAllPages must clamp pageSize at 1000');

  // Issue #873: non-array data, boolean pageSize/maxPages, C1 control chars, port check & resolveBackfillSupabaseTarget
  const nonArrayRes = await fetchAllPages(
    'non-array\u0000label',
    () => Promise.resolve({ data: { notAnArray: true } as unknown as never[], error: null }),
    true as unknown as number,
    true as unknown as number
  );
  assert.deepEqual(nonArrayRes, []);

  assert.equal(
    parseShopeeEnqueueUrl('https://shopee.vn:8443/product/88201679/27110898667'),
    null,
    'must reject non-standard port (#873)'
  );
  assert.equal(
    parseShopeeEnqueueUrl('https://shopee.vn/product/88201679/27110898667\u0085'),
    null,
    'must reject C1 Unicode control characters (#873)'
  );

  assert.deepEqual(resolveBackfillSupabaseTarget('  https://example.supabase.co/rest/v1  '), {
    url: 'https://example.supabase.co',
    host: 'example.supabase.co',
  });
  assert.throws(
    () => resolveBackfillSupabaseTarget('https://user:pass@example.supabase.co'),
    /embedded credentials/,
    'resolveBackfillSupabaseTarget must reject embedded credentials'
  );
  assert.throws(
    () => resolveBackfillSupabaseTarget('ftp://example.supabase.co'),
    /http:\/\/ or https:\/\//
  );

  assert.equal(sanitizeKeySpecKey('chip\u0085name'), 'chip name');
  assert.deepEqual(mergeKeySpecs({ a: 'val\u0085one' }, { __proto__: 'bad', b: 'ok' }), {
    a: 'val one',
    b: 'ok',
  });

  console.log('✅ fetchAllPages & parseShopeeEnqueueUrl suite passed');
}

run().catch(err => {
  console.error('❌ fetchAllPages suite failed:', err);
  process.exit(1);
});
