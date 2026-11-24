import { ImageResponse } from 'next/og';
import {
  OG_TRUTH_CARD_HEIGHT,
  OG_TRUTH_CARD_WIDTH,
  SOCIAL_TRUTH_CARD_HEIGHT,
  SOCIAL_TRUTH_CARD_WIDTH,
  isOgComboMaxStores,
  isOgComboMinTrust,
  isOgComboShippingPreset,
  isValidOgSlug,
  isValidOgVariantKey,
  parseOgVersusPair,
  type OgTruthCardFormat,
  type OgTruthCardLocale,
} from './seo';
import {
  COMBO_CART_DEFAULT_MAX_STORES,
  COMBO_CART_DEFAULT_MIN_TRUST,
  COMBO_CART_DEFAULT_SHIPPING_VND,
  COMBO_CART_MAX_ITEMS,
  COMBO_CART_MIN_ITEMS,
} from './combo-cart-optimizer';
import { formatNumber, localizeDecimalPoints } from './locale-format';
import { displayedScore5, formatScoreFixed } from './rating-display';
import { MAX_VALID_VND_PRICE } from './rate-domain';

export const TOTAL_TRACKED_PLATFORMS = 22;

export const OG_TRUTH_CARD_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=86400';

const MAX_OG_QUERY_LENGTH = 512;
const MAX_OG_COMBO_QUERY_LENGTH = 800;

// Exact codepoint ranges present in Next's bundled Geist-Regular.ttf cmap
// (ASCII, Latin-1 excluding U+00AD SHY, Czech Latin-Extended glyphs, and
// Vietnamese horn/circumflex/breve + 5 tones U+1EA0-U+1EF9). Every codepoint
// outside these ranges is stripped so Satori never initiates external Google
// Fonts or Twemoji network calls.
const SAFE_OG_GLYPH_DISALLOWED_RE =
  /[^\u0020-\u007E\u00A1-\u00AC\u00AE-\u0113\u0116-\u012B\u012E-\u0137\u0139-\u013E\u0141-\u0148\u014A-\u014D\u0150-\u017E\u018F\u0192\u01A0-\u01A1\u01AF-\u01B0\u01CD-\u01CE\u01E4-\u01E9\u0218-\u021B\u0237\u1E20-\u1E21\u1E80-\u1E85\u1E9E\u1EA0-\u1EF9\u2022\u2026]/gu;

export type ProductTruthRadarBadgeKind =
  'multi_platform_floor' | 'below_median' | 'fake_sale_trap' | 'verified';

export interface ProductTruthCardData {
  readonly type: 'product';
  readonly slug: string;
  readonly categoryPath: string;
  readonly name: string;
  readonly brand: string;
  readonly minPriceVnd: number;
  readonly maxPriceVnd: number;
  readonly sellerCount: number;
  readonly userScore5: number;
  readonly expertScore10: number | null;
  readonly authenticReviews: number;
  readonly filteredReviews: number;
  readonly radarKind: ProductTruthRadarBadgeKind;
  readonly savingsPct: number;
  readonly fakeMarkupPct: number;
  readonly hasFakeSaleTrap: boolean;
}

export interface VersusTruthCardSide {
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly score5: number;
  readonly minPriceVnd: number;
  readonly sellerCount: number;
  readonly criterionWins: number;
}

export interface VersusTruthCardData {
  readonly type: 'versus';
  readonly versusSlug: string;
  readonly itemA: VersusTruthCardSide;
  readonly itemB: VersusTruthCardSide;
  readonly winnerSide: 'A' | 'B' | 'tie';
  readonly scoreDelta: string | null;
}

export interface DealsTruthCardHighlight {
  readonly name: string;
  readonly minPriceVnd: number;
  readonly savingsPct: number;
  readonly offerCount: number;
}

export interface DealsTruthCardData {
  readonly type: 'deals';
  readonly genuineDealCount: number;
  readonly fakeSaleTrapCount: number;
  readonly totalOffersAnalyzed: number;
  readonly totalClustersAnalyzed: number;
  readonly topDeals: readonly DealsTruthCardHighlight[];
}

export interface ComboTruthCardItem {
  readonly slug: string;
  readonly name: string;
}

export interface ComboTruthCardPlanSummary {
  readonly distinctStoreCount: number;
  readonly itemsSubtotalVnd: number;
  readonly shippingVnd: number;
  readonly totalVnd: number;
  readonly allOfficial: boolean;
  readonly avgTrustScore: number | null;
  readonly verifiedSafeStoreCount: number;
  readonly storeNames: readonly string[];
}

export interface ComboTruthCardData {
  readonly type: 'combo';
  readonly items: readonly ComboTruthCardItem[];
  readonly query: {
    readonly officialOnly: boolean;
    readonly minTrust: number;
    readonly maxStores: number;
    readonly shippingVnd: number;
  };
  readonly singleStoreBest: ComboTruthCardPlanSummary | null;
  readonly multiStoreOptimal: ComboTruthCardPlanSummary | null;
  readonly savingsVsSingleStoreVnd: number;
  readonly savingsVsSingleStorePct: number;
  readonly snapshotTimestampIso: string;
}

export type OgTruthCardData =
  | ProductTruthCardData
  | VersusTruthCardData
  | DealsTruthCardData
  | ComboTruthCardData;

export type ParsedOgTruthCardQuery =
  | {
      readonly type: 'product';
      readonly slug: string;
      readonly variant: string | null;
      readonly locale: OgTruthCardLocale;
      readonly format: OgTruthCardFormat;
      readonly download: boolean;
    }
  | {
      readonly type: 'versus';
      readonly pair: readonly [string, string];
      readonly versusRaw: string;
      readonly locale: OgTruthCardLocale;
      readonly format: OgTruthCardFormat;
      readonly download: boolean;
    }
  | {
      readonly type: 'deals';
      readonly locale: OgTruthCardLocale;
      readonly format: OgTruthCardFormat;
      readonly download: boolean;
    }
  | {
      readonly type: 'combo';
      readonly items: readonly string[];
      readonly officialOnly: boolean;
      readonly minTrust: number;
      readonly maxStores: number;
      readonly shippingVnd: number;
      readonly locale: OgTruthCardLocale;
      readonly format: OgTruthCardFormat;
      readonly download: boolean;
    };

