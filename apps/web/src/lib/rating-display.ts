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
 * A score as the page shows it: one decimal, rounded once (D3). This is the
 * one rounding of a 0-5 rating, shared by the star display, the compare and
 * versus marks, the API's `rating_score_5` and the `minRating` filter.
 *
 * It rounds half up on the decimal value, like the database does
 * (`round(numeric, 1)`): a stored 4.350 is 4.4. `toFixed(1)` alone reads the
 * binary float, which sits just under 4.35, and gives 4.3 (DOS/Rate#1631).
 */
export function displayedScore5(score: number): number {
  return Number.isFinite(score) && score > 0 ? Math.round(score * 10) / 10 : 0;
}

/** The value at the printed precision; one decimal goes through D3's rounding. */
function shownValue(value: number, digits: number): number {
  return digits === 1 ? displayedScore5(value) : Number(value.toFixed(digits));
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
