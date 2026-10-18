#!/usr/bin/env node
// Required task-claim check for PRs into `dev` (.github/workflows/task-claim.yml).
// AGENTS.md section 1: an agent claims an issue before working on it by giving
// it an `agent:<nick>` label and `status:in-progress`, then `status:in-review`
// once the PR is open. A PR that closes issues passes only when every issue it
// closes carries such a claim. Dependabot PRs and the dev to main promotion are
// exempt. The `dev-task-claim` ruleset requires it, so a failure blocks the merge.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CLAIM_STATUSES = ['status:in-progress', 'status:in-review'];
const MAX_CLOSING_ISSUES = 25;

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

  const results = issues.map((issue) => {
    const labels = issue.labels ?? [];
    const agent = labels.filter((l) => l.startsWith('agent:'));
    const status = labels.filter((l) => CLAIM_STATUSES.includes(l));
    const problems = [];
    if (agent.length === 0) problems.push('no agent:* label');
    if (status.length === 0)
      problems.push(`neither ${CLAIM_STATUSES.join(' nor ')}`);
    return { ...issue, agent, status, problems, ok: problems.length === 0 };
  });
  const ok = results.every((r) => r.ok);
  return {
    ok,
    exempt: false,
    reason: ok
      ? 'every closing issue is claimed'
      : 'a closing issue is not claimed (AGENTS.md section 1)',
    issues: results,
  };
}

export function renderSummary(number, result) {
  const lines = [
    `## Task claim: PR #${number}`,
    '',
    `${result.ok ? 'Pass' : 'Fail'}: ${result.reason}.`,
  ];
  if (result.issues?.length) {
    lines.push(
      '',
      '| Issue | agent:* | status | Result |',
      '| --- | --- | --- | --- |'
    );
    for (const i of result.issues) {
      lines.push(
        `| ${i.repository}#${i.number} | ${i.agent.join(', ') || '-'} | ` +
          `${i.status.join(', ') || '-'} | ${i.ok ? 'claimed' : i.problems.join('; ')} |`
      );
    }
  }
  if (!result.ok) {
    lines.push(
      '',
      'Claim the issue before merging: add `agent:<nick>` and `status:in-progress` ' +
        '(or `status:in-review` once the PR is open), and set Status and Agent on ' +
        'GitHub Project #9. The check re-runs when the issue labels change.'
    );
  }
  return lines.join('\n') + '\n';
}

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
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
  return {
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    author: pr.author?.login ?? '',
    truncated: refs.totalCount > refs.nodes.length,
    unreadable: refs.nodes.length - readable.length,
    closingIssues: readable.map((n) => ({
      number: n.number,
      repository: n.repository.nameWithOwner,
      labels: n.labels.nodes.map((l) => l.name),
    })),
  };
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
