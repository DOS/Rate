import assert from 'node:assert/strict';
import {
  buildKeySpecLine,
  peerPriceDelta,
  rankRelatedCompetitors,
} from '../product-competitors';
import {
  resolveCompareEffectiveUserRating,
  resolveCompareExpertRating10,
} from '../rate-domain';

function main() {
  console.warn('🧪 Product competitors suite (#558)');

  // Priced peers come first, closest price first; unpriced peers go last.
  const peers = [
    { slug: 'self', min_price: 20_000_000 },
    { slug: 'unpriced-a', min_price: 0 },
    { slug: 'far', min_price: 40_000_000 },
    { slug: 'near', min_price: 21_000_000 },
    { slug: 'unpriced-b', min_price: null },
    { slug: 'mid', min_price: 15_000_000 },
  ];
  assert.deepEqual(
    rankRelatedCompetitors(peers as never, 'self', 20_000_000).map(
      (p) => p.slug
    ),
    ['near', 'mid', 'far']
  );
  assert.deepEqual(
    rankRelatedCompetitors(peers as never, 'self', 20_000_000, 5).map(
      (p) => p.slug
    ),
    ['near', 'mid', 'far', 'unpriced-a', 'unpriced-b']
  );

  // No "cheaper by" badge against an unpriced side.
  assert.equal(peerPriceDelta(0, 20_000_000), 0);
  assert.equal(peerPriceDelta(19_000_000, 0), 0);
  assert.equal(peerPriceDelta(19_000_000, 20_000_000), -1_000_000);
  assert.equal(peerPriceDelta(21_000_000, 20_000_000), 1_000_000);

  // Spec line falls back to the 10-group specs and the top-level columns.
  assert.equal(
    buildKeySpecLine({
      key_specs: {
        chip: 'A18 Pro',
        ram: '8GB',
        storage: '256GB',
        battery: '4685 mAh',
      },
      specifications: {},
      ram_gb: null,
      storage_gb: null,
      battery_mah: null,
    } as never),
    'A18 Pro • 8GB • 256GB • 4685 mAh'
  );
  assert.equal(
    buildKeySpecLine({
      key_specs: {},
      specifications: {
        hardware: { chipset: 'Snapdragon 8 Elite' },
        battery: { capacity_mah: 5000 },
      },
      ram_gb: 12,
      storage_gb: 256,
      battery_mah: null,
    } as never),
    'Snapdragon 8 Elite • 12GB RAM • 256GB • 5000 mAh'
  );
  assert.equal(
    buildKeySpecLine({
      key_specs: null,
      specifications: null,
      ram_gb: null,
      storage_gb: null,
      battery_mah: null,
    } as never),
    ''
  );

  // Ratings used on the page: 5-star expert ratings show out of 10, and
  // 10-point user ratings scale to 5 stars.
  assert.equal(
    resolveCompareExpertRating10({ expert_rating: 4.6 } as never),
    9.2
  );
  assert.equal(
    resolveCompareExpertRating10({ expert_rating: 9.2 } as never),
    9.2
  );
  assert.equal(
    resolveCompareExpertRating10({ expert_rating: 0 } as never),
    null
  );
  assert.equal(
    resolveCompareEffectiveUserRating({
      user_rating_weighted: 8.6,
      average_rating: 4,
    } as never),
    4.3
  );
  assert.equal(
    resolveCompareEffectiveUserRating({
      user_rating_weighted: 0,
      average_rating: 4.5,
    } as never),
    4.5
  );

  console.warn('✅ Product competitors suite passed');
}

main();