export function sanitizeOgCardText(value: unknown, maxLength = 120): string {
  if (typeof value !== 'string') return '';
  const safeMax =
    typeof maxLength === 'number' && Number.isFinite(maxLength) && maxLength > 2
      ? Math.min(300, Math.floor(maxLength))
      : 120;
  const cleaned = value
    .normalize('NFC')
    .replace(/\p{Cf}+/gu, '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\u20AB/g, 'đ')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\s\u00A0\u202F]+/g, ' ')
    .replace(SAFE_OG_GLYPH_DISALLOWED_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= safeMax) return cleaned;
  const sliced = cleaned.slice(0, safeMax - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > safeMax * 0.55 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.trimEnd()}…`;
}

export function sanitizeOgFileToken(raw: unknown): string {
  if (typeof raw !== 'string') return 'rate-card';
  return (
    raw
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'rate-card'
  );
}

const STRICT_NON_NEG_INT_RE = /^(?:0|[1-9]\d{0,6})$/;
const STRICT_MAX_STORES_RE = /^[1-5]$/;

/**
 * Strictly validates query parameters for `GET /api/v1/rate/og`.
 * Rejects unknown/untrusted query keys (such as `title`, `price`, or cache-busting params),
 * duplicate parameters, whitespace/control/empty/mixed-case enum permutations, and malformed slugs.
 */
export function parseOgTruthCardQuery(
  searchParams: URLSearchParams,
  rawSearch = ''
): ParsedOgTruthCardQuery | null {
  if (!searchParams || typeof searchParams.get !== 'function') {
    return null;
  }
  if (
    typeof rawSearch === 'string' &&
    rawSearch.length > MAX_OG_COMBO_QUERY_LENGTH
  ) {
    return null;
  }

  const rawType = searchParams.get('type');
  if (
    rawType !== 'product' &&
    rawType !== 'versus' &&
    rawType !== 'deals' &&
    rawType !== 'combo'
  ) {
    return null;
  }

  const maxQueryLength =
    rawType === 'combo' ? MAX_OG_COMBO_QUERY_LENGTH : MAX_OG_QUERY_LENGTH;
  if (typeof rawSearch === 'string' && rawSearch.length > maxQueryLength) {
    return null;
  }
  if (searchParams.toString().length > maxQueryLength) {
    return null;
  }

  const allowedKeys =
    rawType === 'product'
      ? new Set(['type', 'slug', 'variant', 'locale', 'format', 'download'])
      : rawType === 'versus'
        ? new Set(['type', 'versus', 'locale', 'format', 'download'])
        : rawType === 'combo'
          ? new Set([
              'type',
              'items',
              'officialOnly',
              'minTrust',
              'maxStores',
              'shippingVnd',
              'locale',
              'format',
              'download',
            ])
          : new Set(['type', 'locale', 'format', 'download']);

  const seenKeys = new Set<string>();
  for (const [key, val] of searchParams.entries()) {
    if (
      !allowedKeys.has(key) ||
      seenKeys.has(key) ||
      !val ||
      /[\s\p{Cc}\p{Cf}]/u.test(val)
    ) {
      return null;
    }
    seenKeys.add(key);
  }

  const rawLocale = searchParams.get('locale');
  let locale: OgTruthCardLocale = 'vi';
  if (rawLocale !== null) {
    if (rawLocale === 'vi' || rawLocale === 'en' || rawLocale === 'cs') {
      locale = rawLocale;
    } else {
      return null;
    }
  }

  const rawFormat = searchParams.get('format');
  let format: OgTruthCardFormat = 'og';
  if (rawFormat !== null) {
    if (rawFormat === 'og' || rawFormat === 'social') {
      format = rawFormat;
    } else {
      return null;
    }
  }

  const rawDownload = searchParams.get('download');
  let download = false;
  if (rawDownload !== null) {
    if (rawDownload === '1' || rawDownload === 'true') {
      download = true;
    } else {
      return null;
    }
  }

  if (rawType === 'product') {
    const rawSlug = searchParams.get('slug');
    if (typeof rawSlug !== 'string' || !isValidOgSlug(rawSlug, 120)) {
      return null;
    }
    const rawVariant = searchParams.get('variant');
    let variant: string | null = null;
    if (rawVariant !== null) {
      if (!isValidOgVariantKey(rawVariant)) {
        return null;
      }
      variant = rawVariant;
    }
    return {
      type: 'product',
      slug: rawSlug,
      variant,
      locale,
      format,
      download,
    };
  }

  if (rawType === 'versus') {
    const rawVersus = searchParams.get('versus');
    const pair = parseOgVersusPair(rawVersus, 120, true);
    if (!pair || `${pair[0]}-vs-${pair[1]}` !== rawVersus) {
      return null;
    }
    return {
      type: 'versus',
      pair,
      versusRaw: rawVersus,
      locale,
      format,
      download,
    };
  }

  if (rawType === 'combo') {
    const rawItems = searchParams.get('items');
    if (typeof rawItems !== 'string' || !rawItems) {
      return null;
    }
    const tokens = rawItems.split(',');
    const uniqueItems: string[] = [];
    const seenLower = new Set<string>();
    for (const token of tokens) {
      if (!isValidOgSlug(token, 120)) {
        return null;
      }
      const lower = token.toLowerCase();
      if (seenLower.has(lower)) {
        return null;
      }
      seenLower.add(lower);
      uniqueItems.push(token);
    }
    if (
      uniqueItems.length < COMBO_CART_MIN_ITEMS ||
      uniqueItems.length > COMBO_CART_MAX_ITEMS
    ) {
      return null;
    }

    const rawOfficial = searchParams.get('officialOnly');
    let officialOnly = false;
    if (rawOfficial !== null) {
      if (rawOfficial === '1') {
        officialOnly = true;
      } else if (rawOfficial === '0') {
        officialOnly = false;
      } else {
        return null;
      }
    }

    const rawMinTrust = searchParams.get('minTrust');
    let minTrust = COMBO_CART_DEFAULT_MIN_TRUST;
    if (rawMinTrust !== null) {
      if (!STRICT_NON_NEG_INT_RE.test(rawMinTrust)) {
        return null;
      }
      const parsedMinTrust = Number(rawMinTrust);
      if (!isOgComboMinTrust(parsedMinTrust)) {
        return null;
      }
      minTrust = parsedMinTrust;
    }

    const rawMaxStores = searchParams.get('maxStores');
    let maxStores = COMBO_CART_DEFAULT_MAX_STORES;
    if (rawMaxStores !== null) {
      if (!STRICT_MAX_STORES_RE.test(rawMaxStores)) {
        return null;
      }
      const parsedMaxStores = Number(rawMaxStores);
      if (!isOgComboMaxStores(parsedMaxStores)) {
        return null;
      }
      maxStores = parsedMaxStores;
    }

    const rawShipping = searchParams.get('shippingVnd');
    let shippingVnd = COMBO_CART_DEFAULT_SHIPPING_VND;
    if (rawShipping !== null) {
      if (!STRICT_NON_NEG_INT_RE.test(rawShipping)) {
        return null;
      }
      const parsedShipping = Number(rawShipping);
      if (!isOgComboShippingPreset(parsedShipping)) {
        return null;
      }
      shippingVnd = parsedShipping;
    }

    return {
      type: 'combo',
      items: uniqueItems,
      officialOnly,
      minTrust,
      maxStores,
      shippingVnd,
      locale,
      format,
      download,
    };
  }

  return {
    type: 'deals',
    locale,
    format,
    download,
  };
}

function clampSafeVnd(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_VALID_VND_PRICE
    ? Math.round(n)
    : 0;
}

function clampSafeCount(value: unknown, max = 10_000_000): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : 0;
}

function clampSafePct(value: unknown, max = 999): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(max, Number(n.toFixed(1))) : 0;
}

function formatOgPriceVnd(amount: number, locale: OgTruthCardLocale): string {
  const safe = clampSafeVnd(amount);
  if (safe <= 0) return '';
  const num = sanitizeOgCardText(formatNumber(safe, locale), 40);
  return locale === 'vi' ? `${num} đ` : `${num} VND`;
}

function formatOgPriceVndOrZero(
  amount: number,
  locale: OgTruthCardLocale
): string {
  const safe = clampSafeVnd(amount);
  if (safe <= 0) {
    return locale === 'vi' ? '0 đ' : '0 VND';
  }
  return formatOgPriceVnd(safe, locale);
}

function csPlural(
  count: number,
  one: string,
  few: string,
  other: string
): string {
  if (count === 1) return one;
  if (count >= 2 && count <= 4) return few;
  return other;
}

function formatComboSnapshotStamp(iso: string): string {
  const parsedMs = Date.parse(iso);
  if (!Number.isFinite(parsedMs)) return '';
  const utc = new Date(parsedMs);
  const vn = new Date(parsedMs + 7 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const vnHm = `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`;
  const utcHm = `${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}`;
  const vnDate = `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
  return `${vnHm} VN (${utcHm} UTC) ${vnDate}`;
}

function formatOgScore5(score: number, locale: OgTruthCardLocale): string {
  const shown = displayedScore5(score);
  if (shown <= 0) return '';
  return localizeDecimalPoints(formatScoreFixed(shown, 1), locale);
}

interface OgCopyDict {
  readonly headerAudit22: string;
  readonly headerVersus: string;
  readonly headerDeals: string;
  readonly radarFloor: (pct: string) => string;
  readonly radarBelowMedian: (pct: string) => string;
  readonly radarFakeTrap: (pct: string) => string;
  readonly radarVerified: string;
  readonly floorPriceLabel: (stores: number) => string;
  readonly outOfStock: string;
  readonly spreadLine: (stores: number, spreadPrice: string) => string;
  readonly noSpreadLine: (stores: number) => string;
  readonly bayesianPill: (score: string) => string;
  readonly unratedPill: string;
  readonly expertPill: (score: string) => string;
  readonly authenticPctPill: (pct: number, count: string) => string;
  readonly collectingReviewsPill: string;
  readonly zeroTrapsPill: string;
  readonly trapDetectedPill: (pct: string) => string;
  readonly footerIndependent: string;
  readonly versusWinnerBadge: (name: string) => string;
  readonly versusTieBadge: string;
  readonly versusScoreLabel: string;
  readonly versusUnrated: string;
  readonly versusCriteriaWins: (count: number) => string;
  readonly versusFloorLabel: (stores: number) => string;
  readonly versusLeadingTag: string;
  readonly dealsHeadline: string;
  readonly dealsSubheadline: string;
  readonly dealsKpiGenuine: string;
  readonly dealsKpiTraps: string;
  readonly dealsKpiOffers: string;
  readonly dealsTopListLabel: string;
  readonly dealsSavingsBadge: (pct: string) => string;
  readonly dealsEmptyHint: string;
  readonly headerCombo: (itemCount: number) => string;
  readonly comboBadgeSavings: (amount: string, pct: string) => string;
  readonly comboBadgeSingleOptimal: string;
  readonly comboBadgeMultiOnly: string;
  readonly comboBadgeUnavailable: string;
  readonly comboFilterOfficial: string;
  readonly comboFilterAllSellers: string;
  readonly comboFilterMinTrust: (trust: number) => string;
  readonly comboFilterMaxStores: (stores: number) => string;
  readonly comboFilterShipping: (amount: string) => string;
  readonly comboPlanATitle: string;
  readonly comboPlanBTitle: string;
  readonly comboPlanAEmpty: (itemCount: number) => string;
  readonly comboPlanBEmpty: string;
  readonly comboPlanStoresMeta: (stores: number, safeCount: number) => string;
  readonly comboPlanAvgTrust: (score: string) => string;
  readonly comboPlanBreakdown: (subtotal: string, shipping: string) => string;
  readonly comboFooterNote: (stamp: string) => string;
}

const OG_COPY: Record<OgTruthCardLocale, OgCopyDict> = {
  vi: {
    headerAudit22: `KIỂM CHỨNG ${TOTAL_TRACKED_PLATFORMS} CHUỖI BÁN LẺ`,
    headerVersus: 'ĐỐI ĐẦU TRỰC TIẾP 1V1',
    headerDeals: `DEAL RADAR ĐA SÀN (${TOTAL_TRACKED_PLATFORMS} CHUỖI)`,
    radarFloor: (pct) => (pct ? `Đáy giá đa sàn (-${pct}%)` : 'Đáy giá đa sàn'),
    radarBelowMedian: (pct) =>
      pct ? `Dưới giá trung vị (-${pct}%)` : 'Dưới giá trung vị',
    radarFakeTrap: (pct) =>
      pct ? `Cảnh báo sale ảo (+${pct}%)` : 'Cảnh báo sale ảo',
    radarVerified: 'Đã đối chiếu giá thật',
    floorPriceLabel: (stores) =>
      `GIÁ THẤP NHẤT ĐÃ KIỂM CHỨNG (${stores}/${TOTAL_TRACKED_PLATFORMS} NƠI BÁN)`,
    outOfStock: 'Hiện chưa có nơi bán còn hàng',
    spreadLine: (stores, spreadPrice) =>
      `Chênh lệch giữa ${stores} nơi bán: tới ${spreadPrice}`,
    noSpreadLine: (stores) =>
      stores > 0
        ? `Đã đối chiếu trực tiếp trên ${stores}/${TOTAL_TRACKED_PLATFORMS} hệ thống bán lẻ`
        : 'Đang theo dõi biến động lịch sử giá độc lập',
    bayesianPill: (score) => `${score} / 5 sao (Bayes)`,
    unratedPill: 'Chưa đủ đánh giá',
    expertPill: (score) => `Rate Lab ${score} / 10`,
    authenticPctPill: (pct, count) =>
      `${pct}% đánh giá thật (${count} mẫu 6 trục v2)`,
    collectingReviewsPill: 'Đang lọc đánh giá thật (6 trục v2)',
    zeroTrapsPill: '0 bẫy nâng giá gốc',
    trapDetectedPill: (pct) =>
      pct ? `Phát hiện giá gốc ảo +${pct}%` : 'Cảnh báo nâng giá gốc',
    footerIndependent: 'Dữ liệu độc lập - 0 link tiếp thị liên kết',
    versusWinnerBadge: (name) => `Dẫn điểm tổng: ${name}`,
    versusTieBadge: 'Cân tài cân sức (hòa điểm tổng)',
    versusScoreLabel: 'Điểm tổng hợp (/5)',
    versusUnrated: 'Chưa chấm',
    versusCriteriaWins: (count) => `Thắng ${count} tiêu chí`,
    versusFloorLabel: (stores) =>
      `Giá đáy (${stores}/${TOTAL_TRACKED_PLATFORMS} sàn)`,
    versusLeadingTag: 'DẪN ĐẦU',
    dealsHeadline: `Săn đáy giá thật trên ${TOTAL_TRACKED_PLATFORMS} chuỗi bán lẻ`,
    dealsSubheadline:
      'Tự động đối chiếu trung vị thị trường, vạch trần chiêu nâng giá gốc gạch ngang.',
    dealsKpiGenuine: 'Deal đáy giá thật',
    dealsKpiTraps: 'Bẫy sale ảo bị lộ',
    dealsKpiOffers: 'Tin bán đã đối chiếu',
    dealsTopListLabel: 'ĐÁY GIÁ THẬT NỔI BẬT HIỆN TẠI',
    dealsSavingsBadge: (pct) => `-${pct}% so với trung vị`,
    dealsEmptyHint: `Hệ thống đang quét liên tục ${TOTAL_TRACKED_PLATFORMS} chuỗi bán lẻ Việt Nam.`,
    headerCombo: (itemCount) =>
      `TỐI ƯU GIỎ COMBO ${itemCount} MÓN (${TOTAL_TRACKED_PLATFORMS} CHUỖI)`,
    comboBadgeSavings: (amount, pct) =>
      pct ? `Tiết kiệm -${amount} (-${pct}%)` : `Tiết kiệm -${amount}`,
    comboBadgeSingleOptimal: '1 cửa hàng đã tối ưu nhất',
    comboBadgeMultiOnly: 'Chỉ có phương án tách đa sàn',
    comboBadgeUnavailable: 'Chưa có tổ hợp đạt bộ lọc',
    comboFilterOfficial: 'Chỉ Official Mall',
    comboFilterAllSellers: 'Tất cả nơi bán',
    comboFilterMinTrust: (trust) => `Trust >= ${trust}/100`,
    comboFilterMaxStores: (stores) => `<= ${stores} shop`,
    comboFilterShipping: (amount) => `Ship ${amount}/đơn`,
    comboPlanATitle: 'PHƯƠNG ÁN A - 1 CỬA HÀNG',
    comboPlanBTitle: 'PHƯƠNG ÁN B - TỐI ƯU ĐA SÀN',
    comboPlanAEmpty: (itemCount) =>
      `Chưa có 1 cửa hàng gom đủ ${itemCount} món đạt lọc`,
    comboPlanBEmpty: 'Không có tổ hợp đa sàn đạt bộ lọc hiện tại',
    comboPlanStoresMeta: (stores, safeCount) =>
      `${stores} chuỗi - ${safeCount}/${stores} Verified Safe`,
    comboPlanAvgTrust: (score) => `Trust TB ${score}/100`,
    comboPlanBreakdown: (subtotal, shipping) =>
      `Hàng ${subtotal} + Ship ${shipping}`,
    comboFooterNote: (stamp) =>
      stamp
        ? `${stamp} - Đã lọc giá mồi & hết hàng`
        : 'Dữ liệu độc lập - Đã lọc giá mồi & hết hàng',
  },
  en: {
    headerAudit22: `VERIFIED ACROSS ${TOTAL_TRACKED_PLATFORMS} RETAIL CHAINS`,
    headerVersus: '1V1 HEAD-TO-HEAD AUDIT',
    headerDeals: `MULTI-STORE DEAL RADAR (${TOTAL_TRACKED_PLATFORMS} CHAINS)`,
    radarFloor: (pct) =>
      pct ? `Cross-platform floor (-${pct}%)` : 'Cross-platform floor',
    radarBelowMedian: (pct) =>
      pct ? `Below market median (-${pct}%)` : 'Below market median',
    radarFakeTrap: (pct) =>
      pct ? `Fake sale warning (+${pct}%)` : 'Fake sale warning',
    radarVerified: 'Verified price audit',
    floorPriceLabel: (stores) =>
      `VERIFIED FLOOR PRICE (${stores}/${TOTAL_TRACKED_PLATFORMS} STORES)`,
    outOfStock: 'Currently out of stock across tracked stores',
    spreadLine: (stores, spreadPrice) =>
      `Price gap across ${stores} sellers: up to ${spreadPrice}`,
    noSpreadLine: (stores) =>
      stores > 0
        ? `Cross-checked across ${stores}/${TOTAL_TRACKED_PLATFORMS} retail chains`
        : 'Independent historical price tracking active',
    bayesianPill: (score) => `${score} / 5 stars (Bayes)`,
    unratedPill: 'Not enough ratings yet',
    expertPill: (score) => `Rate Lab ${score} / 10`,
    authenticPctPill: (pct, count) =>
      `${pct}% genuine reviews (${count} v2 6-axis)`,
    collectingReviewsPill: 'AI 6-axis review filter active',
    zeroTrapsPill: '0 inflated list-price traps',
    trapDetectedPill: (pct) =>
      pct ? `Inflated list-price trap +${pct}%` : 'Inflated list-price warning',
    footerIndependent: 'Independent data - Zero affiliate links',
    versusWinnerBadge: (name) => `Overall leader: ${name}`,
    versusTieBadge: 'Dead heat (tied overall score)',
    versusScoreLabel: 'Overall score (/5)',
    versusUnrated: 'Unrated',
    versusCriteriaWins: (count) => `${count} criterion wins`,
    versusFloorLabel: (stores) =>
      `Floor (${stores}/${TOTAL_TRACKED_PLATFORMS} stores)`,
    versusLeadingTag: 'LEADER',
    dealsHeadline: `Verified floor deals across ${TOTAL_TRACKED_PLATFORMS} retail chains`,
    dealsSubheadline:
      'Cross-checked against market medians to expose inflated strikethrough discounts.',
    dealsKpiGenuine: 'Verified floor deals',
    dealsKpiTraps: 'Fake-sale traps exposed',
    dealsKpiOffers: 'Listings audited',
    dealsTopListLabel: 'TOP VERIFIED FLOOR DEALS',
    dealsSavingsBadge: (pct) => `-${pct}% vs median`,
    dealsEmptyHint: `Continuously auditing ${TOTAL_TRACKED_PLATFORMS} Vietnamese retail chains.`,
    headerCombo: (itemCount) =>
      `COMBO CART OPTIMIZER (${itemCount} ITEMS, ${TOTAL_TRACKED_PLATFORMS} CHAINS)`,
    comboBadgeSavings: (amount, pct) =>
      pct ? `Save -${amount} (-${pct}%)` : `Save -${amount}`,
    comboBadgeSingleOptimal: 'Single store already optimal',
    comboBadgeMultiOnly: 'Multi-store split only',
    comboBadgeUnavailable: 'No valid combo for filters',
    comboFilterOfficial: 'Official Mall only',
    comboFilterAllSellers: 'All sellers',
    comboFilterMinTrust: (trust) => `Trust >= ${trust}/100`,
    comboFilterMaxStores: (stores) =>
      `<= ${stores} ${stores === 1 ? 'store' : 'stores'}`,
    comboFilterShipping: (amount) => `Ship ${amount}/order`,
    comboPlanATitle: 'PLAN A - SINGLE STORE',
    comboPlanBTitle: 'PLAN B - MULTI-STORE OPTIMAL',
    comboPlanAEmpty: (itemCount) =>
      `No single store covers all ${itemCount} items under filters`,
    comboPlanBEmpty: 'No multi-store split matches current filters',
    comboPlanStoresMeta: (stores, safeCount) =>
      `${stores} ${stores === 1 ? 'store' : 'stores'} - ${safeCount}/${stores} Verified Safe`,
    comboPlanAvgTrust: (score) => `Avg trust ${score}/100`,
    comboPlanBreakdown: (subtotal, shipping) =>
      `Items ${subtotal} + Ship ${shipping}`,
    comboFooterNote: (stamp) =>
      stamp
        ? `${stamp} - Bait & OOS filtered`
        : 'Independent data - Bait & OOS filtered',
  },
  cs: {
    headerAudit22: `OVĚŘENO NAPŘÍČ ${TOTAL_TRACKED_PLATFORMS} OBCHODY`,
    headerVersus: 'PŘÍMÝ SOUBOJ 1V1',
    headerDeals: `DEAL RADAR (${TOTAL_TRACKED_PLATFORMS} ŘETĚZCŮ)`,
    radarFloor: (pct) =>
      pct ? `Minimum napříč trhem (-${pct} %)` : 'Minimum napříč trhem',
    radarBelowMedian: (pct) =>
      pct ? `Pod mediánem (-${pct} %)` : 'Pod mediánem',
    radarFakeTrap: (pct) =>
      pct ? `Varování falešná sleva (+${pct} %)` : 'Varování falešná sleva',
    radarVerified: 'Ověřený cenový audit',
    floorPriceLabel: (stores) =>
      `NEJNIŽŠÍ OVĚŘENÁ CENA (${stores}/${TOTAL_TRACKED_PLATFORMS} OBCHODŮ)`,
    outOfStock: 'Momentálně vyprodáno u sledovaných prodejců',
    spreadLine: (stores, spreadPrice) =>
      `Cenový rozdíl mezi ${stores} prodejci: až ${spreadPrice}`,
    noSpreadLine: (stores) =>
      stores > 0
        ? `Ověřeno napříč ${stores}/${TOTAL_TRACKED_PLATFORMS} prodejními sítěmi`
        : 'Nezávislé sledování cenové historie',
    bayesianPill: (score) => `${score} / 5 hvězd (Bayes)`,
    unratedPill: 'Zatím málo hodnocení',
    expertPill: (score) => `Rate Lab ${score} / 10`,
    authenticPctPill: (pct, count) =>
      `${pct} % pravých recenzí (${count} 6osých v2)`,
    collectingReviewsPill: 'Aktivní 6osý filtr falešných recenzí',
    zeroTrapsPill: '0 pastí s umělou původní cenou',
    trapDetectedPill: (pct) =>
      pct ? `Uměle navýšená cena +${pct} %` : 'Varování umělá sleva',
    footerIndependent: 'Nezávislá data - 0 affiliate odkazů',
    versusWinnerBadge: (name) => `Celkový vítěz: ${name}`,
    versusTieBadge: 'Vyrovnaný souboj (shodné skóre)',
    versusScoreLabel: 'Celkové skóre (/5)',
    versusUnrated: 'Nehodnoceno',
    versusCriteriaWins: (count) => `Výhra v ${count} kritériích`,
    versusFloorLabel: (stores) =>
      `Minimum (${stores}/${TOTAL_TRACKED_PLATFORMS} obchodů)`,
    versusLeadingTag: 'VÍTĚZ',
    dealsHeadline: `Ověřená cenová minima napříč ${TOTAL_TRACKED_PLATFORMS} obchody`,
    dealsSubheadline:
      'Automatické porovnání s tržním mediánem odhaluje falešné přeškrtnuté slevy.',
    dealsKpiGenuine: 'Ověřené slevy',
    dealsKpiTraps: 'Odhalené falešné slevy',
    dealsKpiOffers: 'Zkontrolované nabídky',
    dealsTopListLabel: 'NEJLEPŠÍ OVĚŘENÉ NABÍDKY',
    dealsSavingsBadge: (pct) => `-${pct} % oproti mediánu`,
    dealsEmptyHint: `Průběžná kontrola cen napříč ${TOTAL_TRACKED_PLATFORMS} prodejci.`,
    headerCombo: (itemCount) =>
      `KOMBINOVANÝ KOŠÍK (${itemCount} ${csPlural(itemCount, 'POLOŽKA', 'POLOŽKY', 'POLOŽEK')}, ${TOTAL_TRACKED_PLATFORMS} SÍTÍ)`,
    comboBadgeSavings: (amount, pct) =>
      pct ? `Úspora -${amount} (-${pct} %)` : `Úspora -${amount}`,
    comboBadgeSingleOptimal: 'Jeden obchod už je nejvýhodnější',
    comboBadgeMultiOnly: 'Dostupné jen rozdělení mezi obchody',
    comboBadgeUnavailable: 'Pro zvolené filtry není kombinace',
    comboFilterOfficial: 'Jen Official Mall',
    comboFilterAllSellers: 'Všichni prodejci',
    comboFilterMinTrust: (trust) => `Důvěra >= ${trust}/100`,
    comboFilterMaxStores: (stores) =>
      `<= ${stores} ${csPlural(stores, 'obchod', 'obchody', 'obchodů')}`,
    comboFilterShipping: (amount) => `Doprava ${amount}/obj.`,
    comboPlanATitle: 'PLÁN A - 1 OBCHOD',
    comboPlanBTitle: 'PLÁN B - OPTIMÁLNÍ ROZDĚLENÍ',
    comboPlanAEmpty: (itemCount) =>
      `Žádný 1 obchod nemá skladem všech ${itemCount} položek`,
    comboPlanBEmpty: 'Žádná kombinace obchodů nesplňuje filtry',
    comboPlanStoresMeta: (stores, safeCount) =>
      `${stores} ${csPlural(stores, 'obchod', 'obchody', 'obchodů')} - ${safeCount}/${stores} Verified Safe`,
    comboPlanAvgTrust: (score) => `Prům. důvěra ${score}/100`,
    comboPlanBreakdown: (subtotal, shipping) =>
      `Zboží ${subtotal} + Doprava ${shipping}`,
    comboFooterNote: (stamp) =>
      stamp
        ? `${stamp} - Ověřená dostupnost`
        : 'Nezávislá data - Ověřená dostupnost',
  },
};

function renderHeaderBar(params: {
  readonly eyebrow: string;
  readonly badgeText: string;
  readonly badgeTone: 'green' | 'red' | 'amber' | 'blue';
  readonly isPortrait: boolean;
}) {
  const toneColors =
    params.badgeTone === 'green'
      ? {
          bg: 'rgba(52, 211, 153, 0.14)',
          border: 'rgba(52, 211, 153, 0.45)',
          fg: '#34d399',
        }
      : params.badgeTone === 'amber'
        ? {
            bg: 'rgba(251, 191, 36, 0.15)',
            border: 'rgba(251, 191, 36, 0.48)',
            fg: '#fbbf24',
          }
        : params.badgeTone === 'red'
          ? {
              bg: 'rgba(255, 46, 41, 0.16)',
              border: 'rgba(255, 46, 41, 0.5)',
              fg: '#ff6b68',
            }
          : {
              bg: 'rgba(96, 165, 250, 0.14)',
              border: 'rgba(96, 165, 250, 0.45)',
              fg: '#60a5fa',
            };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: params.isPortrait ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: params.isPortrait ? 'flex-start' : 'center',
        gap: params.isPortrait ? 18 : 16,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#FF2E29',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: params.isPortrait ? 24 : 20,
            padding: params.isPortrait ? '8px 18px' : '6px 14px',
            borderRadius: 10,
            letterSpacing: '0.03em',
          }}
        >
          RATE.VN
        </div>
        <div
          style={{
            display: 'flex',
            color: '#94a3b8',
            fontSize: params.isPortrait ? 21 : 18,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {sanitizeOgCardText(params.eyebrow, 80)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: toneColors.bg,
          border: `1.5px solid ${toneColors.border}`,
          color: toneColors.fg,
          borderRadius: 9999,
          padding: params.isPortrait ? '10px 22px' : '8px 18px',
          fontSize: params.isPortrait ? 22 : 18,
          fontWeight: 700,
        }}
      >
        {sanitizeOgCardText(params.badgeText, 64)}
      </div>
    </div>
  );
}

