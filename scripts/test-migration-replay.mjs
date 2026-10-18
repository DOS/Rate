#!/usr/bin/env node
// Replays every file in supabase/migrations twice, in order, on a throwaway
// PostgreSQL 17 container shaped like the shared Supabase project, then
// exercises the RPCs the web app and workers call. Catches what CREATE
// FUNCTION does not: plpgsql bodies are only resolved when they run, so a
// wrong column or a missing schema privilege surfaces on the first call.
//
// The deployable ledger is DOS/DOS.Me (see scripts/check-migration-drift.mjs);
// this test keeps the reference copy here honest before it is synced there.
//
// Usage: node scripts/test-migration-replay.mjs   (needs Docker)

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migDir = path.join(repoRoot, 'supabase', 'migrations');
const migrations = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ name: f, sql: readFileSync(path.join(migDir, f), 'utf8') }));

const container = `rate-migration-replay-${process.pid}`;
let started = false;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout);
  }
  return result.stdout.trim();
}
const sql = (input) =>
  docker(['exec', '-i', container, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { input });
const asRole = (role, query) => sql(`SET ROLE ${role}; ${query}; RESET ROLE;`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    spawnSync('docker', ['rm', '--force', container], { timeout: 30_000 });
    process.exit(130);
  });
}

try {
  // Set before `docker run`: a timed-out run may still have created the container.
  started = true;
  docker(['run', '--detach', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=local-test-only', 'postgres:17-alpine'], {
    timeout: 120_000,
  });
  const deadline = Date.now() + 60_000;
  for (;;) {
    const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8', timeout: 5_000 });
    const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { timeout: 5_000 });
    const boots = `${logs.stdout}\n${logs.stderr}`.match(/database system is ready to accept connections/g)?.length ?? 0;
    if (boots >= 2 && ready.status === 0) break;
    if (Date.now() >= deadline) throw new Error('temporary PostgreSQL did not become ready');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }

  // Supabase-shaped fixture: API roles, auth.uid() from request.jwt.claims, and
  // the prod extension placement (uuid-ossp in `extensions`, pg_trgm in `sign`,
  // neither on the default search_path and neither usable by anon).
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, email_confirmed_at TIMESTAMPTZ);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
    $$;
    CREATE SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;
    CREATE SCHEMA sign;
    CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA sign;
    CREATE SCHEMA dosafe;
    CREATE TABLE dosafe.threat_intel (entity_hash text, risk_score int, category text, source text);`);

  // Every migration applies cleanly and is idempotent.
  for (const m of migrations) {
    for (const pass of [1, 2]) {
      try {
        sql(m.sql);
      } catch (err) {
        throw new Error(`${m.name} failed on pass ${pass}: ${err.message}`);
      }
    }
  }

  // PII stays hidden from the public API roles.
  assert.throws(() => asRole('anon', 'SELECT phone FROM rate.merchants'), /permission denied for table merchants/);
  assert.throws(() => asRole('anon', 'SELECT * FROM rate.price_alerts'), /permission denied for table price_alerts/);

  sql(`
    INSERT INTO rate.merchants (id, platform, platform_shop_id, name, slug, is_official)
    VALUES ('11111111-1111-4111-8111-111111111111', 'shopee', 'shop_1', 'Apple Flagship Store', 'apple-flagship-store', true);
    INSERT INTO rate.master_products (id, brand, model, model_key, name, slug, min_price, max_price, merchant_count, status)
    VALUES ('22222222-2222-4222-8222-222222222222', 'Apple', 'iPhone 16 Pro Max', 'apple_iphone_16_pro_max_256gb', 'iPhone 16 Pro Max 256GB', 'iphone-16-pro-max-256gb', 28990000, 31990000, 1, 'published');
    INSERT INTO rate.products (id, merchant_id, platform, platform_item_id, title, price_current, url, cluster_id)
    VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'shopee', 'item_1', 'iPhone 16 Pro Max 256GB VN/A', 28990000, 'https://shopee.vn/item-1', '22222222-2222-4222-8222-222222222222');
  `);

  // Public catalog RPCs work for anon (autocomplete must reach pg_trgm in `sign`).
  assert.equal(asRole('anon', `SELECT slug FROM rate.search_catalog_autocomplete('iPhone 16', 5)`), 'iphone-16-pro-max-256gb');
  assert.equal(asRole('anon', `SELECT count(*) > 0 FROM rate.search_master_products(p_search => 'iPhone')`), 't');
  asRole('anon', 'SELECT count(*) FROM rate.get_category_brand_facets(NULL)');

  // Votes cannot lift a review that is excluded from the rating, and an
  // excluded review never counts toward the product rating.
  sql(`INSERT INTO auth.users (id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    INSERT INTO rate.reviews (id, product_id, rating_star, comment, reviewer_type)
    VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 5, 'Máy dùng rất mượt, pin trâu suốt cả ngày.', 'user');
    INSERT INTO rate.review_flags (review_id, verdict, include_in_rating, detector, detector_version, input_hash)
    VALUES ('44444444-4444-4444-8444-444444444444', 'unanalyzed', false, 'replay', 'v1', 'h');
    INSERT INTO rate.review_votes (review_id, voter_id, vote) VALUES ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'up');
    SELECT rate.refresh_review_vote_counts('44444444-4444-4444-8444-444444444444');
    SELECT rate.refresh_master_product_rating('22222222-2222-4222-8222-222222222222');`);
  assert.equal(sql(`SELECT helpfulness_weight FROM rate.reviews WHERE id = '44444444-4444-4444-8444-444444444444'`), '0.00');
  assert.equal(
    sql(`SELECT coalesce(authentic_review_count, 0) || '|' || coalesce(user_rating_weighted, 0)
      FROM rate.master_products WHERE id = '22222222-2222-4222-8222-222222222222'`),
    '0|0.00'
  );

  // anon crowd signals: accepted, but only small object payloads.
  assert.ok(
    asRole('anon', `SELECT state FROM rate.enqueue_crowd_verify_signal('shopee', 'https://shopee.vn/item-9', 'item_9', 'shop_1', '{"price": 1}'::jsonb)`).length > 0
  );
  for (const payload of [`jsonb_build_object('blob', repeat('x', 20000))`, `'[1,2]'::jsonb`]) {
    assert.throws(
      () => asRole('anon', `SELECT * FROM rate.enqueue_crowd_verify_signal('shopee', 'https://shopee.vn/item-10', 'item_10', NULL, ${payload})`),
      /Invalid crowd verification payload/
    );
  }

  // Service-only maintenance RPCs: closed to anon, working for service_role.
  for (const fn of [
    `rate.refresh_master_market_stats('22222222-2222-4222-8222-222222222222')`,
    'rate.purge_completed_crawl_jobs(14)',
  ]) {
    assert.throws(() => asRole('anon', `SELECT ${fn}`), /permission denied for function/);
    asRole('service_role', `SELECT ${fn}`);
  }
  // The purge removes old terminal jobs and keeps recent and pending ones.
  sql(`ALTER TABLE rate.crawl_jobs DISABLE TRIGGER USER;
    UPDATE rate.crawl_jobs SET status = 'done', updated_at = now() - interval '30 days';
    ALTER TABLE rate.crawl_jobs ENABLE TRIGGER USER;`);
  const stale = Number(sql(`SELECT count(*) FROM rate.crawl_jobs`));
  assert.ok(stale > 0, 'the crowd signal above created a crawl job');
  for (const item of ['item_12', 'item_13']) {
    asRole('anon', `SELECT state FROM rate.enqueue_crowd_verify_signal('shopee', 'https://shopee.vn/${item}', '${item}', NULL, '{}'::jsonb)`);
  }
  sql(`UPDATE rate.crawl_jobs SET status = 'done' WHERE platform_item_id = 'item_13';`);
  assert.equal(asRole('service_role', 'SELECT rate.purge_completed_crawl_jobs(14)'), String(stale));
  assert.equal(
    sql(`SELECT string_agg(platform_item_id || ':' || status, ',' ORDER BY platform_item_id) FROM rate.crawl_jobs`),
    'item_12:pending,item_13:done',
    'pending and recently finished jobs survive the purge'
  );

  // The merchant-trust view stays owner-rights: anon reads offers through it.
  asRole('anon', `SELECT count(*) FROM rate.v_products_with_merchant_trust`);
  // Crowd signals must target the marketplace's own host.
  assert.throws(
    () => asRole('anon', `SELECT * FROM rate.enqueue_crowd_verify_signal('shopee', 'https://evil.example/shopee.vn/item-12', 'item_12', NULL, '{}'::jsonb)`),
    /Target URL host does not match the platform/,
  );
  // An anonymous crowd signal never supersedes a live crawl of another type.
  sql(`SELECT * FROM rate.enqueue_crawl_job('crawl_listing', 'shopee', '{}'::jsonb, 'https://shopee.vn/item-77', 'item_77', NULL, 0, NULL)`);
  assert.equal(
    asRole('anon', `SELECT state FROM rate.enqueue_crowd_verify_signal('shopee', 'https://shopee.vn/item-77', 'item_77', NULL, '{}'::jsonb)`),
    'already_queued',
  );
  assert.equal(sql(`SELECT type || ':' || status FROM rate.crawl_jobs WHERE platform_item_id = 'item_77' ORDER BY created_at`), 'crawl_listing:pending');

  console.log(`Rate migration replay passed: ${migrations.length} migrations applied twice on PostgreSQL 17, catalog/queue/vote RPCs exercised`);
} finally {
  if (started) docker(['rm', '--force', container]);
}
