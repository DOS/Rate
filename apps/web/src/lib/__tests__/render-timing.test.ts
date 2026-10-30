import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The first render of a product page after a deploy (DOS/Rate#1344): one log
// line of per-read timings per render, and the page does not read the
// category deal radar.

async function main() {
  const { startRenderTiming } = await import('../render-timing');

  const lines: Record<string, unknown>[] = [];
  const original = console.log;
  console.log = (line: unknown) => {
    lines.push(JSON.parse(String(line)));
  };
  try {
    let releaseLate: () => void = () => undefined;
    const late = new Promise<void>((resolve) => {
      releaseLate = resolve;
    });
    const timing = startRenderTiming('product', 'apple-iphone-16-128gb');
    const value = await timing.time('product', Promise.resolve(42));
    assert.equal(value, 42, 'a timed read returns its value');
    timing.time('radar', late);
    // The failed read writes the line; done() then adds nothing.
    await assert.rejects(
      timing.time('offers', Promise.reject(new Error('boom'))),
      /boom/,
      'and its rejection'
    );
    timing.done();
    timing.done();
    assert.equal(lines.length, 1, 'one line per render');
    const [line] = lines;
    assert.equal(line!.scope, 'render-timing');
    assert.equal(line!.route, 'product');
    assert.equal(line!.key, 'apple-iphone-16-128gb');
    assert.equal(typeof line!.totalMs, 'number');
    assert.equal(typeof line!.processUptimeMs, 'number', 'cold start shows');
    const reads = line!.reads as Record<string, number>;
    assert.deepEqual(Object.keys(reads).sort(), ['offers', 'product']);
    assert.deepEqual(line!.failed, ['offers']);
    assert.deepEqual(line!.pending, ['radar']);
    assert.deepEqual(
      Object.keys(line!).sort(),
      [
        'failed',
        'key',
        'level',
        'msg',
        'pending',
        'processUptimeMs',
        'reads',
        'route',
        'scope',
        'totalMs',
        'ts',
      ],
      'nothing else is logged'
    );

    releaseLate();
    await late;
    await Promise.resolve();
    assert.equal(lines.length, 1, 'a read settling after done() adds no line');

    // A failed read writes the line at once: the render it fails never
    // reaches done().
    lines.length = 0;
    const failing = startRenderTiming('product', 'x');
    failing.time('product', Promise.resolve(1));
    await failing
      .time('peers', Promise.reject(new Error('down')))
      .catch(() => undefined);
    await Promise.resolve();
    assert.equal(lines.length, 1, 'a failed read logs the render');
    assert.deepEqual(lines[0]!.failed, ['peers']);
    failing.done();
    assert.equal(lines.length, 1, 'and done() adds nothing after it');
  } finally {
    console.log = original;
  }

  // The product page reads no category deal radar: each competitor badge
  // comes from that product's own offers (DOS/Rate#1344).
  const page = fs.readFileSync(
    path.join(__dirname, '../../app/[locale]/smartphones/[slug]/page.tsx'),
    'utf8'
  );
  assert.doesNotMatch(page, /getCrossPlatformDealRadar|DealRadar\(/);
  assert.match(
    page,
    /relatedCompetitors\.map\(\(peer\) => getCachedMasterProductOffers\(peer\.id\)\)/
  );
  assert.match(
    page,
    /computeProductRadarSignal\(\s*peer,\s*\(competitorOffers\[i\] \?\? \[\]\)\.filter\(\(o\) => !isOfferUnavailable\(o\)\)/
  );
  // The peers read starts before the item and product reads it does not need.
  assert.ok(
    page.indexOf("'peers',") < page.indexOf("'itemPage',") &&
      page.indexOf("'peers',") > page.indexOf('notFound();'),
    'peers start after the route checks and before the item context'
  );

  console.warn(
    '  ✅ render timing and no category radar on the product page (#1344)'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
