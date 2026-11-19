import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { resetRateClientForTests } from '@/lib/rate-api';
import {
  getComparePageSelection,
  getRequestedComparison,
} from '../compare-selection';

function master(
  slug: string,
  model_key: string,
  status = 'published',
  category = 'smartphones'
) {
  return {
    id: slug,
    slug,
    name: slug,
    model_key,
    status,
    metadata: { category_slug: category },
  };
}

// Deliberately out of URL order. Published siblings need not share a slug prefix.
const longAlias = 'a'.repeat(118);
const catalogue = [
  master('last', 'brand:last:standard'),
  master('acme-128gb', 'brand:acme:128gb'),
  master('other-retail-1tb', 'brand:mixed:1024gb'),
  master('peer-128gb', 'brand:peer:128gb'),
  master('peer-512gb', 'brand:peer:512gb', 'draft'),
  master('peer-pro-256gb', 'brand:peer-pro:256gb'),
  master('acme-256gb', 'brand:acme:256gb'),
  master('mixed-128gb', 'brand:mixed:128gb'),
  master('pad-1tb', 'brand:pad:1024gb', 'published', 'tablets'),
  master('tab', 'brand:tab:standard', 'published', 'tablets'),
  master('first', 'brand:first:standard'),
  master('_retail-1tb', 'brand:retail:1024gb'),
  master('base', 'brand:base:256gb'),
  master('base-512gb', 'brand:base:512gb'),
  master('v2.1-unknown', 'brand:v2.1:unknown'),
  master('v2x1-standard', 'brand:v2x1:standard'),
  master('old-128gb', 'old_phone_128gb'),
  master('duo-128gb', 'brand:duo:128gb'),
  master('boxed-duo', 'brand:duo'),
  master(`${longAlias}-128gb`, 'brand:long:128gb'),
  master(`${longAlias}-1`, 'brand:different:standard'),
];

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
const requests: URL[] = [];
const acmeItem = {
  id: 'acme-item',
  slug: 'acme',
  default_variant_id: 'acme-128gb',
};
let publishedItems: (typeof acmeItem)[] | null;

beforeEach(() => {
  process.env.RATE_ITEM_MODEL = 'off';
  resetRateClientForTests();
  requests.length = 0;
  publishedItems = null;
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push(url);
    const query = url.searchParams;
    if (url.pathname.endsWith('/categories')) return Response.json([]);
    const published = catalogue
      .filter((row) => row.status === 'published')
      .map((row) =>
        publishedItems?.some((item) => item.id === acmeItem.id) &&
        row.model_key.startsWith('brand:acme:')
          ? {
              ...row,
              item_id: acmeItem.id,
              variant_key: row.model_key.split(':')[2],
            }
          : row
      );
    if (url.pathname.endsWith('/rpc/search_master_products')) {
      return Response.json(published);
    }
    if (url.pathname.endsWith('/items')) {
      if (publishedItems) {
        return Response.json(
          publishedItems.filter(
            (item) =>
              query.get('slug') === `eq.${item.slug}` ||
              query.get('id') === `eq.${item.id}`
          )
        );
      }
      return Response.json(
        { code: 'PGRST205', message: 'Item table unavailable' },
        { status: 404 }
      );
    }
    assert.equal(url.pathname, '/rest/v1/master_products');
    const slugFilter = query.get('slug') ?? '';
    if (slugFilter.startsWith('eq.')) {
      assert.equal(query.get('status'), 'in.(published,archived)');
      return Response.json(
        published.filter((row) => row.slug === slugFilter.slice(3))
      );
    }
    assert.equal(query.get('status'), 'eq.published');
    if (query.get('item_id') === 'eq.acme-item') {
      const variants = published.filter(
        (row) => 'item_id' in row && row.item_id === acmeItem.id
      );
      return Response.json(Number(query.get('offset')) > 0 ? [] : variants);
    }
    if (slugFilter.startsWith('in.(')) {
      const slugs = slugFilter.slice(4, -1).split(',');
      return Response.json(published.filter((row) => slugs.includes(row.slug)));
    }
    if (slugFilter.startsWith('match.')) {
      if (slugFilter.includes('offline')) {
        return Response.json(
          { message: 'Fixture alias read failed' },
          { status: 400 }
        );
      }
      const pattern = new RegExp(slugFilter.slice('match.'.length));
      const rows = published.filter((row) => pattern.test(row.slug));
      return Response.json(rows.slice(0, 1), {
        headers: {
          'content-range': rows.length ? `0-0/${rows.length}` : '*/0',
        },
      });
    }
    assert.ok(slugFilter.startsWith('neq.'));
    const modelFilter = query.get('model_key') ?? '';
    assert.ok(modelFilter.startsWith('match.'));
    const family = new RegExp(modelFilter.slice('match.'.length));
    return Response.json(
      published
        .filter(
          (row) =>
            row.slug !== slugFilter.slice(4) && family.test(row.model_key)
        )
        .slice(0, 1)
    );
  });
});

