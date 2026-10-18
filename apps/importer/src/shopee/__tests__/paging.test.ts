import assert from 'node:assert/strict';
import { fetchAllPages } from '../paging.js';

// A fake query over `total` rows that, like PostgREST, never returns more than
// `maxRows` per response whatever range is asked for.
function fakeTable(total: number, maxRows: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const calls: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + maxRows);
    return Promise.resolve({ data: rows.slice(from, end), error: null });
  };
  return { page, calls };
}

async function run() {
  console.log('🧪 fetchAllPages suite');

  const big = fakeTable(2500, 1000);
  const all = await fetchAllPages('rows', big.page);
  assert.equal(all.length, 2500, 'reads every row past the 1000-row cap');
  assert.deepEqual(all.at(-1), { id: 2500 });
  assert.equal(big.calls.length, 4, '3 full or partial pages, then the empty page');

  // max-rows lowered below the page size: still complete, just more requests.
  const lowered = fakeTable(1200, 500);
  assert.equal((await fetchAllPages('rows', lowered.page)).length, 1200);

  assert.deepEqual(await fetchAllPages('rows', fakeTable(0, 1000).page), []);

  await assert.rejects(
    fetchAllPages('Failed to read', () =>
      Promise.resolve({ data: null, error: { message: 'boom' } })
    ),
    /Failed to read: boom/
  );

  console.log('✅ fetchAllPages suite passed');
}

run().catch(err => {
  console.error('❌ fetchAllPages suite failed:', err);
  process.exit(1);
});
