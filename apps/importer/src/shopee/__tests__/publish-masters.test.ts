/**
 * DOS/Rate#1756 & DOS/Rate#1918:
 * 1. Seed mode (unchanged): flips only named flagship seed drafts that carry their
 *    seed's licensed image and full specs, checks --expect before its first write, and
 *    writes with a status/slug/thumbnail guard.
 * 2. Crawled mode (--crawled): audits and publishes Wave E1-E4 crawled drafts with
 *    wave-aware rules (E1/E3 product + images + active listing; E2 service + PCT/VND
 *    listing, no image requirement; E4 place + place_details, no image/listing
 *    requirement), deterministic --limit, --expect, and optimistic concurrency guard.
 * All database access here is a stand-in.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SOURCED_SEEDS_IPHONE_17E } from '../flagship-seed-sourced-iphone-17e.js';
import { seedMasterSpecUpdate } from '../jobs/backfill-specs.js';
import {
  WAVE_E_ALL_CATEGORY_SLUGS,
  crawledPublishBlockers,
  parsePublishMastersArgs,
  publishBlockers,
  publishSeedMastersWith,
  runCrawledPublish,
  type CrawledMasterRow,
} from '../jobs/publish-masters.js';
import type { RateSupabaseClient } from '../types.js';

const KEYS = ['apple:iphone-17e:256gb', 'apple:iphone-17e:512gb'] as const;
const realSeeds = KEYS.map(k => SOURCED_SEEDS_IPHONE_17E.find(s => s.model_key === k)!);
/** The 17e seeds as they would be with a licensed photo (the job's happy path). */
const SAMPLE_IMAGE = '/img/devices/sample-phone.jpg';
const seeds = realSeeds.map(s => ({ ...s, images: [SAMPLE_IMAGE] }));

/** A 17e master as the scoped backfill apply would leave it: a draft with the seed's image. */
function draftRow(i: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = seeds[i]!;
  return {
    id: `id-${i}`,
    model_key: seed.model_key,
    slug: seed.slug,
    status: 'draft',
    category_id: 'cat-1',
    images: [...seed.images],
    thumbnail: seed.images[0],
    specifications: seedMasterSpecUpdate(null, seed).specifications,
    ...overrides,
  };
}

/**
 * A stand-in for the rate-scoped client over `master_products`: `select ... eq(model_key)
 * .maybeSingle()` reads and `update(...).eq('id').eq('status').select('id')` writes.
 */