function renderFooterBar(params: {
  readonly canonicalPath: string;
  readonly note: string;
  readonly isPortrait: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: params.isPortrait ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: params.isPortrait ? 'flex-start' : 'center',
        gap: params.isPortrait ? 10 : 16,
        width: '100%',
        paddingTop: params.isPortrait ? 24 : 16,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          color: '#e2e8f0',
          fontSize: params.isPortrait ? 22 : 18,
          fontWeight: 700,
        }}
      >
        {sanitizeOgCardText(`rate.vn${params.canonicalPath}`, 90)}
      </div>
      <div
        style={{
          display: 'flex',
          color: '#94a3b8',
          fontSize: params.isPortrait ? 20 : 17,
          fontWeight: 500,
        }}
      >
        {sanitizeOgCardText(params.note, 80)}
      </div>
    </div>
  );
}

function renderProductCardElement(
  data: ProductTruthCardData,
  locale: OgTruthCardLocale,
  isPortrait: boolean
) {
  const copy = OG_COPY[locale];
  const safeBrand = sanitizeOgCardText(data.brand, 40).toUpperCase();
  const safeName = sanitizeOgCardText(data.name, isPortrait ? 90 : 72);
  const safeStores = Math.min(
    TOTAL_TRACKED_PLATFORMS,
    clampSafeCount(data.sellerCount, TOTAL_TRACKED_PLATFORMS)
  );
  const minPrice = clampSafeVnd(data.minPriceVnd);
  const maxPrice = clampSafeVnd(data.maxPriceVnd);
  const spreadVnd =
    minPrice > 0 && maxPrice > minPrice ? maxPrice - minPrice : 0;

  const formattedFloor =
    minPrice > 0 ? formatOgPriceVnd(minPrice, locale) : copy.outOfStock;
  const spreadText =
    spreadVnd > 0
      ? copy.spreadLine(
          Math.max(2, safeStores),
          formatOgPriceVnd(spreadVnd, locale)
        )
      : copy.noSpreadLine(safeStores);

  const savingsPctStr =
    data.savingsPct > 0
      ? localizeDecimalPoints(clampSafePct(data.savingsPct).toFixed(1), locale)
      : '';
  const fakeMarkupStr =
    data.fakeMarkupPct > 0
      ? localizeDecimalPoints(
          clampSafePct(data.fakeMarkupPct).toFixed(1),
          locale
        )
      : '';

  const radarBadge =
    data.radarKind === 'multi_platform_floor'
      ? { text: copy.radarFloor(savingsPctStr), tone: 'green' as const }
      : data.radarKind === 'below_median'
        ? { text: copy.radarBelowMedian(savingsPctStr), tone: 'green' as const }
        : data.radarKind === 'fake_sale_trap'
          ? { text: copy.radarFakeTrap(fakeMarkupStr), tone: 'amber' as const }
          : { text: copy.radarVerified, tone: 'blue' as const };

  const userScoreStr = formatOgScore5(data.userScore5, locale);
  const bayesianLabel = userScoreStr
    ? copy.bayesianPill(userScoreStr)
    : copy.unratedPill;

  const rawExpert =
    data.expertScore10 != null && Number.isFinite(data.expertScore10)
      ? Math.min(10, Math.max(0, data.expertScore10))
      : 0;
  const expertLabel =
    rawExpert > 0
      ? copy.expertPill(
          localizeDecimalPoints(formatScoreFixed(rawExpert, 1), locale)
        )
      : '';

  const authCount = clampSafeCount(data.authenticReviews);
  const filtCount = clampSafeCount(data.filteredReviews);
  const totalAnalyzed = authCount + filtCount;
  const authenticPct =
    totalAnalyzed > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((authCount / totalAnalyzed) * 100))
        )
      : 0;
  const reviewTrustLabel =
    totalAnalyzed > 0
      ? copy.authenticPctPill(authenticPct, formatNumber(authCount, locale))
      : copy.collectingReviewsPill;

  const trapAuditLabel = data.hasFakeSaleTrap
    ? copy.trapDetectedPill(fakeMarkupStr)
    : copy.zeroTrapsPill;

  const cleanCatPath = data.categoryPath.startsWith('/')
    ? data.categoryPath
    : `/${data.categoryPath}`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f1113',
        backgroundImage:
          'radial-gradient(circle at 88% 14%, rgba(255, 46, 41, 0.16), transparent 44%), radial-gradient(circle at 12% 88%, rgba(52, 211, 153, 0.1), transparent 42%)',
        color: '#f8fafc',
        padding: isPortrait ? '64px 56px' : '44px 56px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {renderHeaderBar({
        eyebrow: copy.headerAudit22,
        badgeText: radarBadge.text,
        badgeTone: radarBadge.tone,
        isPortrait,
      })}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isPortrait ? 28 : 18,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isPortrait ? 10 : 6,
          }}
        >
          {safeBrand ? (
            <div
              style={{
                display: 'flex',
                color: '#FF2E29',
                fontSize: isPortrait ? 22 : 17,
                fontWeight: 800,
                letterSpacing: '0.08em',
              }}
            >
              {safeBrand}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: isPortrait ? 52 : 44,
              fontWeight: 800,
              lineHeight: 1.16,
              letterSpacing: '-0.02em',
            }}
          >
            {safeName}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: isPortrait ? 16 : 10,
            background: '#161a1e',
            border: '1.5px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 22,
            padding: isPortrait ? '34px 36px' : '22px 30px',
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#94a3b8',
              fontSize: isPortrait ? 20 : 16,
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            {sanitizeOgCardText(copy.floorPriceLabel(safeStores), 90)}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: isPortrait ? 'column' : 'row',
              alignItems: isPortrait ? 'flex-start' : 'baseline',
              justifyContent: 'space-between',
              gap: isPortrait ? 12 : 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexShrink: 0,
                color: minPrice > 0 ? '#34d399' : '#cbd5e1',
                fontSize:
                  minPrice > 0 ? (isPortrait ? 58 : 48) : isPortrait ? 32 : 28,
                fontWeight: 800,
                letterSpacing: '-0.02em',
              }}
            >
              {sanitizeOgCardText(formattedFloor, 60)}
            </div>
            <div
              style={{
                display: 'flex',
                color: '#cbd5e1',
                fontSize: isPortrait ? 24 : 20,
                fontWeight: 600,
              }}
            >
              {sanitizeOgCardText(spreadText, 85)}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: isPortrait ? 'column' : 'row',
            flexWrap: 'wrap',
            gap: isPortrait ? 16 : 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255, 46, 41, 0.15)',
              border: '1.5px solid rgba(255, 46, 41, 0.48)',
              color: '#ff8582',
              borderRadius: 14,
              padding: isPortrait ? '16px 24px' : '10px 18px',
              fontSize: isPortrait ? 24 : 19,
              fontWeight: 700,
            }}
          >
            {sanitizeOgCardText(
              expertLabel ? `${bayesianLabel} · ${expertLabel}` : bayesianLabel,
              72
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(96, 165, 250, 0.14)',
              border: '1.5px solid rgba(96, 165, 250, 0.42)',
              color: '#93c5fd',
              borderRadius: 14,
              padding: isPortrait ? '16px 24px' : '10px 18px',
              fontSize: isPortrait ? 24 : 19,
              fontWeight: 700,
            }}
          >
            {sanitizeOgCardText(reviewTrustLabel, 72)}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: data.hasFakeSaleTrap
                ? 'rgba(251, 191, 36, 0.14)'
                : 'rgba(192, 132, 252, 0.14)',
              border: data.hasFakeSaleTrap
                ? '1.5px solid rgba(251, 191, 36, 0.45)'
                : '1.5px solid rgba(192, 132, 252, 0.42)',
              color: data.hasFakeSaleTrap ? '#fcd34d' : '#d8b4fe',
              borderRadius: 14,
              padding: isPortrait ? '16px 24px' : '10px 18px',
              fontSize: isPortrait ? 24 : 19,
              fontWeight: 700,
            }}
          >
            {sanitizeOgCardText(trapAuditLabel, 72)}
          </div>
        </div>
      </div>

      {renderFooterBar({
        canonicalPath: `${cleanCatPath}/${data.slug}`,
        note: copy.footerIndependent,
        isPortrait,
      })}
    </div>
  );
}

