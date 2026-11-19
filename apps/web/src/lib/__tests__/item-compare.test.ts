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
  const maxLenItemSlug = `A${'b'.repeat(159)}`;
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: maxLenItemSlug } } },
      'fallback-slug'
    ),
    maxLenItemSlug
  );
  assert.equal(
    itemSlugFromProductAnswer(
      { ok: true, data: { item: { slug: `${maxLenItemSlug}x` } } },
      'fallback-slug'
    ),
    'fallback-slug',
    'over-160-char Item slug falls back to requested slug'
  );
  // Rejects path-traversal / dot segments and prototype keys (#1768).
  for (const unsafeSlug of [
    '',
    '.',
    '..',
    '.Apple-iPhone-16',
    'Apple..iPhone-16',
    'Apple-iPhone-16.',
    'Apple-iPhone-16..',
    'Apple/iPhone-16',
    '../etc/passwd',
    ' Apple-iPhone-16',
    'Apple-iPhone-16 ',
    '__proto__',
    'constructor',
    'Constructor',
    'CONSTRUCTOR',
    'prototype',
    'Prototype',
    'toString',
    'toLocaleString',
    'valueOf',
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
  }
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
  // getItemSlugsFor so popular-battle and selector candidates carry exact Item
  // membership (including mixed linked/unlinked siblings) from first paint (#1768).
  const comparePageSrc = readFileSync(
    new URL('../../app/[locale]/compare/page.tsx', import.meta.url),
    'utf8'
  );
  assert.match(
    comparePageSrc,
    /getItemSlugsFor\(\s*\[\s*\.\.\.initialProducts\.map\(\(p\)\s*=>\s*p\.slug\),\s*\.\.\.catalogCandidates\.map\(\(p\)\s*=>\s*p\.slug\),?\s*\]\s*\)/,
    'apps/web/src/app/[locale]/compare/page.tsx must pass [...initialProducts.map((p) => p.slug), ...catalogCandidates.map((p) => p.slug)] into getItemSlugsFor (#1768)'
  );
  assert.ok(
    comparePageSrc.includes('{...(itemSlugBySlug ? { itemSlugBySlug } : {})}'),
    'ComparePhonesPage must forward itemSlugBySlug to CompareWorkspace'
  );

  const prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevItemModel = process.env.RATE_ITEM_MODEL;
  const prevFetch = globalThis.fetch;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.RATE_ITEM_MODEL = 'item';
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
      'popular-battle candidate pair resolves to canonical Item slugs on SSR'
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
  console.warn('  ✅ item compare suite passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
