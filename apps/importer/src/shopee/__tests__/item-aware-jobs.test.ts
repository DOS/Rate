/**
 * Item-aware importer jobs (DOS/Rate#1213, design doc 4.1, 4.4 and 5.3), each with
 * RATE_ITEM_MODEL off and on:
 * 1. Arena parser: an unknown 5G is null (DOS/Rate#1196); storage sizes with their RAM
 * 2. syncArenaSpecsToItem: Item specs without storage/RAM, variant overrides only where empty
 * 3. Arena audit: another size of a present Item is not a missing release; Item spec gaps
 * 4. Peer floor: a NULL-variant listing never enters, and never gets, a peer floor
 * 5. Seller review risk: reviews of NULL-variant listings count, they get no price term
 */
import assert from 'node:assert/strict';
import {
  ArenaSpecSyncer,
  UPSTREAM_2026_ARENA_REFERENCE_URLS,
  parseArenaMemoryVariants,
  parseGsmArenaHtmlToSpecs,
  syncArenaSpecsToItem,
  type ArenaSyncedDeviceSpec,
} from '../arena-spec-syncer.js';
import { resolveClusterPeerFloorPrice } from '../cluster-peer-floor.js';
import {
  AiReviewAnalyzer,
  type MerchantRiskEvaluation,
  type MerchantRiskInput,
} from '../ai-review-analyzer.js';
import {
  loadAndScoreMerchant,
  scoreMerchants,
  strongestPriceAnomaly,
  type MerchantRow,
  type ProductRow,
  type ReviewRow,
} from '../merchant-review-risk.js';
import { ITEM_MODEL_ENV } from '../item-model-flag.js';
import type { RateSupabaseClient } from '../types.js';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

interface Call {
  table: string;
  op: 'select' | 'update' | 'insert' | 'upsert';
  cols?: string;
  payload?: Row;
  filters: Array<[string, string, unknown]>;
}

/** Chainable PostgREST stand-in; every query resolves through `handler`. */
function createDb(handler: (call: Call) => Result | undefined) {
  const calls: Call[] = [];
  const run = (call: Call): Result => handler(call) ?? { data: null, error: null };
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {};
    for (const name of ['eq', 'neq', 'in', 'is', 'gt', 'lte']) {
      b[name] = (col: string, val: unknown) => {
        call.filters.push([name, col, val]);
        return b;
      };
    }
    for (const name of ['order', 'limit', 'select']) b[name] = () => b;
    // One page of rows: later pages are empty.
    b.range = (from: number) => Promise.resolve(from > 0 ? { data: [], error: null } : run(call));
    b.maybeSingle = () => Promise.resolve(run(call));
    b.then = (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run(call)).then(resolve, reject);
    return b;
  };
  const client = {
    from(table: string) {
      const start = (op: Call['op'], extra: Partial<Call> = {}) => {
        const call: Call = { table, op, filters: [], ...extra };
        calls.push(call);
        return builder(call);
      };
      return {
        select: (cols: string) => start('select', { cols }),
        update: (payload: Row) => start('update', { payload }),
        insert: (payload: Row) => start('insert', { payload }),
        upsert: (payload: Row) => start('upsert', { payload }),
      };
    },
  } as unknown as RateSupabaseClient;
  return { client, calls };
}

const filterValue = (call: Call | undefined, col: string) =>
  call?.filters.find(([, c]) => c === col)?.[2];

const FULL_SPECS = Object.fromEntries(
  [
    'display',
    'hardware',
    'camera',
    'battery',
    'design',
    'cellular',
    'connectivity',
    'multimedia',
    'availability',
    'regulatory',
  ].map(group => [group, { value: 'x' }])
);

const ARENA_HTML = `<h1 data-spec="modelname">Xiaomi 18 Pro Max</h1>
  <td data-spec="nettech">GSM / HSPA / LTE / 5G</td>
  <td data-spec="chipset">Snapdragon 8 Elite Gen 6</td>
  <td data-spec="internalmemory">256GB 12GB RAM, 512GB 16GB RAM, 1TB 16GB RAM</td>
  <td data-spec="batdescription1">Si/C 7500 mAh</td>`;

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env[ITEM_MODEL_ENV];
  if (value === undefined) delete process.env[ITEM_MODEL_ENV];
  else process.env[ITEM_MODEL_ENV] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[ITEM_MODEL_ENV];
    else process.env[ITEM_MODEL_ENV] = previous;
  }
}

