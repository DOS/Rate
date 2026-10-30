#!/usr/bin/env node
// Read-only re-key dry run (DOS/Rate#1441, #1407; decisions in
// Docs/Proposals/2026-10-30-rekey-decisions.md). For JOY or the DB owner to run:
// it lists the masters whose stored model_key no longer matches what the current
// normalizer gives for their own listings' titles, with the listings and price
// rows each change would move, and prints a proposed old -> new mapping. It
// writes nothing.
//
// Read-only by construction:
// - every query is a single SELECT, sent through psql with
//   PGOPTIONS=-c default_transaction_read_only=on, so the session cannot write;
// - before any read it checks that the session is read-only and that the role is
//   no superuser and holds no INSERT, UPDATE, DELETE or TRUNCATE on the tables it
//   reads. A role that could write is refused unless --allow-write-capable-role is
//   given (the session stays read-only either way).
// The connection string comes from REKEY_DATABASE_URL and is never printed.
//
// Usage (build the normalizer first: pnpm --filter @repo/crawlers build):
//   REKEY_DATABASE_URL=postgresql://readonly_user:...@host:5432/postgres \
//     node scripts/ops/rekey-dry-run.mjs [--json] [--normalizer <path>]

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { isMain } from './lib.mjs';

export const ENV_URL = 'REKEY_DATABASE_URL';
export const READ_TABLES = [
  'rate.master_products',
  'rate.products',
  'rate.price_history',
];

const tableList = READ_TABLES.map((t) => `'${t}'`).join(', ');

/** The SELECTs, each returning one JSON value. */
export const QUERIES = {
  guard: `SELECT json_build_object(
    'read_only', current_setting('transaction_read_only'),
    'superuser', (SELECT rolsuper FROM pg_roles WHERE rolname = current_user),
    'writable', (SELECT coalesce(json_agg(t), '[]'::json) FROM unnest(ARRAY[${tableList}]) AS t
                 WHERE has_table_privilege(current_user, t, 'INSERT, UPDATE, DELETE, TRUNCATE')))`,
  masters: `SELECT coalesce(json_agg(json_build_object('id', id, 'model_key', model_key, 'status', status)
    ORDER BY model_key), '[]'::json) FROM rate.master_products`,
  listings: `SELECT coalesce(json_agg(json_build_object('id', id, 'master_id', cluster_id, 'title', title)),
    '[]'::json) FROM rate.products WHERE cluster_id IS NOT NULL`,
  priceRows: `SELECT coalesce(json_agg(json_build_object('product_id', product_id, 'rows', n)), '[]'::json)
    FROM (SELECT product_id, count(*) AS n FROM rate.price_history GROUP BY product_id) c`,
};

/**
 * Throws unless the session is read-only and, without the override, the role
 * cannot write. Returns a one-line note about the role.
 */
export function checkReadOnly(guard, { allowWriteCapableRole = false } = {}) {
  if (!guard || guard.read_only !== 'on') {
    throw new Error(
      'refusing to run: the session is not read-only (transaction_read_only is not on)'
    );
  }
  const writable = Array.isArray(guard.writable) ? guard.writable : [];
  const capable = guard.superuser === true || writable.length > 0;
  if (capable && !allowWriteCapableRole) {
    throw new Error(
      `refusing to run: the role can write (${guard.superuser ? 'superuser' : writable.join(', ')}). ` +
        'Use a SELECT-only role, or pass --allow-write-capable-role (the session stays read-only).'
    );
  }
  return capable
    ? 'role can write; session forced read-only'
    : 'SELECT-only role';
}

/** brand:model of a model_key, and its variant (the third part, or ''). */
export function splitKey(key) {
  const [brand = '', model = '', ...rest] = String(key).split(':');
  return { item: `${brand}:${model}`, variant: rest.join(':') };
}

/** Why a change is in scope, from the stored key's model part. */
export function categoryOf(oldKey) {
  const model = splitKey(oldKey).item.split(':')[1] ?? '';
  if (/(?:^|-)(?:tang|kem|qua)(?:-|$)/.test(model)) return 'gift-word (#1441)';
  if (/^watch-(?:se\d|series\d)/.test(model)) return 'watch-spelling (#1407)';
  return 'other';
}

/**
 * The proposed re-keys. Each master's listing titles go through `keyOf` (the
 * normalizer; null for an unkeyable title). When most keyed listings agree on a
 * brand:model that differs from the stored one, the master is proposed to move
 * to that brand:model with its stored variant. Only the brand:model part is
 * compared: a title that leaves out the storage must not move a variant.
 */
