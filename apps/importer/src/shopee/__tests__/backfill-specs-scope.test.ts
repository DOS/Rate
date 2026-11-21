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
  selectOnlyScope,
  selectOnlySeeds,
  type BackfillSpecsDeps,
} from '../jobs/backfill-specs.js';
import type { ProductSpecifications } from '@repo/shared-data';
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
    (err: unknown) =>
      err instanceof Error &&
      err.message.includes(`no master row for ${APPROVED[1]!}: stopped before any write`)
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
    /no seed and no canonical entry: "apple:iphone-99:1tb"/
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
    assert.ok(text.includes(`${key}: would change`), `${key}: would change`);
  }
  assert.match(text, /battery_mah: 1 -> \d+/, 'the diff shows the changed leaves');
});

test('an unscoped backfill updates masters only and never inserts a seed (#1739)', async () => {
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
      planned: 2,
      catalogUpdated: 2,
      catalogInserted: 0,
      insertsSkipped: 1,
      itemsUpdated: 0,
      skipped: 2,
      totalAudited: 0,
    }
  );

  const enrichCalls: string[] = [];
  const live = mockClient(existing, masters);
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  let result;
  try {
    result = await runMasterSpecsBackfillWith(
      live.client,
      { ...deps(enrichCalls), enricher: { isConfigured: () => true }, seeds },
      { apply: true }
    );
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
  assert.deepEqual(
    live.writes().map(o => [o.op, o.filters[0]![1]]),
    [
      ['update', 'seed-0'],
      ['update', 'canon'],
    ],
    'the existing seed, then the canonical master, in order; no insert'
  );
  assert.equal(
    live.writes().some(o => o.op === 'insert'),
    false,
    'a seed with no master is never inserted by an unscoped --apply'
  );
  assert.deepEqual(enrichCalls, ['other'], 'the AI enricher gets the remaining master');
  assert.equal(result.planned, 3);
  assert.equal(result.catalogUpdated, 3);
  assert.equal(result.catalogInserted, 0);
  assert.equal(result.insertsSkipped, 1);
  assert.equal(result.skipped, 1);
  const warning = lines.find(l => l.includes('an unscoped run never inserts'));
  assert.ok(warning, 'the left-out seed is reported');
  assert.ok(warning.includes(seeds[1]!.model_key), 'the warning names the left-out seed');
  assert.match(warning, /--insert-missing --apply --expect/);
});

test('an unscoped --expect counts updates only, so a left-out seed cannot pass as planned', async () => {
  const seeds = FLAGSHIP_DEVICES_TO_SEED.slice(0, 2);
  const existing = { [seeds[0]!.model_key]: { id: 'seed-0', specifications: {}, key_specs: {} } };
  const live = mockClient(existing);
  await assert.rejects(
    runMasterSpecsBackfillWith(live.client, { ...deps(), seeds }, { apply: true, expect: 2 }),
    /--expect 2 does not match the plan of 1 master\(s\).*stopped before any write/
  );
  assert.deepEqual(live.writes(), []);
});

