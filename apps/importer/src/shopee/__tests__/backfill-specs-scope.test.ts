import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY,
  FLAGSHIP_DEVICES_TO_SEED,
} from '../flagship-seed-data.js';
import {
  parseBackfillSpecsArgs,
  runMasterSpecsBackfill,
  runMasterSpecsBackfillWith,
  selectOnlySeeds,
  type BackfillSpecsDeps,
} from '../jobs/backfill-specs.js';
import type { RateSupabaseClient } from '../types.js';

// The three masters of JOY's approved Production fix (DOS/Rate#1464).
const APPROVED = [
  'apple:iphone-18-pro-max:256gb',
  'apple:iphone-18-pro:256gb',
  'samsung:galaxy-s26-ultra:256gb',
];

interface Op {
  table: string;
  op: 'select' | 'update' | 'insert';
  columns?: string;
  filters: Array<[string, unknown]>;
  payload?: Record<string, unknown>;
}

/**
 * A stand-in for the rate-scoped client: records every call, answers lookups from
 * `existing` (by model_key), and the full master list from `masters`. The final audit
 * query (no key_specs column) gets no rows.
 */
function mockClient(
  existing: Record<string, Record<string, unknown>>,
  masters: Array<Record<string, unknown>> = []
) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const op: Op = { table, op: 'select', filters: [] };
      ops.push(op);
      const result = () => {
        if (op.op !== 'select') return { data: null, error: null };
        if (table === 'categories')
          return { data: [{ id: 'cat-1', slug: 'smartphones' }], error: null };
        return { data: [], error: null };
      };
      const builder = {
        select(columns: string) {
          op.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          op.filters.push([column, value]);
          return builder;
        },
        order() {
          return builder;
        },
        range(from: number) {
          const rows =
            table === 'master_products' && op.columns?.includes('key_specs') && from === 0
              ? masters
              : [];
          return Promise.resolve({ data: rows, error: null });
        },
        maybeSingle() {
          const key = op.filters.find(([c]) => c === 'model_key')?.[1];
          const row =
            table === 'master_products' && typeof key === 'string' ? existing[key] : undefined;
          return Promise.resolve({ data: row ?? null, error: null });
        },
        update(payload: Record<string, unknown>) {
          op.op = 'update';
          op.payload = payload;
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          op.op = 'insert';
          op.payload = payload;
          return builder;
        },
        then<T>(resolve: (value: ReturnType<typeof result>) => T) {
          return Promise.resolve(result()).then(resolve);
        },
      };
      return builder;
    },
  };
  const writes = () => ops.filter(o => o.op !== 'select');
  return { client: client as unknown as RateSupabaseClient, ops, writes };
}

function deps(enrichCalls: string[] = []): BackfillSpecsDeps {
  return {
    enricher: { isConfigured: () => false },
    matcher: {
      enrichMasterProductById: async (id: string) => {
        enrichCalls.push(id);
        return true;
      },
    },
  };
}

/** Every seed exists, with an old battery value. */
function allSeedsExisting(): Record<string, Record<string, unknown>> {
  const rows: Record<string, Record<string, unknown>> = {};
  FLAGSHIP_DEVICES_TO_SEED.forEach((seed, i) => {
    rows[seed.model_key] = {
      id: `id-${i}`,
      specifications: { battery: { capacity_mah: 1 } },
      key_specs: {},
      battery_mah: 1,
    };
  });
  return rows;
}

test('the approved keys all have seeds', () => {
  const picked = selectOnlySeeds(APPROVED);
  assert.deepEqual(picked.map(s => s.model_key).sort(), [...APPROVED].sort());
});

test('parseBackfillSpecsArgs reads --only and --expect', () => {
  assert.deepEqual(parseBackfillSpecsArgs([]), { apply: false, auditOnly: false });
  assert.deepEqual(parseBackfillSpecsArgs(['--apply']), { apply: true, auditOnly: false });
  assert.deepEqual(
    parseBackfillSpecsArgs([
      '--only',
      ` ${APPROVED.join(', ')},${APPROVED[0]} `,
      '--apply',
      '--expect',
      '3',
    ]),
    { apply: true, auditOnly: false, only: APPROVED, expect: 3 }
  );
  assert.throws(() => parseBackfillSpecsArgs(['--only']), /--only needs a value/);
  assert.throws(() => parseBackfillSpecsArgs(['--only', '--apply']), /--only needs a value/);
  assert.throws(() => parseBackfillSpecsArgs(['--only', ' , ']), /at least one model_key/);
  for (const bad of ['-1', '2.5', 'three', '0x3']) {
    assert.throws(() => parseBackfillSpecsArgs(['--expect', bad]), /--expect/, bad);
  }
  assert.throws(
    () => parseBackfillSpecsArgs(['--audit-only', '--only', APPROVED[0]!]),
    /--audit-only/
  );
  assert.throws(() => parseBackfillSpecsArgs(['--audit-only', '--expect', '1']), /--audit-only/);
});

