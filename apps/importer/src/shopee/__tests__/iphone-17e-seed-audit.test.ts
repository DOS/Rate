/**
 * DOS/Rate#1737: the catalog had no iPhone 17e master, though the 16e seed marks the 16e
 * discontinued when Apple introduced the 17e. The sourced seeds add the 256GB and 512GB
 * models Apple Vietnam sells; the normalizer keys 17e listings to them, not to the 16e;
 * and a scoped `--only ... --insert-missing --apply --expect 2` inserts exactly those two
 * masters as drafts. All database access here is a stand-in.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { KeySpecsSchema, ProductSpecificationsSchema } from '@repo/shared-data';
import { FLAGSHIP_DEVICES_TO_SEED, flagshipSeedsByItem } from '../flagship-seed-data.js';
import { SOURCED_SEEDS_IPHONE_17E } from '../flagship-seed-sourced-iphone-17e.js';
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import {
  REQUIRED_10_SPEC_GROUPS,
  auditMasterSpecs,
  hasSingleRearCamera,
  parseBackfillSpecsArgs,
  runMasterSpecsBackfillWith,
  seedMasterSpecUpdate,
} from '../jobs/backfill-specs.js';
import type { RateSupabaseClient, ShopeeProduct } from '../types.js';

const KEYS = ['apple:iphone-17e:256gb', 'apple:iphone-17e:512gb'] as const;
const seeds = KEYS.map(k => SOURCED_SEEDS_IPHONE_17E.find(s => s.model_key === k)!);

/** A published master that already passes the audit (the 16e after the #1718 apply). */
function existingRow(): Record<string, unknown> {
  const sixteenE = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === 'apple:iphone-16e:128gb')!;
  return {
    id: '81725ce9-e45e-4b7d-9af1-0c61dfb2d41b',
    name: sixteenE.name,
    model_key: sixteenE.model_key,
    status: 'published',
    specifications: seedMasterSpecUpdate(null, sixteenE).specifications,
  };
}

/**
 * A stateful stand-in for the rate-scoped client over `master_products`: lookups by
 * model_key, paged reads, `update(...).eq('id', ...)` and `insert(...)` writes into the rows.
 */
function tableClient(rows: Array<Record<string, unknown>>) {
  const updates: Array<{ id: unknown; payload: Record<string, unknown> }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let payload: Record<string, unknown> | undefined;
      let insertPayload: Record<string, unknown> | undefined;
      const finish = () => {
        if (insertPayload) {
          if (table !== 'master_products') {
            return { data: null, error: { message: `no insert into ${table} expected` } };
          }
          if (rows.some(r => r.model_key === insertPayload!.model_key)) {
            return { data: null, error: { message: 'duplicate model_key' } };
          }
          const row = { id: `new-${inserts.length + 1}`, ...structuredClone(insertPayload) };
          rows.push(row);
          inserts.push(insertPayload);
          return { data: null, error: null };
        }
        if (payload) {
          const id = filters.find(([c]) => c === 'id')?.[1];
          const row = rows.find(r => r.id === id);
          if (!row) return { data: null, error: { message: `no row ${String(id)}` } };
          Object.assign(row, structuredClone(payload));
          updates.push({ id, payload });
          return { data: null, error: null };
        }
        if (table === 'categories') {
          return { data: [{ id: 'cat-1', slug: 'smartphones' }], error: null };
        }
        return { data: [], error: null };
      };
      let gtKey: [string, string] | null = null;
      let orderKey: string | null = null;
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        gt(column: string, value: string) {
          gtKey = [column, value];
          return builder;
        },
        order(column: string) {
          orderKey = column;
          return builder;
        },
        limit(n: number) {
          let data = table === 'master_products' ? [...rows] : [];
          if (gtKey) {
            const [col, val] = gtKey;
            data = data.filter(r => String(r[col] ?? '') > val);
          }
          if (orderKey) {
            const col = orderKey;
            data.sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')));
          }
          return Promise.resolve({ data: structuredClone(data.slice(0, n)), error: null });
        },
        maybeSingle() {
          const [column, value] = filters.find(([c]) => c === 'model_key' || c === 'slug') ?? [];
          const row =
            table === 'master_products' && column ? rows.find(r => r[column] === value) : null;
          return Promise.resolve({ data: row ? structuredClone(row) : null, error: null });
        },
        update(next: Record<string, unknown>) {
          payload = next;
          return builder;
        },
        insert(next: Record<string, unknown>) {
          insertPayload = next;
          return builder;
        },
        then<T>(resolve: (value: ReturnType<typeof finish>) => T) {
          return Promise.resolve(finish()).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as RateSupabaseClient, updates, inserts };
}