function renderVersusSideBox(params: {
  readonly side: VersusTruthCardSide;
  readonly isWinner: boolean;
  readonly locale: OgTruthCardLocale;
  readonly isPortrait: boolean;
}) {
  const copy = OG_COPY[params.locale];
  const scoreStr = formatOgScore5(params.side.score5, params.locale);
  const priceStr =
    params.side.minPriceVnd > 0
      ? formatOgPriceVnd(params.side.minPriceVnd, params.locale)
      : copy.outOfStock;
  const stores = Math.min(
    TOTAL_TRACKED_PLATFORMS,
    clampSafeCount(params.side.sellerCount, TOTAL_TRACKED_PLATFORMS)
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flex: 1,
        background: '#161a1e',
        border: params.isWinner
          ? '2px solid #FF2E29'
          : '1.5px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 22,
        padding: params.isPortrait ? '30px 32px' : '24px 26px',
        gap: params.isPortrait ? 18 : 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#94a3b8',
              fontSize: params.isPortrait ? 20 : 16,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            {sanitizeOgCardText(
              params.side.brand || 'DEVICE',
              32
            ).toUpperCase()}
          </div>
          {params.isWinner ? (
            <div
              style={{
                display: 'flex',
                background: '#FF2E29',
                color: '#ffffff',
                borderRadius: 9999,
                padding: '4px 12px',
                fontSize: params.isPortrait ? 17 : 14,
                fontWeight: 800,
                letterSpacing: '0.05em',
              }}
            >
              {sanitizeOgCardText(copy.versusLeadingTag, 24)}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: params.isPortrait ? 34 : 28,
            fontWeight: 800,
            lineHeight: 1.2,
          }}
        >
          {sanitizeOgCardText(params.side.name, params.isPortrait ? 64 : 46)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          paddingTop: 12,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#94a3b8',
              fontSize: params.isPortrait ? 18 : 15,
              fontWeight: 600,
            }}
          >
            {sanitizeOgCardText(copy.versusFloorLabel(stores), 48)}
          </div>
          <div
            style={{
              display: 'flex',
              color: params.side.minPriceVnd > 0 ? '#34d399' : '#94a3b8',
              fontSize:
                params.side.minPriceVnd > 0
                  ? params.isPortrait
                    ? 32
                    : 26
                  : 20,
              fontWeight: 800,
            }}
          >
            {sanitizeOgCardText(priceStr, 36)}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#94a3b8',
              fontSize: params.isPortrait ? 18 : 15,
              fontWeight: 600,
            }}
          >
            {sanitizeOgCardText(copy.versusScoreLabel, 36)}
          </div>
          <div
            style={{
              display: 'flex',
              color: scoreStr ? '#f8fafc' : '#94a3b8',
              fontSize: params.isPortrait ? 34 : 28,
              fontWeight: 800,
            }}
          >
            {sanitizeOgCardText(scoreStr || copy.versusUnrated, 24)}
          </div>
          <div
            style={{
              display: 'flex',
              color: '#93c5fd',
              fontSize: params.isPortrait ? 18 : 15,
              fontWeight: 700,
            }}
          >
            {sanitizeOgCardText(
              copy.versusCriteriaWins(
                clampSafeCount(params.side.criterionWins, 20)
              ),
              36
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderVersusCardElement(
  data: VersusTruthCardData,
  locale: OgTruthCardLocale,
  isPortrait: boolean
) {
  const copy = OG_COPY[locale];
  const winnerName =
    data.winnerSide === 'A'
      ? sanitizeOgCardText(data.itemA.name, 34)
      : data.winnerSide === 'B'
        ? sanitizeOgCardText(data.itemB.name, 34)
        : '';
  const topBadge =
    data.winnerSide === 'tie' || !winnerName
      ? { text: copy.versusTieBadge, tone: 'blue' as const }
      : { text: copy.versusWinnerBadge(winnerName), tone: 'red' as const };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f1113',
        backgroundImage:
          'radial-gradient(circle at 50% 10%, rgba(255, 46, 41, 0.16), transparent 50%)',
        color: '#f8fafc',
        padding: isPortrait ? '64px 56px' : '44px 56px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {renderHeaderBar({
        eyebrow: copy.headerVersus,
        badgeText: topBadge.text,
        badgeTone: topBadge.tone,
        isPortrait,
      })}

      <div
        style={{
          display: 'flex',
          flexDirection: isPortrait ? 'column' : 'row',
          alignItems: 'stretch',
          gap: isPortrait ? 22 : 20,
          width: '100%',
        }}
      >
        {renderVersusSideBox({
          side: data.itemA,
          isWinner: data.winnerSide === 'A',
          locale,
          isPortrait,
        })}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'center',
            width: isPortrait ? 68 : 56,
            height: isPortrait ? 68 : 56,
            borderRadius: 9999,
            background: 'rgba(255, 46, 41, 0.2)',
            border: '2px solid #FF2E29',
            color: '#ffffff',
            fontSize: isPortrait ? 24 : 20,
            fontWeight: 800,
          }}
        >
          VS
        </div>

        {renderVersusSideBox({
          side: data.itemB,
          isWinner: data.winnerSide === 'B',
          locale,
          isPortrait,
        })}
      </div>

      {renderFooterBar({
        canonicalPath: `/compare/${data.versusSlug}`,
        note: copy.footerIndependent,
        isPortrait,
      })}
    </div>
  );
}

