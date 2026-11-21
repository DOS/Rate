/**
 * DOS/Rate#1792: what DOS/Rate#1790's review left. The AI prompt's schema hints suggested
 * generic values ("Android 14", "SA/NSA/Sub6", "Không hỗ trợ thẻ nhớ") a model copies into
 * a listing no source describes; registry earbuds had driver, ANC and LED text in their
 * display fields; the Apple Watch Series 11 was registered without 5G; and an auto-created
 * master could lose an empty spec group (or, for a watch or earbuds, the groups its
 * category template removes) and fail the spec audit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { AiSpecEnricher, mergeProductSpecifications } from '../ai-spec-enricher.js';
import {
  REQUIRED_10_SPEC_GROUPS,
  auditMasterSpecs,
  requiredSpecGroups,
} from '../jobs/backfill-specs.js';
import { ProductNormalizer } from '../product-normalizer.js';
import { withoutRetractedSpecs } from '../spec-retraction.js';
import type { ShopeeProduct } from '../types.js';

const normalizer = new ProductNormalizer();
const normalize = (title: string) =>
  normalizer.normalize({
    itemId: '1',
    shopId: '2',
    title,
    priceMin: 15_000_000,
    priceMax: 15_000_000,
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

/** The fields of a group that hold a value. */
const defined = (group: object | undefined) =>
  Object.fromEntries(Object.entries(group ?? {}).filter(([, v]) => v !== undefined));

type PromptBuilder = {
  buildPrompts: (
    brand: string,
    model: string,
    storageGb: number | null,
    ramGb: number | null,
    rawTitle?: string,
    rawDescription?: string,
    categorySlug?: string
  ) => { systemPrompt: string; userPrompt: string };
};

const prompts = (categorySlug: string) =>
  (new AiSpecEnricher({}) as unknown as PromptBuilder).buildPrompts(
    'Samsung',
    'Galaxy A35',
    128,
    8,
    'Samsung Galaxy A35 5G 128GB',
    undefined,
    categorySlug
  );

test('the AI prompt suggests no generic value and asks for empty fields', () => {
  for (const category of ['smartphones', 'tablets', 'laptops', 'smartwatches', 'earbuds']) {
    const { systemPrompt, userPrompt } = prompts(category);
    // The values #1754 to #1790 removed, and other category-wide guesses.
    for (const generic of [
      'Android 14',
      'iOS 18',
      'One UI',
      'SA/NSA/Sub6',
      'Không hỗ trợ thẻ nhớ',
      'microSDXC',
      'GSM / HSPA / LTE / 5G',
      'HSPA, LTE-A, 5G',
      'LTE Cat20',
      'Li-Ion',
      'non-removable',
      'CE, FCC, RoHS',
      'Gorilla',
      'Ceramic Shield',
      'Accelerometer, gyro',
      'GPS, GLONASS',
      'Dolby Atmos',
      "'Available'",
    ]) {
      assert.ok(!systemPrompt.includes(generic), `${category}: ${generic}`);
    }
    // Only a label format is still shown as an example.
    const examples = [...systemPrompt.matchAll(/e\.g\. '([^'\n]*)'/g)].map(m => m[1]);
    assert.deepEqual(examples, ['Triple Camera'], category);
    assert.ok(systemPrompt.includes('Leave a field out when'), category);
    assert.ok(systemPrompt.includes('They are not values to copy.'), category);
    assert.ok(userPrompt.includes('every other field left out'), category);
    assert.ok(!userPrompt.includes('complete'), category);
  }
});

const REGISTRY_EARBUDS = [
  'Tai nghe AirPods Pro 2',
  'Tai nghe AirPods Pro 3',
  'Sony WF-1000XM5',
  'Sony WF-1000XM6',
  'Samsung Galaxy Buds3 Pro',
];

test('registry earbuds have no driver, ANC or LED text as a display or key-spec screen', () => {
  for (const title of REGISTRY_EARBUDS) {
    const n = normalize(title);
    assert.equal(n.category_slug, 'earbuds', title);
    assert.equal(n.is_benchmark_enriched, true, title);
    assert.deepEqual(defined(n.specifications.display), {}, title);
    assert.equal(n.key_specs.screen, undefined, title);
    // The audio chip and battery stay.
    assert.ok(n.specifications.hardware?.chipset, title);
    assert.ok(n.specifications.battery?.capacity_mah, title);
  }
});

test('the Apple Watch Series 11 supports 5G, as Apple’s Tech Specs state', () => {
  const n = normalize('Apple Watch Series 11 46mm');
  assert.equal(n.is_benchmark_enriched, true);
  assert.equal(n.has_5g, true);
  assert.equal(n.specifications.cellular?.has_5g, true);
  // The Ultra 2 is LTE (DOS/Rate#1790).
  assert.equal(normalize('Apple Watch Ultra 2 49mm').specifications.cellular?.has_5g, false);
});

