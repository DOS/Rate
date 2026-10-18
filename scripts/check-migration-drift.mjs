#!/usr/bin/env node
// Compares this repo's reference copy of the `rate` schema migrations
// (supabase/migrations) with the only deployable ledger, DOS/DOS.Me
// supabase/migrations. A migration that exists only here is never applied to
// any environment, so code that calls its RPCs breaks once it reaches beta/prod.
//
// Usage: node scripts/check-migration-drift.mjs [--ref dev] [--ledger <path>]
//   --ledger <path>  read a local DOS-Me checkout instead of the GitHub API
//   default          read DOS/DOS.Me through `gh api` (needs gh auth with access)
// Exit code 1 when any file is missing from the ledger or differs from it.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localDir = path.join(repoRoot, 'supabase', 'migrations');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ref = opt('--ref', 'dev');
const ledgerPath = opt('--ledger', null);

// Line endings and trailing whitespace differ between checkouts on Windows.
const normalize = (sql) =>
  sql
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

function gh(apiPath) {
  return execFileSync('gh', ['api', apiPath, '-H', 'Accept: application/vnd.github.raw'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function ledgerNames() {
  if (ledgerPath) {
    return readdirSync(path.join(ledgerPath, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'));
  }
  const listing = JSON.parse(
    execFileSync('gh', ['api', `repos/DOS/DOS.Me/contents/supabase/migrations?ref=${ref}`, '--paginate'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }).replace(/\]\s*\[/g, ',')
  );
  return listing.map((e) => e.name).filter((n) => n.endsWith('.sql'));
}

function ledgerContent(name) {
  if (ledgerPath) return readFileSync(path.join(ledgerPath, 'supabase', 'migrations', name), 'utf8');
  return gh(`repos/DOS/DOS.Me/contents/supabase/migrations/${name}?ref=${ref}`);
}

const isRateMigration = (name) => /^\d+_(rate_|init_rate_schema|jreviews_|review_votes)/.test(name);

const local = readdirSync(localDir).filter((f) => f.endsWith('.sql')).sort();
const ledger = new Set(ledgerNames());

const missing = [];
const differs = [];
const matches = [];
for (const name of local) {
  if (!ledger.has(name)) {
    missing.push(name);
    continue;
  }
  const same = normalize(readFileSync(path.join(localDir, name), 'utf8')) === normalize(ledgerContent(name));
  (same ? matches : differs).push(name);
}
const onlyInLedger = [...ledger].filter((n) => isRateMigration(n) && !local.includes(n)).sort();

const source = ledgerPath ? `local ledger ${ledgerPath}` : `DOS/DOS.Me@${ref}`;
console.log(`Rate migration drift vs ${source}`);
console.log(`  identical: ${matches.length}`);
for (const n of differs) console.log(`  DIFFERS:        ${n}`);
for (const n of missing) console.log(`  NOT IN LEDGER:  ${n}`);
for (const n of onlyInLedger) console.log(`  only in ledger: ${n}`);

if (!existsSync(localDir) || differs.length || missing.length) {
  console.error(
    '\nDrift found. Migrations only take effect through DOS/DOS.Me; sync these files there (PR with the rate replay test) or fix the copy here.'
  );
  process.exit(1);
}
console.log('\nNo drift: every reference migration is in the ledger with the same content.');