function tableClient(rows: Array<Record<string, unknown>>, onWrite?: () => void) {
  const writes: Array<{ id: unknown; status: unknown; payload: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let payload: Record<string, unknown> | undefined;
      const matching = () => rows.filter(r => filters.every(([c, v]) => r[c] === v));
      const builder = {
        select() {
          if (!payload) return builder;
          onWrite?.();
          const hit = matching();
          for (const row of hit) Object.assign(row, structuredClone(payload));
          writes.push({
            id: filters.find(([c]) => c === 'id')?.[1],
            status: filters.find(([c]) => c === 'status')?.[1],
            payload,
          });
          return Promise.resolve({ data: hit.map(r => ({ id: r.id })), error: null });
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        update(p: Record<string, unknown>) {
          payload = p;
          return builder;
        },
        maybeSingle() {
          if (table === 'categories') {
            const slug = filters.find(([c]) => c === 'slug')?.[1];
            return Promise.resolve({
              data: slug === 'smartphones' ? { id: 'cat-1' } : null,
              error: null,
            });
          }
          assert.equal(table, 'master_products');
          const hit = matching();
          return Promise.resolve({ data: hit[0] ? structuredClone(hit[0]) : null, error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as RateSupabaseClient, writes };
}

test('the 17e stays a draft: its seeds have no image, so the job refuses to publish it', async () => {
  for (const seed of realSeeds) assert.deepEqual(seed.images, []);
  const rows = [
    draftRow(0, { images: [], thumbnail: null }),
    draftRow(1, { images: [], thumbnail: null }),
  ];
  const { client, writes } = tableClient(rows);
  await assert.rejects(
    publishSeedMastersWith(client, { only: [...KEYS], apply: true, expect: 2 }),
    /Cannot publish \(2\), nothing written:[^]*the seed has no images/
  );
  assert.deepEqual(writes, []);
  assert.ok(rows.every(r => r.status === 'draft'));
});

test('parsePublishMastersArgs is strict', () => {
  assert.deepEqual(parsePublishMastersArgs(['--only', `${KEYS[0]},${KEYS[1]}`]), {
    only: [...KEYS],
    apply: false,
  });
  assert.deepEqual(
    parsePublishMastersArgs(['--only', ` ${KEYS[0]} ,${KEYS[0]}`, '--apply', '--expect', '1']),
    { only: [KEYS[0]], apply: true, expect: 1 }
  );
  assert.throws(() => parsePublishMastersArgs([]), /--only is required/);
  assert.throws(() => parsePublishMastersArgs(['--only', ',']), /at least one/);
  assert.throws(
    () => parsePublishMastersArgs(['--only', KEYS[0], '--apply']),
    /--apply needs --expect/
  );
  assert.throws(() => parsePublishMastersArgs(['--only=x']), /unknown argument/);
  assert.throws(() => parsePublishMastersArgs(['--only', KEYS[0], '--only', KEYS[1]]), /repeated/);
  assert.throws(() => parsePublishMastersArgs(['--only', '--apply']), /needs a value/);
  assert.throws(
    () => parsePublishMastersArgs(['--only', KEYS[0], '--expect', '2x']),
    /whole number/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--only', KEYS[0], '--publish']),
    /unknown argument/
  );
});

test('a dry run plans the two 17e drafts and writes nothing', async () => {
  const rows = [draftRow(0), draftRow(1)];
  const { client, writes } = tableClient(rows);
  const result = await publishSeedMastersWith(client, { seeds, only: [...KEYS], expect: 2 });
  assert.deepEqual(result, { planned: [...KEYS], alreadyPublished: [], published: 0 });
  assert.deepEqual(writes, []);
  assert.ok(rows.every(r => r.status === 'draft'));
});

test('an apply publishes exactly the named drafts with a status guard', async () => {
  const other: Record<string, unknown> = {
    ...draftRow(0),
    id: 'other',
    model_key: 'apple:iphone-16e:128gb',
    slug: 'x',
  };
  const rows = [draftRow(0), draftRow(1), other];
  const { client, writes } = tableClient(rows);
  const result = await publishSeedMastersWith(client, {
    seeds,
    only: [...KEYS],
    apply: true,
    expect: 2,
  });
  assert.equal(result.published, 2);
  assert.deepEqual(
    writes.map(w => [w.id, w.status, Object.keys(w.payload).sort()]),
    [
      ['id-0', 'draft', ['status', 'updated_at']],
      ['id-1', 'draft', ['status', 'updated_at']],
    ]
  );
  assert.equal(rows[0]!.status, 'published');
  assert.equal(rows[1]!.status, 'published');
  assert.equal(other.status, 'draft', 'an unnamed draft is untouched');
});

test('a re-run leaves published masters alone and needs --expect 0', async () => {
  const rows = [draftRow(0, { status: 'published' }), draftRow(1)];
  const { client, writes } = tableClient(rows);
  await assert.rejects(
    publishSeedMastersWith(client, { seeds, only: [...KEYS], apply: true, expect: 2 }),
    /does not match the plan \(1 draft/
  );
  assert.deepEqual(writes, []);
  const result = await publishSeedMastersWith(client, {
    seeds,
    only: [...KEYS],
    apply: true,
    expect: 1,
  });
  assert.deepEqual(result, { planned: [KEYS[1]], alreadyPublished: [KEYS[0]], published: 1 });
});

test('a draft without the seed image, specs or category stops the run before any write', async () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ images: [], thumbnail: null }, /run the scoped backfill-specs apply first/],
    [
      { images: ['https://cdn.example/x.jpg'], thumbnail: 'https://cdn.example/x.jpg' },
      /not the seed's/,
    ],
    [{ thumbnail: null }, /thumbnail null/],
    [{ category_id: null }, /no category/],
    [{ category_id: 'cat-tablets' }, /category "cat-tablets" is not "smartphones" \(cat-1\)/],
    [{ slug: 'apple-iphone-17e-256gb-1a2b3c4d' }, /is not the seed's/],
    [{ specifications: {} }, /missing specification group "availability"/],
    [{ status: 'archived' }, /status "archived" is not draft/],
  ];
  for (const [overrides, message] of cases) {
    const rows = [draftRow(0), draftRow(1, overrides)];
    const { client, writes } = tableClient(rows);
    await assert.rejects(
      publishSeedMastersWith(client, { seeds, only: [...KEYS], apply: true, expect: 2 }),
      message
    );
    assert.deepEqual(writes, [], `nothing written for ${JSON.stringify(overrides)}`);
    assert.equal(rows[0]!.status, 'draft');
  }
  const { client } = tableClient([draftRow(0)]);
  await assert.rejects(
    publishSeedMastersWith(client, { seeds, only: [...KEYS] }),
    /apple:iphone-17e:512gb: no master row/
  );
});

test('a phone draft with an empty camera group is never published (DOS/Rate#1787)', () => {
  const row = draftRow(0);
  const specs = row.specifications as Record<string, unknown>;
  const problems = publishBlockers(
    { ...row, specifications: { ...specs, camera: {} } } as never,
    seeds[0]!,
    'cat-1'
  );
  assert.ok(problems.includes('missing camera.main_camera'), problems.join('; '));
  assert.deepEqual(publishBlockers(row as never, seeds[0]!, 'cat-1'), []);
});

test('a seed with no images is never published', () => {
  const seed = realSeeds[0]!;
  assert.deepEqual(
    publishBlockers(draftRow(0, { images: [], thumbnail: null }) as never, seed, 'cat-1').filter(
      p => p.includes('image')
    ),
    ['the seed has no images']
  );
});

test('unknown keys and a missing --expect on apply fail before any read', async () => {
  let reads = 0;
  const client = {
    from() {
      reads++;
      throw new Error('no read expected');
    },
  } as unknown as RateSupabaseClient;
  await assert.rejects(
    publishSeedMastersWith(client, { seeds, only: ['apple:iphone-99:1tb'] }),
    /no seed/
  );
  await assert.rejects(
    publishSeedMastersWith(client, { seeds, only: [...KEYS], apply: true }),
    /apply needs expect/
  );
  assert.equal(reads, 0);
});

test('a status change between plan and write stops the run', async () => {
  const rows = [draftRow(0), draftRow(1)];
  let n = 0;
  const { client } = tableClient(rows, () => {
    // Someone archives the second master after the plan read it as a draft.
    if (++n === 2) rows[1]!.status = 'archived';
  });
  await assert.rejects(
    publishSeedMastersWith(client, { seeds, only: [...KEYS], apply: true, expect: 2 }),
    /touched 0 rows, not 1: its status, slug or thumbnail changed after the plan \(1 published before it\)/
  );
  assert.equal(rows[0]!.status, 'published');
  assert.equal(rows[1]!.status, 'archived');
});

test('a dry run with a mismatched --expect fails without writing', async () => {
  const rows = [draftRow(0), draftRow(1)];
  const { client, writes } = tableClient(rows);
  await assert.rejects(
    publishSeedMastersWith(client, { seeds, only: [...KEYS], expect: 1 }),
    /--expect 1 does not match the plan \(2 draft/
  );
  assert.deepEqual(writes, []);
});

test("an apply writes only while slug and thumbnail are still the seed's", async () => {
  const rows = [draftRow(0), draftRow(1)];
  let n = 0;
  const { client } = tableClient(rows, () => {
    // The image is replaced after the plan read it.
    if (++n === 1) rows[0]!.thumbnail = 'https://cdn.example/other.jpg';
  });
  await assert.rejects(
    publishSeedMastersWith(client, { seeds, only: [...KEYS], apply: true, expect: 2 }),
    /Publishing apple:iphone-17e:256gb touched 0 rows/
  );
  assert.equal(rows[0]!.status, 'draft');
  assert.equal(rows[1]!.status, 'draft');
});

// ============================================================================
// Crawled Wave E1-E4 mode tests (DOS/Rate#1918)
// ============================================================================

const CATEGORY_ID_BY_SLUG: Record<string, string> = {
  smartphones: 'cat-smartphones',
  tablets: 'cat-tablets',
  laptops: 'cat-laptops',
  smartwatches: 'cat-smartwatches',
  earbuds: 'cat-earbuds',
  tvs: 'cat-tvs',
  'air-conditioners': 'cat-ac',
  refrigerators: 'cat-fridge',
  'washing-machines': 'cat-washer',
  'air-purifiers': 'cat-purifier',
  'bank-savings': 'cat-bank-savings',
  'internet-telecom': 'cat-internet',
  supplements: 'cat-supplements',
  cosmetics: 'cat-cosmetics',
  'mother-baby': 'cat-mother-baby',
  restaurants: 'cat-restaurants',
  cafes: 'cat-cafes',
  hotels: 'cat-hotels',
  homestays: 'cat-homestays',
  'dental-clinics': 'cat-dental-clinics',
  'gyms-fitness': 'cat-gyms-fitness',
  'spas-aesthetics': 'cat-spas-aesthetics',
  'english-centers': 'cat-english-centers',
  'credit-cards': 'cat-credit-cards',
};

function makeCrawledMaster(
  overrides: Partial<CrawledMasterRow> = {},
  categorySlug = 'tvs'
): CrawledMasterRow {
  return {
    id: 'master-1',
    model_key: 'samsung:ua55du7000:unknown',
    slug: 'samsung-ua55du7000',
    name: 'Samsung Smart TV 55 inch UA55DU7000',
    brand: 'Samsung',
    status: 'draft',
    category_id: CATEGORY_ID_BY_SLUG[categorySlug] ?? 'cat-unknown',
    entity_type: 'product',
    images: ['https://cdn.rate.vn/tv-1.jpg'],
    thumbnail: 'https://cdn.rate.vn/tv-1.jpg',
    specifications: {
      category_slug: categorySlug,
      availability: { status: 'Available' },
    },
    ...overrides,
  };
}

function crawledMockDb(
  seed: {
    masters: ReadonlyArray<CrawledMasterRow | Record<string, unknown>>;
    products?: ReadonlyArray<Record<string, unknown>>;
    placeDetails?: ReadonlyArray<Record<string, unknown>>;
    categories?: ReadonlyArray<{ id: string; slug: string }>;
  },
  onUpdateAttempt?: (ctx: {
    id: unknown;
    filters: Array<[string, unknown]>;
    masters: Array<Record<string, unknown>>;
  }) => void
) {
  const categories: Array<Record<string, unknown>> = (
    seed.categories ?? Object.entries(CATEGORY_ID_BY_SLUG).map(([slug, id]) => ({ id, slug }))
  ).map(c => ({ ...c }));
  const masters: Array<Record<string, unknown>> = seed.masters.map(m => structuredClone({ ...m }));
  const products: Array<Record<string, unknown>> = (seed.products ?? []).map(p =>
    structuredClone(p)
  );
  const placeDetails: Array<Record<string, unknown>> = (seed.placeDetails ?? []).map(pd =>
    structuredClone(pd)
  );
  const writes: Array<{
    id: unknown;
    filters: Array<[string, unknown]>;
    payload: Record<string, unknown>;
  }> = [];
  const inBatchSizes: Array<{ table: string; column: string; size: number }> = [];

  function tableRows(table: string): Array<Record<string, unknown>> {
    if (table === 'categories') return categories;
    if (table === 'master_products') return masters;
    if (table === 'products') return products;
    if (table === 'place_details') return placeDetails;
    throw new Error(`Unexpected table ${table}`);
  }

  const client = {
    from(table: string) {
      const eqFilters: Array<[string, unknown]> = [];
      const inFilters: Array<[string, unknown[]]> = [];
      const gtFilters: Array<[string, string]> = [];
      let orderCol: string | undefined;
      let limitCount: number | undefined;
      let updatePayload: Record<string, unknown> | undefined;

      const applyFilters = (rows: Array<Record<string, unknown>>) => {
        let out = rows.filter(r => {
          const eqOk = eqFilters.every(([col, val]) => r[col] === val);
          if (!eqOk) return false;
          const inOk = inFilters.every(([col, vals]) => vals.includes(r[col]));
          if (!inOk) return false;
          const gtOk = gtFilters.every(([col, val]) => String(r[col] ?? '') > val);
          return gtOk;
        });
        if (orderCol) {
          const col = orderCol;
          out = [...out].sort((a, b) => {
            const av = String(a[col] ?? '');
            const bv = String(b[col] ?? '');
            return av < bv ? -1 : av > bv ? 1 : 0;
          });
        }
        if (limitCount !== undefined) {
          out = out.slice(0, limitCount);
        }
        return out;
      };

      const builder = {
        select() {
          if (updatePayload) {
            const targetId = eqFilters.find(([col]) => col === 'id')?.[1];
            onUpdateAttempt?.({ id: targetId, filters: [...eqFilters], masters });
            const matched = applyFilters(masters);
            for (const row of matched) {
              Object.assign(row, structuredClone(updatePayload));
            }
            writes.push({
              id: targetId,
              filters: [...eqFilters],
              payload: structuredClone(updatePayload),
            });
            return Promise.resolve({
              data: matched.map(r => ({ id: r.id })),
              error: null,
            });
          }
          return builder;
        },
        eq(column: string, value: unknown) {
          eqFilters.push([column, value]);
          return builder;
        },
        in(column: string, values: unknown[]) {
          inBatchSizes.push({ table, column, size: values.length });
          inFilters.push([column, values]);
          return builder;
        },
        gt(column: string, value: string) {
          gtFilters.push([column, value]);
          return builder;
        },
        order(column: string) {
          orderCol = column;
          return builder;
        },
        limit(count: number) {
          limitCount = count;
          return builder;
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          return builder;
        },
        then<TResult1 = { data: Array<Record<string, unknown>>; error: null }, TResult2 = never>(
          onfulfilled?:
            | ((value: {
                data: Array<Record<string, unknown>>;
                error: null;
              }) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          const res = {
            data: applyFilters(tableRows(table)).map(r => structuredClone(r)),
            error: null,
          };
          return Promise.resolve(res).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  };

  return {
    client: client as unknown as RateSupabaseClient,
    masters,
    writes,
    inBatchSizes,
  };
}

test('parsePublishMastersArgs handles --crawled flags and guards core tech categories', () => {
  assert.deepEqual(parsePublishMastersArgs(['--crawled']), {
    crawled: true,
    categories: [...WAVE_E_ALL_CATEGORY_SLUGS],
    rejectUnknownBrand: true,
    apply: false,
  });

  assert.deepEqual(
    parsePublishMastersArgs([
      '--crawled',
      '--category',
      ' tvs , cafes , tvs ',
      '--only',
      'samsung:ua55du7000:unknown',
      '--limit',
      '25',
      '--allow-unknown-brand',
      '--apply',
      '--expect',
      '3',
    ]),
    {
      crawled: true,
      categories: ['tvs', 'cafes'],
      only: ['samsung:ua55du7000:unknown'],
      limit: 25,
      rejectUnknownBrand: false,
      apply: true,
      expect: 3,
    }
  );

  assert.deepEqual(
    parsePublishMastersArgs(['--crawled', '--reject-unknown-brand', '--limit', '1000']),
    {
      crawled: true,
      categories: [...WAVE_E_ALL_CATEGORY_SLUGS],
      limit: 1000,
      rejectUnknownBrand: true,
      apply: false,
    }
  );

  for (const coreSlug of ['smartphones', 'tablets', 'laptops', 'smartwatches', 'earbuds']) {
    assert.throws(
      () => parsePublishMastersArgs(['--crawled', '--category', coreSlug]),
      /does not support core tech category.*strict seed mode --only/
    );
  }
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--category', 'tvs,smartphones']),
    /does not support core tech category/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--category', 'printers']),
    /unknown --crawled category/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--category', ',']),
    /at least one category slug/
  );
  assert.throws(() => parsePublishMastersArgs(['--crawled', '--apply']), /--apply needs --expect/);
  assert.throws(() => parsePublishMastersArgs(['--crawled', '--limit', '0']), /between 1 and 1000/);
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--limit', '1001']),
    /between 1 and 1000/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--limit', 'abc']),
    /--limit needs a whole number/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--limit', '99999999999999999999']),
    /safe whole number/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--expect', '99999999999999999999']),
    /safe whole number/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--only', KEYS[0], '--expect', '99999999999999999999']),
    /safe whole number/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--crawled', '--reject-unknown-brand', '--allow-unknown-brand']),
    /cannot combine/
  );
  assert.throws(() => parsePublishMastersArgs(['--crawled', '--crawled']), /--crawled is repeated/);
  assert.throws(
    () => parsePublishMastersArgs(['--category', 'tvs', '--only', KEYS[0]]),
    /--category requires --crawled/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--limit', '5', '--only', KEYS[0]]),
    /--limit requires --crawled/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--allow-unknown-brand', '--only', KEYS[0]]),
    /--allow-unknown-brand requires --crawled/
  );
  assert.throws(() => parsePublishMastersArgs(['--crawled', '--category=tvs']), /unknown argument/);
});

test('crawledPublishBlockers validates Wave E1 and Wave E3 products cleanly', () => {
  const e1Row = makeCrawledMaster({}, 'tvs');
  assert.deepEqual(
    crawledPublishBlockers(e1Row, {
      categorySlug: 'tvs',
      listings: [
        { price_current: 11_990_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
      ],
    }),
    []
  );

  const e3Row = makeCrawledMaster(
    {
      model_key: 'la-roche-posay:anthelios-50ml:unknown',
      slug: 'la-roche-posay-anthelios-50ml',
      name: 'Kem chong nang La Roche-Posay 50ml',
      brand: 'La Roche-Posay',
      category_id: 'cat-cosmetics',
      specifications: { category_slug: 'cosmetics', availability: { status: 'Available' } },
    },
    'cosmetics'
  );
  assert.deepEqual(
    crawledPublishBlockers(e3Row, {
      categorySlug: 'cosmetics',
      listings: [
        { price_current: 420_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
      ],
    }),
    []
  );

  // Missing thumbnail or empty/invalid images are blocked on Wave E1 & E3.
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ thumbnail: null }, 'tvs'), {
      categorySlug: 'tvs',
      activeListingCount: 1,
    }).some(r => r.includes('thumbnail'))
  );
  assert.ok(
    crawledPublishBlockers(
      makeCrawledMaster({ thumbnail: '/relative/path.jpg', images: [] }, 'cosmetics'),
      { categorySlug: 'cosmetics', activeListingCount: 1 }
    ).some(r => r.includes('images'))
  );
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ images: ['javascript:alert(1)'] }, 'supplements'), {
      categorySlug: 'supplements',
      activeListingCount: 1,
    }).some(r => r.includes('HTTP/HTTPS URLs'))
  );

  // Out-of-stock, zero-price, or non-crawl origin listings do not satisfy active listing check.
  assert.ok(
    crawledPublishBlockers(e1Row, {
      categorySlug: 'tvs',
      listings: [
        { price_current: 0, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
        {
          price_current: 10_000_000,
          currency: 'VND',
          availability: 'out_of_stock',
          origin: 'crawl',
        },
      ],
    }).some(r => r.includes('rate.products'))
  );
  for (const nonCrawlOrigin of ['synthetic', 'backfill', 'fixture', 'seed', null, undefined]) {
    assert.ok(
      crawledPublishBlockers(e1Row, {
        categorySlug: 'tvs',
        listings: [
          {
            price_current: 11_990_000,
            currency: 'VND',
            availability: 'in_stock',
            origin: nonCrawlOrigin,
          },
        ],
      }).some(r => r.includes('origin="crawl"')),
      `Expected origin ${String(nonCrawlOrigin)} to be blocked`
    );
  }
  assert.deepEqual(
    crawledPublishBlockers(e1Row, {
      categorySlug: 'tvs',
      listings: [
        {
          price_current: 9_990_000,
          currency: 'VND',
          availability: 'in_stock',
          origin: 'synthetic',
        },
        { price_current: 11_990_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
      ],
    }),
    []
  );

  // Wrong entity_type blocked.
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ entity_type: 'service' }, 'tvs'), {
      categorySlug: 'tvs',
      activeListingCount: 1,
    }).some(r => r.includes('must be "product"'))
  );

  // Unknown brand 'Khác' / 'khac:' rejected by default, allowed when rejectUnknownBrand = false.
  const khacE3 = makeCrawledMaster(
    {
      model_key: 'khac:serum-duong-am-30ml:unknown',
      slug: 'khac-serum-duong-am-30ml',
      name: 'Serum duong am 30ml',
      brand: 'Khác',
      category_id: 'cat-cosmetics',
      specifications: { category_slug: 'cosmetics', availability: { status: 'Available' } },
    },
    'cosmetics'
  );
  assert.ok(
    crawledPublishBlockers(khacE3, {
      categorySlug: 'cosmetics',
      activeListingCount: 1,
    }).some(r => r.includes('unknown brand'))
  );
  assert.deepEqual(
    crawledPublishBlockers(khacE3, {
      categorySlug: 'cosmetics',
      activeListingCount: 1,
      rejectUnknownBrand: false,
    }),
    []
  );
});

