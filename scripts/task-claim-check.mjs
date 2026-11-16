#!/usr/bin/env node
// Required task-claim check for PRs into `dev` (.github/workflows/task-claim.yml).
// AGENTS.md section 1: an agent claims an issue before working on it with
// `scripts/ops/board.mjs`, which gives it an `agent:<nick>` label and
// `status:in-progress` (then `status:in-review` once the PR is open) and takes
// the issue's claim lock `refs/claims/<n>` for the session's claimant
// (DOS/Rate#1673, scripts/claim-lock.mjs). A PR that closes issues passes only
// when every issue it closes carries such a claim, and its lock is held by the
// claimant the PR declares on a `Claimant: <tool>:<session id>` line of its
// description. A released lock (a tombstone commit, DOS/Rate#1675) counts as
// no lock.
//
// Grace: a PR opened before LOCK_REQUIRED_SINCE keeps the label-only rule, so
// PRs that were open when the lock arrived are not blocked; if such a PR does
// declare a claimant, a lock held by someone else still fails it.
//
// Dependabot PRs and the dev to main promotion are exempt. The
// `dev-task-claim` ruleset requires this check, so a failure blocks the merge.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  declaredClaimants,
  isClaimant,
  lockRef,
  parseLockMessage,
} from './claim-lock.mjs';

const CLAIM_STATUSES = ['status:in-progress', 'status:in-review'];
const MAX_CLOSING_ISSUES = 25;

/** PRs opened from this moment on need a claim lock and a declared claimant. */
export const LOCK_REQUIRED_SINCE = '2026-11-15T17:04:00Z';

// `pr` is the shape the GraphQL query below returns.
export function evaluateClaim(pr) {
  // The dev to main promotion has base main, so it is exempt here too.
  if (pr.baseRefName !== 'dev') {
    return {
      ok: true,
      exempt: true,
      reason: `base is ${pr.baseRefName}, not dev`,
    };
  }
  if (pr.author === 'dependabot[bot]' || pr.author === 'dependabot') {
    return { ok: true, exempt: true, reason: 'Dependabot PR' };
  }
  // Fail closed when some closing issues could not be read: an unclaimed one
  // may be among them.
  if (pr.truncated) {
    return {
      ok: false,
      exempt: false,
      reason: `closes more than ${MAX_CLOSING_ISSUES} issues, so not every claim can be verified`,
    };
  }
  if (pr.unreadable > 0) {
    return {
      ok: false,
      exempt: false,
      reason:
        `${pr.unreadable} closing issue(s) are not readable with the workflow ` +
        'token (another repository?), so their claims cannot be verified',
    };
  }

  const issues = pr.closingIssues ?? [];
  if (issues.length === 0) {
    return { ok: true, exempt: false, reason: 'closes no issue', issues: [] };
  }

  // Strict when the creation time is unknown.
  const legacy =
    Boolean(pr.createdAt) &&
    Date.parse(pr.createdAt) < Date.parse(LOCK_REQUIRED_SINCE);
  const declared = declaredClaimants(pr.body);
  const base = { exempt: false, legacy, claimant: declared[0] ?? null };
  if (declared.length > 1) {
    return {
      ...base,
      ok: false,
      reason: `the PR declares more than one claimant (${declared.join(', ')}); keep one Claimant line`,
      issues: [],
    };
  }
  if (declared.length === 1 && !isClaimant(declared[0])) {
    return {
      ...base,
      ok: false,
      reason: `the declared claimant ${declared[0]} is not <tool>:<session id>`,
      issues: [],
    };
  }
  const claimant = base.claimant;

  const results = issues.map((issue) => {
    const labels = issue.labels ?? [];
    const agent = labels.filter((l) => l.startsWith('agent:'));
    const status = labels.filter((l) => CLAIM_STATUSES.includes(l));
    // A tombstone left by a release is a free lock, not a claim.
    const lock = issue.lock && !issue.lock.released ? issue.lock : null;
    const problems = [];
    if (agent.length === 0) problems.push('no agent:* label');
    if (status.length === 0)
      problems.push(`neither ${CLAIM_STATUSES.join(' nor ')}`);
    if (lock && claimant && lock.claimant !== claimant) {
      problems.push(
        `${lockRef(issue.number)} is held by ${lock.claimant ?? 'an unrecognised claimant'}, not the declared ${claimant}`
      );
    } else if (!legacy && !lock) {
      problems.push(`no claim lock ${lockRef(issue.number)}`);
    } else if (!legacy && !claimant) {
      problems.push('the PR declares no Claimant');
    }
    return {
      ...issue,
      agent,
      status,
      lock,
      problems,
      ok: problems.length === 0,
    };
  });
  const ok = results.every((r) => r.ok);
  return {
    ...base,
    ok,
    reason: ok
      ? legacy
        ? `every closing issue is claimed (PR opened before ${LOCK_REQUIRED_SINCE}: labels only)`
        : 'every closing issue is claimed and locked by the declared claimant'
      : "a closing issue is not claimed by this PR's claimant (AGENTS.md section 1)",
    issues: results,
  };
}

