#!/usr/bin/env node
// Promotes dev to main as Docs/Resources/RELEASE.md describes: opens the
// promotion PR from dev itself (or reuses the open one), lists the PRs being
// released, and merges it with a merge commit once its checks pass.
//
//   node scripts/ops/promote.mjs [--repo DOS/Rate] [--no-merge]
//     [--claimant <tool>:<session id>]
//
// Then check the release: node scripts/ops/verify-live.mjs --wait 900
//
// Only the Claude Code PO promotes (AGENTS.md section 6): the script refuses
// to run unless the session's claimant, resolved like board.mjs does, is a
// `claude:` one (DOS/Rate#1675). A guard against a Qwen or other session
// promoting by mistake, not access control: a claimant can be passed by hand.

import { parseArgs } from 'node:util';
import { resolveClaimant } from '../claim-lock.mjs';
import { DEFAULT_REPO, fail, gh, ghJson, isMain } from './lib.mjs';
import { mergeWhenGreen } from './merge-when-green.mjs';

/** The only tool whose sessions promote dev to main. */
export const PROMOTER_TOOL = 'claude';

/**
 * The claimant of the session running the promotion, or an error when it
 * cannot be resolved or is not a Claude Code session.
 */
export function promoterClaimant({ flag, env = {} } = {}) {
  const claimant = resolveClaimant({ flag, env });
  const tool = claimant.split(':')[0];
  if (tool !== PROMOTER_TOOL) {
    throw new Error(
      `only the Claude Code PO promotes dev to main (AGENTS.md section 6), ` +
        `and this session's claimant is a ${tool}: one; ask the Claude Code PO ` +
        '(through JOY if it cannot be reached) to promote'
    );
  }
  return claimant;
}

export const PROMOTION_TITLE = 'chore(release): promote dev to main';
/** The compare API lists at most this many commits. */
const COMPARE_COMMIT_LIMIT = 250;

/**
 * The squashed PRs on dev ("title (#123)"), oldest first and once each, and
 * how many single-parent commits carry no PR number. Merge commits are
 * back-merges, earlier promotions or merge-commit PRs, not separate work.
 */
export function releasedPrs(commits) {
  const seen = new Set();
  const prs = [];
  let unnumbered = 0;
  for (const c of commits) {
    if (c.parents.length > 1) continue;
    const subject = c.commit.message.split('\n')[0];
    const match = subject.match(/\(#(\d+)\)\s*$/);
    if (!match) {
      unnumbered += 1;
      continue;
    }
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    prs.push({
      number: Number(match[1]),
      title: subject.replace(/\s*\(#\d+\)\s*$/, ''),
    });
  }
  return { prs, unnumbered };
}

export function promotionBody({ prs, unnumbered }, { truncated = false } = {}) {
  const lines = ['Promote dev to main.', ''];
  lines.push(...prs.map((p) => `- #${p.number} ${p.title}`));
  if (unnumbered > 0) {
    lines.push(`- ${unnumbered} other commit(s) without a PR number`);
  }
  if (truncated) {
    lines.push(
      `- more than ${COMPARE_COMMIT_LIMIT} commits: the list above is incomplete`
    );
  }
  lines.push(
    '',
    'Merge with a merge commit, never squash (Docs/Resources/RELEASE.md).'
  );
  return lines.join('\n');
}

/** The open promotion PR: head dev of this repository, never a fork's dev. */
export const ownPromotionPr = (open) =>
  (open ?? []).find((p) => !p.isCrossRepository) ?? null;

export async function promote({ repo = DEFAULT_REPO, merge = true } = {}) {
  const compare = ghJson(['api', `repos/${repo}/compare/main...dev`]);
  if (compare.ahead_by === 0) {
    return {
      ok: true,
      message: 'dev has nothing that main lacks: no promotion needed',
    };
  }
  const body = promotionBody(releasedPrs(compare.commits), {
    truncated: compare.ahead_by > compare.commits.length,
  });

  const existing = ownPromotionPr(
    ghJson([
      'pr',
      'list',
      '--repo',
      repo,
      '--base',
      'main',
      '--head',
      'dev',
      '--state',
      'open',
      '--json',
      'number,url,isCrossRepository,body',
    ])
  );
  let number = existing?.number;
  if (number) {
    // dev may have moved since the PR was opened: list what it releases now.
    // Only on a real change, since an edit re-runs the PR-base check.
    if ((existing.body ?? '').trim() !== body.trim()) {
      gh(['pr', 'edit', String(number), '--repo', repo, '--body', body]);
    }
    console.log(`reusing open promotion PR #${number}`);
  } else {
    const url = gh([
      'pr',
      'create',
      '--repo',
      repo,
      '--base',
      'main',
      '--head',
      'dev',
      '--title',
      PROMOTION_TITLE,
      '--body',
      body,
    ]).stdout.trim();
    number = Number(url.split('/').pop());
    console.log(`opened ${url} (${compare.ahead_by} commits)`);
  }
  if (!merge)
    return {
      ok: true,
      message: `promotion PR #${number} left open (--no-merge)`,
    };
  return mergeWhenGreen({ repo, number, method: 'merge' });
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      repo: { type: 'string', default: DEFAULT_REPO },
      'no-merge': { type: 'boolean', default: false },
      claimant: { type: 'string' },
    },
  });
  try {
    promoterClaimant({ flag: values.claimant, env: process.env });
  } catch (err) {
    fail(`promote.mjs: ${err.message}`);
  }
  const result = await promote({
    repo: values.repo,
    merge: !values['no-merge'],
  });
  if (!result.ok) fail(result.message);
  console.log(result.message);
}