test('crawledPublishBlockers validates Wave E2 services with PCT/VND and no images', () => {
  const bankRow = makeCrawledMaster(
    {
      model_key: 'vietcombank:tiet-kiem-12-thang:unknown',
      slug: 'vietcombank-tiet-kiem-12-thang',
      name: 'Vietcombank Tiet kiem 12 thang',
      brand: 'Vietcombank',
      category_id: 'cat-bank-savings',
      entity_type: 'service',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'bank-savings', availability: { status: 'Available' } },
    },
    'bank-savings'
  );
  assert.deepEqual(
    crawledPublishBlockers(bankRow, {
      categorySlug: 'bank-savings',
      listings: [
        { price_current: 5.4, currency: 'PCT', availability: 'in_stock', origin: 'crawl' },
      ],
    }),
    []
  );

  // Wrong currency (VND or null instead of PCT) or 0 listings blocked.
  assert.ok(
    crawledPublishBlockers(bankRow, {
      categorySlug: 'bank-savings',
      listings: [
        { price_current: 5.4, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
      ],
    }).some(r => r.includes('currency PCT'))
  );
  assert.ok(
    crawledPublishBlockers(bankRow, {
      categorySlug: 'bank-savings',
      listings: [{ price_current: 5.4, currency: null, availability: 'in_stock', origin: 'crawl' }],
    }).some(r => r.includes('currency PCT'))
  );
  assert.ok(
    crawledPublishBlockers(bankRow, {
      categorySlug: 'bank-savings',
      listings: [],
    }).some(r => r.includes('currency PCT'))
  );
  // Count-only Wave E2 context without explicit listings array cannot verify currency contract.
  assert.ok(
    crawledPublishBlockers(bankRow, {
      categorySlug: 'bank-savings',
      activeListingCount: 1,
    }).some(r => r.includes('listings array') && r.includes('currency PCT'))
  );

  const internetRow = makeCrawledMaster(
    {
      model_key: 'vnpt:home-net-3-250mbps:unknown',
      slug: 'vnpt-home-net-3-250mbps',
      name: 'VNPT Home Net 3 250Mbps',
      brand: 'VNPT',
      category_id: 'cat-internet',
      entity_type: 'service',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'internet-telecom', availability: { status: 'Available' } },
    },
    'internet-telecom'
  );
  assert.deepEqual(
    crawledPublishBlockers(internetRow, {
      categorySlug: 'internet-telecom',
      listings: [
        { price_current: 210_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
      ],
    }),
    []
  );
  // DB column currency defaults to 'VND', so null/undefined passes for internet-telecom.
  assert.deepEqual(
    crawledPublishBlockers(internetRow, {
      categorySlug: 'internet-telecom',
      listings: [
        { price_current: 210_000, currency: null, availability: 'in_stock', origin: 'crawl' },
      ],
    }),
    []
  );
  assert.ok(
    crawledPublishBlockers(internetRow, {
      categorySlug: 'internet-telecom',
      listings: [
        { price_current: 4.5, currency: 'PCT', availability: 'in_stock', origin: 'crawl' },
      ],
    }).some(r => r.includes('currency VND'))
  );
  assert.ok(
    crawledPublishBlockers(internetRow, {
      categorySlug: 'internet-telecom',
      listings: [{ price_current: 10, currency: 'USD', availability: 'in_stock', origin: 'crawl' }],
    }).some(r => r.includes('currency VND'))
  );

  // Wave E5 Phase 2 service: credit-cards requires entity_type='service' and VND currency.
  const creditCardRow = makeCrawledMaster(
    {
      model_key: 'vpbank:stepup-cashback:unknown',
      slug: 'vpbank-stepup-cashback',
      name: 'VPBank StepUP Cashback',
      brand: 'VPBank',
      category_id: 'cat-credit-cards',
      entity_type: 'service',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'credit-cards', availability: { status: 'Available' } },
    },
    'credit-cards'
  );
  assert.deepEqual(
    crawledPublishBlockers(creditCardRow, {
      categorySlug: 'credit-cards',
      listings: [
        { price_current: 499_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
      ],
    }),
    []
  );
  assert.ok(
    crawledPublishBlockers(creditCardRow, {
      categorySlug: 'credit-cards',
      listings: [{ price_current: 5, currency: 'PCT', availability: 'in_stock', origin: 'crawl' }],
    }).some(r => r.includes('currency VND'))
  );
  assert.ok(
    crawledPublishBlockers(
      { ...internetRow, entity_type: 'product' },
      {
        categorySlug: 'internet-telecom',
        listings: [{ price_current: 210_000, currency: 'VND', origin: 'crawl' }],
      }
    ).some(r => r.includes('must be "service"'))
  );
  assert.ok(
    crawledPublishBlockers(internetRow, {
      categorySlug: 'internet-telecom',
      activeListingCount: 1,
    }).some(r => r.includes('listings array') && r.includes('currency VND'))
  );
});

