import assert from 'node:assert/strict';
import { formatSoldCount, hasSoldCount } from '../sold-count';

assert.equal(
  formatSoldCount(23873, null, 'vi'),
  '23.873',
  'An exact count keeps the existing format'
);
assert.equal(
  formatSoldCount(20000, '20k+', 'vi'),
  '20k+',
  'Vietnamese pages show the marketplace label'
);
assert.equal(
  formatSoldCount(20000, '20k+', 'en'),
  '20K+',
  'Other locales get a compact floor with +'
);
assert.equal(formatSoldCount(1000000, '1tr+', 'en'), '1M+');
assert.equal(
  formatSoldCount(1950, '1,9k', 'en'),
  '1.9K+',
  'The compact floor rounds down, never above the label'
);
assert.equal(
  formatSoldCount(23873, null, 'en'),
  '23,873',
  'Exact counts follow the page locale'
);
assert.ok(formatSoldCount(1000000, '1tr+', 'cs').endsWith('+'));
assert.equal(
  formatSoldCount(20000, '   ', 'vi'),
  '20.000',
  'A blank label is ignored'
);
assert.equal(
  formatSoldCount(0, '20k+', 'vi'),
  '0',
  'A label without a floor is not shown'
);
assert.equal(formatSoldCount(Number.NaN, null, 'vi'), '0');
assert.equal(
  formatSoldCount(999_999_999, '20k+', 'vi'),
  '0',
  'Overflowed historicalSold > 100M must be rejected (#848)'
);
assert.equal(
  formatSoldCount(20_000, '  20k+\u0000\r\n ', 'vi'),
  '20k+',
  'Control characters must be stripped from historicalSoldDisplay (#848)'
);
assert.equal(
  formatSoldCount(23_873, null, 'invalid_locale_tag_!!!'),
  '23.873',
  'Invalid locale tags must safely fall back to vi-VN (#848)'
);
// A store that publishes no sold count shows no "Sold: 0" (DOS/Rate#1252).
assert.equal(hasSoldCount(0), false);
assert.equal(hasSoldCount(null), false);
assert.equal(hasSoldCount(0.4), false);
assert.equal(hasSoldCount(Number.NaN), false);
assert.equal(hasSoldCount(-3), false);
assert.equal(hasSoldCount(1), true);
assert.equal(hasSoldCount('20000'), true);
console.log('✅ sold-count display');