function renderDealsCardElement(
  data: DealsTruthCardData,
  locale: OgTruthCardLocale,
  isPortrait: boolean
) {
  const copy = OG_COPY[locale];
  const genuineCount = clampSafeCount(data.genuineDealCount);
  const trapCount = clampSafeCount(data.fakeSaleTrapCount);
  const offerCount = clampSafeCount(data.totalOffersAnalyzed);
  const dealsToShow = data.topDeals.slice(0, isPortrait ? 4 : 2);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f1113',
        backgroundImage:
          'radial-gradient(circle at 85% 15%, rgba(52, 211, 153, 0.15), transparent 45%), radial-gradient(circle at 15% 85%, rgba(255, 46, 41, 0.14), transparent 45%)',
        color: '#f8fafc',
        padding: isPortrait ? '64px 56px' : '42px 56px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {renderHeaderBar({
        eyebrow: copy.headerDeals,
        badgeText: copy.radarVerified,
        badgeTone: 'green',
        isPortrait,
      })}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isPortrait ? 26 : 16,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: isPortrait ? 46 : 36,
              fontWeight: 800,
              lineHeight: 1.18,
              letterSpacing: '-0.02em',
            }}
          >
            {sanitizeOgCardText(copy.dealsHeadline, 90)}
          </div>
          <div
            style={{
              display: 'flex',
              color: '#94a3b8',
              fontSize: isPortrait ? 23 : 18,
              fontWeight: 500,
            }}
          >
            {sanitizeOgCardText(copy.dealsSubheadline, 120)}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 16,
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              background: '#161a1e',
              border: '1.5px solid rgba(52, 211, 153, 0.35)',
              borderRadius: 18,
              padding: isPortrait ? '22px 24px' : '14px 20px',
              gap: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                color: '#34d399',
                fontSize: isPortrait ? 42 : 32,
                fontWeight: 800,
              }}
            >
              {sanitizeOgCardText(formatNumber(genuineCount, locale), 24)}
            </div>
            <div
              style={{
                display: 'flex',
                color: '#cbd5e1',
                fontSize: isPortrait ? 19 : 15,
                fontWeight: 600,
              }}
            >
              {sanitizeOgCardText(copy.dealsKpiGenuine, 40)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              background: '#161a1e',
              border: '1.5px solid rgba(255, 46, 41, 0.4)',
              borderRadius: 18,
              padding: isPortrait ? '22px 24px' : '14px 20px',
              gap: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                color: '#FF2E29',
                fontSize: isPortrait ? 42 : 32,
                fontWeight: 800,
              }}
            >
              {sanitizeOgCardText(formatNumber(trapCount, locale), 24)}
            </div>
            <div
              style={{
                display: 'flex',
                color: '#cbd5e1',
                fontSize: isPortrait ? 19 : 15,
                fontWeight: 600,
              }}
            >
              {sanitizeOgCardText(copy.dealsKpiTraps, 40)}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              background: '#161a1e',
              border: '1.5px solid rgba(96, 165, 250, 0.35)',
              borderRadius: 18,
              padding: isPortrait ? '22px 24px' : '14px 20px',
              gap: 4,
            }}
          >
            <div
              style={{
                display: 'flex',
                color: '#60a5fa',
                fontSize: isPortrait ? 42 : 32,
                fontWeight: 800,
              }}
            >
              {sanitizeOgCardText(formatNumber(offerCount, locale), 24)}
            </div>
            <div
              style={{
                display: 'flex',
                color: '#cbd5e1',
                fontSize: isPortrait ? 19 : 15,
                fontWeight: 600,
              }}
            >
              {sanitizeOgCardText(copy.dealsKpiOffers, 40)}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: '#94a3b8',
              fontSize: isPortrait ? 18 : 14,
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            {sanitizeOgCardText(copy.dealsTopListLabel, 60)}
          </div>

          {dealsToShow.length === 0 ? (
            <div
              style={{
                display: 'flex',
                background: '#161a1e',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 14,
                padding: '14px 20px',
                color: '#cbd5e1',
                fontSize: isPortrait ? 20 : 17,
              }}
            >
              {sanitizeOgCardText(copy.dealsEmptyHint, 96)}
            </div>
          ) : (
            dealsToShow.map((deal, idx) => {
              const pctStr = localizeDecimalPoints(
                clampSafePct(deal.savingsPct).toFixed(1),
                locale
              );
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#161a1e',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 14,
                    padding: isPortrait ? '18px 22px' : '11px 18px',
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flex: 1,
                      color: '#f8fafc',
                      fontSize: isPortrait ? 23 : 18,
                      fontWeight: 700,
                    }}
                  >
                    {sanitizeOgCardText(deal.name, isPortrait ? 48 : 54)}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexShrink: 0,
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        color: '#34d399',
                        fontSize: isPortrait ? 23 : 18,
                        fontWeight: 800,
                      }}
                    >
                      {sanitizeOgCardText(
                        formatOgPriceVnd(deal.minPriceVnd, locale),
                        32
                      )}
                    </div>
                    {deal.savingsPct > 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          background: 'rgba(52, 211, 153, 0.14)',
                          border: '1px solid rgba(52, 211, 153, 0.4)',
                          color: '#34d399',
                          borderRadius: 9999,
                          padding: '4px 12px',
                          fontSize: isPortrait ? 17 : 14,
                          fontWeight: 700,
                        }}
                      >
                        {sanitizeOgCardText(copy.dealsSavingsBadge(pctStr), 32)}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {renderFooterBar({
        canonicalPath: '/deals',
        note: copy.footerIndependent,
        isPortrait,
      })}
    </div>
  );
}