afterEach(() => {
  mock.restoreAll();
  resetRateClientForTests();
});

async function openSharedLink(link: string) {
  const query = new URL(link, 'https://rate.test').searchParams;
  const { products, resolvedSelection } = await getRequestedComparison(
    query.get('slugs')!.split(','),
    Object.fromEntries(query)
  );
  assert.equal(resolvedSelection, null);
  return products.map((row) => row.slug);
}

test('a cold pinned and bare link keeps the selected size and all four columns in URL order', async () => {
  const link = '/compare?slugs=first,acme@256gb,peer,last';
  const expected = ['first', 'acme-256gb', 'peer-128gb', 'last'];
  assert.deepEqual(await openSharedLink(link), expected);
  assert.ok(requests.every((url) => !url.pathname.endsWith('/items')));
  process.env.RATE_ITEM_MODEL = 'item';
  assert.deepEqual(await openSharedLink(link), expected);
  assert.ok(requests.some((url) => url.pathname.endsWith('/items')));
});

test('bare-only links recover unique masters and skip ambiguous Items without shifting their peers', async () => {
  assert.deepEqual(
    await openSharedLink('/compare?slugs=peer,acme,mixed,v2.1'),
    ['peer-128gb', 'v2.1-unknown']
  );
  assert.deepEqual(await openSharedLink('/compare?slugs=mixed,acme'), []);
  assert.deepEqual(
    await openSharedLink('/compare?slugs=base,peer,peer-128gb'),
    ['base', 'peer-128gb']
  );
});

test('a recovered first master locks the category in URL order', async () => {
  assert.deepEqual(await openSharedLink('/compare?slugs=pad,first,tab,peer'), [
    'pad-1tb',
    'tab',
  ]);
});

test('legacy model keys use the same Item family as the backfill', async () => {
  assert.deepEqual(await openSharedLink('/compare?slugs=old,duo'), [
    'old-128gb',
  ]);
});

test('a failed alias lookup or an overlong master cannot replace a column with another product', async () => {
  assert.deepEqual(
    await openSharedLink(`/compare?slugs=first,${longAlias},offline,last`),
    ['first', 'last']
  );
});

test('a working Item lookup selects the pin or default before any fallback hint', async () => {
  publishedItems = [acmeItem];
  process.env.RATE_ITEM_MODEL = 'item';
  for (const [token, expected] of [
    ['acme@256gb', 'acme-256gb'],
    ['acme', 'acme-128gb'],
  ] as const) {
    const selection = await getRequestedComparison([token], {
      [`variant.${token}`]: '_retail-1tb',
    });
    assert.deepEqual(selection.resolvedSelection, [expected]);
    assert.deepEqual(
      selection.products.map((row) => row.slug),
      [expected]
    );
  }
  assert.ok(
    requests.every((url) => !url.searchParams.get('slug')?.startsWith('match.'))
  );
});