test('crawledPublishBlockers validates Wave E4 places with place_details and zero images/listings', () => {
  const placeRow = makeCrawledMaster(
    {
      model_key: 'phuc-long:nguyen-thi-minh-khai:unknown',
      slug: 'phuc-long-nguyen-thi-minh-khai',
      name: 'Phuc Long Nguyen Thi Minh Khai',
      brand: 'Phuc Long',
      category_id: 'cat-cafes',
      entity_type: 'place',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'cafes', availability: { status: 'Available' } },
    },
    'cafes'
  );

  assert.deepEqual(
    crawledPublishBlockers(placeRow, {
      categorySlug: 'cafes',
      listings: [],
      activeListingCount: 0,
      placeDetail: {
        place_key: 'phuc-long:ho-chi-minh:ntmk-1',
        branch_group_key: 'phuc-long',
        province_code: 'ho-chi-minh',
      },
    }),
    []
  );

  // Missing place_details or required keys blocked.
  assert.ok(
    crawledPublishBlockers(placeRow, { categorySlug: 'cafes', placeDetail: null }).some(r =>
      r.includes('missing linked rate.place_details')
    )
  );
  const missingProvince = crawledPublishBlockers(placeRow, {
    categorySlug: 'cafes',
    placeDetail: {
      place_key: 'phuc-long:ho-chi-minh:ntmk-1',
      branch_group_key: 'phuc-long',
      province_code: '   ',
    },
  });
  assert.ok(missingProvince.some(r => r.includes('province_code')));

  const missingKeys = crawledPublishBlockers(placeRow, {
    categorySlug: 'cafes',
    placeDetail: {
      place_key: '',
      branch_group_key: null,
      province_code: 'ha-noi',
    },
  });
  assert.ok(missingKeys.some(r => r.includes('place_key')));
  assert.ok(missingKeys.some(r => r.includes('branch_group_key')));

  assert.ok(
    crawledPublishBlockers(
      { ...placeRow, entity_type: 'product' },
      {
        categorySlug: 'cafes',
        placeDetail: {
          place_key: 'phuc-long:ho-chi-minh:ntmk-1',
          branch_group_key: 'phuc-long',
          province_code: 'ho-chi-minh',
        },
      }
    ).some(r => r.includes('must be "place"'))
  );
  assert.ok(
    crawledPublishBlockers(
      { ...placeRow, specifications: { availability: { status: 'Available' } } },
      {
        categorySlug: 'cafes',
        placeDetail: {
          place_key: 'phuc-long:ho-chi-minh:ntmk-1',
          branch_group_key: 'phuc-long',
          province_code: 'ho-chi-minh',
        },
      }
    ).some(r => r.includes('specifications missing category_slug'))
  );
});