export function renderSummary(number, result) {
  const lines = [
    `## Task claim: PR #${number}`,
    '',
    `${result.ok ? 'Pass' : 'Fail'}: ${result.reason}.`,
  ];
  if (result.claimant !== undefined) {
    lines.push(
      '',
      `Declared claimant: ${result.claimant ? `\`${result.claimant}\`` : 'none'}`
    );
  }
  if (result.issues?.length) {
    lines.push(
      '',
      '| Issue | agent:* | status | claim lock | Result |',
      '| --- | --- | --- | --- | --- |'
    );
    for (const i of result.issues) {
      const lock = i.lock ? `\`${i.lock.claimant ?? 'unrecognised'}\`` : '-';
      lines.push(
        `| ${i.repository}#${i.number} | ${i.agent.join(', ') || '-'} | ` +
          `${i.status.join(', ') || '-'} | ${lock} | ${i.ok ? 'claimed' : i.problems.join('; ')} |`
      );
    }
  }
  if (!result.ok) {
    lines.push(
      '',
      'Claim the issue from the session that does the work, with `board.mjs` from an ' +
        'up-to-date `dev` (merge `origin/dev` into the branch first: a copy older than ' +
        'DOS/Rate#1673 takes no lock): ' +
        '`node scripts/ops/board.mjs <n> --status in-review --agent <Nick>` ' +
        '(add `--adopt` for an issue this session claimed before the lock existed). ' +
        'It sets the labels, Project #9 and the claim lock `refs/claims/<n>`, and ' +
        'prints the claimant; put `Claimant: <tool>:<session id>` on a line ' +
        'of its own in the PR description. Editing the description re-runs this check.'
    );
  }
  return lines.join('\n') + '\n';
}

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      body
      createdAt
      baseRefName
      headRefName
      author { login }
      closingIssuesReferences(first: ${MAX_CLOSING_ISSUES}) {
        totalCount
        nodes {
          number
          repository { nameWithOwner }
          labels(first: 100) { nodes { name } }
        }
      }
    }
  }
}`;

async function fetchPr({ token, repo, number }) {
  const [owner, name] = repo.split('/');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: QUERY, variables: { owner, name, number } }),
  });
  const body = await res.json();
  // A closing issue the token cannot read (for example in a private repo)
  // comes back as a null node plus an error under closingIssuesReferences.
  // Those are counted as unreadable; any other error aborts.
  const fatal = (body.errors ?? []).filter(
    (e) => !(e.path ?? []).includes('closingIssuesReferences')
  );
  const pr = body.data?.repository?.pullRequest;
  if (!res.ok || fatal.length > 0 || !pr?.closingIssuesReferences) {
    throw new Error(
      `GraphQL request failed (${res.status}): ${JSON.stringify(body.errors ?? body)}`
    );
  }
  const refs = pr.closingIssuesReferences;
  const readable = refs.nodes.filter((n) => n?.repository && n?.labels);
  const closingIssues = [];
  for (const n of readable) {
    const repository = n.repository.nameWithOwner;
    closingIssues.push({
      number: n.number,
      repository,
      labels: n.labels.nodes.map((l) => l.name),
      lock: await fetchLock({ token, repo: repository, number: n.number }),
    });
  }
  return {
    body: pr.body ?? '',
    createdAt: pr.createdAt ?? null,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    author: pr.author?.login ?? '',
    truncated: refs.totalCount > refs.nodes.length,
    unreadable: refs.nodes.length - readable.length,
    closingIssues,
  };
}

/** The claim lock of an issue, or null when it has none. Fails closed. */
async function fetchLock({ token, repo, number }) {
  const get = async (path) => {
    const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: {
        authorization: `bearer ${token}`,
        accept: 'application/vnd.github+json',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(
        `reading ${lockRef(number)} of ${repo} failed (${res.status})`
      );
    }
    return res.json();
  };
  const ref = await get(`git/ref/claims/${number}`);
  // The endpoint matches the full name; anything else is not this lock.
  if (!ref || ref.ref !== lockRef(number)) return null;
  const commit = await get(`git/commits/${ref.object.sha}`);
  if (!commit) return null;
  return parseLockMessage(commit.message);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { GITHUB_TOKEN, REPO, PR_NUMBER, GITHUB_STEP_SUMMARY } = process.env;
  const number = Number(PR_NUMBER);
  if (!GITHUB_TOKEN || !REPO || !Number.isInteger(number) || number < 1) {
    console.error('task-claim: GITHUB_TOKEN, REPO and PR_NUMBER are required');
    process.exit(1);
  }
  const result = evaluateClaim(
    await fetchPr({ token: GITHUB_TOKEN, repo: REPO, number })
  );
  const summary = renderSummary(number, result);
  console.log(summary);
  if (GITHUB_STEP_SUMMARY) appendFileSync(GITHUB_STEP_SUMMARY, summary);
  if (!result.ok) {
    console.log(`::error title=Task claim::${result.reason}`);
    process.exit(1);
  }
}
