import assert from 'node:assert/strict';

// A paged read that asks for the exact count stops once it holds that many
// rows, without the extra request for an empty page; without a count it pages
// until an empty page, as before (DOS/Rate#1344).

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-key';

const MASTER_ID = '00000000-0000-4000-9000-000000001344';
const LISTING = {
  id: '00000000-0000-4000-a000-000000001344',
  merchant_id: '00000000-0000-4000-8000-000000001344',
  platform: 'shopee',
  title: 'Phone 1344',
  price_current: 9_000_000,
  price_original: null,
  cluster_id: MASTER_ID,
  availability: 'in_stock',
};

let sendCount = true;
const requests: { table: string; offset: number; prefer: string }[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  const table = url.pathname.replace('/rest/v1/', '');
  const headers = new Headers(init?.headers);
  const range = headers.get('range') ?? '';
  const offset = Number(
    range.split('-')[0] || url.searchParams.get('offset') || 0
  );
  const prefer = headers.get('prefer') ?? '';
  requests.push({ table, offset, prefer });
  const rows =
    table === 'v_products_with_merchant_trust' || table === 'products'
      ? offset === 0
        ? [LISTING]
        : []
      : [];
  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (sendCount && prefer.includes('count=exact')) {
    responseHeaders['Content-Range'] =
      rows.length > 0 ? `${offset}-${offset + rows.length - 1}/1` : '*/1';
  }
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: responseHeaders,
  });
}) as typeof fetch;