test('--expect-inserts checks the inserts apart from the updates (#1739)', async () => {
  // Two named seeds: one has a master, one does not -> 1 update + 1 insert.
  const seeds = FLAGSHIP_DEVICES_TO_SEED.slice(0, 2);
  const only = seeds.map(s => s.model_key);
  const existing = { [seeds[0]!.model_key]: { id: 'seed-0', specifications: {}, key_specs: {} } };
  const base = { apply: true, only, insertMissing: true, expect: 2 } as const;

  // Matching: writes the update and the insert.
  const ok = mockClient(existing);
  const result = await runMasterSpecsBackfillWith(
    ok.client,
    { ...deps(), seeds },
    {
      ...base,
      expectInserts: 1,
    }
  );
  assert.equal(result.catalogInserted, 1);
  assert.equal(result.catalogUpdated, 1);
  assert.deepEqual(
    ok.writes().map(o => o.op),
    ['update', 'insert']
  );

  // The total still matches (--expect 2) but the split does not: stopped before any write.
  // This is the row that appeared between the dry run and the apply (an insert planned as 2
  // turns into 2 updates), and the reverse.
  for (const expectInserts of [0, 2]) {
    const live = mockClient(existing);
    await assert.rejects(
      runMasterSpecsBackfillWith(live.client, { ...deps(), seeds }, { ...base, expectInserts }),
      new RegExp(
        `--expect-inserts ${expectInserts} does not match the plan of 1 insert\\(s\\) \\(${seeds[1]!.model_key}\\): stopped before any write`
      )
    );
    assert.deepEqual(live.writes(), [], `expectInserts ${expectInserts}: nothing written`);
  }
  const bothExist = mockClient({
    ...existing,
    [seeds[1]!.model_key]: { id: 'seed-1', specifications: {}, key_specs: {} },
  });
  await assert.rejects(
    runMasterSpecsBackfillWith(
      bothExist.client,
      { ...deps(), seeds },
      {
        ...base,
        expectInserts: 1,
      }
    ),
    /--expect-inserts 1 does not match the plan of 0 insert\(s\) \(none\)/
  );
  assert.deepEqual(bothExist.writes(), []);

  // A dry run only warns.
  const dry = mockClient(existing);
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    await runMasterSpecsBackfillWith(
      dry.client,
      { ...deps(), seeds },
      { ...base, apply: false, expectInserts: 0 }
    );
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
  assert.deepEqual(dry.writes(), []);
  assert.match(lines.join('\n'), /holds 1 insert\(s\), not the expected 0/);

  for (const bad of [-1, 1.5, Number.NaN]) {
    const { client, ops } = mockClient(existing);
    await assert.rejects(
      runMasterSpecsBackfillWith(client, { ...deps(), seeds }, { ...base, expectInserts: bad }),
      /expectInserts must be a whole number/
    );
    assert.equal(ops.length, 0, 'a bad expectInserts fails before any read');
  }
});

test('parseBackfillSpecsArgs reads --expect-inserts (#1739)', () => {
  const only = APPROVED[0]!;
  assert.deepEqual(
    parseBackfillSpecsArgs([
      '--only',
      only,
      '--insert-missing',
      '--apply',
      '--expect',
      '2',
      '--expect-inserts',
      ' 1 ',
    ]),
    {
      apply: true,
      auditOnly: false,
      only: [only],
      expect: 2,
      expectInserts: 1,
      insertMissing: true,
    }
  );
  assert.deepEqual(parseBackfillSpecsArgs(['--expect-inserts', '0']), {
    apply: false,
    auditOnly: false,
    expectInserts: 0,
  });
  for (const bad of ['-1', '2.5', 'one', '0x1']) {
    assert.throws(
      () => parseBackfillSpecsArgs(['--expect-inserts', bad]),
      /--expect-inserts takes a whole number/,
      bad
    );
  }
  assert.throws(() => parseBackfillSpecsArgs(['--expect-inserts']), /needs a value/);
  assert.throws(
    () => parseBackfillSpecsArgs(['--expect-inserts', '1', '--expect-inserts', '1']),
    /--expect-inserts is repeated/
  );
  assert.throws(() => parseBackfillSpecsArgs(['--expect-inserts=1']), /unknown argument/);
  assert.throws(
    () => parseBackfillSpecsArgs(['--audit-only', '--expect-inserts', '0']),
    /--audit-only/
  );
});

// The three published canonical masters #1803 found out of reach of a scoped run (DOS/Rate#1804).
const CANONICAL = ['apple:iphone-15:128gb', 'apple:iphone-16:128gb', 'apple:iphone-16-plus:256gb'];
// The full master list read of an unscoped run.
const FULL_LIST_COLUMNS = 'id, name, model_key, key_specs, specifications';

