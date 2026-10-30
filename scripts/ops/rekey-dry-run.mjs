#!/usr/bin/env node
// Read-only re-key dry run (DOS/Rate#1441, #1407; decisions in
// Docs/Proposals/2026-10-30-rekey-decisions.md). For JOY or the DB owner to run:
// it lists the masters whose stored model_key no longer matches what the current
// normalizer gives for their own listings' titles, plus the watch keys #1407
// would respell, with the listings and price rows each change would move, and
// prints a proposed old -> new mapping. It writes nothing.
//
// It also lists, for a master that keeps its key, the minority of its listings
// that key elsewhere and would leave it, per target key (#1491 c, d: 5G iPads
// under a key that stays Wi-Fi, other RAM under a MacBook key). Point --normalizer
// at a build of the branch whose keys are being weighed.
//
// Read-only by construction:
// - one psql session reads everything inside BEGIN READ ONLY ... ROLLBACK, and
//   PGOPTIONS asks for default_transaction_read_only as well (a pooler may drop
//   startup options; the READ ONLY transaction does not depend on them);
// - the first statements in that transaction are a guard: psql runs the data reads
//   (\if) only when the transaction is read-only and the role is no superuser and
//   holds no INSERT, UPDATE, DELETE or TRUNCATE on the tables it reads (table or
//   column grants), and this script checks the same row again and stops the session.
//   A role that could write is refused unless --allow-write-capable-role is given;
//   the transaction stays read-only either way.
// The connection string comes from REKEY_DATABASE_URL. It is handed to psql as PG*
// environment variables, never on the command line, and never printed.
//
// Usage (build the normalizer first: pnpm --filter @repo/crawlers build):
//   REKEY_DATABASE_URL=postgresql://readonly_user:...@host:5432/postgres \
//     node scripts/ops/rekey-dry-run.mjs [--json] [--normalizer <path>]
//
// For Rate Services' rate_worker session, which reads through PostgREST and cannot
// log in to Postgres: --via-postgrest reads with GET requests only (see below).
//   REKEY_SUPABASE_URL=... REKEY_SUPABASE_ANON_KEY=... REKEY_SUPABASE_ACCESS_TOKEN=... \
//     node scripts/ops/rekey-dry-run.mjs --via-postgrest [--json] [--normalizer <path>]
//
// Not covered: listings with no master (cluster_id NULL), and rate.items, whose
// Item follows its masters' keys through the M1 sync trigger once they are re-keyed.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
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

const writableTables = `(SELECT coalesce(json_agg(t), '[]'::json) FROM unnest(ARRAY[${tableList}]) AS t
                 WHERE has_table_privilege(current_user, t, 'INSERT, UPDATE, DELETE, TRUNCATE')
                    OR has_any_column_privilege(current_user, t, 'INSERT, UPDATE'))`;
const superuser =
  '(SELECT rolsuper FROM pg_roles WHERE rolname = current_user)';

/**
 * The session's statements: the read-only transaction, then the guard, twice. psql
 * itself decides first (\gset, \if): it runs the data reads only when the
 * transaction is read-only and, unless the psql variable allow_write is on, the role
 * cannot write. The guard row also goes to this script, which checks it again and
 * stops the session. The whole script is sent at once, so nothing depends on when
 * psql flushes its output. Each row is one tagged JSON line, so a large table streams
 * instead of building one value.
 */
export const GUARD_SQL = [
  'BEGIN READ ONLY;',
  `SELECT current_setting('transaction_read_only') = 'on'
    AND (:'allow_write' = 'on' OR (NOT coalesce(${superuser}, true)
         AND json_array_length(${writableTables}) = 0)) AS guard_ok \\gset`,
  `SELECT 'guard' || chr(9) || json_build_object(
    'read_only', current_setting('transaction_read_only'),
    'superuser', ${superuser},
    'writable', ${writableTables})::text;`,
].join('\n');

