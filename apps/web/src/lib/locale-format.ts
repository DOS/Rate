// Locale-aware number, price, percent and date formatting for page text
// (DOS/Rate#1369).
//
// Vietnamese and English pages keep the exact strings they printed before
// this module existed: VND grouping through `toLocaleString('vi-VN')`,
// decimals through `toFixed`, dates through `toLocaleDateString('vi-VN')`.
// Czech pages get the Czech form from Intl cs-CZ: a non-breaking space as the
// thousands separator, a decimal comma, a non-breaking space before `%` and
// `₫`, and `29. 10. 2026` for dates.
//
// API payloads, CSV/JSON exports and Markdown share text do not go through
// this module; they keep their fixed machine-readable form.

export type FormatLocale = 'vi' | 'en' | 'cs';

/** U+00A0, the space Intl cs-CZ puts between groups and before units. */
export const NBSP = ' ';

/** Maps any page locale to a formatter locale; anything unknown is `vi`. */
export function toFormatLocale(locale?: string | null): FormatLocale {
  if (typeof locale !== 'string') return 'vi';
  const primary = locale.trim().slice(0, 32).toLowerCase().split(/[-_]/)[0];
  return primary === 'en' || primary === 'cs' ? primary : 'vi';
}

const isCs = (locale?: string | null) => toFormatLocale(locale) === 'cs';

const csNumberFormats = new Map<string, Intl.NumberFormat>();

function csNumberFormat(
  digits: number | null,
  useGrouping: boolean
): Intl.NumberFormat {
  const key = `${digits ?? 'auto'}:${useGrouping ? 1 : 0}`;
  let nf = csNumberFormats.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat('cs-CZ', {
      useGrouping,
      ...(digits == null
        ? { maximumFractionDigits: 20 }
        : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    });
    csNumberFormats.set(key, nf);
  }
  return nf;
}

/**
 * Formats a number for cs-CZ. The value goes in as the exact decimal string
 * that `toFixed` / `String` gives, so Czech pages show the same digits as the
 * Vietnamese page and only the separators differ.
 */
function formatCs(
  value: number,
  digits: number | null,
  useGrouping: boolean
): string {
  if (!Number.isFinite(value)) return String(value);
  const exact = digits == null ? String(value) : value.toFixed(digits);
  // Intl accepts a decimal string and keeps all of its digits.
  return csNumberFormat(digits, useGrouping).format(exact as unknown as number);
}

/**
 * Grouped integer or plain number, e.g. a price without its currency sign,
 * a follower count or a budget inside a message.
 * vi/en: `value.toLocaleString('vi-VN')` (`1.550.000`); cs: `1 550 000`.
 */
export function formatNumber(value: number, locale?: string | null): string {
  if (isCs(locale)) {
    if (!Number.isFinite(value)) return value.toLocaleString('cs-CZ');
    return value.toLocaleString('cs-CZ', { maximumFractionDigits: 3 });
  }
  return value.toLocaleString('vi-VN');
}

export interface PriceFormatOptions {
  /** Currency sign after the number; `₫` by default. */
  symbol?: string;
}

/**
 * Price in VND with its sign.
 * vi/en: `${value.toLocaleString('vi-VN')} ₫` (`1.550.000 ₫`);
 * cs: `1 550 000 ₫` with non-breaking spaces.
 */
export function formatPriceVnd(
  value: number,
  locale?: string | null,
  options: PriceFormatOptions = {}
): string {
  const symbol = options.symbol ?? '₫';
  const space = isCs(locale) ? NBSP : ' ';
  return `${formatNumber(value, locale)}${space}${symbol}`;
}

export interface DecimalFormatOptions {
  /** Group thousands in cs (vi/en never group, like `toFixed`). */
  grouping?: boolean;
}

/**
 * Fixed-digit decimal such as a rating or a screen size.
 * vi/en: `value.toFixed(digits)` (`4.92`, `5.0`); cs: `4,92`, `5,0`.
 */
export function formatDecimal(
  value: number,
  locale: string | null | undefined,
  digits: number,
  options: DecimalFormatOptions = {}
): string {
  if (isCs(locale)) return formatCs(value, digits, options.grouping ?? false);
  return value.toFixed(digits);
}

/**
 * A number shown as-is, the way a message argument or a template literal
 * prints it today: `String(value)` on vi/en (`13.1`), a decimal comma on cs
 * (`13,1`). A numeric string is treated like its number on cs and kept as-is
 * on vi/en; `null` and `undefined` print an empty string, like an ICU message
 * argument does.
 */
export function formatPlainNumber(
  value: number | string | null | undefined,
  locale?: string | null
): string {
  if (value == null) return '';
  if (!isCs(locale)) return String(value);
  if (typeof value === 'number') return formatCs(value, null, false);
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return value;
  const dot = trimmed.indexOf('.');
  const digits = dot === -1 ? 0 : trimmed.length - dot - 1;
  return formatCs(Number(trimmed), digits, false);
}

export interface PercentFormatOptions {
  /** Fixed fraction digits (`toFixed`); omit to print the number as-is. */
  digits?: number;
  /**
   * vi/en only: put a space before `%` (`13.1 %`). Default false (`13.1%`).
   * Czech always uses a non-breaking space before `%`.
   */
  spaced?: boolean;
}

/**
 * Percent of a value that is already in percent units (13.1 means 13.1 %).
 * vi/en: `${value}%` or `${value.toFixed(digits)}%` exactly as each call site
 * printed it; cs: `13,1 %` with a non-breaking space.
 */
export function formatPercent(
  value: number,
  locale?: string | null,
  options: PercentFormatOptions = {}
): string {
  const { digits, spaced = false } = options;
  if (isCs(locale)) {
    return `${formatCs(value, digits ?? null, false)}${NBSP}%`;
  }
  const num = digits == null ? String(value) : value.toFixed(digits);
  return `${num}${spaced ? ' ' : ''}%`;
}

export type DateInput = Date | number | string;

/**
 * Calendar date.
 * vi/en: `toLocaleDateString('vi-VN', options)` (`29/10/2026`);
 * cs: `toLocaleDateString('cs-CZ', options)` (`29. 10. 2026`).
 * An invalid date prints `Invalid Date`, as `toLocaleDateString` does.
 */
export function formatDate(
  value: DateInput,
  locale?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(isCs(locale) ? 'cs-CZ' : 'vi-VN', options);
}
