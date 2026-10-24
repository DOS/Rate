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

/**
 * PR numbers from the squash subjects "title (#123)" on dev, oldest first.
 * Merge commits ("Merge pull request #N from DOS/dev") are back-merges or
 * earlier promotions, not released work.
 */
export function releasedPrs(commits) {
  const seen = new Set();
  const prs = [];
  for (const c of commits) {
    const subject = c.commit.message.split('\n')[0];
    if (c.parents.length > 1) continue;
    const match = subject.match(/\(#(\d+)\)\s*$/);
    if (!match || seen.has(match[1])) continue;
    seen.add(match[1]);
    prs.push({
      number: Number(match[1]),
      title: subject.replace(/\s*\(#\d+\)\s*$/, ''),
    });
  }
  return prs;
}

export function promotionBody(prs, extraCommits) {
  const lines = ['Promote dev to main.', ''];
  if (prs.length > 0) {
    lines.push(...prs.map((p) => `- #${p.number} ${p.title}`));
  }
  if (extraCommits > 0) {
    lines.push(`- ${extraCommits} other commit(s) without a PR number`);
  }
  lines.push(
    '',
    'Merge with a merge commit, never squash (Docs/Resources/RELEASE.md).'
  );
  return lines.join('\n');
}

export async function promote({ repo = DEFAULT_REPO, merge = true } = {}) {
  const compare = ghJson(['api', `repos/${repo}/compare/main...dev`]);
  if (compare.ahead_by === 0) {
    return {
      ok: true,
      message: 'dev has nothing that main lacks: no promotion needed',
    };
  }
  const prs = releasedPrs(compare.commits);
  const singleParent = compare.commits.filter(
    (c) => c.parents.length === 1
  ).length;

  const open = ghJson([
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
    'number,url',
  ]);
  let number = open[0]?.number;
  if (!number) {
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
      promotionBody(prs, singleParent - prs.length),
    ]).stdout.trim();
    number = Number(url.split('/').pop());
    console.log(
      `opened ${url} (${prs.length} PRs, ${compare.ahead_by} commits)`
    );
  } else {
    console.log(`reusing open promotion PR #${number}`);
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
