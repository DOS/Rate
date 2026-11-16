// The atomic claim lock behind `board.mjs` (DOS/Rate#1673). Format and
// claimant rules: scripts/claim-lock.mjs.
//
// Every change to refs/claims/<n> is atomic:
// - Take a lock that never existed: create the ref. GitHub creates a ref only
//   when it does not exist yet (HTTP 422 otherwise), so of two sessions
//   claiming at once exactly one wins; the other reads the winner and fails
//   naming it.
// - Every other change replaces the ref with GraphQL `updateRefs`, which
//   applies only while the ref still points at the commit that was read
//   (`beforeOid`), so a lock that changed meanwhile is never overwritten.
//   (REST PATCH with force=false does not refuse a stale update on
//   refs/claims, verified 2026-11-15, so it is not used.)
// - Re-claim by the holder changes nothing.
// - Take-over (a hand-over or JOY's assignment) replaces the holder's lock.
// - Release (DOS/Rate#1675) replaces the lock with a tombstone commit, never
//   deletes it: GitHub has no conditional ref delete (updateRefs with a zero
//   afterOid did not delete, verified 2026-11-15), so a delete could remove a
//   take-over that landed after the release read the lock. A tombstone is a
//   free lock, and claiming it replaces it the same way. Only the holder
//   releases, or anyone once the lock is stale (below). `forceRelease` (PO
//   only) releases it whoever holds it. Cost: one ref per issue ever claimed.
// - Stale lock (DOS/Rate#1675): a lock taken before the issue was last
//   closed guarded work that the close ended (the PR merged). It counts as
//   free, so claiming a reopened issue replaces it, and anyone may release it.
//   The holder re-claiming a reopened issue also replaces it, so its renewed
//   lock is not stale.
//
// Every function takes an `api` with the four operations below, so the tests
// run the same logic against an in-memory ref store.

import {
  formatLockMessage,
  formatReleaseMessage,
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
 * True when `lock` is a live lock taken before `closedAt`, the time the
 * issue was last closed: the close ended the work it guarded. A lock whose
 * time is unknown is never stale.
 */
export function isStale(lock, closedAt) {
  if (!lock || lock.released || !closedAt || !lock.claimedAt) return false;
  const taken = Date.parse(lock.claimedAt);
  const closed = Date.parse(closedAt);
  return Number.isFinite(taken) && Number.isFinite(closed) && taken < closed;
}

/**
 * Takes the lock of issue `number` for `claimant`, or confirms it is held.
 * `closedAt` is when the issue was last closed (null if never). Returns
 * { action: 'taken' | 'held' | 'taken-over', previous? }; `previous` is the
 * lock that was replaced, with `stale: true` for a stale one.
 */
export async function acquireLock({
  api,
  number,
  claimant,
  agent,
  takeOver = false,
  adopt = false,
  claimedWithoutLock = false,
  closedAt = null,
}) {
  const current = await api.read(number);
  const stale = isStale(current, closedAt);
  if (current && !current.released && !stale) {
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

  // Free: no ref, a tombstone, or a stale lock. The status labels of a stale
  // lock are as stale as the lock, so only a free lock without one says the
  // labels were set without the lock.
  if (!stale && claimedWithoutLock && !takeOver && !adopt) {
    // Labelled in-progress or in-review but never locked: a claim made
    // before the lock existed, maybe by another session with this nickname.
    throw new ClaimError(
      `already claimed by labels but has no ${lockRef(number)} (a claim made before the lock): ` +
        're-run with --adopt only if this session made that claim; otherwise it is ' +
        "another session's claim (--take-over after a hand-over or JOY's assignment)"
    );
  }
  const sha = await api.commit({
    number,
    claimant,
    agent,
    parent: current?.sha,
  });
  const won = current
    ? await api.replace(number, current.sha, sha)
    : await api.create(number, sha);
  if (won) {
    return stale
      ? { action: 'taken', previous: { ...current, stale: true } }
      : { action: 'taken' };
  }
  // Another session changed it between our read and our write.
  const winner = await api.read(number);
  if (winner && !winner.released && winner.claimant === claimant) {
    return { action: 'held' };
  }
  if (!winner || winner.released) {
    throw new ClaimError(
      `${lockRef(number)} changed while claiming (taken and released); run the command again`
    );
  }
  throw new ClaimError(
    `${lockRef(number)} was just taken by ${describeLock(winner)}`
  );
}

/** Replaces the live lock `current` with a tombstone, or fails if it moved. */
async function tombstone({ api, number, current, claimant, agent }) {
  const sha = await api.commit({
    number,
    claimant,
    agent,
    parent: current.sha,
    released: true,
  });
  if (await api.replace(number, current.sha, sha)) {
    return { action: 'released', previous: current };
  }
  throw new ClaimError(
    `${lockRef(number)} changed while releasing it (it was ${describeLock(current)}); ` +
      'read the issue again: another session may hold it now'
  );
}

/**
 * Releases the lock of issue `number`. Only its holder may, unless the issue
 * is closed (merged) or the lock is stale, where it has nothing left to
 * guard. Returns { action: 'none' | 'released', previous? }; `previous` has
 * `stale: true` when that was the reason.
 */
export async function releaseLock({
  api,
  number,
  claimant,
  agent = null,
  issueClosed,
  closedAt = null,
}) {
  const current = await api.read(number);
  if (!current || current.released) return { action: 'none' };
  const stale = isStale(current, closedAt);
  if (current.claimant !== claimant && !issueClosed && !stale) {
    throw new ClaimError(
      `${lockRef(number)} is held by ${describeLock(current)}, not this session: ` +
        'only the holder releases it (a PO clears an orphaned claim with --force-release)'
    );
  }
  return tombstone({
    api,
    number,
    current: stale ? { ...current, stale } : current,
    claimant,
    agent,
  });
}

/** Releases the lock whoever holds it (an orphaned claim). PO only. */
export async function forceRelease({ api, number, claimant = null, agent }) {
  const current = await api.read(number);
  if (!current || current.released) return { action: 'none' };
  return tombstone({ api, number, current, claimant, agent });
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
    async commit({ number, claimant, agent, parent, released = false }) {
      const record = JSON.stringify(
        released
          ? { repo, number, released: true, releasedBy: claimant, agent }
          : { repo, number, claimant, agent }
      );
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
          `message=${
            released
              ? formatReleaseMessage({
                  repo,
                  number,
                  releasedBy: claimant,
                  agent,
                })
              : formatLockMessage({ repo, number, claimant, agent })
          }`,
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
  };
  return api;
}
