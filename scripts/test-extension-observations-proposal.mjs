#!/usr/bin/env node
// Replays the DOS-Me extension observations PROPOSAL (DOS/Rate#1606, M2 of
// Docs/Proposals/2026-10-28-extension-data-source.md, contract Revision 2) on the migration
// replay stack: the proposal twice; the ingest key (no row, a wrong key, the right key); every
// verification query; each payload, valid or refused, against the shared validator
// (parseExtensionObservationV1 in @repo/shared-data) with the same verdict and field; the
// unknown submitter; the limits at their exact thresholds; the delete cascade; the purge and its
// race with a submit; the table grants; the rollback twice and the proposal again. Nothing
// touches a real database.
//
// Usage: pnpm --filter @repo/shared-data build && node scripts/test-extension-observations-proposal.mjs
// (needs Docker)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

const rules = await import(
  pathToFileURL(
    path.join(repoRoot, 'packages', 'shared-data', 'dist', 'rules', 'index.js')
  ).href
);
const parse = rules.parseExtensionObservationV1;
assert.equal(
  typeof parse,
  'function',
  'parseExtensionObservationV1 is missing from @repo/shared-data: build it first'
);

const read = (name) =>
  readFileSync(path.join(repoRoot, 'Docs', 'Proposals', name), 'utf8');
const proposal = read('2026-11-04-dos-me-extension-observations.sql');
const rollback = read('2026-11-04-dos-me-extension-observations-rollback.sql');
const verify = read('2026-11-04-dos-me-extension-observations-verify.sql');

const container = `rate-extension-observations-proposal-${process.pid}`;
const removeContainer = () =>
  spawnSync('docker', ['rm', '--force', container], { timeout: 30_000 });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    removeContainer();
    process.exit(130);
  });
}

