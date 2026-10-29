import assert from 'node:assert/strict';

import { modelTokens, rankModelCandidates } from '../model-match';

// Catalogue search candidates ranked against a listing title (DOS/Rate#1379):
// the model the title names first, never one that only contains it.

const m = (slug: string, name: string, storage_gb = 128) => ({
  slug,
  name,
  brand: name.split(' ')[0],
  model: name.replace(/^\S+\s/, '').replace(/\s\d+(GB|TB)$/, ''),
  storage_gb,
});

const IPHONE_16 = m('apple-iphone-16-128gb', 'Apple iPhone 16 128GB');
const IPHONE_16_256 = m('apple-iphone-16-256gb', 'Apple iPhone 16 256GB', 256);
const IPHONE_16E = m('apple-iphone-16e-128gb', 'Apple iPhone 16e 128GB');
const IPHONE_16_PLUS = m(
  'apple-iphone-16-plus-256gb',
  'Apple iPhone 16 Plus 256GB',
  256
);
const IPHONE_16_PRO_MAX = m(
  'apple-iphone-16-pro-max-256gb',
  'Apple iPhone 16 Pro Max 256GB',
  256
);
const S24 = m('samsung-galaxy-s24-256gb', 'Samsung Galaxy S24 256GB', 256);
const S24_ULTRA = m(
  'samsung-galaxy-s24-ultra-256gb',
  'Samsung Galaxy S24 Ultra 256GB',
  256
);

const best = (q: string, list: (typeof IPHONE_16)[], gb?: number) =>
  rankModelCandidates(q, list, gb)[0]!.slug;

// The search answers in no useful order: the 16e first, as on rate.vn.
const searched = [IPHONE_16E, IPHONE_16_PLUS, IPHONE_16, IPHONE_16_PRO_MAX];

assert.equal(best('Apple iPhone 16 128GB', searched), IPHONE_16.slug);
assert.equal(best('iphone 16', searched), IPHONE_16.slug);
assert.equal(
  best('Điện thoại Apple iPhone 16 128GB Chính hãng VN/A', searched),
  IPHONE_16.slug
);
// The other direction (DOS/Rate#594): a 16e title is never the 16.
assert.equal(best('Apple iPhone 16e 128GB', searched), IPHONE_16E.slug);
assert.equal(
  best('iPhone 16E 128GB | Chính hãng VN/A', [IPHONE_16, IPHONE_16E]),
  IPHONE_16E.slug
);
assert.equal(best('iPhone 16 Plus 256GB', searched), IPHONE_16_PLUS.slug);
assert.equal(
  best('Apple iPhone 16 Pro Max 256GB', searched),
  IPHONE_16_PRO_MAX.slug
);
assert.equal(
  best('Samsung Galaxy S24 Ultra', [S24, S24_ULTRA]),
  S24_ULTRA.slug
);
assert.equal(best('Samsung Galaxy S24 256GB', [S24_ULTRA, S24]), S24.slug);
// "e-SIM" is not the 16e.
assert.equal(best('iPhone 16 128GB e-SIM', searched), IPHONE_16.slug);

// The storage size breaks a tie between sizes of one model.
assert.equal(
  best('iPhone 16', [IPHONE_16, IPHONE_16_256], 256),
  IPHONE_16_256.slug
);
// Equal candidates keep the search order.
assert.equal(best('iPhone 16', [IPHONE_16_256, IPHONE_16]), IPHONE_16_256.slug);
assert.deepEqual(rankModelCandidates('anything', []), []);

assert.deepEqual(modelTokens('Apple iPhone 16e 128GB'), [
  'apple',
  'iphone',
  '16',
  'e',
]);
assert.deepEqual(modelTokens('Điện thoại'), ['dien', 'thoai']);

console.warn('  ✅ lookup ranks the model a title names first (#1379)');
