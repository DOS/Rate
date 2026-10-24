#!/usr/bin/env node
// Promotes dev to main as Docs/Resources/RELEASE.md describes: opens the
// promotion PR from dev itself (or reuses the open one), lists the PRs being
// released, and merges it with a merge commit once its checks pass.
//
//   node scripts/ops/promote.mjs [--repo DOS/Rate] [--no-merge]
//
// Then check the release: node scripts/ops/verify-live.mjs --wait 900

import { parseArgs } from 'node:util';
import { DEFAULT_REPO, fail, gh, ghJson, isMain } from './lib.mjs';
import { mergeWhenGreen } from './merge-when-green.mjs';

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
    },
  });
  const result = await promote({
    repo: values.repo,
    merge: !values['no-merge'],
  });
  if (!result.ok) fail(result.message);
  console.log(result.message);
}
