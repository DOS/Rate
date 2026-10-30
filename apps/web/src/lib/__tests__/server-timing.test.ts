import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

// Server-Timing breakdown for the products API (DOS/Rate#1353).
async function main() {
  // Without the AsyncLocalStorage Next.js puts on globalThis (a browser
  // bundle), timing is off: no header, and steps are plain awaits.
  const timing = await import('../server-timing');
  const off = timing;
  assert.deepEqual(
    await off.collectServerTiming(async () =>
      off.timeStep('rpc', async () => 3)
    ),
    { result: 3, header: '' }
  );

  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage =
    AsyncLocalStorage;
  const { collectServerTiming, formatServerTiming, timeStep } = timing;
  // Outside a timed request, timeStep is a plain await.
  assert.equal(await timeStep('rpc', async () => 7), 7);

  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const { result, header } = await collectServerTiming(async () => {
    const [a] = await Promise.all([
      timeStep('search-rpc', async () => {
        await pause(5);
        return 'rows';
      }),
      timeStep('slug-map', async () => pause(1)),
    ]);
    // A step run twice sums.
    await timeStep('offers-view', () => pause(2));
    await timeStep('offers-view', () => pause(2));
    return a;
  });
  assert.equal(result, 'rows');
  const steps = new Map(
    header.split(', ').map((entry) => {
      const [name, dur] = entry.split(';dur=');
      return [name!, Number(dur)];
    })
  );
  assert.deepEqual([...steps.keys()].sort(), [
    'offers-view',
    'search-rpc',
    'slug-map',
    'total',
  ]);
  assert.ok(steps.get('search-rpc')! >= 4, header);
  assert.ok(steps.get('offers-view')! >= 3, header);
  assert.ok(steps.get('total')! >= steps.get('search-rpc')!, header);

  // A failing step is still timed and the error passes through.
  const failed = await collectServerTiming(async () => {
    await assert.rejects(
      timeStep('category', async () => {
        throw new Error('boom');
      }),
      /boom/
    );
    return 'caught';
  });
  assert.equal(failed.result, 'caught');
  assert.match(failed.header, /^category;dur=\d+\.\d, total;dur=/);

  // Only fixed lower-case tokens reach the header.
  assert.equal(
    formatServerTiming(
      new Map([
        ['rpc', 1.234],
        ['Bad Name', 2],
        ['x;dur=1', 3],
        ['nan', Number.NaN],
      ])
    ),
    'rpc;dur=1.2'
  );

  console.log('  ✅ Server-Timing steps for the products API (#1353)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
