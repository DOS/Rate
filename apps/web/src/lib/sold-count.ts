export const MAX_DISPLAY_SOLD_COUNT = 100_000_000;

const INVALID_SOLD_LABELS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'infinity',
  '-infinity',
  'true',
  'false',
]);

function parseDecimalSoldCount(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return NaN;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function resolveSafeSoldLocale(locale: string): string {
  if (typeof locale !== 'string') return 'vi-VN';
  const cleaned = locale.replace(/\p{Cc}+/gu, '').trim();
  if (!cleaned || cleaned.length > 35) return 'vi-VN';
  try {
    return Intl.getCanonicalLocales(cleaned)[0] || 'vi-VN';
  } catch {
    return 'vi-VN';
  }
}

/**
 * Sold count for display (DOS/Rate-Services#201). When the marketplace only
 * showed a label ("20k+"), `historical_sold` holds that label's floor and
 * `historical_sold_display` the label: show it as a floor, never as an exact
 * number. Vietnamese pages keep the marketplace's own label; other locales get
 * a compact floor with "+" ("1tr+" means nothing outside Vietnamese).
 */
export function formatSoldCount(
  historicalSold: number,
  historicalSoldDisplay: string | null | undefined,
  locale: string
): string {
  const rawSold = parseDecimalSoldCount(historicalSold);
  const sold =
    Number.isFinite(rawSold) && rawSold > 0 && rawSold <= MAX_DISPLAY_SOLD_COUNT
      ? Math.trunc(rawSold)
      : 0;
  const rawLabel =
    typeof historicalSoldDisplay === 'string'
      ? historicalSoldDisplay
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40)
      : '';
  const label =
    rawLabel &&
    !INVALID_SOLD_LABELS.has(rawLabel.toLowerCase()) &&
    /\p{N}/u.test(rawLabel)
      ? rawLabel
      : '';
  const safeLocale = resolveSafeSoldLocale(locale);
  const isVi = safeLocale === 'vi' || safeLocale.startsWith('vi-');
  if (label && sold > 0) {
    if (isVi) return label;
    // Round down first: the label is a lower bound, so 1,950 must not show
    // "2K+". Compact notation with one decimal shows 0.1 of the unit.
    const step =
      sold >= 1_000_000_000
        ? 100_000_000
        : sold >= 1_000_000
          ? 100_000
          : sold >= 1_000
            ? 100
            : 1;
    const floored = Math.floor(sold / step) * step;
    const compact = new Intl.NumberFormat(safeLocale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(floored);
    return `${compact}+`;
  }
  return sold.toLocaleString(isVi ? 'vi-VN' : safeLocale);
}

/**
 * Whether the store reported a sold count. Many retail sites publish none,
 * and their 0 must not read as "nobody bought this" (DOS/Rate#1252).
 */
export function hasSoldCount(historicalSold: unknown): boolean {
  const sold = parseDecimalSoldCount(historicalSold);
  return Number.isFinite(sold) && sold >= 1 && sold <= MAX_DISPLAY_SOLD_COUNT;
}