test('crawledPublishBlockers enforces common status, model_key, slug, category_slug, schema, availability and non-tech guards', () => {
  const baseCtx = {
    categorySlug: 'tvs',
    listings: [
      { price_current: 9_000_000, currency: 'VND', availability: 'in_stock', origin: 'crawl' },
    ],
  };

  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ status: 'archived' }), baseCtx).some(r =>
      r.includes('not "draft"')
    )
  );
  assert.ok(
    crawledPublishBlockers(
      makeCrawledMaster({ model_key: 'samsung:unkeyed:unknown' }),
      baseCtx
    ).some(r => r.includes('unkeyed'))
  );
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ model_key: 'samsung:only-two' }), baseCtx).some(r =>
      r.includes('3 non-empty parts')
    )
  );
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ model_key: 'samsung::unknown' }), baseCtx).some(r =>
      r.includes('3 non-empty parts')
    )
  );
  for (const badSlug of [
    'bad slug!',
    'Samsung-UA55DU7000',
    ' samsung-ua55du7000 ',
    'a'.repeat(121),
  ]) {
    assert.ok(
      crawledPublishBlockers(makeCrawledMaster({ slug: badSlug }), baseCtx).some(r =>
        r.includes('slug')
      ),
      `Expected slug ${JSON.stringify(badSlug)} to be blocked`
    );
  }
  assert.deepEqual(
    crawledPublishBlockers(makeCrawledMaster({ slug: 'a'.repeat(120) }), baseCtx),
    []
  );
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ name: '   ', brand: '' }), baseCtx).length >= 2
  );
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ specifications: {} }), baseCtx).some(r =>
      r.includes('availability')
    )
  );
  assert.ok(
    crawledPublishBlockers(
      makeCrawledMaster({ specifications: { availability: {} } }),
      baseCtx
    ).some(r => r.includes('availability'))
  );
  assert.ok(
    crawledPublishBlockers(
      makeCrawledMaster({ specifications: { availability: { status: 'Available' } } }),
      baseCtx
    ).some(r => r.includes('specifications missing category_slug'))
  );
  assert.ok(
    crawledPublishBlockers(
      makeCrawledMaster({
        specifications: { category_slug: '   ', availability: { status: 'Available' } },
      }),
      baseCtx
    ).some(r => r.includes('specifications missing category_slug'))
  );
  assert.ok(
    crawledPublishBlockers(
      makeCrawledMaster({
        specifications: {
          category_slug: 'air-conditioners',
          availability: { status: 'Available' },
        },
      }),
      baseCtx
    ).some(r => r.includes('does not match'))
  );
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ specifications: null }), baseCtx).some(r =>
      r.includes('ProductSpecificationsSchema')
    )
  );
  assert.ok(
    crawledPublishBlockers(makeCrawledMaster({ category_id: 'cat-smartphones' }, 'smartphones'), {
      ...baseCtx,
      categorySlug: 'smartphones',
    }).some(r => r.includes('core tech category'))
  );
});

