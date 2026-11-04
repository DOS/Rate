#!/usr/bin/env node
// Replays the DOS-Me extension observations PROPOSAL (DOS/Rate#1606, M2 of
// Docs/Proposals/2026-10-28-extension-data-source.md) on the migration replay stack: the proposal
// twice, every verification query, a valid observation for each marketplace, every refusal with
// its SQLSTATE and DETAIL, the unknown submitter, the 120 and 600 an hour limits and the register
// brake, the delete cascade, the purge, the table grants (anon, authenticated, rate_worker,
// service_role), the rollback twice and the proposal again. Nothing touches a real database.
//
// Usage: node scripts/test-extension-observations-proposal.mjs (needs Docker)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { repoRoot, startRateDb } from './lib/rate-db.mjs';

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
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8'],
  'the verification lists its expect-0 queries'
);

const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value))}::jsonb`;
const hash = (text) => createHash('sha256').update(text).digest('hex');
const NET_A = hash('net-a');
const NET_B = hash('net-b');
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

const SUBMIT = 'rate.submit_extension_observation';
const good = (over = {}) => ({
  schema_version: 1,
  marketplace: 'shopee',
  listing_url: 'https://shopee.vn/product/123456/7890123',
  external_item_id: '7890123',
  external_shop_id: '123456',
  sku_id: null,
  variant_label: 'Đen, 128GB',
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
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

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
  const register = (role = 'anon') =>
    as(role, 'SELECT rate.register_extension_submitter()');
  const submitSql = (id, obs, net = null) =>
    `SELECT ${SUBMIT}(${id === null ? 'NULL' : q(id)}, ${
      typeof obs === 'string' ? obs : j(obs)
    }, ${net === null ? 'NULL' : q(net)})::text`;
  const submit = (id, obs, net = null, role = 'anon') =>
    JSON.parse(as(role, submitSql(id, obs, net)));
  const count = (where = 'true') =>
    Number(
      sql(`SELECT count(*) FROM rate.extension_observations WHERE ${where}`)
    );
  // Rows written straight as postgres, received (and observed) `age` ago.
  const backfill = (id, n, age, net = null) =>
    sql(`INSERT INTO rate.extension_observations (submitter_id, schema_version, marketplace,
           listing_url, external_item_id, price_vnd, stock_state, observed_at, extractor,
           received_at, network_hash)
         SELECT ${q(id)}, 1, 'shopee', 'https://shopee.vn/p', 'i' || g, 100000, 'unknown',
           now() - ${q(age)}::interval, '{"source": "dom", "extension_version": "1"}',
           now() - ${q(age)}::interval, ${net === null ? 'NULL' : q(net)}
         FROM generate_series(1, ${n}) g`);

  // 1. The proposal twice, then every check.
  sql(proposal);
  sql(proposal);
  checkAll('after the apply');
  sql(verify);

  // A check fails when its rule breaks: a grant to anon shows in V2, then goes.
  sql('GRANT SELECT ON rate.extension_observations TO anon');
  assert.notEqual(sql(checks[1].query), '0', 'V2 sees a grant to anon');
  sql('REVOKE SELECT ON rate.extension_observations FROM anon');

  // 2. Register: anon and authenticated; rate_worker cannot.
  const s1 = register();
  assert.match(s1, /^[0-9a-f-]{36}$/);
  const sAuth = register('authenticated');
  assert.notEqual(s1, sAuth);
  refused(
    'rate_worker',
    'SELECT rate.register_extension_submitter()',
    '42501',
    undefined,
    'rate_worker cannot register'
  );

  // 3. A valid observation: the row, the answer.
  const r1 = submit(s1, good(), NET_A);
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
  // Each marketplace's hosts, the nullable keys null, and the edges that pass.
  const valid = [
    {
      marketplace: 'lazada',
      listing_url: 'https://www.lazada.vn/products/x-i1.html',
    },
    { marketplace: 'lazada', listing_url: 'https://lazada.vn/products/x' },
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
    {
      listing_url: `https://shopee.vn/${'a'.repeat(2048 - 'https://shopee.vn/'.length)}`,
    },
    { external_shop_id: null, variant_label: null, list_price_vnd: null },
    {
      price_vnd: 1000,
      list_price_vnd: 1000,
      stock_qty: 0,
      stock_state: 'low_stock',
    },
    { price_vnd: 2000000000, list_price_vnd: 2000000000, stock_qty: 1000000 },
    {
      external_item_id: 'A'.repeat(64),
      sku_id: 'sku_1.2-3',
      variant_label: 'x'.repeat(120),
    },
    { observed_at: ago(23 * HOUR), stock_state: 'out_of_stock' },
    { observed_at: ago(-9 * MIN), stock_state: 'unknown' },
    {
      observed_at: '2026-11-04T10:00:00+07:00'.replace(
        '2026-11-04T10:00:00',
        ago(HOUR).slice(0, 19)
      ),
    },
    { extractor: { source: 'mixed', extension_version: '1.0.0-beta+2' } },
    { extractor: { source: 'dom', extension_version: 'v'.repeat(20) } },
  ];
  for (const over of valid) {
    const r = submit(s1, good(over));
    assert.equal(r.status, 'quarantined', JSON.stringify(over));
  }
  assert.equal(
    submit(sAuth, good(), null, 'authenticated').status,
    'quarantined'
  );
  assert.equal(submit(s1, good(), null, 'service_role').status, 'quarantined');

  // 4. Every refusal: 22023 with the field in DETAIL, and nothing written.
  const before = count();
  const bad = [
    ['observation', "'[]'::jsonb"],
    ['observation', '\'"x"\'::jsonb'],
    ['observation', 'NULL::jsonb'],
    ['observation', good({ variant_label: 'x'.repeat(17000) })],
    ['rating', { ...good(), rating: 5 }],
    ['cookies', { ...good(), cookies: 'a=b' }],
    ['schema_version', good({ schema_version: 2 })],
    ['schema_version', good({ schema_version: '1' })],
    ['schema_version', without('schema_version')],
    ['marketplace', good({ marketplace: 'amazon' })],
    ['marketplace', good({ marketplace: 'Shopee' })],
    ['marketplace', without('marketplace')],
    ['listing_url', good({ listing_url: 'http://shopee.vn/x' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x?sp_atk=1' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x#reviews' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x y' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn/x\ny' })],
    ['listing_url', good({ listing_url: 'https://Shopee.vn/x' })],
    ['listing_url', good({ listing_url: 'https://shopee.vn:443/x' })],
    ['listing_url', good({ listing_url: 'https://user@shopee.vn/x' })],
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
      good({ listing_url: `https://shopee.vn/${'a'.repeat(2048)}` }),
    ],
    ['listing_url', good({ listing_url: 'https://shopee.vn\\@evil.com/x' })],
    ['listing_url', good({ listing_url: 5 })],
    ['listing_url', without('listing_url')],
    ['external_item_id', good({ external_item_id: '' })],
    ['external_item_id', good({ external_item_id: 'a'.repeat(65) })],
    ['external_item_id', good({ external_item_id: 'a b' })],
    ['external_item_id', good({ external_item_id: 'a/b' })],
    ['external_item_id', good({ external_item_id: 'a\n' })],
    ['external_item_id', good({ external_item_id: 123 })],
    ['external_item_id', without('external_item_id')],
    ['external_shop_id', good({ external_shop_id: '' })],
    ['external_shop_id', good({ external_shop_id: 'x y' })],
    ['external_shop_id', good({ external_shop_id: 5 })],
    ['sku_id', good({ sku_id: 'a'.repeat(65) })],
    ['sku_id', good({ sku_id: 'á' })],
    ['variant_label', good({ variant_label: '' })],
    ['variant_label', good({ variant_label: 'x'.repeat(121) })],
    ['variant_label', good({ variant_label: 'a\nb' })],
    ['variant_label', good({ variant_label: 'a\u0085b' })],
    ['variant_label', good({ variant_label: 5 })],
    ['price_vnd', good({ price_vnd: 999 })],
    ['price_vnd', good({ price_vnd: 2000000001 })],
    ['price_vnd', good({ price_vnd: 1000.5 })],
    ['price_vnd', good({ price_vnd: '10990000' })],
    ['price_vnd', good({ price_vnd: null })],
    ['price_vnd', without('price_vnd')],
    ['list_price_vnd', good({ list_price_vnd: 10989999 })],
    ['list_price_vnd', good({ list_price_vnd: 2000000001 })],
    ['list_price_vnd', good({ list_price_vnd: 11000000.5 })],
    ['list_price_vnd', good({ list_price_vnd: '12990000' })],
    ['stock_state', good({ stock_state: 'sold_out' })],
    ['stock_state', good({ stock_state: null })],
    ['stock_state', without('stock_state')],
    ['stock_qty', good({ stock_qty: -1 })],
    ['stock_qty', good({ stock_qty: 1000001 })],
    ['stock_qty', good({ stock_qty: 1.5 })],
    ['stock_qty', good({ stock_qty: '3' })],
    ['observed_at', good({ observed_at: ago(25 * HOUR) })],
    ['observed_at', good({ observed_at: ago(-11 * MIN) })],
    ['observed_at', good({ observed_at: 'yesterday' })],
    ['observed_at', good({ observed_at: 'now' })],
    ['observed_at', good({ observed_at: '2026-13-01T00:00:00Z' })],
    ['observed_at', good({ observed_at: ago(HOUR).slice(0, 19) })],
    ['observed_at', good({ observed_at: Date.now() })],
    ['observed_at', without('observed_at')],
    ['extractor', without('extractor')],
    ['extractor', good({ extractor: 'dom' })],
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
  ];
  // Every key must be present, a nullable one as null; a missing one is named.
  for (const key of Object.keys(good())) bad.push([key, without(key)]);
  bad.push(['marketplace', good({ marketplace: 'thegioididong' })]);
  bad.push(['marketplace', good({ marketplace: 'hoanghamobile' })]);
  for (const [field, obs] of bad)
    refused(
      'anon',
      submitSql(s1, obs),
      '22023',
      field,
      `${field}: ${JSON.stringify(obs).slice(0, 120)}`
    );
  for (const net of [
    'abc',
    NET_A.toUpperCase(),
    NET_A.slice(1),
    `${NET_A}0`,
    '',
  ])
    refused(
      'anon',
      submitSql(s1, good(), net),
      '22023',
      'network_hash',
      `network_hash ${net}`
    );
  // An unknown submitter, and a null one.
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
  assert.equal(count(), before, 'refused calls write nothing');

  // 5. The limits: 120 an hour per submitter, 600 an hour per network hash (54000).
  const sLimit = register();
  backfill(sLimit, 119, '30 minutes');
  backfill(sLimit, 50, '61 minutes');
  submit(sLimit, good()); // the 120th in the hour
  refused(
    'anon',
    submitSql(sLimit, good()),
    '54000',
    'submitter_id',
    '121st in an hour'
  );
  assert.equal(count(`submitter_id = ${q(sLimit)}`), 170);
  for (let i = 0; i < 6; i += 1) backfill(register(), 100, '30 minutes', NET_B);
  backfill(register(), 100, '61 minutes', NET_B);
  const sNet = register();
  refused(
    'anon',
    submitSql(sNet, good(), NET_B),
    '54000',
    'network_hash',
    '601st from a network'
  );
  assert.equal(
    submit(sNet, good(), NET_A).status,
    'quarantined',
    'another network passes'
  );
  assert.equal(
    submit(sNet, good()).status,
    'quarantined',
    'no hash, no network limit'
  );
  // The register brake: more than 600 in the last minute.
  sql(`INSERT INTO rate.extension_submitters (created_at)
       SELECT now() - interval '30 seconds' FROM generate_series(1, 600)`);
  refused(
    'anon',
    'SELECT rate.register_extension_submitter()',
    '54000',
    undefined,
    'register brake'
  );
  sql(`UPDATE rate.extension_submitters SET created_at = now() - interval '2 minutes'
       WHERE created_at > now() - interval '1 minute'`);
  assert.match(register(), /^[0-9a-f-]{36}$/, 'the brake lifts after a minute');

  // 6. Delete: the submitter and its observations; the count; 0 for an unknown or null id.
  const sDel = register();
  for (let i = 0; i < 3; i += 1) submit(sDel, good());
  assert.equal(
    as('anon', `SELECT rate.delete_extension_submitter(${q(sDel)})`),
    '3'
  );
  assert.equal(count(`submitter_id = ${q(sDel)}`), 0);
  assert.equal(
    sql(`SELECT count(*) FROM rate.extension_submitters WHERE id = ${q(sDel)}`),
    '0'
  );
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
  assert.equal(
    sql(
      `SELECT count(*) FROM rate.extension_submitters WHERE id = ${q(sEmpty)}`
    ),
    '0'
  );
  refused(
    'anon',
    submitSql(sDel, good()),
    'P0002',
    'submitter_id',
    'a deleted submitter'
  );
  // The cascade holds for service_role's direct delete too.
  const sCascade = register();
  submit(sCascade, good());
  sql(`DELETE FROM rate.extension_submitters WHERE id = ${q(sCascade)}`);
  assert.equal(count(`submitter_id = ${q(sCascade)}`), 0);

  // 7. Purge: hashes after 28 days, rows after 180, then submitters left empty.
  const [p1, p2, p3, p4] = [register(), register(), register(), register()];
  sql(`UPDATE rate.extension_submitters SET created_at = now() - interval '200 days'
       WHERE id IN (${[p1, p2, p3].map(q).join(', ')});
       UPDATE rate.extension_submitters SET created_at = now() - interval '10 days'
       WHERE id = ${q(p4)}`);
  backfill(p1, 1, '200 days', NET_A);
  backfill(p1, 1, '30 days', NET_A);
  backfill(p1, 1, '10 days', NET_A);
  backfill(p3, 1, '190 days');
  const total = count();
  refused(
    'anon',
    'SELECT rate.purge_extension_observations()',
    '42501',
    undefined,
    'anon purge'
  );
  refused(
    'authenticated',
    'SELECT rate.purge_extension_observations()',
    '42501',
    undefined,
    'authenticated purge'
  );
  refused(
    'rate_worker',
    'SELECT rate.purge_extension_observations()',
    '42501',
    undefined,
    'rate_worker purge'
  );
  refused(
    'service_role',
    'SELECT rate.purge_extension_observations(0)',
    '22023',
    'p_network_hash_days',
    'purge days'
  );
  refused(
    'service_role',
    'SELECT rate.purge_extension_observations(28, NULL)',
    '22023',
    'p_keep_days',
    'purge keep'
  );
  assert.deepEqual(
    JSON.parse(
      as('service_role', 'SELECT rate.purge_extension_observations()::text')
    ),
    {
      network_hashes_cleared: 2,
      observations_deleted: 2,
      submitters_deleted: 2,
    }
  );
  assert.equal(count(), total - 2);
  assert.equal(
    sql(`SELECT string_agg(to_char(now() - received_at, 'DD') || ':' || (network_hash IS NOT NULL),
           ',' ORDER BY received_at) FROM rate.extension_observations WHERE submitter_id = ${q(p1)}`),
    '30:false,10:true'
  );
  assert.equal(
    sql(`SELECT string_agg(id::text, ',' ORDER BY created_at) FROM rate.extension_submitters
         WHERE id IN (${[p1, p2, p3, p4].map(q).join(', ')})`),
    `${p1},${p4}`,
    'p2 (never sent) and p3 (emptied) go; p1 keeps rows and p4 is young'
  );
  assert.deepEqual(
    JSON.parse(
      as('service_role', 'SELECT rate.purge_extension_observations()::text')
    ),
    {
      network_hashes_cleared: 0,
      observations_deleted: 0,
      submitters_deleted: 0,
    },
    'a second purge finds nothing'
  );

  // 8. The tables: anon and authenticated reach nothing; rate_worker reads and sets status only;
  // service_role writes directly within the CHECKs.
  for (const role of ['anon', 'authenticated']) {
    for (const table of [
      'rate.extension_submitters',
      'rate.extension_observations',
    ]) {
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
        `UPDATE ${table} SET ${table.endsWith('submitters') ? 'created_at = now()' : "status = 'rejected'"}`,
        '42501',
        undefined,
        `${role} update ${table}`
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
      'INSERT INTO rate.extension_submitters DEFAULT VALUES',
      '42501',
      undefined,
      `${role} insert submitter`
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
  refused(
    'service_role',
    direct.replace('URL', q('https://lazada.vn/x')),
    '23514',
    undefined,
    'the host CHECK holds service_role'
  );
  checkAll('after the exercise');

  // 9. The rollback twice; everything goes; the proposal again on an empty slate.
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
  checkAll('after the rollback and a re-apply');
  const again = register();
  assert.equal(submit(again, good(), NET_A).status, 'quarantined');
  sql(proposal);
  checkAll('after a re-apply over data');
  assert.equal(count(), 1, 'a re-apply keeps rows');

  console.log(
    `extension observations proposal: ${valid.length} valid and ${bad.length} refused payloads, limits, delete, purge, grants, verify and rollback replayed`
  );
} finally {
  removeContainer();
}