export const DATA_SQL = [
  '\\if :guard_ok',
  `SELECT 'master' || chr(9) || json_build_object('id', id, 'model_key', model_key, 'status', status)::text
    FROM rate.master_products;`,
  `SELECT 'listing' || chr(9) || json_build_object('id', id, 'master_id', cluster_id, 'title', title)::text
    FROM rate.products WHERE cluster_id IS NOT NULL;`,
  `SELECT 'price' || chr(9) || json_build_object('product_id', product_id, 'rows', count(*))::text
    FROM rate.price_history GROUP BY product_id;`,
  '\\endif',
  'ROLLBACK;',
].join('\n');

export const SESSION_SQL = `${GUARD_SQL}\n${DATA_SQL}`;

/**
 * Throws unless the transaction is read-only and, without the override, the role
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
        'Use a SELECT-only role, or pass --allow-write-capable-role (the transaction stays read-only).'
    );
  }
  return capable
    ? 'role can write; transaction forced read-only'
    : 'SELECT-only role';
}

/** libpq URL query parameters and the environment variables that carry them. */
export const URL_PARAMS = {
  host: 'PGHOST',
  hostaddr: 'PGHOSTADDR',
  port: 'PGPORT',
  user: 'PGUSER',
  dbname: 'PGDATABASE',
  sslmode: 'PGSSLMODE',
  sslrootcert: 'PGSSLROOTCERT',
  sslcert: 'PGSSLCERT',
  sslkey: 'PGSSLKEY',
  sslcrl: 'PGSSLCRL',
  sslnegotiation: 'PGSSLNEGOTIATION',
  channel_binding: 'PGCHANNELBINDING',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  application_name: 'PGAPPNAME',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
};

/**
 * The connection string as libpq environment variables, so it never sits on a
 * command line. Throws a message that names no part of it.
 */