test('runCrawledPublish dry-run audits Wave E1-E4 cleanly with zero mutations', async () => {
  const tvDraft = makeCrawledMaster(
    { id: 'm-e1', model_key: 'lg:oled55c4psa:unknown', slug: 'lg-oled55c4psa' },
    'tvs'
  );
  const bankDraft = makeCrawledMaster(
    {
      id: 'm-e2',
      model_key: 'acb:tiet-kiem-6-thang:unknown',
      slug: 'acb-tiet-kiem-6-thang',
      name: 'ACB Tiet kiem 6 thang',
      brand: 'ACB',
      category_id: 'cat-bank-savings',
      entity_type: 'service',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'bank-savings', availability: { status: 'Available' } },
    },
    'bank-savings'
  );
  const placeDraft = makeCrawledMaster(
    {
      id: 'm-e4',
      model_key: 'cong-ca-phe:hang-dieu:unknown',
      slug: 'cong-ca-phe-hang-dieu',
      name: 'Cong Ca Phe Hang Dieu',
      brand: 'Cong Ca Phe',
      category_id: 'cat-cafes',
      entity_type: 'place',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'cafes', availability: { status: 'Available' } },
    },
    'cafes'
  );
  const publishedTv = makeCrawledMaster(
    {
      id: 'm-pub',
      model_key: 'sony:xr-55x90l:unknown',
      slug: 'sony-xr-55x90l',
      status: 'published',
    },
    'tvs'
  );
  const blockedKhac = makeCrawledMaster(
    {
      id: 'm-blk',
      model_key: 'khac:serum-vitamin-c:unknown',
      slug: 'khac-serum-vitamin-c',
      name: 'Serum Vitamin C',
      brand: 'Khác',
      category_id: 'cat-cosmetics',
      specifications: { category_slug: 'cosmetics', availability: { status: 'Available' } },
    },
    'cosmetics'
  );
  const syntheticOnly = makeCrawledMaster(
    {
      id: 'm-syn',
      model_key: 'tcl:p755-synthetic:unknown',
      slug: 'tcl-p755-synthetic',
      brand: 'TCL',
    },
    'tvs'
  );
  const coreTechDraft = makeCrawledMaster(
    {
      id: 'm-core',
      model_key: 'apple:iphone-16:128gb',
      slug: 'apple-iphone-16-128gb',
      name: 'iPhone 16 128GB',
      brand: 'Apple',
      category_id: 'cat-smartphones',
      specifications: { category_slug: 'smartphones', availability: { status: 'Available' } },
    },
    'smartphones'
  );

  const { client, masters, writes } = crawledMockDb({
    masters: [
      tvDraft,
      bankDraft,
      placeDraft,
      publishedTv,
      blockedKhac,
      syntheticOnly,
      coreTechDraft,
    ],
    products: [
      {
        id: 'p-1',
        cluster_id: 'm-e1',
        price_current: 24_900_000,
        currency: 'VND',
        availability: 'in_stock',
        origin: 'crawl',
      },
      {
        id: 'p-2',
        cluster_id: 'm-e2',
        price_current: 4.8,
        currency: 'PCT',
        availability: 'in_stock',
        origin: 'crawl',
      },
      {
        id: 'p-3',
        cluster_id: 'm-blk',
        price_current: 150_000,
        currency: 'VND',
        availability: 'in_stock',
        origin: 'crawl',
      },
      {
        id: 'p-4',
        cluster_id: 'm-syn',
        price_current: 8_990_000,
        currency: 'VND',
        availability: 'in_stock',
        origin: 'synthetic',
      },
    ],
    placeDetails: [
      {
        master_id: 'm-e4',
        place_key: 'cong-ca-phe:ha-noi:hang-dieu',
        branch_group_key: 'cong-ca-phe',
        province_code: 'ha-noi',
      },
    ],
  });

  const result = await runCrawledPublish(client);
  assert.equal(result.mode, 'crawled');
  assert.equal(result.dryRun, true);
  assert.equal(result.apply, false);
  assert.equal(result.published, 0);
  assert.equal(result.scanned, 6, 'core tech smartphones row must never be selected');
  assert.deepEqual(result.alreadyPublished, ['sony:xr-55x90l:unknown']);
  assert.deepEqual(result.archived, []);
  assert.deepEqual(
    result.eligible.map(e => e.model_key),
    ['acb:tiet-kiem-6-thang:unknown', 'cong-ca-phe:hang-dieu:unknown', 'lg:oled55c4psa:unknown']
  );
  assert.equal(result.blocked.length, 2);
  const blockedKhacEntry = result.blocked.find(b => b.model_key === 'khac:serum-vitamin-c:unknown');
  const blockedSynEntry = result.blocked.find(b => b.model_key === 'tcl:p755-synthetic:unknown');
  assert.ok(blockedKhacEntry?.reasons.some(r => r.includes('unknown brand')));
  assert.ok(blockedSynEntry?.reasons.some(r => r.includes('origin="crawl"')));
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(writes, []);
  assert.ok(masters.filter(m => m.status === 'draft').length === 6);
});

