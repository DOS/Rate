import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GUARD_SQL,
  SESSION_SQL,
  categoryOf,
  checkReadOnly,
  createCollector,
  formatPlan,
  loadKeyOf,
  pgEnvFromUrl,
  planRekeys,
  runSession,
  splitKey,
  watchRespelling,
} from './rekey-dry-run.mjs';

test('the session is one read-only transaction of SELECTs, guard first', () => {
  // Statements end in ";" or a psql "\gset"; "\if" and "\endif" are psql lines.
  const parts = SESSION_SQL.split(
    /(?:;|\\gset)\s*\n|\n(?=\\)|(?<=\\if :guard_ok|\\endif)\n/
  )
    .map((s) => s.trim().replace(/;$/, ''))
    .filter(Boolean);
  assert.deepEqual(parts.slice(0, 1), ['BEGIN READ ONLY']);
  assert.equal(parts[parts.length - 1], 'ROLLBACK');
  assert.match(parts[1], /AS guard_ok$/, 'psql decides first');
  assert.match(
    parts[2],
    /^SELECT 'guard'/,
    'then the guard row for this script'
  );
  assert.equal(
    parts[3],
    '\\if :guard_ok',
    'the data reads only run past the guard'
  );
  assert.equal(parts[parts.length - 2], '\\endif');
  const reads = parts.slice(1, -1).filter((s) => !s.startsWith('\\'));
  assert.equal(reads.length, 5);
  for (const sql of reads) {
    assert.match(sql, /^SELECT\b/);
    assert.doesNotMatch(
      sql,
      /\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|ALTER|DROP|TRUNCATE\s+\w|CREATE|GRANT|COPY)\b/i
    );
  }
  for (const guard of [parts[1], parts[2]]) {
    assert.match(
      guard,
      /has_any_column_privilege\(current_user, t, 'INSERT, UPDATE'\)/,
      'column grants count'
    );
  }
  assert.match(parts[1], /:'allow_write' = 'on'/);
  assert.match(
    parts[1],
    /current_setting\('transaction_read_only'\) = 'on'\s+AND/
  );
});

test('refuses a session that is not read-only, or a role that can write', () => {
  assert.throws(
    () => checkReadOnly({ read_only: 'off', superuser: false, writable: [] }),
    /not read-only/
  );
  assert.throws(() => checkReadOnly(null), /not read-only/);
  assert.throws(
    () =>
      checkReadOnly({
        read_only: 'on',
        superuser: false,
        writable: ['rate.products'],
      }),
    /role can write \(rate\.products\)/
  );
  assert.throws(
    () => checkReadOnly({ read_only: 'on', superuser: true, writable: [] }),
    /superuser/
  );
  assert.equal(
    checkReadOnly({ read_only: 'on', superuser: false, writable: [] }),
    'SELECT-only role'
  );
  assert.equal(
    checkReadOnly(
      { read_only: 'on', superuser: true, writable: [] },
      { allowWriteCapableRole: true }
    ),
    'role can write; transaction forced read-only'
  );
  assert.throws(
    () =>
      checkReadOnly(
        { read_only: 'off', superuser: true, writable: [] },
        { allowWriteCapableRole: true }
      ),
    /not read-only/,
    'the override never lifts the read-only transaction'
  );
});

test('the connection string becomes PG* variables and no error repeats it', () => {
  assert.deepEqual(
    pgEnvFromUrl(
      'postgresql://ro%40x:s%23cret@db.example:6543/postgres?sslmode=require'
    ),
    {
      PGHOST: 'db.example',
      PGPORT: '6543',
      PGUSER: 'ro@x',
      PGPASSWORD: 's#cret',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
    }
  );
  // libpq's TLS parameters are passed on, and an IPv6 host loses its brackets.
  assert.deepEqual(
    pgEnvFromUrl(
      'postgresql://ro:pw@[2001:db8::1]:5432/postgres?sslmode=verify-full&sslrootcert=system'
    ),
    {
      PGHOST: '2001:db8::1',
      PGPORT: '5432',
      PGUSER: 'ro',
      PGPASSWORD: 'pw',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: 'system',
    }
  );
  // A parameter libpq would not read ("ssl=true") is refused, never dropped.
  assert.throws(
    () => pgEnvFromUrl('postgresql://ro:secret@db.example/postgres?ssl=true'),
    (err) =>
      /query parameter .* ssl\./.test(err.message) &&
      !err.message.includes('secret')
  );
  for (const bad of [
    'postgresql://ro:secret%zz@db.example/postgres',
    'not a url secret',
    'https://ro:secret@x/y',
  ]) {
    assert.throws(
      () => pgEnvFromUrl(bad),
      (err) => !err.message.includes('secret')
    );
  }
});

