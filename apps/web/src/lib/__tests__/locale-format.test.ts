import assert from 'node:assert/strict';
import {
  NBSP,
  formatDate,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatPlainNumber,
  formatPriceVnd,
  toFormatLocale,
} from '../locale-format';

// DOS/Rate#1369: Czech pages get Czech number and date forms, while the
// Vietnamese and English output stays byte-identical to the expressions the
// call sites used before.

// Locale normalization: anything unknown falls back to vi.
assert.equal(toFormatLocale('cs'), 'cs');
assert.equal(toFormatLocale('cs-CZ'), 'cs');
assert.equal(toFormatLocale('EN'), 'en');
assert.equal(toFormatLocale('de'), 'vi');
assert.equal(toFormatLocale(''), 'vi');
assert.equal(toFormatLocale(null), 'vi');
assert.equal(toFormatLocale(undefined), 'vi');

// Prices and grouped numbers: vi and en equal the old expressions.
const prices = [1_550_000, 21_990_000, 0, -1_550_000, 999, 1000, 12.5];
for (const loc of ['vi', 'en', undefined, 'xx'] as const) {
  for (const p of prices) {
    assert.equal(formatNumber(p, loc), p.toLocaleString('vi-VN'));
    assert.equal(formatPriceVnd(p, loc), `${p.toLocaleString('vi-VN')} ₫`);
  }
  assert.equal(formatNumber(Number.NaN, loc), 'NaN');
}
assert.equal(formatPriceVnd(1_550_000, 'vi'), '1.550.000 ₫');
assert.equal(formatPriceVnd(1_550_000, 'en'), '1.550.000 ₫');
assert.equal(
  formatPriceVnd(1_550_000, 'cs'),
  `1${NBSP}550${NBSP}000${NBSP}₫`,
  'Czech groups with non-breaking spaces and keeps the dong sign after it'
);
assert.equal(formatNumber(21_990_000, 'cs'), `21${NBSP}990${NBSP}000`);
assert.equal(formatNumber(999, 'cs'), '999');
assert.equal(formatNumber(0, 'cs'), '0');
assert.equal(formatNumber(-1_550_000, 'cs'), `-1${NBSP}550${NBSP}000`);
assert.equal(formatPriceVnd(0, 'cs'), `0${NBSP}₫`);

// Fixed-digit decimals (ratings): vi/en equal toFixed, cs has a comma and
// the same digits as vi.
const decimals: Array<[number, number]> = [
  [4.92, 2],
  [5, 1],
  [4.925, 2],
  [0, 1],
  [-3.25, 1],
  [1234.5, 1],
  [0.05, 1],
];
for (const loc of ['vi', 'en'] as const) {
  for (const [v, d] of decimals) {
    assert.equal(formatDecimal(v, loc, d), v.toFixed(d));
  }
}
for (const [v, d] of decimals) {
  assert.equal(formatDecimal(v, 'cs', d), v.toFixed(d).replace('.', ','));
}
assert.equal(formatDecimal(4.92, 'cs', 2), '4,92');
assert.equal(formatDecimal(5, 'cs', 1), '5,0');
assert.equal(formatDecimal(-13.1, 'cs', 1), '-13,1');
assert.equal(
  formatDecimal(1234.5, 'cs', 1, { grouping: true }),
  `1${NBSP}234,5`
);
assert.equal(formatDecimal(Number.NaN, 'vi', 1), 'NaN');
assert.equal(formatDecimal(Number.NaN, 'cs', 1), 'NaN');

// Plain numbers, as a message argument prints them.
for (const loc of ['vi', 'en'] as const) {
  for (const v of [13.1, 0, -3.2, 40, 18.25]) {
    assert.equal(formatPlainNumber(v, loc), String(v));
  }
  assert.equal(formatPlainNumber('5.0', loc), '5.0');
  assert.equal(formatPlainNumber(null, loc), '');
  assert.equal(formatPlainNumber(undefined, loc), '');
}
assert.equal(formatPlainNumber(13.1, 'cs'), '13,1');
assert.equal(formatPlainNumber(-3.2, 'cs'), '-3,2');
assert.equal(formatPlainNumber(40, 'cs'), '40');
assert.equal(formatPlainNumber(0, 'cs'), '0');
assert.equal(formatPlainNumber(6.1, 'cs'), '6,1');
assert.equal(formatPlainNumber('5.0', 'cs'), '5,0');
assert.equal(formatPlainNumber('6.1', 'cs'), '6,1');
assert.equal(formatPlainNumber('n/a', 'cs'), 'n/a');
assert.equal(formatPlainNumber(null, 'cs'), '');

// Percent: vi/en keep each call site's form, cs always has a non-breaking
// space before % and a decimal comma.
for (const loc of ['vi', 'en'] as const) {
  assert.equal(formatPercent(13.1, loc), '13.1%');
  assert.equal(formatPercent(13.1, loc), `${13.1}%`);
  assert.equal(formatPercent(-3.2, loc), '-3.2%');
  assert.equal(formatPercent(0, loc), '0%');
  assert.equal(formatPercent(13.1, loc, { spaced: true }), '13.1 %');
  assert.equal(
    formatPercent(11.5, loc, { digits: 1 }),
    (11.5).toFixed(1) + '%'
  );
  assert.equal(formatPercent(5, loc, { digits: 1 }), '5.0%');
}
assert.equal(formatPercent(-13.1, 'cs'), `-13,1${NBSP}%`);
assert.equal(formatPercent(-3.2, 'cs', { spaced: true }), `-3,2${NBSP}%`);
assert.equal(formatPercent(60, 'cs'), `60${NBSP}%`);
assert.equal(formatPercent(0, 'cs'), `0${NBSP}%`);
assert.equal(formatPercent(5, 'cs', { digits: 1 }), `5,0${NBSP}%`);

// Dates: vi/en equal toLocaleDateString('vi-VN'), cs has the Czech form.
const date = new Date(2026, 9, 29);
for (const loc of ['vi', 'en'] as const) {
  assert.equal(formatDate(date, loc), date.toLocaleDateString('vi-VN'));
  assert.equal(formatDate(date, loc), '29/10/2026');
  assert.equal(formatDate(date.getTime(), loc), '29/10/2026');
}
assert.equal(formatDate(date, 'cs'), '29. 10. 2026');
const iso = '2026-10-17T03:00:00Z';
const opts: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
};
assert.equal(
  formatDate(iso, 'vi', opts),
  new Date(iso).toLocaleDateString('vi-VN', opts)
);
assert.equal(formatDate(iso, 'vi', opts), '17/10/2026');
assert.equal(formatDate(iso, 'cs', opts), '17. 10. 2026');
assert.equal(
  formatDate('not a date', 'vi'),
  new Date('not a date').toLocaleDateString('vi-VN'),
  'An invalid date prints what toLocaleDateString printed before'
);

console.log('locale-format tests passed');
