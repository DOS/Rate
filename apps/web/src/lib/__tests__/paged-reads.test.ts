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

  console.warn('  ✅ Paged reads stop at the exact count (#1344)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