/**
 * A fake psql: answers the first statements it gets with the guard line (when
 * `lines` starts with one), the rest of `lines` once stdin ends, then exits with
 * `code` (stderr gets `stderr`). Killed, it prints nothing more.
 */
function fakeSpawn({ lines = [], code = 0, stderr = '' }) {
  const calls = [];
  const spawnFn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    const call = { cmd, args, opts, child, script: '' };
    calls.push(call);
    let done = false;
    const finish = (rest) => {
      if (done) return;
      done = true;
      child.stdout.end(rest.length > 0 ? rest.join('\n') + '\n' : '');
      child.stderr.end(stderr);
      setTimeout(() => child.emit('close', code), 10);
    };
    child.kill = () => {
      child.killed = true;
      finish([]);
    };
    let answered = false;
    child.stdin.on('data', (d) => {
      call.script += d;
      if (answered) return;
      answered = true;
      if (lines[0]?.startsWith('guard\t')) child.stdout.write(lines[0] + '\n');
      else finish(lines);
    });
    child.stdin.on('end', () => finish(lines.slice(1)));
    return child;
  };
  return { spawnFn, calls };
}

test('one psql session, read-only options, no URL on the command line', async () => {
  const { spawnFn, calls } = fakeSpawn({
    lines: [
      'guard\t{"read_only":"on","superuser":false,"writable":[]}',
      'master\t{"id":"m1","model_key":"samsung:galaxy-s25-tang-tai:unknown","status":"draft"}',
      'listing\t{"id":"p1","master_id":"m1","title":"T1"}',
      'price\t{"product_id":"p1","rows":4}',
    ],
  });
  const collector = createCollector({
    keyOf: () => 'samsung:galaxy-s25:unknown',
    onGuard: (g) => checkReadOnly(g),
  });
  await runSession(
    { PGHOST: 'db.example', PGPASSWORD: 'secret' },
    collector.line,
    spawnFn
  );
  assert.equal(calls.length, 1, 'one session');
  assert.equal(calls[0].cmd, 'psql');
  assert.ok(
    !calls[0].args.join(' ').includes('secret'),
    'no credential in the arguments'
  );
  assert.equal(
    calls[0].opts.env.PGOPTIONS,
    '-c default_transaction_read_only=on'
  );
  assert.equal(calls[0].opts.env.PGPASSWORD, 'secret');
  assert.equal(calls[0].script, `${SESSION_SQL}\n`);
  assert.deepEqual(collector.data.listings, [
    { id: 'p1', master_id: 'm1', key: 'samsung:galaxy-s25:unknown' },
  ]);
  assert.deepEqual(collector.data.priceRows, [{ product_id: 'p1', rows: 4 }]);
});

test('a failing guard stops the session before data is kept; psql errors are withheld', async () => {
  const writer = fakeSpawn({
    lines: [
      'guard\t{"read_only":"on","superuser":true,"writable":[]}',
      'master\t{"id":"m1","model_key":"a:b:c","status":"draft"}',
    ],
  });
  const collector = createCollector({
    keyOf: () => null,
    onGuard: (g) => checkReadOnly(g),
  });
  await assert.rejects(
    runSession({}, collector.line, writer.spawnFn),
    /superuser/
  );
  assert.equal(collector.data.masters.length, 0);
  assert.ok(writer.calls[0].child.killed);
  // Without the override, psql itself skips the data reads for such a role.
  assert.ok(writer.calls[0].args.includes('allow_write=off'));
  assert.ok(
    writer.calls[0].script.indexOf('\\if :guard_ok') <
      writer.calls[0].script.indexOf('FROM rate.master_products')
  );
  assert.ok(writer.calls[0].script.startsWith(GUARD_SQL));
  const allowed = fakeSpawn({ lines: [] });
  await assert.rejects(
    runSession({}, () => {}, allowed.spawnFn, { allowWriteCapableRole: true }),
    /no read-only check/
  );
  assert.ok(allowed.calls[0].args.includes('allow_write=on'));
  const noGuard = createCollector({ keyOf: () => null, onGuard: () => {} });
  assert.throws(
    () => noGuard.line('master\t{"id":"m1"}'),
    /before the read-only check/
  );
  const broken = fakeSpawn({
    code: 2,
    stderr: 'invalid percent-encoded token: "secret%zz"\n',
  });
  await assert.rejects(
    runSession({}, () => {}, broken.spawnFn),
    (err) =>
      /exit 2, 1 error line\(s\) withheld/.test(err.message) &&
      !err.message.includes('secret')
  );
});

