#!/usr/bin/env node
// Hermetic browser E2E for apps/web: no real Supabase, no secrets.
//
//   1. PostgreSQL 17 with every migration (scripts/lib/rate-db.mjs) plus
//      apps/web/e2e/seed.sql.
//   2. PostgREST on the `rate` schema, behind a local proxy that serves it at
//      /rest/v1 like Supabase does. The anon key is a JWT signed here with a
//      throwaway test secret.
//   3. `next build` (unless --skip-build) and `next start` against that proxy.
//   4. Playwright specs in apps/web/e2e.
//
// Usage: node scripts/e2e/run.mjs [--skip-build] [--serve] [-- <playwright args>]
//   --serve keeps the stack up for manual debugging instead of running the specs.
// Needs Docker and a Playwright Chromium (`pnpm exec playwright install chromium`).

import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

import { docker, repoRoot, startRateDb } from '../lib/rate-db.mjs';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const serveOnly = args.includes('--serve');
const playwrightArgs = args.includes('--')
  ? args.slice(args.indexOf('--') + 1)
  : [];

const SUPABASE_PORT = Number(process.env.E2E_SUPABASE_PORT || 54399);
const POSTGREST_IMAGE =
  'postgrest/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df';
// Not a secret: it only signs tokens for the throwaway PostgREST below. Fixed so
// that a --skip-build rerun matches the anon key inlined by the last build.
const JWT_SECRET =
  'rate-e2e-throwaway-postgrest-jwt-secret-not-used-anywhere-else';
const AUTHENTICATOR_PASSWORD = 'local-test-only';

const id = `rate-e2e-${process.pid}`;
const network = id;
const dbName = `${id}-db`;
const restName = `${id}-rest`;

const base64url = (value) => Buffer.from(value).toString('base64url');
function signJwt(payload) {
  const unsigned = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}`;
  return `${unsigned}.${createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url')}`;
}
const anonKey = signJwt({
  role: 'anon',
  iss: 'rate-e2e',
  iat: 1_760_000_000,
  exp: 4_102_444_800,
});

const children = [];
let proxyServer;
function cleanup() {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    else {
      try {
        process.kill(-child.pid, 'SIGTERM'); // the whole group: pnpm and the next server under it
      } catch {
        // already gone
      }
    }
  }
  proxyServer?.close();
  spawnSync('docker', ['rm', '--force', restName, dbName], { timeout: 30_000 });
  spawnSync('docker', ['network', 'rm', network], { timeout: 30_000 });
}
process.on('uncaughtException', (err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Free TCP port on 127.0.0.1; the web port is not baked into the build. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, label, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child?.spawnError) throw child.spawnError;
    if (child && child.exitCode !== null)
      throw new Error(
        `${label} exited with ${child.exitCode} before it was ready`
      );
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    if (Date.now() >= deadline)
      throw new Error(`${label} did not become ready at ${url}`);
    await sleep(500);
  }
}

function start(command, commandArgs, env) {
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    // No stdin: a detached process group that reads the terminal is stopped.
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  });
  child.on('error', (err) => {
    // A failed spawn never sets exitCode; waitForHttp checks this instead.
    child.spawnError = err;
    console.error(`${command}: ${err.message}`);
  });
  children.push(child);
  return child;
}

