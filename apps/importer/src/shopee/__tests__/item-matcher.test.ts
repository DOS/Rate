/**
 * Item-first matching (DOS/Rate#1151, design doc 4.5):
 * 1. RATE_ITEM_MODEL parsing (default off, typos read as off)
 * 2. Normalizer Item fields: item_key/variant_key/variant_known/variant_source, no empty segment
 * 3. Mode off: resolveItemAndVariant is today's master matcher, never touches rate.items
 * 4. Modes item / nullable_variant: Item tiers, exact variant, size not stated (#1105), hints
 * 5. Pipeline: item_id / variant_source / nullable cluster_id writes, archived masterIdHint,
 *    a manual variant is kept, unkeyable titles are rejected before any write
 * 6. Seeds as Item plus variants, Item specs from the seeds; a new variant of a known
 *    Item inherits its specs and publish state (DOS/Rate#1152, group 4)
 */
import assert from 'node:assert/strict';
import { composeModelKey, splitModelKey } from '@repo/shared-data';
import { EntityMatcher } from '../entity-matcher.js';
import { FLAGSHIP_DEVICES_TO_SEED, flagshipSeedsByItem } from '../flagship-seed-data.js';
import { syncItemSeedSpecs } from '../jobs/backfill-specs.js';
import { ITEM_MODEL_ENV, resolveItemModelMode } from '../item-model-flag.js';
import { ProductNormalizer, UnkeyableProductTitleError } from '../product-normalizer.js';
import { ShopeeIngestionPipeline } from '../shopee-to-supabase.js';
import { AiSpecEnricher } from '../ai-spec-enricher.js';
import { AiReviewAnalyzer } from '../ai-review-analyzer.js';
import type { RateSupabaseClient, ShopeeProduct } from '../types.js';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

interface Call {
  table: string;
  op: 'select' | 'upsert' | 'insert' | 'update' | 'rpc';
  cols?: string;
  payload?: Row;
  filters: Array<[string, unknown]>;
}

/**
 * Chainable PostgREST stand-in. Every query resolves through `handler`, which sees the
 * table, operation, selected columns, payload and eq filters; unhandled calls resolve empty.
 */
function createDb(handler: (call: Call) => Result | undefined) {
  const calls: Call[] = [];
  const run = (call: Call): Result => handler(call) ?? { data: null, error: null };
  const builder = (call: Call) => {
    const b: Record<string, unknown> = {};
    for (const name of ['neq', 'gt', 'gte', 'lte', 'lt', 'in', 'order', 'limit', 'is']) {
      b[name] = () => b;
    }
    b.eq = (col: string, val: unknown) => {
      call.filters.push([col, val]);
      return b;
    };
    b.select = (cols: string) => {
      if (call.op === 'select') call.cols = cols;
      return b;
    };
    b.maybeSingle = () => Promise.resolve(run(call));
    b.single = () => Promise.resolve(run(call));
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
        upsert: (payload: Row) => start('upsert', { payload }),
        insert: (payload: Row) => start('insert', { payload }),
        update: (payload: Row) => start('update', { payload }),
      };
    },
    rpc(fn: string, args: Row) {
      const call: Call = { table: fn, op: 'rpc', payload: args, filters: [] };
      calls.push(call);
      return Promise.resolve(run(call));
    },
  } as unknown as RateSupabaseClient;
  return { client, calls };
}

const filter = (call: Call, col: string) => call.filters.find(([c]) => c === col)?.[1];

/** Enricher stub: Tier 3 never calls an AI provider in these tests. */
const passthroughEnricher = {
  enrichCandidate: async <T>(candidate: T) => candidate,
} as unknown as AiSpecEnricher;

const normalizer = new ProductNormalizer();
const candidateFor = (title: string) => normalizer.normalize({ title } as ShopeeProduct);

interface ItemDb {
  items?: Array<{
    id: string;
    item_key: string;
    status?: string;
    description?: string;
    specifications?: Row;
    key_specs?: Row;
    images?: string[];
  }>;
  variants?: Array<{ id: string; item_id: string; variant_key: string; status?: string }>;
  matchItem?: Row[];
  matchItemErr?: { message: string };
  /** item_id the M1 trigger gives a newly seeded master; null = migration missing. */
  seededItemId?: string | null;
}

/** Answers the matcher's reads and writes from an in-memory Item / variant table. */
function itemDbAnswer(opts: ItemDb, call: Call): Result | undefined {
  if (call.table === 'items' && call.op === 'select') {
    const [[col, val] = []] = call.filters;
    const row = (opts.items ?? []).find(i => (col === 'id' ? i.id : i.item_key) === val);
    return { data: row ?? null, error: null };
  }
  if (call.table === 'match_item') {
    return { data: opts.matchItem ?? [], error: opts.matchItemErr ?? null };
  }
  if (call.table === 'match_master_product') return { data: [], error: null };
  if (call.table === 'master_products' && call.op === 'select') {
    const itemId = filter(call, 'item_id');
    if (itemId !== undefined) {
      const rows = (opts.variants ?? [])
        .filter(v => v.item_id === itemId)
        .map(v => ({ id: v.id, variant_key: v.variant_key, status: v.status ?? 'published' }));
      return { data: rows, error: null };
    }
    if (call.cols === 'item_id') {
      return { data: { item_id: opts.seededItemId ?? null }, error: null };
    }
    return { data: null, error: null }; // Tier 1 model_key / race winner: not found
  }
  if (call.table === 'master_products' && call.op === 'upsert') {
    return { data: [{ id: 'seeded-master' }], error: null };
  }
  return undefined;
}

const createItemDb = (opts: ItemDb = {}) => createDb(call => itemDbAnswer(opts, call));

const ZENBOOK_ITEM = { id: 'item-zenbook', item_key: 'asus:zenbook-s-14' };
const ZENBOOK_1TB = {
  id: 'master-zenbook-1tb',
  item_id: 'item-zenbook',
  variant_key: '1024gb',
};