/** The canonical masters as Production held them before #1758: template values. */
function canonicalExisting(): Record<string, Record<string, unknown>> {
  const rows: Record<string, Record<string, unknown>> = {};
  CANONICAL.forEach((key, i) => {
    rows[key] = {
      id: `canon-${i}`,
      name: `Canonical ${i}`,
      specifications: {
        connectivity: { bluetooth: '5.3, A2DP, LE' },
        cellular: { bands_5g: 'SA/NSA/Sub6' },
      },
      key_specs: {},
      battery_mah: 1,
    };
  });
  return rows;
}

function captureLogs<T>(run: () => Promise<T>): Promise<{ result: T; text: string }> {
  const lines: string[] = [];
  const original = { log: console.log, warn: console.warn };
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  return run()
    .then(result => ({ result, text: lines.join('\n') }))
    .finally(() => {
      console.log = original.log;
      console.warn = original.warn;
    });
}

test('selectOnlyScope splits seeds from canonical keys and refuses anything else (#1804)', () => {
  assert.ok(
    CANONICAL.every(k => Object.hasOwn(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY, k)),
    'the #1803 keys are canonical entries'
  );
  const scope = selectOnlyScope([APPROVED[0]!, ...CANONICAL]);
  assert.deepEqual(
    scope.seeds.map(s => s.model_key),
    [APPROVED[0]]
  );
  assert.deepEqual(scope.canonicalKeys, CANONICAL);
  assert.throws(
    () => selectOnlyScope([CANONICAL[0]!, 'apple:iphone-99:1tb', '']),
    /2 key\(s\) with no seed and no canonical entry: "apple:iphone-99:1tb", ""/
  );
  // A key that is a seed and a canonical entry stays a seed, as in an unscoped run.
  const seed = FLAGSHIP_DEVICES_TO_SEED[0]!;
  const both = selectOnlyScope([seed.model_key], FLAGSHIP_DEVICES_TO_SEED, {
    [seed.model_key]: CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY[CANONICAL[0]!]!,
  });
  assert.deepEqual(
    both.seeds.map(s => s.model_key),
    [seed.model_key]
  );
  assert.deepEqual(both.canonicalKeys, []);
  // The publish job still takes seeds only.
  assert.throws(() => selectOnlySeeds([CANONICAL[0]!]), /no seed/);
});

test('--only reaches the named canonical masters and nothing else (#1804)', async () => {
  const otherCanonical = { id: 'canon-other', name: 'Other', model_key: 'acme:canon:1gb' };
  const { client, ops, writes } = mockClient({ ...allSeedsExisting(), ...canonicalExisting() }, [
    otherCanonical,
    { id: 'ai', name: 'AI', model_key: 'acme:phone:64gb' },
  ]);
  const enrichCalls: string[] = [];
  const only = [APPROVED[0]!, ...CANONICAL];
  const result = await runMasterSpecsBackfillWith(
    client,
    { ...deps(enrichCalls), enricher: { isConfigured: () => true } },
    { apply: true, only, expect: 4 }
  );
  assert.equal(result.planned, 4);
  assert.equal(result.catalogUpdated, 4);
  assert.equal(result.catalogInserted, 0);
  assert.equal(result.itemsUpdated, 0);

  const lookedUp = ops
    .filter(o => o.op === 'select' && o.filters.some(([c]) => c === 'model_key'))
    .map(o => o.filters.find(([c]) => c === 'model_key')![1]);
  assert.deepEqual([...lookedUp].sort(), [...only].sort(), 'only the named masters are read');
  assert.equal(
    ops.some(o => o.columns === FULL_LIST_COLUMNS),
    false,
    'no full master list read'
  );
  assert.equal(
    ops.some(o => o.table === 'items'),
    false,
    'no rate.items read or write'
  );
  assert.deepEqual(enrichCalls, [], 'no AI enrichment');

  const canon = canonicalExisting();
  const w = writes();
  assert.ok(w.every(o => o.table === 'master_products' && o.op === 'update'));
  assert.deepEqual(
    w.map(o => o.filters[0]![1]),
    [allSeedsExisting()[APPROVED[0]!]!.id, ...CANONICAL.map(k => canon[k]!.id)],
    'the seed, then the canonical masters in --only order'
  );
  for (const [i, key] of CANONICAL.entries()) {
    const entry = CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY[key]!;
    const payload = w[i + 1]!.payload!;
    assert.deepEqual(
      Object.keys(payload).sort(),
      [
        'battery_mah',
        'colors',
        'has_5g',
        'key_specs',
        'ram_gb',
        'screen_size_inch',
        'specifications',
        'storage_gb',
        'updated_at',
      ],
      `${key}: the canonical value columns only (no name, slug, status or category)`
    );
    assert.equal(payload.battery_mah, entry.battery_mah);
    const specs = payload.specifications as ProductSpecifications;
    assert.equal(specs.connectivity?.bluetooth, entry.specifications.connectivity?.bluetooth);
    assert.equal(specs.cellular?.bands_5g, entry.specifications.cellular?.bands_5g);
    assert.notEqual(specs.connectivity?.bluetooth, '5.3, A2DP, LE');
  }
});