// Asynchronous on purpose: the proxy runs in this process and must keep
// answering while `next build` and Playwright query it.
function run(command, commandArgs, env) {
  return new Promise((resolve, reject) => {
    const child = start(command, commandArgs, env);
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`)
          )
    );
  });
}

/**
 * Serves PostgREST at /rest/v1 like Supabase; every other path is a 404. Any
 * query matching one of FAULT_RULES answers 500 (a 503 would also trip
 * postgrest-js retries and only slow the spec down), so a spec can simulate a database
 * outage for one URL without disturbing specs running in parallel.
 */
const MAX_REQUEST_URL_LENGTH = 8_000;
// Each rule matches the decoded request path; all are scoped so that batch
// reads covering many rows (in.() lists) keep working for parallel specs.
const FAULT_RULES = [
  (url) => url.includes('e2e-fault'),
  // Listing query of the seeded "faulty-listings-store" merchant.
  (url) => url.includes('merchant_id=eq.eeeeeeee-eeee-4eee-8eee-eeeeeeeefa17'),
  // Price history of the seeded "e2e-price-fault-phone" (its single offer).
  (url) =>
    url.startsWith('/rest/v1/price_history?') &&
    url.includes('product_id=in.(cccccccc-cccc-4ccc-8ccc-ccccccccfa17)'),
];
function startProxy(upstreamPort) {
  proxyServer = http.createServer((req, res) => {
    if (!req.url?.startsWith('/rest/v1/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"message":"not served by the e2e stack"}');
      return;
    }
    // Like the hosted gateway, refuse oversized request lines instead of
    // forwarding them, so unchunked in.() filters fail here too.
    if (req.url.length > MAX_REQUEST_URL_LENGTH) {
      res.writeHead(414, { 'content-type': 'application/json' });
      res.end('{"message":"request URI too long"}');
      return;
    }
    const decodedUrl = decodeURIComponent(req.url);
    if (FAULT_RULES.some((matches) => matches(decodedUrl))) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"message":"simulated outage","code":"XX000"}');
      return;
    }
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: upstreamPort,
        method: req.method,
        path: req.url.slice('/rest/v1'.length),
        headers: { ...req.headers, host: `127.0.0.1:${upstreamPort}` },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );
    upstream.on('error', (err) => {
      if (res.headersSent) {
        res.destroy(err);
        return;
      }
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: err.message }));
    });
    req.pipe(upstream);
  });
  return new Promise((resolve, reject) => {
    proxyServer.once('error', (err) =>
      reject(
        new Error(
          `proxy cannot listen on 127.0.0.1:${SUPABASE_PORT} (${err.message}); set E2E_SUPABASE_PORT`
        )
      )
    );
    proxyServer.listen(SUPABASE_PORT, '127.0.0.1', resolve);
  });
}

let exitCode = 1;
try {
  docker(['network', 'create', network]);
  const db = startRateDb({
    name: dbName,
    runArgs: ['--network', network, '--network-alias', 'db'],
  });
  db.sql(`CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${AUTHENTICATOR_PASSWORD}';
    GRANT anon, authenticated, service_role TO authenticator;`);
  db.sql(
    readFileSync(path.join(repoRoot, 'apps', 'web', 'e2e', 'seed.sql'), 'utf8')
  );

  docker(
    [
      // No --rm: keep a crashed PostgREST around for its logs; cleanup() removes it.
      'run',
      '--detach',
      '--name',
      restName,
      '--network',
      network,
      '-p',
      '127.0.0.1::3000',
      '-e',
      `PGRST_DB_URI=postgres://authenticator:${AUTHENTICATOR_PASSWORD}@db:5432/postgres`,
      '-e',
      'PGRST_DB_SCHEMAS=rate',
      '-e',
      'PGRST_DB_ANON_ROLE=anon',
      '-e',
      `PGRST_JWT_SECRET=${JWT_SECRET}`,
      POSTGREST_IMAGE,
    ],
    { timeout: 120_000 }
  );
  const supabaseUrl = `http://127.0.0.1:${SUPABASE_PORT}`;
  try {
    const restPort = Number(
      docker(['port', restName, '3000/tcp']).split('\n')[0].split(':').pop()
    );
    await startProxy(restPort);
    await waitForHttp(
      `${supabaseUrl}/rest/v1/categories?select=slug`,
      'PostgREST',
      60_000
    );
  } catch (err) {
    const logs = spawnSync('docker', ['logs', restName], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    console.error(`${logs.stdout}${logs.stderr}`);
    throw err;
  }

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: anonKey,
    NEXT_TELEMETRY_DISABLED: '1',
    // Set so a developer's apps/web/.env.local cannot change the build (Next
    // only fills keys that are absent): default output, local public URL.
    NEXT_OUTPUT: '',
    APP_PUBLIC_URL: 'http://localhost',
  };
  if (!skipBuild) {
    // --ui=stream: turbo's TUI would take over the terminal from a detached child.
    const build = () =>
      run(
        'pnpm',
        ['exec', 'turbo', 'run', 'build', '--filter=@repo/web', '--ui=stream'],
        env
      );
    try {
      await build();
    } catch {
      // Same transient next/font (Google Fonts) fetch failures the verify job retries.
      console.warn('Build failed; retrying once in 3s...');
      await sleep(3_000);
      await build();
    }
  }

  // unstable_cache persists in .next/cache/fetch-cache, outside the build
  // output; a previous run's entries would answer instead of this database.
  rmSync(path.join(repoRoot, 'apps', 'web', '.next', 'cache', 'fetch-cache'), {
    recursive: true,
    force: true,
  });
  const webPort = Number(process.env.E2E_WEB_PORT) || (await freePort());
  // `localhost`, not 127.0.0.1: next-intl rewrites to a `localhost` URL, and when
  // the server is bound to another hostname Next proxies that rewrite as an
  // external request, which then redirects back to itself in a loop.
  const baseUrl = `http://localhost:${webPort}`;
  const web = start(
    'pnpm',
    ['--filter', '@repo/web', 'exec', 'next', 'start', '-p', String(webPort)],
    env
  );
  await waitForHttp(`${baseUrl}/api/health`, 'next start', 120_000, web);

  if (serveOnly) {
    console.log(
      `E2E stack ready: web ${baseUrl}, PostgREST ${supabaseUrl}/rest/v1 (Ctrl+C to stop)`
    );
    await new Promise(() => {});
  }
  await run(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '-c',
      'apps/web/e2e/playwright.config.ts',
      ...playwrightArgs,
    ],
    {
      ...env,
      E2E_BASE_URL: baseUrl,
    }
  );
  exitCode = 0;
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
} finally {
  cleanup();
}
process.exit(exitCode);
