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
  const sold =
    Number.isFinite(historicalSold) && historicalSold > 0
      ? Math.trunc(historicalSold)
      : 0;
  const label =
    typeof historicalSoldDisplay === 'string'
      ? historicalSoldDisplay.trim()
      : '';
  if (label && sold > 0) {
    if (locale === 'vi') return label;
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
    const compact = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(floored);
    return `${compact}+`;
  }
  return sold.toLocaleString(locale === 'vi' ? 'vi-VN' : locale);
}
