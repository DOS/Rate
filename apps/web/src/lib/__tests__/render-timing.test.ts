import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The first render of a product page after a deploy (DOS/Rate#1344): one log
// line of per-read timings per render, and the page does not wait on the deal
// radar for its first byte.

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
    await assert.rejects(
      timing.time('offers', Promise.reject(new Error('boom'))),
      /boom/,
      'and its rejection'
    );
    timing.time('radar', late);
    timing.done();
    timing.done();
    assert.equal(lines.length, 1, 'one line per render');
    const [line] = lines;
    assert.equal(line!.scope, 'render-timing');
    assert.equal(line!.route, 'product');
    assert.equal(line!.key, 'apple-iphone-16-128gb');
    assert.equal(typeof line!.totalMs, 'number');
    const reads = line!.reads as Record<string, number>;
    assert.deepEqual(Object.keys(reads).sort(), ['offers', 'product']);
    assert.deepEqual(line!.pending, ['radar']);

    releaseLate();
    await late;
    await Promise.resolve();
    assert.equal(lines.length, 2, 'a read settling after done() logs itself');
    assert.equal(lines[1]!.read, 'radar');
    assert.equal(typeof lines[1]!.ms, 'number');
  } finally {
    console.log = original;
  }

  // The product page: the radar is not in the reads the page awaits, and
  // the peer badges that need it are streamed.
  const page = fs.readFileSync(
    path.join(__dirname, '../../app/[locale]/smartphones/[slug]/page.tsx'),
    'utf8'
  );
  const awaited = [...page.matchAll(/await Promise\.all\(\[([\s\S]*?)\]\)/g)]
    .map((m) => m[1])
    .join('\n');
  assert.doesNotMatch(
    awaited,
    /Radar/,
    'no awaited Promise.all reads the radar'
  );
  assert.match(
    page,
    /<Suspense fallback=\{null\}>\s*<PeerRadarBadge/,
    'the peer radar badge is streamed'
  );
  assert.equal(
    page.match(/getCrossPlatformDealRadar\(/g)?.length,
    1,
    'the radar is read in one place, getCategoryRadarIndex'
  );

  console.warn('  ✅ render timing and a streamed radar (#1344)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
