import { t, type MessageKey } from './i18n.js';
import type { ExtensionLookupData, ExtensionPriceAssessment } from './types.js';

type VerdictParamKind = 'price' | 'pct' | 'text';

const VERDICT_PARAM_KINDS: Record<string, VerdictParamKind> = {
  observedPrice: 'price',
  minimumPrice: 'price',
  originalPrice: 'price',
  effectivePrice: 'price',
  marketMedianPrice: 'price',
  histMax: 'price',
  claimedDiscountPct: 'pct',
  vsMarketMedianPct: 'pct',
  keyword: 'text',
};

interface VerdictMessageSpec {
  label: MessageKey;
  labelParams: readonly string[];
  explanation: MessageKey;
  /** In the order of the message's $1, $2, ... placeholders. */
  explanationParams: readonly string[];
}

/**
 * The server's `messageKey` values and the catalogue messages that render
 * them (DOS/Rate#1326). Parameter order follows each message's
 * placeholders.
 */
export const VERDICT_MESSAGES: Readonly<Record<string, VerdictMessageSpec>> = {
  accessory: {
    label: 'verdictLabel_accessory',
    labelParams: [],
    explanation: 'verdictExplanation_accessory',
    explanationParams: [],
  },
  accessory_keyword: {
    label: 'verdictLabel_accessory',
    labelParams: [],
    explanation: 'verdictExplanation_accessory_keyword',
    explanationParams: ['keyword'],
  },
  accessory_price_floor: {
    label: 'verdictLabel_accessory',
    labelParams: [],
    explanation: 'verdictExplanation_accessory_price_floor',
    explanationParams: ['observedPrice', 'minimumPrice'],
  },
  ambiguous_variant: {
    label: 'verdictLabel_ambiguous_variant',
    labelParams: [],
    explanation: 'verdictExplanation_ambiguous_variant',
    explanationParams: [],
  },
  implausibly_low: {
    label: 'verdictLabel_implausibly_low',
    labelParams: [],
    explanation: 'verdictExplanation_implausibly_low',
    explanationParams: ['observedPrice', 'marketMedianPrice'],
  },
  insufficient_history: {
    label: 'verdictLabel_insufficient_history',
    labelParams: [],
    explanation: 'verdictExplanation_insufficient_history',
    explanationParams: [],
  },
  fake_discount: {
    label: 'verdictLabel_fake_discount',
    labelParams: [],
    explanation: 'verdictExplanation_fake_discount',
    explanationParams: [
      'originalPrice',
      'claimedDiscountPct',
      'effectivePrice',
      'marketMedianPrice',
      'histMax',
    ],
  },
  genuine_deal: {
    label: 'verdictLabel_genuine_deal',
    labelParams: [],
    explanation: 'verdictExplanation_genuine_deal',
    explanationParams: ['effectivePrice', 'marketMedianPrice'],
  },
  above_market: {
    label: 'verdictLabel_above_market',
    labelParams: ['vsMarketMedianPct'],
    explanation: 'verdictExplanation_above_market',
    explanationParams: [
      'effectivePrice',
      'marketMedianPrice',
      'vsMarketMedianPct',
    ],
  },
  fair_market: {
    label: 'verdictLabel_fair_market',
    labelParams: [],
    explanation: 'verdictExplanation_fair_market',
    explanationParams: ['effectivePrice', 'marketMedianPrice'],
  },
};

const MAX_KEYWORD_LENGTH = 64;

/**
 * One parameter as the server prints it in Vietnamese: prices with
 * `toLocaleString('vi-VN')` and " ₫", percentages as plain numbers.
 * `null` when the value is missing or of the wrong type.
 */
function formatVerdictParam(
  params: Record<string, unknown>,
  name: string
): string | null {
  if (!Object.prototype.hasOwnProperty.call(params, name)) return null;
  const value = params[name];
  switch (VERDICT_PARAM_KINDS[name]) {
    case 'price':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? `${value.toLocaleString('vi-VN')} ₫`
        : null;
    case 'pct':
      // vi and en print the server's decimal point; Czech writes a comma, as
      // the site does (DOS/Rate#1326). The catalogue's own language decides,
      // so nothing is read from the browser.
      return typeof value === 'number' && Number.isFinite(value)
        ? t('langCode') === 'cs'
          ? String(value).replace('.', ',')
          : String(value)
        : null;
    case 'text': {
      if (typeof value !== 'string') return null;
      const text = value.replace(/[\p{Cc}$]/gu, '').trim();
      return text && text.length <= MAX_KEYWORD_LENGTH ? text : null;
    }
    default:
      return null;
  }
}

export interface VerdictTexts {
  label: string;
  explanation: string;
}

/**
 * The verdict label and explanation in the extension's language, from the
 * server's `messageKey` and `messageParams` (DOS/Rate#1326). An older
 * server, an unknown key or a bad value keeps the server's own text. Plain
 * text; callers escape it.
 */
export function verdictTexts(
  assessment: Pick<
    ExtensionPriceAssessment,
    'badgeLabel' | 'explanation' | 'messageKey' | 'messageParams'
  >
): VerdictTexts {
  const fallback: VerdictTexts = {
    label:
      typeof assessment.badgeLabel === 'string' ? assessment.badgeLabel : '',
    explanation:
      typeof assessment.explanation === 'string' ? assessment.explanation : '',
  };
  const key = assessment.messageKey;
  if (
    typeof key !== 'string' ||
    !Object.prototype.hasOwnProperty.call(VERDICT_MESSAGES, key)
  ) {
    return fallback;
  }
  const spec = VERDICT_MESSAGES[key]!;
  const rawParams = assessment.messageParams;
  const params: Record<string, unknown> =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? rawParams
      : {};
  const fill = (names: readonly string[]): string[] | null => {
    const values: string[] = [];
    for (const name of names) {
      const value = formatVerdictParam(params, name);
      if (value === null) return null;
      values.push(value);
    }
    return values;
  };
  const labelValues = fill(spec.labelParams);
  const explanationValues = fill(spec.explanationParams);
  if (!labelValues || !explanationValues) return fallback;
  return {
    label: t(spec.label, labelValues),
    explanation: t(spec.explanation, explanationValues),
  };
}

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
      return { text: t('badgeFakeSale'), color: '#d83030' };
    case 'genuine_deal':
      return { text: t('badgeGenuineDeal'), color: '#2dba69' };
    case 'above_market':
      return { text: t('badgeAboveMarket'), color: WARNING_COLOR };
    case 'fair_market_price':
      return { text: t('badgeFairPrice'), color: '#3b82f6' };
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
  parts.push(t('pillOpenPanel'));
  return parts.join('. ');
}
