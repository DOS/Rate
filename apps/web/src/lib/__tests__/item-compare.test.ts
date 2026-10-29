import assert from 'node:assert/strict';
import {
  compareTarget,
  dedupeCompareTargets,
  parseCompareToken,
  pickItemVariant,
  canonicalVersusOrder,
  inPairOrder,
  planVersusRoute,
  versusAliasRedirect,
  versusHref,
  itemSlugFromProductAnswer,
  type CompareResolution,
} from '../item-compare';

// Compare, versus and watchlist per Item (DOS/Rate#1156).

const item16 = {
  id: 'item-16',
  slug: 'apple-iphone-16',
  default_variant_id: 'v256',
};
const v128 = {
  id: 'v128',
  slug: 'apple-iphone-16-128gb',
  variant_key: '128gb',
};
const v256 = {
  id: 'v256',
  slug: 'apple-iphone-16-256gb',
  variant_key: '256gb',
};
const variants16 = [v128, v256];
const asItem: CompareResolution = {
  kind: 'item',
  item: item16,
  variants: variants16,
};
const asVariant = (
  variant: typeof v128,
  retired = false
): CompareResolution => ({
  kind: 'variant',
  item: item16,
  variant,
  variants: variants16,
  retired,
});
const s24: CompareResolution = {
  kind: 'item',
  item: {
    id: 'item-s24',
    slug: 'samsung-galaxy-s24',
    default_variant_id: null,
  },
  variants: [
    { id: 's1', slug: 'samsung-galaxy-s24-256gb', variant_key: '256gb' },
  ],
};

