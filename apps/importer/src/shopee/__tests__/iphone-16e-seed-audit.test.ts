/**
 * DOS/Rate#1718: the iPhone 16e 128GB master, created by the DOS/Rate#594 offer move with a
 * partial spec set, failed the backfill's catalog audit (no connectivity, multimedia or
 * regulatory group, no camera.second_camera). The sourced seed fills the three groups, and
 * the audit no longer asks a single-camera device for a second camera: Apple states the
 * 16e has one camera on the back. All database access here is a stand-in.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { KeySpecsSchema, ProductSpecificationsSchema } from '@repo/shared-data';
import { FLAGSHIP_DEVICES_TO_SEED, flagshipSeedsByItem } from '../flagship-seed-data.js';
import { SOURCED_SEEDS_2025 } from '../flagship-seed-sourced-2025.js';
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import {
  REQUIRED_10_SPEC_GROUPS,
  auditMasterSpecs,
  hasSingleRearCamera,
  runMasterSpecsBackfillWith,
  seedMasterSpecUpdate,
} from '../jobs/backfill-specs.js';
import type { RateSupabaseClient, ShopeeProduct } from '../types.js';

const KEY = 'apple:iphone-16e:128gb';
const seed = SOURCED_SEEDS_2025.find(s => s.model_key === KEY)!;

/** The Production row as read on 2026-11-18 (specs and key specs, as #594 wrote them). */
function productionRow(): Record<string, unknown> {
  return {
    id: '81725ce9-e45e-4b7d-9af1-0c61dfb2d41b',
    name: 'Apple iPhone 16e 128GB',
    model_key: KEY,
    category_id: 'cat-1',
    description: '',
    variant_name: '128GB',
    ram_gb: 8,
    storage_gb: 128,
    screen_size_inch: 6.1,
    battery_mah: 4005,
    has_5g: true,
    colors: [],
    images: ['https://example.invalid/offer.jpg'],
    thumbnail: 'https://example.invalid/offer.jpg',
    specifications: {
      category_slug: 'smartphones',
      availability: { announced: 'February 2025' },
      design: {
        dimensions: '146.7 x 71.5 x 7.8 mm',
        weight_g: 167,
        resistance: 'IP68 (6m up to 30 mins)',
      },
      display: {
        size_inch: 6.1,
        type: 'Super Retina XDR OLED, HDR10, Dolby Vision, 1200 nits (peak)',
        resolution: '1170 x 2532 pixels (~460 ppi)',
        refresh_rate_hz: 60,
      },
      hardware: {
        chipset: 'Apple A18 (3 nm)',
        cpu: 'Hexa-core (2x4.04 GHz + 4x2.20 GHz)',
        gpu: 'Apple GPU (4-core graphics)',
        ram_gb: 8,
        storage_gb: 128,
        os: 'iOS 18.3 (upgradable)',
      },
      battery: { capacity_mah: 4005, fast_charging_w: 20 },
      camera: {
        main_camera: '48 MP, f/1.6, 26mm (wide), PDAF, OIS',
        front_camera: '12 MP, f/1.9, 23mm (wide), PDAF + SL 3D',
      },
      cellular: { has_5g: true },
    },
    key_specs: {
      screen: '6.1" Super Retina XDR OLED',
      chip: 'Apple A18',
      camera: '48 MP',
      battery: '4005 mAh (20W)',
      storage: '128GB',
      ram: '8GB',
    },
  };
}

/**
 * A stateful stand-in for the rate-scoped client over `master_products`: lookups by
 * model_key, paged reads, and `update(...).eq('id', ...)` writes into the rows.
 */
