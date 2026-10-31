import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MasterProduct } from '@repo/shared-data';
import { withScoringSpecs, withoutSpecSheet } from '../hero-products';
import {
  buildPopular1v1BattlesForCategory,
  LEADERBOARD_SPEC_FIELDS,
  scoreMasterProductForLeaderboard,
  VALID_LEADERBOARD_CRITERIA,
} from '../leaderboard-engine';

// A catalog row for a client list keeps what cards and links read and drops
// the spec sheet and long texts (DOS/Rate#1353).
const fullRow = {
  id: 'p-1353',
  slug: 'apple-iphone-16-128gb',
  name: 'Apple iPhone 16 128GB',
  min_price: 19_990_000,
  user_rating_weighted: 4.8,
  expert_rating: 9.1,
  metadata: { category_slug: 'smartphones' },
  specifications: {
    category_slug: 'smartphones',
    display: { refresh_rate_hz: 60 },
  },
  spec_provenance: { display: 'registry' },
  expert_review_summary: 'A long expert text',
  description: 'A long description',
} as unknown as MasterProduct;
const slimRow = withoutSpecSheet(fullRow) as MasterProduct &
  Record<string, unknown>;
// The type says what the value is: the dropped texts are null, and a slim row
// is still a catalog row the client components take.
const typedSlim = withoutSpecSheet(fullRow);
const nullDescription: null = typedSlim.description;
const nullSummary: null = typedSlim.expert_review_summary;
const asRow: MasterProduct = typedSlim;
assert.equal(nullDescription, null);
assert.equal(nullSummary, null);
assert.equal(asRow.slug, fullRow.slug);
assert.deepEqual(slimRow.specifications, { category_slug: 'smartphones' });
assert.deepEqual(slimRow.spec_provenance, {});
assert.equal(slimRow.expert_review_summary, null);
assert.equal(slimRow.description, null);
assert.equal(slimRow.min_price, 19_990_000);
assert.equal(slimRow.user_rating_weighted, 4.8);
assert.equal(slimRow.expert_rating, 9.1);
assert.deepEqual(slimRow.metadata, { category_slug: 'smartphones' });
assert.notEqual(slimRow, fullRow, 'the input row is not changed');
assert.equal(
  (fullRow.specifications as { display?: unknown }).display !== undefined,
  true
);

// The category and watchlist pages hand their client lists slim rows.
const page = (route: string) =>
  readFileSync(
    new URL(`../../app/[locale]/${route}/page.tsx`, import.meta.url),
    'utf8'
  );
assert.ok(page('watchlist').includes('catalogProducts.map(withoutSpecSheet)'));
assert.ok(page('smartphones').includes('products.map(withoutSpecSheet)'));

