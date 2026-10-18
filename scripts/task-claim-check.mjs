#!/usr/bin/env node
// Advisory task-claim check for PRs into `dev` (.github/workflows/task-claim.yml).
// AGENTS.md section 1: an agent claims an issue before working on it by giving
// it an `agent:<nick>` label and `status:in-progress`, then `status:in-review`
// once the PR is open. A PR that closes issues passes only when every issue it
// closes carries such a claim. Dependabot PRs and the dev to main promotion are
// exempt. The check is not in the dev ruleset yet, so a failure only warns.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CLAIM_STATUSES = ['status:in-progress', 'status:in-review'];

// `pr` is the shape the GraphQL query below returns.
export function evaluateClaim(pr) {
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
  if (pr.headRefName === 'dev' && !pr.isCrossRepository) {
    return { ok: true, exempt: true, reason: 'dev to main promotion' };
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
        'GitHub Project #9. Then re-run this check.'
    );
  }
  return lines.join('\n') + '\n';
}

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      baseRefName
      headRefName
      isCrossRepository
      author { login }
      closingIssuesReferences(first: 25) {
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
  if (!res.ok || body.errors) {
    throw new Error(
      `GraphQL request failed (${res.status}): ${JSON.stringify(body.errors ?? body)}`
    );
  }
  const pr = body.data.repository.pullRequest;
  return {
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    isCrossRepository: pr.isCrossRepository,
    author: pr.author?.login ?? '',
    closingIssues: pr.closingIssuesReferences.nodes.map((n) => ({
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