test('a scoped canonical dry run plans, diffs and checks --expect like a seed (#1804)', async () => {
  const { client, writes } = mockClient(canonicalExisting());
  const { result, text } = await captureLogs(() =>
    runMasterSpecsBackfillWith(client, deps(), { only: CANONICAL, expect: 2 })
  );
  assert.equal(result.apply, false);
  assert.equal(result.planned, 3);
  assert.deepEqual(writes(), [], 'a dry run never writes');
  assert.match(text, /Plan \[mode=DRY-RUN, scoped\]: 3 master\(s\) to update or insert/);
  assert.match(text, /not the expected 2/);
  for (const key of CANONICAL) {
    assert.ok(text.includes(`[Canonical Specs] ${key}: would change`), `${key}: would change`);
  }
  assert.match(
    text,
    /specifications\.connectivity\.bluetooth: \\?"5\.3, A2DP, LE\\?" -> \\?"5\.3\\?"/
  );
  assert.match(text, /specifications\.cellular\.bands_5g: \\?"SA\/NSA\/Sub6\\?" -> /);

  // The same --expect mismatch stops an --apply before the first write.
  const live = mockClient(canonicalExisting());
  await assert.rejects(
    runMasterSpecsBackfillWith(live.client, deps(), { apply: true, only: CANONICAL, expect: 2 }),
    /--expect 2 does not match the plan of 3 master\(s\) \(apple:iphone-15:128gb, apple:iphone-16:128gb, apple:iphone-16-plus:256gb\): stopped before any write/
  );
  assert.deepEqual(live.writes(), []);
});

test('a named canonical key with no master row is never inserted (#1804)', async () => {
  const existing = canonicalExisting();
  delete existing[CANONICAL[1]!];
  for (const options of [
    { apply: true, only: CANONICAL, expect: 2 },
    { apply: true, only: CANONICAL, expect: 3, insertMissing: true },
  ]) {
    const live = mockClient(existing);
    await assert.rejects(
      runMasterSpecsBackfillWith(live.client, deps(), options),
      new RegExp(
        `no master row for canonical key\\(s\\) ${CANONICAL[1]!}; a canonical entry is never inserted: stopped before any write`
      )
    );
    assert.deepEqual(live.writes(), [], 'no insert, no update');
  }
  const dry = mockClient(existing);
  const { result, text } = await captureLogs(() =>
    runMasterSpecsBackfillWith(dry.client, deps(), { only: CANONICAL })
  );
  assert.deepEqual(dry.writes(), []);
  assert.equal(result.planned, 2);
  assert.match(text, /a canonical entry is never inserted; an --apply would stop before any write/);
});

test('the CLI parser passes canonical keys through --only (#1804)', () => {
  assert.deepEqual(
    parseBackfillSpecsArgs(['--only', CANONICAL.join(','), '--apply', '--expect', '3']),
    { apply: true, auditOnly: false, only: CANONICAL, expect: 3 }
  );
});
