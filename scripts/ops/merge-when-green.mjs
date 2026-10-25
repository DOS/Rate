#!/usr/bin/env node
// Merges a PR once its head commit is green, pinned to that head so a commit
// pushed meanwhile is never merged unchecked. Green means every check run and
// every commit status (Vercel posts statuses, not check runs) passed, and the
// checks the branch's rulesets require have reported.
//
//   node scripts/ops/merge-when-green.mjs <pr> [--repo DOS/Rate]
//     [--method squash|merge] [--require "<check>"]... [--ignore "<check>"]...
//
// In DOS/Rate, PRs into main always use a merge commit (Docs/Resources/RELEASE.md);
// other PRs, and every PR in a repository without that release flow, default
// to squash, and a squashed head branch is deleted afterwards.
// --ignore lets a known-broken, non-required check through; name it in the PR.
// Prints one line and exits 0 when merged, 1 when it cannot merge.

import { parseArgs } from 'node:util';
import {
  DEFAULT_REPO,
  encodeRef,
  fail,
  gh,
  ghJson,
  ghPaginated,
  isMain,
  sleep,
} from './lib.mjs';

/** Bot reviews that report late or never finish and gate nothing. */
export const IGNORED_CHECKS = ['DOS Code Review', 'CodeRabbit'];
const PASSING = new Set(['success', 'skipped', 'neutral']);
const PROTECTED_BRANCHES = new Set(['main', 'dev', 'master']);
/** Polls a green but `blocked` PR gets before it is reported as blocked. */
export const BLOCKED_POLLS = 6;
/** Consecutive GitHub API errors tolerated before giving up. */
const MAX_API_ERRORS = 3;
/** Merge refusals retried after a fresh read of the head. */
const MAX_MERGE_REFUSALS = 3;
/** Times a PR behind a strict base is brought up to date before giving up. */
export const MAX_BRANCH_UPDATES = 5;

/** Required checks an --ignore would hide: that can never turn green. */
export const ignoredRequired = (required, ignore) =>
  required.filter((name) => ignore.includes(name));

/** A re-run adds a check run with the same name: keep the newest of each. */
export function latestRuns(checkRuns) {
  const byName = new Map();
  for (const run of checkRuns) {
    const seen = byName.get(run.name);
    if (!seen || run.id > seen.id) byName.set(run.name, run);
  }
  return [...byName.values()];
}

/**
 * `checkRuns` from the check-runs API, `statuses` from the combined status
 * API (already the latest per context).
 */
export function evaluateChecks(
  checkRuns,
  statuses = [],
  { ignore = IGNORED_CHECKS, required = [] } = {}
) {
  const runs = latestRuns(checkRuns).filter((r) => !ignore.includes(r.name));
  const contexts = statuses.filter((s) => !ignore.includes(s.context));
  const failed = [
    ...runs
      .filter((r) => r.status === 'completed' && !PASSING.has(r.conclusion))
      .map((r) => r.name),
    ...contexts
      .filter((s) => s.state === 'failure' || s.state === 'error')
      .map((s) => s.context),
  ];
  if (failed.length > 0) return { state: 'failed', failed };
  const reported = new Set([
    ...runs.map((r) => r.name),
    ...contexts.map((s) => s.context),
  ]);
  const pending = [
    ...runs.filter((r) => r.status !== 'completed').map((r) => r.name),
    ...contexts.filter((s) => s.state === 'pending').map((s) => s.context),
    ...required.filter((name) => !reported.has(name)),
  ];
  // No check run yet means CI has not started, not that it passed.
  if (runs.length === 0 || pending.length > 0) {
    return { state: 'pending', pending };
  }
  return { state: 'passed' };
}

/** Check names the branch's rulesets require, from the rules API. */
export function requiredChecksFromRules(rules) {
  return [
    ...new Set(
      (rules ?? [])
        .filter((r) => r.type === 'required_status_checks')
        .flatMap((r) => r.parameters?.required_status_checks ?? [])
        .map((c) => c.context)
    ),
  ];
}

/**
 * Repositories whose `main` only takes the dev to main promotion and hotfixes,
 * always as merge commits (Docs/Resources/RELEASE.md). Elsewhere `main` is the
 * working branch and PRs squash like any other.
 */
export const RELEASE_FLOW_REPOS = new Set(['dos/rate']);

