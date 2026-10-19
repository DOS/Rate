import assert from 'node:assert/strict';
import { forEachWithConcurrency } from '../rate-api';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

async function main() {
  console.warn('🧪 forEachWithConcurrency suite');

  // Every item runs once, never more than `limit` at a time (DOS/Rate#462).
  let inFlight = 0;
  let peak = 0;
  const seen: number[] = [];
  const items = Array.from({ length: 25 }, (_, i) => i);
  await forEachWithConcurrency(items, 6, async (item) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick();
    seen.push(item);
    inFlight -= 1;
  });
  assert.equal(peak, 6);
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    items
  );

  // Fewer items than the limit, and an empty list.
  let small = 0;
  await forEachWithConcurrency([1, 2], 6, async () => {
    small += 1;
  });
  assert.equal(small, 2);
  await forEachWithConcurrency([], 6, async () => {
    throw new Error('never called');
  });

  // The first failure rejects and stops scheduling new items.
  let started = 0;
  await assert.rejects(
    forEachWithConcurrency(items, 2, async (item) => {
      started += 1;
      await tick();
      if (item === 3) throw new Error('boom');
    }),
    /boom/
  );
  assert.ok(started < items.length, `stopped early, started ${started}`);

  console.warn('✅ forEachWithConcurrency suite passed');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