function renderComboPlanBox(params: {
  readonly title: string;
  readonly plan: ComboTruthCardPlanSummary | null;
  readonly emptyText: string;
  readonly isWinner: boolean;
  readonly locale: OgTruthCardLocale;
  readonly isPortrait: boolean;
}) {
  const copy = OG_COPY[params.locale];
  const plan = params.plan;
  const stores = plan
    ? Math.max(1, clampSafeCount(plan.distinctStoreCount, 10))
    : 0;
  const safeCount = plan
    ? Math.min(stores, clampSafeCount(plan.verifiedSafeStoreCount, stores))
    : 0;
  const avgTrustStr =
    plan &&
    typeof plan.avgTrustScore === 'number' &&
    Number.isFinite(plan.avgTrustScore)
      ? localizeDecimalPoints(
          Number.isInteger(plan.avgTrustScore)
            ? String(plan.avgTrustScore)
            : plan.avgTrustScore.toFixed(1),
          params.locale
        )
      : '';
  const storePreview = plan
    ? plan.storeNames
        .slice(0, 3)
        .map((n) => sanitizeOgCardText(n, 28))
        .filter(Boolean)
        .join(' + ')
    : '';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flex: 1,
        background: '#161a1e',
        border: params.isWinner
          ? '2px solid #34d399'
          : '1.5px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 20,
        padding: params.isPortrait ? '28px 30px' : '20px 24px',
        gap: params.isPortrait ? 14 : 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            color: params.isWinner ? '#34d399' : '#94a3b8',
            fontSize: params.isPortrait ? 20 : 15,
            fontWeight: 800,
            letterSpacing: '0.05em',
          }}
        >
          {sanitizeOgCardText(params.title, 48)}
        </div>
        {plan && plan.allOfficial ? (
          <div
            style={{
              display: 'flex',
              background: 'rgba(96, 165, 250, 0.14)',
              border: '1px solid rgba(96, 165, 250, 0.4)',
              color: '#93c5fd',
              borderRadius: 9999,
              padding: '3px 10px',
              fontSize: params.isPortrait ? 16 : 13,
              fontWeight: 700,
            }}
          >
            Official Mall
          </div>
        ) : null}
      </div>

      {!plan ? (
        <div
          style={{
            display: 'flex',
            color: '#94a3b8',
            fontSize: params.isPortrait ? 22 : 18,
            fontWeight: 600,
            lineHeight: 1.35,
          }}
        >
          {sanitizeOgCardText(params.emptyText, 96)}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: params.isPortrait ? 10 : 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              color: params.isWinner ? '#34d399' : '#f8fafc',
              fontSize: params.isPortrait ? 46 : 36,
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            {sanitizeOgCardText(
              formatOgPriceVndOrZero(plan.totalVnd, params.locale),
              36
            )}
          </div>
          <div
            style={{
              display: 'flex',
              color: '#cbd5e1',
              fontSize: params.isPortrait ? 20 : 15,
              fontWeight: 600,
            }}
          >
            {sanitizeOgCardText(
              copy.comboPlanBreakdown(
                formatOgPriceVndOrZero(plan.itemsSubtotalVnd, params.locale),
                formatOgPriceVndOrZero(plan.shippingVnd, params.locale)
              ),
              72
            )}
          </div>
          <div
            style={{
              display: 'flex',
              color: '#94a3b8',
              fontSize: params.isPortrait ? 19 : 15,
              fontWeight: 600,
            }}
          >
            {sanitizeOgCardText(
              avgTrustStr
                ? `${copy.comboPlanStoresMeta(stores, safeCount)} - ${copy.comboPlanAvgTrust(avgTrustStr)}`
                : copy.comboPlanStoresMeta(stores, safeCount),
              72
            )}
          </div>
          {storePreview ? (
            <div
              style={{
                display: 'flex',
                color: '#e2e8f0',
                fontSize: params.isPortrait ? 19 : 15,
                fontWeight: 600,
              }}
            >
              {sanitizeOgCardText(storePreview, 64)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function renderComboCardElement(
  data: ComboTruthCardData,
  locale: OgTruthCardLocale,
  isPortrait: boolean
) {
  const copy = OG_COPY[locale];
  const itemCount = data.items.length;
  const savingsVnd = clampSafeVnd(data.savingsVsSingleStoreVnd);
  const savingsPctStr =
    data.savingsVsSingleStorePct > 0
      ? localizeDecimalPoints(
          clampSafePct(data.savingsVsSingleStorePct).toFixed(1),
          locale
        )
      : '';

  const topBadge =
    savingsVnd > 0 && data.multiStoreOptimal
      ? {
          text: copy.comboBadgeSavings(
            formatOgPriceVnd(savingsVnd, locale),
            savingsPctStr
          ),
          tone: 'green' as const,
        }
      : data.singleStoreBest
        ? { text: copy.comboBadgeSingleOptimal, tone: 'blue' as const }
        : data.multiStoreOptimal
          ? { text: copy.comboBadgeMultiOnly, tone: 'green' as const }
          : { text: copy.comboBadgeUnavailable, tone: 'amber' as const };

  const itemsLine = data.items
    .map((item) => sanitizeOgCardText(item.name || item.slug, 38))
    .filter(Boolean)
    .join(' + ');

  const filterPills = [
    data.query.officialOnly
      ? copy.comboFilterOfficial
      : copy.comboFilterAllSellers,
    copy.comboFilterMinTrust(clampSafeCount(data.query.minTrust, 100)),
    copy.comboFilterMaxStores(
      Math.max(1, clampSafeCount(data.query.maxStores, 5))
    ),
    copy.comboFilterShipping(
      formatOgPriceVndOrZero(data.query.shippingVnd, locale)
    ),
  ];

  const isMultiWinner = Boolean(data.multiStoreOptimal) && savingsVnd > 0;
  const isSingleWinner = Boolean(data.singleStoreBest) && !isMultiWinner;
  const stamp = formatComboSnapshotStamp(data.snapshotTimestampIso);
  const itemsQuery = data.items.map((item) => item.slug).join(',');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f1113',
        backgroundImage:
          'radial-gradient(circle at 86% 16%, rgba(52, 211, 153, 0.15), transparent 44%), radial-gradient(circle at 14% 84%, rgba(255, 46, 41, 0.14), transparent 44%)',
        color: '#f8fafc',
        padding: isPortrait ? '60px 52px' : '40px 52px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {renderHeaderBar({
        eyebrow: copy.headerCombo(itemCount),
        badgeText: topBadge.text,
        badgeTone: topBadge.tone,
        isPortrait,
      })}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isPortrait ? 22 : 14,
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            color: '#ffffff',
            fontSize: isPortrait ? 32 : 24,
            fontWeight: 800,
            lineHeight: 1.24,
            letterSpacing: '-0.01em',
          }}
        >
          {sanitizeOgCardText(itemsLine, isPortrait ? 130 : 108)}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: isPortrait ? 12 : 10,
          }}
        >
          {filterPills.map((pillText, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                color: '#cbd5e1',
                borderRadius: 9999,
                padding: isPortrait ? '8px 16px' : '5px 14px',
                fontSize: isPortrait ? 19 : 15,
                fontWeight: 600,
              }}
            >
              {sanitizeOgCardText(pillText, 44)}
            </div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: isPortrait ? 'column' : 'row',
            alignItems: 'stretch',
            gap: isPortrait ? 18 : 18,
            width: '100%',
          }}
        >
          {renderComboPlanBox({
            title: copy.comboPlanATitle,
            plan: data.singleStoreBest,
            emptyText: copy.comboPlanAEmpty(itemCount),
            isWinner: isSingleWinner,
            locale,
            isPortrait,
          })}
          {renderComboPlanBox({
            title: copy.comboPlanBTitle,
            plan: data.multiStoreOptimal,
            emptyText: copy.comboPlanBEmpty,
            isWinner: isMultiWinner,
            locale,
            isPortrait,
          })}
        </div>
      </div>

      {renderFooterBar({
        canonicalPath: `/watchlist?items=${itemsQuery}`,
        note: copy.comboFooterNote(stamp),
        isPortrait,
      })}
    </div>
  );
}