test('an unknown explicit token keeps the matrix empty and tokenless URLs keep category defaults', async () => {
  process.env.RATE_ITEM_MODEL = 'item';
  publishedItems = [];
  const requested = await getComparePageSelection({ slugs: 'missing-phone' });
  assert.deepEqual(requested.resolvedSelection, ['missing-phone']);
  assert.equal(requested.hasExplicitSlugs, true);
  assert.deepEqual(requested.initialProducts, []);

  for (const slugs of [undefined, '', ' , , ']) {
    const defaults = await getComparePageSelection({ slugs, cat: 'tablets' });
    assert.equal(defaults.hasExplicitSlugs, false);
    assert.deepEqual(
      defaults.initialProducts.map((row) => row.slug),
      ['pad-1tb', 'tab']
    );
  }
});

test('working Item reads keep unlinked pins and Item-backed pins in URL order', async () => {
  process.env.RATE_ITEM_MODEL = 'item';
  const tokens = ['first', 'acme@256gb', 'base@512gb', 'last'];
  const expected = ['first', 'acme-256gb', 'base-512gb', 'last'];
  for (const items of [[], [acmeItem]]) {
    publishedItems = items;
    const selection = await getRequestedComparison(tokens, {});
    assert.deepEqual(selection.resolvedSelection, expected);
    assert.deepEqual(
      selection.products.map((row) => row.slug),
      expected
    );
  }
});

test('an inferred master and a renamed Item keep only the first requested size', async () => {
  process.env.RATE_ITEM_MODEL = 'item';
  publishedItems = [{ ...acmeItem, slug: 'acme-new' }];
  for (const [tokens, expected] of [
    [
      ['acme@128gb', 'last', 'acme-new@256gb'],
      ['acme-128gb', 'last'],
    ],
    [
      ['acme-new@256gb', 'last', 'acme@128gb'],
      ['acme-256gb', 'last'],
    ],
  ] as const) {
    const selection = await getRequestedComparison(tokens, {});
    assert.deepEqual(selection.resolvedSelection, expected);
    assert.deepEqual(
      selection.products.map((row) => row.slug),
      expected
    );
  }
  assert.ok(
    requests.every(
      (url) => !url.pathname.endsWith('/items') || !url.searchParams.has('id')
    )
  );
  const aliases = await getRequestedComparison(['old@128gb', 'other@256gb'], {
    'variant.old@128gb': 'acme-128gb',
    'variant.other@256gb': 'acme-256gb',
  });
  assert.deepEqual(aliases.resolvedSelection, ['acme-128gb']);
});

test('an overlong unlinked token cannot select a different master by its truncated slug', async () => {
  process.env.RATE_ITEM_MODEL = 'item';
  publishedItems = [];
  const selection = await getComparePageSelection({ slugs: `${longAlias}-1x` });
  assert.deepEqual(selection.initialProducts, []);
});

test('unlinked pins honor represented masters, keep the first size, and drop unpublished sizes', async () => {
  process.env.RATE_ITEM_MODEL = 'item';
  publishedItems = [];
  const selection = await getRequestedComparison(
    ['acme@1024gb', 'last', 'acme@128gb', 'base@256gb'],
    { 'variant.acme@1024gb': '_retail-1tb' }
  );
  assert.deepEqual(
    selection.products.map((row) => row.slug),
    ['_retail-1tb', 'last']
  );
});

test('pins and explicit hints keep their represented master even for legacy slugs', async () => {
  assert.deepEqual(
    await openSharedLink(
      '/compare?slugs=Acme@256GB,acme@128gb,peer-128gb@128gb,base@standard&variant.acme@256gb=bad,extra'
    ),
    ['acme-256gb', 'peer-128gb', 'base']
  );
  assert.deepEqual(
    await openSharedLink(
      '/compare?slugs=acme@1024gb,base@256gb,peer&variant.acme@1024gb=_retail-1tb&variant.base@256gb=base'
    ),
    ['_retail-1tb', 'base', 'peer-128gb']
  );
  assert.deepEqual(
    await openSharedLink(
      '/compare?slugs=mixed,acme&variant.mixed=other-retail-1tb&variant.acme=acme-256gb'
    ),
    ['other-retail-1tb', 'acme-256gb']
  );
  assert.deepEqual(await openSharedLink('/compare?slugs=peer@512gb,last'), [
    'last',
  ]);
});