// A row for a client that ranks or pairs products keeps the spec fields the
// scores read: every criterion scores the same as on the full row
// (DOS/Rate#1515).
const fullSheet = (
  category: string,
  overrides: Record<string, unknown>
): Record<string, unknown> => ({
  category_slug: category,
  battery: {
    capacity_mah: 5000,
    charging: '45W wired, 15W wireless',
    fast_charging_w: 45,
    type: 'Li-Ion',
  },
  camera: {
    main_camera: '200 MP, f/1.7, OIS',
    second_camera: '50 MP periscope',
    front_camera: '12 MP',
    video: '8K@30fps',
  },
  connectivity: {
    bluetooth: '5.3',
    location: 'GPS, GLONASS',
    sensors: 'Fingerprint, accelerometer',
    usb: 'USB Type-C 3.2',
  },
  design: { resistance: 'IP68', weight_g: 218, materials: 'Titanium' },
  display: {
    type: 'Dynamic AMOLED 2X, 120Hz',
    refresh_rate_hz: 120,
    protection: 'Gorilla Armor',
    size_inch: 6.8,
  },
  hardware: { chipset: 'Snapdragon 8 Elite', ram_gb: 12, cpu: 'Octa-core' },
  multimedia: { audio_features: 'Stereo speakers', loudspeaker: 'Yes' },
  availability: { status: 'Available', announced: '2025' },
  ...overrides,
});
const scoringCases: Array<[string, Record<string, unknown>]> = [
  ['smartphones', {}],
  ['smartphones', { display: { refresh_rate_hz: 60, type: 'LCD' } }],
  ['smartphones', { camera: {}, multimedia: {} }],
  ['tablets', { battery: { capacity_mah: 10090 } }],
  ['tablets', {}],
  ['laptops', { hardware: { ram_gb: 32, chipset: 'Apple M4' } }],
  ['smartwatches', { battery: { capacity_mah: 400, charging: 'Fast' } }],
  ['earbuds', { battery: { capacity_mah: 300 }, camera: {} }],
];
const scoringRows = scoringCases.map(
  ([category, overrides], idx) =>
    ({
      id: `p-1515-${idx}`,
      slug: `p-1515-${idx}`,
      name: `Product ${idx}`,
      brand: idx % 2 ? 'Samsung' : 'Apple',
      model: `Model ${idx}`,
      min_price: 10_000_000 + idx * 1_000_000,
      max_price: 12_000_000 + idx * 1_000_000,
      merchant_count: 2 + idx,
      user_rating_weighted: 4 + idx / 10,
      expert_rating: 8 + idx / 10,
      ram_gb: 8,
      storage_gb: 256,
      battery_mah: 5000,
      metadata: { category_slug: category },
      specifications: fullSheet(category, overrides),
    }) as unknown as MasterProduct
);
const scoreFields = (
  row: MasterProduct,
  criterion: (typeof VALID_LEADERBOARD_CRITERIA)[number]
) => {
  const { product: _product, ...scores } = scoreMasterProductForLeaderboard(
    row,
    criterion
  );
  return scores;
};
for (const row of scoringRows) {
  const slim = withScoringSpecs(row) as MasterProduct;
  const slimSpecs = slim.specifications as Record<string, unknown>;
  assert.equal(slimSpecs.availability, undefined, 'no unscored spec group');
  assert.equal(
    (slimSpecs.camera as Record<string, unknown> | undefined)?.main_camera,
    undefined,
    'no unscored spec field'
  );
  for (const criterion of VALID_LEADERBOARD_CRITERIA) {
    assert.deepEqual(
      scoreFields(slim, criterion),
      scoreFields(row, criterion),
      `${row.slug} ${criterion}`
    );
  }
}
const pairSlugs = (
  rows: MasterProduct[],
  category: 'smartphones' | 'tablets'
) =>
  buildPopular1v1BattlesForCategory(rows, category).map((b) => [
    b.productA.slug,
    b.productB.slug,
    b.winnerSlug,
  ]);
for (const category of ['smartphones', 'tablets'] as const) {
  assert.deepEqual(
    pairSlugs(
      scoringRows.map((r) => withScoringSpecs(r) as MasterProduct),
      category
    ),
    pairSlugs(scoringRows, category),
    `popular pairs in ${category}`
  );
}
// The scores read no spec field: a criterion score is never derived from
// the specs (DOS/Rate#1143). Any spec a later change reads must be kept.
const engineSrc = readFileSync(
  new URL('../leaderboard-engine.ts', import.meta.url),
  'utf8'
);
const readSpecs = [
  ...engineSrc.matchAll(/\bspecs\??\.([a-z_]+)\??\.([a-z_]+)/g),
];
assert.equal(readSpecs.length, 0, 'the scoring file reads no spec field');
for (const [, group, field] of readSpecs) {
  const kept = (LEADERBOARD_SPEC_FIELDS as Record<string, readonly string[]>)[
    group!
  ];
  assert.ok(kept?.includes(field!), `specs.${group}.${field} is kept`);
}
// The leaderboard and the compare pickers hand their clients scoring rows.
assert.ok(page('leaderboard').includes('products.map(withScoringSpecs)'));
assert.ok(page('compare').includes('catalogCandidates.map(withScoringSpecs)'));
assert.ok(page('compare/[versus]').includes('directory.map(withScoringSpecs)'));

console.log('hero-products: withoutSpecSheet and withScoringSpecs passed');