export function mergeMethodFor(baseRef, requested, repo = DEFAULT_REPO) {
  // GitHub repository names are case-insensitive: `dos/rate` is DOS/Rate.
  if (baseRef === 'main' && RELEASE_FLOW_REPOS.has(repo.toLowerCase())) {
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
  // A strict ruleset counts checks only on a head that contains the latest
  // base: bring the branch up to date and wait for the new head's checks.
  // Never for a shared branch (a dev to main promotion: that update would push
  // an unreviewed back-merge to dev, see RELEASE.md) or a fork's branch.
  if (pr.mergeable_state === 'behind') {
    const headRef = pr.head.ref;
    const fork =
      pr.head.repo?.full_name &&
      pr.base.repo?.full_name &&
      pr.head.repo.full_name !== pr.base.repo.full_name;
    if (PROTECTED_BRANCHES.has(headRef) || fork) {
      return {
        action: 'fail',
        message: `PR ${pr.number} is behind ${pr.base.ref}; its head ${headRef} is ${fork ? 'a fork branch' : 'a shared branch'}, so it is not updated automatically (back-merge ${pr.base.ref} into ${headRef} through a PR, Docs/Resources/RELEASE.md)`,
      };
    }
    return { action: 'update' };
  }
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

function readHead(repo, number) {
  const pr = ghJson(['api', `repos/${repo}/pulls/${number}`]);
  if (pr.state !== 'open') return { pr, runs: [], statuses: [], required: [] };
  const runs = ghPaginated(
    `repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`,
    '.check_runs[] | {id, name, status, conclusion}'
  );
  const statuses =
    ghJson(['api', `repos/${repo}/commits/${pr.head.sha}/status`])?.statuses ??
    [];
  const rules = ghJson([
    'api',
    `repos/${repo}/rules/branches/${encodeRef(pr.base.ref)}`,
  ]);
  return { pr, runs, statuses, required: requiredChecksFromRules(rules) };
}

export async function mergeWhenGreen({
  repo = DEFAULT_REPO,
  number,
  method: requested,
  required: extraRequired = [],
  ignore = [],
  intervalMs = 30_000,
  timeoutMs = 60 * 60_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let blockedPolls = 0;
  let apiErrors = 0;
  let mergeRefusals = 0;
  let branchUpdates = 0;
  let lastUpdatedSha = null;
  for (;;) {
    // Every path back to the top of the loop is bounded by this deadline.
    if (Date.now() > deadline) {
      return {
        ok: false,
        message: `PR ${number} still not mergeable after ${timeoutMs / 60_000} min`,
      };
    }
    let head;
    try {
      head = readHead(repo, number);
      apiErrors = 0;
    } catch (err) {
      if (++apiErrors >= MAX_API_ERRORS) {
        return { ok: false, message: `PR ${number}: ${err.message}` };
      }
      await sleep(intervalMs);
      continue;
    }
    const { pr } = head;
    // Refuse a wrong method or an ignored required check before waiting, not
    // after the checks pass; both are re-read each poll (a PR can be
    // retargeted).
    let method = null;
    if (pr.state === 'open') {
      try {
        method = mergeMethodFor(pr.base.ref, requested, repo);
      } catch (err) {
        return { ok: false, message: `PR ${number}: ${err.message}` };
      }
      const conflict = ignoredRequired(head.required, ignore);
      if (conflict.length > 0) {
        return {
          ok: false,
          message: `PR ${number}: cannot --ignore required check(s) ${conflict.join(', ')}`,
        };
      }
    }
    const checks = evaluateChecks(head.runs, head.statuses, {
      ignore: [...IGNORED_CHECKS, ...ignore],
      required: [...head.required, ...extraRequired],
    });
    const next = decide(pr, checks, blockedPolls);
    if (next.action === 'done') return { ok: true, message: next.message };
    if (next.action === 'fail') return { ok: false, message: next.message };
    if (next.action === 'update') {
      // update-branch is asynchronous: until the new head appears, the old
      // head still reads as behind. Wait for it instead of updating again.
      if (pr.head.sha === lastUpdatedSha) {
        await sleep(intervalMs);
        continue;
      }
      if (++branchUpdates > MAX_BRANCH_UPDATES) {
        return {
          ok: false,
          message: `PR ${number} is still behind ${pr.base.ref} after ${MAX_BRANCH_UPDATES} updates (the base keeps moving)`,
        };
      }
      const updated = gh(
        [
          'api',
          '-X',
          'PUT',
          `repos/${repo}/pulls/${number}/update-branch`,
          '-f',
          `expected_head_sha=${pr.head.sha}`,
        ],
        { allowFailure: true }
      );
      if (updated.status !== 0) {
        return {
          ok: false,
          message: `PR ${number} is behind ${pr.base.ref} and could not be updated: ${updated.stderr.trim()}`,
        };
      }
      lastUpdatedSha = pr.head.sha;
      console.log(`PR ${number} was behind ${pr.base.ref}: branch updated`);
      await sleep(intervalMs);
      continue;
    }
    if (next.action === 'merge') {
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
        // A check re-queued after the last read (for example by a PR edit)
        // makes GitHub refuse briefly: read the head again before giving up.
        if (++mergeRefusals < MAX_MERGE_REFUSALS) {
          await sleep(intervalMs);
          continue;
        }
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
            `repos/${repo}/git/refs/heads/${encodeRef(pr.head.ref)}`,
          ],
          { allowFailure: true }
        );
      }
      return {
        ok: true,
        message: `PR ${number} MERGED ${merged.stdout.trim()}`,
      };
    }
    blockedPolls = next.blocked ? blockedPolls + 1 : 0;
    if (Date.now() > deadline) {
      const waiting = checks.pending?.length
        ? ` (waiting on ${checks.pending.join(', ')})`
        : '';
      return {
        ok: false,
        message: `PR ${number} still not green after ${timeoutMs / 60_000} min${waiting}`,
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
      ignore: { type: 'string', multiple: true },
    },
  });
  const number = Number(positionals[0]);
  if (!Number.isInteger(number) || number < 1) {
    fail(
      'usage: merge-when-green.mjs <pr> [--repo owner/name] [--method squash|merge] [--require <check>]... [--ignore <check>]...'
    );
  }
  const result = await mergeWhenGreen({
    repo: values.repo,
    number,
    method: values.method,
    required: values.require ?? [],
    ignore: values.ignore ?? [],
  });
  if (!result.ok) fail(result.message);
  console.log(result.message);
}