const checks = [
  ...verify.matchAll(
    /^-- (V\d+) [^\n]*(?:\n--[^\n]*)*expect 0\n((?:SELECT|WITH)[\s\S]*?;)/gm
  ),
].map(([, id, query]) => ({ id, query }));
assert.deepEqual(
  checks.map((c) => c.id),
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12'],
  'the verification lists its expect-0 queries'
);
const check = (id) => checks.find((c) => c.id === id).query;

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value))}::jsonb`;
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const ch = (code) => String.fromCodePoint(code);
// A test value made up here, not a secret: the replay sets its hash as the ingest key row.
const KEY = `local-replay-ingest-key-${process.pid}`;
const NET_A = sha('net-a');
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
let nets = 0;
const freshNet = () => sha(`net-${(nets += 1)}`);

const MIN = 60_000;
const HOUR = 60 * MIN;
const pad = (n) => String(n).padStart(2, '0');
// ISO 8601 at `ms`, written in the offset `off` minutes: sep ':' gives +07:00, '' gives +0700,
// null gives +07; offset 0 is Z.
const iso = (ms, { off = 0, sec = true, frac = '', sep = ':' } = {}) => {
  const d = new Date(ms + off * MIN);
  let s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  if (sec) s += `:${pad(d.getUTCSeconds())}${frac}`;
  if (off === 0) return `${s}Z`;
  const a = Math.abs(off);
  return `${s}${off > 0 ? '+' : '-'}${pad(Math.floor(a / 60))}${sep === null ? '' : `${sep}${pad(a % 60)}`}`;
};
const ago = (ms) => iso(Date.now() - ms, { frac: '.000' });

const good = (over = {}) => ({
  schema_version: 1,
  marketplace: 'shopee',
  listing_url: 'https://shopee.vn/product/123456/7890123',
  external_item_id: '7890123',
  external_shop_id: '123456',
  sku_id: null,
  variant_label: 'Den, 128GB',
  price_vnd: 10990000,
  list_price_vnd: 12990000,
  stock_state: 'in_stock',
  stock_qty: null,
  observed_at: new Date().toISOString(),
  extractor: { source: 'json_ld', extension_version: '0.2.0' },
  ...over,
});
const without = (key) => {
  const o = good();
  delete o[key];
  return o;
};

try {
  const { sql } = startRateDb({ name: container });
  // One psql session per call; the role and its errors stay in it. VERBOSITY verbose prints the
  // SQLSTATE in front of the message.
  const as = (role, query) =>
    sql(`\\set VERBOSITY verbose\nSET ROLE ${role};\n${query};\nRESET ROLE;`);
  const refused = (role, query, code, detail, what) =>
    assert.throws(
      () => as(role, query),
      (err) => {
        assert.match(err.message, new RegExp(`ERROR:\\s+${code}:`), what);
        if (detail !== undefined)
          assert.match(
            err.message,
            new RegExp(`DETAIL:\\s+${detail.replaceAll('.', '\\.')}\\r?\\n`),
            what
          );
        return true;
      },
      what
    );
  const checkAll = (when) => {
    for (const { id, query } of checks)
      assert.equal(sql(query), '0', `${id} ${when}`);
  };
  const lit = (v) => (v === null ? 'NULL' : q(v));
  const registerSql = (net, key = KEY) =>
    `SELECT rate.register_extension_submitter(${lit(key)}, ${lit(net)})`;
  const register = (net = freshNet(), role = 'anon') =>
    as(role, registerSql(net));
  const submitSql = (id, obs, net = NET_A, key = KEY) =>
    `SELECT rate.submit_extension_observation(${lit(key)}, ${lit(id)}, ${
      obs === undefined ? 'NULL' : j(obs)
    }, ${lit(net)})::text`;
  const submit = (id, obs, net = NET_A, role = 'anon') =>
    JSON.parse(as(role, submitSql(id, obs, net)));
  const count = (where = 'true', table = 'rate.extension_observations') =>
    Number(sql(`SELECT count(*) FROM ${table} WHERE ${where}`));
  // Rows written straight as postgres, received (and observed) `age` ago.
  const backfill = (id, n, age, net = null) =>
    sql(`INSERT INTO rate.extension_observations (submitter_id, schema_version, marketplace,
           listing_url, external_item_id, price_vnd, stock_state, observed_at, extractor,
           received_at, network_hash)
         SELECT ${q(id)}, 1, 'shopee', 'https://shopee.vn/p', 'i' || g, 100000, 'unknown',
           now() - ${q(age)}::interval, '{"source": "dom", "extension_version": "1"}',
           now() - ${q(age)}::interval, ${lit(net)}
         FROM generate_series(1, ${n}) g`);

  // 1. The proposal twice.
  sql(proposal);
  sql(proposal);

  // 2. The ingest key: no row refuses every caller; then a wrong, empty or null key refuses and
  // the right one passes. delete takes no key.
  refused(
    'anon',
    registerSql(NET_A),
    '42501',
    'ingest_key',
    'register without a key row'
  );
  refused(
    'anon',
    submitSql(UNKNOWN, good()),
    '42501',
    'ingest_key',
    'submit without a key row'
  );
  assert.equal(
    count('true', 'rate.extension_ingest_secret'),
    0,
    'the migration sets no key'
  );
  sql(
    `INSERT INTO rate.extension_ingest_secret (key_sha256) VALUES (${q(sha(KEY))})`
  );
  refused(
    'postgres',
    `INSERT INTO rate.extension_ingest_secret (key_sha256) VALUES (${q(sha('x'))})`,
    '23505',
    undefined,
    'one row only'
  );
  refused(
    'postgres',
    `INSERT INTO rate.extension_ingest_secret (id, key_sha256)
    VALUES (false, ${q(sha('x'))})`,
    '23514',
    undefined,
    'id is always true'
  );
  refused(
    'postgres',
    `UPDATE rate.extension_ingest_secret SET key_sha256 = 'ABC'`,
    '23514',
    undefined,
    'the hash format is checked'
  );
  for (const key of ['wrong', '', null, KEY.toUpperCase(), sha(KEY)]) {
    refused(
      'anon',
      registerSql(NET_A, key),
      '42501',
      'ingest_key',
      `register with ${key}`
    );
    refused(
      'anon',
      submitSql(UNKNOWN, good(), NET_A, key),
      '42501',
      'ingest_key',
      `submit with ${key}`
    );
  }

  // 3. Every check, and a check fails when its rule breaks.
  checkAll('after the apply');
  sql(verify);
  sql('GRANT SELECT ON rate.extension_observations TO anon');
  assert.notEqual(sql(check('V2')), '0', 'V2 sees a grant to anon');
  sql('REVOKE SELECT ON rate.extension_observations FROM anon');
  sql('GRANT SELECT ON rate.extension_ingest_secret TO rate_worker');
  assert.notEqual(sql(check('V11')), '0', 'V11 sees a grant on the key');
  sql('REVOKE SELECT ON rate.extension_ingest_secret FROM rate_worker');
  sql('ALTER TABLE rate.extension_observations FORCE ROW LEVEL SECURITY');
  assert.notEqual(sql(check('V1')), '0', 'V1 sees forced row level security');
  sql('ALTER TABLE rate.extension_observations NO FORCE ROW LEVEL SECURITY');
  checkAll('after the probes');

  // 4. Register: the right key and a network hash; anon and authenticated; not rate_worker.
  const s1 = register();
  assert.match(s1, /^[0-9a-f-]{36}$/);
  const sAuth = register(freshNet(), 'authenticated');
  assert.notEqual(s1, sAuth);
  assert.equal(
    sql(
      `SELECT network_hash FROM rate.extension_submitters WHERE id = ${q(s1)}`
    ),
    sha(`net-${nets - 1}`),
    'the submitter keeps its network hash'
  );
  refused(
    'rate_worker',
    registerSql(NET_A),
    '42501',
    undefined,
    'rate_worker cannot register'
  );
  for (const net of [
    null,
    'abc',
    NET_A.toUpperCase(),
    NET_A.slice(1),
    `${NET_A}0`,
    '',
  ]) {
    refused(
      'anon',
      registerSql(net),
      '22023',
      'network_hash',
      `register network_hash ${net}`
    );
    refused(
      'anon',
      submitSql(s1, good(), net),
      '22023',
      'network_hash',
      `submit network_hash ${net}`
    );
  }

  // 5. A valid observation: the row, the answer.
  const r1 = submit(s1, good());
  assert.deepEqual(Object.keys(r1).sort(), ['id', 'received_at', 'status']);
  assert.equal(r1.status, 'quarantined');
  assert.equal(typeof r1.id, 'number');
  assert.equal(
    sql(`SELECT submitter_id || '|' || marketplace || '|' || price_vnd || '|' || list_price_vnd
           || '|' || coalesce(sku_id, '-') || '|' || status || '|' || network_hash || '|'
           || (received_at = ${q(r1.received_at)}::timestamptz) || '|' || extractor::text
         FROM rate.extension_observations WHERE id = ${r1.id}`),
    `${s1}|shopee|10990000|12990000|-|quarantined|${NET_A}|true|{"source": "json_ld", "extension_version": "0.2.0"}`
  );
  assert.equal(
    submit(sAuth, good(), NET_A, 'authenticated').status,
    'quarantined'
  );
  assert.equal(submit(s1, good(), NET_A, 'service_role').status, 'quarantined');

  // 6. Each payload against the shared validator: the same verdict and the same field. The RPC
  // writes the valid ones and nothing for the others.
  const now = Date.now();
  const emoji = ch(0x1f600);
  const valid = [
    {},
    {
      marketplace: 'lazada',
      listing_url: 'https://www.lazada.vn/products/x-i1.html',
    },
    { marketplace: 'lazada', listing_url: 'https://lazada.vn/products/x' },
    { marketplace: 'lazada', listing_url: 'https://a.b-c.lazada.vn/x' },
    { marketplace: 'tiki', listing_url: 'https://tiki.vn/x-p1.html' },
    {
      marketplace: 'tiktok',
      listing_url: 'https://www.tiktok.com/view/product/1',
    },
    {
      marketplace: 'tiktok',
      listing_url: 'https://shop.tiktok.com/view/product/1',
    },
    {
      marketplace: 'cellphones',
      listing_url: 'https://cellphones.com.vn/x.html',
    },
    {
      marketplace: 'tgdd',
      listing_url: 'https://www.thegioididong.com/dtdd/x',
    },
    { marketplace: 'tgdd', listing_url: 'https://thegioididong.com/dtdd/x' },
    {
      marketplace: 'fptshop',
      listing_url: 'https://fptshop.com.vn/dien-thoai/x',
    },
    { marketplace: 'hoangha', listing_url: 'https://hoanghamobile.com/x' },
    { marketplace: 'didongviet', listing_url: 'https://didongviet.vn/x.html' },
    { marketplace: 'phongvu', listing_url: 'https://phongvu.vn/x' },
    { listing_url: 'https://shopee.vn' },
    {
      listing_url: `https://shopee.vn/${'a'.repeat(2048 - 'https://shopee.vn/'.length)}`,
    },
    {
      listing_url: `https://shopee.vn/${emoji.repeat(2048 - 'https://shopee.vn/'.length)}`,
    },
    { listing_url: `https://shopee.vn/${ch(0x200b)}x` },
    { external_shop_id: null, variant_label: null, list_price_vnd: null },
    {
      price_vnd: 1000,
      list_price_vnd: 1000,
      stock_qty: 0,
      stock_state: 'low_stock',
    },
    { price_vnd: 2000000000, list_price_vnd: 2000000000, stock_qty: 1000000 },
    { price_vnd: 1000.0, schema_version: 1.0 },
    {
      external_item_id: 'A'.repeat(64),
      sku_id: 'sku_1.2-3',
      variant_label: 'x'.repeat(120),
    },
    { variant_label: emoji.repeat(120) },
    { variant_label: `Mau ${ch(0x111)}en ${ch(0x200b)}` },
    {
      observed_at: iso(now - 23 * HOUR - 59 * MIN),
      stock_state: 'out_of_stock',
    },
    { observed_at: iso(now + 9 * MIN + 30_000), stock_state: 'unknown' },
    { observed_at: iso(now - HOUR, { off: 420 }) },
    { observed_at: iso(now - HOUR, { off: 420, sep: '' }) },
    { observed_at: iso(now - HOUR, { off: 420, sep: null }) },
    { observed_at: iso(now - HOUR, { off: -300 }) },
    { observed_at: iso(now - HOUR, { off: 345 }) },
    { observed_at: iso(now - HOUR, { sec: false }) },
    { observed_at: iso(now - HOUR, { frac: '.123456789' }) },
    { observed_at: iso(now - HOUR, { frac: '.5' }) },
    { extractor: { source: 'mixed', extension_version: '1.0.0-beta+2' } },
    { extractor: { source: 'dom', extension_version: 'v'.repeat(20) } },
  ].map((over) => ['ok', good(over)]);
  const hourAgo = iso(now - HOUR);
  const bad = [
    ['observation', []],
    ['observation', 'x'],
    ['observation', null],
    ['observation', 5],
    ['observation', { ...good(), rating: 5 }],
    ['observation', { ...good(), cookies: 'a=b' }],
    ['observation', { ...good(), ["x'; DROP TABLE x; --"]: 1 }],
    ['observation', { ...without('schema_version'), referrer: 'https://x' }],
    ['schema_version', good({ schema_version: 2 })],
    ['schema_version', good({ schema_version: '1' })],
    ['schema_version', good({ schema_version: null })],
    ['marketplace', good({ marketplace: 'amazon' })],
    ['marketplace', good({ marketplace: 'Shopee' })],
    ['marketplace', good({ marketplace: 'thegioididong' })],
    ['marketplace', good({ marketplace: 'hoanghamobile' })],
    ['marketplace', good({ marketplace: null })],
    ['listing_url', good({ listing_url: 'http://shopee.vn/x' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x?sp_atk=1' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x#reviews' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x;jsessionid=1' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn;x' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x y' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x\ny' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x\ty' })],
    ...[
      0xa0, 0x85, 0x1680, 0x2000, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f,
      0x3000, 0xfeff,
    ].map((c) => [
      'listing_url',
      good({ listing_url: `https://shopee.vn/x${ch(c)}y` }),
    ]),
    ['listing_url', good({ listing_url: 'https://Shopee.vn/x' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn:443/x' })],
    ['listing_url', good({ listing_url: 'https://user@shopee.vn/x' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn./x' })],
    ['listing_url', good({ listing_url: 'https:///shopee.vn/x' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn.evil.com/x' })],
    ['listing_url', good({ listing_url: 'https://evil.com/shopee.vn' })],
    ['listing_url', good({ listing_url: 'https://www.shopee.vn/x' })],
    ['listing_url', good({ listing_url: 'https://lazada.vn/x' })],
    [
      'listing_url',
      good({ marketplace: 'lazada', listing_url: 'https://xlazada.vn/x' }),
    ],
    [
      'listing_url',
      good({ marketplace: 'tiktok', listing_url: 'https://tiktok.com/x' }),
    ],
    [
      'listing_url',
      good({ marketplace: 'tiktok', listing_url: 'https://m.tiktok.com/x' }),
    ],
    [
      'listing_url',
      good({ listing_url: `https://shopee.vn/${'a'.repeat(2031)}` }),
    ],
    [
      'listing_url',
      good({ listing_url: `https://shopee.vn/${emoji.repeat(2031)}` }),
    ],
    ['listing_url', good({ listing_url: 'https://shopee.vn\\@evil.com/x' })],
    ['listing_url', good({ listing_url: 5 })],
    ['listing_url', good({ listing_url: null })],
    ['external_item_id', good({ external_item_id: '' })],
    ['external_item_id', good({ external_item_id: 'a'.repeat(65) })],
    ['external_item_id', good({ external_item_id: 'a b' })],
    ['external_item_id', good({ external_item_id: 'a/b' })],
    ['external_item_id', good({ external_item_id: 'a\n' })],
    ['external_item_id', good({ external_item_id: 123 })],
    ['external_shop_id', good({ external_shop_id: '' })],
    ['external_shop_id', good({ external_shop_id: 'x y' })],
    ['external_shop_id', good({ external_shop_id: 5 })],
    ['sku_id', good({ sku_id: 'a'.repeat(65) })],
    ['sku_id', good({ sku_id: ch(0xe1) })],
    ['variant_label', good({ variant_label: '' })],
    ['variant_label', good({ variant_label: 'x'.repeat(121) })],
    ['variant_label', good({ variant_label: emoji.repeat(121) })],
    ['variant_label', good({ variant_label: 'a\nb' })],
    ['variant_label', good({ variant_label: `a${ch(0x85)}b` })],
    ['variant_label', good({ variant_label: `a${ch(0x7f)}b` })],
    ['variant_label', good({ variant_label: 5 })],
    ['price_vnd', good({ price_vnd: 999 })],
    ['price_vnd', good({ price_vnd: 2000000001 })],
    ['price_vnd', good({ price_vnd: 1000.5 })],
    ['price_vnd', good({ price_vnd: '10990000' })],
    ['price_vnd', good({ price_vnd: null })],
    ['list_price_vnd', good({ list_price_vnd: 10989999 })],
    ['list_price_vnd', good({ list_price_vnd: 2000000001 })],
    ['list_price_vnd', good({ list_price_vnd: 11000000.5 })],
    ['list_price_vnd', good({ list_price_vnd: '12990000' })],
    ['stock_state', good({ stock_state: 'sold_out' })],
    ['stock_state', good({ stock_state: null })],
    ['stock_qty', good({ stock_qty: -1 })],
    ['stock_qty', good({ stock_qty: 1000001 })],
    ['stock_qty', good({ stock_qty: 1.5 })],
    ['stock_qty', good({ stock_qty: '3' })],
    ['observed_at', good({ observed_at: iso(now - 24 * HOUR - 60_000) })],
    ['observed_at', good({ observed_at: iso(now + 10 * MIN + 60_000) })],
    ['observed_at', good({ observed_at: 'yesterday' })],
    ['observed_at', good({ observed_at: 'now' })],
    ['observed_at', good({ observed_at: '2026-13-01T00:00:00Z' })],
    ['observed_at', good({ observed_at: hourAgo.slice(0, 19) })],
    ['observed_at', good({ observed_at: hourAgo.replace('T', ' ') })],
    ['observed_at', good({ observed_at: hourAgo.replace('Z', 'z') })],
    ['observed_at', good({ observed_at: hourAgo.replace(/:\d\dZ$/, ':61Z') })],
    ['observed_at', good({ observed_at: hourAgo.replace(/T\d\d/, 'T25') })],
    ['observed_at', good({ observed_at: hourAgo.replace('Z', '+24:00') })],
    [
      'observed_at',
      good({ observed_at: `${hourAgo.slice(0, 19)}.1234567890Z` }),
    ],
    ['observed_at', good({ observed_at: now })],
    ['observed_at', good({ observed_at: null })],
    ['extractor', good({ extractor: 'dom' })],
    ['extractor', good({ extractor: null })],
    ['extractor', good({ extractor: [] })],
    [
      'extractor',
      good({ extractor: { source: 'dom', extension_version: '1', x: 1 } }),
    ],
    [
      'extractor.source',
      good({ extractor: { source: 'ai', extension_version: '1' } }),
    ],
    ['extractor.source', good({ extractor: { extension_version: '1' } })],
    ['extractor.extension_version', good({ extractor: { source: 'dom' } })],
    [
      'extractor.extension_version',
      good({ extractor: { source: 'dom', extension_version: '' } }),
    ],
    [
      'extractor.extension_version',
      good({ extractor: { source: 'dom', extension_version: 'v'.repeat(21) } }),
    ],
    [
      'extractor.extension_version',
      good({ extractor: { source: 'dom', extension_version: 'v 1' } }),
    ],
    [
      'extractor.extension_version',
      good({ extractor: { source: 'dom', extension_version: 1 } }),
    ],
    // Every key must be present, a nullable one as null; each is named by its own check.
    ...Object.keys(good()).map((key) => [key, without(key)]),
  ];
  // The RPC's verdict: 'ok', or the field of its 22023.
  const sParity = register();
  const rpcVerdict = (obs) => {
    try {
      submit(sParity, obs);
      return 'ok';
    } catch (err) {
      const m = /ERROR:\s+(\w+):[\s\S]*?DETAIL:\s+(\S+)\r?\n/.exec(err.message);
      assert.ok(m, err.message);
      assert.equal(m[1], '22023', err.message);
      return m[2];
    }
  };
  const before = count();
  const disagree = [];
  for (const [expected, obs] of [...valid, ...bad]) {
    const ts = parse(obs, Date.now());
    const tsVerdict = ts.ok ? 'ok' : ts.field;
    const db = rpcVerdict(obs);
    const what = JSON.stringify(obs).slice(0, 160);
    if (tsVerdict !== db)
      disagree.push(`${what}: shared-data ${tsVerdict}, RPC ${db}`);
    assert.equal(db, expected, `RPC on ${what}`);
  }
  assert.deepEqual(
    disagree,
    [],
    'the RPC and parseExtensionObservationV1 agree'
  );
  assert.equal(
    count() - before,
    valid.length,
    'only the valid payloads are written'
  );
  // Where they differ on purpose: the 16 KB cap is the RPC's alone (the web caps the body).
  const big = good({ variant_label: 'x'.repeat(17000) });
  assert.equal(parse(big, Date.now()).field, 'variant_label');
  assert.equal(rpcVerdict(big), 'observation');
  // A lone surrogate: shared-data names the field; jsonb refuses the text itself.
  const lone = good({
    listing_url: `https://shopee.vn/x${String.fromCharCode(0xd800)}`,
  });
  assert.equal(parse(lone, Date.now()).field, 'listing_url');
  refused(
    'anon',
    submitSql(sParity, lone),
    '22P02',
    undefined,
    'jsonb refuses a lone surrogate'
  );
  // A SQL NULL payload, an unknown submitter and a null one.
  refused(
    'anon',
    submitSql(s1, undefined),
    '22023',
    'observation',
    'a NULL payload'
  );
  refused(
    'anon',
    submitSql(UNKNOWN, good()),
    'P0002',
    'submitter_id',
    'unknown submitter'
  );
  refused(
    'anon',
    submitSql(null, good()),
    'P0002',
    'submitter_id',
    'null submitter'
  );
  assert.equal(count() - before, valid.length, 'refused calls write nothing');

  // 7. The limits at their exact thresholds (54000).
  // 120 an hour per submitter: 119 in the hour and 50 older, then the 120th passes.
  const sLimit = register();
  backfill(sLimit, 119, '30 minutes');
  backfill(sLimit, 50, '61 minutes');
  submit(sLimit, good());
  refused(
    'anon',
    submitSql(sLimit, good()),
    '54000',
    'submitter_id',
    '121st in an hour'
  );
  assert.equal(count(`submitter_id = ${q(sLimit)}`), 170);
  // 600 an hour per network: 599 in the hour and 100 older, then the 600th passes.
  const NET_C = freshNet();
  const sBulk = register();
  backfill(sBulk, 599, '30 minutes', NET_C);
  backfill(sBulk, 100, '61 minutes', NET_C);
  const sNet = register();
  assert.equal(
    submit(sNet, good(), NET_C).status,
    'quarantined',
    '600th from a network'
  );
  refused(
    'anon',
    submitSql(sNet, good(), NET_C),
    '54000',
    'network_hash',
    '601st from a network'
  );
  assert.equal(
    submit(sNet, good(), NET_A).status,
    'quarantined',
    'another network passes'
  );
  // 20 registers an hour per network: 19 in the hour and 5 older, then the 20th passes.
  const NET_D = freshNet();
  sql(`INSERT INTO rate.extension_submitters (created_at, network_hash)
       SELECT now() - interval '30 minutes', ${q(NET_D)} FROM generate_series(1, 19);
       INSERT INTO rate.extension_submitters (created_at, network_hash)
       SELECT now() - interval '61 minutes', ${q(NET_D)} FROM generate_series(1, 5)`);
  assert.match(
    register(NET_D),
    /^[0-9a-f-]{36}$/,
    '20th register from a network'
  );
  refused(
    'anon',
    registerSql(NET_D),
    '54000',
    'network_hash',
    '21st register from a network'
  );
  // 600 registers a minute in all: fill to 599, then the 600th passes and the 601st is refused.
  // The test's own registers age out of the minute as it runs, so they are moved out first.
  sql(`UPDATE rate.extension_submitters SET created_at = now() - interval '2 minutes'
       WHERE created_at > now() - interval '2 minutes';
       INSERT INTO rate.extension_submitters (created_at)
       SELECT now() - interval '20 seconds' FROM generate_series(1, 599)`);
  assert.match(register(), /^[0-9a-f-]{36}$/, '600th register in a minute');
  refused(
    'anon',
    registerSql(freshNet()),
    '54000',
    'submitter',
    '601st register in a minute'
  );
  sql(`UPDATE rate.extension_submitters SET created_at = now() - interval '2 minutes'
       WHERE created_at > now() - interval '1 minute'`);
  assert.match(register(), /^[0-9a-f-]{36}$/, 'the brake lifts after a minute');

  // 8. Delete: no key; the submitter and its observations; the count; 0 for an unknown or null id.
  const sDel = register();
  for (let i = 0; i < 3; i += 1) submit(sDel, good());
  assert.equal(
    as('anon', `SELECT rate.delete_extension_submitter(${q(sDel)})`),
    '3'
  );
  assert.equal(count(`submitter_id = ${q(sDel)}`), 0);
  assert.equal(count(`id = ${q(sDel)}`, 'rate.extension_submitters'), 0);
  assert.equal(
    as('anon', `SELECT rate.delete_extension_submitter(${q(sDel)})`),
    '0'
  );
  assert.equal(
    as('anon', `SELECT rate.delete_extension_submitter(${q(UNKNOWN)})`),
    '0'
  );
  assert.equal(
    as('authenticated', 'SELECT rate.delete_extension_submitter(NULL)'),
    '0'
  );
  const sEmpty = register();
  assert.equal(
    as('authenticated', `SELECT rate.delete_extension_submitter(${q(sEmpty)})`),
    '0'
  );
  assert.equal(count(`id = ${q(sEmpty)}`, 'rate.extension_submitters'), 0);
  refused(
    'anon',
    submitSql(sDel, good()),
    'P0002',
    'submitter_id',
    'a deleted submitter'
  );
  const sCascade = register();
  submit(sCascade, good());
  sql(`DELETE FROM rate.extension_submitters WHERE id = ${q(sCascade)}`);
  assert.equal(
    count(`submitter_id = ${q(sCascade)}`),
    0,
    'the cascade holds for service_role'
  );

  // 9. Purge: hashes after 28 days (observations and submitters), rows after 180, submitters
  // without observations after 7.
  const [p1, p2, p3, p4, p5, p6] = Array.from({ length: 6 }, () => register());
  const age = (ids, days) =>
    sql(`UPDATE rate.extension_submitters SET created_at = now() - interval '${days} days'
         WHERE id IN (${ids.map(q).join(', ')})`);
  age([p1, p2, p3], 200);
  age([p4], 10);
  age([p5], 3);
  age([p6], 30);
  backfill(p1, 1, '200 days', NET_A);
  backfill(p1, 1, '30 days', NET_A);
  backfill(p1, 1, '10 days', NET_A);
  backfill(p3, 1, '190 days');
  backfill(p6, 1, '1 day', NET_A);
  const total = count();
  for (const role of ['anon', 'authenticated', 'rate_worker'])
    refused(
      role,
      'SELECT rate.purge_extension_observations()',
      '42501',
      undefined,
      `${role} purge`
    );
  refused(
    'service_role',
    'SELECT rate.purge_extension_observations(0)',
    '22023',
    'p_network_hash_days',
    'purge hash days'
  );
  refused(
    'service_role',
    'SELECT rate.purge_extension_observations(28, NULL)',
    '22023',
    'p_keep_days',
    'purge keep days'
  );
  refused(
    'service_role',
    'SELECT rate.purge_extension_observations(28, 180, 0)',
    '22023',
    'p_empty_submitter_days',
    'purge empty days'
  );
  assert.deepEqual(
    JSON.parse(
      as('service_role', 'SELECT rate.purge_extension_observations()::text')
    ),
    {
      network_hashes_cleared: 2,
      submitter_network_hashes_cleared: 4,
      observations_deleted: 2,
      submitters_deleted: 3,
    }
  );
  assert.equal(count(), total - 2);
  assert.equal(
    sql(`SELECT string_agg(to_char(now() - received_at, 'DD') || ':' || (network_hash IS NOT NULL),
           ',' ORDER BY received_at) FROM rate.extension_observations WHERE submitter_id = ${q(p1)}`),
    '30:false,10:true'
  );
  assert.equal(
    sql(`SELECT string_agg(left(id::text, 8) || ':' || (network_hash IS NOT NULL), ','
           ORDER BY created_at) FROM rate.extension_submitters
         WHERE id IN (${[p1, p2, p3, p4, p5, p6].map(q).join(', ')})`),
    `${p1.slice(0, 8)}:false,${p6.slice(0, 8)}:false,${p5.slice(0, 8)}:true`,
    'p2 (never sent), p3 (emptied) and p4 (empty for 10 days) go; p1 and p6 keep rows, p5 is young'
  );
  assert.deepEqual(
    JSON.parse(
      as('service_role', 'SELECT rate.purge_extension_observations()::text')
    ),
    {
      network_hashes_cleared: 0,
      submitter_network_hashes_cleared: 0,
      observations_deleted: 0,
      submitters_deleted: 0,
    },
    'a second purge finds nothing'
  );
  // The race: a submit for an empty, purgeable submitter is still open when the purge runs. The
  // purge skips the submitter it holds; the observation and its submitter stay.
  const p7 = register();
  age([p7], 10);
  const racing = spawn(
    'docker',
    [
      'exec',
      '-i',
      container,
      'psql',
      '-XqAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  let racingOut = '';
  racing.stdout.on('data', (d) => (racingOut += d));
  racing.stderr.on('data', (d) => (racingOut += d));
  const racingDone = new Promise((resolve) => racing.on('close', resolve));
  racing.stdin.end(`BEGIN; SET LOCAL ROLE anon;
    SELECT 'submitted:' || (${submitSql(p7, good()).slice(7)} IS NOT NULL);
    SELECT pg_sleep(3); COMMIT;`);
  const deadline = Date.now() + 10_000;
  while (
    count(`submitter_id = ${q(p7)}`) === 0 &&
    sql(`SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
         WHERE c.relname = 'extension_submitters' AND l.mode = 'RowShareLock'
           AND l.pid <> pg_backend_pid()`) === '0'
  ) {
    assert.ok(Date.now() < deadline, 'the racing submit started');
    spawnSync('docker', ['exec', container, 'true']);
  }
  const raced = JSON.parse(
    as('service_role', 'SELECT rate.purge_extension_observations()::text')
  );
  assert.equal(await racingDone, 0, racingOut);
  assert.match(racingOut, /submitted:true/);
  assert.equal(
    raced.submitters_deleted,
    0,
    'the purge skipped the held submitter'
  );
  assert.equal(
    count(`id = ${q(p7)}`, 'rate.extension_submitters'),
    1,
    'p7 stays'
  );
  assert.equal(count(`submitter_id = ${q(p7)}`), 1, 'its observation stays');

  // 10. The tables: anon and authenticated reach nothing; rate_worker reads and sets status only
  // and has nothing on the key; service_role writes directly within the CHECKs.
  const tables = [
    'rate.extension_ingest_secret',
    'rate.extension_submitters',
    'rate.extension_observations',
  ];
  for (const role of ['anon', 'authenticated']) {
    for (const table of tables) {
      refused(
        role,
        `SELECT count(*) FROM ${table}`,
        '42501',
        undefined,
        `${role} select ${table}`
      );
      refused(
        role,
        `DELETE FROM ${table}`,
        '42501',
        undefined,
        `${role} delete ${table}`
      );
      refused(
        role,
        `TRUNCATE ${table} CASCADE`,
        '42501',
        undefined,
        `${role} truncate ${table}`
      );
    }
    refused(
      role,
      `UPDATE rate.extension_submitters SET created_at = now()`,
      '42501',
      undefined,
      `${role} update submitters`
    );
    refused(
      role,
      `UPDATE rate.extension_observations SET status = 'rejected'`,
      '42501',
      undefined,
      `${role} update observations`
    );
    refused(
      role,
      `UPDATE rate.extension_ingest_secret SET updated_at = now()`,
      '42501',
      undefined,
      `${role} update the key`
    );
    refused(
      role,
      'INSERT INTO rate.extension_submitters DEFAULT VALUES',
      '42501',
      undefined,
      `${role} insert submitter`
    );
    refused(
      role,
      `INSERT INTO rate.extension_ingest_secret (key_sha256) VALUES (${q(sha('x'))})`,
      '42501',
      undefined,
      `${role} insert key`
    );
    refused(
      role,
      `INSERT INTO rate.extension_observations (submitter_id, schema_version,
        marketplace, listing_url, external_item_id, price_vnd, stock_state, observed_at, extractor)
      VALUES (${q(s1)}, 1, 'shopee', 'https://shopee.vn/x', 'x', 1000, 'unknown', now(),
        '{"source": "dom", "extension_version": "1"}')`,
      '42501',
      undefined,
      `${role} insert observation`
    );
  }
  refused(
    'rate_worker',
    'SELECT count(*) FROM rate.extension_ingest_secret',
    '42501',
    undefined,
    'rate_worker reads no key'
  );
  assert.ok(
    Number(
      as('rate_worker', 'SELECT count(*) FROM rate.extension_observations')
    ) > 0
  );
  assert.ok(
    Number(
      as('rate_worker', 'SELECT count(*) FROM rate.extension_submitters')
    ) > 0
  );
  assert.equal(
    as(
      'rate_worker',
      `UPDATE rate.extension_observations SET status = 'corroborated'
                       WHERE id = ${r1.id} RETURNING status`
    ),
    'corroborated'
  );
  refused(
    'rate_worker',
    `UPDATE rate.extension_observations SET status = 'promoted'
                          WHERE id = ${r1.id}`,
    '23514',
    undefined,
    'status is checked'
  );
  refused(
    'rate_worker',
    `UPDATE rate.extension_observations SET price_vnd = 1000
                          WHERE id = ${r1.id}`,
    '42501',
    undefined,
    'rate_worker price'
  );
  refused(
    'rate_worker',
    `UPDATE rate.extension_observations SET network_hash = NULL
                          WHERE id = ${r1.id}`,
    '42501',
    undefined,
    'rate_worker hash'
  );
  refused(
    'rate_worker',
    `UPDATE rate.extension_submitters SET created_at = now()`,
    '42501',
    undefined,
    'rate_worker submitter'
  );
  refused(
    'rate_worker',
    `DELETE FROM rate.extension_observations WHERE id = ${r1.id}`,
    '42501',
    undefined,
    'rate_worker delete'
  );
  refused(
    'rate_worker',
    'INSERT INTO rate.extension_submitters DEFAULT VALUES',
    '42501',
    undefined,
    'rate_worker insert'
  );
  const direct = `INSERT INTO rate.extension_observations (submitter_id, schema_version,
      marketplace, listing_url, external_item_id, price_vnd, stock_state, observed_at, extractor)
    VALUES (${q(s1)}, 1, 'shopee', URL, 'x', 1000, 'unknown', now(),
      '{"source": "dom", "extension_version": "1"}') RETURNING status`;
  assert.equal(
    as('service_role', direct.replace('URL', q('https://shopee.vn/x'))),
    'quarantined',
    'service_role inserts directly'
  );
  for (const url of [
    'https://lazada.vn/x',
    'https://shopee.vn/x;a=1',
    `https://shopee.vn/x${ch(0xa0)}`,
  ])
    refused(
      'service_role',
      direct.replace('URL', q(url)),
      '23514',
      undefined,
      `the URL CHECK holds service_role: ${url}`
    );
  refused(
    'service_role',
    `INSERT INTO rate.extension_submitters (network_hash) VALUES ('x')`,
    '23514',
    undefined,
    'the submitter hash CHECK'
  );
  checkAll('after the exercise');

  // 11. The rollback twice; everything goes; the proposal again needs the key row again.
  sql(rollback);
  sql(rollback);
  assert.equal(
    sql(`SELECT count(*) FROM pg_class WHERE relnamespace = 'rate'::regnamespace
         AND relname LIKE 'extension\\_%'`),
    '0'
  );
  assert.equal(
    sql(`SELECT count(*) FROM pg_proc WHERE pronamespace = 'rate'::regnamespace
         AND proname IN ('register_extension_submitter', 'submit_extension_observation',
           'delete_extension_submitter', 'purge_extension_observations')`),
    '0'
  );
  sql(proposal);
  assert.equal(sql(check('V12')), '1', 'V12 sees the missing key row');
  refused(
    'anon',
    registerSql(NET_A),
    '42501',
    'ingest_key',
    'no key row after a re-apply'
  );
  sql(
    `INSERT INTO rate.extension_ingest_secret (key_sha256) VALUES (${q(sha(KEY))})`
  );
  checkAll('after the rollback and a re-apply');
  const again = register();
  assert.equal(submit(again, good()).status, 'quarantined');
  sql(proposal);
  checkAll('after a re-apply over data');
  assert.equal(count(), 1, 'a re-apply keeps rows');
  assert.equal(
    count('true', 'rate.extension_ingest_secret'),
    1,
    'a re-apply keeps the key'
  );

  console.log(
    `extension observations proposal: ${valid.length} valid and ${bad.length} refused payloads agree with parseExtensionObservationV1; ingest key, exact limits, delete, purge and its race, grants, verify and rollback replayed`
  );
} finally {
  removeContainer();
}
