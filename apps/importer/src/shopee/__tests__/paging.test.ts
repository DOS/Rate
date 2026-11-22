import assert from 'node:assert/strict';
import {
  fetchAllPages,
  fetchByKey,
  parseShopeeEnqueueUrl,
  parseStrictMasterUuid,
  resolveBackfillSupabaseTarget,
} from '../paging.js';
import { auditMasterSpecs, mergeKeySpecs, sanitizeKeySpecKey } from '../jobs/backfill-specs.js';

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

  // Issue #910: non-function buildPage, nullish page response, control chars in error.message,
  // non-string sanitizeKeySpecKey, cyclic/non-plain objects in mergeKeySpecs, and auditMasterSpecs label sanitization
  await assert.rejects(
    fetchAllPages('bad_builder', null as unknown as never),
    /bad_builder: buildPage must be a function/
  );
  assert.deepEqual(
    await fetchAllPages('null_page', () => Promise.resolve(null as unknown as never)),
    []
  );
  await assert.rejects(
    fetchAllPages('ctrl_err', () =>
      Promise.resolve({ data: null, error: { message: 'db\u0007\u0085failure' } })
    ),
    /ctrl_err: db failure/
  );

  assert.equal(sanitizeKeySpecKey(123 as unknown as string), null);
  const cyclicSpec: Record<string, unknown> = { valid: 'ok' };
  cyclicSpec.self = cyclicSpec;
  const cyclicArr: unknown[] = ['item1'];
  cyclicArr.push(cyclicArr);
  cyclicSpec.arr = cyclicArr;
  cyclicSpec.dateObj = new Date(0);
  const sharedLeaf = { sub: 'shared' };
  cyclicSpec.refA = sharedLeaf;
  cyclicSpec.refB = sharedLeaf;
  assert.deepEqual(mergeKeySpecs(cyclicSpec, new Date(0) as unknown as Record<string, unknown>), {
    valid: 'ok',
    arr: ['item1'],
    refA: { sub: 'shared' },
    refB: { sub: 'shared' },
  });

  await assert.rejects(
    auditMasterSpecs({
      from: () => {
        let after: string | null = null;
        const builder = {
          select: () => builder,
          gt: (_col: string, val: string) => {
            after = val;
            return builder;
          },
          order: () => builder,
          limit: () =>
            Promise.resolve({
              data:
                after === null
                  ? [
                      null,
                      {
                        id: 'm1',
                        name: 'Phone\u0000\u0085X',
                        model_key: 'phone\u0007-x',
                        specifications: null,
                      },
                    ]
                  : [],
              error: null,
            }),
        };
        return builder;
      },
    } as never),
    /Phone X \(phone -x\) failed ProductSpecificationsSchema validation/
  );

  // Issue #1002: arena-spec-syncer URL/camera/meta guards, paging dot/query/hash checks, and merchant-review-risk ID/boolean bounds
  assert.equal(
    parseShopeeEnqueueUrl('https://..shopee.vn/product/88201679/27110898667'),
    null,
    'must reject consecutive dots in Shopee hostname (#1002)'
  );
  assert.equal(
    parseShopeeEnqueueUrl('https://.shopee.vn/product/88201679/27110898667'),
    null,
    'must reject leading dot in Shopee hostname (#1002)'
  );
  assert.throws(
    () => resolveBackfillSupabaseTarget('https://example..supabase.co'),
    /invalid hostname/,
    'must reject consecutive dots in Supabase hostname (#1002)'
  );
  assert.throws(
    () => resolveBackfillSupabaseTarget('https://example.supabase.co?foo=1'),
    /query parameters or fragments/,
    'must reject query parameters in Supabase target URL (#1002)'
  );
  assert.throws(
    () => resolveBackfillSupabaseTarget('https://example.supabase.co#frag'),
    /query parameters or fragments/,
    'must reject fragments in Supabase target URL (#1002)'
  );

  const { parseGsmArenaHtmlToSpecs, splitCameraModulesToPhoneArenaFormat } =
    await import('../arena-spec-syncer.js');
  const camModules = splitCameraModulesToPhoneArenaFormat(
    '50 MP\u0000\u0085 wide\n12 MP\u0007 ultrawide'
  );
  assert.equal(camModules.main_camera, '50 MP wide');
  assert.equal(camModules.second_camera, '12 MP ultrawide');
  const specFromArrayMeta = parseGsmArenaHtmlToSpecs(
    '<h1 data-spec="modelname">Apple iPhone 16</h1>',
    [] as unknown as { gsmarenaUrl?: string }
  );
  assert.equal(specFromArrayMeta.source, 'gsmarena');

  const { mapStoredReview, uniqueIds } = await import('../merchant-review-risk.js');
  assert.deepEqual(uniqueIds(['valid-id', 'id with spaces', '  another-id  ']), [
    'another-id',
    'valid-id',
  ]);
  const mappedNonBool = mapStoredReview({
    id: 'rev-1',
    product_id: 'prod-1',
    rating_star: 5,
    comment: 'Great phone',
    review_flags: {
      verdict: 'fake',
      flag_category: 'seeding_fake',
      include_in_rating: 'true' as unknown as boolean,
    },
  });
  assert.equal(mappedNonBool?.result.include_in_rating, false);

  // Issue #1665: keyset fetchByKey pagination (past 1000 rows, past 500 pages, concurrent insert safety) & parseStrictMasterUuid
  {
    const keysetRows = Array.from({ length: 2350 }, (_, i) => ({
      id: `row-${String(i + 1).padStart(5, '0')}`,
      seq: i + 1,
    }));
    const cursors: Array<string | null> = [];
    const keysetClient = {
      from: (table: string) => {
        assert.equal(table, 'items_test');
        let current = [...keysetRows];
        let after: string | null = null;
        const builder = {
          select: () => builder,
          gt: (col: string, val: string) => {
            assert.equal(col, 'id');
            after = val;
            current = current.filter(r => r.id > val);
            return builder;
          },
          order: (col: string) => {
            assert.equal(col, 'id');
            current.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            return builder;
          },
          limit: (n: number) => {
            cursors.push(after);
            // Concurrent crawl write inserts a row BEFORE the current cursor after page 1:
            // OFFSET paging would shift page 2 and duplicate row-01000, whereas keyset ignores it.
            if (cursors.length === 1) {
              keysetRows.unshift({ id: 'row-00000', seq: 0 });
            }
            return Promise.resolve({ data: current.slice(0, Math.min(n, 1000)), error: null });
          },
        };
        return builder;
      },
    };
    const fetched = await fetchByKey<{ id: string; seq: number }>(
      keysetClient as never,
      'items_test',
      'id, seq',
      'id'
    );
    assert.equal(fetched.length, 2350, 'keyset reads all 2350 rows without duplicating row-01000');
    assert.deepEqual(cursors, [null, 'row-01000', 'row-02000']);
    assert.equal(new Set(fetched.map(r => r.id)).size, 2350);

    // Exceeds the old 500-page OFFSET ceiling cleanly (550 keyset pages at pageSize=2)
    const manyPagesRows = Array.from({ length: 1101 }, (_, i) => ({
      id: `k-${String(i + 1).padStart(5, '0')}`,
    }));
    const manyPagesClient = {
      from: () => {
        let current = [...manyPagesRows];
        const builder = {
          select: () => builder,
          gt: (_col: string, val: string) => {
            current = current.filter(r => r.id > val);
            return builder;
          },
          order: () => builder,
          limit: (n: number) => Promise.resolve({ data: current.slice(0, n), error: null }),
        };
        return builder;
      },
    };
    const over500Pages = await fetchByKey<{ id: string }>(
      manyPagesClient as never,
      'deep_table',
      'id',
      'id',
      q => q,
      2
    );
    assert.equal(over500Pages.length, 1101, 'fetchByKey has no 500-page ceiling');

    // Fails closed if tail row lacks key or cursor fails to advance
    const missingKeyClient = {
      from: () => {
        const builder = {
          select: () => builder,
          gt: () => builder,
          order: () => builder,
          limit: () => Promise.resolve({ data: [{ other: 'a' }, { other: 'b' }], error: null }),
        };
        return builder;
      },
    };
    await assert.rejects(
      fetchByKey(missingKeyClient as never, 'bad_cols', 'other', 'id', q => q, 2),
      /bad_cols: missing key "id" on page tail row/
    );

    const stuckCursorClient = {
      from: () => {
        const builder = {
          select: () => builder,
          gt: () => builder, // broken mock ignores .gt()
          order: () => builder,
          limit: () => Promise.resolve({ data: [{ id: 'a' }, { id: 'b' }], error: null }),
        };
        return builder;
      },
    };
    await assert.rejects(
      fetchByKey(stuckCursorClient as never, 'stuck_table', 'id', 'id', q => q, 2),
      /stuck_table: keyset cursor "id" did not advance past "b"/
    );

    // parseStrictMasterUuid normalizes valid UUIDs and rejects malformed values
    assert.equal(
      parseStrictMasterUuid('A0000000-0000-4000-8000-000000000001'),
      'a0000000-0000-4000-8000-000000000001'
    );
    for (const bad of [
      '',
      '   ',
      'not-a-uuid',
      ' a0000000-0000-4000-8000-000000000001 ',
      null,
      42,
    ]) {
      assert.throws(() => parseStrictMasterUuid(bad), /UUID/);
    }
  }

  console.log('✅ fetchAllPages, fetchByKey & parseShopeeEnqueueUrl suite passed');
}

run().catch(err => {
  console.error('❌ fetchAllPages suite failed:', err);
  process.exit(1);
});