const deps = {
  enricher: { isConfigured: () => false },
  matcher: {
    enrichMasterProductById: async (): Promise<boolean> => {
      throw new Error('no AI enrichment in a scoped run');
    },
  },
};

const normalizer = new ProductNormalizer();
const normalize = (title: string) =>
  normalizer.normalize({
    itemId: '1',
    shopId: '2',
    title,
    priceMin: 22_000_000,
    priceMax: 22_000_000,
    priceBeforeDiscount: 0,
    currency: 'VND',
    stock: 1,
    historicalSold: 1,
    ratingStar: 5,
    ratingCount: 1,
    images: [],
    models: [],
    attributes: [],
    shop: { shopId: '2' },
  } as unknown as ShopeeProduct);

const strip = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

test('the iPhone 17e seeds are in the catalog once each, as one Item with two variants', () => {
  for (const key of KEYS) {
    assert.equal(FLAGSHIP_DEVICES_TO_SEED.filter(s => s.model_key === key).length, 1, key);
  }
  const item = flagshipSeedsByItem().find(i => i.itemKey === 'apple:iphone-17e');
  assert.deepEqual(
    item?.variants.map(v => v.model_key),
    [...KEYS]
  );
  assert.equal(item?.name, 'Apple iPhone 17e');
});

test('each seed parses, fills all 10 groups, and cites every group', () => {
  for (const seed of seeds) {
    const where = seed.model_key;
    const specs = ProductSpecificationsSchema.safeParse(seed.specifications);
    assert.equal(specs.success, true, `${where}: ${specs.error?.message ?? ''}`);
    assert.deepEqual(strip(specs.data), strip(seed.specifications), `${where}: unknown spec field`);
    const keySpecs = KeySpecsSchema.safeParse(seed.key_specs);
    assert.equal(keySpecs.success, true, `${where}: ${keySpecs.error?.message ?? ''}`);
    assert.deepEqual(strip(keySpecs.data), strip(seed.key_specs), `${where}: unknown key spec`);
    for (const group of REQUIRED_10_SPEC_GROUPS) {
      assert.ok(seed.specifications[group], `${where}: missing group ${group}`);
    }
    const sources = seed.sources ?? {};
    for (const url of Object.values(sources)) assert.match(url, /^https:\/\/\S+$/);
    for (const group of Object.keys(seed.specifications)) {
      assert.ok(
        Object.keys(sources).some(path => path === group || path.startsWith(`${group}.`)),
        `${where}: spec group "${group}" has no source`
      );
    }
    // Columns, specs and key agree; no synthetic listing, price or review data.
    assert.equal(seed.specifications.hardware?.storage_gb, seed.storage_gb);
    assert.equal(seed.key_specs.storage, `${seed.storage_gb}GB`);
    assert.equal(seed.variant_name, `${seed.storage_gb}GB`);
    assert.equal(seed.specifications.hardware?.ram_gb, seed.ram_gb);
    assert.equal(seed.specifications.battery?.capacity_mah, seed.battery_mah);
    assert.equal(seed.specifications.display?.size_inch, seed.screen_size_inch);
    assert.deepEqual(seed.specifications.design?.colors, seed.colors);
    for (const field of ['listings', 'expert_rating', 'expert_review_summary', 'min_price']) {
      assert.ok(!(field in seed), `${where}: synthetic field ${field}`);
    }
    assert.equal(seed.specifications.availability?.prices_msrp, undefined);
    // Values no checked source states are left out.
    assert.equal(seed.specifications.display?.refresh_rate_hz, undefined);
    assert.equal(seed.specifications.battery?.fast_charging_w, undefined);
    assert.deepEqual(seed.images, []);
    assert.equal(seed.retract_spec_fields, undefined);
  }
  // The two variants differ only in their storage.
  const [a, b] = seeds.map(s => {
    const copy = structuredClone({ ...s, aliases: undefined }) as Record<string, unknown>;
    for (const field of ['model_key', 'name', 'slug', 'variant_name', 'storage_gb']) {
      delete copy[field];
    }
    const specs = copy.specifications as { hardware: Record<string, unknown> };
    delete specs.hardware.storage_gb;
    delete (copy.key_specs as Record<string, unknown>).storage;
    return copy;
  });
  assert.deepEqual(a, b);
});