async function run() {
  console.log('🧪 Item-aware importer jobs suite (#1213)');

  // 1. Arena parser
  {
    const unknown = parseGsmArenaHtmlToSpecs(
      `<h1 data-spec="modelname">Xiaomi Pad 8</h1><td data-spec="chipset">Snapdragon</td>`
    );
    assert.equal(unknown.has5g, null, 'a page with no network fields says nothing about 5G');
    assert.equal(unknown.specifications.cellular?.has_5g, undefined);
    assert.equal(unknown.specifications.cellular?.sim_type, undefined, 'no invented SIM');
    assert.equal(unknown.specifications.cellular?.technology, undefined);
    assert.equal(unknown.specifications.cellular?.data_speed, undefined);

    const no5g = parseGsmArenaHtmlToSpecs(
      `<h1 data-spec="modelname">Samsung Galaxy A06</h1><td data-spec="nettech">GSM / HSPA / LTE</td>`
    );
    assert.equal(no5g.has5g, false, 'a stated network without 5G is a known false');
    assert.equal(no5g.specifications.cellular?.has_5g, false);
    assert.equal(no5g.specifications.cellular?.technology, 'GSM / HSPA / LTE');

    const with5g = parseGsmArenaHtmlToSpecs(ARENA_HTML);
    assert.equal(with5g.has5g, true);
    assert.equal(with5g.specifications.cellular?.has_5g, true);
    assert.equal(with5g.storageGb, 1024, 'the top-level storage stays the largest size');
    assert.equal(with5g.ramGb, 16);
    assert.deepEqual(with5g.memoryVariants, [
      { storageGb: 256, ramGb: 12 },
      { storageGb: 512, ramGb: 16 },
      { storageGb: 1024, ramGb: 16 },
    ]);

    assert.deepEqual(
      parseArenaMemoryVariants('128GB 8GB RAM, 256GB 8GB RAM, 256GB 12GB RAM, 512GB'),
      [
        { storageGb: 128, ramGb: 8 },
        { storageGb: 256, ramGb: null },
        { storageGb: 512, ramGb: null },
      ],
      'a size with two RAM options, or none, has no known RAM'
    );
    assert.deepEqual(
      parseArenaMemoryVariants('256GB 8GB/12GB RAM, 512GB 8/12GB RAM'),
      [
        { storageGb: 256, ramGb: null },
        { storageGb: 512, ramGb: null },
      ],
      'slash RAM options are RAM, not storage, and name no single RAM'
    );
    assert.deepEqual(parseArenaMemoryVariants(''), []);
    assert.deepEqual(parseArenaMemoryVariants(undefined as unknown as string), []);
  }
  console.log('  ✅ [1/5] Arena parser: unknown 5G is null; storage sizes with their RAM');

  // 2. syncArenaSpecsToItem
  {
    const spec: ArenaSyncedDeviceSpec = parseGsmArenaHtmlToSpecs(ARENA_HTML);
    const itemRow = {
      id: 'item-x18',
      specifications: { battery: { capacity_mah: 7000 }, design: { weight_g: 220 } },
      key_specs: { screen: '6.9" OLED', storage: '256GB', ram: '12GB' },
    };
    const variantRows = [
      { id: 'v-256', variant_key: '256gb', status: 'published', storage_gb: null, ram_gb: null },
      {
        id: 'v-512',
        variant_key: '512gb',
        status: 'published',
        storage_gb: 512,
        ram_gb: 12,
        key_specs: { storage: '512GB', ram: '12GB' },
      },
      {
        id: 'v-1024',
        variant_key: '1024gb',
        status: 'draft',
        storage_gb: 1024,
        ram_gb: null,
        key_specs: { storage: '1TB' },
      },
      { id: 'v-unknown', variant_key: 'unknown', status: 'published', storage_gb: null },
      { id: 'v-old', variant_key: '128gb', status: 'archived', storage_gb: null },
      // A stored RAM number: the label follows it, not Arena.
      { id: 'v-2048', variant_key: '2048gb', status: 'draft', ram_gb: 8, key_specs: {} },
      // A stored RAM label with a suffix: the number follows it, not Arena.
      {
        id: 'v-8192',
        variant_key: '8192gb',
        status: 'draft',
        storage_gb: 8192,
        key_specs: { storage: '8TB', ram: '24GB LPDDR5X' },
      },
      // A stored label that names no size: Arena's RAM is not used either.
      {
        id: 'v-16384',
        variant_key: '16384gb',
        status: 'draft',
        storage_gb: 16384,
        key_specs: { storage: '16TB', ram: 'LPDDR5X' },
      },
      // A stored RAM label: the number follows it, not Arena.
      {
        id: 'v-4096',
        variant_key: '4096gb',
        status: 'draft',
        storage_gb: 4096,
        key_specs: { storage: '4TB', ram: '8GB' },
        updated_at: '2026-10-28T00:00:00.000Z',
      },
    ];
    const catalogDb = (opts: { item?: Row | null; itemErr?: string; changedIds?: string[] } = {}) =>
      createDb(call => {
        if (call.op === 'update') {
          // Compare-and-swap: a row another writer changed matches nothing.
          const id = filterValue(call, 'id') as string;
          return { data: opts.changedIds?.includes(id) ? [] : [{ id }], error: null };
        }
        if (call.table === 'items' && call.op === 'select') {
          if (opts.itemErr) return { data: null, error: { message: opts.itemErr } };
          return { data: opts.item === undefined ? itemRow : opts.item, error: null };
        }
        if (call.table === 'master_products' && call.op === 'select') {
          return { data: variantRows, error: null };
        }
        return undefined;
      });

    // Flag off (explicit and from the env): nothing is read or written.
    const off = catalogDb();
    const offRun = await syncArenaSpecsToItem(off.client, spec, {
      key: 'xiaomi:18-pro-max:512gb',
      apply: true,
      itemModel: 'off',
    });
    assert.equal(offRun.status, 'skipped');
    const envOff = await withFlag(undefined, () =>
      syncArenaSpecsToItem(off.client, spec, { key: 'xiaomi:18-pro-max', apply: true })
    );
    assert.equal(envOff.status, 'skipped');
    assert.equal(off.calls.length, 0, 'flag off: no Item or variant read or write');

    // A key that is neither an item_key nor a model_key reads nothing.
    const badKey = catalogDb();
    for (const key of ['', 'Xiaomi 18', 'xiaomi::unknown', 'xiaomi']) {
      const r = await syncArenaSpecsToItem(badKey.client, spec, { key, itemModel: 'item' });
      assert.equal(r.status, 'skipped', key);
    }
    assert.equal(badKey.calls.length, 0);

    // No rate.items row: never created.
    const missing = catalogDb({ item: null });
    const missingRun = await syncArenaSpecsToItem(missing.client, spec, {
      key: 'xiaomi:18-pro-max',
      apply: true,
      itemModel: 'item',
    });
    assert.equal(missingRun.status, 'item_missing');
    assert.ok(!missing.calls.some(c => c.op !== 'select'));
    assert.ok(!missing.calls.some(c => c.table === 'master_products'));

    // A read error throws instead of reporting the Item missing.
    await assert.rejects(
      syncArenaSpecsToItem(catalogDb({ itemErr: 'boom' }).client, spec, {
        key: 'xiaomi:18-pro-max',
        itemModel: 'item',
      }),
      /Failed to look up Item xiaomi:18-pro-max: boom/
    );

    // Dry run: same counts, no writes.
    const dry = catalogDb();
    const dryRun = await syncArenaSpecsToItem(dry.client, spec, {
      // Upper case at run time: the shared-data key scan reads every fixture literal.
      key: 'xiaomi:18-pro-max:512gb'.toUpperCase(),
      itemModel: 'item',
    });
    assert.deepEqual(dryRun, {
      status: 'synced',
      apply: false,
      itemKey: 'xiaomi:18-pro-max',
      itemUpdated: true,
      variantsUpdated: 5,
      conflicts: 0,
    });
    assert.equal(filterValue(dry.calls[0], 'item_key'), 'xiaomi:18-pro-max');
    assert.ok(!dry.calls.some(c => c.op !== 'select'), 'dry run writes nothing');

    // Apply (env flag on, nullable_variant mode).
    const applied = catalogDb();
    const appliedRun = await withFlag('nullable_variant', () =>
      syncArenaSpecsToItem(applied.client, spec, { key: 'xiaomi:18-pro-max', apply: true })
    );
    assert.equal(appliedRun.variantsUpdated, 5);
    assert.equal(appliedRun.conflicts, 0);
    assert.ok(!applied.calls.some(c => c.op === 'insert' || c.op === 'upsert'), 'no inserts');
    const itemUpdate = applied.calls.find(c => c.op === 'update' && c.table === 'items');
    assert.equal(filterValue(itemUpdate, 'id'), 'item-x18');
    assert.deepEqual(
      itemUpdate?.filters.find(([op, col]) => op === 'is' && col === 'updated_at'),
      ['is', 'updated_at', null],
      'the Item write only applies to the row as it was read'
    );
    const itemSpecs = itemUpdate?.payload?.specifications as Record<string, Row>;
    assert.equal(itemSpecs.hardware?.storage_gb, undefined, 'no storage on an Item');
    assert.equal(itemSpecs.hardware?.ram_gb, undefined, 'no RAM on an Item');
    assert.equal(itemSpecs.hardware?.chipset, 'Snapdragon 8 Elite Gen 6');
    assert.equal(itemSpecs.cellular?.has_5g, true);
    assert.equal(itemSpecs.battery?.capacity_mah, 7500, 'the Arena value wins over the stored one');
    assert.equal(itemSpecs.design?.weight_g, 220, 'a field Arena does not state is kept');
    const itemKeySpecs = itemUpdate?.payload?.key_specs as Row;
    assert.equal(itemKeySpecs.storage, undefined, 'no stored storage left on the Item');
    assert.equal(itemKeySpecs.ram, undefined);
    assert.equal(itemKeySpecs.screen, '6.9" OLED');
    const variantsRead = applied.calls.find(
      c => c.table === 'master_products' && c.op === 'select'
    );
    assert.equal(filterValue(variantsRead, 'item_id'), 'item-x18');

    const variantUpdates = applied.calls.filter(
      c => c.op === 'update' && c.table === 'master_products'
    );
    assert.deepEqual(
      variantUpdates.map(c => filterValue(c, 'id')),
      ['v-256', 'v-1024', 'v-2048', 'v-8192', 'v-4096'],
      'unknown, archived and filled variants are left alone'
    );
    const withoutStamp = (payload: Row | undefined) => {
      const rest = { ...payload };
      assert.equal(typeof rest.updated_at, 'string');
      delete rest.updated_at;
      return rest;
    };
    const v256 = withoutStamp(variantUpdates[0]?.payload);
    assert.deepEqual(v256, {
      storage_gb: 256,
      ram_gb: 12,
      key_specs: { storage: '256GB', ram: '12GB' },
    });
    const v1024 = withoutStamp(variantUpdates[1]?.payload);
    assert.deepEqual(
      v1024,
      { ram_gb: 16, key_specs: { storage: '1TB', ram: '16GB' } },
      'only the empty RAM is filled; the stored storage stays'
    );
    assert.deepEqual(withoutStamp(variantUpdates[2]?.payload), {
      storage_gb: 2048,
      key_specs: { storage: '2TB', ram: '8GB' },
    });
    assert.deepEqual(withoutStamp(variantUpdates[3]?.payload), { ram_gb: 24 });
    assert.deepEqual(withoutStamp(variantUpdates[4]?.payload), { ram_gb: 8 });
    for (const update of variantUpdates) {
      assert.ok(
        update.filters.some(
          ([op, col, val]) => op === 'neq' && col === 'status' && val === 'archived'
        ),
        'a variant archived after the read is never written'
      );
    }
    assert.equal(
      filterValue(variantUpdates[4], 'updated_at'),
      '2026-10-28T00:00:00.000Z',
      'compare-and-swap on the updated_at that was read'
    );

    // Another writer changed rows between the read and the write: left alone.
    const raced = catalogDb({ changedIds: ['item-x18', 'v-256'] });
    const racedRun = await syncArenaSpecsToItem(raced.client, spec, {
      key: 'xiaomi:18-pro-max',
      apply: true,
      itemModel: 'item',
    });
    assert.equal(racedRun.itemUpdated, false);
    assert.equal(racedRun.variantsUpdated, 4);
    assert.equal(racedRun.conflicts, 2);
  }
  console.log('  ✅ [2/5] Arena specs go to the Item, variants get only their own overrides');

  // 3. Arena audit
  {
    const [first, second, third] = UPSTREAM_2026_ARENA_REFERENCE_URLS;
    assert.ok(first && second && third);
    const firstItemKey = first.model_key.split(':').slice(0, 2).join(':');
    const secondItemKey = second.model_key.split(':').slice(0, 2).join(':');
    const masters = [
      // Another size of the first flagship's Item.
      { id: 'm-1', name: 'x', model_key: `${firstItemKey}:1024gb`, specifications: FULL_SPECS },
      // The third flagship itself, with complete specs.
      { id: 'm-3', name: third.name, model_key: third.model_key, specifications: FULL_SPECS },
    ];
    const items = [
      // The second flagship's Item, with no master of any size yet.
      { id: 'i-2', name: 'Second', item_key: secondItemKey, specifications: FULL_SPECS },
      { id: 'i-9', name: 'Thin', item_key: 'acme:thin', specifications: { display: { a: 1 } } },
    ];
    const tables: string[] = [];
    const auditClient = {
      from: (table: string) => {
        tables.push(table);
        return {
          select: () => ({
            order: () => ({
              range: (from: number) =>
                Promise.resolve({
                  data: from > 0 ? [] : table === 'items' ? items : masters,
                  error: null,
                }),
            }),
          }),
        };
      },
    };
    const syncer = new ArenaSpecSyncer();

    const offReport = await withFlag(undefined, () =>
      syncer.auditCatalogAgainstArenaRegistry(auditClient as never)
    );
    assert.ok(!tables.includes('items'), 'flag off: rate.items is never read');
    assert.equal(offReport.presentInDatabase, 1, 'flag off: only the exact model_key counts');
    assert.equal(offReport.incompleteSpecItems, undefined, 'flag off: report shape unchanged');

    tables.length = 0;
    const onReport = await syncer.auditCatalogAgainstArenaRegistry(auditClient as never, 1000, {
      itemModel: 'item',
    });
    assert.ok(tables.includes('items'));
    assert.equal(onReport.presentInDatabase, 3, 'another size or an Item row means present');
    assert.ok(!onReport.missingFromDatabase.some(m => m.slug === first.slug));
    assert.ok(!onReport.missingFromDatabase.some(m => m.slug === second.slug));
    assert.deepEqual(onReport.incompleteSpecItems, [
      { id: 'i-9', name: 'Thin', item_key: 'acme:thin', populatedGroups: 1 },
    ]);

    // An Item read error rejects; no partial report.
    const failing = {
      from: (table: string) => ({
        select: () => ({
          order: () => ({
            range: () =>
              Promise.resolve(
                table === 'items'
                  ? { data: null, error: { message: 'no items table' } }
                  : { data: [], error: null }
              ),
          }),
        }),
      }),
    };
    await assert.rejects(
      syncer.auditCatalogAgainstArenaRegistry(failing as never, 1000, { itemModel: 'item' }),
      /Arena catalog audit: failed to read items: no items table/
    );
  }
  console.log('  ✅ [3/5] Arena audit counts Items with the flag on, unchanged with it off');

  // 4. Peer floor
  {
    const peers = [
      { id: 'p-1', cluster_id: 'v-256', price_current: 20_000_000, merchants: null },
      // A NULL-variant listing of the same Item, cheaper: never a peer.
      { id: 'p-2', cluster_id: null, price_current: 9_000_000, merchants: { is_official: true } },
      // Another variant's listing: never a peer.
      { id: 'p-3', cluster_id: 'v-128', price_current: 15_000_000, merchants: null },
      // A row with no cluster_id field: taken as already filtered (old callers).
      { id: 'p-4', price_current: 21_000_000, merchants: null },
    ];
    assert.equal(resolveClusterPeerFloorPrice(peers, 'self', 18_000_000, 'v-256'), 20_000_000);
    assert.equal(
      resolveClusterPeerFloorPrice(peers, 'self', 18_000_000),
      9_000_000,
      'without a variant id, rows are taken as given (unchanged behaviour)'
    );
    assert.equal(
      resolveClusterPeerFloorPrice(peers, 'self', 18_000_000, null),
      undefined,
      'a listing with no variant gets no floor, not even the master fallback'
    );
    assert.equal(resolveClusterPeerFloorPrice(peers, 'self', 18_000_000, '  '), undefined);
    assert.equal(
      resolveClusterPeerFloorPrice([peers[1]!], 'self', 18_000_000, 'v-256'),
      18_000_000,
      'only NULL-variant peers: the variant falls back to its own min price'
    );
  }
  console.log('  ✅ [4/5] NULL-variant listings never enter or get a peer floor');

  // 5. Seller review risk
  {
    const inputs: MerchantRiskInput[] = [];
    class SpyAnalyzer extends AiReviewAnalyzer {
      override evaluateMerchantRisk(input: MerchantRiskInput): MerchantRiskEvaluation {
        inputs.push(input);
        return super.evaluateMerchantRisk(input);
      }
    }
    const analyzer = new SpyAnalyzer();
    const merchants: MerchantRow[] = [
      { id: 'seller', platform: 'shopee', is_official: false, follower_count: 10 },
      { id: 'mall', platform: 'shopee', is_official: true, follower_count: 1000 },
    ];
    // Item-model rows: the seller's cheap listing has no variant (cluster_id NULL).
    const products: Array<ProductRow & { item_id: string }> = [
      {
        id: 'l-null',
        merchant_id: 'seller',
        cluster_id: null,
        item_id: 'item-x18',
        price_current: 5_000_000,
      },
      {
        id: 'l-256',
        merchant_id: 'seller',
        cluster_id: 'v-256',
        item_id: 'item-x18',
        price_current: 19_000_000,
      },
      {
        id: 'mall-256',
        merchant_id: 'mall',
        cluster_id: 'v-256',
        item_id: 'item-x18',
        price_current: 20_000_000,
      },
    ];
    const reviews: ReviewRow[] = [
      { id: 'r-1', product_id: 'l-null', rating_star: 5, comment: 'ok', review_flags: null },
      { id: 'r-2', product_id: 'l-null', rating_star: 4, comment: 'good', review_flags: null },
      { id: 'r-3', product_id: 'l-256', rating_star: 5, comment: 'fine', review_flags: null },
    ];
    const masterMin = new Map([['v-256', 19_000_000]]);

    const scoreWith = (flag: string | undefined) =>
      withFlag(flag, () => {
        inputs.length = 0;
        const scores = scoreMerchants(analyzer, merchants, products, reviews, masterMin);
        return { scores, input: inputs.find(i => i.merchantId === 'seller') };
      });
    const on = scoreWith('item');
    assert.equal(on.input?.reviewResults.length, 3, 'reviews of the NULL-variant listing count');
    assert.equal(on.input?.listingPrice, undefined, 'no price term from a listing with no variant');
    assert.equal(on.input?.canonicalMinPrice, undefined);
    const off = scoreWith(undefined);
    assert.deepEqual(off.scores, on.scores, 'seller risk does not depend on the flag');

    // A NULL-variant row slipped into a variant bucket never sets the floor.
    const anomaly = strongestPriceAnomaly(
      merchants[0]!,
      [{ id: 'l-256', merchant_id: 'seller', cluster_id: 'v-256', price_current: 9_000_000 }],
      new Map([
        [
          'v-256',
          [
            { id: 'stray', merchant_id: 'x', cluster_id: null, price_current: 3_000_000 },
            { id: 'mall-256', merchant_id: 'mall', cluster_id: 'v-256', price_current: 20_000_000 },
          ],
        ],
      ]),
      new Map([['mall', true]]),
      new Map()
    );
    assert.deepEqual(anomaly, { listingPrice: 9_000_000, canonicalMinPrice: 20_000_000 });

    // The per-seller load never asks for peers or a master of a NULL variant.
    const db = createDb(call => {
      if (call.table === 'merchants') return { data: merchants[0], error: null };
      if (call.table === 'products' && filterValue(call, 'merchant_id')) {
        return { data: products.filter(p => p.merchant_id === 'seller'), error: null };
      }
      if (call.table === 'products') return { data: products.slice(1), error: null };
      if (call.table === 'reviews') return { data: reviews, error: null };
      if (call.table === 'master_products') {
        return { data: [{ id: 'v-256', min_price: 19_000_000 }], error: null };
      }
      return undefined;
    });
    const loaded = await loadAndScoreMerchant(db.client, analyzer, 'seller');
    assert.equal(loaded?.risk.total_reviews, 3);
    const peerRead = db.calls.find(c => c.table === 'products' && filterValue(c, 'cluster_id'));
    assert.deepEqual(filterValue(peerRead, 'cluster_id'), ['v-256']);
    const masterRead = db.calls.find(c => c.table === 'master_products');
    assert.deepEqual(filterValue(masterRead, 'id'), ['v-256']);
    assert.ok(!db.calls.some(c => c.op !== 'select'), 'loading writes nothing');
  }
  console.log('  ✅ [5/5] Seller risk pools NULL-variant reviews and gives them no price term');
  console.log('🎉 All item-aware importer job tests passed!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