export function pgEnvFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${ENV_URL} is not a valid postgresql:// URL`);
  }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    throw new Error(`${ENV_URL} must start with postgresql://`);
  }
  const decode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      throw new Error(`${ENV_URL} has a malformed percent-encoded part`);
    }
  };
  const env = {
    // An IPv6 host comes bracketed in a URL; libpq wants it bare.
    PGHOST: decode(parsed.hostname.replace(/^\[(.*)\]$/, '$1')),
    PGPORT: parsed.port || '5432',
    PGUSER: decode(parsed.username),
    PGPASSWORD: decode(parsed.password),
    PGDATABASE: decode(parsed.pathname.replace(/^\//, '')) || 'postgres',
  };
  // libpq's own query parameters keep their meaning; any other one (such as the
  // node-postgres "ssl=true") is refused rather than dropped, so a TLS requirement
  // is never lost silently. Only the parameter's name is reported.
  for (const [name, value] of parsed.searchParams) {
    const variable = Object.hasOwn(URL_PARAMS, name) ? URL_PARAMS[name] : null;
    if (!variable) {
      throw new Error(
        `${ENV_URL} has a query parameter this script does not pass on: ${name}. ` +
          `Supported: ${Object.keys(URL_PARAMS).join(', ')} (for TLS use sslmode=require or verify-full).`
      );
    }
    env[variable] = value;
  }
  return env;
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
 * The key #1407 would give a watch spelled without its space ("se2", "series10"),
 * or null. The normalizer change is not shipped, so this rule stands in for it.
 */
export function watchRespelling(key) {
  const m = /^apple:watch-(se|series)(\d+)(.*)$/.exec(String(key));
  return m ? `apple:watch-${m[1]}-${m[2]}${m[3]}` : null;
}

/**
 * The proposed re-keys. Each master's listings carry `key`, the normalizer's
 * model_key for their title (null when unkeyable). When more than half of the keyed
 * listings agree on a brand:model that differs from the stored one, the master is
 * proposed to move there with its stored variant; with no majority it is unclear.
 * Only brand:model is compared: a title that leaves out the storage moves no
 * variant. Watch spellings #1407 would change ("series10") are respelled in the
 * listings' keys before the vote, so the target keeps what the titles say (such as
 * the case size); with no listings or no majority, the stored key is respelled.
 */
export function planRekeys({ masters, listings, priceRows }) {
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
  const splits = [];
  let unchanged = 0;
  let noListings = 0;
  for (const m of masters) {
    const own = byMaster.get(m.id) ?? [];
    const priceRowCount = own.reduce(
      (sum, l) => sum + (rowsByProduct.get(l.id) ?? 0),
      0
    );
    const respelled = watchRespelling(m.model_key);
    const fromStoredKey = () =>
      changes.push({
        masterId: m.id,
        status: m.status,
        oldKey: m.model_key,
        newKey: respelled,
        category: 'watch-spelling (#1407)',
        source:
          'spelling rule on the stored key, no title majority: check the case size by hand',
        listings: own.length,
        agreeing: null,
        keyed: null,
        priceRows: priceRowCount,
      });
    if (own.length === 0) {
      if (respelled) {
        fromStoredKey();
        continue;
      }
      noListings += 1;
      continue;
    }
    const votes = new Map();
    let keyed = 0;
    for (const l of own) {
      if (!l.key) continue;
      keyed += 1;
      // The normalizer change for #1407 is not shipped; this rule stands in for it.
      const { item } = splitKey(watchRespelling(l.key) ?? l.key);
      votes.set(item, (votes.get(item) ?? 0) + 1);
    }
    const stored = splitKey(m.model_key);
    // Ties break by key, so the result does not depend on the row order.
    const [top, count] = [...votes].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0] ?? [null, 0];
    const majority = top !== null && count * 2 > keyed;
    if (majority && top === stored.item) {
      unchanged += 1;
      // The master keeps its key, but a minority of its listings may key elsewhere,
      // such as 5G iPads under a key that stays Wi-Fi (#1491 c, d). They would leave
      // it once the normalizer ships; list them per target key.
      // A leaving listing keeps its own storage when its title states one, so 128GB
      // and 256GB 5G listings under an "unknown" master go to two keys.
      const leaving = new Map();
      for (const l of own) {
        if (!l.key) continue;
        const own_ = splitKey(watchRespelling(l.key) ?? l.key);
        if (own_.item === stored.item) continue;
        const variant =
          own_.variant && own_.variant !== 'unknown'
            ? own_.variant
            : stored.variant;
        const newKey = variant ? `${own_.item}:${variant}` : own_.item;
        const g = leaving.get(newKey) ?? { newKey, listings: 0, priceRows: 0 };
        g.listings += 1;
        g.priceRows += rowsByProduct.get(l.id) ?? 0;
        leaving.set(newKey, g);
      }
      if (leaving.size > 0) {
        splits.push({
          masterId: m.id,
          status: m.status,
          oldKey: m.model_key,
          listings: own.length,
          keyed,
          groups: [...leaving.values()].sort((a, b) =>
            a.newKey.localeCompare(b.newKey)
          ),
        });
      }
      continue;
    }
    if (!majority && respelled) {
      fromStoredKey();
      continue;
    }
    if (!majority) {
      if (top === null) unchanged += 1;
      else
        unclear.push({
          masterId: m.id,
          oldKey: m.model_key,
          listings: own.length,
          keyed,
          votes: Object.fromEntries(votes),
        });
      continue;
    }
    changes.push({
      masterId: m.id,
      status: m.status,
      oldKey: m.model_key,
      newKey: stored.variant ? `${top}:${stored.variant}` : top,
      category: categoryOf(m.model_key),
      source: respelled ? 'normalizer + spelling rule' : 'normalizer',
      listings: own.length,
      agreeing: count,
      keyed,
      priceRows: priceRowCount,
    });
  }
  // The action: a rename only when the target key is free and no other master
  // moves there; otherwise a merge, reviewed by hand like M0 (DOS/Rate#1123).
  const movingTo = new Map();
  for (const c of changes)
    movingTo.set(c.newKey, [...(movingTo.get(c.newKey) ?? []), c.masterId]);
  const moving = new Set(changes.map((c) => c.masterId));
  for (const c of changes) {
    const target = masterByKey.get(c.newKey);
    const group = movingTo.get(c.newKey);
    if (target) {
      c.action = `merge into ${target.id}${moving.has(target.id) ? ' (that master is re-keyed too: resolve first)' : ''}`;
    } else if (group.length > 1) {
      c.action = `merge with ${group.filter((id) => id !== c.masterId).join(', ')} into one new key`;
    } else {
      c.action = 'rename in place';
    }
    c.lowCoverage = c.keyed !== null && c.keyed * 2 < c.listings;
  }
  changes.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.oldKey.localeCompare(b.oldKey)
  );
  // Where a split's listings would go, knowing the re-keys above: into a master
  // that stays, into one that is re-keyed too, or onto a key a re-key also takes.
  // Splits from several masters onto one new key make one new master, not several.
  const splitTo = new Map();
  for (const s of splits)
    for (const g of s.groups)
      splitTo.set(g.newKey, [...(splitTo.get(g.newKey) ?? []), s.masterId]);
  for (const s of splits) {
    for (const g of s.groups) {
      const target = masterByKey.get(g.newKey);
      const sharedWith = splitTo
        .get(g.newKey)
        .filter((id) => id !== s.masterId);
      const alsoMovingHere = movingTo.get(g.newKey);
      if (target && moving.has(target.id)) {
        g.action = `into ${target.id} (that master is re-keyed too: resolve first)`;
      } else if (target) {
        g.action = `into existing master ${target.id}`;
      } else if (alsoMovingHere) {
        g.action = `onto the key ${alsoMovingHere.join(', ')} moves to: resolve first`;
      } else if (sharedWith.length > 0) {
        g.action = `one new master shared with the split from ${sharedWith.join(', ')}`;
      } else {
        g.action = 'a new master';
      }
    }
  }
  splits.sort((a, b) => a.oldKey.localeCompare(b.oldKey));
  return { changes, unclear, splits, unchanged, noListings };
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
  const splits = plan.splits ?? [];
  const split = splits.reduce(
    (t, s) =>
      s.groups.reduce(
        (u, g) => ({
          listings: u.listings + g.listings,
          priceRows: u.priceRows + g.priceRows,
        }),
        t
      ),
    { listings: 0, priceRows: 0 }
  );
  lines.push(
    `Proposed re-keys: ${plan.changes.length} masters, ${totals.listings} listings, ${totals.priceRows} price rows ` +
      `(unchanged ${plan.unchanged}, no listings ${plan.noListings}, unclear ${plan.unclear.length}). ` +
      `Minority leaving a kept-key master: ${splits.length} masters, ${split.listings} listings, ${split.priceRows} price rows. Nothing was written.`
  );
  let category = '';
  for (const c of plan.changes) {
    if (c.category !== category) {
      category = c.category;
      lines.push('', `## ${category}`);
    }
    const agree =
      c.keyed === null
        ? c.source
        : `${c.agreeing}/${c.keyed} keyed listings agree${c.lowCoverage ? ', LOW COVERAGE: under half the listings keyed' : ''}`;
    lines.push(
      `${c.oldKey} -> ${c.newKey}  [${c.action}; ${c.status}; listings ${c.listings} (${agree}); price rows ${c.priceRows}; master ${c.masterId}]`
    );
  }
  if (plan.unclear.length > 0) {
    lines.push(
      '',
      '## unclear (no majority among the listings; review by hand)'
    );
    for (const u of plan.unclear) {
      lines.push(
        `${u.oldKey}  [listings ${u.listings}, keyed ${u.keyed}; votes ${JSON.stringify(u.votes)}; master ${u.masterId}]`
      );
    }
  }
  if (splits.length > 0) {
    lines.push(
      '',
      `## minority listings leaving a kept-key master (${splits.length} masters, ${split.listings} listings, ${split.priceRows} price rows; #1491 c, d)`
    );
    const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
    for (const s of splits) {
      lines.push(
        `${s.oldKey}  [keeps its key; ${s.status}; listings ${s.listings}, keyed ${s.keyed}; master ${s.masterId}]`
      );
      for (const g of s.groups) {
        lines.push(
          `  -> ${g.newKey}: ${n(g.listings, 'listing')}, ${n(g.priceRows, 'price row')} (${g.action})`
        );
      }
    }
  }
  return lines;
}

