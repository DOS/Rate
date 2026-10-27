#!/usr/bin/env node
// Opens, updates or closes the CI incident issue for one completed push run
// of the Verify workflow (DOS/Rate#1057, #1134). Run by
// .github/workflows/incident-report.yml with the run in environment variables:
//
//   REPO WORKFLOW BRANCH CONCLUSION RUN_ID RUN_ATTEMPT RUN_URL SHA COMMIT_TITLE
//
// The incident issue keeps a hidden marker with the jobs still waiting to
// recover. A job leaves it only when it concludes `success` in a later run:
// a job skipped on a push (path filter, `if:`) proved nothing. The issue
// closes when the marker is empty. An incident without a readable marker
// (opened before #1134, or with no failing job names) closes only on a run
// in which every job succeeded.

import {
  DEFAULT_REPO,
  encodeRef,
  fail,
  gh,
  ghJson,
  isMain,
} from './lib.mjs';

/** Job conclusions that open or extend an incident. */
const FAILED = new Set(['failure', 'timed_out', 'cancelled']);
const MARKER = /<!-- incident-pending: (.*?) -->/g;

/**
 * The job names still waiting to recover, or null when unknown: then every
 * job must succeed before the incident closes.
 */
export function readPending(body) {
  // The script appends its marker last: an earlier one may be quoted from a
  // commit title.
  const match = [...(body ?? '').matchAll(MARKER)].at(-1);
  if (!match) return null;
  try {
    const names = JSON.parse(match[1]);
    if (!Array.isArray(names)) return null;
    if (!names.every((n) => typeof n === 'string')) return null;
    return names;
  } catch {
    return null;
  }
}

/** The body with its marker set to `pending` (null keeps it unknown). */
export function writePending(body, pending) {
  const rest = (body ?? '').replaceAll(MARKER, '').trimEnd();
  if (pending === null) return rest;
  // `--` cannot appear inside an HTML comment: - keeps the JSON equal.
  const json = JSON.stringify(pending).replaceAll('-', '\\u002d');
  return `${rest}\n\n<!-- incident-pending: ${json} -->`;
}

export const failingJobs = (jobs) =>
  jobs.filter((j) => FAILED.has(j.conclusion)).map((j) => j.name);

/** Events can arrive out of order: only the branch head's run counts. */
export const isCurrentHead = (sha, headSha) => sha === headSha;

const describe = (jobs, names) =>
  names
    .map((name) => {
      const job = jobs.find((j) => j.name === name);
      return `${name} (${job?.conclusion || 'not run'})`;
    })
    .join(', ');

/**
 * What to do with one run. `open` is the open incident `{ number, body }` or
 * null, `jobs` the run's `{ name, conclusion }` list. Returns `{ action }`,
 * one of none, create, update (a failure on an open incident), close or
 * unverified (passed, but a pending job did not succeed), plus `pending` (the
 * new marker), `failing` and `unverified` job names.
 */
export function decide({ conclusion, jobs, open }) {
  // Matrix jobs can share a name: it succeeded only if each of them did.
  const succeeded = new Set(
    jobs
      .filter((j) => j.conclusion === 'success')
      .map((j) => j.name)
      .filter((name) =>
        jobs.every((j) => j.name !== name || j.conclusion === 'success')
      )
  );
  const before = open ? readPending(open.body) : [];

  if (conclusion === 'success') {
    if (!open) return { action: 'none' };
    // A pending job the run does not list at all was renamed or removed from
    // the workflow: it can never pass again. A skipped job is still listed.
    const listed = new Set(jobs.map((j) => j.name));
    const unverified =
      before === null
        ? jobs.filter((j) => j.conclusion !== 'success').map((j) => j.name)
        : before.filter(
            (name) =>
              !succeeded.has(name) && (jobs.length === 0 || listed.has(name))
          );
    // Unknown pending jobs and a run that lists none: nothing proves recovery.
    if (before === null && jobs.length === 0) {
      return { action: 'unverified', pending: null, unverified: [] };
    }
    if (unverified.length === 0) return { action: 'close' };
    return {
      action: 'unverified',
      pending: before === null ? null : unverified,
      unverified,
    };
  }

  const failing = failingJobs(jobs);
  // A new incident with no failing job names stays unknown; an open one
  // keeps the jobs it already waits for.
  let pending = open ? before : failing.length > 0 ? [] : null;
  if (pending !== null) {
    const still = pending.filter((name) => !succeeded.has(name));
    pending = [...new Set([...still, ...failing])];
  }
  return { action: open ? 'update' : 'create', pending, failing };
}

/** Untrusted text as inline code, so its @mentions and #refs do nothing. */
export const codeSpan = (text) =>
  `\`${String(text ?? '')
    .split('\n')[0]
    .slice(0, 120)
    .replaceAll('`', '')}\``;

