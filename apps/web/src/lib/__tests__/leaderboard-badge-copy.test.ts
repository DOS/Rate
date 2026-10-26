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

console.log('leaderboard-badge-copy: ok');
