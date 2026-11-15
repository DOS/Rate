// The atomic claim lock behind `board.mjs` (DOS/Rate#1673). Format and
// claimant rules: scripts/claim-lock.mjs.
//
// - Take: create refs/claims/<n>. GitHub creates a ref only when it does not
//   exist yet (HTTP 422 otherwise), so of two sessions claiming at once
//   exactly one wins; the other reads the winner and fails naming it.
// - Re-claim by the holder changes nothing.
// - Take-over (a hand-over or JOY's assignment): replace the lock with
//   GraphQL `updateRefs`, which applies only while the ref still points at the
//   lock that was read (`beforeOid`), so a lock that changed meanwhile is never
//   overwritten. (REST PATCH with force=false does not refuse a stale update
//   on refs/claims, verified 2026-11-15, so it is not used.)
// - Release: delete the ref, only by the holder, or by anyone once the issue
//   is closed. `forceRelease` (PO only) deletes it whoever holds it. GitHub
//   has no conditional ref delete (updateRefs with a zero afterOid did not
//   delete, verified 2026-11-15), so a take-over landing between a release's
//   read and its delete would be deleted with it. The hand-over order avoids
//   that: the next session takes over only after board.mjs posted the
//   "released" comment, by which time the ref is gone.
//
// Every function takes an `api` with the five operations below, so the tests
// run the same logic against an in-memory ref store.

import {
  formatLockMessage,
  lockRef,
  parseLockMessage,
} from '../claim-lock.mjs';
import { gh } from './lib.mjs';

export class ClaimError extends Error {}

export const describeLock = (lock) =>
  `${lock.claimant ?? 'an unrecognised claimant'}` +
  `${lock.agent ? ` (Agent ${lock.agent})` : ''}` +
  `${lock.claimedAt ? ` since ${lock.claimedAt}` : ''}`;

/**
 * Takes the lock of issue `number` for `claimant`, or confirms it is held.
 * Returns { action: 'taken' | 'held' | 'taken-over', previous? }.
 */
export async function acquireLock({
  api,
  number,
  claimant,
  agent,
  takeOver = false,
  adopt = false,
  claimedWithoutLock = false,
}) {
  const current = await api.read(number);
  if (!current && claimedWithoutLock && !takeOver && !adopt) {
    // Labelled in-progress or in-review but never locked: a claim made
    // before the lock existed, maybe by another session with this nickname.
    throw new ClaimError(
      `already claimed by labels but has no ${lockRef(number)} (a claim made before the lock): ` +
        're-run with --adopt only if this session made that claim; otherwise it is ' +
        "another session's claim (--take-over after a hand-over or JOY's assignment)"
    );
  }
  if (!current) {
    const sha = await api.commit({ number, claimant, agent });
    if (await api.create(number, sha)) return { action: 'taken' };
    // Another session created it between our read and our create.
    const winner = await api.read(number);
    if (winner?.claimant === claimant) return { action: 'held' };
    if (!winner) {
      throw new ClaimError(
        `${lockRef(number)} changed while claiming (taken and released); run the command again`
      );
    }
    throw new ClaimError(
      `${lockRef(number)} was just taken by ${describeLock(winner)}`
    );
  }
  if (current.claimant === claimant) return { action: 'held' };
  if (!takeOver) {
    throw new ClaimError(
      `claimed by ${describeLock(current)} (${lockRef(number)}): pass --take-over ` +
        'only when that session handed it over or JOY assigned it'
    );
  }
  const sha = await api.commit({
    number,
    claimant,
    agent,
    parent: current.sha,
  });
  if (await api.replace(number, current.sha, sha)) {
    return { action: 'taken-over', previous: current };
  }
  throw new ClaimError(
    `${lockRef(number)} changed during the take-over (it was ${describeLock(current)}); ` +
      'read the issue again before retrying'
  );
}

/**
 * Releases the lock of issue `number`. Only its holder may, unless the issue
 * is closed (merged), where the lock has nothing left to guard. Returns
 * { action: 'none' | 'released', previous? }.
 */
export async function releaseLock({ api, number, claimant, issueClosed }) {
  const current = await api.read(number);
  if (!current) return { action: 'none' };
  if (current.claimant !== claimant && !issueClosed) {
    throw new ClaimError(
      `${lockRef(number)} is held by ${describeLock(current)}, not ${claimant}: ` +
        'only the holder releases it (a PO clears an orphaned claim with --force-release)'
    );
  }
  await api.remove(number);
  return { action: 'released', previous: current };
}