test('parseBackfillSpecsArgs refuses what could turn a scoped run into a full one', () => {
  const keys = APPROVED.join(',');
  const refused: Array<[string[], RegExp]> = [
    [[`--only=${keys}`, '--apply', '--expect', '3'], /unknown argument "--only=/],
    [['--only', keys, '--apply', '--expect=3'], /unknown argument "--expect=3"/],
    [['--onyl', keys, '--apply'], /unknown argument "--onyl"/],
    [['--apply', keys], /unknown argument/],
    [['--only', APPROVED[0]!, '--only', keys, '--apply'], /--only is repeated/],
    [['--only', keys, '--expect', '3', '--expect', '1'], /--expect is repeated/],
    [['--apply', '--apply'], /--apply is repeated/],
  ];
  for (const [argv, error] of refused) {
    assert.throws(() => parseBackfillSpecsArgs(argv), error, argv.join(' '));
  }
});

test('--only plans and writes the named masters only', async () => {
  const { client, ops, writes } = mockClient(allSeedsExisting(), [
    {
      id: 'canon',
      name: 'Canonical',
      model_key: Object.keys(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY)[0],
    },
  ]);
  const enrichCalls: string[] = [];
  const result = await runMasterSpecsBackfillWith(
    client,
    { ...deps(enrichCalls), enricher: { isConfigured: () => true } },
    {
      apply: true,
      only: APPROVED,
      expect: 3,
    }
  );
  assert.equal(result.planned, 3);
  assert.equal(result.catalogUpdated, 3);
  assert.equal(result.catalogInserted, 0);
  assert.equal(result.itemsUpdated, 0);

  const lookedUp = ops
    .filter(o => o.op === 'select' && o.filters.some(([c]) => c === 'model_key'))
    .map(o => o.filters.find(([c]) => c === 'model_key')![1]);
  assert.deepEqual([...lookedUp].sort(), [...APPROVED].sort(), 'only the named masters are read');
  assert.equal(
    ops.some(o => o.table === 'items'),
    false,
    'a scoped run never touches rate.items'
  );

  const existing = allSeedsExisting();
  const expectedIds = APPROVED.map(k => existing[k]!.id);
  const w = writes();
  assert.equal(w.length, 3);
  assert.ok(w.every(o => o.table === 'master_products' && o.op === 'update'));
  assert.deepEqual(w.map(o => o.filters[0]![1]).sort(), [...expectedIds].sort());
  assert.deepEqual(enrichCalls, [], 'no AI enrichment in a scoped run');
});

test('a named key with no master row stops a scoped apply before any write', async () => {
  const existing = allSeedsExisting();
  delete existing[APPROVED[1]!];
  const live = mockClient(existing);
  await assert.rejects(
    runMasterSpecsBackfillWith(live.client, deps(), { apply: true, only: APPROVED, expect: 3 }),
    new RegExp(
      `no master row for ${APPROVED[1]!.replace(/[:.]/g, '\\$&')}: stopped before any write`
    )
  );
  assert.deepEqual(live.writes(), [], 'no insert, no update');

  // The dry run warns and shows the whole insert diff, in parts the logger keeps.
  const dry = mockClient(existing);
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    await runMasterSpecsBackfillWith(dry.client, deps(), { only: APPROVED });
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
  assert.deepEqual(dry.writes(), []);
  const text = lines.join('\n');
  assert.match(text, /an --apply would stop before any write/);
  const diffParts = lines.filter(l => l.includes('would insert'));
  assert.ok(diffParts.length >= 2, 'a long insert diff is logged in several parts');
  assert.match(diffParts[0]!, /part 1\/\d+, \d+ lines/);
});

test('an unknown --only key fails before any read or write', async () => {
  const { client, ops } = mockClient(allSeedsExisting());
  await assert.rejects(
    runMasterSpecsBackfillWith(client, deps(), {
      apply: true,
      only: [APPROVED[0]!, 'apple:iphone-99:1tb'],
      expect: 2,
    }),
    /no seed: "apple:iphone-99:1tb"/
  );
  assert.equal(ops.length, 0, 'the client is never called');
  assert.throws(() => selectOnlySeeds(['']), /no seed/);
  // The CLI entry fails the same way before it reads the environment or builds a client.
  const envKeys = [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_KEY',
  ];
  const saved = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  for (const k of envKeys) delete process.env[k];
  try {
    await assert.rejects(runMasterSpecsBackfill({ only: ['nope:nope:1gb'] }), /no seed/);
  } finally {
    for (const k of envKeys) if (saved[k] !== undefined) process.env[k] = saved[k];
  }
});

test('an --expect mismatch in --apply stops before the first write', async () => {
  for (const expect of [2, 4, 0]) {
    const { client, writes } = mockClient(allSeedsExisting());
    await assert.rejects(
      runMasterSpecsBackfillWith(client, deps(), { apply: true, only: APPROVED, expect }),
      new RegExp(
        `--expect ${expect} does not match the plan of 3 master\\(s\\).*stopped before any write`
      )
    );
    assert.deepEqual(writes(), [], `expect ${expect}: nothing written`);
  }
  // Unscoped too: the guard counts the whole plan.
  const { client, writes } = mockClient(allSeedsExisting());
  await assert.rejects(
    runMasterSpecsBackfillWith(client, deps(), { apply: true, expect: 3 }),
    /stopped before any write/
  );
  assert.deepEqual(writes(), []);
});

test('the scoped dry run writes nothing and reports the plan and the field diff', async () => {
  const { client, writes } = mockClient(allSeedsExisting());
  const lines: string[] = [];
  const original = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  let result;
  try {
    result = await runMasterSpecsBackfillWith(client, deps(), { only: APPROVED, expect: 5 });
  } finally {
    console.log = original;
    console.warn = originalWarn;
  }
  assert.equal(result.apply, false);
  assert.equal(result.planned, 3);
  assert.deepEqual(writes(), [], 'a dry run never writes, even on an --expect mismatch');
  const text = lines.join('\n');
  assert.match(text, /3 master\(s\) to update or insert/);
  assert.match(text, /not the expected 5/);
  for (const key of APPROVED) {
    assert.match(text, new RegExp(`${key.replace(/[:.]/g, '\\$&')}: would change`));
  }
  assert.match(text, /battery_mah: 1 -> \d+/, 'the diff shows the changed leaves');
});

test('without the new flags the backfill plans and writes as before', async () => {
  const seeds = FLAGSHIP_DEVICES_TO_SEED.slice(0, 2);
  const canonicalKey = Object.keys(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY).find(
    k => !FLAGSHIP_DEVICES_TO_SEED.some(s => s.model_key === k)
  )!;
  assert.ok(canonicalKey, 'a canonical key outside the seeds');
  const existing = { [seeds[0]!.model_key]: { id: 'seed-0', specifications: {}, key_specs: {} } };
  const masters = [
    { id: 'seed-0', name: 'Seed 0', model_key: seeds[0]!.model_key },
    { id: 'canon', name: 'Canonical', model_key: canonicalKey, specifications: {}, key_specs: {} },
    { id: 'other', name: 'Other', model_key: 'acme:phone:64gb' },
    { id: '', name: 'Broken', model_key: 'acme:broken:1gb' },
  ];

  const dry = mockClient(existing, masters);
  const dryResult = await runMasterSpecsBackfillWith(dry.client, { ...deps(), seeds });
  assert.deepEqual(dry.writes(), [], 'the default is a dry run');
  assert.deepEqual(
    { ...dryResult },
    {
      apply: false,
      planned: 3,
      catalogUpdated: 2,
      catalogInserted: 1,
      itemsUpdated: 0,
      skipped: 2,
      totalAudited: 0,
    }
  );

  const enrichCalls: string[] = [];
  const live = mockClient(existing, masters);
  const result = await runMasterSpecsBackfillWith(
    live.client,
    { ...deps(enrichCalls), enricher: { isConfigured: () => true }, seeds },
    { apply: true }
  );
  assert.deepEqual(
    live.writes().map(o => [o.op, o.op === 'insert' ? o.payload!.model_key : o.filters[0]![1]]),
    [
      ['update', 'seed-0'],
      ['insert', seeds[1]!.model_key],
      ['update', 'canon'],
    ],
    'every seed, then the canonical master, in order'
  );
  assert.deepEqual(enrichCalls, ['other'], 'the AI enricher gets the remaining master');
  assert.equal(result.planned, 4);
  assert.equal(result.catalogUpdated, 3);
  assert.equal(result.catalogInserted, 1);
  assert.equal(result.skipped, 1);
  const insert = live.writes().find(o => o.op === 'insert')!;
  assert.equal(insert.payload!.status, 'draft');
  assert.equal(insert.payload!.category_id, 'cat-1');
});
