// Throwaway PostgreSQL 17 container shaped like the shared Supabase project,
// with every file in supabase/migrations applied. Shared by the migration
// replay test and the browser E2E stack. Needs Docker.

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

export function readMigrations() {
  const migDir = path.join(repoRoot, 'supabase', 'migrations');
  return readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(path.join(migDir, f), 'utf8') }));
}

export function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 60_000,
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Starts the container and applies the migrations (each `passes` times, to
 * prove idempotency). `runArgs` are extra `docker run` flags such as
 * `--network`. Returns helpers bound to the container; call `stop()` in a
 * finally block. A timed-out `docker run` may still have created the
 * container, so `stop()` is safe to call after any failure.
 */
export function startRateDb({
  name,
  runArgs = [],
  passes = 1,
  migrations = readMigrations(),
}) {
  const sql = (input) =>
    docker(
      [
        'exec',
        '-i',
        name,
        'psql',
        '-XqAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
      ],
      { input }
    );
  const asRole = (role, query) =>
    sql(`SET ROLE ${role}; ${query}; RESET ROLE;`);
  const stop = () =>
    spawnSync('docker', ['rm', '--force', name], { timeout: 30_000 });

  docker(
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '-e',
      'POSTGRES_PASSWORD=local-test-only',
      ...runArgs,
      'postgres:17-alpine',
    ],
    {
      timeout: 120_000,
    }
  );
  const deadline = Date.now() + 60_000;
  for (;;) {
    const logs = spawnSync('docker', ['logs', name], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    const ready = spawnSync(
      'docker',
      ['exec', name, 'pg_isready', '-U', 'postgres'],
      { timeout: 5_000 }
    );
    const boots =
      `${logs.stdout}\n${logs.stderr}`.match(
        /database system is ready to accept connections/g
      )?.length ?? 0;
    if (boots >= 2 && ready.status === 0) break;
    if (Date.now() >= deadline)
      throw new Error('temporary PostgreSQL did not become ready');
    sleep(250);
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

  for (const m of migrations) {
    for (let pass = 1; pass <= passes; pass++) {
      try {
        sql(m.sql);
      } catch (err) {
        throw new Error(`${m.name} failed on pass ${pass}: ${err.message}`);
      }
    }
  }

  return { sql, asRole, stop };
}