test('runCrawledPublish deterministic --limit, --expect mismatch guard, and --apply optimistic lock', async () => {
  const mZ = makeCrawledMaster(
    { id: 'm-z', model_key: 'xiaomi:purifier-z:unknown', slug: 'xiaomi-purifier-z' },
    'air-purifiers'
  );
  const mA = makeCrawledMaster(
    { id: 'm-a', model_key: 'daikin:ac-a:unknown', slug: 'daikin-ac-a' },
    'air-conditioners'
  );
  const mB = makeCrawledMaster({ id: 'm-b', model_key: 'lg:tv-b:unknown', slug: 'lg-tv-b' }, 'tvs');
  const products = [
    {
      id: 'p-z',
      cluster_id: 'm-z',
      price_current: 3_000_000,
      currency: 'VND',
      availability: 'in_stock',
      origin: 'crawl',
    },
    {
      id: 'p-a',
      cluster_id: 'm-a',
      price_current: 9_000_000,
      currency: 'VND',
      availability: 'in_stock',
      origin: 'crawl',
    },
    {
      id: 'p-b',
      cluster_id: 'm-b',
      price_current: 12_000_000,
      currency: 'VND',
      availability: 'in_stock',
      origin: 'crawl',
    },
  ];

  // Missing --expect on apply fails before any read.
  await assert.rejects(
    runCrawledPublish(
      {
        from() {
          throw new Error('should not read');
        },
      } as unknown as RateSupabaseClient,
      { apply: true }
    ),
    /apply needs expect/
  );

  // Expect mismatch aborts before any write.
  const mismatchDb = crawledMockDb({ masters: [mZ, mA, mB], products });
  await assert.rejects(
    runCrawledPublish(mismatchDb.client, { limit: 2, apply: true, expect: 3 }),
    /--expect 3 does not match the crawled plan \(2 eligible/
  );
  assert.deepEqual(mismatchDb.writes, []);

  // Limit=2 sorts deterministically (daikin -> lg -> xiaomi) and publishes only first 2.
  const applyDb = crawledMockDb({ masters: [mZ, mA, mB], products });
  const applied = await runCrawledPublish(applyDb.client, { limit: 2, apply: true, expect: 2 });
  assert.equal(applied.published, 2);
  assert.deepEqual(
    applied.eligible.map(e => e.model_key),
    ['daikin:ac-a:unknown', 'lg:tv-b:unknown']
  );
  assert.deepEqual(
    applied.skipped.map(s => s.model_key),
    ['xiaomi:purifier-z:unknown']
  );
  assert.equal(applyDb.writes.length, 2);
  assert.equal(applyDb.masters.find(m => m.id === 'm-a')!.status, 'published');
  assert.equal(applyDb.masters.find(m => m.id === 'm-b')!.status, 'published');
  assert.equal(applyDb.masters.find(m => m.id === 'm-z')!.status, 'draft');

  // Optimistic update guard detects concurrent slug/status mutation between plan and write.
  let updateAttempt = 0;
  const raceDb = crawledMockDb({ masters: [mZ, mA], products }, ({ masters }) => {
    updateAttempt++;
    if (updateAttempt === 2) {
      masters.find(m => m.id === 'm-z')!.slug = 'mutated-concurrently';
    }
  });
  await assert.rejects(
    runCrawledPublish(raceDb.client, { apply: true, expect: 2 }),
    /Publishing xiaomi:purifier-z:unknown touched 0 rows, not 1/
  );
  assert.equal(raceDb.masters.find(m => m.id === 'm-a')!.status, 'published');
  assert.equal(raceDb.masters.find(m => m.id === 'm-z')!.status, 'draft');
});

test('runCrawledPublish --apply guards thumbnail on Wave E1/E3 and omits thumbnail guard on Wave E2/E4', async () => {
  const tvRow = makeCrawledMaster(
    {
      id: 'm-e1-guard',
      model_key: 'lg:oled55c4:unknown',
      slug: 'lg-oled55c4',
      thumbnail: 'https://cdn.rate.vn/lg-c4.jpg',
      images: ['https://cdn.rate.vn/lg-c4.jpg'],
    },
    'tvs'
  );
  const cosRow = makeCrawledMaster(
    {
      id: 'm-e3-guard',
      model_key: 'cerave:cream-50ml:unknown',
      slug: 'cerave-cream-50ml',
      brand: 'CeraVe',
      category_id: 'cat-cosmetics',
      thumbnail: 'https://cdn.rate.vn/cerave.jpg',
      images: ['https://cdn.rate.vn/cerave.jpg'],
      specifications: { category_slug: 'cosmetics', availability: { status: 'Available' } },
    },
    'cosmetics'
  );
  const bankRow = makeCrawledMaster(
    {
      id: 'm-e2-guard',
      model_key: 'acb:savings-12m:unknown',
      slug: 'acb-savings-12m',
      brand: 'ACB',
      category_id: 'cat-bank-savings',
      entity_type: 'service',
      thumbnail: null,
      images: [],
      specifications: { category_slug: 'bank-savings', availability: { status: 'Available' } },
    },
    'bank-savings'
  );
  const cafeRow = makeCrawledMaster(
    {
      id: 'm-e4-guard',
      model_key: 'phe-la:ly-tu-trong:unknown',
      slug: 'phe-la-ly-tu-trong',
      brand: 'Phe La',
      category_id: 'cat-cafes',
      entity_type: 'place',
      thumbnail: null,
      images: [],
      specifications: { category_slug: 'cafes', availability: { status: 'Available' } },
    },
    'cafes'
  );

  const products = [
    {
      id: 'p-e1',
      cluster_id: 'm-e1-guard',
      price_current: 24_000_000,
      currency: 'VND',
      availability: 'in_stock',
      origin: 'crawl',
    },
    {
      id: 'p-e3',
      cluster_id: 'm-e3-guard',
      price_current: 190_000,
      currency: 'VND',
      availability: 'in_stock',
      origin: 'crawl',
    },
    {
      id: 'p-e2',
      cluster_id: 'm-e2-guard',
      price_current: 5.2,
      currency: 'PCT',
      availability: 'in_stock',
      origin: 'crawl',
    },
  ];
  const placeDetails = [
    {
      master_id: 'm-e4-guard',
      place_key: 'phe-la:ho-chi-minh:ltt',
      branch_group_key: 'phe-la',
      province_code: 'ho-chi-minh',
    },
  ];

  const guardDb = crawledMockDb({
    masters: [tvRow, cosRow, bankRow, cafeRow],
    products,
    placeDetails,
  });
  const res = await runCrawledPublish(guardDb.client, { apply: true, expect: 4 });
  assert.equal(res.published, 4);

  const writeFor = (id: string) => guardDb.writes.find(w => w.id === id);
  assert.ok(
    writeFor('m-e1-guard')?.filters.some(
      ([col, val]) => col === 'thumbnail' && val === 'https://cdn.rate.vn/lg-c4.jpg'
    ),
    'Wave E1 apply must guard thumbnail'
  );
  assert.ok(
    writeFor('m-e3-guard')?.filters.some(
      ([col, val]) => col === 'thumbnail' && val === 'https://cdn.rate.vn/cerave.jpg'
    ),
    'Wave E3 apply must guard thumbnail'
  );
  assert.equal(
    writeFor('m-e2-guard')?.filters.some(([col]) => col === 'thumbnail'),
    false,
    'Wave E2 apply must not require thumbnail filter'
  );
  assert.equal(
    writeFor('m-e4-guard')?.filters.some(([col]) => col === 'thumbnail'),
    false,
    'Wave E4 apply must not require thumbnail filter'
  );

  // Concurrent thumbnail replacement between plan and write aborts Wave E1/E3 update.
  const thumbRaceDb = crawledMockDb({ masters: [tvRow], products }, ({ masters }) => {
    masters[0]!.thumbnail = 'https://cdn.rate.vn/tampered.jpg';
  });
  await assert.rejects(
    runCrawledPublish(thumbRaceDb.client, { apply: true, expect: 1 }),
    /Publishing lg:oled55c4:unknown touched 0 rows, not 1: its status, slug or thumbnail changed/
  );
  assert.equal(thumbRaceDb.masters[0]!.status, 'draft');
});

test('runCrawledPublish batches .in() queries at <= 150 IDs and supports --only filtering', async () => {
  const manyMasters: Array<Record<string, unknown>> = [];
  const manyProducts: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 160; i++) {
    const id = `m-${String(i).padStart(4, '0')}`;
    const num = String(i).padStart(4, '0');
    manyMasters.push(
      makeCrawledMaster(
        {
          id,
          model_key: `samsung:tv-${num}:unknown`,
          slug: `samsung-tv-${num}`,
        },
        'tvs'
      ) as unknown as Record<string, unknown>
    );
    manyProducts.push({
      id: `p-${num}`,
      cluster_id: id,
      price_current: 10_000_000,
      currency: 'VND',
      availability: 'in_stock',
      origin: 'crawl',
    });
  }

  const batchDb = crawledMockDb({ masters: manyMasters, products: manyProducts });
  const batchRes = await runCrawledPublish(batchDb.client, { categories: ['tvs'] });
  assert.equal(batchRes.eligible.length, 160);
  assert.ok(batchDb.inBatchSizes.length >= 2);
  assert.ok(
    batchDb.inBatchSizes.every(b => b.size <= 150),
    `Expected every .in() batch <= 150, got ${JSON.stringify(batchDb.inBatchSizes)}`
  );

  // --only with a core tech key, an out-of-category key, a missing key, and an eligible key.
  const smartRow = makeCrawledMaster(
    {
      id: 'm-core',
      model_key: 'apple:iphone-16:128gb',
      slug: 'apple-iphone-16-128gb',
      category_id: 'cat-smartphones',
      specifications: { category_slug: 'smartphones', availability: { status: 'Available' } },
    },
    'smartphones'
  );
  const cafeRow = makeCrawledMaster(
    {
      id: 'm-cafe',
      model_key: 'phuc-long:le-loi:unknown',
      slug: 'phuc-long-le-loi',
      category_id: 'cat-cafes',
      entity_type: 'place',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'cafes', availability: { status: 'Available' } },
    },
    'cafes'
  );
  const onlyDb = crawledMockDb({
    masters: [
      manyMasters[0]!,
      smartRow as unknown as Record<string, unknown>,
      cafeRow as unknown as Record<string, unknown>,
    ],
    products: [manyProducts[0]!],
  });
  const onlyRes = await runCrawledPublish(onlyDb.client, {
    categories: ['tvs'],
    only: [
      'samsung:tv-0000:unknown',
      'apple:iphone-16:128gb',
      'phuc-long:le-loi:unknown',
      'missing:key:unknown',
    ],
  });
  assert.deepEqual(
    onlyRes.eligible.map(e => e.model_key),
    ['samsung:tv-0000:unknown']
  );
  assert.deepEqual(
    onlyRes.skipped.map(s => s.model_key),
    ['phuc-long:le-loi:unknown']
  );
  assert.deepEqual(onlyRes.blocked.map(b => b.model_key).sort(), [
    'apple:iphone-16:128gb',
    'missing:key:unknown',
  ]);
});