async function main() {
  const { getMasterProductOffers } = await import('../rate-api');

  const offers = await getMasterProductOffers(MASTER_ID);
  assert.equal(offers.length, 1);
  const viewReads = requests.filter(
    (r) => r.table === 'v_products_with_merchant_trust'
  );
  assert.equal(viewReads.length, 1, 'one request for a one-row product');
  assert.match(viewReads[0]!.prefer, /count=exact/);
  const availabilityReads = requests.filter((r) => r.table === 'products');
  assert.equal(availabilityReads.length, 1, 'availability: one request');

  // A server that sends no count: the read still ends, on an empty page.
  requests.length = 0;
  sendCount = false;
  const again = await getMasterProductOffers(MASTER_ID);
  assert.equal(again.length, 1);
  assert.equal(
    requests.filter((r) => r.table === 'v_products_with_merchant_trust').length,
    2,
    'without a count, the empty page ends the read'
  );

  const { fetchAllRows } = await import('../rate-api');
  const rowsOf = (from: number, to: number, total: number) =>
    Array.from(
      { length: Math.max(0, Math.min(to, total - 1) - from + 1) },
      (_, i) => from + i
    );

  // Several pages with a count: exactly 2000 rows take two requests, not three.
  let calls = 0;
  const twoPages = await fetchAllRows('t', async (from, to) => {
    calls += 1;
    return { data: rowsOf(from, to, 2000), error: null, count: 2000 };
  });
  assert.equal(twoPages.length, 2000);
  assert.equal(calls, 2, '2000 rows with a count: two requests');

  // A count that grows between pages keeps the read going.
  calls = 0;
  const grown = await fetchAllRows('t', async (from, to) => {
    calls += 1;
    const total = calls === 1 ? 1000 : 1500;
    return { data: rowsOf(from, to, total), error: null, count: total };
  });
  assert.equal(grown.length, 1000, 'stops at the first count it reaches');
  assert.equal(calls, 1);

  // Rows left the filter mid-read: PostgREST answers 416 past the new end,
  // which ends the read like an empty page.
  calls = 0;
  const shrunk = await fetchAllRows(
    't',
    async (from, to) => {
      calls += 1;
      if (from > 0) {
        return {
          data: null,
          error: {
            message: 'Requested range not satisfiable',
            code: 'PGRST103',
          },
          count: null,
        };
      }
      return { data: rowsOf(from, to, 1000), error: null, count: 1001 };
    },
    1000,
    false
  );
  assert.equal(shrunk.length, 1000);
  assert.equal(calls, 2);

  // The same error on the first page is a failure, not an empty list.
  await assert.rejects(
    fetchAllRows(
      't',
      async () => ({
        data: null,
        error: { message: 'Requested range not satisfiable', code: 'PGRST103' },
        count: null,
      }),
      1000,
      false
    )
  );

  // getItemVariantsBatch pages each item_id chunk with deterministic id order
  // and throwIfItemSchemaMissing('item variants') so >1000 published variants
  // in a chunk never silently truncate (DOS/Rate#1686).
  {
    const {
      getItemVariantsBatch,
      ItemModelUnavailableError,
      RateDataUnavailableError,
    } = await import('../rate-api');

    const ITEM_A = '11111111-1111-4111-8111-00000000000a';
    const ITEM_B = '11111111-1111-4111-8111-00000000000b';
    const ITEM_EMPTY = '11111111-1111-4111-8111-00000000000c';

    const makeVariantRow = (index: number, itemId: string) => {
      const hex = index.toString(16).padStart(12, '0');
      return {
        id: `22222222-2222-4222-8222-${hex}`,
        item_id: itemId,
        slug: `item-variant-${index}`,
        name: `Item Variant ${index}`,
        variant_key: `v-${String(index).padStart(4, '0')}`,
        variant_name: `Variant ${index}`,
        sort_order: index,
        storage_gb: 128,
        min_price: 10_000_000 + index,
        max_price: 11_000_000 + index,
        merchant_count: 1,
      };
    };

    // 1,205 published variants across two items in a single IN_FILTER_CHUNK_SIZE
    // (150) chunk, plus 155 item ids total to exercise multi-chunk + multi-page.
    const extraItemIds = Array.from({ length: 153 }, (_, idx) => {
      const hex = (idx + 100).toString(16).padStart(12, '0');
      return `11111111-1111-4111-8111-${hex}`;
    });
    const LAST_CHUNK_ITEM = extraItemIds.at(-1)!;

    // Shuffle insertion order so the mock proves `.order('id')` is requested.
    const allPublishedVariants = [
      ...Array.from({ length: 1200 }, (_, i) => makeVariantRow(i + 1, ITEM_A)),
      ...Array.from({ length: 5 }, (_, i) => makeVariantRow(2000 + i, ITEM_B)),
      makeVariantRow(3000, LAST_CHUNK_ITEM),
    ].reverse();

    let failMode: 'none' | 'schema_page2' | 'db_page2' = 'none';
    const variantPageRequests: {
      query: string;
      offset: number;
      limit: number;
    }[] = [];

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      );
      const q = decodeURIComponent(url.search);
      const headers = new Headers(init?.headers);
      const range = headers.get('range') ?? '';
      const rangeParts = range.split('-');
      const offset = Number(
        rangeParts[0] || url.searchParams.get('offset') || 0
      );
      const limitFromRange =
        rangeParts.length === 2 && rangeParts[1] !== ''
          ? Number(rangeParts[1]) - Number(rangeParts[0]) + 1
          : 0;
      const limit = Math.min(
        1000,
        limitFromRange || Number(url.searchParams.get('limit') || 1000)
      );

      variantPageRequests.push({ query: q, offset, limit });

      assert.equal(url.pathname, '/rest/v1/master_products');
      assert.match(q, /(?:^|[?&])status=eq\.published(?:&|$)/);
      assert.match(q, /(?:^|[?&])order=id(?:\.asc)?(?:&|$)/);

      if (offset > 0 && failMode === 'schema_page2') {
        return new Response(
          JSON.stringify({
            code: '42703',
            message: 'column master_products.sort_order does not exist',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } }
        );
      }
      if (offset > 0 && failMode === 'db_page2') {
        return new Response(
          JSON.stringify({
            code: '57014',
            message: 'canceling statement due to statement timeout',
          }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        );
      }

      const inMatch = q.match(/item_id=in\.\(([^)]+)\)/);
      const requestedIds = new Set(
        (inMatch?.[1] ?? '')
          .split(',')
          .map((s) => s.replace(/^"|"$/g, ''))
          .filter(Boolean)
      );
      const matching = allPublishedVariants
        .filter((row) => requestedIds.has(row.item_id))
        .sort((a, b) => a.id.localeCompare(b.id));
      const slice = matching.slice(offset, offset + limit);

      return new Response(JSON.stringify(slice), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-range': '0-0/*',
        },
      });
    }) as typeof fetch;

    const batch = await getItemVariantsBatch([
      ITEM_A,
      ITEM_B,
      ITEM_EMPTY,
      ...extraItemIds,
    ]);
    assert.equal(batch.get(ITEM_A)?.length, 1200);
    assert.equal(batch.get(ITEM_B)?.length, 5);
    assert.deepEqual(batch.get(ITEM_EMPTY), []);
    assert.equal(batch.get(LAST_CHUNK_ITEM)?.length, 1);
    assert.equal(
      batch.get(ITEM_A)?.[0]?.variant_key,
      'v-0001',
      'variants are sorted in variant order after paging'
    );
    assert.equal(batch.get(ITEM_A)?.at(-1)?.variant_key, 'v-1200');
    assert.ok(
      variantPageRequests.some((r) => r.offset === 1000),
      'chunk 1 paged past PostgREST 1000-row cap'
    );

    // Missing M1+M2 schema error surfaces as ItemModelUnavailableError.
    failMode = 'schema_page2';
    await assert.rejects(
      () => getItemVariantsBatch([ITEM_A, ITEM_B]),
      (err: unknown) => err instanceof ItemModelUnavailableError
    );

    // A mid-pagination DB error throws RateDataUnavailableError instead of
    // returning truncated page-1 variants.
    failMode = 'db_page2';
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      await assert.rejects(
        () => getItemVariantsBatch([ITEM_A, ITEM_B]),
        (err: unknown) => err instanceof RateDataUnavailableError
      );
    } finally {
      console.error = originalConsoleError;
    }
  }

  console.warn('  ✅ Paged reads stop at the exact count (#1344)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
