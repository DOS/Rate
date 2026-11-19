/**
 * DOS/Rate#1756: the scoped publish job flips only the named seed drafts that carry their
 * seed's licensed image and full specs, checks --expect before its first write, and writes
 * with a status guard. All database access here is a stand-in.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { IPHONE_17E_IMAGE, SOURCED_SEEDS_IPHONE_17E } from '../flagship-seed-sourced-iphone-17e.js';
import { seedMasterSpecUpdate } from '../jobs/backfill-specs.js';
import {
  parsePublishMastersArgs,
  publishBlockers,
  publishSeedMastersWith,
} from '../jobs/publish-masters.js';
import type { RateSupabaseClient } from '../types.js';

const KEYS = ['apple:iphone-17e:256gb', 'apple:iphone-17e:512gb'] as const;
const seeds = KEYS.map(k => SOURCED_SEEDS_IPHONE_17E.find(s => s.model_key === k)!);

/** A 17e master as the scoped backfill apply leaves it: a draft with the seed's image. */
function draftRow(i: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const seed = seeds[i]!;
  return {
    id: `id-${i}`,
    model_key: seed.model_key,
    slug: seed.slug,
    status: 'draft',
    category_id: 'cat-1',
    images: [...seed.images],
    thumbnail: seed.images[0],
    specifications: seedMasterSpecUpdate(null, seed).specifications,
    ...overrides,
  };
}

/**
 * A stand-in for the rate-scoped client over `master_products`: `select ... eq(model_key)
 * .maybeSingle()` reads and `update(...).eq('id').eq('status').select('id')` writes.
 */
