// How a 0-5 rating is shown on screen (DOS/Rate#1528): stars with a
// fractional fill, the value at one decimal and the count in parentheses.
// The value itself is never changed here, only rounded for display.

import { formatDecimal, toFormatLocale } from './locale-format';

/** The colour band of a rating: green, orange or red stars. */
export type RatingTone = 'good' | 'fair' | 'poor';

/** At or above this the stars are green. */
export const RATING_GOOD_MIN = 4.0;
/** At or above this (and below good) the stars are orange; below, red. */
export const RATING_FAIR_MIN = 3.0;

/** A finite rating above 0, kept within 0-5; anything else is no rating. */
export function displayRating(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(5, n);
}

/**
 * Decimal-safe half-up fixed-point string (`1.005 -> "1.01"`, `4.345 -> "4.35"`,
 * `4.35 -> "4.4"` at 1 digit). Reads the shortest decimal form of `value`
 * instead of scaling in binary float or calling `toFixed` on a midpoint
 * (DOS/Rate#1647). Non-finite or non-positive values print zero (`0.0`).
 */
export function formatScoreFixed(value: number, digits = 1): string {
  const d = Number.isInteger(digits) && digits >= 0 ? Math.min(6, digits) : 1;
  if (!Number.isFinite(value) || value <= 0) {
    return d === 0 ? '0' : `0.${'0'.repeat(d)}`;
  }
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) return value.toFixed(d);
  const digitsOnly = match[1] + (match[2] ?? '');
  const fracLen = (match[2] ?? '').length;
  const exp = match[3] ? Number(match[3]) : 0;
  const shift = exp - fracLen + d;
  if (shift > 20) return value.toFixed(d);
  let roundedScaled: bigint;
  if (shift >= 0) {
    roundedScaled = BigInt(digitsOnly) * 10n ** BigInt(shift);
  } else if (-shift > digitsOnly.length) {
    roundedScaled = 0n;
  } else {
    const div = 10n ** BigInt(-shift);
    roundedScaled = (BigInt(digitsOnly) + div / 2n) / div;
  }
  const s = roundedScaled.toString().padStart(d + 1, '0');
  return d === 0 ? s : `${s.slice(0, -d)}.${s.slice(-d)}`;
}

/** Decimal-safe half-up rounding to `digits` decimals (`0` when `<= 0`). */
export function roundScore(value: number, digits = 1): number {
  return Number(formatScoreFixed(value, digits));
}

/**
 * A score as the page shows it: one decimal, rounded once (D3). This is the
 * one rounding of a 0-5 rating, shared by the star display, the compare and
 * versus marks, the API's `rating_score_5` and the `minRating` filter.
 *
 * It rounds half up on the decimal value, like the database does
 * (`round(numeric, 1)`): a stored 4.350 is 4.4. `toFixed(1)` alone reads the
 * binary float, which sits just under 4.35, and gives 4.3 (DOS/Rate#1631).
 */
export function displayedScore5(score: number): number {
  return Number.isFinite(score) && score > 0 ? roundScore(score, 1) : 0;
}

/** The value at the printed precision, rounded half up on the decimal value. */
function shownValue(value: number, digits: number): number {
  return roundScore(value, digits);
}

/**
 * The band of the value as it is printed, so a 3.96 shown as "4.0" is
 * green, never an orange "4.0".
 */
export function ratingTone(value: number, digits = 1): RatingTone {
  const shown = shownValue(value, digits);
  if (shown >= RATING_GOOD_MIN) return 'good';
  if (shown >= RATING_FAIR_MIN) return 'fair';
  return 'poor';
}

/** Filled share of the five stars, 0-100, as printed. */
export function ratingFillPercent(value: number, digits = 1): number {
  const shown = shownValue(value, digits);
  return Math.max(0, Math.min(100, (shown / 5) * 100));
}

/**
 * The value as printed: `4.6` (vi, en), `4,6` (cs). At one decimal a value
 * that is not a score above 0 prints as `0.0`; callers show their own empty
 * state for it.
 */
export function formatRatingValue(
  value: number,
  locale: string | null | undefined,
  digits = 1
): string {
  return formatDecimal(shownValue(value, digits), locale, digits);
}

/**
 * A review count with the locale's thousands separator: `11.204` (vi),
 * `11,204` (en), `11 204` (cs, non-breaking).
 */
export function formatRatingCount(
  count: number,
  locale: string | null | undefined
): string {
  const n = Math.max(0, Math.round(count));
  const tag = { vi: 'vi-VN', en: 'en-US', cs: 'cs-CZ' }[toFormatLocale(locale)];
  return n.toLocaleString(tag, { maximumFractionDigits: 0 });
}
