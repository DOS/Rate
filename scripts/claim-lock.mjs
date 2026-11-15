// The claim lock format shared by scripts/ops/board.mjs (which takes and
// releases locks) and scripts/task-claim-check.mjs (the required task-claim
// check, which reads them). DOS/Rate#1673.
//
// A claim lock is the git ref `refs/claims/<issue>` in the issue's
// repository. Creating a ref that already exists fails (HTTP 422), so only one
// caller can take a free lock. The ref points at a small commit whose message
// records the claimant:
//
//   claim: DOS/Rate#1673
//
//   Claimant: claude:local_ad470353-1239-439a-a5ea-c3a902f01548
//   Agent: Ops
//
// Refs outside refs/heads and refs/tags start no workflow and are not fetched
// by a plain clone. Pure helpers only: no I/O, so the task-claim workflow can
// load this file from `dev` next to the check.

export const LOCK_REF_PREFIX = 'refs/claims/';

/** `refs/claims/<n>`, the lock of issue `n`. */
export const lockRef = (number) => `${LOCK_REF_PREFIX}${number}`;

/**
 * A claimant names one session: `<tool>:<session id>`, for example
 * `claude:local_ad470353-...` or `qwen:<session id>`.
 */
export const CLAIMANT_RE =
  /^[a-z][a-z0-9-]{1,19}:[A-Za-z0-9][A-Za-z0-9._-]{3,99}$/;

/** The tools that run a Product Owner, each with its `po:<tool>` label. */
export const PO_TOOLS = ['claude', 'qwen'];
export const poLabel = (tool) => `po:${tool}`;

export function isClaimant(value) {
  return typeof value === 'string' && CLAIMANT_RE.test(value);
}

/** `claude` for `claude:local_...`, or null for a tool that runs no PO. */
export function poTool(claimant) {
  const tool = claimant.split(':')[0];
  return PO_TOOLS.includes(tool) ? tool : null;
}

/**
 * The claimant of the calling session: `--claimant`, else the Claude Code
 * desktop session id (`claude:<host session id>`, the id other sessions use
 * to message this one), else the Claude Code session id, else
 * `RATE_CLAIMANT`. The Claude ids win over `RATE_CLAIMANT` so that a value
 * left in a shell profile can never make every Claude session share one
 * claimant. Qwen Code and other tools pass `--claimant`; `RATE_CLAIMANT`
 * must be set per session, never in a shared profile.
 */
export function resolveClaimant({ flag, env = {} } = {}) {
  const sources = [
    ['--claimant', flag?.trim()],
    [
      'CLAUDE_CODE_HOST_SESSION_ID',
      env.CLAUDE_CODE_HOST_SESSION_ID?.trim() &&
        `claude:${env.CLAUDE_CODE_HOST_SESSION_ID.trim()}`,
    ],
    [
      'CLAUDE_CODE_SESSION_ID',
      env.CLAUDE_CODE_SESSION_ID?.trim() &&
        `claude:${env.CLAUDE_CODE_SESSION_ID.trim()}`,
    ],
    ['RATE_CLAIMANT', env.RATE_CLAIMANT?.trim()],
  ];
  const [source, value] = sources.find(([, v]) => v) ?? [];
  if (!value) {
    throw new Error(
      'no claimant: pass --claimant <tool>:<session id> ' +
        '(Claude Code sessions get claude:<session id> automatically; ' +
        'Qwen Code sessions use qwen:<session id>)'
    );
  }
  if (!isClaimant(value)) {
    // Name the source, not the value: environment values stay out of logs.
    throw new Error(
      `invalid claimant from ${source}: expected <tool>:<session id>, ` +
        'for example claude:local_1234abcd or qwen:5678efgh'
    );
  }
  return value;
}

export function formatLockMessage({ repo, number, claimant, agent }) {
  return `claim: ${repo}#${number}\n\nClaimant: ${claimant}\nAgent: ${agent}\n`;
}

const trailer = (message, key) =>
  message.match(new RegExp(`^${key}:[ \\t]*(\\S+)[ \\t]*$`, 'm'))?.[1] ?? null;

/**
 * The claimant and agent a lock commit message records. A ref under
 * refs/claims that this tool did not write has no valid claimant (null): it
 * still holds the lock, and only --take-over or --force-release clears it.
 */
export function parseLockMessage(message = '') {
  const claimant = trailer(message, 'Claimant');
  return {
    claimant: isClaimant(claimant) ? claimant : null,
    agent: trailer(message, 'Agent'),
  };
}

/**
 * The claimants a PR body declares on a line of its own, such as
 * `Claimant: claude:local_1234abcd` (backticks allowed). Unique, in order.
 */
export function declaredClaimants(body = '') {
  const found = [];
  for (const m of (body ?? '').matchAll(
    /^[ \t]*Claimant:[ \t]*`?([^\s`]+)`?[ \t]*$/gim
  )) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}