function tableClient(rows: Array<Record<string, unknown>>, onWrite?: () => void) {
  const writes: Array<{ id: unknown; status: unknown; payload: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let payload: Record<string, unknown> | undefined;
      const matching = () => rows.filter(r => filters.every(([c, v]) => r[c] === v));
      const builder = {
        select() {
          if (!payload) return builder;
          onWrite?.();
          const hit = matching();
          for (const row of hit) Object.assign(row, structuredClone(payload));
          writes.push({
            id: filters.find(([c]) => c === 'id')?.[1],
            status: filters.find(([c]) => c === 'status')?.[1],
            payload,
          });
          return Promise.resolve({ data: hit.map(r => ({ id: r.id })), error: null });
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        update(p: Record<string, unknown>) {
          payload = p;
          return builder;
        },
        maybeSingle() {
          if (table === 'categories') {
            const slug = filters.find(([c]) => c === 'slug')?.[1];
            return Promise.resolve({
              data: slug === 'smartphones' ? { id: 'cat-1' } : null,
              error: null,
            });
          }
          assert.equal(table, 'master_products');
          const hit = matching();
          return Promise.resolve({ data: hit[0] ? structuredClone(hit[0]) : null, error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as RateSupabaseClient, writes };
}

test('the 17e seeds carry the licensed photo, and the web app serves and credits it', () => {
  assert.equal(IPHONE_17E_IMAGE, '/img/devices/apple-iphone-17e.jpg');
  for (const seed of seeds) assert.deepEqual(seed.images, [IPHONE_17E_IMAGE]);
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../web');
  assert.ok(existsSync(join(webRoot, 'public', IPHONE_17E_IMAGE)), 'photo is in apps/web/public');
  const credits = readFileSync(join(webRoot, 'src/lib/device-images.ts'), 'utf8');
  assert.match(credits, /'apple-iphone-17e': \{/, 'photo has a licence notice');
});

test('parsePublishMastersArgs is strict', () => {
  assert.deepEqual(parsePublishMastersArgs(['--only', `${KEYS[0]},${KEYS[1]}`]), {
    only: [...KEYS],
    apply: false,
  });
  assert.deepEqual(
    parsePublishMastersArgs(['--only', ` ${KEYS[0]} ,${KEYS[0]}`, '--apply', '--expect', '1']),
    { only: [KEYS[0]], apply: true, expect: 1 }
  );
  assert.throws(() => parsePublishMastersArgs([]), /--only is required/);
  assert.throws(() => parsePublishMastersArgs(['--only', ',']), /at least one/);
  assert.throws(
    () => parsePublishMastersArgs(['--only', KEYS[0], '--apply']),
    /--apply needs --expect/
  );
  assert.throws(() => parsePublishMastersArgs(['--only=x']), /unknown argument/);
  assert.throws(() => parsePublishMastersArgs(['--only', KEYS[0], '--only', KEYS[1]]), /repeated/);
  assert.throws(() => parsePublishMastersArgs(['--only', '--apply']), /needs a value/);
  assert.throws(
    () => parsePublishMastersArgs(['--only', KEYS[0], '--expect', '2x']),
    /whole number/
  );
  assert.throws(
    () => parsePublishMastersArgs(['--only', KEYS[0], '--publish']),
    /unknown argument/
  );
});

test('a dry run plans the two 17e drafts and writes nothing', async () => {
  const rows = [draftRow(0), draftRow(1)];
  const { client, writes } = tableClient(rows);
  const result = await publishSeedMastersWith(client, { only: [...KEYS], expect: 2 });
  assert.deepEqual(result, { planned: [...KEYS], alreadyPublished: [], published: 0 });
  assert.deepEqual(writes, []);
  assert.ok(rows.every(r => r.status === 'draft'));
});

test('an apply publishes exactly the named drafts with a status guard', async () => {
  const other: Record<string, unknown> = {
    ...draftRow(0),
    id: 'other',
    model_key: 'apple:iphone-16e:128gb',
    slug: 'x',
  };
  const rows = [draftRow(0), draftRow(1), other];
  const { client, writes } = tableClient(rows);
  const result = await publishSeedMastersWith(client, { only: [...KEYS], apply: true, expect: 2 });
  assert.equal(result.published, 2);
  assert.deepEqual(
    writes.map(w => [w.id, w.status, Object.keys(w.payload).sort()]),
    [
      ['id-0', 'draft', ['status', 'updated_at']],
      ['id-1', 'draft', ['status', 'updated_at']],
    ]
  );
  assert.equal(rows[0]!.status, 'published');
  assert.equal(rows[1]!.status, 'published');
  assert.equal(other.status, 'draft', 'an unnamed draft is untouched');
});

test('a re-run leaves published masters alone and needs --expect 0', async () => {
  const rows = [draftRow(0, { status: 'published' }), draftRow(1)];
  const { client, writes } = tableClient(rows);
  await assert.rejects(
    publishSeedMastersWith(client, { only: [...KEYS], apply: true, expect: 2 }),
    /does not match the plan \(1 draft/
  );
  assert.deepEqual(writes, []);
  const result = await publishSeedMastersWith(client, { only: [...KEYS], apply: true, expect: 1 });
  assert.deepEqual(result, { planned: [KEYS[1]], alreadyPublished: [KEYS[0]], published: 1 });
});

test('a draft without the seed image, specs or category stops the run before any write', async () => {
  const cases: Array<[Record<string, unknown>, RegExp]> = [
    [{ images: [], thumbnail: null }, /run the scoped backfill-specs apply first/],
    [
      { images: ['https://cdn.example/x.jpg'], thumbnail: 'https://cdn.example/x.jpg' },
      /not the seed's/,
    ],
    [{ thumbnail: null }, /thumbnail null/],
    [{ category_id: null }, /no category/],
    [{ category_id: 'cat-tablets' }, /category "cat-tablets" is not "smartphones" \(cat-1\)/],
    [{ slug: 'apple-iphone-17e-256gb-1a2b3c4d' }, /is not the seed's/],
    [{ specifications: {} }, /missing specification group "availability"/],
    [{ status: 'archived' }, /status "archived" is not draft/],
  ];
  for (const [overrides, message] of cases) {
    const rows = [draftRow(0), draftRow(1, overrides)];
    const { client, writes } = tableClient(rows);
    await assert.rejects(
      publishSeedMastersWith(client, { only: [...KEYS], apply: true, expect: 2 }),
      message
    );
    assert.deepEqual(writes, [], `nothing written for ${JSON.stringify(overrides)}`);
    assert.equal(rows[0]!.status, 'draft');
  }
  const { client } = tableClient([draftRow(0)]);
  await assert.rejects(
    publishSeedMastersWith(client, { only: [...KEYS] }),
    /apple:iphone-17e:512gb: no master row/
  );
});

test('a seed with no images is never published', () => {
  const seed = { ...seeds[0]!, images: [] };
  assert.deepEqual(
    publishBlockers(draftRow(0, { images: [], thumbnail: null }) as never, seed, 'cat-1').filter(
      p => p.includes('image')
    ),
    ['the seed has no images']
  );
});

test('unknown keys and a missing --expect on apply fail before any read', async () => {
  let reads = 0;
  const client = {
    from() {
      reads++;
      throw new Error('no read expected');
    },
  } as unknown as RateSupabaseClient;
  await assert.rejects(
    publishSeedMastersWith(client, { only: ['apple:iphone-99:1tb'] }),
    /no seed/
  );
  await assert.rejects(
    publishSeedMastersWith(client, { only: [...KEYS], apply: true }),
    /apply needs expect/
  );
  assert.equal(reads, 0);
});

test('a status change between plan and write stops the run', async () => {
  const rows = [draftRow(0), draftRow(1)];
  let n = 0;
  const { client } = tableClient(rows, () => {
    // Someone archives the second master after the plan read it as a draft.
    if (++n === 2) rows[1]!.status = 'archived';
  });
  await assert.rejects(
    publishSeedMastersWith(client, { only: [...KEYS], apply: true, expect: 2 }),
    /touched 0 rows, not 1: its status, slug or thumbnail changed after the plan \(1 published before it\)/
  );
  assert.equal(rows[0]!.status, 'published');
  assert.equal(rows[1]!.status, 'archived');
});

test('a dry run with a mismatched --expect fails without writing', async () => {
  const rows = [draftRow(0), draftRow(1)];
  const { client, writes } = tableClient(rows);
  await assert.rejects(
    publishSeedMastersWith(client, { only: [...KEYS], expect: 1 }),
    /--expect 1 does not match the plan \(2 draft/
  );
  assert.deepEqual(writes, []);
});

test("an apply writes only while slug and thumbnail are still the seed's", async () => {
  const rows = [draftRow(0), draftRow(1)];
  let n = 0;
  const { client } = tableClient(rows, () => {
    // The image is replaced after the plan read it.
    if (++n === 1) rows[0]!.thumbnail = 'https://cdn.example/other.jpg';
  });
  await assert.rejects(
    publishSeedMastersWith(client, { only: [...KEYS], apply: true, expect: 2 }),
    /Publishing apple:iphone-17e:256gb touched 0 rows/
  );
  assert.equal(rows[0]!.status, 'draft');
  assert.equal(rows[1]!.status, 'draft');
});
