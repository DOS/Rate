import assert from 'node:assert/strict';
import {
  implausiblyLowIndexes,
  implausiblyLowOfferIds,
  plausibleMinPrice,
  plausibleOffers,
} from '../offer-plausibility';

function main() {
  console.warn('🧪 Offer plausibility suite');

  // The live Galaxy Buds3 Pro case: 723,269 against 3.0-3.7 M (DOS/Rate#797).
  const buds = [
    { id: 'lazada', price_current: 723269 },
    { id: 'fpt', price_current: 3032000 },
    { id: 'tgdd', price_current: 3140000 },
    { id: 'cps', price_current: 3690000 },
  ];
  assert.deepEqual([...implausiblyLowOfferIds(buds)], ['lazada']);
  assert.deepEqual(
    plausibleOffers(buds).map((o) => o.id),
    ['fpt', 'tgdd', 'cps']
  );
  assert.equal(plausibleMinPrice(723269, buds), 3032000);

  // A real discount (60% of the others) is kept.
  assert.equal(implausiblyLowIndexes([600, 1000, 1000, 1000]).size, 0);
  // Exactly at the 40% line is kept; below it is flagged.
  assert.equal(implausiblyLowIndexes([400, 1000, 1000]).size, 0);
  assert.deepEqual([...implausiblyLowIndexes([399, 1000, 1000])], [0]);

  // Two offers are too few to call either an outlier.
  assert.equal(implausiblyLowIndexes([100, 1000]).size, 0);
  assert.equal(
    plausibleMinPrice(100, [{ price_current: 100 }, { price_current: 1000 }]),
    100
  );

  // Unpriced offers are ignored, never flagged, and do not count.
  assert.equal(implausiblyLowIndexes([0, NaN, 100, 1000]).size, 0);
  assert.equal(implausiblyLowIndexes([0, 100, 1000, 1000]).size, 1);

  // One overpriced listing does not hide a real deal (lower median of others).
  assert.equal(implausiblyLowIndexes([1500, 3000, 9000]).size, 0);
  assert.equal(implausiblyLowIndexes([1300, 3000, 3200, 9000, 9500]).size, 0);
  // Two bait listings among four are both flagged.
  assert.deepEqual(
    [...implausiblyLowIndexes([700, 750, 3000, 3100])].sort(),
    [0, 1]
  );
  // Order of the input does not matter.
  assert.deepEqual([...implausiblyLowIndexes([3100, 700, 3000])], [1]);
  // Large lists stay fast (sorted once).
  const many = Array.from({ length: 5000 }, (_, i) => 1_000_000 + i);
  many.push(100_000);
  const started = Date.now();
  assert.deepEqual([...implausiblyLowIndexes(many)], [5000]);
  assert.ok(Date.now() - started < 200, 'implausiblyLowIndexes is O(n log n)');

  // No priced offers: the stored minimum stands.
  assert.equal(plausibleMinPrice(5000, []), 5000);
  assert.equal(plausibleMinPrice(5000, [{ price_current: 0 }]), 5000);

  console.warn('✅ Offer plausibility suite passed');
}

main();