test('each seed declares one rear camera, and 17e listings get no invented second one', () => {
  for (const seed of seeds) {
    assert.equal(hasSingleRearCamera(seed.specifications.camera), true, seed.model_key);
    assert.equal(seed.specifications.camera?.second_camera, undefined, seed.model_key);
    assert.ok(seed.specifications.camera?.main_camera?.startsWith('48 MP Fusion'));
  }
  for (const title of ['Apple iPhone 17e 256GB', 'Apple iPhone 17e 512GB', 'iPhone 17 E 256GB']) {
    const enriched = normalize(title);
    assert.equal(enriched.is_benchmark_enriched, true, title);
    assert.equal(enriched.specifications.camera?.rear_setup, 'Single Camera', title);
    assert.equal(enriched.specifications.camera?.second_camera, undefined, title);
    assert.equal(enriched.battery_mah, seeds[0]!.battery_mah, title);
    assert.equal(enriched.screen_size_inch, seeds[0]!.screen_size_inch, title);
    assert.equal(enriched.ram_gb, seeds[0]!.ram_gb, title);
  }
});

test('17e titles key exactly to their storage, never to the 16e; near misses do not key here', () => {
  for (const seed of seeds) {
    for (const title of [seed.name, ...(seed.aliases ?? [])]) {
      assert.equal(normalize(title).model_key, seed.model_key, title);
      assert.equal(detectCategorySlug(title), 'smartphones', title);
    }
    assert.ok((seed.aliases ?? []).length >= 2);
  }
  for (const title of [
    'Apple iPhone 17e 256GB',
    'iPhone 17E 512GB Chính hãng',
    'Điện thoại Apple iPhone 17e 256GB - Hồng Phai',
    'Apple iPhone 17 E 256GB',
    'iPhone 17 e 512 GB',
  ]) {
    assert.notEqual(normalize(title).model_key, 'apple:iphone-16e:128gb', title);
    assert.match(normalize(title).model_key, /^apple:iphone-17e:/, title);
  }
  for (const title of [
    'Apple iPhone 16e 128GB',
    'Apple iPhone 17 256GB',
    'Apple iPhone 17 Pro 256GB',
    'Apple iPhone Air 256GB',
    'Ốp lưng cho iPhone 17e',
    // A spaced "e" counts only right before a storage.
    'iPhone 17 e-SIM 256GB',
    'iPhone 17 Edge 256GB',
  ]) {
    assert.doesNotMatch(normalize(title).model_key, /^apple:iphone-17e:/, title);
  }
  // The 16e keeps its own key, spaced too.
  assert.equal(normalize('Apple iPhone 16e 128GB').model_key, 'apple:iphone-16e:128gb');
  assert.equal(normalize('Apple iPhone 16 E 128GB').model_key, 'apple:iphone-16e:128gb');
  assert.equal(normalize('Apple iPhone 17 256GB').model_key, 'apple:iphone-17:256gb');
  // A spaced "e" after a generation with no e model keeps the plain model.
  assert.equal(normalize('iPhone 13 E 64GB').model_key, 'apple:iphone-13:64gb');
  assert.equal(normalize('iPhone 12 e 64 GB').model_key, 'apple:iphone-12:64gb');
});