export function failureBody(run, failing) {
  return [
    `**${run.workflow}** ${run.conclusion} on \`${run.branch}\`.`,
    '',
    `- Run: ${run.url}`,
    `- Commit: \`${run.sha.slice(0, 8)}\` ${codeSpan(run.commitTitle)}`,
    `- Failing jobs: ${failing.join(', ') || 'unknown'}`,
    '',
    `Agents: this is the first priority (AGENTS.md). Claim it, find the breaking change, fix forward. The issue closes itself when every failing job passes on \`${run.branch}\` again.`,
  ].join('\n');
}

export function recoveredBody(run) {
  return `Recovered: ${run.url} passed on \`${run.sha.slice(0, 8)}\` (${codeSpan(run.commitTitle)}).`;
}

export function unverifiedBody(run, jobs, decision) {
  const head = `${run.url} passed on \`${run.sha.slice(0, 8)}\` (${codeSpan(run.commitTitle)}), but it does not prove recovery`;
  if (decision.pending === null) {
    const which = decision.unverified.length
      ? `: ${describe(jobs, decision.unverified)} did not succeed`
      : ': the run listed no jobs';
    return `${head}${which}. This incident does not record which jobs failed, so it stays open until a run in which every job succeeds.`;
  }
  return `${head}: ${describe(jobs, decision.unverified)} did not succeed in it. The incident stays open until each of them concludes \`success\`.`;
}

const incidentTitle = (run) =>
  `incident: ${run.workflow} failing on ${run.branch}`;

function main() {
  const env = process.env;
  const repo = env.REPO || DEFAULT_REPO;
  const run = {
    workflow: env.WORKFLOW,
    branch: env.BRANCH,
    conclusion: env.CONCLUSION,
    id: env.RUN_ID,
    attempt: env.RUN_ATTEMPT,
    url: env.RUN_URL,
    sha: env.SHA,
    commitTitle: env.COMMIT_TITLE,
  };
  for (const key of ['workflow', 'branch', 'conclusion', 'id', 'sha']) {
    if (!run[key]) fail(`incident-report: ${key} is missing`);
  }

  const head = ghJson([
    'api',
    `repos/${repo}/commits/${encodeRef(run.branch)}`,
  ]).sha;
  if (!isCurrentHead(run.sha, head)) {
    console.log(
      `Run is for ${run.sha.slice(0, 8)}, ${run.branch} is at ${head.slice(0, 8)} now: skipped.`
    );
    return;
  }

  gh(
    [
      'label',
      'create',
      'incident',
      '-R',
      repo,
      '--color',
      'B60205',
      '--description',
      'Production or CI breakage: first priority for any free agent',
    ],
    { allowFailure: true }
  );
  // An API error throws here instead of creating a duplicate incident.
  const issues = ghJson([
    'issue',
    'list',
    '-R',
    repo,
    '--state',
    'open',
    '--label',
    'incident',
    '--limit',
    '50',
    '--json',
    'number,title,body',
  ]);
  const open =
    issues.find((issue) => issue.title === incidentTitle(run)) ?? null;
  // The jobs of the attempt this event reports, not of a later re-run.
  const attempt = run.attempt ? ['--attempt', run.attempt] : [];
  const jobs = ghJson([
    'run',
    'view',
    run.id,
    '-R',
    repo,
    ...attempt,
    '--json',
    'jobs',
  ]).jobs.map((j) => ({ name: j.name, conclusion: j.conclusion }));

  const decision = decide({ conclusion: run.conclusion, jobs, open });
  const comment = (body) =>
    gh(['issue', 'comment', String(open.number), '-R', repo, '--body', body]);
  const setPending = (pending) => {
    const body = writePending(open.body, pending);
    if (body === (open.body ?? '').trimEnd()) return;
    gh([
      'api',
      '-X',
      'PATCH',
      `repos/${repo}/issues/${open.number}`,
      '-f',
      `body=${body}`,
    ]);
  };

  switch (decision.action) {
    case 'none':
      break;
    case 'close':
      comment(recoveredBody(run));
      gh([
        'issue',
        'close',
        String(open.number),
        '-R',
        repo,
        '--reason',
        'completed',
      ]);
      break;
    case 'unverified':
      setPending(decision.pending);
      comment(unverifiedBody(run, jobs, decision));
      break;
    case 'update':
      setPending(decision.pending);
      comment(failureBody(run, decision.failing));
      break;
    case 'create':
      gh([
        'issue',
        'create',
        '-R',
        repo,
        '--title',
        incidentTitle(run),
        '--label',
        'incident',
        '--body',
        writePending(failureBody(run, decision.failing), decision.pending),
      ]);
      break;
  }
  console.log(`incident-report: ${decision.action}`);
}

if (isMain(import.meta.url)) main();