test('DOS/Rate#1953: runCrawledPublish skips Wave E status === archived rows cleanly without counting them as blocked', async () => {
  const eligibleDraft = makeCrawledMaster(
    {
      id: 'm-draft',
      model_key: 'whirlpool:wrn3020:unknown',
      slug: 'whirlpool-wrn3020',
      name: 'Whirlpool WRN3020',
      brand: 'Whirlpool',
      specifications: { category_slug: 'refrigerators', availability: { status: 'Available' } },
    },
    'refrigerators'
  );
  const publishedRow = makeCrawledMaster(
    {
      id: 'm-pub',
      model_key: 'lg:oled55c4:unknown',
      slug: 'lg-oled55c4',
      status: 'published',
    },
    'tvs'
  );
  // Retired superseded khac: draft with missing images/listings must be archived-skipped, not blocked.
  const archivedKhac = makeCrawledMaster(
    {
      id: 'm-arch-e1',
      model_key: 'khac:wrn3020:unknown',
      slug: 'khac-wrn3020',
      name: 'Khác WRN3020',
      brand: 'Khác',
      status: 'archived',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'refrigerators', availability: { status: 'Available' } },
    },
    'refrigerators'
  );
  const archivedE3 = makeCrawledMaster(
    {
      id: 'm-arch-e3',
      model_key: 'khac:old-serum:unknown',
      slug: 'khac-old-serum',
      name: 'Khác Old Serum',
      brand: 'Khác',
      status: 'archived',
      category_id: 'cat-cosmetics',
      images: [],
      thumbnail: null,
      specifications: { category_slug: 'cosmetics', availability: { status: 'Available' } },
    },
    'cosmetics'
  );
  const archivedCoreTech = makeCrawledMaster(
    {
      id: 'm-arch-core',
      model_key: 'apple:iphone-15:128gb',
      slug: 'apple-iphone-15-128gb',
      name: 'iPhone 15 128GB',
      brand: 'Apple',
      status: 'archived',
      category_id: 'cat-smartphones',
      specifications: { category_slug: 'smartphones', availability: { status: 'Available' } },
    },
    'smartphones'
  );

  const products = [
    {
      id: 'p-draft',
      cluster_id: 'm-draft',
      price_current: 11_490_000,
      currency: 'VND',
      availability: 'in_stock',
      origin: 'crawl',
    },
  ];

  // Dry-run across Wave E skips archived rows cleanly into result.archived with 0 blocked.
  const dryDb = crawledMockDb({
    masters: [eligibleDraft, publishedRow, archivedKhac, archivedE3, archivedCoreTech],
    products,
  });
  const dryRes = await runCrawledPublish(dryDb.client);
  assert.equal(dryRes.scanned, 4);
  assert.deepEqual(dryRes.alreadyPublished, ['lg:oled55c4:unknown']);
  assert.deepEqual(dryRes.archived, ['khac:old-serum:unknown', 'khac:wrn3020:unknown']);
  assert.deepEqual(
    dryRes.eligible.map(e => e.model_key),
    ['whirlpool:wrn3020:unknown']
  );
  assert.deepEqual(dryRes.blocked, []);
  assert.deepEqual(dryRes.skipped, []);
  assert.deepEqual(dryDb.writes, []);

  // --apply --expect 1 publishes only the eligible draft and leaves archived rows untouched.
  const applyRes = await runCrawledPublish(dryDb.client, { apply: true, expect: 1 });
  assert.equal(applyRes.published, 1);
  assert.deepEqual(applyRes.archived, ['khac:old-serum:unknown', 'khac:wrn3020:unknown']);
  assert.deepEqual(applyRes.blocked, []);
  assert.equal(dryDb.masters.find(m => m.id === 'm-draft')!.status, 'published');
  assert.equal(dryDb.masters.find(m => m.id === 'm-arch-e1')!.status, 'archived');
  assert.equal(dryDb.masters.find(m => m.id === 'm-arch-e3')!.status, 'archived');

  // --only with an archived Wave E row skips it into archived; an archived core tech row stays blocked.
  const onlyDb = crawledMockDb({
    masters: [archivedKhac, archivedCoreTech],
    products: [],
  });
  const onlyRes = await runCrawledPublish(onlyDb.client, {
    only: ['khac:wrn3020:unknown', 'apple:iphone-15:128gb'],
  });
  assert.deepEqual(onlyRes.archived, ['khac:wrn3020:unknown']);
  assert.deepEqual(onlyRes.eligible, []);
  assert.deepEqual(
    onlyRes.blocked.map(b => b.model_key),
    ['apple:iphone-15:128gb']
  );
  assert.ok(onlyRes.blocked[0]!.reasons.some(r => r.includes('core tech category')));
});
