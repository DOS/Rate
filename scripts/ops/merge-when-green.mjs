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

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
 * commitlint's limit (commitlint.config.ts) for the header and for every body
 * and footer line. The commitlint check of a dev to main promotion lints the
 * head of dev, which is usually a squash commit made here (DOS/Rate#1130).
 */
export const MAX_LINE = 100;
// commitlint exempts any line holding a URL from the line limit.
const URL_LINE = /\bhttps?:\/\/\S+/;
const TRAILER = /^(?:co-authored-by|signed-off-by):\s*\S/i;
const LIST_MARKER = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?/;

/**
 * One line as lines of at most `width` characters: words wrap under the text
 * of a list item, and a word longer than a whole line is split.
 */
export function wrapLine(line, width = MAX_LINE) {
  if (!(width >= 2)) throw new RangeError(`cannot wrap to width ${width}`);
  if (line.length <= width || URL_LINE.test(line)) return [line];
  const marker = line.match(LIST_MARKER)[0];
  const first = marker.length <= width / 2 ? marker : '';
  const hang = ' '.repeat(first.length);
  const lines = [];
  let current = first;
  let empty = true;
  for (let word of line.slice(first.length).split(/\s+/).filter(Boolean)) {
    for (;;) {
      const sep = empty ? '' : ' ';
      if (current.length + sep.length + word.length <= width) {
        current += sep + word;
        empty = false;
        break;
      }
      if (empty) {
        // Not even an empty line holds the word: split it.
        // Cut between characters, never inside a surrogate pair.
        const room = width - current.length;
        let piece = '';
        for (const char of word) {
          if (piece.length + char.length > room) break;
          piece += char;
        }
        if (piece === '') piece = word.slice(0, Math.max(room, 1));
        lines.push(current + piece);
        word = word.slice(piece.length);
        current = hang;
        continue;
      }
      lines.push(current);
      current = hang;
      empty = true;
    }
  }
  if (!empty) lines.push(current);
  return lines;
}

// `type(scope)!: subject`, the header shape commitlint's parser reads.
const CONVENTIONAL_HEADER = /^[a-z]+(?:\([^()\r\n]*\))?!?: \S/;

/**
 * The squash commit's header: the PR title with its number, which promote.mjs
 * reads back. Null when the title is not a conventional header or the header
 * is over the limit: cutting it could leave an empty or start-case subject.
 */
export function squashTitle(title, number) {
  const text = title.trim().replace(/\s+/g, ' ');
  const header = `${text} (#${number})`;
  return CONVENTIONAL_HEADER.test(text) && header.length <= MAX_LINE
    ? header
    : null;
}

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COMMITLINT_CLI = 'node_modules/@commitlint/cli/cli.js';
export const LINT_TIMEOUT_MS = 60_000;

/**
 * Lints a squash header with the repository's own commitlint config
 * (commitlint.config.ts), as the commitlint check will: type-enum, case,
 * length and the rest. The shape check in squashTitle let "ux(web): ..." through
 * (DOS/Rate#1513). Fails closed when commitlint cannot run, so no header is
 * merged unchecked. `problems` holds commitlint's own lines.
 */
export function lintHeader(
  header,
  { cwd = REPO_ROOT, spawnFn = spawnSync } = {}
) {
  if (!existsSync(path.join(cwd, COMMITLINT_CLI))) {
    return {
      ok: false,
      problems: [
        `commitlint is not installed (${COMMITLINT_CLI}): run pnpm install`,
      ],
    };
  }
  // A hung commitlint fails closed after a minute instead of holding the merge.
  const r = spawnFn(process.execPath, [COMMITLINT_CLI], {
    cwd,
    input: header,
    encoding: 'utf8',
    timeout: LINT_TIMEOUT_MS,
  });
  if (r.error || r.status === null) {
    return { ok: false, problems: ['commitlint could not run or timed out'] };
  }
  if (r.status === 0) return { ok: true, problems: [] };
  // commitlint prints "✖   <problem> [rule]" lines, coloured on a terminal.
  // eslint-disable-next-line no-control-regex
  const plain = `${r.stdout}\n${r.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
  const problems = plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^✖\s+/.test(l) && !/found \d+ problems?/.test(l))
    .map((l) => l.replace(/^✖\s+/, ''));
  // With no "✖" line (a broken config, say), the first lines of its output say why.
  const head = plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' | ');
  return {
    ok: false,
    problems:
      problems.length > 0
        ? problems
        : [`commitlint exited ${r.status}${head ? `: ${head}` : ''}`],
  };
}

/**
 * The squash commit's body, like GitHub's default (each commit as a list
 * item), with every line wrapped to the limit and the commits' co-author and
 * sign-off trailers gathered once each into a footer after a blank line.
 */
export function squashBody(messages) {
  const trailers = new Map();
  const items = [];
  for (const message of messages) {
    const lines = [];
    for (const line of message.replace(/\r\n?/g, '\n').split('\n')) {
      if (TRAILER.test(line.trim())) {
        const trailer = line.trim().replace(/:\s*/, ': ');
        const key = trailer.toLowerCase();
        if (!trailers.has(key)) trailers.set(key, trailer);
      } else {
        lines.push(line.trimEnd());
      }
    }
    while (lines.length > 0 && lines.at(-1) === '') lines.pop();
    while (lines.length > 0 && lines[0] === '') lines.shift();
    if (lines.length === 0) continue;
    lines[0] = `* ${lines[0]}`;
    items.push(lines.flatMap((line) => wrapLine(line)).join('\n'));
  }
  // A wrapped trailer no longer credits anyone: leave out one too long.
  const footer = [...trailers.values()].filter(
    (line) => line.length <= MAX_LINE
  );
  return [items.join('\n\n'), footer.join('\n')].filter(Boolean).join('\n\n');
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
  lint = lintHeader,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  const timedOut = () => ({
    ok: false,
    message: `PR ${number} still not mergeable after ${timeoutMs / 60_000} min`,
  });
  const headerLints = new Map();
  let blockedPolls = 0;
  let apiErrors = 0;
  let mergeRefusals = 0;
  let commitListErrors = 0;
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
      if (method === 'squash') {
        const header = squashTitle(pr.title, number);
        if (!header) {
          return {
            ok: false,
            message: `PR ${number}: its title must be a conventional header that fits "<title> (#${number})" in ${MAX_LINE} characters, so the squash commit passes commitlint`,
          };
        }
        // Linted once per header: the title is re-read each poll and may change.
        if (!headerLints.has(header)) headerLints.set(header, lint(header));
        const linted = headerLints.get(header);
        if (!linted.ok) {
          return {
            ok: false,
            message: `PR ${number}: commitlint rejects the squash header "${header}": ${linted.problems.join('; ')}`,
          };
        }
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
      if (Date.now() > deadline) return timedOut();
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
      // GitHub's default squash message keeps the commits' long lines and
      // mixes their trailers into the body: send one commitlint accepts.
      const squash = {};
      if (method === 'squash') {
        let messages;
        try {
          messages = ghPaginated(
            `repos/${repo}/pulls/${number}/commits?per_page=100`,
            '.[] | {message: .commit.message}'
          ).map((c) => c.message);
          commitListErrors = 0;
        } catch (err) {
          if (++commitListErrors >= MAX_API_ERRORS) {
            return {
              ok: false,
              message: `PR ${number}: cannot list its commits: ${err.message}`,
            };
          }
          await sleep(intervalMs);
          continue;
        }
        // The commits API stops at 250: never write a body that drops some.
        if (messages.length < pr.commits) {
          return {
            ok: false,
            message: `PR ${number}: only ${messages.length} of its ${pr.commits} commits could be listed for the squash message`,
          };
        }
        squash.commit_title = squashTitle(pr.title, number);
        squash.commit_message = squashBody(messages);
      }
      // The lint and the commit listing may have taken a while: no write to
      // GitHub, this merge or the branch update above, goes out past the deadline.
      if (Date.now() > deadline) return timedOut();
      // The fields go as JSON on stdin: a long squash message is over the
      // Windows command line limit.
      const merged = gh(
        [
          'api',
          '-X',
          'PUT',
          `repos/${repo}/pulls/${number}/merge`,
          '--input',
          '-',
          '--jq',
          '.sha',
        ],
        {
          allowFailure: true,
          input: JSON.stringify({
            merge_method: method,
            sha: pr.head.sha,
            ...squash,
          }),
        }
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