export function buildOgTruthCardElement(
  card: OgTruthCardData,
  format: OgTruthCardFormat = 'og',
  locale: OgTruthCardLocale = 'vi'
) {
  const isPortrait = format === 'social';
  if (card.type === 'product') {
    return renderProductCardElement(card, locale, isPortrait);
  }
  if (card.type === 'versus') {
    return renderVersusCardElement(card, locale, isPortrait);
  }
  if (card.type === 'combo') {
    return renderComboCardElement(card, locale, isPortrait);
  }
  return renderDealsCardElement(card, locale, isPortrait);
}

export function createOgTruthCardResponse(
  card: OgTruthCardData,
  options?: {
    readonly format?: OgTruthCardFormat;
    readonly locale?: OgTruthCardLocale;
    readonly download?: boolean;
    readonly extraHeaders?: Record<string, string>;
  }
): ImageResponse {
  const format: OgTruthCardFormat =
    options?.format === 'social' ? 'social' : 'og';
  const locale: OgTruthCardLocale =
    options?.locale === 'en' || options?.locale === 'cs'
      ? options.locale
      : 'vi';
  const width =
    format === 'social' ? SOCIAL_TRUTH_CARD_WIDTH : OG_TRUTH_CARD_WIDTH;
  const height =
    format === 'social' ? SOCIAL_TRUTH_CARD_HEIGHT : OG_TRUTH_CARD_HEIGHT;

  const baseToken =
    card.type === 'product'
      ? sanitizeOgFileToken(card.slug)
      : card.type === 'versus'
        ? sanitizeOgFileToken(card.versusSlug)
        : card.type === 'combo'
          ? sanitizeOgFileToken(
              `combo-${card.items.map((item) => item.slug).join('-')}`
            )
          : 'deal-radar';
  const suffix = format === 'social' ? '-4x5' : '';
  const disposition = options?.download === true ? 'attachment' : 'inline';
  const filename = `rate-truth-card-${baseToken}${suffix}.png`;

  return new ImageResponse(buildOgTruthCardElement(card, format, locale), {
    width,
    height,
    headers: {
      'Cache-Control': OG_TRUTH_CARD_CACHE_CONTROL,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      ...options?.extraHeaders,
    },
  });
}

export async function renderOgTruthCardPng(
  card: OgTruthCardData,
  format: OgTruthCardFormat = 'og',
  locale: OgTruthCardLocale = 'vi'
): Promise<Uint8Array> {
  const response = createOgTruthCardResponse(card, { format, locale });
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Eagerly materializes the PNG byte buffer before constructing the HTTP Response
 * so any Satori/sharp render error is caught inside the route's try/catch block
 * rather than failing mid-stream after HTTP 200 + public CDN headers were sent.
 */
export async function renderOgTruthCardHttpResponse(
  card: OgTruthCardData,
  options?: {
    readonly format?: OgTruthCardFormat;
    readonly locale?: OgTruthCardLocale;
    readonly download?: boolean;
    readonly extraHeaders?: Record<string, string>;
  }
): Promise<Response> {
  const imgResponse = createOgTruthCardResponse(card, options);
  const bytes = new Uint8Array(await imgResponse.arrayBuffer());
  const headers = new Headers(imgResponse.headers);
  headers.set('Content-Type', 'image/png');
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers,
  });
}
