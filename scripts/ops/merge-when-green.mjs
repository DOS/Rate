#!/usr/bin/env node
// Merges a PR once every check run on its head commit has passed, pinned to
// that head so a commit pushed meanwhile is never merged unchecked.
//
//   node scripts/ops/merge-when-green.mjs <pr> [--repo DOS/Rate]
//     [--method squash|merge] [--require "<check name>"]...
//
// PRs into main always use a merge commit (Docs/Resources/RELEASE.md); other
// PRs default to squash, and a squashed head branch is deleted afterwards.
// Prints one line and exits 0 when merged, 1 when it cannot merge.

import { parseArgs } from 'node:util';
import { DEFAULT_REPO, fail, gh, ghJson, isMain, sleep } from './lib.mjs';

/** Bot checks that report late or never finish and gate nothing. */
export const IGNORED_CHECKS = ['DOS Code Review'];
/** Checks that must have reported before a PR in DOS/Rate is green. */
export const DEFAULT_REQUIRED = { 'DOS/Rate': ['Typecheck & Build Monorepo'] };
const PASSING = new Set(['success', 'skipped', 'neutral']);
const PROTECTED_BRANCHES = new Set(['main', 'dev', 'master']);
/** Polls a green but `blocked` PR gets before it is reported as blocked. */
export const BLOCKED_POLLS = 4;

/** A re-run adds a check run with the same name: keep the newest of each. */
export function latestRuns(checkRuns) {
  const byName = new Map();
  for (const run of checkRuns) {
    const seen = byName.get(run.name);
    if (!seen || run.id > seen.id) byName.set(run.name, run);
  }
  return [...byName.values()];
}

export function evaluateChecks(
  checkRuns,
  { ignore = IGNORED_CHECKS, required = [] } = {}
) {
  const runs = latestRuns(checkRuns).filter((r) => !ignore.includes(r.name));
  const failed = runs
    .filter((r) => r.status === 'completed' && !PASSING.has(r.conclusion))
    .map((r) => r.name);
  if (failed.length > 0) return { state: 'failed', failed };
  const pending = [
    ...runs.filter((r) => r.status !== 'completed').map((r) => r.name),
    ...required.filter((name) => !runs.some((r) => r.name === name)),
  ];
  // No check run yet means CI has not started, not that it passed.
  if (runs.length === 0 || pending.length > 0) {
    return { state: 'pending', pending };
  }
  return { state: 'passed' };
}

export function mergeMethodFor(baseRef, requested) {
  if (baseRef === 'main') {
    if (requested && requested !== 'merge') {
      throw new Error(
        `PRs into main merge with a merge commit, not ${requested} (RELEASE.md)`
      );
    }
    return 'merge';
  }
  if (requested && !['squash', 'merge'].includes(requested)) {
    throw new Error(`unknown merge method ${requested}`);
  }
  return requested ?? 'squash';
}

export function shouldDeleteBranch({ method, headRef, headRepo, baseRepo }) {
  return (
    method === 'squash' &&
    headRepo === baseRepo &&
    !PROTECTED_BRANCHES.has(headRef)
  );
}

/**
 * What to do with the PR now: 'merge', 'wait', or a final 'done' / 'fail'
 * with a one-line message.
 */
export function decide(pr, checks, blockedPolls) {
  if (pr.merged)
    return { action: 'done', message: `PR ${pr.number} already merged` };
  if (pr.state !== 'open')
    return { action: 'fail', message: `PR ${pr.number} is ${pr.state}` };
  if (pr.mergeable_state === 'dirty') {
    return { action: 'fail', message: `PR ${pr.number} has merge conflicts` };
  }
  if (checks.state === 'failed') {
    return {
      action: 'fail',
      message: `PR ${pr.number} failing at ${pr.head.sha.slice(0, 8)}: ${checks.failed.join(', ')}`,
    };
  }
  if (checks.state === 'pending') return { action: 'wait' };
  // GitHub recomputes mergeability a little after the last check finishes.
  if (pr.mergeable_state === 'blocked' || pr.mergeable_state === 'unknown') {
    return blockedPolls + 1 >= BLOCKED_POLLS
      ? {
          action: 'fail',
          message: `PR ${pr.number} is blocked at ${pr.head.sha.slice(0, 8)} although its checks passed (a required review or check is missing)`,
        }
      : { action: 'wait', blocked: true };
  }
  return { action: 'merge' };
}

export async function mergeWhenGreen({
  repo = DEFAULT_REPO,
  number,
  method: requested,
  required = DEFAULT_REQUIRED[repo] ?? [],
  intervalMs = 30_000,
  timeoutMs = 60 * 60_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let blockedPolls = 0;
  for (;;) {
    const pr = ghJson(['api', `repos/${repo}/pulls/${number}`]);
    const runs =
      pr.state === 'open'
        ? ghJson([
            'api',
            `repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`,
          ]).check_runs
        : [];
    const next = decide(pr, evaluateChecks(runs, { required }), blockedPolls);
    if (next.action === 'done') return { ok: true, message: next.message };
    if (next.action === 'fail') return { ok: false, message: next.message };
    if (next.action === 'merge') {
      const method = mergeMethodFor(pr.base.ref, requested);
      const merged = gh(
        [
          'api',
          '-X',
          'PUT',
          `repos/${repo}/pulls/${number}/merge`,
          '-f',
          `merge_method=${method}`,
          '-f',
          `sha=${pr.head.sha}`,
          '--jq',
          '.sha',
        ],
        { allowFailure: true }
      );
      if (merged.status !== 0) {
        return {
          ok: false,
          message: `PR ${number} merge refused: ${merged.stderr.trim()}`,
        };
      }
      if (
        shouldDeleteBranch({
          method,
          headRef: pr.head.ref,
          headRepo: pr.head.repo?.full_name,
          baseRepo: pr.base.repo.full_name,
        })
      ) {
        gh(
          [
            'api',
            '-X',
            'DELETE',
            `repos/${repo}/git/refs/heads/${pr.head.ref}`,
          ],
          {
            allowFailure: true,
          }
        );
      }
      return {
        ok: true,
        message: `PR ${number} MERGED ${merged.stdout.trim()}`,
      };
    }
    blockedPolls = next.blocked ? blockedPolls + 1 : 0;
    if (Date.now() > deadline) {
      return {
        ok: false,
        message: `PR ${number} still not green after ${timeoutMs / 60_000} min`,
      };
    }
    await sleep(intervalMs);
  }
}

if (isMain(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      repo: { type: 'string', default: DEFAULT_REPO },
      method: { type: 'string' },
      require: { type: 'string', multiple: true },
    },
  });
  const number = Number(positionals[0]);
  if (!Number.isInteger(number) || number < 1) {
    fail(
      'usage: merge-when-green.mjs <pr> [--repo owner/name] [--method squash|merge] [--require <check>]'
    );
  }
  const result = await mergeWhenGreen({
    repo: values.repo,
    number,
    method: values.method,
    required: values.require ?? DEFAULT_REQUIRED[values.repo] ?? [],
  });
  if (!result.ok) fail(result.message);
  console.log(result.message);
}