test('merging specs keeps a group either side has, as {} when it is empty', () => {
  const merged = mergeProductSpecifications(
    { battery: {}, display: { size_inch: undefined }, camera: {} },
    { hardware: { chipset: 'Chip' }, connectivity: { usb: '   ' } }
  ) as Record<string, unknown>;
  const stored = JSON.parse(JSON.stringify(merged)) as Record<string, unknown>;
  for (const group of ['battery', 'display', 'camera', 'connectivity']) {
    assert.deepEqual(stored[group], {}, group);
  }
  assert.equal((merged.hardware as { chipset?: string }).chipset, 'Chip');
  // A group neither side has is still left out.
  assert.equal(merged.regulatory, undefined);
  assert.equal(merged.cellular, undefined);
});

test('a retraction that empties a group keeps the group as {}', () => {
  assert.deepEqual(
    withoutRetractedSpecs(
      { regulatory: { sar_head: '1 W/kg' }, battery: { capacity_mah: 1 } },
      ['regulatory.sar_head'],
      'specifications'
    ),
    { regulatory: {}, battery: { capacity_mah: 1 } }
  );
});

test('requiredSpecGroups leaves out only the groups a category template removes', () => {
  for (const category of ['smartphones', 'tablets', 'laptops', undefined, null, 'unknown', 42]) {
    assert.deepEqual(requiredSpecGroups(category), [...REQUIRED_10_SPEC_GROUPS], String(category));
  }
  assert.deepEqual(
    REQUIRED_10_SPEC_GROUPS.filter(g => !requiredSpecGroups('smartwatches').includes(g)),
    ['camera']
  );
  assert.deepEqual(
    REQUIRED_10_SPEC_GROUPS.filter(g => !requiredSpecGroups('earbuds').includes(g)),
    ['display', 'camera', 'cellular']
  );
});

test('an auto-created master passes the spec audit when the AI answer omits groups', async () => {
  const titles = [
    'Samsung Galaxy A35 5G 128GB',
    'Xiaomi Redmi Note 99 Pro 256GB',
    'Samsung Galaxy Tab A9 64GB',
    'Laptop Dell XPS 13 512GB',
    'Samsung Galaxy Watch7 44mm',
    'Tai nghe JBL Tune 230NC',
  ];
  const enricher = new AiSpecEnricher({});
  // An answer that states only a chip and the dimensions: no battery, display,
  // connectivity, camera or regulatory group.
  (enricher as unknown as { fetchSpecsFromAi: () => Promise<unknown> }).fetchSpecsFromAi =
    async () => ({
      ram_gb: null,
      storage_gb: null,
      screen_size_inch: null,
      battery_mah: null,
      has_5g: null,
      specifications: { hardware: { chipset: 'Chip' }, design: { dimensions: '1 x 2 x 3 mm' } },
      key_specs: {},
    });
  const rows: Array<Record<string, unknown>> = [];
  for (const [i, title] of titles.entries()) {
    const candidate = normalize(title);
    assert.equal(candidate.is_benchmark_enriched, false, title);
    const enriched = await enricher.enrichCandidate(candidate, title);
    assert.equal(enriched.specifications?.hardware?.chipset, 'Chip', title);
    // Stored as the entity matcher inserts a new master, then read back as JSON.
    const stored = applyCategorySpecTemplate(
      enriched.category_slug,
      { specifications: enriched.specifications, key_specs: enriched.key_specs },
      { forStorage: true }
    );
    rows.push(
      JSON.parse(
        JSON.stringify({
          id: `m${i}`,
          name: title,
          model_key: enriched.model_key,
          specifications: stored.specifications,
        })
      )
    );
  }
  // The battery group the AI omitted is still stored, as {}, on every category.
  for (const row of rows) {
    assert.deepEqual((row.specifications as Record<string, unknown>).battery, {}, `${row.name}`);
  }
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number) => ({ data: from === 0 ? rows : [], error: null }),
        }),
      }),
    }),
  };
  assert.equal(await auditMasterSpecs(client as never), rows.length);
  // A master that has lost a group its category has still fails.
  const broken = structuredClone(rows[0]!);
  delete (broken.specifications as Record<string, unknown>).battery;
  const brokenClient = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number) => ({ data: from === 0 ? [broken] : [], error: null }),
        }),
      }),
    }),
  };
  await assert.rejects(
    auditMasterSpecs(brokenClient as never),
    /missing specification group "battery"/
  );
});
