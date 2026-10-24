// Shared helpers for the agent release scripts in scripts/ops (DOS/Rate#865).
// They drive the GitHub CLI with argument arrays, never a shell string, so no
// value is ever interpreted by a shell.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_REPO = 'DOS/Rate';

export function gh(args, { allowFailure = false } = {}) {
  const r = spawnSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0 && !allowFailure) {
    throw new Error(
      `gh ${args[0]} ${args[1] ?? ''} failed: ${r.stderr.trim()}`
    );
  }
  return r;
}

export function ghJson(args) {
  const out = gh(args).stdout.trim();
  return out ? JSON.parse(out) : null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isMain = (url) =>
  url === pathToFileURL(process.argv[1] ?? '').href;

/** Prints the message and exits non-zero: the scripts' one failure path. */
export function fail(message) {
  console.error(message);
  process.exit(1);
}
