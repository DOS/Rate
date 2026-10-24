#!/usr/bin/env node
// Sets an issue's status and agent on GitHub Project #9 and in its labels, as
// AGENTS.md section 1 requires, in one command:
//
//   node scripts/ops/board.mjs <issue>... --status in-progress --agent Guard
//     [--repo DOS/Rate]
//
// The status label replaces any other status:* label, the agent label
// (agent:<nick>) is created when missing, and an issue not yet on the board
// is added to it.

import { parseArgs } from 'node:util';
import { DEFAULT_REPO, fail, gh, ghJson, isMain } from './lib.mjs';

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

export const agentLabel = (nick) => `agent:${nick.trim().toLowerCase()}`;

/**
 * Label edits that leave exactly one status label and one agent label: the
 * agent running the command now holds the issue, so another agent's claim
 * label goes (a hand-over).
 */
export function labelChanges(current, status, nick) {
  const spec = STATUSES[status];
  if (!spec) throw new Error(`unknown status ${status}`);
  const mine = agentLabel(nick);
  const want = [spec.label, mine].filter(Boolean);
  return {
    add: want.filter((l) => !current.includes(l)),
    remove: current.filter(
      (l) =>
        (l.startsWith('status:') && l !== spec.label) ||
        (l.startsWith('agent:') && l !== mine)
    ),
  };
}

const ISSUE_QUERY = `query($owner: String!, $name: String!, $n: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $n) {
      url
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
    labels: issue.labels.nodes.map((l) => l.name),
    itemId:
      issue.projectItems.nodes.find((i) => i.project.number === PROJECT.number)
        ?.id ?? null,
  };
}

export function setBoard({ repo = DEFAULT_REPO, number, status, nick }) {
  const spec = STATUSES[status];
  if (!spec) throw new Error(`unknown status ${status}`);
  const issue = readIssue(repo, number);

  // Labels first: the required task-claim check reads them, so a failure
  // later on the board leaves the claim intact.
  const { add, remove } = labelChanges(issue.labels, status, nick);
  if (add.includes(agentLabel(nick))) {
    gh(
      [
        'label',
        'create',
        agentLabel(nick),
        '-R',
        repo,
        '--color',
        'D93F0B',
        '--description',
        `Claimed by Agent: ${nick}`,
      ],
      { allowFailure: true } // already exists; a real failure resurfaces below
    );
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
  return `${repo}#${number} -> ${status} (${nick})`;
}

if (isMain(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      repo: { type: 'string', default: DEFAULT_REPO },
      status: { type: 'string' },
      agent: { type: 'string' },
    },
  });
  const numbers = positionals.map(Number);
  if (
    numbers.length === 0 ||
    numbers.some((n) => !Number.isInteger(n) || n < 1) ||
    !STATUSES[values.status] ||
    !values.agent?.trim()
  ) {
    fail(
      `usage: board.mjs <issue>... --status ${Object.keys(STATUSES).join('|')} --agent <nick> [--repo owner/name]`
    );
  }
  for (const number of numbers) {
    console.log(
      setBoard({
        repo: values.repo,
        number,
        status: values.status,
        nick: values.agent.trim(),
      })
    );
  }
}
