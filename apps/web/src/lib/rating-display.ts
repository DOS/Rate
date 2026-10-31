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
 * The band of the value as it is printed, so a 3.96 shown as "4.0" is
 * green, never an orange "4.0".
 */
export function ratingTone(value: number, digits = 1): RatingTone {
  const shown = Number(value.toFixed(digits));
  if (shown >= RATING_GOOD_MIN) return 'good';
  if (shown >= RATING_FAIR_MIN) return 'fair';
  return 'poor';
}

/** Filled share of the five stars, 0-100, as printed. */
export function ratingFillPercent(value: number, digits = 1): number {
  const shown = Number(value.toFixed(digits));
  return Math.max(0, Math.min(100, (shown / 5) * 100));
}

/** The value as printed: `4.6` (vi, en), `4,6` (cs). */
export function formatRatingValue(
  value: number,
  locale: string | null | undefined,
  digits = 1
): string {
  return formatDecimal(value, locale, digits);
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