function tableClient(rows: Array<Record<string, unknown>>) {
  const updates: Array<{ id: unknown; payload: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let payload: Record<string, unknown> | undefined;
      let inserted = false;
      const finish = () => {
        if (inserted) return { data: null, error: { message: 'no insert expected' } };
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
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        order() {
          return builder;
        },
        range(from: number, to: number) {
          const data = table === 'master_products' ? rows.slice(from, to + 1) : [];
          return Promise.resolve({ data: structuredClone(data), error: null });
        },
        maybeSingle() {
          const key = filters.find(([c]) => c === 'model_key')?.[1];
          const row = table === 'master_products' ? rows.find(r => r.model_key === key) : null;
          return Promise.resolve({ data: row ? structuredClone(row) : null, error: null });
        },
        update(next: Record<string, unknown>) {
          payload = next;
          return builder;
        },
        insert() {
          inserted = true;
          return builder;
        },
        then<T>(resolve: (value: ReturnType<typeof finish>) => T) {
          return Promise.resolve(finish()).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as RateSupabaseClient, updates };
}

const normalizer = new ProductNormalizer();
const normalize = (title: string) =>
  normalizer.normalize({
    itemId: '1',
    shopId: '2',
    title,
    priceMin: 14_000_000,
    priceMax: 14_000_000,
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

test('the iPhone 16e seed is in the catalog once, as one Item variant', () => {
  assert.equal(FLAGSHIP_DEVICES_TO_SEED.filter(s => s.model_key === KEY).length, 1);
  const item = flagshipSeedsByItem().find(i => i.itemKey === 'apple:iphone-16e');
  assert.deepEqual(
    item?.variants.map(v => v.model_key),
    [KEY]
  );
});

test('the seed parses, fills all 10 groups, and cites every group', () => {
  const specs = ProductSpecificationsSchema.safeParse(seed.specifications);
  assert.equal(specs.success, true, specs.error?.message ?? '');
  assert.deepEqual(strip(specs.data), strip(seed.specifications), 'unknown spec field');
  const keySpecs = KeySpecsSchema.safeParse(seed.key_specs);
  assert.equal(keySpecs.success, true, keySpecs.error?.message ?? '');
  assert.deepEqual(strip(keySpecs.data), strip(seed.key_specs), 'unknown key spec');
  for (const group of REQUIRED_10_SPEC_GROUPS) {
    assert.ok(seed.specifications[group], `missing group ${group}`);
  }
  const sources = seed.sources ?? {};
  for (const url of Object.values(sources)) assert.match(url, /^https:\/\/\S+$/);
  for (const group of Object.keys(seed.specifications)) {
    assert.ok(
      Object.keys(sources).some(path => path === group || path.startsWith(`${group}.`)),
      `spec group "${group}" has no source`
    );
  }
  // Columns, specs and key agree; no synthetic listing, price or review data.
  assert.equal(seed.specifications.hardware?.storage_gb, seed.storage_gb);
  assert.equal(seed.specifications.hardware?.ram_gb, seed.ram_gb);
  assert.equal(seed.specifications.battery?.capacity_mah, seed.battery_mah);
  assert.equal(seed.specifications.display?.size_inch, seed.screen_size_inch);
  for (const field of ['listings', 'expert_rating', 'expert_review_summary', 'min_price']) {
    assert.ok(!(field in seed), `synthetic field ${field}`);
  }
  assert.equal(seed.specifications.availability?.prices_msrp, undefined);
  // The master keeps its own images.
  assert.deepEqual(seed.images, []);
});

test('the seed declares one rear camera and invents no second one', () => {
  assert.equal(hasSingleRearCamera(seed.specifications.camera), true);
  assert.equal(seed.specifications.camera?.second_camera, undefined);
  assert.ok(seed.specifications.camera?.main_camera?.startsWith('48 MP'));
  // The benchmark registry also counts one rear camera for the 16e.
  const enriched = normalize(seed.name);
  assert.equal(enriched.specifications.camera?.rear_setup, 'Single Camera');
  assert.equal(enriched.battery_mah, seed.battery_mah);
  assert.equal(enriched.screen_size_inch, seed.screen_size_inch);
});

test('the seed name and retail aliases key exactly to the 16e, near misses do not', () => {
  for (const title of [seed.name, ...(seed.aliases ?? [])]) {
    assert.equal(normalize(title).model_key, KEY, title);
    assert.equal(detectCategorySlug(title), 'smartphones', title);
  }
  assert.ok((seed.aliases ?? []).length >= 2);
  for (const title of [
    'Apple iPhone 16 128GB',
    'Apple iPhone 16 Plus 128GB',
    'Apple iPhone 17e 128GB',
  ]) {
    assert.notEqual(normalize(title).model_key, KEY, title);
  }
});

test('hasSingleRearCamera reads only a leading "single" rear setup', () => {
  assert.equal(hasSingleRearCamera({ rear_setup: 'Single Camera' }), true);
  assert.equal(hasSingleRearCamera({ rear_setup: '  single camera + LiDAR' }), true);
  for (const setup of ['Dual Camera', 'Triple Camera', 'Singles', '', '   ', 1, null]) {
    assert.equal(hasSingleRearCamera({ rear_setup: setup }), false, String(setup));
  }
  assert.equal(hasSingleRearCamera(undefined), false);
  assert.equal(hasSingleRearCamera(null), false);
});

test('the Production row fails the audit with exactly the reported gaps', async () => {
  const { client } = tableClient([productionRow()]);
  await assert.rejects(
    () => auditMasterSpecs(client),
    (err: Error) => {
      const lines = err.message
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('- '));
      assert.deepEqual(lines, [
        `- Apple iPhone 16e 128GB (${KEY}) is missing specification group "connectivity"`,
        `- Apple iPhone 16e 128GB (${KEY}) is missing specification group "multimedia"`,
        `- Apple iPhone 16e 128GB (${KEY}) is missing specification group "regulatory"`,
        `- Apple iPhone 16e 128GB (${KEY}) is missing camera.second_camera`,
      ]);
      return true;
    }
  );
});

test('the row the seed update writes passes the audit (--audit-only logic)', async () => {
  const row = productionRow();
  Object.assign(row, seedMasterSpecUpdate(row as never, seed));
  const { client } = tableClient([row]);
  assert.equal(await auditMasterSpecs(client), 1);
  // The merge keeps the stored values the seed does not restate.
  const specs = row.specifications as Record<string, Record<string, unknown>>;
  assert.equal(specs.hardware?.os, 'iOS 18.3 (upgradable)');
  assert.equal(specs.battery?.fast_charging_w, 20);
  assert.equal(specs.camera?.second_camera, undefined);
});

test('a scoped apply of the 16e writes that master only, then the audit passes', async () => {
  const merged = seedMasterSpecUpdate(null, seed).specifications as Record<string, unknown>;
  const other = {
    id: 'other',
    name: 'Apple iPhone 16 128GB',
    model_key: 'apple:iphone-16:128gb',
    specifications: {
      ...merged,
      camera: { rear_setup: 'Dual Camera', main_camera: '48 MP', second_camera: '12 MP' },
    },
  };
  const { client, updates } = tableClient([productionRow(), other]);
  const result = await runMasterSpecsBackfillWith(
    client,
    {
      enricher: { isConfigured: () => false },
      matcher: {
        enrichMasterProductById: async () => {
          throw new Error('no AI enrichment in a scoped run');
        },
      },
    },
    { apply: true, only: [KEY], expect: 1 }
  );
  assert.equal(result.planned, 1);
  assert.equal(result.catalogUpdated, 1);
  assert.equal(result.totalAudited, 2);
  assert.deepEqual(
    updates.map(u => u.id),
    ['81725ce9-e45e-4b7d-9af1-0c61dfb2d41b']
  );
});

test('the audit still requires a second camera when the setup is not single', async () => {
  const base = seedMasterSpecUpdate(null, seed).specifications as Record<string, unknown>;
  for (const camera of [
    { main_camera: '50 MP' },
    { rear_setup: 'Dual Camera', main_camera: '50 MP', second_camera: '  ' },
    { rear_setup: 'Triple Camera', main_camera: '50 MP' },
  ]) {
    const { client } = tableClient([
      {
        id: 'x',
        name: 'Test Phone',
        model_key: 'test:phone:128gb',
        specifications: { ...base, camera },
      },
    ]);
    await assert.rejects(() => auditMasterSpecs(client), /missing camera\.second_camera/);
  }
  // A single-camera device still needs its main camera.
  const { client } = tableClient([
    {
      id: 'y',
      name: 'Test Phone',
      model_key: 'test:phone:128gb',
      specifications: { ...base, camera: { rear_setup: 'Single Camera' } },
    },
  ]);
  await assert.rejects(() => auditMasterSpecs(client), /missing camera\.main_camera/);
});
