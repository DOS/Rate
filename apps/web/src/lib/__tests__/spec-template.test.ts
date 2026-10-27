import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
  type SpecGroupKey,
} from '@repo/shared-data/rules';
import {
  getSpecUiDictionary,
  specGroupHeading,
  specSectionBadge,
} from '../spec-localizer';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

// The headings a category's spec section shows, in order.
const headings = (category: string, locale: string) => {
  const ui = getSpecUiDictionary(locale);
  const template = getCategorySpecTemplate(category);
  return template.groups.map((group: SpecGroupKey, i: number) =>
    specGroupHeading(ui, group, i + 1, template.has5g)
  );
};

function main() {
  console.warn('🧪 Category spec template suite (DOS/Rate#1142)');

  // Phones keep the ten numbered groups, worded as before.
  const phone = headings('smartphones', 'vi');
  assert.equal(phone.length, 10);
  assert.equal(phone[0], '1. Màn hình (Display)');
  assert.equal(phone[5], '6. Mạng Di động & 5G (Cellular)');
  assert.equal(phone[9], '10. Pháp lý, Chứng nhận & SAR (Regulatory)');
  assert.deepEqual(headings('tablets', 'en'), headings('smartphones', 'en'));
  assert.equal(
    specSectionBadge(getSpecUiDictionary('vi'), 10),
    '10 nhóm thông số'
  );

  // Earbuds open on audio and never show a screen, hardware, camera or
  // cellular group, in any locale.
  for (const locale of ['vi', 'en', 'cs']) {
    const ui = getSpecUiDictionary(locale);
    const buds = headings('earbuds', locale);
    assert.equal(buds.length, 6);
    assert.ok(buds[0]!.startsWith('1. '));
    assert.ok(buds[0]!.endsWith(ui.groups.multimedia.replace(/^\d+\.\s*/, '')));
    for (const group of [
      'display',
      'hardware',
      'camera',
      'cellular',
    ] as const) {
      const label = ui.groups[group].replace(/^\d+\.\s*/, '');
      assert.ok(
        !buds.some((h: string) => h.endsWith(label)),
        `earbuds (${locale}) must not show ${group}`
      );
    }
    assert.equal(specSectionBadge(ui, buds.length).startsWith('6 '), true);
  }
  assert.deepEqual(headings('earbuds', 'en'), [
    '1. Audio & multimedia',
    '2. Battery & charging',
    '3. Connectivity & sensors',
    '4. Design & durability',
    '5. Availability & MSRP',
    '6. Regulatory, certifications & SAR',
  ]);

  // Smartwatches: no camera group and no "5G" anywhere in the headings.
  for (const locale of ['vi', 'en', 'cs']) {
    const watch = headings('smartwatches', locale);
    assert.equal(watch.length, 9);
    assert.ok(
      watch.every((h: string) => !h.includes('5G')),
      watch.join(' | ')
    );
  }
  assert.equal(headings('smartwatches', 'vi')[4], '5. Mạng Di động (Cellular)');

  // The card chips read only what the template leaves: an earbud has no
  // "1GB RAM · 64GB" and a cellular watch no "5G".
  const buds = applyCategorySpecTemplate('earbuds', {
    ram_gb: 1,
    storage_gb: 1,
    has_5g: false,
    key_specs: { screen: '1"', ram: '1GB', chip: 'H2' },
  });
  assert.equal(buds.ram_gb, null);
  assert.equal(buds.storage_gb, null);
  assert.deepEqual(buds.key_specs, { chip: 'H2' });
  const ultra2 = applyCategorySpecTemplate('smartwatches', {
    storage_gb: 64,
    has_5g: true,
  });
  assert.equal(ultra2.has_5g, false);
  assert.equal(ultra2.storage_gb, 64);

  // The detail page, the category cards and the home cards all apply it.
  const detail = readSource('../../app/[locale]/smartphones/[slug]/page.tsx');
  assert.match(
    detail,
    /const product = applyCategorySpecTemplate\(categorySlug, storedProduct\)/
  );
  assert.match(detail, /applyCategorySpecTemplate\(categorySlug, peer\)/);
  assert.match(detail, /specTemplate\.groups\.map\(/);
  assert.doesNotMatch(detail, /specUi\.groups\.\w+\}/);
  const catalog = readSource('../../app/[locale]/smartphones/page.tsx');
  assert.match(
    catalog,
    /applyCategorySpecTemplate\(\s*categorySlug,\s*storedItem/
  );
  const home = readSource('../../app/[locale]/page.tsx');
  assert.match(
    home,
    /applyCategorySpecTemplate\(\s*getMasterProductCategorySlug/
  );

  console.warn('  ✅ Category spec templates passed');
}

main();