test('the rows a scoped insert writes pass the audit (--audit-only logic)', async () => {
  const rows: Array<Record<string, unknown>> = [existingRow()];
  const { client } = tableClient(rows);
  await runMasterSpecsBackfillWith(client, deps, {
    apply: true,
    only: [...KEYS],
    expect: 2,
    insertMissing: true,
  });
  const { client: auditClient } = tableClient(rows);
  assert.equal(await auditMasterSpecs(auditClient), 3);
});

test('a scoped --insert-missing apply inserts exactly the two 17e drafts and touches nothing else', async () => {
  const other = existingRow();
  const rows: Array<Record<string, unknown>> = [other];
  const { client, updates, inserts } = tableClient(rows);
  const result = await runMasterSpecsBackfillWith(client, deps, {
    apply: true,
    only: [...KEYS],
    expect: 2,
    insertMissing: true,
  });
  assert.equal(result.planned, 2);
  assert.equal(result.catalogInserted, 2);
  assert.equal(result.catalogUpdated, 0);
  assert.equal(result.itemsUpdated, 0);
  assert.equal(result.totalAudited, 3);
  assert.deepEqual(updates, []);
  assert.deepEqual(
    inserts.map(i => i.model_key),
    [...KEYS]
  );
  for (const [i, seed] of seeds.entries()) {
    const row = inserts[i]!;
    assert.equal(row.status, 'draft');
    assert.equal(row.slug, seed.slug);
    assert.equal(row.name, seed.name);
    assert.equal(row.variant_name, seed.variant_name);
    assert.equal(row.category_id, 'cat-1');
    assert.equal(row.storage_gb, seed.storage_gb);
    assert.deepEqual(row.colors, ['Đen', 'Trắng', 'Hồng Phai']);
    assert.equal('images' in row, false, 'no images on the draft');
    const specs = row.specifications as Record<string, Record<string, unknown>>;
    assert.equal(specs.camera?.rear_setup, seed.specifications.camera?.rear_setup);
    assert.equal(specs.camera?.second_camera, undefined);
  }
  // The existing master is unchanged.
  assert.deepEqual(rows[0], existingRow());
});

test('without --insert-missing a scoped apply of the 17e still stops before any write', async () => {
  const { client, updates, inserts } = tableClient([existingRow()]);
  await assert.rejects(
    () => runMasterSpecsBackfillWith(client, deps, { apply: true, only: [...KEYS], expect: 2 }),
    /no master row for apple:iphone-17e:256gb, apple:iphone-17e:512gb: stopped before any write/
  );
  assert.deepEqual(updates, []);
  assert.deepEqual(inserts, []);
});

test('--insert-missing with a wrong --expect, or no --expect, stops before any write', async () => {
  for (const options of [
    { apply: true, only: [...KEYS], expect: 1, insertMissing: true },
    { apply: true, only: [KEYS[0]], expect: 2, insertMissing: true },
    { apply: true, only: [...KEYS], insertMissing: true },
  ]) {
    const { client, updates, inserts } = tableClient([existingRow()]);
    await assert.rejects(
      () => runMasterSpecsBackfillWith(client, deps, options),
      /stopped before any write|needs expect/,
      JSON.stringify(options)
    );
    assert.deepEqual(updates, []);
    assert.deepEqual(inserts, []);
  }
  // Never in an unscoped run.
  const { client } = tableClient([existingRow()]);
  await assert.rejects(
    () => runMasterSpecsBackfillWith(client, deps, { apply: false, insertMissing: true }),
    /insertMissing needs only/
  );
});