test('categories, key parts and the #1407 respelling', () => {
  assert.deepEqual(splitKey('samsung:galaxy-s25:256gb'), {
    item: 'samsung:galaxy-s25',
    variant: '256gb',
  });
  assert.equal(
    categoryOf('samsung:galaxy-s25-tang-tai:unknown'),
    'gift-word (#1441)'
  );
  assert.equal(
    categoryOf('asus:vivobook-14-kem-chuot:512gb'),
    'gift-word (#1441)'
  );
  assert.equal(
    categoryOf('apple:watch-se2-40mm:unknown'),
    'watch-spelling (#1407)'
  );
  assert.equal(categoryOf('apple:watch-series-10-46mm:64gb'), 'other');
  assert.equal(
    watchRespelling('apple:watch-se2-40mm:unknown'),
    'apple:watch-se-2-40mm:unknown'
  );
  assert.equal(
    watchRespelling('apple:watch-series10:unknown'),
    'apple:watch-series-10:unknown'
  );
  assert.equal(
    watchRespelling('apple:watch-se2022:unknown'),
    'apple:watch-se-2022:unknown'
  );
  assert.equal(watchRespelling('apple:watch-series-10-46mm:64gb'), null);
  assert.equal(watchRespelling('apple:watch-se-2-40mm:unknown'), null);
});