async function run() {
  console.log('🧪 Item-first matcher suite (DOS/Rate#1151)');

  // 1. Flag parsing
  assert.equal(ITEM_MODEL_ENV, 'RATE_ITEM_MODEL');
  assert.equal(resolveItemModelMode(undefined), 'off');
  assert.equal(resolveItemModelMode(''), 'off');
  assert.equal(resolveItemModelMode('item'), 'item');
  assert.equal(resolveItemModelMode(' Nullable-Variant '), 'nullable_variant');
  assert.equal(resolveItemModelMode('nullable'), 'off', 'a typo must never enable writes');
  assert.equal(resolveItemModelMode(true), 'off');
  console.log('  ✅ [1/6] RATE_ITEM_MODEL defaults to off');

  // 2. Normalizer Item fields
  const cases: Array<[string, Row]> = [
    [
      'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
      {
        model_key: 'apple:iphone-16-pro-max:256gb',
        item_key: 'apple:iphone-16-pro-max',
        variant_key: '256gb',
        item_name: 'Apple iPhone 16 Pro Max',
        item_slug: 'apple-iphone-16-pro-max',
        variant_known: true,
        variant_source: 'title',
        keyable: true,
      },
    ],
    [
      'Laptop ASUS Zenbook S 14 UX5406AA-SU348W',
      {
        model_key: 'asus:zenbook-s-14:unknown',
        item_key: 'asus:zenbook-s-14',
        variant_key: 'unknown',
        variant_known: false,
        variant_source: null,
        keyable: true,
      },
    ],
    [
      'Tai nghe Bluetooth Apple AirPods Pro 2 (USB-C) Chính hãng VN/A',
      {
        model_key: 'apple:airpods-pro-2:unknown',
        variant_known: true,
        variant_source: 'single_variant',
      },
    ],
    [
      'Apple Watch Ultra 2 49mm GPS + Cellular',
      { variant_key: '64gb', variant_known: true, variant_source: 'single_size' },
    ],
    [
      'Samsung',
      {
        model_key: 'samsung:unkeyed:unknown',
        item_key: 'samsung:unkeyed',
        keyable: false,
        needs_review: true,
      },
    ],
    ['', { model_key: 'khac:unkeyed:unknown', keyable: false, brand: 'Khác', slug: 'khac' }],
  ];
  for (const [title, expected] of cases) {
    const c = candidateFor(title) as unknown as Row;
    for (const [field, value] of Object.entries(expected)) {
      assert.deepEqual(c[field], value, `${JSON.stringify(title)}: ${field}`);
    }
    const parts = splitModelKey(c.model_key as string);
    assert.ok(parts, `${JSON.stringify(title)}: model_key has no empty segment`);
    assert.equal(parts.itemKey, c.item_key);
    assert.equal(parts.variantKey, c.variant_key);
    assert.equal(composeModelKey(c.item_key as string, c.variant_key as string), c.model_key);
  }
  console.log('  ✅ [2/6] Normalizer emits item_key/variant_key and never an empty segment');

  // 3. Mode off: today's matcher, no rate.items access
  {
    const db = createItemDb({ items: [ZENBOOK_ITEM], variants: [ZENBOOK_1TB] });
    const matcher = new EntityMatcher(db.client, passthroughEnricher, { itemModel: 'off' });
    const result = await matcher.resolveItemAndVariant(
      candidateFor('Laptop ASUS Zenbook S 14 UX5406AA-SU348W'),
      'cat-laptops'
    );
    assert.deepEqual(result, {
      itemId: null,
      masterId: 'seeded-master',
      isNew: true,
      variantSource: null,
    });
    assert.ok(!db.calls.some(c => c.table === 'items' || c.table === 'match_item'));
    assert.ok(db.calls.some(c => c.table === 'match_master_product'));
    const seeded = db.calls.find(c => c.op === 'upsert');
    assert.equal(seeded?.payload?.model_key, 'asus:zenbook-s-14:unknown');
    assert.ok(!('item_id' in (seeded?.payload ?? {})));

    const envDefault = process.env[ITEM_MODEL_ENV];
    delete process.env[ITEM_MODEL_ENV];
    assert.equal(new EntityMatcher(db.client, passthroughEnricher).itemModel, 'off');
    if (envDefault !== undefined) process.env[ITEM_MODEL_ENV] = envDefault;

    await assert.rejects(
      matcher.resolveOrCreateMasterProduct(candidateFor('Samsung')),
      UnkeyableProductTitleError
    );
  }
  console.log('  ✅ [3/6] Mode off keeps the master matcher and never reads rate.items');

  // 4. Item modes
  {
    // Known size, exact variant of an exact Item.
    const db = createItemDb({
      items: [{ id: 'item-ip16pm', item_key: 'apple:iphone-16-pro-max' }],
      variants: [{ id: 'master-ip16pm-256', item_id: 'item-ip16pm', variant_key: '256gb' }],
    });
    const matcher = new EntityMatcher(db.client, passthroughEnricher, { itemModel: 'item' });
    const result = await matcher.resolveItemAndVariant(
      candidateFor('Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A')
    );
    assert.deepEqual(result, {
      itemId: 'item-ip16pm',
      masterId: 'master-ip16pm-256',
      isNew: false,
      variantSource: 'title',
    });
    assert.ok(!db.calls.some(c => c.table === 'match_master_product' || c.op === 'upsert'));
  }
  {
    // Known size missing on a known Item: the variant is created under the Item's key.
    const db = createItemDb({ items: [ZENBOOK_ITEM], variants: [ZENBOOK_1TB] });
    const matcher = new EntityMatcher(db.client, passthroughEnricher, { itemModel: 'item' });
    const result = await matcher.resolveItemAndVariant(
      candidateFor('Laptop ASUS Zenbook S 14 UX5406AA 16GB 512GB SSD'),
      'cat-laptops'
    );
    assert.equal(result.itemId, 'item-zenbook');
    assert.equal(result.masterId, 'seeded-master');
    assert.equal(result.isNew, true);
    assert.equal(
      db.calls.find(c => c.op === 'upsert')?.payload?.model_key,
      'asus:zenbook-s-14:512gb'
    );
  }
  {
    // DOS/Rate#1152: a new size of a known Item takes the Item's specs and, for a
    // published Item, its publish state; no AI call. Storage and RAM stay its own.
    let enrichCalls = 0;
    const countingEnricher = {
      enrichCandidate: async <T>(candidate: T) => {
        enrichCalls += 1;
        return candidate;
      },
    } as unknown as AiSpecEnricher;
    const itemSpecs = {
      display: { size_inch: 14, type: 'OLED 3K' },
      hardware: { chipset: 'Intel Core Ultra 7 258V', ram_gb: 32, storage_gb: 1024 },
      battery: { capacity_mah: 4700 },
    };
    const publishedItem = {
      ...ZENBOOK_ITEM,
      status: 'published',
      description: 'Zenbook S 14 (item description)',
      specifications: itemSpecs,
      key_specs: { chipset: 'Core Ultra 7 258V', storage: '1TB' },
      images: ['https://rate.vn/img/zenbook-s-14.jpg'],
    };
    const title = 'Laptop ASUS Zenbook S 14 UX5406AA 16GB 512GB SSD';
    const db = createItemDb({ items: [publishedItem], variants: [ZENBOOK_1TB] });
    const result = await new EntityMatcher(db.client, countingEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor(title), 'cat-laptops');
    assert.equal(result.masterId, 'seeded-master');
    const seeded = db.calls.find(c => c.op === 'upsert')?.payload as Row;
    assert.equal(seeded.model_key, 'asus:zenbook-s-14:512gb');
    assert.equal(seeded.status, 'published', 'a new size of a published Item is published');
    assert.equal(seeded.storage_gb, 512);
    assert.equal(seeded.description, 'Zenbook S 14 (item description)');
    assert.deepEqual(seeded.images, ['https://rate.vn/img/zenbook-s-14.jpg']);
    const seededSpecs = seeded.specifications as { display?: Row; hardware?: Row };
    assert.equal(seededSpecs.display?.type, 'OLED 3K');
    assert.equal(seededSpecs.hardware?.chipset, 'Intel Core Ultra 7 258V');
    assert.equal(seededSpecs.hardware?.storage_gb, 512, 'storage is the variant own value');
    assert.equal(seededSpecs.hardware?.ram_gb, 16, 'RAM is the variant own value');
    const seededKeySpecs = seeded.key_specs as Row;
    assert.equal(seededKeySpecs.chipset, 'Core Ultra 7 258V');
    assert.equal(seeded.battery_mah, 4700, 'flat battery follows the inherited specs');
    assert.equal(seeded.screen_size_inch, 14);
    assert.equal(seeded.ram_gb, 16);
    assert.notEqual(seededKeySpecs.storage, '1TB');
    assert.equal(enrichCalls, 0, 'an inherited variant needs no AI enrichment');

    // A draft Item keeps its new variant a draft; a used listing never publishes one.
    const draftDb = createItemDb({
      items: [{ ...publishedItem, status: 'draft' }],
      variants: [ZENBOOK_1TB],
    });
    await new EntityMatcher(draftDb.client, countingEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor(title), 'cat-laptops');
    assert.equal(draftDb.calls.find(c => c.op === 'upsert')?.payload?.status, 'draft');
    const usedDb = createItemDb({ items: [publishedItem], variants: [ZENBOOK_1TB] });
    await new EntityMatcher(usedDb.client, countingEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor(`${title} cũ đẹp 99%`), 'cat-laptops');
    assert.equal(usedDb.calls.find(c => c.op === 'upsert')?.payload?.status, 'draft');

    // An Item with no specs yet: the variant is enriched and seeded as before (the
    // Zenbook is a registry model, so the old rule publishes it).
    const bareDb = createItemDb({
      items: [{ ...ZENBOOK_ITEM, status: 'published' }],
      variants: [ZENBOOK_1TB],
    });
    await new EntityMatcher(bareDb.client, countingEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor(title), 'cat-laptops');
    assert.equal(enrichCalls, 1);
    assert.equal(bareDb.calls.find(c => c.op === 'upsert')?.payload?.status, 'published');
    for (const status of ['draft', 'archived']) {
      const unpublishedDb = createItemDb({
        items: [{ ...ZENBOOK_ITEM, status }],
        variants: [ZENBOOK_1TB],
      });
      await new EntityMatcher(unpublishedDb.client, countingEnricher, {
        itemModel: 'item',
      }).resolveItemAndVariant(candidateFor(title), 'cat-laptops');
      assert.equal(
        unpublishedDb.calls.find(c => c.op === 'upsert')?.payload?.status,
        'draft',
        `a new variant of a ${status} Item stays a draft`
      );
    }
  }
  {
    // #1105: a storage-less title on a multi-size Item never lands on the sized variant.
    const title = 'Laptop ASUS Zenbook S 14 UX5406AA-SU348W';
    const nullable = createItemDb({ items: [ZENBOOK_ITEM], variants: [ZENBOOK_1TB] });
    const nullableResult = await new EntityMatcher(nullable.client, passthroughEnricher, {
      itemModel: 'nullable_variant',
    }).resolveItemAndVariant(candidateFor(title));
    assert.deepEqual(nullableResult, {
      itemId: 'item-zenbook',
      masterId: null,
      isNew: false,
      variantSource: null,
    });
    assert.ok(!nullable.calls.some(c => c.op === 'upsert' || c.table === 'match_master_product'));

    const itemMode = createItemDb({ items: [ZENBOOK_ITEM], variants: [ZENBOOK_1TB] });
    const itemResult = await new EntityMatcher(itemMode.client, passthroughEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor(title));
    assert.equal(itemResult.itemId, 'item-zenbook');
    assert.notEqual(itemResult.masterId, ZENBOOK_1TB.id);
    assert.equal(
      itemMode.calls.find(c => c.op === 'upsert')?.payload?.model_key,
      'asus:zenbook-s-14:unknown',
      'mode item keeps a variant: the Item’s unknown one'
    );

    const withUnknown = createItemDb({
      items: [ZENBOOK_ITEM],
      variants: [
        ZENBOOK_1TB,
        { id: 'master-zenbook-unknown', item_id: 'item-zenbook', variant_key: 'unknown' },
      ],
    });
    const reuse = await new EntityMatcher(withUnknown.client, passthroughEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor(title));
    assert.equal(reuse.masterId, 'master-zenbook-unknown');

    // An archived sized variant does not make the Item multi-size.
    const archived = createItemDb({
      items: [ZENBOOK_ITEM],
      variants: [
        { ...ZENBOOK_1TB, status: 'archived' },
        { id: 'master-zenbook-unknown', item_id: 'item-zenbook', variant_key: 'unknown' },
      ],
    });
    const single = await new EntityMatcher(archived.client, passthroughEnricher, {
      itemModel: 'nullable_variant',
    }).resolveItemAndVariant(candidateFor(title));
    assert.equal(single.masterId, 'master-zenbook-unknown');
  }
  {
    // Single-variant Item (earbuds): its one variant, even in nullable mode.
    const db = createItemDb({
      items: [{ id: 'item-app2', item_key: 'apple:airpods-pro-2' }],
      variants: [{ id: 'master-app2', item_id: 'item-app2', variant_key: 'unknown' }],
    });
    const result = await new EntityMatcher(db.client, passthroughEnricher, {
      itemModel: 'nullable_variant',
    }).resolveItemAndVariant(candidateFor('Tai nghe Apple AirPods Pro 2 (USB-C) Chính hãng VN/A'));
    assert.deepEqual(result, {
      itemId: 'item-app2',
      masterId: 'master-app2',
      isNew: false,
      variantSource: 'single_variant',
    });
  }
  {
    // Item Tier 2: fuzzy on Item names, then the variant under the matched Item's key.
    const db = createItemDb({
      items: [{ id: 'item-s24u', item_key: 'samsung:galaxy-s24-ultra' }],
      variants: [{ id: 'master-s24u-256', item_id: 'item-s24u', variant_key: '256gb' }],
      matchItem: [
        { item_id: 'item-s24u', item_key: 'samsung:galaxy-s24-ultra', name: 'x', similarity: 0.82 },
      ],
    });
    const candidate = { ...candidateFor('Samsung Galaxy S24 Ultra 5G 12GB/256GB Chính hãng') };
    candidate.model_key = 'samsung:galaxy-s24-ultra-5g:256gb';
    const result = await new EntityMatcher(db.client, passthroughEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidate);
    assert.equal(result.itemId, 'item-s24u');
    assert.equal(result.masterId, 'master-s24u-256');
    const rpc = db.calls.find(c => c.table === 'match_item');
    assert.equal(rpc?.payload?.search_title, candidate.item_name);
    assert.ok(!/256/.test(String(rpc?.payload?.search_title)), 'Item search has no size');
    assert.equal(rpc?.payload?.p_threshold, 0.65);
  }
  {
    // No Item: seed the master (draft when ambiguous); the M1 trigger gives its item_id.
    const db = createItemDb({
      matchItem: [{ item_id: 'item-other', item_key: 'apple:iphone-15', similarity: 0.67 }],
      seededItemId: 'item-new',
    });
    const result = await new EntityMatcher(db.client, passthroughEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor('Apple iPhone 15 Plus 128GB Chính hãng VN/A'));
    assert.deepEqual(result, {
      itemId: 'item-new',
      masterId: 'seeded-master',
      isNew: true,
      variantSource: 'title',
    });
    assert.equal(db.calls.find(c => c.op === 'upsert')?.payload?.status, 'draft');

    const noMigration = createItemDb({ seededItemId: null });
    await assert.rejects(
      new EntityMatcher(noMigration.client, passthroughEnricher, {
        itemModel: 'item',
      }).resolveItemAndVariant(candidateFor('Apple iPhone 15 Plus 128GB')),
      /DOS\/Rate#1150/
    );
    await assert.rejects(
      new EntityMatcher(
        createItemDb({ matchItemErr: { message: 'boom' } }).client,
        passthroughEnricher,
        {
          itemModel: 'item',
        }
      ).resolveItemAndVariant(candidateFor('Apple iPhone 15 Plus 128GB')),
      /Item Tier 2 fuzzy match failed \(model_key apple:iphone-15-plus:128gb\): boom/
    );
    await assert.rejects(
      new EntityMatcher(createItemDb().client, passthroughEnricher, {
        itemModel: 'item',
      }).resolveItemAndVariant(candidateFor('Samsung')),
      UnkeyableProductTitleError
    );
  }
  {
    // itemIdHint wins over the key; the variant still comes from the title.
    const db = createItemDb({
      items: [ZENBOOK_ITEM],
      variants: [ZENBOOK_1TB],
    });
    const result = await new EntityMatcher(db.client, passthroughEnricher, {
      itemModel: 'nullable_variant',
    }).resolveItemAndVariant(candidateFor('ASUS Zenbook S14 OLED'), undefined, undefined, {
      itemIdHint: 'item-zenbook',
    });
    assert.deepEqual(result, {
      itemId: 'item-zenbook',
      masterId: null,
      isNew: false,
      variantSource: null,
    });
    assert.ok(!db.calls.some(c => c.table === 'match_item'));
  }
  {
    // A retired (archived) unknown variant is never seeded again or adopted.
    const retired = {
      items: [ZENBOOK_ITEM],
      variants: [
        ZENBOOK_1TB,
        {
          id: 'master-zenbook-unknown',
          item_id: 'item-zenbook',
          variant_key: 'unknown',
          status: 'archived',
        },
      ],
    };
    const title = 'Laptop ASUS Zenbook S 14 UX5406AA-SU348W';
    const itemDb = createItemDb(retired);
    await assert.rejects(
      new EntityMatcher(itemDb.client, passthroughEnricher, {
        itemModel: 'item',
      }).resolveItemAndVariant(candidateFor(title)),
      /archived/
    );
    assert.ok(!itemDb.calls.some(c => c.op === 'upsert'));
    const singleRetired = createItemDb({
      items: [ZENBOOK_ITEM],
      variants: [{ ...retired.variants[1]! }],
    });
    const none = await new EntityMatcher(singleRetired.client, passthroughEnricher, {
      itemModel: 'nullable_variant',
    }).resolveItemAndVariant(candidateFor(title));
    assert.equal(none.masterId, null);
    assert.ok(!singleRetired.calls.some(c => c.op === 'upsert'));
  }
  {
    // An archived sized variant takes no new listing in nullable mode; mode item keeps Tier 1's rule.
    const archived1tb = {
      items: [ZENBOOK_ITEM],
      variants: [{ ...ZENBOOK_1TB, status: 'archived' }],
    };
    const title = 'Laptop ASUS Zenbook S 14 UX5406AA 1TB';
    const nullable = await new EntityMatcher(
      createItemDb(archived1tb).client,
      passthroughEnricher,
      {
        itemModel: 'nullable_variant',
      }
    ).resolveItemAndVariant(candidateFor(title));
    assert.equal(nullable.masterId, null);
    const itemMode = await new EntityMatcher(
      createItemDb(archived1tb).client,
      passthroughEnricher,
      {
        itemModel: 'item',
      }
    ).resolveItemAndVariant(candidateFor(title));
    assert.equal(itemMode.masterId, ZENBOOK_1TB.id);
  }
  {
    // A fuzzy Item hit never creates a variant under that Item's key.
    const db = createItemDb({
      items: [{ id: 'item-ip15p', item_key: 'apple:iphone-15-pro' }],
      variants: [{ id: 'master-ip15p-128', item_id: 'item-ip15p', variant_key: '128gb' }],
      matchItem: [
        { item_id: 'item-ip15p', item_key: 'apple:iphone-15-pro', name: 'x', similarity: 0.9 },
      ],
      seededItemId: 'item-ip15pm',
    });
    const result = await new EntityMatcher(db.client, passthroughEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor('Apple iPhone 15 Pro Max 256GB Chính hãng VN/A'));
    assert.equal(
      db.calls.find(c => c.op === 'upsert')?.payload?.model_key,
      'apple:iphone-15-pro-max:256gb'
    );
    assert.equal(result.itemId, 'item-ip15pm');
  }
  {
    // A sizeless line keyed `unknown` reuses a seeded `standard` variant.
    const db = createItemDb({
      items: [{ id: 'item-app2', item_key: 'apple:airpods-pro-2' }],
      variants: [{ id: 'master-app2-std', item_id: 'item-app2', variant_key: 'standard' }],
    });
    const result = await new EntityMatcher(db.client, passthroughEnricher, {
      itemModel: 'item',
    }).resolveItemAndVariant(candidateFor('Tai nghe Apple AirPods Pro 2 (USB-C) Chính hãng VN/A'));
    assert.equal(result.masterId, 'master-app2-std');
    assert.ok(!db.calls.some(c => c.op === 'upsert'));
  }
  console.log('  ✅ [4/6] Item tiers, exact variants, size not stated (#1105) and hints');

  // 5. Pipeline writes
  const product = (title: string): ShopeeProduct => ({
    platform: 'shopee',
    itemId: 'item-1151',
    shopId: 'shop-1151',
    title,
    priceMin: 25_000_000,
    priceMax: 25_000_000,
    currency: 'VND',
    historicalSold: 1,
    ratingStar: 5,
    ratingCount: 1,
    images: [],
    models: [],
    attributes: [],
    shop: { shopId: 'shop-1151', name: 'Shop', isMall: false, ratingStar: 5, followerCount: 1 },
    reviews: [],
    url: 'https://shopee.vn/product/shop-1151/item-1151',
  });
  const ingest = async (
    mode: 'off' | 'item' | 'nullable_variant',
    title: string,
    item: ItemDb,
    extra: { hint?: Row | null; stored?: Row | null; failOn?: 'stored' | 'kept' } = {},
    options: { masterIdHint?: string; itemIdHint?: string } = {}
  ) => {
    const db = createDb(call => {
      if (call.table === 'categories') {
        return { data: [{ id: 'cat-laptops', slug: 'laptops' }], error: null };
      }
      if (call.table === 'merchants') return { data: { id: 'merchant-1' }, error: null };
      if (call.table === 'products' && call.op === 'upsert') {
        return { data: { id: 'product-1' }, error: null };
      }
      if (call.table === 'products' && call.op === 'select') {
        if (extra.failOn === 'stored') return { data: null, error: { message: 'boom' } };
        return { data: extra.stored ?? null, error: null };
      }
      if (call.table === 'record_price_observation') return { data: 'inserted', error: null };
      if (call.table === 'master_products' && call.op === 'select' && call.cols === 'id, item_id') {
        if (extra.failOn === 'kept') return { data: null, error: { message: 'boom' } };
        const variant = (item.variants ?? []).find(v => v.id === filter(call, 'id'));
        return { data: variant ? { id: variant.id, item_id: variant.item_id } : null, error: null };
      }
      if (
        call.table === 'master_products' &&
        call.op === 'select' &&
        filter(call, 'id') !== undefined &&
        call.cols !== 'item_id'
      ) {
        return { data: extra.hint ?? null, error: null };
      }
      return itemDbAnswer(item, call);
    });
    const pipeline = new ShopeeIngestionPipeline({ supabaseClient: db.client, itemModel: mode });
    (pipeline as unknown as { matcher: EntityMatcher }).matcher = new EntityMatcher(
      db.client,
      passthroughEnricher,
      { itemModel: mode }
    );
    const result = await pipeline.ingestProduct(product(title), undefined, {
      pricesOnly: true,
      ...options,
    });
    const listing = db.calls.find(c => c.table === 'products' && c.op === 'upsert')?.payload;
    const rpcs = db.calls.filter(c => c.op === 'rpc').map(c => c.table);
    return { result, listing, rpcs, calls: db.calls };
  };

  const zenbook = { items: [ZENBOOK_ITEM], variants: [ZENBOOK_1TB] };
  const bareTitle = 'Laptop ASUS Zenbook S 14 UX5406AA-SU348W';
  {
    const off = await ingest('off', 'Laptop ASUS Zenbook S 14 UX5406AA 1TB', zenbook);
    assert.ok(off.listing && !('item_id' in off.listing) && !('variant_source' in off.listing));
    assert.equal(off.result.itemId, null);
    assert.ok(!off.rpcs.includes('refresh_item_stats'));
    assert.ok(!off.calls.some(c => c.table === 'items'));
  }
  {
    const nullable = await ingest('nullable_variant', bareTitle, zenbook);
    assert.equal(nullable.listing?.cluster_id, null);
    assert.equal(nullable.listing?.item_id, 'item-zenbook');
    assert.equal(nullable.listing?.variant_source, null);
    assert.deepEqual(
      { masterId: nullable.result.masterId, itemId: nullable.result.itemId },
      { masterId: null, itemId: 'item-zenbook' }
    );
    assert.ok(!nullable.rpcs.includes('refresh_master_market_stats'));
    assert.ok(nullable.rpcs.includes('refresh_item_stats'));

    const sized = await ingest('item', 'Laptop ASUS Zenbook S 14 UX5406AA 1TB', zenbook);
    assert.equal(sized.listing?.cluster_id, ZENBOOK_1TB.id);
    assert.equal(sized.listing?.item_id, 'item-zenbook');
    assert.equal(sized.listing?.variant_source, 'title');
    assert.ok(sized.rpcs.includes('refresh_master_market_stats'));
  }
  {
    // A variant set by hand survives a crawl that states no size.
    const kept = await ingest('nullable_variant', bareTitle, zenbook, {
      stored: { cluster_id: ZENBOOK_1TB.id, variant_source: 'manual' },
    });
    assert.equal(kept.listing?.cluster_id, ZENBOOK_1TB.id);
    assert.ok(!('variant_source' in (kept.listing ?? {})));

    // Mode item too: the Item's unknown variant never replaces a hand-set one.
    const keptItem = await ingest(
      'item',
      bareTitle,
      {
        ...zenbook,
        variants: [
          ZENBOOK_1TB,
          { id: 'master-zenbook-unknown', item_id: 'item-zenbook', variant_key: 'unknown' },
        ],
      },
      { stored: { cluster_id: ZENBOOK_1TB.id, variant_source: 'manual' } }
    );
    assert.equal(keptItem.listing?.cluster_id, ZENBOOK_1TB.id);
    assert.ok(!('variant_source' in (keptItem.listing ?? {})));

    // A hand-set variant wins even over a size stated in the title.
    const manualWins = await ingest(
      'nullable_variant',
      'Laptop ASUS Zenbook S 14 UX5406AA 1TB',
      zenbook,
      {
        stored: { cluster_id: 'master-zenbook-512', variant_source: 'manual' },
      }
    );
    assert.equal(manualWins.listing?.cluster_id, 'master-zenbook-512');
    assert.ok(!('variant_source' in (manualWins.listing ?? {})));

    // Title evidence stays when a later crawl has none; a legacy link does not.
    const evidenceKept = await ingest('nullable_variant', bareTitle, zenbook, {
      stored: { cluster_id: ZENBOOK_1TB.id, variant_source: 'title' },
    });
    assert.equal(evidenceKept.listing?.cluster_id, ZENBOOK_1TB.id);
    const legacyDropped = await ingest('nullable_variant', bareTitle, zenbook, {
      stored: { cluster_id: ZENBOOK_1TB.id, variant_source: 'legacy' },
    });
    assert.equal(legacyDropped.listing?.cluster_id, null);

    // A newer size stated in the title moves an evidence-based variant.
    const moved = await ingest('item', 'Laptop ASUS Zenbook S 14 UX5406AA 1TB', zenbook, {
      stored: { cluster_id: 'master-zenbook-512', variant_source: 'title' },
    });
    assert.equal(moved.listing?.cluster_id, ZENBOOK_1TB.id);
    assert.equal(moved.listing?.variant_source, 'title');
    // ...and the variant it left is refreshed as well as the new one.
    const refreshed = moved.calls
      .filter(c => c.op === 'rpc' && c.table === 'refresh_master_market_stats')
      .map(c => c.payload?.p_master_id);
    assert.deepEqual(refreshed, [ZENBOOK_1TB.id, 'master-zenbook-512']);

    const left = await ingest('nullable_variant', bareTitle, zenbook, {
      stored: { cluster_id: 'master-zenbook-unknown', variant_source: null },
    });
    assert.equal(left.listing?.cluster_id, null);
    assert.deepEqual(
      left.calls
        .filter(c => c.op === 'rpc' && c.table === 'refresh_master_market_stats')
        .map(c => c.payload?.p_master_id),
      ['master-zenbook-unknown']
    );
  }
  {
    // DOS/Rate#1185: a kept variant brings its own Item, never the title's.
    const vivobook = { id: 'item-vivobook', item_key: 'asus:vivobook-15' };
    const vivobook512 = {
      id: 'master-vivobook-512',
      item_id: 'item-vivobook',
      variant_key: '512gb',
    };
    const twoItems = { items: [ZENBOOK_ITEM, vivobook], variants: [ZENBOOK_1TB, vivobook512] };
    const itemStats = (calls: Call[]) =>
      calls
        .filter(c => c.op === 'rpc' && c.table === 'refresh_item_stats')
        .map(c => c.payload?.p_item_id);
    for (const mode of ['item', 'nullable_variant'] as const) {
      // A repurposed listing: the title now names the Zenbook, the hand-set variant is a Vivobook.
      const repurposed = await ingest(mode, bareTitle, twoItems, {
        stored: { cluster_id: vivobook512.id, variant_source: 'manual', item_id: vivobook.id },
      });
      assert.equal(repurposed.listing?.cluster_id, vivobook512.id, mode);
      assert.equal(repurposed.listing?.item_id, vivobook.id, mode);
      assert.equal(repurposed.result.itemId, vivobook.id, mode);
      assert.deepEqual(itemStats(repurposed.calls), [vivobook.id], mode);

      // Title evidence kept on a crawl without a size: same rule.
      const evidence = await ingest(mode, bareTitle, twoItems, {
        stored: { cluster_id: vivobook512.id, variant_source: 'title', item_id: vivobook.id },
      });
      assert.equal(evidence.listing?.cluster_id, vivobook512.id, mode);
      assert.equal(evidence.listing?.item_id, vivobook.id, mode);
    }
    // A kept variant with no Item clears a stale item_id rather than write the title's.
    const orphan = await ingest('item', bareTitle, zenbook, {
      stored: { cluster_id: 'master-zenbook-512', variant_source: 'manual', item_id: vivobook.id },
    });
    assert.ok(orphan.listing && 'item_id' in orphan.listing);
    assert.equal(orphan.listing?.item_id, null);
    assert.equal(orphan.result.itemId, null);
    assert.deepEqual(itemStats(orphan.calls), [vivobook.id]);

    // A failed read of the stored listing or the kept variant fails the ingest.
    for (const failOn of ['stored', 'kept'] as const) {
      await assert.rejects(
        ingest('item', bareTitle, zenbook, {
          stored: { cluster_id: ZENBOOK_1TB.id, variant_source: 'manual' },
          failOn,
        }),
        /boom/,
        failOn
      );
    }

    // DOS/Rate#1185: the Item a listing leaves is refreshed too.
    const movedItem = await ingest('item', 'Laptop ASUS Zenbook S 14 UX5406AA 1TB', twoItems, {
      stored: { cluster_id: vivobook512.id, variant_source: 'title', item_id: vivobook.id },
    });
    assert.equal(movedItem.listing?.item_id, ZENBOOK_ITEM.id);
    assert.deepEqual(itemStats(movedItem.calls), [ZENBOOK_ITEM.id, vivobook.id]);
    // ...also from a variant of A to no variant under B (nullable_variant).
    const toNoVariant = await ingest('nullable_variant', bareTitle, twoItems, {
      stored: { cluster_id: vivobook512.id, variant_source: 'legacy', item_id: vivobook.id },
    });
    assert.equal(toNoVariant.listing?.cluster_id, null);
    assert.deepEqual(itemStats(toNoVariant.calls), [ZENBOOK_ITEM.id, vivobook.id]);
    // ...and when a caller hint moves it.
    const hintMove = await ingest(
      'item',
      'Laptop ASUS Zenbook S 14 UX5406AA 1TB',
      twoItems,
      {
        hint: {
          id: ZENBOOK_1TB.id,
          specifications: { display: { size: 'x' } },
          status: 'published',
          item_id: ZENBOOK_ITEM.id,
          variant_key: '1024gb',
        },
        stored: { cluster_id: vivobook512.id, variant_source: 'manual', item_id: vivobook.id },
      },
      { masterIdHint: ZENBOOK_1TB.id }
    );
    assert.equal(hintMove.listing?.cluster_id, ZENBOOK_1TB.id, 'a hint is not overridden');
    assert.deepEqual(itemStats(hintMove.calls), [ZENBOOK_ITEM.id, vivobook.id]);
    // Same Item: one refresh, no duplicate.
    const sameItem = await ingest('item', 'Laptop ASUS Zenbook S 14 UX5406AA 1TB', zenbook, {
      stored: { cluster_id: ZENBOOK_1TB.id, variant_source: 'title', item_id: ZENBOOK_ITEM.id },
    });
    assert.deepEqual(itemStats(sameItem.calls), [ZENBOOK_ITEM.id]);

    // Flag off: the stored listing is never read and no Item is refreshed.
    const off = await ingest('off', 'Laptop ASUS Zenbook S 14 UX5406AA 1TB', twoItems, {
      stored: { cluster_id: vivobook512.id, variant_source: 'manual', item_id: vivobook.id },
    });
    assert.ok(!off.calls.some(c => c.table === 'products' && c.op === 'select'));
    assert.deepEqual(itemStats(off.calls), []);
    assert.ok(off.listing && !('item_id' in off.listing));
  }
  {
    // An archived masterIdHint maps to its Item; a live one is kept.
    const archived = await ingest(
      'nullable_variant',
      bareTitle,
      zenbook,
      {
        hint: {
          id: 'master-zenbook-unknown',
          specifications: { display: { size: 'x' } },
          status: 'archived',
          item_id: 'item-zenbook',
          variant_key: 'unknown',
        },
      },
      { masterIdHint: 'master-zenbook-unknown' }
    );
    assert.equal(archived.listing?.cluster_id, null);
    assert.equal(archived.listing?.item_id, 'item-zenbook');

    const live = await ingest(
      'item',
      'Laptop ASUS Zenbook S 14 UX5406AA 1TB',
      zenbook,
      {
        hint: {
          id: ZENBOOK_1TB.id,
          specifications: { display: { size: 'x' } },
          status: 'published',
          item_id: 'item-zenbook',
          variant_key: '1024gb',
        },
      },
      { masterIdHint: ZENBOOK_1TB.id }
    );
    assert.equal(live.listing?.cluster_id, ZENBOOK_1TB.id);
    assert.equal(live.listing?.variant_source, 'title');

    // A 1TB page hinted to the Item's 512GB variant: the hint is not applied,
    // the listing is matched under the hint's Item (DOS/Rate#1197).
    const conflict = await ingest(
      'item',
      'Laptop ASUS UX5406AA 1TB chính hãng',
      zenbook,
      {
        hint: {
          id: 'master-zenbook-512',
          specifications: { display: { size: 'x' } },
          status: 'published',
          item_id: 'item-zenbook',
          variant_key: '512gb',
          storage_gb: 512,
        },
      },
      { masterIdHint: 'master-zenbook-512' }
    );
    assert.equal(conflict.listing?.cluster_id, ZENBOOK_1TB.id);
    assert.equal(conflict.listing?.item_id, 'item-zenbook');
    assert.equal(conflict.listing?.variant_source, 'title');
    assert.ok(!live.calls.some(c => c.table === 'items'), 'a live hint skips matching');

    const offHint = await ingest(
      'off',
      bareTitle,
      zenbook,
      { hint: { id: 'master-zenbook-unknown', specifications: { display: { size: 'x' } } } },
      { masterIdHint: 'master-zenbook-unknown', itemIdHint: 'item-zenbook' }
    );
    assert.equal(offHint.listing?.cluster_id, 'master-zenbook-unknown');
    assert.equal(
      offHint.calls.find(c => c.table === 'master_products' && filter(c, 'id'))?.cols,
      'id, specifications, storage_gb'
    );
  }
  {
    // itemIdHint for a storage-less page.
    const hinted = await ingest(
      'nullable_variant',
      'ASUS Zenbook S14 OLED',
      zenbook,
      {},
      {
        itemIdHint: 'item-zenbook',
      }
    );
    assert.equal(hinted.listing?.item_id, 'item-zenbook');
    assert.equal(hinted.listing?.cluster_id, null);
  }
  {
    // An unkeyable title is rejected before the merchant write.
    const db = createDb(call =>
      call.table === 'categories' ? { data: [], error: null } : undefined
    );
    const pipeline = new ShopeeIngestionPipeline({ supabaseClient: db.client, itemModel: 'off' });
    await assert.rejects(
      pipeline.ingestProduct(product('Samsung'), undefined, { pricesOnly: true }),
      UnkeyableProductTitleError
    );
    assert.ok(!db.calls.some(c => c.table === 'merchants'));

    // With a live masterIdHint the title's key is unused: the refresh still works.
    const hintedRefresh = await ingest(
      'off',
      'Samsung',
      zenbook,
      { hint: { id: 'master-legacy', specifications: { display: { size: 'x' } } } },
      { masterIdHint: 'master-legacy' }
    );
    assert.equal(hintedRefresh.listing?.cluster_id, 'master-legacy');
  }
  console.log(
    '  ✅ [5/6] Pipeline writes item_id, nullable cluster_id and keeps hand-set variants'
  );
  // 6. Seeds as Item plus variants, Item specs from the seeds (DOS/Rate#1152)
  {
    const itemSeeds = flagshipSeedsByItem();
    const seen = new Set<string>();
    for (const item of itemSeeds) {
      assert.ok(!seen.has(item.itemKey), `one Item per key: ${item.itemKey}`);
      seen.add(item.itemKey);
      assert.ok(item.variants.length > 0);
      for (const variant of item.variants) {
        assert.equal(splitModelKey(variant.model_key)?.itemKey, item.itemKey);
      }
      assert.equal(item.specifications.hardware?.storage_gb, undefined, item.itemKey);
      assert.equal(item.key_specs.storage, undefined, item.itemKey);
    }
    assert.equal(
      itemSeeds.reduce((n, item) => n + item.variants.length, 0),
      FLAGSHIP_DEVICES_TO_SEED.length,
      'every seed is a variant of exactly one Item'
    );
    const series10 = itemSeeds.find(i => i.itemKey === 'apple:watch-series-10-42mm');
    assert.equal(series10?.name, 'Apple Watch Series 10 42mm GPS');
    assert.equal(
      itemSeeds.find(i => i.itemKey === 'apple:watch-series-11-46mm')?.name,
      'Apple Watch Series 11 46mm GPS'
    );
    assert.equal(itemSeeds.find(i => i.itemKey === 'xiaomi:18-pro-max')?.name, 'Xiaomi 18 Pro Max');
    for (const item of itemSeeds) {
      assert.equal(item.specifications.hardware?.ram_gb, undefined, `no RAM on ${item.itemKey}`);
      assert.equal(item.key_specs.ram, undefined, `no RAM key spec on ${item.itemKey}`);
    }
    // The variant keeps its storage; the Item does not.
    assert.equal(series10?.variants[0]?.storage_gb, 64);

    // The registry knows the Series 10's one storage, so a bare title keys like its seed.
    assert.equal(
      normalizer.normalize({ title: 'Apple Watch Series 10 42mm GPS' } as ShopeeProduct).model_key,
      'apple:watch-series-10-42mm:64gb'
    );

    // The registry describes the 42mm case: a 46mm title gets none of its size specs and
    // is not benchmark-enriched (so it is never published on 42mm data).
    const series10Big = normalizer.normalize({
      title: 'Apple Watch Series 10 46mm GPS',
    } as ShopeeProduct);
    assert.equal(series10Big.model_key, 'apple:watch-series-10-46mm:64gb');
    assert.equal(series10Big.is_benchmark_enriched, false);
    assert.equal(series10Big.battery_mah, null);
    assert.notEqual(series10Big.screen_size_inch, 1.77);
    assert.equal(series10Big.specifications.display?.resolution, undefined);
    assert.equal(series10Big.specifications.design?.weight_g, undefined);

    // Item specs: dry-run writes nothing, apply updates the Items that exist and lists
    // the missing ones (Items are created by the M1 trigger, never here).
    const seeds = itemSeeds.filter(i =>
      ['apple:watch-series-10-42mm', 'asus:zenbook-s-14'].includes(i.itemKey)
    );
    const seedDb = (present: string[]) =>
      createDb(call =>
        call.table === 'items' && call.op === 'select'
          ? {
              data: present.includes(String(filter(call, 'item_key')))
                ? {
                    id: `item-${String(filter(call, 'item_key'))}`,
                    specifications: { hardware: { storage_gb: 1024, ram_gb: 32 } },
                    key_specs: { storage: '1TB', ram: '32GB' },
                  }
                : null,
              error: null,
            }
          : undefined
      );
    const dry = seedDb(['asus:zenbook-s-14']);
    const offRun = await syncItemSeedSpecs(dry.client, { seeds, apply: true, itemModel: 'off' });
    assert.deepEqual(offRun, { updated: 0, missing: [] });
    assert.equal(dry.calls.length, 0, 'flag off: no Item read or write');
    const dryRun = await syncItemSeedSpecs(dry.client, { seeds, itemModel: 'item' });
    assert.deepEqual(dryRun, { updated: 1, missing: ['apple:watch-series-10-42mm'] });
    assert.ok(!dry.calls.some(c => c.op === 'update'));
    const applied = seedDb(['asus:zenbook-s-14', 'apple:watch-series-10-42mm']);
    const applyRun = await syncItemSeedSpecs(applied.client, {
      seeds,
      apply: true,
      itemModel: 'item',
    });
    assert.equal(applyRun.updated, 2);
    const update = applied.calls.find(c => c.op === 'update' && c.table === 'items');
    assert.ok(update?.payload?.specifications);
    assert.equal(
      (update?.payload?.specifications as { hardware?: Row }).hardware?.storage_gb,
      undefined,
      'storage is never written on an Item, even one already there'
    );
    assert.equal(
      (update?.payload?.specifications as { hardware?: Row }).hardware?.ram_gb,
      undefined
    );
    assert.equal((update?.payload?.key_specs as Row).storage, undefined);
    assert.equal((update?.payload?.key_specs as Row).ram, undefined);
    assert.ok(!applied.calls.some(c => c.op === 'insert' || c.op === 'upsert'));
  }
  // Spec enrichment per Item: one AI ask per Item (no size in the prompt or cache key);
  // the variant keeps its own storage and RAM. Mode off still asks per size.
  {
    const asks: Array<{ storageGb: number | null; ramGb: number | null }> = [];
    const enricher = new AiSpecEnricher({ apiKey: '' });
    (enricher as unknown as { fetchSpecsFromAi: unknown }).fetchSpecsFromAi = async (params: {
      storageGb: number | null;
      ramGb: number | null;
    }) => {
      asks.push({ storageGb: params.storageGb, ramGb: params.ramGb });
      return {
        storage_gb: 1024,
        ram_gb: 32,
        specifications: {
          hardware: { chipset: 'Intel Core i5-1335U', storage_gb: 1024, ram_gb: 32 },
        },
        key_specs: { chip: 'Core i5-1335U', storage: '1TB' },
      };
    };
    const vivobook = candidateFor('Laptop ASUS Vivobook 15 X1504VA 16GB 512GB');
    assert.equal(vivobook.is_benchmark_enriched, false);
    const perItem = await enricher.enrichCandidate(vivobook, undefined, { perItem: true });
    assert.deepEqual(asks.at(-1), { storageGb: null, ramGb: null });
    assert.equal(perItem.storage_gb, 512);
    assert.equal(perItem.ram_gb, 16);
    const bare = candidateFor('Laptop ASUS Vivobook 15 X1504VA');
    const bareItem = await enricher.enrichCandidate(bare, undefined, { perItem: true });
    assert.equal(bareItem.storage_gb, bare.storage_gb, 'no AI storage on a variant');
    assert.notEqual(bareItem.storage_gb, 1024);
    assert.notEqual(bareItem.key_specs.storage, '1TB');
    assert.equal(perItem.specifications.hardware?.storage_gb, 512);
    assert.equal(perItem.specifications.hardware?.ram_gb, 16);
    assert.equal(perItem.specifications.hardware?.chipset, 'Intel Core i5-1335U');
    assert.equal(perItem.key_specs.storage, vivobook.key_specs.storage);
    assert.equal(perItem.key_specs.chip, 'Core i5-1335U');
    await enricher.enrichCandidate(vivobook);
    assert.deepEqual(asks.at(-1), { storageGb: 512, ramGb: 16 });

    // The matcher asks per Item only with the flag on.
    const seen: unknown[] = [];
    const recording = {
      enrichCandidate: async <T>(candidate: T, _title?: string, options?: unknown) => {
        seen.push(options);
        return candidate;
      },
    } as unknown as AiSpecEnricher;
    await new EntityMatcher(createItemDb({ seededItemId: 'item-vivobook' }).client, recording, {
      itemModel: 'item',
    }).resolveItemAndVariant(vivobook, 'cat-laptops');
    await new EntityMatcher(createItemDb().client, recording, {
      itemModel: 'off',
    }).resolveItemAndVariant(vivobook, 'cat-laptops');
    assert.deepEqual(seen, [{ perItem: true }, { perItem: false }]);
  }
  // Item-level rating (Q4): a listing with no variant refreshes its Item; with a
  // variant the master RPC (Item-aware in M2) runs as before; no Item, no Item RPC.
  {
    const persist = async (
      ids: {
        masterId?: string | null;
        itemId?: string | null;
        itemModel?: 'off' | 'item' | 'nullable_variant';
      },
      mode = 'nullable_variant'
    ) => {
      const saved = process.env[ITEM_MODEL_ENV];
      process.env[ITEM_MODEL_ENV] = mode;
      try {
        return await persistOnce(ids);
      } finally {
        if (saved === undefined) delete process.env[ITEM_MODEL_ENV];
        else process.env[ITEM_MODEL_ENV] = saved;
      }
    };
    const persistOnce = async (ids: {
      masterId?: string | null;
      itemId?: string | null;
      itemModel?: 'off' | 'item' | 'nullable_variant';
    }) => {
      const db = createDb(call =>
        call.table === 'reviews' && call.op === 'select' ? { data: [], error: null } : undefined
      );
      await new AiReviewAnalyzer({ apiKey: '' }).persistAnalysisToSupabase(db.client, {
        productId: 'product-1152',
        reviews: [],
        ...ids,
      });
      return db.calls.filter(c => c.op === 'rpc').map(c => [c.table, c.payload] as const);
    };
    assert.deepEqual(await persist({ masterId: null, itemId: 'item-zenbook' }), [
      ['refresh_item_stats', { p_item_id: 'item-zenbook' }],
    ]);
    assert.deepEqual(await persist({ masterId: 'master-zenbook-1tb', itemId: 'item-zenbook' }), [
      ['refresh_master_product_rating', { p_master_id: 'master-zenbook-1tb' }],
    ]);
    assert.deepEqual(await persist({ masterId: null }), []);
    assert.deepEqual(await persist({ masterId: null, itemId: 'item-zenbook' }, 'off'), []);
    // The pipeline's own mode wins over the env (a pipeline configured with the model on).
    assert.deepEqual(
      await persist(
        { masterId: null, itemId: 'item-zenbook', itemModel: 'nullable_variant' },
        'off'
      ),
      [['refresh_item_stats', { p_item_id: 'item-zenbook' }]]
    );
  }
  console.log(
    '  ✅ [6/6] Seeds grouped by Item; Item specs from the seeds; enrichment and rating per Item (#1152)'
  );
  console.log('🎉 All item-first matcher tests passed!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