/** Deletes the lock whoever holds it (an orphaned claim). PO only. */
export async function forceRelease({ api, number }) {
  const current = await api.read(number);
  if (!current) return { action: 'none' };
  await api.remove(number);
  return { action: 'released', previous: current };
}

/** `gh` with the HTTP status of a failed `gh api` call. */
export function ghCall(args, input) {
  const r = gh(args, { allowFailure: true, input });
  const status =
    r.status === 0 ? 200 : Number(r.stderr.match(/\(HTTP (\d{3})\)/)?.[1] ?? 0);
  return { ok: r.status === 0, status, stdout: r.stdout, stderr: r.stderr };
}

function must(r, what) {
  if (!r.ok) throw new Error(`${what} failed: ${r.stderr.trim()}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

/**
 * The lock operations against GitHub for `repo` (owner/name). `call` runs one
 * `gh` command (tests pass a fake).
 */
export function githubLockApi(repo, { call = ghCall } = {}) {
  const base = `repos/${repo}`;
  let repositoryId = null;
  const api = {
    async read(number) {
      const ref = call(['api', `${base}/git/ref/claims/${number}`]);
      if (!ref.ok && ref.status === 404) return null;
      const found = must(ref, `reading ${lockRef(number)}`);
      // Only the exact ref is this issue's lock.
      if (found?.ref !== lockRef(number)) return null;
      const sha = found.object.sha;
      const commit = must(
        call(['api', `${base}/git/commits/${sha}`]),
        `reading the lock commit ${sha}`
      );
      return {
        sha,
        ...parseLockMessage(commit.message),
        claimedAt: commit.committer?.date ?? null,
      };
    },
    async commit({ number, claimant, agent, parent }) {
      const record = JSON.stringify({ repo, number, claimant, agent });
      const blob = must(
        call([
          'api',
          `${base}/git/blobs`,
          '-f',
          `content=${record}\n`,
          '-f',
          'encoding=utf-8',
        ]),
        'writing the lock record'
      ).sha;
      const tree = must(
        call(
          ['api', `${base}/git/trees`, '--input', '-'],
          JSON.stringify({
            tree: [
              { path: 'claim.json', mode: '100644', type: 'blob', sha: blob },
            ],
          })
        ),
        'writing the lock tree'
      ).sha;
      return must(
        call([
          'api',
          `${base}/git/commits`,
          '-f',
          `message=${formatLockMessage({ repo, number, claimant, agent })}`,
          '-f',
          `tree=${tree}`,
          ...(parent ? ['-f', `parents[]=${parent}`] : []),
        ]),
        'writing the lock commit'
      ).sha;
    },
    async create(number, sha) {
      const r = call([
        'api',
        `${base}/git/refs`,
        '-f',
        `ref=${lockRef(number)}`,
        '-f',
        `sha=${sha}`,
      ]);
      if (r.ok) return true;
      if (r.status === 422 && /already exists/i.test(r.stderr)) return false;
      throw new Error(`creating ${lockRef(number)} failed: ${r.stderr.trim()}`);
    },
    async replace(number, before, after) {
      repositoryId ??= must(
        call(['api', base, '--jq', '{id: .node_id}']),
        `reading ${repo}`
      ).id;
      const r = call([
        'api',
        'graphql',
        '-f',
        'query=mutation($id: ID!, $name: GitRefname!, $before: GitObjectID!, $after: GitObjectID!) {' +
          ' updateRefs(input: {repositoryId: $id, refUpdates: [{name: $name, beforeOid: $before, afterOid: $after, force: true}]}) { clientMutationId } }',
        '-F',
        `id=${repositoryId}`,
        '-F',
        `name=${lockRef(number)}`,
        '-F',
        `before=${before}`,
        '-F',
        `after=${after}`,
      ]);
      if (r.ok && !/"errors"/.test(r.stdout)) return true;
      // GitHub answers a stale beforeOid with a generic error, so look at
      // the ref: moved on means we lost; unchanged means a real failure.
      const now = await api.read(number);
      if (now?.sha === after) return true;
      if (now?.sha !== before) return false;
      throw new Error(
        `replacing ${lockRef(number)} failed: ${(r.stderr || r.stdout).trim()}`
      );
    },
    async remove(number) {
      const r = call([
        'api',
        '-X',
        'DELETE',
        `${base}/git/refs/claims/${number}`,
      ]);
      if (r.ok || r.status === 404) return;
      if (r.status === 422 && /does not exist/i.test(r.stderr)) return;
      throw new Error(`deleting ${lockRef(number)} failed: ${r.stderr.trim()}`);
    },
  };
  return api;
}
