#!/usr/bin/env node
// Sets an issue's status and agent on GitHub Project #9 and in its labels, as
// AGENTS.md section 1 requires, and holds its claim lock, in one command:
//
//   node scripts/ops/board.mjs <issue>... --status in-progress --agent Guard
//     [--claimant claude:<session id>] [--take-over] [--repo DOS/Rate]
//   node scripts/ops/board.mjs <issue>... --force-release --agent PO
//     --reason "<why>" [--repo DOS/Rate]
//
// Claim lock (DOS/Rate#1673, scripts/ops/lock.mjs): `in-progress` and
// `in-review` take or keep the atomic lock refs/claims/<issue> for this
// session's claimant, so two sessions can never both claim an issue;
// `ready`, `backlog` and `done` release it. The claimant is `--claimant`, else
// RATE_CLAIMANT, else the Claude Code session id (scripts/claim-lock.mjs).
// `--force-release` (PO only) clears an orphaned lock and says why on the
// issue.
//
// The status label replaces any other status:* label, the agent label
// (agent:<nick>) is created when missing, a claim adds the PO line label
// (po:claude or po:qwen) of the claimant's tool, and an issue not yet on the
// board is added to it. An issue another agent, session or PO line holds is
// refused unless --take-over is passed (a hand-over or JOY's assignment).

import { parseArgs } from 'node:util';
import { lockRef, poLabel, poTool, resolveClaimant } from '../claim-lock.mjs';
import { DEFAULT_REPO, fail, gh, ghJson, isMain } from './lib.mjs';
import {
  acquireLock,
  describeLock,
  forceRelease,
  githubLockApi,
  releaseLock,
} from './lock.mjs';

export const PROJECT = {
  owner: 'DOS',
  number: 9,
  id: 'PVT_kwDOA388Vc4Bm5Ml',
  statusField: 'PVTSSF_lADOA388Vc4Bm5MlzhlgSt8',
  agentField: 'PVTF_lADOA388Vc4Bm5MlzhlqBH8',
};

export const STATUSES = {
  backlog: { option: 'f75ad846', label: null },
  ready: { option: 'e18bf179', label: 'status:ready' },
  'in-progress': { option: '47fc9ee4', label: 'status:in-progress' },
  'in-review': { option: 'aba860b9', label: 'status:in-review' },
  done: { option: '98236657', label: 'status:done' },
};

/** The statuses that hold the claim lock; every other one releases it. */
export const CLAIM_STATUSES = ['in-progress', 'in-review'];

export const agentLabel = (nick) => `agent:${nick.trim().toLowerCase()}`;

/** Only the Product Owner (nickname `PO`) may force-release a lock. */
export const isPoNick = (nick) => nick.trim().toLowerCase() === 'po';

/**
 * Label edits that leave exactly one status label and one agent label, plus,
 * when `po` names the claimant's PO line, that line's `po:*` label.
 * An issue claimed by another agent or dispatched by the other PO is never
 * taken silently (AGENTS.md sections 1 and 6): that needs `takeOver`, and the
 * other claim label is then removed.
 */
export function labelChanges(
  current,
  status,
  nick,
  { takeOver = false, po = null } = {}
) {
  const spec = STATUSES[status];
  if (!spec) throw new Error(`unknown status ${status}`);
  const mine = agentLabel(nick);
  const others = current.filter((l) => l.startsWith('agent:') && l !== mine);
  if (others.length > 0 && !takeOver) {
    throw new Error(
      `claimed by ${others.join(', ')}: pass --take-over only when that agent handed it over or JOY assigned it`
    );
  }
  const myLine = po ? poLabel(po) : null;
  const otherLines = myLine
    ? current.filter((l) => l.startsWith('po:') && l !== myLine)
    : [];
  if (otherLines.length > 0 && !takeOver) {
    throw new Error(
      `dispatched by ${otherLines.join(', ')}, another PO's line: pass --take-over only when JOY assigned it`
    );
  }
  const want = [spec.label, mine, myLine].filter(Boolean);
  return {
    add: want.filter((l) => !current.includes(l)),
    remove: current.filter(
      (l) =>
        (l.startsWith('status:') && l !== spec.label) ||
        (l.startsWith('agent:') && l !== mine) ||
        otherLines.includes(l)
    ),
  };
}

