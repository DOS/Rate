/**
 * DOS/Rate#1996: publish predicate for sourced electronics drafts. A draft publishes when its
 * seed is fully sourced AND 2 distinct chains have a priced, in-stock listing above the floor.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MIN_PUBLISH_CHAINS,
  SOURCED_SEED_SETS,
  evaluateElectronicsDraftPublish,
  isDraftPublishable,
  isFullySourcedSeed,
  isSourcedSeedModelKey,
  qualifyingChains,
  unsourcedSpecGroups,
  type PublishListing,
  type SeedProvenance,
} from '../publish-predicate.js';
import { FLAGSHIP_DEVICES_TO_SEED } from '../flagship-seed-data.js';

const SOURCED_KEY = 'apple:iphone-17e:256gb';
const FLOOR = 1_000_000;

const listing = (platform: string, overrides: Partial<PublishListing> = {}): PublishListing => ({
  platform,
  price_current: 15_000_000,
  currency: 'VND',
  availability: 'in_stock',
  origin: 'crawl',
  ...overrides,
});

function decide(listings: PublishListing[], modelKey = SOURCED_KEY, floor = FLOOR) {
  return evaluateElectronicsDraftPublish({
    master: { model_key: modelKey },
    listings,
    categoryPriceFloor: floor,
  });
}

test('0 chains: not publishable', () => {
  const d = decide([]);
  assert.equal(d.publishable, false);
  assert.deepEqual(d.blockers, ['insufficient_chains']);
  assert.deepEqual(d.chains, []);
  assert.equal(d.seedSourced, true);
});

test('1 chain: not publishable', () => {
  const d = decide([listing('fptshop')]);
  assert.equal(d.publishable, false);
  assert.deepEqual(d.chains, ['fptshop']);
  assert.match(d.reason, /1 of 2 required chains/);
});

test('2 chains with a sourced seed: publishable', () => {
  const d = decide([listing('fptshop'), listing('hoanghamobile')]);
  assert.equal(d.publishable, true);
  assert.deepEqual(d.blockers, []);
  assert.deepEqual(d.chains, ['fptshop', 'hoanghamobile']);
  assert.equal(MIN_PUBLISH_CHAINS, 2);
  assert.equal(
    isDraftPublishable({
      master: { model_key: SOURCED_KEY },
      listings: [listing('fptshop'), listing('hoanghamobile')],
      categoryPriceFloor: FLOOR,
    }),
    true
  );
});

test('3 chains publish; chain keys compare trimmed and case-insensitive', () => {
  const d = decide([listing('FPTShop'), listing(' fptshop '), listing('cellphones')]);
  assert.deepEqual(d.chains, ['cellphones', 'fptshop']);
  assert.equal(d.publishable, true);
});

test('two listings of the same chain count once', () => {
  const d = decide([listing('fptshop'), listing('fptshop', { price_current: 16_000_000 })]);
  assert.equal(d.publishable, false);
  assert.deepEqual(d.chains, ['fptshop']);
  assert.equal(d.qualifyingListingCount, 2);
});

test('an explicit chain key wins over the platform', () => {
  const d = decide([
    listing('shopee', { chain: 'fptshop' }),
    listing('shopee', { chain: 'hoanghamobile' }),
  ]);
  assert.deepEqual(d.chains, ['fptshop', 'hoanghamobile']);
  assert.equal(d.publishable, true);
});

test('a listing without a chain or platform never counts', () => {
  const d = decide([listing('fptshop'), listing('', { chain: null })]);
  assert.equal(d.publishable, false);
});

test('out of stock listings do not count', () => {
  for (const availability of ['out_of_stock', 'preorder', '', null, undefined]) {
    const d = decide([listing('fptshop'), listing('hoanghamobile', { availability })]);
    assert.equal(d.publishable, false, String(availability));
  }
  // A stock count of 0 (or junk) overrides an in_stock flag; an unknown count does not.
  assert.equal(decide([listing('a'), listing('b', { stock: 0 })]).publishable, false);
  assert.equal(decide([listing('a'), listing('b', { stock: 'x' })]).publishable, false);
  assert.equal(decide([listing('a'), listing('b', { stock: null })]).publishable, true);
  assert.equal(decide([listing('a'), listing('b', { stock: 4 })]).publishable, true);
});

test('unpriced listings do not count', () => {
  for (const price_current of [null, 0, -5, 'abc', '', Number.NaN, Infinity]) {
    const d = decide([listing('fptshop'), listing('hoanghamobile', { price_current })]);
    assert.equal(d.publishable, false, String(price_current));
  }
  // PostgREST numeric strings are priced.
  assert.equal(
    decide([listing('a'), listing('b', { price_current: '12990000.00' })]).publishable,
    true
  );
});

test('a price at or below the category floor does not count', () => {
  assert.equal(decide([listing('a'), listing('b', { price_current: FLOOR })]).publishable, false);
  assert.equal(
    decide([listing('a'), listing('b', { price_current: FLOOR - 1 })]).publishable,
    false
  );
  assert.equal(
    decide([listing('a'), listing('b', { price_current: FLOOR + 1 })]).publishable,
    true
  );
  // The floor is the caller's per category.
  assert.equal(decide([listing('a'), listing('b')], SOURCED_KEY, 20_000_000).publishable, false);
});

test('a price above the VND sanity cap, a foreign currency or a non-crawl origin does not count', () => {
  assert.equal(
    decide([listing('a'), listing('b', { price_current: 2_000_000_000 })]).publishable,
    false
  );
  assert.equal(decide([listing('a'), listing('b', { currency: 'USD' })]).publishable, false);
  assert.equal(decide([listing('a'), listing('b', { origin: 'extension' })]).publishable, false);
  assert.equal(decide([listing('a'), listing('b', { origin: null })]).publishable, true);
});

test('an invalid floor blocks instead of guessing', () => {
  for (const floor of [Number.NaN, -1, Infinity]) {
    const d = decide([listing('a'), listing('b')], SOURCED_KEY, floor);
    assert.equal(d.publishable, false);
    assert.ok(d.blockers.includes('invalid_price_floor'));
  }
  assert.deepEqual(qualifyingChains([listing('a')], Number.NaN), []);
});

test('an unsourced seed or an unseeded model never publishes, even on 3 chains', () => {
  const listings = [listing('a'), listing('b'), listing('c')];
  const unseeded = decide(listings, 'khac:no-such-model:128gb');
  assert.equal(unseeded.publishable, false);
  assert.deepEqual(unseeded.blockers, ['seed_not_sourced']);
  assert.equal(unseeded.seedSourced, false);

  const unsourced: SeedProvenance = {
    model_key: 'acme:phone:128gb',
    specifications: { display: { size_inch: 6.1 }, battery: { capacity_mah: 4000 } },
    sources: { display: 'https://example.com/spec' },
  };
  const d = evaluateElectronicsDraftPublish({
    master: { model_key: 'acme:phone:128gb' },
    listings,
    categoryPriceFloor: FLOOR,
    seeds: [unsourced],
  });
  assert.equal(d.publishable, false);
  assert.deepEqual(d.blockers, ['seed_not_sourced']);
  assert.deepEqual(unsourcedSpecGroups(unsourced), ['battery']);
});

test('both blockers are reported together', () => {
  const d = decide([listing('a')], 'khac:no-such-model:128gb');
  assert.deepEqual(d.blockers, ['seed_not_sourced', 'insufficient_chains']);
});

test('fully sourced: a group is covered by itself, a field path or nothing else', () => {
  const base = {
    model_key: 'acme:phone:128gb',
    specifications: { display: { size_inch: 6.1 }, battery: { capacity_mah: 4000 } },
  };
  const url = 'https://example.com/spec';
  assert.equal(isFullySourcedSeed({ ...base, sources: { display: url, battery: url } }), true);
  assert.equal(
    isFullySourcedSeed({
      ...base,
      sources: { 'display.size_inch': url, 'battery.capacity_mah': url },
    }),
    true
  );
  // A sibling group with a similar prefix is not a source.
  assert.equal(
    isFullySourcedSeed({ ...base, sources: { display: url, battery_extra: url } }),
    false
  );
  assert.equal(isFullySourcedSeed({ ...base, sources: undefined }), false);
  // Only https URLs count.
  assert.equal(
    isFullySourcedSeed({ ...base, sources: { display: url, battery: 'http://example.com/a' } }),
    false
  );
  assert.equal(
    isFullySourcedSeed({ ...base, sources: { display: url, battery: 'not a url' } }),
    false
  );
  // A seed with no spec group is not "fully sourced".
  assert.equal(
    isFullySourcedSeed({ model_key: 'a:b:1gb', specifications: {}, sources: {} }),
    false
  );
  // Metadata keys and unset groups need no source.
  assert.equal(
    isFullySourcedSeed({
      model_key: 'a:b:1gb',
      specifications: {
        category_slug: 'smartphones',
        display: { size_inch: 6 },
        battery: undefined,
      },
      sources: { display: url },
    }),
    true
  );
});

test('isSourcedSeedModelKey: every registered sourced seed is recognised', () => {
  const seeds = SOURCED_SEED_SETS.flat();
  assert.ok(seeds.length >= 6);
  for (const seed of seeds) {
    assert.equal(isSourcedSeedModelKey(seed.model_key), true, seed.model_key);
    assert.equal(isSourcedSeedModelKey(` ${seed.model_key.toUpperCase()} `), true, seed.model_key);
  }
  assert.equal(isSourcedSeedModelKey(''), false);
  assert.equal(isSourcedSeedModelKey('unknown:model:1gb'), false);
});

test('a flagship seed outside the sourced seed files is not treated as sourced', () => {
  const sourced = new Set(SOURCED_SEED_SETS.flat().map(s => s.model_key));
  const hand = FLAGSHIP_DEVICES_TO_SEED.filter(s => !sourced.has(s.model_key));
  assert.ok(hand.length > 0);
  for (const seed of hand)
    assert.equal(isSourcedSeedModelKey(seed.model_key), false, seed.model_key);
});

test('SOURCED_SEED_SETS registers every flagship-seed-sourced-* file', async () => {
  const dir = fileURLToPath(new URL('..', import.meta.url));
  const files = fs.readdirSync(dir).filter(f => /^flagship-seed-sourced-.*\.ts$/.test(f));
  assert.ok(files.length >= 3);
  const registered = new Set(SOURCED_SEED_SETS.flat().map(s => s.model_key));
  for (const file of files) {
    const mod = (await import(`../${file.replace(/\.ts$/, '.js')}`)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      if (!Array.isArray(value)) continue;
      for (const seed of value as SeedProvenance[]) {
        assert.ok(registered.has(seed.model_key), `${file}: ${seed.model_key} is not registered`);
        assert.equal(
          isFullySourcedSeed(seed),
          true,
          `${file}: ${seed.model_key} is not fully sourced`
        );
      }
    }
  }
});
