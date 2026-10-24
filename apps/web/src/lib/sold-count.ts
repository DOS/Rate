export const MAX_DISPLAY_SOLD_COUNT = 100_000_000;

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
  const rawInput: unknown = historicalSold;
  const rawSold =
    typeof rawInput === 'number'
      ? rawInput
      : typeof rawInput === 'string' && rawInput.trim()
        ? Number(rawInput.trim())
        : NaN;
  const sold =
    Number.isFinite(rawSold) && rawSold > 0 && rawSold <= MAX_DISPLAY_SOLD_COUNT
      ? Math.trunc(rawSold)
      : 0;
  const label =
    typeof historicalSoldDisplay === 'string'
      ? historicalSoldDisplay
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40)
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