export function planRekeys({ masters, listings, priceRows, keyOf }) {
  const byMaster = new Map();
  for (const l of listings) {
    if (!l?.master_id) continue;
    const list = byMaster.get(l.master_id) ?? [];
    list.push(l);
    byMaster.set(l.master_id, list);
  }
  const rowsByProduct = new Map(
    priceRows.map((r) => [r.product_id, Number(r.rows) || 0])
  );
  const masterByKey = new Map(masters.map((m) => [m.model_key, m]));
  const changes = [];
  const unclear = [];
  let unchanged = 0;
  let noListings = 0;
  for (const m of masters) {
    const own = byMaster.get(m.id) ?? [];
    if (own.length === 0) {
      noListings += 1;
      continue;
    }
    const votes = new Map();
    let keyed = 0;
    for (const l of own) {
      const key = keyOf(l.title ?? '');
      if (!key) continue;
      keyed += 1;
      const { item } = splitKey(key);
      votes.set(item, (votes.get(item) ?? 0) + 1);
    }
    const stored = splitKey(m.model_key);
    const [top, count] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    if (!top || top === stored.item) {
      unchanged += 1;
      continue;
    }
    if (count * 2 <= keyed) {
      unclear.push({
        masterId: m.id,
        oldKey: m.model_key,
        listings: own.length,
        votes: Object.fromEntries(votes),
      });
      continue;
    }
    const newKey = stored.variant ? `${top}:${stored.variant}` : top;
    const target = masterByKey.get(newKey);
    changes.push({
      masterId: m.id,
      status: m.status,
      oldKey: m.model_key,
      newKey,
      category: categoryOf(m.model_key),
      action: target ? `merge into ${target.id}` : 'rename in place',
      listings: own.length,
      agreeing: count,
      keyed,
      priceRows: own.reduce(
        (sum, l) => sum + (rowsByProduct.get(l.id) ?? 0),
        0
      ),
    });
  }
  changes.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.oldKey.localeCompare(b.oldKey)
  );
  return { changes, unclear, unchanged, noListings };
}

/** The report as text lines. */
export function formatPlan(plan) {
  const lines = [];
  const totals = plan.changes.reduce(
    (t, c) => ({
      listings: t.listings + c.listings,
      priceRows: t.priceRows + c.priceRows,
    }),
    { listings: 0, priceRows: 0 }
  );
  lines.push(
    `Proposed re-keys: ${plan.changes.length} masters, ${totals.listings} listings, ${totals.priceRows} price rows ` +
      `(unchanged ${plan.unchanged}, no listings ${plan.noListings}, unclear ${plan.unclear.length}). Nothing was written.`
  );
  let category = '';
  for (const c of plan.changes) {
    if (c.category !== category) {
      category = c.category;
      lines.push('', `## ${category}`);
    }
    lines.push(
      `${c.oldKey} -> ${c.newKey}  [${c.action}; ${c.status}; listings ${c.listings} (${c.agreeing}/${c.keyed} agree); price rows ${c.priceRows}; master ${c.masterId}]`
    );
  }
  if (plan.unclear.length > 0) {
    lines.push(
      '',
      '## unclear (no majority among the listings; review by hand)'
    );
    for (const u of plan.unclear) {
      lines.push(
        `${u.oldKey}  [listings ${u.listings}; votes ${JSON.stringify(u.votes)}; master ${u.masterId}]`
      );
    }
  }
  return lines;
}

/** One SELECT through psql in a read-only session; its single JSON value. */
export function psqlJson(url, sql, run = spawnSync) {
  const r = run(
    'psql',
    [url, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' },
    }
  );
  if (r.error) throw new Error(`psql could not start: ${r.error.message}`);
  if (r.status !== 0) {
    // psql's own error text; the connection string is never echoed.
    throw new Error(
      `psql failed: ${String(r.stderr ?? '')
        .split(url)
        .join('<REKEY_DATABASE_URL>')
        .trim()}`
    );
  }
  return JSON.parse(String(r.stdout).trim() || 'null');
}

/** The normalizer's keyOf, from the built @repo/crawlers package. */
export async function loadKeyOf(normalizerPath) {
  if (!existsSync(normalizerPath)) {
    throw new Error(
      `no built normalizer at ${normalizerPath}: run pnpm --filter @repo/crawlers build`
    );
  }
  const { ProductNormalizer } = await import(
    pathToFileURL(normalizerPath).href
  );
  const normalizer = new ProductNormalizer();
  return (title) => {
    const r = normalizer.normalize({
      itemId: 'dry-run',
      shopId: 'dry-run',
      title,
      priceMin: 1,
      priceMax: 1,
    });
    return r.keyable === false ? null : r.model_key;
  };
}

function usage(message) {
  console.error(message);
  console.error(
    `usage: ${ENV_URL}=postgresql://... node scripts/ops/rekey-dry-run.mjs [--json] [--normalizer <path>] [--allow-write-capable-role]`
  );
  process.exit(2);
}

async function main() {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..'
  );
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        json: { type: 'boolean', default: false },
        normalizer: {
          type: 'string',
          default: path.join(
            root,
            'apps/importer/dist/shopee/product-normalizer.js'
          ),
        },
        'allow-write-capable-role': { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    usage(err?.message ?? String(err));
  }
  const url = process.env[ENV_URL];
  if (!url) usage(`${ENV_URL} is required (a read-only connection string)`);

  const role = checkReadOnly(psqlJson(url, QUERIES.guard), {
    allowWriteCapableRole: values['allow-write-capable-role'],
  });
  const keyOf = await loadKeyOf(values.normalizer);
  const plan = planRekeys({
    masters: psqlJson(url, QUERIES.masters) ?? [],
    listings: psqlJson(url, QUERIES.listings) ?? [],
    priceRows: psqlJson(url, QUERIES.priceRows) ?? [],
    keyOf,
  });
  if (values.json) {
    console.log(JSON.stringify({ role, ...plan }, null, 2));
  } else {
    console.log(`Read-only check: ${role}.`);
    for (const line of formatPlan(plan)) console.log(line);
  }
}

if (isMain(import.meta.url)) {
  try {
    await main();
  } catch (err) {
    console.error(err?.message ?? String(err));
    process.exitCode = 1;
  }
}
