import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  formatSwitcherAriaLabel,
  getSwitcherShortCode,
} from '../LocaleSwitcher';

// WCAG 2.5.3 Label in Name (axe-core 4.14 label-content-name-mismatch,
// DOS/Rate#1651): an interactive control whose accessible name overrides its
// content via aria-label / aria-labelledby must contain its visible text
// tokens as a contiguous subsequence after NFKD normalization and stripping
// parentheticals.

const webRoot = path.join(__dirname, '../../../..');
const repoRoot = path.join(webRoot, '../..');

function removeParentheticals(value: string): string {
  let prev: string;
  let current = value;
  do {
    prev = current;
    current = current.replace(/\([^()]*\)/g, '');
  } while (current !== prev);
  return current;
}

function axeCurateTokens(value: string): string[] {
  const normalized = removeParentheticals(
    value.toLowerCase().normalize('NFKD')
  ).replace(/[^\p{L}\p{N}]+/gu, ' ');
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const tokens: string[] = [];
  for (const part of segmenter.segment(normalized)) {
    const trimmed = part.segment.trim();
    if (trimmed) tokens.push(trimmed);
  }
  return tokens;
}

function isAxeLabelContainedInName(
  visibleText: string,
  accessibleName: string
): boolean {
  const needle = axeCurateTokens(visibleText);
  if (needle.length === 0) return true;
  const haystack = axeCurateTokens(accessibleName);
  if (haystack.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, j) => word === haystack[i + j])) {
      return true;
    }
  }
  return false;
}

const locales = ['vi', 'en', 'cs'] as const;
const expectedShort: Record<(typeof locales)[number], string> = {
  vi: 'VI',
  en: 'EN',
  cs: 'CS',
};

for (const locale of locales) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(webRoot, `locales/${locale}.json`), 'utf8')
  ) as {
    rate: { nav: { selectLanguageAria: string } };
  };
  const baseLabel = raw.rate.nav.selectLanguageAria;
  const shortCode = getSwitcherShortCode(locale);
  assert.equal(shortCode, expectedShort[locale], `${locale} short code`);

  // Regression guard: bare selectLanguageAria or parenthesized short code
  // fails axe-core 4.14 label-content-name-mismatch.
  assert.equal(
    isAxeLabelContainedInName(shortCode, baseLabel),
    false,
    `${locale}: bare selectLanguageAria omits visible short code`
  );
  assert.equal(
    isAxeLabelContainedInName(shortCode, `${baseLabel} (${shortCode})`),
    false,
    `${locale}: parenthesized short code is stripped by axe-core 4.14`
  );

  const ariaLabel = formatSwitcherAriaLabel(baseLabel, shortCode);
  assert.equal(ariaLabel, `${baseLabel}: ${shortCode}`);
  assert.equal(
    isAxeLabelContainedInName(shortCode, ariaLabel),
    true,
    `${locale}: accessible name "${ariaLabel}" contains "${shortCode}"`
  );
}

// Edge cases for control characters and empty fragments.
assert.equal(
  formatSwitcherAriaLabel('  Select language\u0000 ', ' EN\n '),
  'Select language: EN'
);
assert.equal(
  formatSwitcherAriaLabel('Select language', '   '),
  'Select language'
);
assert.equal(formatSwitcherAriaLabel('   ', 'VI'), 'VI');

// Source-level guard on LocaleSwitcher.tsx trigger and dropdown buttons.
const switcherSource = fs.readFileSync(
  path.join(webRoot, 'src/components/elementary/LocaleSwitcher.tsx'),
  'utf8'
);
assert.match(
  switcherSource,
  /aria-label=\{formatSwitcherAriaLabel\(\s*tNav\('selectLanguageAria'\),\s*active\.short\s*\)\}/,
  'LocaleSwitcher trigger button wires formatSwitcherAriaLabel with active.short'
);
assert.doesNotMatch(
  switcherSource,
  /aria-label=\{tNav\('selectLanguageAria'\)\}/,
  'LocaleSwitcher trigger button must not omit active.short from aria-label'
);
assert.match(
  switcherSource,
  /aria-pressed=\{isSelected\}/,
  'LocaleSwitcher dropdown option buttons expose active state via aria-pressed'
);

// Home category cards (apps/web/src/app/[locale]/page.tsx): each whole-card
// <Link> must derive its accessible name from its visible child content
// without restricting aria-labelledby to the title alone or duplicating the
// blurb via aria-describedby.
const homePageSource = fs.readFileSync(
  path.join(webRoot, 'src/app/[locale]/page.tsx'),
  'utf8'
);
assert.doesNotMatch(
  homePageSource,
  /home-cat-\$\{cat\.slug\}-title/,
  'home category cards must not restrict Link accessible name to titleId'
);
const categoryLinkMatches = [
  ...homePageSource.matchAll(/<Link\b[^>]*rate-category-card[^>]*>/g),
];
assert.equal(
  categoryLinkMatches.length,
  2,
  'both home category-card sections render whole-card Link elements'
);
for (const [openingTag] of categoryLinkMatches) {
  assert.doesNotMatch(
    openingTag,
    /\baria-label(?:ledby)?=/,
    `category card Link must not override child content name: ${openingTag}`
  );
  assert.doesNotMatch(
    openingTag,
    /\baria-describedby=/,
    `category card Link must not duplicate inner paragraph via aria-describedby: ${openingTag}`
  );
}

// Root package.json pins @axe-core/playwright to 4.14.0 (#1640, #1651).
const rootPkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
) as { devDependencies?: Record<string, string> };
assert.equal(
  rootPkg.devDependencies?.['@axe-core/playwright'],
  '4.14.0',
  'root package.json bumps @axe-core/playwright to 4.14.0'
);

console.log('locale-switcher-a11y: ok');
