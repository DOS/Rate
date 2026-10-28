import type { ExtensionLookupData } from './types.js';

type BadgeLookup = Pick<
  ExtensionLookupData,
  'matchStatus' | 'isAccessoryOrPart' | 'priceAssessment'
>;

export interface ActionBadge {
  text: string;
  /** `null`: leave the colour as it is (the badge is empty). */
  color: string | null;
}

const WARNING_COLOR = '#f59e0b';

/**
 * The toolbar badge for a lookup. A bait price warns, and an unchosen size
 * or an accessory never reads "OK" (DOS/Rate#1298).
 */
export function resolveActionBadge(
  lookup: BadgeLookup | null | undefined
): ActionBadge {
  if (!lookup || lookup.matchStatus === 'not_found') {
    return { text: '', color: null };
  }
  const verdict = lookup.priceAssessment?.verdict;
  if (
    lookup.isAccessoryOrPart ||
    lookup.matchStatus === 'accessory_skip' ||
    verdict === 'accessory_skip'
  ) {
    return { text: '', color: null };
  }
  if (lookup.priceAssessment?.implausiblyLow) {
    return { text: '!', color: WARNING_COLOR };
  }
  switch (verdict) {
    case 'inflated_fake_sale':
      return { text: 'ẢO!', color: '#d83030' };
    case 'genuine_deal':
      return { text: 'TỐT', color: '#2dba69' };
    case 'above_market':
      return { text: 'CAO', color: WARNING_COLOR };
    case 'fair_market_price':
      return { text: 'OK', color: '#3b82f6' };
    default:
      return { text: '?', color: '#6b7280' };
  }
}

export interface PillTheme {
  bg: string;
  border: string;
  dot: string;
}

/** The trust pill's colours; a bait price uses the warning theme (#1298). */
export function resolvePillTheme(
  verdict: string,
  implausiblyLow?: boolean | null
): PillTheme {
  if (implausiblyLow) {
    return {
      bg: 'rgba(245, 158, 11, 0.16)',
      border: WARNING_COLOR,
      dot: WARNING_COLOR,
    };
  }
  switch (verdict) {
    case 'inflated_fake_sale':
      return {
        bg: 'rgba(216, 48, 48, 0.16)',
        border: '#d83030',
        dot: '#d83030',
      };
    case 'genuine_deal':
      return {
        bg: 'rgba(45, 186, 105, 0.16)',
        border: '#2dba69',
        dot: '#2dba69',
      };
    case 'above_market':
      return {
        bg: 'rgba(245, 158, 11, 0.16)',
        border: WARNING_COLOR,
        dot: WARNING_COLOR,
      };
    default:
      return {
        bg: 'rgba(59, 130, 246, 0.16)',
        border: '#3b82f6',
        dot: '#3b82f6',
      };
  }
}

/**
 * The pill's accessible name: the verdict and the summary a sighted user
 * reads, then what activating it does (DOS/Rate#1302). Plain text; the
 * caller escapes it for the attribute.
 */
export function buildPillAriaLabel(
  badgeLabel: string,
  summary: string
): string {
  const parts = [`Rate.vn: ${badgeLabel.trim()}`];
  if (summary.trim()) parts.push(summary.trim());
  parts.push('Mở bảng phân tích giá');
  return parts.join('. ');
}