test('a scoped --insert-missing dry run writes nothing and plans both inserts', async () => {
  const { client, updates, inserts } = tableClient([existingRow()]);
  const result = await runMasterSpecsBackfillWith(client, deps, {
    only: [...KEYS],
    expect: 2,
    insertMissing: true,
  });
  assert.equal(result.apply, false);
  assert.equal(result.planned, 2);
  assert.equal(result.catalogInserted, 2);
  assert.deepEqual(updates, []);
  assert.deepEqual(inserts, []);
});

test('parseBackfillSpecsArgs reads --insert-missing only with --only, and --expect on apply', () => {
  const only = KEYS.join(',');
  assert.deepEqual(
    parseBackfillSpecsArgs(['--only', only, '--insert-missing', '--apply', '--expect', '2']),
    { apply: true, auditOnly: false, only: [...KEYS], expect: 2, insertMissing: true }
  );
  assert.deepEqual(parseBackfillSpecsArgs(['--only', only, '--insert-missing']), {
    apply: false,
    auditOnly: false,
    only: [...KEYS],
    insertMissing: true,
  });
  // Absent unless asked for, so every earlier command line parses as before.
  assert.equal('insertMissing' in parseBackfillSpecsArgs(['--only', only]), false);
  for (const [argv, error] of [
    [['--insert-missing'], /needs --only/],
    [['--insert-missing', '--apply', '--expect', '2'], /needs --only/],
    [['--only', only, '--insert-missing', '--apply'], /needs --expect/],
    [['--audit-only', '--insert-missing'], /--audit-only/],
    [['--only', only, '--insert-missing', '--insert-missing'], /repeated/],
    [['--only', only, '--insert-missing=true'], /unknown argument/],
  ] as const) {
    assert.throws(() => parseBackfillSpecsArgs(argv), error, argv.join(' '));
  }
});

test('a mixed --insert-missing run updates the named key that exists and inserts the other', async () => {
  const sixtyFour = seedMasterSpecUpdate(null, seeds[0]!).specifications;
  const rows: Array<Record<string, unknown>> = [
    {
      id: 'existing-256',
      name: seeds[0]!.name,
      model_key: KEYS[0],
      slug: seeds[0]!.slug,
      status: 'draft',
      specifications: sixtyFour,
    },
  ];
  const { client, updates, inserts } = tableClient(rows);
  const result = await runMasterSpecsBackfillWith(client, deps, {
    apply: true,
    only: [...KEYS],
    expect: 2,
    insertMissing: true,
  });
  assert.equal(result.catalogUpdated, 1);
  assert.equal(result.catalogInserted, 1);
  assert.deepEqual(
    updates.map(u => u.id),
    ['existing-256']
  );
  assert.deepEqual(
    inserts.map(i => i.model_key),
    [KEYS[1]]
  );
});

test('a seed slug held by another master stops an --insert-missing run before any write', async () => {
  for (const apply of [true, false]) {
    const { client, updates, inserts } = tableClient([
      existingRow(),
      { id: 'squatter', model_key: 'apple:iphone-17e:unknown', slug: seeds[1]!.slug },
    ]);
    await assert.rejects(
      () =>
        runMasterSpecsBackfillWith(client, deps, {
          apply,
          only: [...KEYS],
          expect: 2,
          insertMissing: true,
        }),
      /slug apple-iphone-17e-512gb already belongs to apple:iphone-17e:unknown: stopped before any write/
    );
    assert.deepEqual(updates, []);
    assert.deepEqual(inserts, []);
  }
});

test('the 17e seeds cite no satellite feature (apple.com/vn lists none)', () => {
  for (const seed of seeds) {
    assert.doesNotMatch(JSON.stringify(seed.specifications), /satellite/i, seed.model_key);
  }
});