function main() {
  console.warn('🧪 item compare suite (DOS/Rate#1156)');

  assert.deepEqual(parseCompareToken('apple-iphone-16@128gb'), {
    slug: 'apple-iphone-16',
    variantKey: '128gb',
  });
  assert.deepEqual(parseCompareToken(' Apple-iPhone-16 '), {
    slug: 'apple-iphone-16',
    variantKey: null,
  });
  assert.deepEqual(parseCompareToken('a@b@c'), {
    slug: 'a@b@c',
    variantKey: null,
  });

  assert.equal(pickItemVariant(item16, variants16, '128gb'), v128);
  assert.equal(pickItemVariant(item16, variants16, '1tb'), v256, 'default');
  assert.equal(
    pickItemVariant({ ...item16, default_variant_id: null }, variants16, null),
    v128,
    'first'
  );
  assert.equal(pickItemVariant(item16, [], null), null);

  // Item slug: its default size, or the pinned one.
  assert.equal(
    compareTarget(asItem, parseCompareToken('apple-iphone-16'))?.variantSlug,
    'apple-iphone-16-256gb'
  );
  assert.equal(
    compareTarget(asItem, parseCompareToken('apple-iphone-16@128gb'))
      ?.variantSlug,
    'apple-iphone-16-128gb'
  );
  // Old variant slug: itself; a retired one: the Item's default.
  assert.equal(
    compareTarget(asVariant(v128), parseCompareToken('apple-iphone-16-128gb'))
      ?.variantSlug,
    'apple-iphone-16-128gb'
  );
  assert.equal(
    compareTarget(
      asVariant(v128, true),
      parseCompareToken('apple-iphone-16-unknown')
    )?.variantSlug,
    'apple-iphone-16-256gb'
  );
  assert.deepEqual(
    compareTarget({ kind: 'unlinked' }, parseCompareToken('pixel-10')),
    { variantSlug: 'pixel-10', itemId: null, itemSlug: null }
  );
  assert.equal(compareTarget(null, parseCompareToken('nope')), null);

  // One entry per Item: two sizes of one Item are no comparison.
  assert.deepEqual(
    dedupeCompareTargets([
      { variantSlug: 'apple-iphone-16-128gb', itemId: 'item-16' },
      null,
      { variantSlug: 'apple-iphone-16-256gb', itemId: 'item-16' },
      { variantSlug: 'pixel-10', itemId: null },
      { variantSlug: 'pixel-10', itemId: null },
    ]).map((t) => t.variantSlug),
    ['apple-iphone-16-128gb', 'pixel-10']
  );

  // Versus: an old variant pair 308s to the Item pair.
  assert.deepEqual(
    planVersusRoute(
      { slug: 'apple-iphone-16-128gb', resolution: asVariant(v128) },
      { slug: 'samsung-galaxy-s24-256gb', resolution: s24 }
    ),
    { kind: 'redirect', to: '/compare/apple-iphone-16-vs-samsung-galaxy-s24' }
  );
  // The Item pair renders the default sizes, canonical on itself.
  assert.deepEqual(
    planVersusRoute(
      { slug: 'apple-iphone-16', resolution: asItem },
      { slug: 'samsung-galaxy-s24', resolution: s24 }
    ),
    {
      kind: 'render',
      slugA: 'apple-iphone-16-256gb',
      slugB: 'samsung-galaxy-s24-256gb',
      canonical: '/compare/apple-iphone-16-vs-samsung-galaxy-s24',
    }
  );
  // Same Item on both sides: no versus.
  assert.deepEqual(
    planVersusRoute(
      { slug: 'apple-iphone-16-128gb', resolution: asVariant(v128) },
      { slug: 'apple-iphone-16-256gb', resolution: asVariant(v256) }
    ),
    { kind: 'not_found' }
  );
  // Neither side has an Item: today's page; an unknown side: 404.
  assert.deepEqual(
    planVersusRoute(
      { slug: 'a', resolution: { kind: 'unlinked' } },
      { slug: 'b', resolution: { kind: 'unlinked' } }
    ),
    { kind: 'legacy' }
  );
  assert.deepEqual(
    planVersusRoute(
      { slug: 'apple-iphone-16', resolution: asItem },
      { slug: 'gone', resolution: null }
    ),
    { kind: 'not_found' }
  );

  // A slug holding "-vs-" cannot be a versus side: no versus page (#1275).
  const vsItem: CompareResolution = {
    kind: 'item',
    item: { id: 'item-vs', slug: 'case-vs-cover', default_variant_id: null },
    variants: [
      { id: 'cv', slug: 'case-vs-cover-std', variant_key: 'standard' },
    ],
  };
  assert.deepEqual(
    planVersusRoute(
      { slug: 'case-vs-cover-std', resolution: vsItem },
      { slug: 'samsung-galaxy-s24', resolution: s24 }
    ),
    { kind: 'not_found' }
  );

  // In-app versus links name Items when mapped (#1290).
  const map = {
    'apple-iphone-16-128gb': 'apple-iphone-16',
    'case-a-std': 'case-vs-cover',
  };
  assert.equal(
    versusHref('apple-iphone-16-128gb', 'pixel-10', map),
    '/compare/apple-iphone-16-vs-pixel-10'
  );
  assert.equal(
    versusHref('apple-iphone-16-128gb', 'pixel-10'),
    '/compare/apple-iphone-16-128gb-vs-pixel-10',
    'no map: as before'
  );
  assert.equal(
    versusHref('case-a-std', 'pixel-10', map),
    '/compare/case-a-std-vs-pixel-10',
    'an Item slug holding -vs- keeps the variant slug'
  );

  // One URL per pair, the slugs sorted; the other order 308s there (#1367).
  assert.deepEqual(canonicalVersusOrder('b', 'a'), ['a', 'b']);
  assert.deepEqual(canonicalVersusOrder('a', 'b'), ['a', 'b']);
  assert.equal(
    versusHref('pixel-10', 'apple-iphone-16-128gb'),
    '/compare/apple-iphone-16-128gb-vs-pixel-10',
    'links name the pair in its canonical order'
  );
  assert.equal(
    versusHref('pixel-10', 'apple-iphone-16-128gb', map),
    '/compare/apple-iphone-16-vs-pixel-10',
    'sorted on the Item slugs the URL shows'
  );
  // The other order, letter case or encoding redirects; the canonical
  // renders; a slug that is no plain catalogue slug is left to 404.
  const macbookVsAsus =
    '/compare/apple-macbook-pro-m4-pro-14-inch-512gb-vs-asus-zenbook-s-14-1tb';
  assert.equal(
    versusAliasRedirect(
      'asus-zenbook-s-14-1tb-vs-apple-macbook-pro-m4-pro-14-inch-512gb',
      macbookVsAsus
    ),
    macbookVsAsus
  );
  assert.equal(
    versusAliasRedirect(
      'Apple-MacBook-Pro-M4-Pro-14-inch-512GB-vs-asus-zenbook-s-14-1tb',
      macbookVsAsus
    ),
    macbookVsAsus,
    'letter case'
  );
  assert.equal(
    versusAliasRedirect(
      'apple-macbook-pro-m4-pro-14-inch-512gb-vs-asus-zenbook-s-14-1tb',
      macbookVsAsus
    ),
    null
  );
  assert.equal(
    versusAliasRedirect('zz-junk-vs-aa")x', '/compare/aa")x-vs-zz-junk'),
    null,
    'no 308 to a path built from junk'
  );
  assert.equal(versusAliasRedirect('b-vs-a..b', '/compare/a..b-vs-b'), null);
  // A sorted URL that would not parse back keeps the order given (a slug
  // ending in "-vs").
  assert.deepEqual(canonicalVersusOrder('z-phone', 'a-phone-vs'), [
    'z-phone',
    'a-phone-vs',
  ]);
  assert.deepEqual(canonicalVersusOrder('B-Phone', 'a-phone'), [
    'a-phone',
    'B-Phone',
  ]);
  // The compare read may answer in any order; the page keeps the URL's.
  const read = [{ slug: 'b-phone' }, { slug: 'a-phone' }];
  assert.deepEqual(
    inPairOrder(read, ['a-phone', 'b-phone']).map((p) => p?.slug),
    ['a-phone', 'b-phone']
  );
  assert.deepEqual(
    inPairOrder(
      [{ slug: 'A-Phone' }, { slug: 'b-phone' }],
      ['a-phone', 'b-phone']
    ).map((p) => p?.slug),
    ['A-Phone', 'b-phone'],
    'slugs match without regard to case'
  );
  assert.deepEqual(
    inPairOrder([{ slug: 'a-phone' }], ['a-phone', 'b-phone']).map(
      (p) => p?.slug
    ),
    ['a-phone', undefined],
    'a missing side stays missing (the page 404s)'
  );
  assert.deepEqual(
    inPairOrder([{ slug: 'b-phone' }], ['a-phone', 'b-phone']).map(
      (p) => p?.slug
    ),
    [undefined, 'b-phone'],
    'a missing first side is no B vs B'
  );
  // Item route: the reverse Item pair 308s to the sorted one.
  assert.deepEqual(
    planVersusRoute(
      { slug: 'samsung-galaxy-s24', resolution: s24 },
      { slug: 'apple-iphone-16', resolution: asItem }
    ),
    { kind: 'redirect', to: '/compare/apple-iphone-16-vs-samsung-galaxy-s24' }
  );

  // A restored tray product reads its Item from the product API (#1294).
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: 'apple-iphone-16' } } },
      'apple-iphone-16-128gb'
    ),
    'apple-iphone-16'
  );
  assert.equal(
    itemSlugFromProductAnswer({ ok: true, data: {} }, 'pixel-10'),
    'pixel-10',
    'no Item (flag off or unlinked): the slug itself'
  );
  assert.equal(itemSlugFromProductAnswer(null, 'x'), 'x');
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: 'Bad Slug' } } },
      'x'
    ),
    'x'
  );

  console.warn('  ✅ item compare suite passed');
}

main();