/** The issue comment for a lock change, or null when nothing changed. */
export function lockComment({ repo, number, nick, claimant, status, lock }) {
  const ref = `\`${lockRef(number)}\``;
  const who = `\`${claimant}\``;
  const head = `**[Agent: ${nick}]**`;
  switch (lock.action) {
    case 'taken':
      return `🔒 ${head} Claim lock ${ref} taken by claimant ${who} (Status: ${status}).`;
    case 'taken-over':
      return (
        `🔒 ${head} Claim lock ${ref} taken over by claimant ${who} ` +
        `from ${describeLock(lock.previous)} (Status: ${status}).`
      );
    case 'released':
      return lock.previous.claimant === claimant
        ? `🔓 ${head} Claim lock ${ref} released by claimant ${who} (Status: ${status}).`
        : `🔓 ${head} Claim lock ${ref} of ${describeLock(lock.previous)} ` +
            `released by claimant ${who} because ${repo}#${number} is closed (Status: ${status}).`;
    default:
      return null;
  }
}

const ISSUE_QUERY = `query($owner: String!, $name: String!, $n: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $n) {
      url
      state
      labels(first: 50) { nodes { name } }
      projectItems(first: 20) { nodes { id project { number } } }
    }
  }
}`;

function readIssue(repo, number) {
  const [owner, name] = repo.split('/');
  const data = ghJson([
    'api',
    'graphql',
    '-f',
    `query=${ISSUE_QUERY}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `n=${number}`,
  ]);
  const issue = data.data.repository.issue;
  if (!issue) throw new Error(`${repo}#${number} not found`);
  return {
    url: issue.url,
    closed: issue.state === 'CLOSED',
    labels: issue.labels.nodes.map((l) => l.name),
    itemId:
      issue.projectItems.nodes.find((i) => i.project.number === PROJECT.number)
        ?.id ?? null,
  };
}

function comment(repo, number, body) {
  gh(['issue', 'comment', String(number), '-R', repo, '--body', body]);
}

/**
 * A lock change does not always change a label, so it would not re-run the
 * task-claim check of the PRs closing the issue; ask for that explicitly.
 * Only DOS/Rate has the check. Best effort: the check also re-runs when a
 * PR is edited.
 */
function revalidate(repo, number) {
  if (repo !== DEFAULT_REPO) return;
  const r = gh(
    [
      'workflow',
      'run',
      'task-claim-revalidate.yml',
      '-R',
      repo,
      '--ref',
      'dev',
      '-f',
      `issue=${number}`,
    ],
    { allowFailure: true }
  );
  if (r.status !== 0) {
    console.warn(
      `${repo}#${number}: could not re-run task-claim (${r.stderr.trim()}); edit the PR to re-run it`
    );
  }
}

export async function setBoard({
  repo = DEFAULT_REPO,
  number,
  status,
  nick,
  claimant,
  takeOver = false,
  api = githubLockApi(repo),
}) {
  const spec = STATUSES[status];
  if (!spec) throw new Error(`unknown status ${status}`);
  const issue = readIssue(repo, number);
  const claiming = CLAIM_STATUSES.includes(status);

  // Refuse before changing anything when the labels say someone else holds
  // the issue.
  const { add, remove } = labelChanges(issue.labels, status, nick, {
    takeOver,
    po: claiming ? poTool(claimant) : null,
  });

  // The lock first: it is the one step only one session can win. Labels and
  // board follow, and a re-run after a failure finds the lock already held
  // (or already released) and carries on.
  const lock = claiming
    ? await acquireLock({ api, number, claimant, agent: nick, takeOver })
    : await releaseLock({ api, number, claimant, issueClosed: issue.closed });

  const taken = remove.filter((l) => l.startsWith('agent:'));
  if (taken.length > 0) {
    console.log(`${repo}#${number}: taking over from ${taken.join(', ')}`);
  }
  const ensureLabel = (name, color, description) =>
    gh(
      [
        'label',
        'create',
        name,
        '-R',
        repo,
        '--color',
        color,
        '--description',
        description,
      ],
      { allowFailure: true } // already exists; a real failure resurfaces below
    );
  if (add.includes(agentLabel(nick))) {
    ensureLabel(agentLabel(nick), 'D93F0B', `Claimed by Agent: ${nick}`);
  }
  for (const l of add.filter((l) => l.startsWith('po:'))) {
    ensureLabel(l, '0052CC', `Product Owner line: ${l.slice(3)}`);
  }
  gh([
    'issue',
    'edit',
    String(number),
    '-R',
    repo,
    '--add-assignee',
    '@me',
    ...add.flatMap((l) => ['--add-label', l]),
    ...remove.flatMap((l) => ['--remove-label', l]),
  ]);

  let itemId = issue.itemId;
  if (!itemId) {
    itemId = ghJson([
      'project',
      'item-add',
      String(PROJECT.number),
      '--owner',
      PROJECT.owner,
      '--url',
      issue.url,
      '--format',
      'json',
    ]).id;
  }
  const edit = (field, value) =>
    gh([
      'project',
      'item-edit',
      '--project-id',
      PROJECT.id,
      '--id',
      itemId,
      '--field-id',
      field,
      ...value,
    ]);
  edit(PROJECT.statusField, ['--single-select-option-id', spec.option]);
  edit(PROJECT.agentField, ['--text', nick]);

  const note = lockComment({ repo, number, nick, claimant, status, lock });
  if (note) {
    comment(repo, number, note);
    revalidate(repo, number);
  }
  return `${repo}#${number} -> ${status} (${nick}, ${claimant}, lock ${lock.action})`;
}

/** Clears an orphaned claim lock and records why on the issue. */
export async function forceReleaseBoard({
  repo = DEFAULT_REPO,
  number,
  nick,
  reason,
  claimant = null,
  api = githubLockApi(repo),
}) {
  if (!isPoNick(nick)) {
    throw new Error(
      '--force-release is for the Product Owner: run it with --agent PO'
    );
  }
  if (!reason?.trim()) {
    throw new Error(
      "--force-release needs --reason with the evidence (hand-over link or JOY's approval)"
    );
  }
  const lock = await forceRelease({ api, number });
  if (lock.action === 'none')
    return `${repo}#${number}: no claim lock to release`;
  comment(
    repo,
    number,
    `⚠️ **[Agent: ${nick}]** Force-released claim lock \`${lockRef(number)}\` ` +
      `held by ${describeLock(lock.previous)}` +
      `${claimant ? ` (by claimant \`${claimant}\`)` : ''}. Reason: ${reason.trim()}`
  );
  revalidate(repo, number);
  return `${repo}#${number}: force-released the lock of ${describeLock(lock.previous)}`;
}

const USAGE =
  `usage: board.mjs <issue>... --status ${Object.keys(STATUSES).join('|')} --agent <nick> ` +
  '[--claimant <tool>:<session id>] [--take-over] [--repo owner/name]\n' +
  '       board.mjs <issue>... --force-release --agent PO --reason "<why>" [--repo owner/name]';

if (isMain(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      repo: { type: 'string', default: DEFAULT_REPO },
      status: { type: 'string' },
      agent: { type: 'string' },
      claimant: { type: 'string' },
      'take-over': { type: 'boolean', default: false },
      'force-release': { type: 'boolean', default: false },
      reason: { type: 'string' },
    },
  });
  const numbers = positionals.map(Number);
  const force = values['force-release'];
  if (
    numbers.length === 0 ||
    numbers.some((n) => !Number.isInteger(n) || n < 1) ||
    !values.agent?.trim() ||
    (force ? values.status !== undefined : !STATUSES[values.status])
  ) {
    fail(USAGE);
  }
  let claimant = null;
  try {
    claimant = resolveClaimant({ flag: values.claimant, env: process.env });
  } catch (err) {
    if (!force) fail(err.message);
  }
  for (const number of numbers) {
    try {
      console.log(
        force
          ? await forceReleaseBoard({
              repo: values.repo,
              number,
              nick: values.agent.trim(),
              reason: values.reason,
              claimant,
            })
          : await setBoard({
              repo: values.repo,
              number,
              status: values.status,
              nick: values.agent.trim(),
              claimant,
              takeOver: values['take-over'],
            })
      );
    } catch (err) {
      fail(`${values.repo}#${number}: ${err.message}`);
    }
  }
}
