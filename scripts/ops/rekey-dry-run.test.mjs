import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  QUERIES,
  categoryOf,
  checkReadOnly,
  formatPlan,
  loadKeyOf,
  planRekeys,
  psqlJson,
  splitKey,
} from './rekey-dry-run.mjs';

test('every query is a single SELECT', () => {
  for (const [name, sql] of Object.entries(QUERIES)) {
    assert.match(sql.trim(), /^SELECT\b/, name);
    assert.doesNotMatch(sql, /;/, `${name}: one statement`);
    assert.doesNotMatch(
      sql,
      /\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|ALTER|DROP|TRUNCATE\s+\w|CREATE|GRANT|COPY)\b/i,
      `${name}: no write statement`
    );
  }
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
    'role can write; session forced read-only'
  );
  // The override never lifts the read-only session requirement.
  assert.throws(
    () =>
      checkReadOnly(
        { read_only: 'off', superuser: true, writable: [] },
        { allowWriteCapableRole: true }
      ),
    /not read-only/
  );
});

test('psql runs read-only and never echoes the connection string', () => {
  const url = 'postgresql://ro:secret@db.example:5432/postgres';
  let call;
  const ok = psqlJson(url, 'SELECT 1', (cmd, args, opts) => {
    call = { cmd, args, opts };
    return { status: 0, stdout: '[{"a":1}]\n', stderr: '' };
  });
  assert.deepEqual(ok, [{ a: 1 }]);
  assert.equal(call.cmd, 'psql');
  assert.equal(call.opts.env.PGOPTIONS, '-c default_transaction_read_only=on');
  assert.ok(call.args.includes('ON_ERROR_STOP=1'));
  assert.throws(
    () =>
      psqlJson(url, 'SELECT 1', () => ({
        status: 2,
        stdout: '',
        stderr: `connection to ${url} failed`,
      })),
    (err) =>
      !err.message.includes('secret') &&
      /<REKEY_DATABASE_URL>/.test(err.message)
  );
});

test('categories and key parts', () => {
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
  assert.equal(
    categoryOf('apple:watch-series10:unknown'),
    'watch-spelling (#1407)'
  );
  assert.equal(categoryOf('apple:watch-series-10-46mm:64gb'), 'other');
  assert.equal(categoryOf('samsung:galaxy-tab-s9:128gb'), 'other');
});

test('plans renames and merges from the listings, counting what would move', () => {
  const keys = {
    'S25 gift a': 'samsung:galaxy-s25:unknown',
    'S25 gift b': 'samsung:galaxy-s25:unknown',
    'S25 odd': 'samsung:galaxy-s25-tang-tai:unknown',
    'SE2 a': 'apple:watch-se-2-40mm:unknown',
    'A55 ok': 'samsung:galaxy-a55:256gb',
    // A title without its storage keeps the stored variant: no move.
    'A55 sizeless': 'samsung:galaxy-a55:unknown',
    'split 1': 'oppo:reno-12:256gb',
    'split 2': 'oppo:reno-12-pro:256gb',
  };
  const plan = planRekeys({
    masters: [
      {
        id: 'm1',
        model_key: 'samsung:galaxy-s25-tang-tai:unknown',
        status: 'published',
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
    ],
    listings: [
      { id: 'p1', master_id: 'm1', title: 'S25 gift a' },
      { id: 'p2', master_id: 'm1', title: 'S25 gift b' },
      { id: 'p3', master_id: 'm1', title: 'S25 odd' },
      { id: 'p4', master_id: 'm2', title: 'SE2 a' },
      { id: 'p5', master_id: 'm4', title: 'A55 ok' },
      { id: 'p6', master_id: 'm4', title: 'A55 sizeless' },
      { id: 'p7', master_id: 'm5', title: 'split 1' },
      { id: 'p8', master_id: 'm5', title: 'split 2' },
      { id: 'p9', master_id: 'm4', title: 'unkeyable' },
    ],
    priceRows: [
      { product_id: 'p1', rows: 3 },
      { product_id: 'p2', rows: '2' },
      { product_id: 'p4', rows: 5 },
    ],
    keyOf: (title) => keys[title] ?? null,
  });
  assert.deepEqual(
    plan.changes.map((c) => [
      c.oldKey,
      c.newKey,
      c.action,
      c.listings,
      c.agreeing,
      c.keyed,
      c.priceRows,
    ]),
    [
      [
        'samsung:galaxy-s25-tang-tai:unknown',
        'samsung:galaxy-s25:unknown',
        'rename in place',
        3,
        2,
        3,
        5,
      ],
      [
        'apple:watch-se2-40mm:unknown',
        'apple:watch-se-2-40mm:unknown',
        'merge into m3',
        1,
        1,
        1,
        5,
      ],
    ]
  );
  assert.equal(plan.changes[0].category, 'gift-word (#1441)');
  assert.equal(plan.changes[1].category, 'watch-spelling (#1407)');
  assert.deepEqual(
    plan.unclear.map((u) => u.oldKey),
    ['oppo:reno-12-x:256gb']
  );
  assert.equal(
    plan.unchanged,
    1,
    'm4: its listings agree, a sizeless title moves nothing'
  );
  assert.equal(plan.noListings, 2, 'm3 and m6');
  const text = formatPlan(plan).join('\n');
  assert.match(text, /Proposed re-keys: 2 masters, 4 listings, 10 price rows/);
  assert.match(text, /Nothing was written\./);
  assert.match(
    text,
    /apple:watch-se2-40mm:unknown -> apple:watch-se-2-40mm:unknown {2}\[merge into m3/
  );
  assert.match(text, /## unclear/);
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
