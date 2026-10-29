import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The leaderboard's blocked-spam badge is about 114px wide on a 320px phone
// (~12 characters at its font size). "falešných/spamových" had no line-break
// opportunity (a slash only allows a break before digits), so the badge
// pushed /cs/leaderboard 16px sideways (DOS/Rate#1084). The E2E seed has no
// ignored reviews, so this guards the copy directly.
const MAX_UNBREAKABLE_CHARS = 12;

for (const locale of ['vi', 'en', 'cs'] as const) {
  const file = join(__dirname, '..', '..', '..', 'locales', `${locale}.json`);
  const message: string = JSON.parse(readFileSync(file, 'utf8')).leaderboard
    .blockedSpamCount;
  assert.ok(message, `${locale}: missing leaderboard.blockedSpamCount`);

  // Keep the text of every plural branch; drop ICU syntax and placeholders.
  const text = message
    .replace(/\{count\}/g, '0')
    .replace(/\{count, plural,/, '')
    .replace(/\b(?:zero|one|two|few|many|other)\s*\{/g, ' ')
    .replace(/[{}#]/g, ' ');

  for (const word of text.split(/\s+/).filter(Boolean)) {
    assert.ok(
      word.length <= MAX_UNBREAKABLE_CHARS,
      `${locale}: "${word}" cannot wrap inside the leaderboard badge`
    );
  }
}

// The Vietnamese leaderboard reads in Vietnamese, and no heading carries a
// stray version number (DOS/Rate#1250, DOS/Rate#1251).
{
  const vi = JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'locales', 'vi.json'),
      'utf8'
    )
  );
  const lb = vi.leaderboard as Record<string, string>;
  for (const key of [
    'shortDisplay',
    'shortPerf',
    'shortCamera',
    'shortAnc',
    'shortBattery',
    'shortValue',
    'userUnrated',
    'expertUnrated',
    'userScoreShort',
    'expertScoreShort',
  ]) {
    assert.ok(lb[key], `vi: missing leaderboard.${key}`);
    assert.doesNotMatch(
      lb[key]!,
      /\b(Display|Perf|Battery|Value|User|Expert|Cam\/ANC)\b/,
      `vi leaderboard.${key} is English`
    );
  }
  for (const locale of ['vi', 'en', 'cs'] as const) {
    const title = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', 'locales', `${locale}.json`),
        'utf8'
      )
    ).leaderboard.title as string;
    assert.doesNotMatch(title, /\d+\.\d/, `${locale} leaderboard title`);
  }
  const features = vi.catalog.schemas.smartphones.features as Record<
    string,
    { desc?: string }
  >;
  for (const [key, f] of Object.entries(features)) {
    assert.doesNotMatch(f.desc ?? '', /^[A-Z][a-z]+: /, `vi filter ${key}`);
  }
}

console.log('leaderboard-badge-copy: ok');
