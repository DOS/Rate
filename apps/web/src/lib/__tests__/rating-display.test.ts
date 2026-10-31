import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  displayRating,
  formatRatingCount,
  formatRatingValue,
  ratingFillPercent,
  ratingTone,
} from '../rating-display';
import { CLIENT_MESSAGE_SCOPES } from '../client-messages';

// Ratings show as stars with the value and a short count (DOS/Rate#1528):
// green from 4.0, orange from 3.0, red below, judged on the printed value.
assert.equal(ratingTone(4.6), 'good');
assert.equal(ratingTone(4.0), 'good');
assert.equal(ratingTone(3.96), 'good', '3.96 prints as 4.0, so it is green');
assert.equal(ratingTone(3.94), 'fair');
assert.equal(ratingTone(3.0), 'fair');
assert.equal(ratingTone(2.96), 'fair', '2.96 prints as 3.0');
assert.equal(ratingTone(2.9), 'poor');
assert.equal(ratingTone(1), 'poor');
assert.equal(ratingTone(3.996, 2), 'good');
assert.equal(ratingTone(3.994, 2), 'fair');

// The fill follows the printed value.
assert.equal(ratingFillPercent(5), 100);
assert.equal(ratingFillPercent(4.6), 92);
assert.equal(ratingFillPercent(2.5), 50);
assert.equal(ratingFillPercent(4.96), 100);

// No rating is no rating, never "0.0" stars; values over 5 are capped.
for (const v of [0, -1, null, undefined, Number.NaN, Infinity, 'x']) {
  assert.equal(displayRating(v), null, String(v));
}
assert.equal(displayRating(4.62), 4.62);
assert.equal(displayRating(7), 5);
assert.equal(displayRating('4.5'), 4.5);

// One decimal by default, the locale's decimal mark; the value is unchanged.
assert.equal(formatRatingValue(4.62, 'vi'), '4.6');
assert.equal(formatRatingValue(4.62, 'en'), '4.6');
assert.equal(formatRatingValue(4.62, 'cs'), '4,6');
assert.equal(formatRatingValue(4.625, 'vi', 2), '4.63');

// The count takes the locale's thousands separator.
assert.equal(formatRatingCount(11204, 'vi'), '11.204');
assert.equal(formatRatingCount(11204, 'en'), '11,204');
assert.equal(formatRatingCount(11204, 'cs'), '11 204');
assert.equal(formatRatingCount(6, 'vi'), '6');
assert.equal(formatRatingCount(-3, 'vi'), '0');

// The verbose words are gone from every on-screen rating message, and each
// locale has the component's messages.
const localesDir = join(__dirname, '..', '..', '..', 'locales');
for (const locale of ['vi', 'en', 'cs'] as const) {
  const raw = readFileSync(join(localesDir, `${locale}.json`), 'utf8');
  const messages = JSON.parse(raw);
  for (const key of ['aria', 'ariaWithCount', 'empty']) {
    assert.ok(messages.starRating?.[key], `${locale}: starRating.${key}`);
  }
  for (const key of [
    'userWeightedScoreLabel',
    'userScoreHint',
    'expertScoreHint',
  ]) {
    assert.ok(messages.productDetail[key], `${locale}: productDetail.${key}`);
  }
  assert.doesNotMatch(messages.productDetail.userWeightedScoreLabel, /\(/);
  // The versus verdict is on screen; the compare CSV/JSON cell keeps its form.
  for (const key of ['versusAutoVerdict', 'versusAutoVerdictTie']) {
    assert.doesNotMatch(
      messages.compare[key],
      /\/ ?5[.,]0/,
      `${locale} ${key}`
    );
  }
}
// Client trees get the component's messages (StarRating has no 'use client'
// of its own, so the client-messages scan does not see it).
assert.ok(CLIENT_MESSAGE_SCOPES.shared.includes('starRating'));
const vi = readFileSync(join(localesDir, 'vi.json'), 'utf8');
for (const phrase of ['bài kiểm chứng', 'chuẩn 10 nhóm']) {
  assert.ok(!vi.includes(phrase), `vi.json still has "${phrase}"`);
}

// Rendered ratings go through the one component: no screen code writes the
// "/5.0" scale next to a rating any more. Markdown, CSV and JSON exports keep
// their fixed machine-readable form, so they are skipped.
const srcDir = join(__dirname, '..', '..');
const screenFiles: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) screenFiles.push(p);
  }
};
walk(srcDir);
// A JSX child `{formatDecimal(5, …)}`; template strings (`${…}`) are export
// text such as the compare CSV cell, which keeps its form.
const SCALE_IN_JSX = /(?<!\$)\{formatDecimal\(5, locale/;
for (const file of screenFiles) {
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, SCALE_IN_JSX, `${file} prints a "/5.0" scale`);
}
assert.ok(
  screenFiles.some((f) =>
    readFileSync(f, 'utf8').includes(
      "import StarRating from '@/components/elementary/StarRating'"
    )
  )
);

console.warn('  ✅ Ratings show as stars with a short count (#1528)');
