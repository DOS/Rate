import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  productFromProductAnswer,
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
  // A capitalised alias of a lower-case side next to an Item slug with
  // capitals 308s to the canonical, which then renders as itself.
  assert.equal(
    versusAliasRedirect('A-phone-vs-Z-PHONE', '/compare/A-phone-vs-z-phone'),
    '/compare/A-phone-vs-z-phone'
  );
  assert.equal(
    versusAliasRedirect('A-phone-vs-z-phone', '/compare/A-phone-vs-z-phone'),
    null
  );
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
  // Mixed-case canonical Item slugs (#1383, #1768) are preserved verbatim.
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: 'Apple-iPhone-16' } } },
      'apple-iphone-16-128gb'
    ),
    'Apple-iPhone-16'
  );
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: 'Nokia-8.3-5G_2025' } } },
      'nokia-8-3-5g-128gb'
    ),
    'Nokia-8.3-5G_2025'
  );
  assert.equal(
    versusHref('samsung-galaxy-s24', 'apple-iphone-16-128gb', {
      'apple-iphone-16-128gb': itemSlugFromProductAnswer(
        { ok: true, data: { item: { slug: 'Apple-iPhone-16' } } },
        'apple-iphone-16-128gb'
      ),
    }),
    '/compare/Apple-iPhone-16-vs-samsung-galaxy-s24',
    'client lookup preserves mixed-case canonical Item slug in 1v1 link (#1768)'
  );
  assert.equal(
    versusHref('case-a-std', 'pixel-10', {
      'case-a-std': itemSlugFromProductAnswer(
        { ok: true, data: { item: { slug: 'Case-VS-Cover' } } },
        'case-a-std'
      ),
    }),
    '/compare/case-a-std-vs-pixel-10',
    'mixed-case Item slug holding -VS- keeps the variant slug in versusHref'
  );
  assert.deepEqual(
    planVersusRoute(
      {
        slug: 'case-a-std',
        resolution: {
          kind: 'item',
          item: {
            id: 'item-vs-caps',
            slug: 'Case-VS-Cover',
            default_variant_id: null,
          },
          variants: [
            { id: 'cv-caps', slug: 'case-a-std', variant_key: 'standard' },
          ],
        },
      },
      { slug: 'samsung-galaxy-s24', resolution: s24 }
    ),
    { kind: 'not_found' }
  );
  assert.deepEqual(canonicalVersusOrder('A-Phone-VS', 'z-phone'), [
    'z-phone',
    'A-Phone-VS',
  ]);
  assert.equal(
    versusHref('constructor', 'pixel-10', {
      'apple-iphone-16-128gb': 'Apple-iPhone-16',
    }),
    '/compare/constructor-vs-pixel-10',
    'versusHref ignores Object.prototype properties on itemSlugBySlug'
  );
  const maxLenItemSlug = `A${'b'.repeat(119)}`;
  assert.equal(maxLenItemSlug.length, 120);
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: maxLenItemSlug } } },
      'fallback-slug'
    ),
    maxLenItemSlug
  );
  assert.equal(
    versusHref('fallback-slug', 'samsung-galaxy-s24-256gb', {
      'fallback-slug': maxLenItemSlug,
      'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24',
    }),
    `/compare/${maxLenItemSlug}-vs-samsung-galaxy-s24`
  );
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: `${maxLenItemSlug}x` } } },
      'fallback-slug'
    ),
    'fallback-slug',
    'over-120-char Item slug falls back to requested slug to match resolveCatalogSlug'
  );
  // Rejects path-traversal / dot segments, sentinel tokens and prototype keys (#1768).
  for (const unsafeSlug of [
    '',
    '.',
    '..',
    '.Apple-iPhone-16',
    'Apple..iPhone-16',
    'Apple-iPhone-16.',
    'Apple-iPhone-16..',
    'Apple/iPhone-16',
    'Apple#iPhone-16',
    'Apple?iPhone-16',
    `${maxLenItemSlug}x`,
    '../etc/passwd',
    ' Apple-iPhone-16',
    'Apple-iPhone-16 ',
    '0',
    'null',
    'Null',
    'undefined',
    'nan',
    'none',
    'na',
    'false',
    'true',
    'TRUE',
    '__proto__',
    'constructor',
    'Constructor',
    'CONSTRUCTOR',
    'prototype',
    'Prototype',
    'toString',
    'toLocaleString',
    'valueOf',
    'ValueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
  ]) {
    assert.equal(
      itemSlugFromProductAnswer(
        { ok: true, data: { item: { slug: unsafeSlug } } },
        'safe-variant-slug'
      ),
      'safe-variant-slug',
      `unsafe Item slug ${JSON.stringify(unsafeSlug)} must fall back to variant slug`
    );
    const fallbackHref = versusHref('safe-variant-slug', 'pixel-10', {
      'safe-variant-slug': unsafeSlug,
    });
    assert.equal(
      fallbackHref,
      '/compare/pixel-10-vs-safe-variant-slug',
      `versusHref must reject unsafe pre-resolved Item slug ${JSON.stringify(unsafeSlug)}`
    );
    const [routeSlugA, routeSlugB] = fallbackHref
      .replace(/^\/compare\//, '')
      .split('-vs-') as [string, string];
    const variantResolution: CompareResolution = {
      kind: 'variant',
      item: {
        id: 'item-unsafe',
        slug: unsafeSlug,
        default_variant_id: 'v-unsafe',
      },
      variant: {
        id: 'v-unsafe',
        slug: 'safe-variant-slug',
        variant_key: 'standard',
      },
      variants: [
        {
          id: 'v-unsafe',
          slug: 'safe-variant-slug',
          variant_key: 'standard',
        },
      ],
      retired: false,
    };
    assert.deepEqual(
      planVersusRoute(
        { slug: routeSlugA, resolution: { kind: 'unlinked' } },
        { slug: routeSlugB, resolution: variantResolution }
      ),
      {
        kind: 'render',
        slugA: 'pixel-10',
        slugB: 'safe-variant-slug',
        canonical: fallbackHref,
      },
      `fallback link ${fallbackHref} for rejected Item slug ${JSON.stringify(unsafeSlug)} must render in planVersusRoute`
    );
  }
  assert.deepEqual(
    planVersusRoute(
      {
        slug: 'bad..variant',
        resolution: {
          kind: 'item',
          item: {
            id: 'item-both-unsafe',
            slug: 'Apple..iPhone-16',
            default_variant_id: null,
          },
          variants: [
            {
              id: 'v-both-unsafe',
              slug: 'bad..variant',
              variant_key: 'standard',
            },
          ],
        },
      },
      { slug: 'samsung-galaxy-s24', resolution: s24 }
    ),
    { kind: 'not_found' }
  );
  assert.equal(
    itemSlugFromProductAnswer(
      Object.assign([], {
        ok: true,
        data: { item: { slug: 'Apple-iPhone-16' } },
      }),
      'safe-variant-slug'
    ),
    'safe-variant-slug',
    'array envelope must not pass as a product answer'
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

  // /compare SSR pre-resolves both initialProducts and catalogCandidates via
  // getItemSlugsFor so CompareWorkspace receives exact Item membership
  // (including mixed linked/unlinked siblings) from first paint (#1768).
  const comparePageSrc = readFileSync(
    new URL('../../app/[locale]/compare/page.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    comparePageSrc,
    /getItemSlugsFor\(\s*\[\s*\.\.\.initialProducts\.map\(\(p\)\s*=>\s*p\.slug\),\s*\.\.\.catalogCandidates\.map\(\(p\)\s*=>\s*p\.slug\),?\s*\],\s*resolvedSelection\s*\)/,
    'ComparePhonesPage must resolve initial and candidate slugs with its own Item selection'
  );
  assert.ok(
    comparePageSrc.includes('{...(itemSlugBySlug ? { itemSlugBySlug } : {})}'),
    'ComparePhonesPage must forward itemSlugBySlug to CompareWorkspace'
  );

  const { resetRateClientForTests } = await import('../rate-api');
  const prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevItemModel = process.env.RATE_ITEM_MODEL;
  const prevFetch = globalThis.fetch;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.RATE_ITEM_MODEL = 'item';
    resetRateClientForTests();
    const ITEM_IPHONE = '11111111-1111-4111-8111-111111111768';
    const ITEM_XIAOMI = '22222222-2222-4222-8222-222222221768';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      );
      const q = decodeURIComponent(url.search);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': '0-0/*',
          },
        });
      if (Number(url.searchParams.get('offset') ?? 0) > 0) return json([]);
      if (url.pathname === '/rest/v1/items' && q.includes('select=id,slug')) {
        return json([
          { id: ITEM_IPHONE, slug: 'Apple-iPhone-16' },
          { id: ITEM_XIAOMI, slug: 'xiaomi-15-ultra' },
        ]);
      }
      if (
        url.pathname === '/rest/v1/master_products' &&
        q.includes('select=slug,item_id')
      ) {
        return json([
          { slug: 'apple-iphone-16-128gb', item_id: ITEM_IPHONE },
          { slug: 'apple-iphone-16-256gb', item_id: ITEM_IPHONE },
          { slug: 'apple-iphone-16-unlinked-import', item_id: null },
          { slug: 'xiaomi-15-ultra-512gb', item_id: ITEM_XIAOMI },
          { slug: 'samsung-galaxy-s24', item_id: null },
        ]);
      }
      return json([]);
    }) as typeof fetch;

    const { getItemSlugsFor } = await import('@/server/rate/item-directory');
    const ssrInitialProducts = [
      { slug: 'apple-iphone-16-128gb' },
      { slug: 'samsung-galaxy-s24' },
    ];
    const ssrCatalogCandidates = [
      { slug: 'apple-iphone-16-128gb' },
      { slug: 'apple-iphone-16-256gb' },
      { slug: 'apple-iphone-16-unlinked-import' },
      { slug: 'xiaomi-15-ultra-512gb' },
    ];
    const ssrMap = await getItemSlugsFor([
      ...ssrInitialProducts.map((p) => p.slug),
      ...ssrCatalogCandidates.map((p) => p.slug),
    ]);
    assert.deepEqual(ssrMap, {
      'apple-iphone-16-128gb': 'Apple-iPhone-16',
      'samsung-galaxy-s24': 'samsung-galaxy-s24',
      'apple-iphone-16-256gb': 'Apple-iPhone-16',
      'apple-iphone-16-unlinked-import': 'apple-iphone-16-unlinked-import',
      'xiaomi-15-ultra-512gb': 'xiaomi-15-ultra',
    });
    assert.equal(
      versusHref('xiaomi-15-ultra-512gb', 'apple-iphone-16-256gb', ssrMap),
      '/compare/Apple-iPhone-16-vs-xiaomi-15-ultra',
      'pre-resolved catalogCandidate pair maps to canonical Item slugs in versusHref'
    );
    assert.equal(
      versusHref(
        'apple-iphone-16-unlinked-import',
        'xiaomi-15-ultra-512gb',
        ssrMap
      ),
      '/compare/apple-iphone-16-unlinked-import-vs-xiaomi-15-ultra',
      'unlinked sibling keeps its own variant slug on SSR instead of inheriting a sibling Item'
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupabaseUrl;
    }
    if (prevSupabaseAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevSupabaseAnonKey;
    }
    if (prevItemModel === undefined) {
      delete process.env.RATE_ITEM_MODEL;
    } else {
      process.env.RATE_ITEM_MODEL = prevItemModel;
    }
    resetRateClientForTests();
  }

  // A compare candidate's full sheet comes from the product answer, and only
  // the asked product's (DOS/Rate#1515).
  const answered = { slug: 'pixel-10', specifications: { display: {} } };
  assert.equal(
    productFromProductAnswer(
      { ok: true, data: { product: answered } },
      'pixel-10'
    ),
    answered
  );
  assert.equal(
    productFromProductAnswer(
      { ok: true, data: { product: answered } },
      'other'
    ),
    null
  );
  assert.equal(
    productFromProductAnswer(
      { ok: false, data: { product: answered } },
      'pixel-10'
    ),
    null
  );
  assert.equal(productFromProductAnswer(null, 'pixel-10'), null);
  assert.equal(
    productFromProductAnswer({ ok: true, data: { product: [] } }, 'pixel-10'),
    null
  );

  // DOS/Rate#1820: CompareWorkspace Item deduplication, combobox Escape/ARIA,
  // locale-aware fitTitle/fitDescription on /compare & /compare/[versus], and
  // malformed percent-encoding guard in parseVersusSlugs.
  const nodeModule = require('node:module') as {
    _extensions?: Record<string, (mod: { exports: unknown }) => void>;
  };
  if (nodeModule._extensions && !nodeModule._extensions['.css']) {
    nodeModule._extensions['.css'] = (mod) => {
      mod.exports = {};
    };
  }

  const React = require('react') as typeof import('react');
  const { renderToStaticMarkup } =
    require('react-dom/server') as typeof import('react-dom/server');
  const { NextIntlClientProvider, createTranslator } =
    require('next-intl') as typeof import('next-intl');
  const { AppRouterContext } =
    require('next/dist/shared/lib/app-router-context.shared-runtime') as typeof import('next/dist/shared/lib/app-router-context.shared-runtime');
  const csMessages =
    require('../../../locales/cs.json') as typeof import('../../../locales/cs.json');
  const enMessages =
    require('../../../locales/en.json') as typeof import('../../../locales/en.json');
  const { pickClientMessages } =
    require('../client-messages') as typeof import('../client-messages');
  const { fitDescription, fitTitle } =
    require('../seo') as typeof import('../seo');
  const CompareWorkspaceMod =
    require('../../components/compare/CompareWorkspace') as typeof import('../../components/compare/CompareWorkspace');
  const CompareWorkspace = CompareWorkspaceMod.default;
  const {
    COMPARE_AUTOCOMPLETE_HEADING_ID,
    COMPARE_AUTOCOMPLETE_LIST_ID,
    applyCompareCandidateSelection,
    buildCompareAutocompleteSuggestions,
    buildCompareVersusSlugMap,
    dedupeCompareProductsByItem,
    isCompareCandidateSelected,
    pickCompareCategoryDefaults,
    resolveCompareAutocompleteA11y,
    resolveCompareTrayRestore,
    shouldDismissCompareOnFocusOut,
  } = CompareWorkspaceMod;
  const VersusPageMod =
    require('../../app/[locale]/compare/[versus]/page') as typeof import('../../app/[locale]/compare/[versus]/page');
  const { parseVersusSlugs } = VersusPageMod;

  type MasterProduct = import('@repo/shared-data').MasterProduct;
  const makeCandidate = (
    slug: string,
    name: string,
    modelKey: string,
    category: 'smartphones' | 'tablets' = 'smartphones',
    extra: Record<string, unknown> = {}
  ): MasterProduct =>
    ({
      id: `id-${slug}`,
      slug,
      name,
      brand: modelKey.split(':')[0] ?? 'Brand',
      model: modelKey.split(':')[1] ?? name,
      model_key: modelKey,
      status: 'published',
      min_price: 20_000_000,
      max_price: 22_000_000,
      merchant_count: 3,
      rating_score: 4.7,
      user_rating_weighted: 4.7,
      total_reviews: 20,
      metadata: { category_slug: category },
      specifications: {},
      key_specs: {},
      images: [],
      thumbnail: null,
      ...extra,
    }) as unknown as MasterProduct;

  const ip16v128 = makeCandidate(
    'apple-iphone-16-128gb',
    'Apple iPhone 16 128GB',
    'apple:iphone-16:128gb'
  );
  const ip16v256 = makeCandidate(
    'apple-iphone-16-256gb',
    'Apple iPhone 16 256GB',
    'apple:iphone-16:256gb'
  );
  const ip16v512Remote = makeCandidate(
    'apple-iphone-16-512gb',
    'Apple iPhone 16 512GB',
    'apple:iphone-16:512gb'
  );
  const s24v256 = makeCandidate(
    'samsung-galaxy-s24-256gb',
    'Samsung Galaxy S24 256GB',
    'samsung:galaxy-s24:256gb'
  );
  const xm15v512 = makeCandidate(
    'xiaomi-15-ultra-512gb',
    'Xiaomi 15 Ultra 512GB',
    'xiaomi:15-ultra:512gb'
  );
  const ipad128 = makeCandidate(
    'apple-ipad-air-128gb',
    'Apple iPad Air 128GB',
    'apple:ipad-air:128gb',
    'tablets'
  );
  const ipad256 = makeCandidate(
    'apple-ipad-air-256gb',
    'Apple iPad Air 256GB',
    'apple:ipad-air:256gb',
    'tablets'
  );
  const galaxyTab = makeCandidate(
    'samsung-galaxy-tab-s10-256gb',
    'Samsung Galaxy Tab S10 256GB',
    'samsung:galaxy-tab-s10:256gb',
    'tablets'
  );
  const rawCandidates1820 = [
    ip16v128,
    ip16v256,
    s24v256,
    xm15v512,
    ipad128,
    ipad256,
    galaxyTab,
  ];
  const ssrSlugMap1820 = {
    'apple-iphone-16-128gb': 'Apple-iPhone-16',
    'apple-iphone-16-256gb': 'Apple-iPhone-16',
    'samsung-galaxy-s24-256gb': 'samsung-galaxy-s24',
    'xiaomi-15-ultra-512gb': 'xiaomi-15-ultra',
    'apple-ipad-air-128gb': 'apple-ipad-air',
    'apple-ipad-air-256gb': 'apple-ipad-air',
    'samsung-galaxy-tab-s10-256gb': 'samsung-galaxy-tab-s10',
  };
  const mergedSlugMap1820 = buildCompareVersusSlugMap(
    [...rawCandidates1820, ip16v512Remote],
    ssrSlugMap1820
  );

  // Category tab switches deduplicate per Item when RATE_ITEM_MODEL is active,
  // and keep legacy variant behavior when versusSlugMap is undefined.
  assert.deepEqual(
    pickCompareCategoryDefaults(
      rawCandidates1820,
      'tablets',
      mergedSlugMap1820,
      3
    ).map((p) => p.slug),
    ['apple-ipad-air-128gb', 'samsung-galaxy-tab-s10-256gb']
  );
  assert.deepEqual(
    pickCompareCategoryDefaults(rawCandidates1820, 'tablets', undefined, 3).map(
      (p) => p.slug
    ),
    [
      'apple-ipad-air-128gb',
      'apple-ipad-air-256gb',
      'samsung-galaxy-tab-s10-256gb',
    ]
  );

  // Candidate filtering collapses duplicate variants across local + remote
  // results per Item (including propagated remote model_key siblings).
  assert.deepEqual(
    buildCompareAutocompleteSuggestions(
      rawCandidates1820,
      null,
      'smartphones',
      '',
      mergedSlugMap1820
    ).map((p) => p.slug),
    [
      'apple-iphone-16-128gb',
      'samsung-galaxy-s24-256gb',
      'xiaomi-15-ultra-512gb',
    ]
  );
  assert.deepEqual(
    buildCompareAutocompleteSuggestions(
      rawCandidates1820,
      [ip16v512Remote, ip16v256],
      'smartphones',
      'iphone 16',
      mergedSlugMap1820
    ).map((p) => p.slug),
    ['apple-iphone-16-128gb']
  );

  // Candidate selection blocks picking a sibling storage variant of an
  // already-compared Item in both Add and Replace modes.
  assert.equal(
    isCompareCandidateSelected(
      [ip16v256, s24v256],
      'apple-iphone-16-128gb',
      mergedSlugMap1820
    ),
    true
  );
  assert.equal(
    isCompareCandidateSelected(
      [ip16v256, s24v256],
      'apple-iphone-16-512gb',
      mergedSlugMap1820
    ),
    true
  );
  assert.equal(
    isCompareCandidateSelected(
      [ip16v256, s24v256],
      'xiaomi-15-ultra-512gb',
      mergedSlugMap1820
    ),
    false
  );
  assert.equal(
    applyCompareCandidateSelection(
      [ip16v256, s24v256],
      ip16v128,
      'smartphones',
      null,
      mergedSlugMap1820
    ),
    null,
    'Add mode refuses sibling variant of already-compared Item'
  );
  assert.equal(
    applyCompareCandidateSelection(
      [ip16v256, s24v256],
      ip16v128,
      'smartphones',
      1,
      mergedSlugMap1820
    ),
    null,
    'Replace mode on slot 1 refuses sibling variant of slot 0 Item'
  );
  assert.equal(
    applyCompareCandidateSelection(
      [ip16v256, s24v256],
      ip16v128,
      'smartphones',
      0,
      mergedSlugMap1820
    ),
    null,
    'Replace mode on slot 0 refuses sibling variant of slot 0 Item'
  );
  assert.deepEqual(
    applyCompareCandidateSelection(
      [ip16v256, s24v256],
      xm15v512,
      'smartphones',
      1,
      mergedSlugMap1820
    )?.nextProducts.map((p) => p.slug),
    ['apple-iphone-16-256gb', 'xiaomi-15-ultra-512gb']
  );
  assert.deepEqual(
    applyCompareCandidateSelection(
      [ip16v256, s24v256],
      xm15v512,
      'smartphones',
      null,
      mergedSlugMap1820
    )?.nextProducts.map((p) => p.slug),
    [
      'apple-iphone-16-256gb',
      'samsung-galaxy-s24-256gb',
      'xiaomi-15-ultra-512gb',
    ]
  );
  assert.deepEqual(
    dedupeCompareProductsByItem(
      [ip16v128, ip16v256, s24v256],
      mergedSlugMap1820
    ).map((p) => p.slug),
    ['apple-iphone-16-128gb', 'samsung-galaxy-s24-256gb']
  );

  // Combobox ARIA & focusout dismissal contracts (#1820).
  assert.deepEqual(
    resolveCompareAutocompleteA11y({
      dropdownOpen: false,
      productCount: 2,
      activeReplaceIndex: null,
    }),
    {
      role: 'combobox',
      ariaAutocomplete: 'list',
      ariaExpanded: false,
      ariaControls: COMPARE_AUTOCOMPLETE_LIST_ID,
      disabled: false,
    }
  );
  assert.deepEqual(
    resolveCompareAutocompleteA11y({
      dropdownOpen: true,
      productCount: 2,
      activeReplaceIndex: null,
    }),
    {
      role: 'combobox',
      ariaAutocomplete: 'list',
      ariaExpanded: true,
      ariaControls: COMPARE_AUTOCOMPLETE_LIST_ID,
      disabled: false,
    }
  );
  assert.deepEqual(
    resolveCompareAutocompleteA11y({
      dropdownOpen: true,
      productCount: 4,
      activeReplaceIndex: null,
    }),
    {
      role: 'combobox',
      ariaAutocomplete: 'list',
      ariaExpanded: false,
      ariaControls: COMPARE_AUTOCOMPLETE_LIST_ID,
      disabled: true,
    },
    'At max capacity without replace mode, aria-expanded stays false because listbox is not rendered'
  );
  assert.deepEqual(
    resolveCompareAutocompleteA11y({
      dropdownOpen: true,
      productCount: 4,
      activeReplaceIndex: 2,
    }),
    {
      role: 'combobox',
      ariaAutocomplete: 'list',
      ariaExpanded: true,
      ariaControls: COMPARE_AUTOCOMPLETE_LIST_ID,
      disabled: false,
    }
  );

  assert.equal(shouldDismissCompareOnFocusOut(null, false), false);
  assert.equal(
    shouldDismissCompareOnFocusOut({ closest: () => null }, true),
    false
  );
  assert.equal(
    shouldDismissCompareOnFocusOut(
      {
        closest: (sel) =>
          sel === '[data-compare-slot-trigger]' ? { tagName: 'BUTTON' } : null,
      },
      false
    ),
    false
  );
  assert.equal(
    shouldDismissCompareOnFocusOut({ closest: () => null }, false),
    true
  );

  // SSR render check: tokenless CompareWorkspace deduplicates initialProducts,
  // Quick Preset Chips skip sibling variants of compared Items, category counts
  // reflect unique Items, and #compare-autocomplete-input exposes combobox ARIA.
  const stubRouter1820 = {
    bfcacheId: '',
    back: () => {},
    forward: () => {},
    refresh: () => {},
    push: () => {},
    replace: () => {},
    prefetch: () => {},
  };
  const Provider1820 = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: Record<string, unknown>;
    timeZone: string;
    children?: React.ReactNode;
  }>;
  const workspaceHtml1820 = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: stubRouter1820 },
      React.createElement(
        Provider1820,
        {
          locale: 'en',
          messages: pickClientMessages(
            enMessages as unknown as Record<string, unknown>,
            'compare'
          ),
          timeZone: 'Asia/Ho_Chi_Minh',
        },
        React.createElement(CompareWorkspace, {
          initialProducts: [ip16v256, ip16v128, s24v256],
          catalogCandidates: rawCandidates1820,
          initialCategory: 'smartphones',
          hasExplicitSlugs: false,
          locale: 'en',
          itemSlugBySlug: ssrSlugMap1820,
        })
      )
    )
  );
  const inputTagMatch = workspaceHtml1820.match(
    /<input\b[^>]*id="compare-autocomplete-input"[^>]*>/
  );
  assert.ok(inputTagMatch, '#compare-autocomplete-input must render');
  assert.match(inputTagMatch[0], /\brole="combobox"/);
  assert.match(inputTagMatch[0], /\baria-autocomplete="list"/);
  assert.match(inputTagMatch[0], /\baria-expanded="false"/);
  assert.match(
    inputTagMatch[0],
    new RegExp(`\\baria-controls="${COMPARE_AUTOCOMPLETE_LIST_ID}"`)
  );
  assert.ok(
    !workspaceHtml1820.includes('+ Apple iPhone 16 128GB'),
    'Quick Preset Chips must not offer a sibling variant of an already-compared Item'
  );
  assert.ok(
    workspaceHtml1820.includes('+ Xiaomi 15 Ultra 512GB'),
    'Quick Preset Chips still offer distinct uncompared Items'
  );
  assert.match(
    workspaceHtml1820,
    /Smartphones\s*<span class="rate-tabular">\(3\)<\/span>/,
    'Category tab count reflects 3 unique smartphone Items rather than 4 variants'
  );
  assert.match(
    workspaceHtml1820,
    /Tablets\s*<span class="rate-tabular">\(2\)<\/span>/,
    'Category tab count reflects 2 unique tablet Items rather than 3 variants'
  );

  const compareWorkspaceSrc1820 = readFileSync(
    new URL('../../components/compare/CompareWorkspace.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    compareWorkspaceSrc1820,
    /addEventListener\('focusout',\s*handleFocusOut\)/,
    'CompareWorkspace wires focusout dismissal on searchBoxRef'
  );
  assert.match(
    compareWorkspaceSrc1820,
    /e\.key === 'Escape'/,
    'CompareWorkspace wires Escape dismissal on #compare-autocomplete-input'
  );
  assert.match(
    compareWorkspaceSrc1820,
    /e\.key === 'ArrowDown'/,
    'CompareWorkspace wires ArrowDown to reopen a closed combobox'
  );
  assert.match(
    compareWorkspaceSrc1820,
    /suppressNextInputFocusOpenRef/,
    'CompareWorkspace suppresses focus-open when returning keyboard focus to input after Escape/selection'
  );
  assert.match(
    compareWorkspaceSrc1820,
    /id=\{COMPARE_AUTOCOMPLETE_LIST_ID\}[\s\S]*?role="listbox"[\s\S]*?aria-labelledby=\{COMPARE_AUTOCOMPLETE_HEADING_ID\}/,
    'CompareWorkspace popup exposes WAI-ARIA 1.2 role="listbox" named by COMPARE_AUTOCOMPLETE_HEADING_ID'
  );
  assert.equal(COMPARE_AUTOCOMPLETE_HEADING_ID, 'compare-autocomplete-heading');
  assert.match(
    compareWorkspaceSrc1820,
    /role="option"\s*aria-selected=\{alreadySelected\}/,
    'CompareWorkspace suggestion buttons expose role="option" and aria-selected'
  );

  // Unlinked siblings (slug -> slug in itemSlugBySlug) stay distinct and
  // selectable alongside linked variants of the same brand:model: prefix (#1820).
  const ip16Unlinked = makeCandidate(
    'apple-iphone-16-unlinked-import',
    'Apple iPhone 16 Unlinked Import',
    'apple:iphone-16:unlinked'
  );
  const unlinkedSlugMap1820 = buildCompareVersusSlugMap(
    [ip16v128, ip16v256, ip16Unlinked, s24v256],
    {
      ...ssrSlugMap1820,
      'apple-iphone-16-unlinked-import': 'apple-iphone-16-unlinked-import',
    }
  );
  assert.deepEqual(
    pickCompareCategoryDefaults(
      [ip16v128, ip16v256, ip16Unlinked, s24v256],
      'smartphones',
      unlinkedSlugMap1820,
      3
    ).map((p) => p.slug),
    [
      'apple-iphone-16-128gb',
      'apple-iphone-16-unlinked-import',
      'samsung-galaxy-s24-256gb',
    ]
  );
  assert.deepEqual(
    buildCompareAutocompleteSuggestions(
      [ip16v128, ip16v256, ip16Unlinked],
      null,
      'smartphones',
      'iphone 16',
      unlinkedSlugMap1820
    ).map((p) => p.slug),
    ['apple-iphone-16-128gb', 'apple-iphone-16-unlinked-import']
  );
  assert.equal(
    isCompareCandidateSelected(
      [ip16v128],
      'apple-iphone-16-unlinked-import',
      unlinkedSlugMap1820
    ),
    false
  );
  assert.deepEqual(
    applyCompareCandidateSelection(
      [ip16v128],
      ip16Unlinked,
      'smartphones',
      null,
      unlinkedSlugMap1820
    )?.nextProducts.map((p) => p.slug),
    ['apple-iphone-16-128gb', 'apple-iphone-16-unlinked-import']
  );

  // Tray restoration on tokenless /compare preserves non-cheapest saved variants
  // whose Item collapsed in catalogCandidates, while deduplicating legacy
  // same-Item tray pairs (#1820).
  const collapsedCandidates1820 = [ip16v128, s24v256, xm15v512];
  const restoredNonCheapest = resolveCompareTrayRestore(
    [
      {
        slug: 'apple-iphone-16-256gb',
        name: 'Apple iPhone 16 256GB',
        brand: 'Apple',
        thumbnail: null,
        min_price: 24_990_000,
        categorySlug: 'smartphones',
      },
      {
        slug: 'samsung-galaxy-s24-256gb',
        name: 'Samsung Galaxy S24 256GB',
        brand: 'Samsung',
        thumbnail: null,
        min_price: 20_000_000,
        categorySlug: 'smartphones',
      },
    ],
    collapsedCandidates1820,
    ssrSlugMap1820
  );
  assert.equal(
    restoredNonCheapest?.slugsCsv,
    'apple-iphone-16-256gb,samsung-galaxy-s24-256gb',
    'Non-cheapest saved variant restores its exact slug even when catalogCandidates collapsed to 128gb'
  );
  assert.equal(restoredNonCheapest?.products[0]?.min_price, 24_990_000);

  const restoredLegacyDupes = resolveCompareTrayRestore(
    [
      {
        slug: 'apple-iphone-16-256gb',
        name: 'Apple iPhone 16 256GB',
        brand: 'Apple',
        thumbnail: null,
        min_price: 24_990_000,
        categorySlug: 'smartphones',
      },
      {
        slug: 'apple-iphone-16-128gb',
        name: 'Apple iPhone 16 128GB',
        brand: 'Apple',
        thumbnail: null,
        min_price: 19_990_000,
        categorySlug: 'smartphones',
      },
      {
        slug: 'samsung-galaxy-s24-256gb',
        name: 'Samsung Galaxy S24 256GB',
        brand: 'Samsung',
        thumbnail: null,
        min_price: 20_000_000,
        categorySlug: 'smartphones',
      },
    ],
    collapsedCandidates1820,
    ssrSlugMap1820
  );
  assert.equal(
    restoredLegacyDupes?.slugsCsv,
    'apple-iphone-16-256gb,samsung-galaxy-s24-256gb',
    'Legacy tray holding two storage variants of one Item deduplicates to the first saved size'
  );

  // Locale passed to fitTitle and fitDescription on /compare and /compare/[versus] (#1820).
  const versusPageSrc1820 = readFileSync(
    new URL('../../app/[locale]/compare/[versus]/page.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    comparePageSrc,
    /fitDescription\(\s*t\('compareMetaDescWithNames',\s*\{\s*names\s*\}\),\s*lang\s*\)/,
    '/compare generateMetadata passes lang to fitDescription'
  );
  assert.match(
    comparePageSrc,
    /fitTitle\(\s*\[[\s\S]*?\],\s*undefined,\s*lang\s*\)/,
    '/compare generateMetadata passes lang to fitTitle'
  );
  assert.match(
    versusPageSrc1820,
    /fitTitle\(\s*\[[\s\S]*?\],\s*undefined,\s*lang\s*\)/,
    '/compare/[versus] generateMetadata passes lang to fitTitle'
  );
  assert.match(
    versusPageSrc1820,
    /fitDescription\(\s*t\('versusMetaDescription',\s*\{[\s\S]*?\}\),\s*lang\s*\)/,
    '/compare/[versus] generateMetadata passes lang to fitDescription'
  );

  const tCompareCs = createTranslator({
    locale: 'cs',
    messages: csMessages,
    namespace: 'compare',
  });
  const nbspNameA = 'iPhone\u00A016';
  const nbspNameB = 'Pixel\u00A09';
  const csNames = `${nbspNameA} vs ${nbspNameB}`;
  const csCompareTitle = fitTitle(
    [
      tCompareCs('compareMetaTitleWithNames', { names: csNames }),
      tCompareCs('compareMetaTitleWithNamesShort', { names: csNames }),
      csNames,
    ],
    undefined,
    'cs'
  );
  const viCollapsedCompareTitle = fitTitle(
    [
      tCompareCs('compareMetaTitleWithNames', { names: csNames }),
      tCompareCs('compareMetaTitleWithNamesShort', { names: csNames }),
      csNames,
    ],
    undefined,
    'vi'
  );
  const csCompareDesc = fitDescription(
    tCompareCs('compareMetaDescWithNames', { names: csNames }),
    'cs'
  );
  const enCollapsedCompareDesc = fitDescription(
    tCompareCs('compareMetaDescWithNames', { names: csNames }),
    'en'
  );
  assert.ok(
    csCompareTitle.includes('\u00A0'),
    'Czech /compare title preserves U+00A0 non-breaking spaces'
  );
  assert.ok(
    !viCollapsedCompareTitle.includes('\u00A0'),
    'Non-Czech /compare title collapses U+00A0 to ASCII spaces'
  );
  assert.ok(
    csCompareDesc.includes('\u00A0'),
    'Czech /compare description preserves U+00A0 non-breaking spaces'
  );
  assert.ok(
    !enCollapsedCompareDesc.includes('\u00A0'),
    'Non-Czech /compare description collapses U+00A0 to ASCII spaces'
  );
  const csVersusTitle = fitTitle(
    [
      tCompareCs('versusMetaTitle', { nameA: nbspNameA, nameB: nbspNameB }),
      tCompareCs('versusMetaTitleShort', {
        nameA: nbspNameA,
        nameB: nbspNameB,
      }),
      `${nbspNameA} vs ${nbspNameB}`,
    ],
    undefined,
    'cs'
  );
  const csVersusDesc = fitDescription(
    tCompareCs('versusMetaDescription', {
      nameA: nbspNameA,
      nameB: nbspNameB,
    }),
    'cs'
  );
  assert.ok(
    csVersusTitle.includes('\u00A0'),
    'Czech /compare/[versus] title preserves U+00A0 non-breaking spaces'
  );
  assert.ok(
    csVersusDesc.includes('\u00A0'),
    'Czech /compare/[versus] description preserves U+00A0 non-breaking spaces'
  );

  // Guard decodeURIComponent in parseVersusSlugs against malformed % sequences (#1820).
  for (const malformedVersus of [
    'a%-vs-b',
    'a-vs-b%',
    '100%-vs-b',
    '%E0%A4%A-vs-b',
    'a%ZZ-vs-b',
    '%',
  ]) {
    assert.equal(
      parseVersusSlugs(malformedVersus),
      null,
      `parseVersusSlugs(${JSON.stringify(malformedVersus)}) must return null instead of throwing URIError`
    );
    assert.equal(
      parseVersusSlugs(malformedVersus, true),
      null,
      `parseVersusSlugs(${JSON.stringify(malformedVersus)}, true) must return null instead of throwing URIError`
    );
  }
  assert.equal(parseVersusSlugs(undefined as unknown as string), null);
  assert.deepEqual(parseVersusSlugs('Apple%2DiPhone-16-vs-pixel-10', true), [
    'Apple-iPhone-16',
    'pixel-10',
  ]);
  assert.match(
    versusPageSrc1820,
    /const parsed = parseVersusSlugs\(versus\);\s*if \(!parsed\) \{\s*return notFoundMeta\(\);\s*\}/,
    'generateMetadata returns 404 metadata when parseVersusSlugs rejects malformed versus'
  );
  assert.match(
    versusPageSrc1820,
    /setRequestLocale\(locale\);\s*const parsed = parseVersusSlugs\(versus\);\s*if \(!parsed\) \{\s*notFound\(\);\s*\}/,
    'VersusComparePage sets locale then calls notFound() when parseVersusSlugs rejects malformed versus'
  );

  console.warn('  ✅ item compare suite passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