test('plans renames and merges, counting what would move', () => {
  const plan = planRekeys({
    masters: [
      {
        id: 'm1',
        model_key: 'samsung:galaxy-s25-tang-tai:unknown',
        status: 'published',
      },
      {
        id: 'm1b',
        model_key: 'samsung:galaxy-s25-kem-tai:unknown',
        status: 'draft',
      },
      { id: 'm2', model_key: 'apple:watch-se2-40mm:unknown', status: 'draft' },
      {
        id: 'm3',
        model_key: 'apple:watch-se-2-40mm:unknown',
        status: 'published',
      },
      { id: 'm4', model_key: 'samsung:galaxy-a55:256gb', status: 'published' },
      { id: 'm5', model_key: 'oppo:reno-12-x:256gb', status: 'draft' },
      { id: 'm6', model_key: 'xiaomi:15t:512gb', status: 'draft' },
      {
        id: 'm7',
        model_key: 'asus:vivobook-14-tang-chuot:512gb',
        status: 'draft',
      },
    ],
    listings: [
      { id: 'p1', master_id: 'm1', key: 'samsung:galaxy-s25:unknown' },
      { id: 'p2', master_id: 'm1', key: 'samsung:galaxy-s25:unknown' },
      { id: 'p3', master_id: 'm1', key: 'samsung:galaxy-s25-tang-tai:unknown' },
      { id: 'p3b', master_id: 'm1b', key: 'samsung:galaxy-s25:unknown' },
      { id: 'p4', master_id: 'm2', key: 'apple:watch-se2-40mm:unknown' },
      { id: 'p5', master_id: 'm4', key: 'samsung:galaxy-a55:256gb' },
      // A title without its storage keeps the stored variant: no move.
      { id: 'p6', master_id: 'm4', key: 'samsung:galaxy-a55:unknown' },
      { id: 'p9', master_id: 'm4', key: null },
      { id: 'p7', master_id: 'm5', key: 'oppo:reno-12:256gb' },
      { id: 'p8', master_id: 'm5', key: 'oppo:reno-12-pro:256gb' },
      // One keyed listing of three decides, flagged as low coverage.
      { id: 'q1', master_id: 'm7', key: 'asus:vivobook-14:512gb' },
      { id: 'q2', master_id: 'm7', key: null },
      { id: 'q3', master_id: 'm7', key: null },
    ],
    priceRows: [
      { product_id: 'p1', rows: 3 },
      { product_id: 'p2', rows: '2' },
      { product_id: 'p4', rows: 5 },
    ],
  });
  const row = (c) => [c.oldKey, c.newKey, c.action, c.listings, c.priceRows];
  assert.deepEqual(plan.changes.map(row), [
    [
      'asus:vivobook-14-tang-chuot:512gb',
      'asus:vivobook-14:512gb',
      'rename in place',
      3,
      0,
    ],
    [
      'samsung:galaxy-s25-kem-tai:unknown',
      'samsung:galaxy-s25:unknown',
      'merge with m1 into one new key',
      1,
      0,
    ],
    [
      'samsung:galaxy-s25-tang-tai:unknown',
      'samsung:galaxy-s25:unknown',
      'merge with m1b into one new key',
      3,
      5,
    ],
    // The #1407 respelling is applied to the listings' keys, as the normalizer change is not shipped.
    [
      'apple:watch-se2-40mm:unknown',
      'apple:watch-se-2-40mm:unknown',
      'merge into m3',
      1,
      5,
    ],
  ]);
  assert.equal(plan.changes[0].lowCoverage, true);
  assert.equal(plan.changes[2].lowCoverage, false);
  assert.equal(plan.changes[3].source, 'normalizer + spelling rule');
  assert.deepEqual(
    plan.unclear.map((u) => u.oldKey),
    ['oppo:reno-12-x:256gb']
  );
  assert.equal(plan.unchanged, 1, 'm4');
  assert.equal(plan.noListings, 2, 'm3 and m6');
  const text = formatPlan(plan).join('\n');
  assert.match(text, /Proposed re-keys: 4 masters, 8 listings, 10 price rows/);
  assert.match(text, /Nothing was written\./);
  assert.match(text, /LOW COVERAGE/);
  assert.match(text, /## unclear/);
});

test('lists the minority listings that would leave a kept-key master (#1491 c, d)', () => {
  const plan = planRekeys({
    masters: [
      {
        id: 'i1',
        model_key: 'apple:ipad-pro-m4-11:256gb',
        status: 'published',
      },
      { id: 'i2', model_key: 'apple:ipad-pro-m4-11-5g:256gb', status: 'draft' },
      { id: 'u1', model_key: 'apple:ipad-mini-7:unknown', status: 'draft' },
      {
        id: 'b1',
        model_key: 'apple:macbook-air-m3-13:256gb',
        status: 'published',
      },
      { id: 'q1', model_key: 'samsung:galaxy-a55:256gb', status: 'published' },
      { id: 'n1', model_key: 'garmin:fenix-7', status: 'draft' },
    ],
    listings: [
      // A suffix-enabled build keys the 5G titles apart; the Wi-Fi majority stays.
      { id: 'w1', master_id: 'i1', key: 'apple:ipad-pro-m4-11:256gb' },
      { id: 'w2', master_id: 'i1', key: 'apple:ipad-pro-m4-11:256gb' },
      { id: 'w3', master_id: 'i1', key: 'apple:ipad-pro-m4-11:unknown' },
      { id: 'c1', master_id: 'i1', key: 'apple:ipad-pro-m4-11-5g:256gb' },
      // A leaving listing keeps the storage its title states.
      { id: 'c2', master_id: 'i1', key: 'apple:ipad-pro-m4-11-5g:512gb' },
      { id: 'w4', master_id: 'i1', key: null },
      // Under an "unknown" master, 128GB and 256GB 5G listings go to two keys, and
      // one with no storage takes the master's.
      { id: 'm1', master_id: 'u1', key: 'apple:ipad-mini-7:128gb' },
      { id: 'm2', master_id: 'u1', key: 'apple:ipad-mini-7:unknown' },
      { id: 'm3', master_id: 'u1', key: 'apple:ipad-mini-7:256gb' },
      { id: 'm4', master_id: 'u1', key: 'apple:ipad-mini-7-5g:128gb' },
      { id: 'm5', master_id: 'u1', key: 'apple:ipad-mini-7-5g:unknown' },
      { id: 'g1', master_id: 'b1', key: 'apple:macbook-air-m3-13:256gb' },
      { id: 'g2', master_id: 'b1', key: 'apple:macbook-air-m3-13:256gb' },
      {
        id: 'g3',
        master_id: 'b1',
        key: 'apple:macbook-air-m3-13-8gb-ram:256gb',
      },
      // A master whose listings all keep its key lists nothing.
      { id: 'a1', master_id: 'q1', key: 'samsung:galaxy-a55:256gb' },
      // A master with no variant passes on a stated storage only; "unknown" is none.
      { id: 'f1', master_id: 'n1', key: 'garmin:fenix-7:unknown' },
      { id: 'f2', master_id: 'n1', key: 'garmin:fenix-7:unknown' },
      { id: 'f3', master_id: 'n1', key: 'garmin:fenix-7-pro:unknown' },
    ],
    priceRows: [
      { product_id: 'c1', rows: 7 },
      { product_id: 'c2', rows: 2 },
      { product_id: 'g3', rows: '2' },
      { product_id: 'w1', rows: 9 },
    ],
  });
  assert.equal(plan.changes.length, 0, 'every master keeps its key');
  assert.equal(plan.noListings, 1, 'i2');
  const groups = (s) => [
    s.oldKey,
    s.keyed,
    ...s.groups.map((g) => [g.newKey, g.listings, g.priceRows, g.action]),
  ];
  assert.deepEqual(plan.splits.map(groups), [
    [
      'apple:ipad-mini-7:unknown',
      5,
      ['apple:ipad-mini-7-5g:128gb', 1, 0, 'a new master'],
      ['apple:ipad-mini-7-5g:unknown', 1, 0, 'a new master'],
    ],
    [
      'apple:ipad-pro-m4-11:256gb',
      5,
      ['apple:ipad-pro-m4-11-5g:256gb', 1, 7, 'into existing master i2'],
      ['apple:ipad-pro-m4-11-5g:512gb', 1, 2, 'a new master'],
    ],
    [
      'apple:macbook-air-m3-13:256gb',
      3,
      ['apple:macbook-air-m3-13-8gb-ram:256gb', 1, 2, 'a new master'],
    ],
    ['garmin:fenix-7', 3, ['garmin:fenix-7-pro', 1, 0, 'a new master']],
  ]);
  const text = formatPlan(plan).join('\n');
  assert.match(
    text,
    /Minority leaving a kept-key master: 4 masters, 6 listings, 11 price rows\./
  );
  assert.match(
    text,
    /## minority listings leaving a kept-key master \(4 masters, 6 listings, 11 price rows; #1491 c, d\)/
  );
  assert.match(
    text,
    /-> apple:ipad-pro-m4-11-5g:256gb: 1 listing, 7 price rows \(into existing master i2\)/
  );
  assert.match(text, /listings 6, keyed 5; master i1/);
  assert.match(text, /Proposed re-keys: 0 masters/);
});

test('a split onto a master or key that a re-key also touches is flagged', () => {
  const plan = planRekeys({
    masters: [
      { id: 'A', model_key: 'samsung:galaxy-a55:256gb', status: 'published' },
      { id: 'B', model_key: 'samsung:galaxy-a56:256gb', status: 'draft' },
      { id: 'C', model_key: 'xiaomi:15-tang-op:256gb', status: 'draft' },
      { id: 'D', model_key: 'xiaomi:15t:256gb', status: 'draft' },
    ],
    listings: [
      { id: 'a1', master_id: 'A', key: 'samsung:galaxy-a55:256gb' },
      { id: 'a2', master_id: 'A', key: 'samsung:galaxy-a55:256gb' },
      { id: 'a3', master_id: 'A', key: 'samsung:galaxy-a56:256gb' },
      // B is re-keyed, so it is no safe target for A's A56 listing.
      { id: 'b1', master_id: 'B', key: 'samsung:galaxy-a57:256gb' },
      // C moves to xiaomi:15:256gb, the key D's minority would go to as well.
      { id: 'c1', master_id: 'C', key: 'xiaomi:15:256gb' },
      { id: 'd1', master_id: 'D', key: 'xiaomi:15t:256gb' },
      { id: 'd2', master_id: 'D', key: 'xiaomi:15t:256gb' },
      { id: 'd3', master_id: 'D', key: 'xiaomi:15:256gb' },
    ],
    priceRows: [],
  });
  assert.deepEqual(
    plan.changes.map((c) => [c.oldKey, c.newKey]),
    [
      ['xiaomi:15-tang-op:256gb', 'xiaomi:15:256gb'],
      ['samsung:galaxy-a56:256gb', 'samsung:galaxy-a57:256gb'],
    ]
  );
  assert.deepEqual(
    plan.splits.map((s) => [s.oldKey, s.groups.map((g) => g.action)]),
    [
      [
        'samsung:galaxy-a55:256gb',
        ['into B (that master is re-keyed too: resolve first)'],
      ],
      ['xiaomi:15t:256gb', ['onto the key C moves to: resolve first']],
    ]
  );
});

test('a watch respelling keeps what the titles say, else falls back to the stored key', () => {
  const plan = planRekeys({
    masters: [
      { id: 'w1', model_key: 'apple:watch-series10:unknown', status: 'draft' },
      {
        id: 'w2',
        model_key: 'apple:watch-series-10-46mm:64gb',
        status: 'published',
      },
      { id: 'w3', model_key: 'apple:watch-se3:unknown', status: 'draft' },
    ],
    listings: [
      // The unshipped normalizer still keys the glued spelling, with the case size.
      { id: 'r1', master_id: 'w1', key: 'apple:watch-series10-46mm:64gb' },
      { id: 'r2', master_id: 'w2', key: 'apple:watch-series-10-46mm:64gb' },
    ],
    priceRows: [],
  });
  const row = (c) => [c.oldKey, c.newKey, c.action, c.source];
  assert.deepEqual(plan.changes.map(row), [
    [
      'apple:watch-se3:unknown',
      'apple:watch-se-3:unknown',
      'rename in place',
      'spelling rule on the stored key, no title majority: check the case size by hand',
    ],
    [
      'apple:watch-series10:unknown',
      'apple:watch-series-10-46mm:unknown',
      'rename in place',
      'normalizer + spelling rule',
    ],
  ]);
  assert.equal(plan.unchanged, 1, 'w2');
});

test('a re-keyed merge target is flagged, and a tie is unclear in any row order', () => {
  const masters = [
    { id: 'a', model_key: 'samsung:galaxy-s25-tang:unknown', status: 'draft' },
    { id: 'b', model_key: 'samsung:galaxy-s25:unknown', status: 'draft' },
  ];
  const chain = planRekeys({
    masters,
    listings: [
      { id: 'l1', master_id: 'a', key: 'samsung:galaxy-s25:unknown' },
      { id: 'l2', master_id: 'b', key: 'samsung:galaxy-s26:unknown' },
    ],
    priceRows: [],
  });
  assert.match(
    chain.changes.find((c) => c.masterId === 'a').action,
    /merge into b \(that master is re-keyed too: resolve first\)/
  );
  const tie = [
    { id: 't1', master_id: 'b', key: 'samsung:galaxy-s25:unknown' },
    { id: 't2', master_id: 'b', key: 'samsung:galaxy-s25-plus:unknown' },
  ];
  for (const listings of [tie, [...tie].reverse()]) {
    const plan = planRekeys({ masters: [masters[1]], listings, priceRows: [] });
    assert.deepEqual(
      plan.unclear.map((u) => u.masterId),
      ['b']
    );
    assert.equal(plan.unchanged, 0);
  }
});

const built = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/importer/dist/shopee/product-normalizer.js'
);
test(
  'the built normalizer keys a gift title like its product',
  { skip: !existsSync(built) },
  async () => {
    const keyOf = await loadKeyOf(built);
    assert.equal(
      keyOf('Samsung Galaxy S25 tặng tai nghe Galaxy Buds 3'),
      'samsung:galaxy-s25:unknown'
    );
    assert.equal(
      keyOf('Samsung 256GB'),
      null,
      'an unkeyable title votes for nothing'
    );
  }
);