/**
 * Collects the session's tagged lines: the guard (checked before any data line is
 * kept), masters, listings with their normalizer key, and price-row counts.
 * `onGuard` throws to stop the run.
 */
export function createCollector({ keyOf, onGuard }) {
  const data = { masters: [], listings: [], priceRows: [] };
  let guarded = false;
  return {
    data,
    line(raw) {
      const tab = raw.indexOf('\t');
      if (tab < 0) return;
      const tag = raw.slice(0, tab);
      const value = JSON.parse(raw.slice(tab + 1));
      if (tag === 'guard') {
        onGuard(value);
        guarded = true;
        return;
      }
      if (!guarded)
        throw new Error(
          'refusing to run: data arrived before the read-only check'
        );
      if (tag === 'master') data.masters.push(value);
      else if (tag === 'listing') {
        data.listings.push({
          id: value.id,
          master_id: value.master_id,
          key: keyOf(value.title ?? ''),
        });
      } else if (tag === 'price') data.priceRows.push(value);
    },
  };
}

/**
 * Runs the session through psql, feeding each output line to `onLine`. psql's
 * allow_write variable carries the --allow-write-capable-role override.
 */
export function runSession(
  env,
  onLine,
  spawnFn = spawn,
  { allowWriteCapableRole = false } = {}
) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(
      'psql',
      [
        '-X',
        '-q',
        '-A',
        '-t',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        `allow_write=${allowWriteCapableRole ? 'on' : 'off'}`,
        '-f',
        '-',
      ],
      {
        env: {
          ...process.env,
          ...env,
          PGOPTIONS: '-c default_transaction_read_only=on',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    let failed = null;
    let stderrLines = 0;
    child.on('error', (err) =>
      reject(new Error(`psql could not start: ${err.message}`))
    );
    let guarded = false;
    createInterface({ input: child.stdout }).on('line', (line) => {
      if (failed) return;
      try {
        onLine(line);
        if (line.startsWith('guard\t')) guarded = true;
      } catch (err) {
        failed = err;
        child.kill();
      }
    });
    // psql may exit (a lost connection) before it has read all of stdin.
    child.stdin.on('error', () => {});
    // psql's own error text can quote parts of the connection; only count it.
    createInterface({ input: child.stderr }).on('line', () => {
      stderrLines += 1;
    });
    child.on('close', (code) => {
      if (failed) reject(failed);
      else if (code === 0 && !guarded) {
        reject(new Error('refusing to run: psql gave no read-only check'));
      } else if (code !== 0) {
        reject(
          new Error(
            `psql failed (exit ${code}, ${stderrLines} error line(s) withheld because they can quote the connection). ` +
              'Check the connection with psql by hand.'
          )
        );
      } else resolve();
    });
    child.stdin.end(`${SESSION_SQL}\n`);
  });
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

// ---------------------------------------------------------------------------
// PostgREST read mode (--via-postgrest), for Rate Services' audit-catalog job,
// which reads as rate_worker through PostgREST. rate_worker cannot log in to
// Postgres (NOLOGIN) and holds INSERT/UPDATE on these tables, so the psql guard
// cannot serve it. Here read-only is structural instead: every request goes
// through getOnlyFetch, which refuses any method but GET/HEAD, any body, any
// Prefer header and any /rpc/ path. No Supabase client library is used.
// The three tables are read one after another, not in one snapshot: run it when
// no crawl is writing, or expect listings created mid-run to be left out.
// ---------------------------------------------------------------------------

export const ENV_REST = {
  url: 'REKEY_SUPABASE_URL',
  anonKey: 'REKEY_SUPABASE_ANON_KEY',
  accessToken: 'REKEY_SUPABASE_ACCESS_TOKEN',
};

/** A refusal by the read-only fetch wrapper. Its message names no URL or secret. */
export class ReadOnlyRefusal extends Error {}

/** A fetch that can only read. Throws before any request that could write. */
export function createGetOnlyFetch(fetchImpl = globalThis.fetch) {
  return (url, init = {}) => {
    const method = String(init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new ReadOnlyRefusal(
        `refusing a ${method} request: this dry run only reads`
      );
    }
    if (init.body !== undefined && init.body !== null) {
      throw new ReadOnlyRefusal(
        'refusing a request with a body: this dry run only reads'
      );
    }
    const headers = new Headers(init.headers ?? {});
    if (headers.has('prefer')) {
      throw new ReadOnlyRefusal(
        'refusing a Prefer header: this dry run only reads'
      );
    }
    if (/\/rpc\//i.test(new URL(url).pathname)) {
      throw new ReadOnlyRefusal(
        'refusing an RPC call: this dry run only reads'
      );
    }
    // Only https, so the token never travels in clear text.
    if (new URL(url).protocol !== 'https:') {
      throw new ReadOnlyRefusal(
        'refusing a non-https request: the token would be sent in clear'
      );
    }
    // A redirect is refused, not followed: no response can send the read
    // elsewhere. A request that hangs fails after a minute.
    return fetchImpl(url, {
      method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
  };
}

/** The JWT's role claim, without verifying it (PostgREST does that). */
export function jwtRole(token) {
  try {
    const payload = String(token).split('.')[1] ?? '';
    const json = Buffer.from(
      payload.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8');
    return JSON.parse(json).role ?? null;
  } catch {
    return null;
  }
}

/**
 * Accepts only rate_worker: service_role bypasses row security, and other roles
 * (anon, authenticated, other workers) may see only some rows, which would make
 * the counts silently partial. rate_worker reads every row of these tables.
 */
export function checkRestRole(role) {
  if (role !== 'rate_worker') {
    throw new Error(
      `refusing to run: the access token's role is ${role ?? 'missing (not a JWT)'}, not rate_worker. Use the rate_worker session.`
    );
  }
  return 'PostgREST as rate_worker, GET requests only';
}

/**
 * Reads every row of a table page by page, by id (keyset: `id=gt.<last id>`),
 * so rows the crawler inserts meanwhile shift no page, and until an empty page,
 * so a server row cap below `pageSize` does not end the read early. `select`
 * must include `id`.
 */
export async function readTable(
  getFetch,
  { url, anonKey, accessToken },
  table,
  query,
  pageSize = 1000,
  onPage = null
) {
  const rows = [];
  let after = null;
  for (;;) {
    const target = new URL(`/rest/v1/${table}`, url);
    for (const [k, v] of Object.entries(query)) target.searchParams.set(k, v);
    target.searchParams.set('order', 'id.asc');
    target.searchParams.set('limit', String(pageSize));
    if (after !== null) target.searchParams.set('id', `gt.${after}`);
    let res;
    try {
      res = await getFetch(target.toString(), {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          'Accept-Profile': 'rate',
          Accept: 'application/json',
        },
      });
    } catch (err) {
      // The wrapper's own refusals carry no secret; a transport error can quote
      // the URL, so it is replaced by a fixed message.
      if (err instanceof ReadOnlyRefusal) throw err;
      throw new Error(`PostgREST read of rate.${table} could not be sent`);
    }
    if (!res.ok) {
      // The response body is not echoed: it can quote the request.
      throw new Error(
        `PostgREST read of rate.${table} failed (HTTP ${res.status})`
      );
    }
    let page;
    try {
      page = await res.json();
    } catch {
      throw new Error(`PostgREST read of rate.${table} returned no JSON`);
    }
    if (!Array.isArray(page)) {
      throw new Error(`PostgREST read of rate.${table} returned no rows array`);
    }
    if (page.length === 0) return rows;
    // With onPage the caller folds each page, so a large table is never held.
    if (onPage) onPage(page);
    else rows.push(...page);
    const last = page[page.length - 1]?.id;
    if (last === undefined || last === null || String(last) === String(after)) {
      throw new Error(`PostgREST read of rate.${table} did not advance by id`);
    }
    after = last;
  }
}

/** The dry run's input, read through PostgREST with GET requests only. */
export async function readViaPostgrest(
  rest,
  keyOf,
  { fetchImpl = globalThis.fetch, pageSize = 1000 } = {}
) {
  const role = checkRestRole(jwtRole(rest.accessToken));
  const getFetch = createGetOnlyFetch(fetchImpl);
  const masters = await readTable(
    getFetch,
    rest,
    'master_products',
    { select: 'id,model_key,status' },
    pageSize
  );
  const products = await readTable(
    getFetch,
    rest,
    'products',
    {
      select: 'id,cluster_id,title',
      cluster_id: 'not.is.null',
    },
    pageSize
  );
  const counts = new Map();
  await readTable(
    getFetch,
    rest,
    'price_history',
    { select: 'id,product_id' },
    pageSize,
    (page) => {
      for (const h of page)
        counts.set(h.product_id, (counts.get(h.product_id) ?? 0) + 1);
    }
  );
  return {
    role,
    data: {
      masters,
      listings: products.map((p) => ({
        id: p.id,
        master_id: p.cluster_id,
        key: keyOf(p.title ?? ''),
      })),
      priceRows: [...counts].map(([product_id, rows]) => ({
        product_id,
        rows,
      })),
    },
  };
}

function usage(message) {
  console.error(message);
  console.error(
    `usage: ${ENV_URL}=postgresql://... node scripts/ops/rekey-dry-run.mjs [--json] [--normalizer <path>] [--allow-write-capable-role]\n` +
      `   or: ${ENV_REST.url}=... ${ENV_REST.anonKey}=... ${ENV_REST.accessToken}=... node scripts/ops/rekey-dry-run.mjs --via-postgrest [--json] [--normalizer <path>]`
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
        'via-postgrest': { type: 'boolean', default: false },
      },
    }));
  } catch (err) {
    usage(err?.message ?? String(err));
  }
  if (values['via-postgrest']) {
    const rest = {
      url: process.env[ENV_REST.url],
      anonKey: process.env[ENV_REST.anonKey],
      accessToken: process.env[ENV_REST.accessToken],
    };
    for (const [k, name] of Object.entries(ENV_REST))
      if (!rest[k]) usage(`${name} is required with --via-postgrest`);
    try {
      const u = new URL(rest.url);
      // The project URL carries no credentials; a user or password there would
      // risk being quoted, so it is refused, as is plain http.
      if (u.username || u.password || u.protocol !== 'https:')
        throw new Error();
    } catch {
      usage(
        `${ENV_REST.url} must be the project's https URL, with no user or password`
      );
    }
    const keyOf = await loadKeyOf(values.normalizer);
    const { role, data } = await readViaPostgrest(rest, keyOf);
    const plan = planRekeys(data);
    if (values.json) {
      console.log(JSON.stringify({ role, ...plan }, null, 2));
    } else {
      console.log(`Read-only check: ${role}.`);
      for (const line of formatPlan(plan)) console.log(line);
    }
    return;
  }
  const url = process.env[ENV_URL];
  if (!url) usage(`${ENV_URL} is required (a read-only connection string)`);
  const env = pgEnvFromUrl(url);
  const keyOf = await loadKeyOf(values.normalizer);
  let role = '';
  const collector = createCollector({
    keyOf,
    onGuard: (guard) => {
      role = checkReadOnly(guard, {
        allowWriteCapableRole: values['allow-write-capable-role'],
      });
    },
  });
  await runSession(env, collector.line, spawn, {
    allowWriteCapableRole: values['allow-write-capable-role'],
  });
  const plan = planRekeys(collector.data);
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
