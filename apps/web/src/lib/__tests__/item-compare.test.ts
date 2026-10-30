import assert from 'node:assert/strict';
import {
  compareTarget,
  dedupeCompareTargets,
  parseCompareToken,
  pickItemVariant,
  canonicalVersusOrder,
  inPairOrder,
  lookupSlugAnyCase,
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

async function main() {
  console.warn('🧪 item compare suite (DOS/Rate#1156)');

  assert.deepEqual(parseCompareToken('apple-iphone-16@128gb'), {
    slug: 'apple-iphone-16',
    variantKey: '128gb',
  });
  assert.deepEqual(parseCompareToken(' Apple-iPhone-16 '), {
    slug: 'apple-iphone-16',
    variantKey: null,
  });
  // For the exact lookup the slug keeps its case; the size key never does.
  assert.deepEqual(parseCompareToken(' Apple-iPhone-16@128GB ', true), {
    slug: 'Apple-iPhone-16',
    variantKey: '128gb',
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
  // A sorted URL that would not parse back (a slug ending in "-vs") takes
  // the other order, whichever order it was given in.
  assert.deepEqual(canonicalVersusOrder('z-phone', 'a-phone-vs'), [
    'z-phone',
    'a-phone-vs',
  ]);
  assert.deepEqual(canonicalVersusOrder('a-phone-vs', 'z-phone'), [
    'z-phone',
    'a-phone-vs',
  ]);
  // Item route: an Item slug ending in "-vs" redirects only to a URL that
  // parses back, or has no versus page.
  const vsEndItem: CompareResolution = {
    kind: 'item',
    item: { id: 'item-vse', slug: 'a-phone-vs', default_variant_id: null },
    variants: [{ id: 'av', slug: 'a-phone-standard', variant_key: 'standard' }],
  };
  const plan1367 = planVersusRoute(
    { slug: 'a-phone-standard', resolution: vsEndItem },
    { slug: 'samsung-galaxy-s24', resolution: s24 }
  );
  assert.deepEqual(plan1367, {
    kind: 'redirect',
    to: '/compare/samsung-galaxy-s24-vs-a-phone-vs',
  });
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

  // An Item slug with capitals: the URL is read lower-cased and looked up
  // as typed, and a redirect for case alone never happens, so the chain
  // always ends on a page (DOS/Rate#1383).
  const capsItem = {
    id: 'item-caps',
    slug: 'A-phone',
    default_variant_id: 'v-caps',
  };
  const capsVariant = {
    id: 'v-caps',
    slug: 'a-phone',
    variant_key: 'standard',
  };
  const zItem: CompareResolution = {
    kind: 'item',
    item: { id: 'item-z', slug: 'z-phone', default_variant_id: null },
    variants: [{ id: 'vz', slug: 'z-phone-std', variant_key: 'standard' }],
  };
  // The catalogue lookup is exact, as resolveCatalogSlug's `.eq('slug')`.
  const lookup1383 = (slug: string): CompareResolution | null =>
    slug === 'A-phone'
      ? { kind: 'item', item: capsItem, variants: [capsVariant] }
      : slug === 'a-phone'
        ? {
            kind: 'variant',
            item: capsItem,
            variant: capsVariant,
            variants: [capsVariant],
            retired: false,
          }
        : slug === 'z-phone'
          ? zItem
          : null;
  // The page: lower-cased parse, then the slugs as typed, then lower-cased.
  const follow1383 = (start: string) => {
    let path = start;
    for (let hop = 0; hop < 5; hop++) {
      const raw = path.replace(/^\/compare\//, '');
      const asTyped = raw.split('-vs-') as [string, string];
      const lower = raw.toLowerCase().split('-vs-') as [string, string];
      const planFor = ([a, b]: [string, string]) =>
        planVersusRoute(
          { slug: a, resolution: lookup1383(a) },
          { slug: b, resolution: lookup1383(b) }
        );
      let plan = planFor(asTyped);
      if (plan.kind === 'not_found') plan = planFor(lower);
      if (plan.kind !== 'redirect') return { plan, hops: hop };
      path = plan.to;
    }
    throw new Error(`redirect loop from ${start}`);
  };
  for (const start of [
    '/compare/A-phone-vs-z-phone',
    '/compare/a-phone-vs-z-phone',
    '/compare/z-phone-vs-a-phone',
    '/compare/z-phone-vs-A-phone',
  ]) {
    const { plan, hops } = follow1383(start);
    assert.equal(plan.kind, 'render', start);
    assert.ok(hops <= 1, `${start} needs at most one hop`);
  }
  // The lower-case variant URL still 308s to the Item URL, so both show the
  // same size under the one canonical.
  assert.equal(follow1383('/compare/a-phone-vs-z-phone').hops, 1);
  assert.deepEqual(follow1383('/compare/A-phone-vs-z-phone').plan, {
    kind: 'render',
    slugA: 'a-phone',
    slugB: 'z-phone-std',
    canonical: '/compare/A-phone-vs-z-phone',
  });

  // The lookup itself, exact like the catalogue: an Item slug with capitals is
  // found as typed, a capitalised alias of a lower-case slug lower-cased, and
  // each side reports the slug it was found under (#1383).
  const catalogue1383 = new Map<string, string>([
    ['Apple-iPhone-16', 'item'],
    ['z-phone', 'master'],
  ]);
  const exact1383 = async (slug: string) => catalogue1383.get(slug) ?? null;
  assert.deepEqual(await lookupSlugAnyCase('Apple-iPhone-16', exact1383), {
    slug: 'Apple-iPhone-16',
    found: 'item',
  });
  assert.deepEqual(await lookupSlugAnyCase('Z-Phone', exact1383), {
    slug: 'z-phone',
    found: 'master',
  });
  assert.deepEqual(await lookupSlugAnyCase('apple-iphone-16', exact1383), {
    slug: 'apple-iphone-16',
    found: null,
  });

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
