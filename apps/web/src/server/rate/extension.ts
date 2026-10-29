import 'server-only';
import {
  applyCategorySpecTemplate,
  getCategorySpecTemplate,
  implausiblyLowOfferIds,
  isImplausiblyLowPrice,
  minimumListingPriceVnd,
  plausibleOffers,
} from '@repo/shared-data/rules';
import type { Database } from '@repo/shared-data';
import {
  MAX_VALID_VND_PRICE,
  extractProductKeywordFromUrl,
  getMasterProductBySlug,
  getMasterProductCategorySlug,
  getMasterProductOffers,
  getMasterProductPriceHistory,
  getMasterProductReviews,
  getMasterProductReviewSummary,
  getMasterProducts,
  getMerchantsList,
  getRateClient,
  normalizeMasterProductRow,
  parseEcommerceUrlOrQuery,
  RateDataUnavailableError,
  stripEcommerceNoiseTokens,
  type CanonicalCategorySlug,
  type MasterProduct,
  type MasterProductPriceHistorySummary,
  type MerchantOffer,
  type MerchantSummary,
  type ReviewAnalysisSummary,
} from '../../lib/rate-api';
import { isOfferUnavailable } from '../../lib/product-market-stats';
import {
  computeProductStandingInCategory,
  type ProductLeaderboardBadgeInfo,
} from '../../lib/leaderboard-engine';
import { computeProductRadarSignal } from './deals';
import type { RadarSignal } from '../../lib/deal-radar';
import { createLogger } from '@/lib/logger';
import { rankModelCandidates } from '@/lib/model-match';
import {
  chooseItemVariant,
  itemProductPath,
  resolveListingItemContext,
  resolveVariantItemContext,
  toApiItem,
  type ApiItem,
  type ApiItemContext,
} from './item-api';

const log = createLogger('server.extension');

export type SupportedEcommercePlatform =
  | 'shopee'
  | 'lazada'
  | 'tiki'
  | 'tiktok'
  | 'cellphones'
  | 'tgdd'
  | 'fptshop'
  | 'hoangha'
  | 'didongviet'
  | 'phongvu';

export interface PlatformCapability {
  platform: SupportedEcommercePlatform;
  displayName: string;
  lookup: boolean;
  exactItemMatch: boolean;
  crossCatalogMatch: boolean;
  crowdVerifyQueue: boolean;
}

export const EXTENSION_CAPABILITY_MATRIX: Record<
  SupportedEcommercePlatform,
  PlatformCapability
> = {
  shopee: {
    platform: 'shopee',
    displayName: 'Shopee VN',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  lazada: {
    platform: 'lazada',
    displayName: 'Lazada VN',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  tiki: {
    platform: 'tiki',
    displayName: 'Tiki',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  tiktok: {
    platform: 'tiktok',
    displayName: 'TikTok Shop VN',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  cellphones: {
    platform: 'cellphones',
    displayName: 'CellphoneS',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  tgdd: {
    platform: 'tgdd',
    displayName: 'Thế Giới Di Động',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  fptshop: {
    platform: 'fptshop',
    displayName: 'FPT Shop',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  hoangha: {
    platform: 'hoangha',
    displayName: 'Hoàng Hà Mobile',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  didongviet: {
    platform: 'didongviet',
    displayName: 'Di Động Việt',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
  phongvu: {
    platform: 'phongvu',
    displayName: 'Phong Vũ',
    lookup: true,
    exactItemMatch: true,
    crossCatalogMatch: true,
    crowdVerifyQueue: true,
  },
};

export type ExtensionPriceVerdict =
  | 'genuine_deal'
  | 'fair_market_price'
  | 'above_market'
  | 'inflated_fake_sale'
  | 'insufficient_data'
  | 'accessory_skip';

export type ExtensionMatchStatus =
  | 'exact_listing'
  | 'canonical_model'
  | 'ambiguous_variant'
  | 'accessory_skip'
  | 'not_found';

export interface ExtensionVariantCandidate {
  storageGb: number;
  label: string;
  slug: string;
  minPrice: number;
  maxPrice: number;
}

export interface ExtensionLookupParams {
  platform?: string | null;
  externalId?: string | null;
  shopId?: string | null;
  url?: string | null;
  title?: string | null;
  selectedVariant?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  mode?: 'pill' | 'full';
}

export interface ExtensionPriceAssessment {
  verdict: ExtensionPriceVerdict;
  badgeLabel: string;
  explanation: string;
  observedPrice: number | null;
  observedOriginalPrice: number | null;
  claimedDiscountPct: number;
  vsMarketMedianPct: number | null;
  marketMinPrice: number | null;
  marketMedianPrice: number | null;
  marketMaxPrice: number | null;
  historicalMinPrice: number | null;
  historicalMaxPrice: number | null;
  cheaperOfferCount: number;
  maxSavingsAmount: number;
  /** Set when the observed price is far below every other store (#797). */
  implausiblyLow?: true;
}

/**
 * An offer in the lookup's lists. `implausiblyLow` marks a bait price far
 * below every other in-stock store, so the side panel can flag the row
 * (DOS/Rate#797, #1297).
 */
export type ExtensionOffer = MerchantOffer & { implausiblyLow?: true };

export interface ExtensionLookupResponse {
  matchStatus: ExtensionMatchStatus;
  platform: SupportedEcommercePlatform | null;
  capability: PlatformCapability | null;
  canonicalUrl: string | null;
  categorySlug?: CanonicalCategorySlug | null;
  detectedStorageGb: number | null;
  isAccessoryOrPart: boolean;
  accessoryReason: string | null;
  variantCandidates: ExtensionVariantCandidate[];
  priceAssessment: ExtensionPriceAssessment;
  masterProduct: MasterProduct | null;
  matchedOffer: MerchantOffer | null;
  topCheaperOffers: ExtensionOffer[];
  allOffers: ExtensionOffer[];
  merchantProfile: MerchantSummary | null;
  reviewSummary: ReviewAnalysisSummary | null;
  priceHistory: MasterProductPriceHistorySummary | null;
  compareUrl: string | null;
  productDetailUrl: string | null;
  leaderboardUrl?: string | null;
  versusUrl?: string | null;
  topRivalName?: string | null;
  leaderboardStandings?: ProductLeaderboardBadgeInfo[] | null;
  radarSignal?: RadarSignal | null;
  /** RATE_ITEM_MODEL on only: the matched Item (DOS/Rate#1158). */
  item?: ApiItem;
  /** RATE_ITEM_MODEL on only: the variant key the page states, or null. */
  selectedVariant?: string | null;
}

const ACCESSORY_KEYWORDS_VI_EN = [
  'ốp lưng',
  'op lung',
  'ốplưng',
  'bao da',
  'kính cường lực',
  'kinh cuong luc',
  'dán màn hình',
  'dan man hinh',
  'miếng dán',
  'mieng dan',
  'cường lực camera',
  '보보호필름',
  'cáp sạc',
  'cap sac',
  'dây sạc',
  'day sac',
  'củ sạc',
  'cu sac',
  'sạc dự phòng',
  'pin dự phòng',
  'tai nghe có dây',
  'núm tai nghe',
  'vỏ máy',
  'vo may',
  'khay sim',
  'linh kiện',
  'thay màn',
  'ép kính',
  'xác máy',
  'máy xác',
  'bộ vít',
  'keo dán màn',
  'phone case',
  'screen protector',
  'tempered glass',
  'protective case',
  'charging cable',
  'silicone case',
  'clear case',
  'magsafe case',
  'camera lens protector',
];

function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

const MAX_EXTENSION_URL_LENGTH = 2048;

function sanitizeExtensionField(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
    .trim();
}

/**
 * Strip all tracking & session parameters (sp_atk, xptdk, utm_*, fbclid, etc.)
 * to comply with Chrome Web Store User Data Privacy policies.
 */
export function canonicalizeProductUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (/\p{Cc}/u.test(rawUrl)) return null;
  const trimmed = rawUrl.trim();
  if (
    !trimmed ||
    trimmed.length > MAX_EXTENSION_URL_LENGTH ||
    /\s/.test(trimmed)
  ) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      !host.includes('.') ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..') ||
      host.startsWith('[') ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return null;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return null;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export function extractKeywordFromProductUrl(rawUrl?: string | null): string {
  return extractProductKeywordFromUrl(rawUrl);
}

export function detectPlatformFromInput(
  rawPlatform?: string | null,
  rawUrl?: string | null
): SupportedEcommercePlatform | null {
  const norm =
    typeof rawPlatform === 'string'
      ? rawPlatform
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  if (
    norm === 'shopee' ||
    norm === 'lazada' ||
    norm === 'tiki' ||
    norm === 'tiktok' ||
    norm === 'cellphones' ||
    norm === 'tgdd' ||
    norm === 'fptshop' ||
    norm === 'hoangha' ||
    norm === 'didongviet' ||
    norm === 'phongvu'
  ) {
    return norm;
  }
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (/\p{Cc}/u.test(rawUrl)) return null;
  const trimmedUrl = rawUrl.trim();
  if (
    !trimmedUrl ||
    trimmedUrl.length > MAX_EXTENSION_URL_LENGTH ||
    /\s/.test(trimmedUrl)
  ) {
    return null;
  }
  let host: string;
  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return null;
    }
    host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..')
    ) {
      return null;
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return null;
    }
  } catch {
    return null;
  }

  if (isDomainOrSubdomain(host, 'shopee.vn')) return 'shopee';
  if (isDomainOrSubdomain(host, 'lazada.vn')) return 'lazada';
  if (isDomainOrSubdomain(host, 'tiki.vn')) return 'tiki';
  if (isDomainOrSubdomain(host, 'tiktok.com')) return 'tiktok';
  if (isDomainOrSubdomain(host, 'cellphones.com.vn')) return 'cellphones';
  if (
    isDomainOrSubdomain(host, 'thegioididong.com') ||
    isDomainOrSubdomain(host, 'topzone.vn') ||
    isDomainOrSubdomain(host, 'dienmayxanh.com')
  ) {
    return 'tgdd';
  }
  if (isDomainOrSubdomain(host, 'fptshop.com.vn')) return 'fptshop';
  if (isDomainOrSubdomain(host, 'hoanghamobile.com')) return 'hoangha';
  if (isDomainOrSubdomain(host, 'didongviet.vn')) return 'didongviet';
  if (isDomainOrSubdomain(host, 'phongvu.vn')) return 'phongvu';
  return null;
}

/**
 * Gatekeeper Layer 0: Distinguish accessories/spare parts from actual phones/tablets/laptops/earbuds.
 */
export function detectAccessoryOrJunk(params: {
  title?: string | null;
  url?: string | null;
  price?: number | null;
}): { isAccessory: boolean; reason: string | null } {
  const safeParams =
    params && typeof params === 'object' && !Array.isArray(params)
      ? params
      : ({} as typeof params);
  const titleLower =
    typeof safeParams.title === 'string'
      ? safeParams.title
          .replace(/\p{Cc}+/gu, ' ')
          .trim()
          .toLowerCase()
      : '';
  const urlLower =
    typeof safeParams.url === 'string'
      ? safeParams.url
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  if (titleLower) {
    for (const kw of ACCESSORY_KEYWORDS_VI_EN) {
      if (titleLower.includes(kw)) {
        return {
          isAccessory: true,
          reason: `Phát hiện từ khóa phụ kiện/linh kiện ("${kw}") trong tiêu đề sản phẩm.`,
        };
      }
    }
  }

  const minFloor = minimumListingPriceVnd([titleLower, urlLower]);

  if (
    typeof safeParams.price === 'number' &&
    Number.isFinite(safeParams.price) &&
    safeParams.price > 0 &&
    safeParams.price < minFloor
  ) {
    return {
      isAccessory: true,
      reason: `Mức giá (${safeParams.price.toLocaleString('vi-VN')} ₫) thấp hơn ngưỡng tối thiểu của thiết bị chính hãng (${minFloor.toLocaleString('vi-VN')} ₫) - khả năng cao là phụ kiện hoặc linh kiện.`,
    };
  }

  return { isAccessory: false, reason: null };
}

/**
 * Parse storage capacity (GB) from selected SKU variant label or title,
 * and detect if a title lists multiple storage tiers without a selected SKU.
 */
export function extractStorageAndAmbiguity(params: {
  title?: string | null;
  selectedVariant?: string | null;
}): {
  storageGb: number | null;
  hasMultipleStorageInTitle: boolean;
  detectedCapacities: number[];
  cleanModelSearchQuery: string;
} {
  const parseCapacities = (text: string): number[] => {
    const found = new Set<number>();
    // Strip explicit RAM labels (e.g., "64GB RAM", "RAM 64GB") before scanning storage capacities
    let remaining = text.replace(
      /\b(?:ram\s*\d+\s*gb|\d+\s*gb\s*ram)\b/gi,
      ' '
    );

    // Match RAM/ROM slash, hyphen, or comma-tuple patterns like 8GB/256GB, 16GB/1TB, (32GB, 1TB), or 64GB/1TB
    const tupleRegex =
      /\b(4|6|8|12|16|18|24|32|36|48|64)\s*(?:gb)?\s*(?:[/|-]|,\s*)\s*(?:(64|128|256|512|1024)\s*gb|(1|2)\s*tb)\b/gi;
    remaining = remaining.replace(
      tupleRegex,
      (fullMatch, ramRaw: string, gbRaw?: string, tbRaw?: string) => {
        const ram = Number(ramRaw);
        const cap = gbRaw ? Number(gbRaw) : Number(tbRaw) * 1024;
        // 64GB paired with 128GB/256GB/512GB (without "RAM") is a multi-storage phone title (e.g. "64GB/128GB"),
        // whereas 64GB paired with 1TB/2TB or <= 48GB paired with >= 64GB is a RAM/ROM tuple.
        if (ram === 64 && cap < 1024) {
          return fullMatch;
        }
        if (cap >= 64) {
          found.add(cap);
        }
        return ' ';
      }
    );

    // Match standalone storage capacities (64GB, 128GB, 256GB, 512GB, 1024GB, 1TB, 2TB)
    const capRegex = /\b(64|128|256|512|1024)\s*gb\b|\b(1|2)\s*tb\b/gi;
    let m: RegExpExecArray | null;
    while ((m = capRegex.exec(remaining)) !== null) {
      if (m[1]) {
        found.add(Number(m[1]));
      } else if (m[2]) {
        found.add(Number(m[2]) * 1024);
      }
    }
    return Array.from(found).sort((a, b) => a - b);
  };

  const safeParams =
    params && typeof params === 'object' && !Array.isArray(params)
      ? params
      : ({} as typeof params);
  const variantText = sanitizeExtensionField(safeParams.selectedVariant, 160);
  const titleText = sanitizeExtensionField(safeParams.title, 400);

  const variantCaps = variantText ? parseCapacities(variantText) : [];
  const titleCaps = titleText ? parseCapacities(titleText) : [];

  let storageGb: number | null = null;
  if (variantCaps.length === 1) {
    storageGb = variantCaps[0]!;
  } else if (variantCaps.length === 0 && titleCaps.length === 1) {
    storageGb = titleCaps[0]!;
  }

  const hasMultipleStorageInTitle =
    variantCaps.length !== 1 && titleCaps.length > 1;

  // Build clean core device query (strip promotional brackets, Shopee/URL slug noise, and capacity suffixes)
  const cleanModelSearchQuery = stripEcommerceNoiseTokens(titleText)
    .replace(/\b\d+\s*(?:gb|tb)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    storageGb,
    hasMultipleStorageInTitle,
    detectedCapacities: variantCaps.length > 0 ? variantCaps : titleCaps,
    cleanModelSearchQuery: cleanModelSearchQuery || titleText,
  };
}

function computeMedian(values: number[]): number {
  const valid = (Array.isArray(values) ? values : []).filter(
    (v) =>
      typeof v === 'number' &&
      Number.isFinite(v) &&
      v > 0 &&
      v <= MAX_VALID_VND_PRICE
  );
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Compute Evidence-Based 5-Level Price Verdict per Codex Review P2 refinement:
 * Distinguishes `inflated_fake_sale` (requires explicit strikethrough originalPrice inflation)
 * from `above_market` (higher than median without fake strikethrough claim),
 * `genuine_deal`, `fair_market_price`, `insufficient_data`, and `accessory_skip`.
 */
export function evaluateExtensionPriceVerdict(params: {
  isAccessory: boolean;
  accessoryReason: string | null;
  isAmbiguousVariant: boolean;
  observedPrice: number | null;
  observedOriginalPrice: number | null;
  offers: MerchantOffer[];
  /** The listing the observed price belongs to, when it is one of `offers`. */
  observedOfferId?: string | null;
  priceHistory: MasterProductPriceHistorySummary | null;
}): ExtensionPriceAssessment {
  const safeParams =
    params && typeof params === 'object' && !Array.isArray(params)
      ? params
      : ({} as typeof params);
  const {
    isAccessory,
    accessoryReason,
    isAmbiguousVariant,
    observedPrice,
    observedOriginalPrice,
    offers,
    observedOfferId,
    priceHistory,
  } = safeParams;
  // Sold-out and discontinued listings keep their last price; they set no
  // market reference and are no cheaper option (DOS/Rate#1177).
  const safeOffers = (Array.isArray(offers) ? offers : []).filter(
    (o) => !isOfferUnavailable(o)
  );

  if (isAccessory) {
    return {
      verdict: 'accessory_skip',
      badgeLabel: 'Phụ kiện / Linh kiện',
      explanation:
        accessoryReason ||
        'Sản phẩm được nhận diện là phụ kiện/linh kiện, không áp dụng biểu đồ giá thân máy.',
      observedPrice,
      observedOriginalPrice,
      claimedDiscountPct: 0,
      vsMarketMedianPct: null,
      marketMinPrice: null,
      marketMedianPrice: null,
      marketMaxPrice: null,
      historicalMinPrice: null,
      historicalMaxPrice: null,
      cheaperOfferCount: 0,
      maxSavingsAmount: 0,
    };
  }

  // The market reference leaves bait-price listings out, whichever caller
  // (extension lookup or the inspect API) passes the offers (DOS/Rate#797).
  const marketOffers = plausibleOffers(safeOffers);
  const offerPrices = marketOffers
    .map((o) => o.price_current)
    .filter(
      (p) =>
        typeof p === 'number' &&
        Number.isFinite(p) &&
        p > 0 &&
        p <= MAX_VALID_VND_PRICE
    );

  const marketMinPrice =
    offerPrices.length > 0 ? Math.min(...offerPrices) : null;
  const marketMaxPrice =
    offerPrices.length > 0 ? Math.max(...offerPrices) : null;
  const marketMedianPrice =
    offerPrices.length > 0 ? computeMedian(offerPrices) : null;

  const rawHistMin = priceHistory?.lowestEverPrice;
  const historicalMinPrice =
    typeof rawHistMin === 'number' &&
    Number.isFinite(rawHistMin) &&
    rawHistMin > 0 &&
    rawHistMin <= MAX_VALID_VND_PRICE
      ? rawHistMin
      : marketMinPrice;
  const rawHistMax = priceHistory?.highestEverPrice;
  const historicalMaxPrice =
    typeof rawHistMax === 'number' &&
    Number.isFinite(rawHistMax) &&
    rawHistMax > 0 &&
    rawHistMax <= MAX_VALID_VND_PRICE
      ? rawHistMax
      : marketMaxPrice;

  if (isAmbiguousVariant) {
    return {
      verdict: 'insufficient_data',
      badgeLabel: 'Chọn dung lượng bộ nhớ',
      explanation:
        'Trang sản phẩm có nhiều tùy chọn bộ nhớ (128GB/256GB/512GB). Hãy chọn phân loại trên trang hoặc trong bảng Rate để so sánh đúng phiên bản.',
      observedPrice,
      observedOriginalPrice,
      claimedDiscountPct: 0,
      vsMarketMedianPct: null,
      marketMinPrice,
      marketMedianPrice,
      marketMaxPrice,
      historicalMinPrice,
      historicalMaxPrice,
      cheaperOfferCount: 0,
      maxSavingsAmount: 0,
    };
  }

  // A price far below every other store is a warning, never a deal: likely a
  // counterfeit, an accessory or a bait listing (DOS/Rate#797). The neutral
  // verdict keeps the extension's allow-list; the label says why. Judged
  // against every other offer, as the offers table judges each row, so the
  // two never disagree about a listing.
  const otherOffers = observedOfferId
    ? safeOffers.filter((o) => o && o.id !== observedOfferId)
    : safeOffers;
  if (observedPrice && isImplausiblyLowPrice(observedPrice, otherOffers)) {
    return {
      verdict: 'insufficient_data',
      badgeLabel: 'Giá thấp bất thường',
      implausiblyLow: true,
      explanation: `Giá ${observedPrice.toLocaleString('vi-VN')} ₫ thấp hơn nhiều so với các nơi bán khác (trung vị ${Math.round(marketMedianPrice ?? 0).toLocaleString('vi-VN')} ₫): có thể là hàng giả, phụ kiện hoặc tin câu khách. Hãy kiểm tra kỹ gian hàng trước khi mua.`,
      observedPrice,
      observedOriginalPrice,
      claimedDiscountPct: 0,
      vsMarketMedianPct: null,
      marketMinPrice,
      marketMedianPrice,
      marketMaxPrice,
      historicalMinPrice,
      historicalMaxPrice,
      cheaperOfferCount: 0,
      maxSavingsAmount: 0,
    };
  }

  const effectivePrice =
    observedPrice &&
    Number.isFinite(observedPrice) &&
    observedPrice > 0 &&
    observedPrice <= MAX_VALID_VND_PRICE
      ? observedPrice
      : (offerPrices[0] ?? null);

  const effectiveOriginalPrice =
    observedOriginalPrice &&
    Number.isFinite(observedOriginalPrice) &&
    effectivePrice &&
    observedOriginalPrice > effectivePrice &&
    observedOriginalPrice <= MAX_VALID_VND_PRICE
      ? observedOriginalPrice
      : null;

  const claimedDiscountPct =
    effectiveOriginalPrice && effectivePrice
      ? Math.round(
          ((effectiveOriginalPrice - effectivePrice) / effectiveOriginalPrice) *
            1000
        ) / 10
      : 0;

  if (!effectivePrice || !marketMedianPrice || offerPrices.length === 0) {
    return {
      verdict: 'insufficient_data',
      badgeLabel: 'Chưa đủ lịch sử giá',
      explanation:
        'Chưa có đủ điểm dữ liệu lịch sử giá đã xác minh cho phiên bản bộ nhớ này.',
      observedPrice: effectivePrice,
      observedOriginalPrice: effectiveOriginalPrice,
      claimedDiscountPct,
      vsMarketMedianPct: null,
      marketMinPrice,
      marketMedianPrice,
      marketMaxPrice,
      historicalMinPrice,
      historicalMaxPrice,
      cheaperOfferCount: 0,
      maxSavingsAmount: 0,
    };
  }

  const vsMarketMedianPct =
    Math.round(
      ((effectivePrice - marketMedianPrice) / marketMedianPrice) * 1000
    ) / 10;

  const cheaperOffers = marketOffers.filter(
    (o) =>
      Number.isFinite(o.price_current) &&
      o.price_current > 0 &&
      o.price_current <= MAX_VALID_VND_PRICE &&
      o.price_current < effectivePrice - 50_000
  );
  const cheaperOfferCount = cheaperOffers.length;
  const maxSavingsAmount =
    marketMinPrice && effectivePrice > marketMinPrice
      ? effectivePrice - marketMinPrice
      : 0;

  const histMax = historicalMaxPrice || marketMaxPrice || effectivePrice;
  const histMin = historicalMinPrice || marketMinPrice || effectivePrice;

  // 1. Check for evidence-backed Inflated Fake Sale (requires explicit strikethrough originalPrice)
  if (
    effectiveOriginalPrice &&
    claimedDiscountPct >= 6 &&
    effectivePrice >= marketMedianPrice * 0.98 &&
    (effectiveOriginalPrice > histMax * 1.05 ||
      claimedDiscountPct + vsMarketMedianPct >= 10)
  ) {
    return {
      verdict: 'inflated_fake_sale',
      badgeLabel: 'Cảnh báo giảm giá ảo',
      explanation: `Gian hàng treo giá gạch ngang ${effectiveOriginalPrice.toLocaleString('vi-VN')} ₫ (-${claimedDiscountPct}%), nhưng giá bán thực tế (${effectivePrice.toLocaleString('vi-VN')} ₫) vẫn cao hơn hoặc ngang trung vị thị trường (${marketMedianPrice.toLocaleString('vi-VN')} ₫) và vượt đỉnh lịch sử (${histMax.toLocaleString('vi-VN')} ₫).`,
      observedPrice: effectivePrice,
      observedOriginalPrice: effectiveOriginalPrice,
      claimedDiscountPct,
      vsMarketMedianPct,
      marketMinPrice,
      marketMedianPrice,
      marketMaxPrice,
      historicalMinPrice: histMin,
      historicalMaxPrice: histMax,
      cheaperOfferCount,
      maxSavingsAmount,
    };
  }

  // 2. Genuine Deal: at or below historical/market minimum or >= 3% below market median
  if (effectivePrice <= histMin * 1.005 || vsMarketMedianPct <= -3) {
    return {
      verdict: 'genuine_deal',
      badgeLabel: 'Giá Tốt Thực Sự',
      explanation: `Giá hiện tại (${effectivePrice.toLocaleString('vi-VN')} ₫) đang ở vùng đáy lịch sử (trung vị thị trường: ${marketMedianPrice.toLocaleString('vi-VN')} ₫).`,
      observedPrice: effectivePrice,
      observedOriginalPrice: effectiveOriginalPrice,
      claimedDiscountPct,
      vsMarketMedianPct,
      marketMinPrice,
      marketMedianPrice,
      marketMaxPrice,
      historicalMinPrice: histMin,
      historicalMaxPrice: histMax,
      cheaperOfferCount,
      maxSavingsAmount,
    };
  }

  // 3. Above Market (without fake strikethrough promotion)
  if (vsMarketMedianPct >= 6) {
    return {
      verdict: 'above_market',
      badgeLabel: `Cao hơn thị trường +${vsMarketMedianPct}%`,
      explanation: `Giá đang xem (${effectivePrice.toLocaleString('vi-VN')} ₫) cao hơn trung vị thị trường (${marketMedianPrice.toLocaleString('vi-VN')} ₫) khoảng ${vsMarketMedianPct}%, nhưng shop không treo giá gạch ngang khống.`,
      observedPrice: effectivePrice,
      observedOriginalPrice: effectiveOriginalPrice,
      claimedDiscountPct,
      vsMarketMedianPct,
      marketMinPrice,
      marketMedianPrice,
      marketMaxPrice,
      historicalMinPrice: histMin,
      historicalMaxPrice: histMax,
      cheaperOfferCount,
      maxSavingsAmount,
    };
  }

  // 4. Fair Market Price
  return {
    verdict: 'fair_market_price',
    badgeLabel: 'Giá Chuẩn Thị Trường',
    explanation: `Giá hiện tại (${effectivePrice.toLocaleString('vi-VN')} ₫) nằm trong biên độ ổn định quanh trung vị thị trường (${marketMedianPrice.toLocaleString('vi-VN')} ₫).`,
    observedPrice: effectivePrice,
    observedOriginalPrice: effectiveOriginalPrice,
    claimedDiscountPct,
    vsMarketMedianPct,
    marketMinPrice,
    marketMedianPrice,
    marketMaxPrice,
    historicalMinPrice: histMin,
    historicalMaxPrice: histMax,
    cheaperOfferCount,
    maxSavingsAmount,
  };
}

const SAFE_EXTERNAL_ID_REGEX = /^[a-zA-Z0-9._-]{1,128}$/;

export function isValidExternalEntityId(val: string): boolean {
  return (
    typeof val === 'string' &&
    SAFE_EXTERNAL_ID_REGEX.test(val) &&
    /[a-zA-Z0-9]/.test(val) &&
    !/^0+$/.test(val) &&
    !val.startsWith('.') &&
    !val.endsWith('.') &&
    !val.includes('..') &&
    !/^(?:null|undefined|nan|none|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i.test(
      val
    )
  );
}

export function buildCandidateExternalItemIds(params: {
  externalId?: string | null;
  shopId?: string | null;
  platform?: SupportedEcommercePlatform | null;
}): string[] {
  const rawExternalId = sanitizeExtensionField(params.externalId, 128);
  const cleanExternalId = isValidExternalEntityId(rawExternalId)
    ? rawExternalId
    : null;
  const rawShopId = sanitizeExtensionField(params.shopId, 128);
  const cleanShopId = isValidExternalEntityId(rawShopId) ? rawShopId : null;

  const candidateItemIds = new Set<string>();
  if (!cleanExternalId) {
    return [];
  }

  candidateItemIds.add(cleanExternalId);
  if (cleanExternalId.includes('_')) {
    const parts = cleanExternalId.split('_');
    if (parts[1] && isValidExternalEntityId(parts[1])) {
      candidateItemIds.add(parts[1]);
    }
  }
  if (cleanShopId && !cleanExternalId.includes('_')) {
    candidateItemIds.add(`${cleanShopId}_${cleanExternalId}`);
  }
  const prefixMap: Partial<Record<SupportedEcommercePlatform, string>> = {
    tiktok: 'tts-',
    cellphones: 'cps-',
    tgdd: 'tgdd-',
    fptshop: 'fpt-',
    hoangha: 'hhm-',
    didongviet: 'ddv-',
    phongvu: 'pv-',
  };
  const prefix = params.platform ? prefixMap[params.platform] : undefined;
  if (prefix && !cleanExternalId.startsWith(prefix)) {
    const prefixed = `${prefix}${cleanExternalId}`;
    if (isValidExternalEntityId(prefixed)) {
      candidateItemIds.add(prefixed);
    }
  }
  return Array.from(candidateItemIds);
}

export function doesOfferUrlMatchCandidateIds(
  offerUrl: string,
  candidateItemIds: Iterable<string>
): boolean {
  if (typeof offerUrl !== 'string' || !offerUrl.trim()) return false;
  let pathAndSearch = offerUrl;
  try {
    const parsed = new URL(offerUrl);
    pathAndSearch = `${parsed.pathname}${parsed.search}`;
  } catch {
    // Keep raw string when URL parsing fails
  }
  for (const id of candidateItemIds) {
    if (
      typeof id === 'string' &&
      id.length >= 4 &&
      isValidExternalEntityId(id) &&
      pathAndSearch.includes(id)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Fast-Path Read-Only Lookup for Rate Browser Extension MV3 (`GET /api/v1/rate/extension/lookup`).
 * Strictly Read-Only: Never invokes AI Spec Enricher or mutates `rate.master_products`.
 */
export async function lookupExtensionProduct(
  params: ExtensionLookupParams
): Promise<ExtensionLookupResponse> {
  const mode = params.mode === 'pill' ? 'pill' : 'full';
  const canonicalUrl = canonicalizeProductUrl(params.url);
  const platform = detectPlatformFromInput(
    params.platform,
    canonicalUrl || params.url
  );
  const capability = platform ? EXTENSION_CAPABILITY_MATRIX[platform] : null;

  const observedPrice =
    typeof params.price === 'number' &&
    Number.isFinite(params.price) &&
    params.price > 0 &&
    params.price <= MAX_VALID_VND_PRICE
      ? Math.round(params.price)
      : null;
  const observedOriginalPrice =
    typeof params.originalPrice === 'number' &&
    Number.isFinite(params.originalPrice) &&
    params.originalPrice > 0 &&
    params.originalPrice <= MAX_VALID_VND_PRICE
      ? Math.round(params.originalPrice)
      : null;

  const urlKeyword = extractKeywordFromProductUrl(canonicalUrl || params.url);
  const effectiveTitle =
    sanitizeExtensionField(params.title, 400) || urlKeyword;

  // Step 1: Accessory / Junk Gatekeeper
  const gatekeeper = detectAccessoryOrJunk({
    title: effectiveTitle,
    url: canonicalUrl || params.url,
    price: observedPrice,
  });

  const { storageGb, hasMultipleStorageInTitle, cleanModelSearchQuery } =
    extractStorageAndAmbiguity({
      title: effectiveTitle,
      selectedVariant: params.selectedVariant,
    });

  if (gatekeeper.isAccessory) {
    return {
      matchStatus: 'accessory_skip',
      platform,
      capability,
      canonicalUrl,
      detectedStorageGb: storageGb,
      isAccessoryOrPart: true,
      accessoryReason: gatekeeper.reason,
      variantCandidates: [],
      priceAssessment: evaluateExtensionPriceVerdict({
        isAccessory: true,
        accessoryReason: gatekeeper.reason,
        isAmbiguousVariant: false,
        observedPrice,
        observedOriginalPrice,
        offers: [],
        priceHistory: null,
      }),
      masterProduct: null,
      matchedOffer: null,
      topCheaperOffers: [],
      allOffers: [],
      merchantProfile: null,
      reviewSummary: null,
      priceHistory: null,
      categorySlug: 'smartphones',
      compareUrl: null,
      productDetailUrl: null,
      leaderboardUrl: null,
      versusUrl: null,
      topRivalName: null,
      leaderboardStandings: null,
      radarSignal: null,
    };
  }

  // Step 2: Resolve external item ID from URL or explicit parameter
  const parsedFromUrl = canonicalUrl
    ? parseEcommerceUrlOrQuery(canonicalUrl)
    : null;
  const sanitizedParamExternalId = sanitizeExtensionField(
    params.externalId,
    128
  );
  const rawExternalId =
    (isValidExternalEntityId(sanitizedParamExternalId)
      ? sanitizedParamExternalId
      : null) ||
    parsedFromUrl?.platformItemId ||
    null;
  const sanitizedParamShopId = sanitizeExtensionField(params.shopId, 128);
  const effectiveShopId =
    (isValidExternalEntityId(sanitizedParamShopId)
      ? sanitizedParamShopId
      : null) ||
    parsedFromUrl?.platformShopId ||
    null;

  // Normalize externalId (handle both `shopId_itemId`, platform prefixes, and raw `itemId`)
  const candidateItemIds = new Set<string>(
    buildCandidateExternalItemIds({
      externalId: rawExternalId,
      shopId: effectiveShopId,
      platform,
    })
  );

  // Step 3: Search candidate Master Products in DB (Read-Only)
  const searchKeyword = cleanModelSearchQuery || effectiveTitle || '';
  // The search returns every model whose text contains the title, newest
  // first: rank them so the 16e never answers for the 16 (DOS/Rate#1379),
  // with the title's storage size breaking ties between sizes of the best
  // model. The ranking reads the cleaned keyword the search used, without
  // bracketed promotions, and sees enough rows that an older exact model is
  // not cut off by the limit.
  const catalogCandidates = searchKeyword
    ? rankModelCandidates(
        searchKeyword,
        await getMasterProducts({ search: searchKeyword, limit: 48 }),
        storageGb
      )
    : [];

  let matchedMaster: MasterProduct | null = null;
  let matchStatus: ExtensionMatchStatus = 'not_found';
  // The listing is known but its model is not published (DOS/Rate#769).
  let listingOfUnpublishedModel = false;

  // Try matching via URL / externalId inspection if available
  const internalSlugCandidate =
    parsedFromUrl?.internalSlug ||
    (rawExternalId
      ? parseEcommerceUrlOrQuery(rawExternalId).internalSlug
      : null);
  if (internalSlugCandidate) {
    const bySlug = await getMasterProductBySlug(internalSlugCandidate);
    if (bySlug) {
      matchedMaster = bySlug;
      matchStatus = 'canonical_model';
    }
  }

  if (!matchedMaster && candidateItemIds.size > 0) {
    const client = getRateClient();
    if (client) {
      const { data: prodRows, error: prodErr } = await client
        .from('products')
        .select('cluster_id, platform_item_id')
        .in('platform_item_id', Array.from(candidateItemIds))
        .not('cluster_id', 'is', null)
        .limit(5);
      if (prodErr) {
        log.error('extension_lookup_products_failed', {
          candidateItemIds: Array.from(candidateItemIds),
          message: prodErr.message,
          code: prodErr.code,
        });
        throw new RateDataUnavailableError('products', prodErr);
      }
      const matchedProd = (
        (prodRows || []) as Array<{
          cluster_id: string | null;
          platform_item_id: string;
        }>
      ).find((r) => Boolean(r.cluster_id));
      if (matchedProd?.cluster_id) {
        // A draft master has no product page (DOS/Rate#769). The listing is
        // then known to be that model, so no catalogue guess either.
        const { data: masterRow, error: masterErr } = await client
          .from('master_products')
          .select('*')
          .eq('id', matchedProd.cluster_id)
          .eq('status', 'published')
          .maybeSingle();
        if (masterErr) {
          log.error('extension_lookup_master_failed', {
            clusterId: matchedProd.cluster_id,
            message: masterErr.message,
            code: masterErr.code,
          });
          throw new RateDataUnavailableError('master_products', masterErr);
        }
        if (masterRow) {
          matchedMaster = normalizeMasterProductRow(masterRow as MasterProduct);
          matchStatus = 'exact_listing';
        } else {
          listingOfUnpublishedModel = true;
        }
      }
    }
  }

  // A listing with no stated size is still its Item's (RATE_ITEM_MODEL on,
  // design doc 5.2): shown with the default variant and no size chosen.
  let itemContext: ApiItemContext | null = null;
  if (
    !matchedMaster &&
    !listingOfUnpublishedModel &&
    candidateItemIds.size > 0
  ) {
    const listingItem = await resolveListingItemContext(
      Array.from(candidateItemIds)
    );
    if (listingItem === 'no_variant') {
      // The listing's Item is known but has no page yet: no catalogue guess.
      listingOfUnpublishedModel = true;
    } else if (listingItem) {
      const byVariant = await getMasterProductBySlug(listingItem.selected.slug);
      if (byVariant) {
        itemContext = listingItem;
        matchedMaster = byVariant;
        matchStatus = 'canonical_model';
      } else {
        listingOfUnpublishedModel = true;
      }
    }
  }

  // Filter catalog candidates by storageGb if known
  if (
    !matchedMaster &&
    !listingOfUnpublishedModel &&
    catalogCandidates.length > 0
  ) {
    // The ranking already prefers the title's size within the best model; a
    // size of another model never wins over the model (DOS/Rate#1379).
    if (storageGb) {
      matchedMaster = catalogCandidates[0]!;
      matchStatus = 'canonical_model';
    } else {
      matchedMaster = catalogCandidates[0]!;
      matchStatus = hasMultipleStorageInTitle
        ? 'ambiguous_variant'
        : 'canonical_model';
    }
  }

  if (!matchedMaster) {
    return {
      matchStatus: 'not_found',
      platform,
      capability,
      canonicalUrl,
      detectedStorageGb: storageGb,
      isAccessoryOrPart: false,
      accessoryReason: null,
      variantCandidates: [],
      priceAssessment: evaluateExtensionPriceVerdict({
        isAccessory: false,
        accessoryReason: null,
        isAmbiguousVariant: false,
        observedPrice,
        observedOriginalPrice,
        offers: [],
        priceHistory: null,
      }),
      masterProduct: null,
      matchedOffer: null,
      topCheaperOffers: [],
      allOffers: [],
      merchantProfile: null,
      reviewSummary: null,
      priceHistory: null,
      categorySlug: 'smartphones',
      compareUrl: null,
      productDetailUrl: null,
      leaderboardUrl: null,
      versusUrl: null,
      topRivalName: null,
      leaderboardStandings: null,
      radarSignal: null,
    };
  }

  const categoryPath = getMasterProductCategorySlug(matchedMaster);
  // Storage tiers only for a category that has storage: an earbud's stored
  // "64GB" is enricher noise (DOS/Rate#1184).
  const hasStorage = getCategorySpecTemplate(categoryPath).storage;
  // Several sizes in an earbud title are not storage variants either.
  if (!hasStorage && matchStatus === 'ambiguous_variant') {
    matchStatus = 'canonical_model';
  }

  // The Item and all its variants from the DB, not only the siblings among the
  // search hits. The listing's own variant wins, then a stated size the Item
  // has once, then a single-variant Item (RATE_ITEM_MODEL on).
  const pageSize = { storageGb: hasStorage ? storageGb : null };
  itemContext = itemContext
    ? chooseItemVariant(itemContext, { ...pageSize, listingVariantId: null })
    : await resolveVariantItemContext(
        matchedMaster.slug,
        pageSize.storageGb,
        matchStatus === 'exact_listing' ? matchedMaster.id : null
      );
  if (itemContext && itemContext.selected.slug !== matchedMaster.slug) {
    const chosen = await getMasterProductBySlug(itemContext.selected.slug);
    if (chosen) matchedMaster = chosen;
    else itemContext = { ...itemContext, sizeChosen: false };
  }

  // Build variant candidates across same model family
  const sameFamilyVariants = catalogCandidates.filter(
    (c) =>
      hasStorage &&
      c.brand.toLowerCase() === matchedMaster!.brand.toLowerCase() &&
      c.model.toLowerCase() === matchedMaster!.model.toLowerCase() &&
      typeof c.storage_gb === 'number'
  );
  const variantCandidates: ExtensionVariantCandidate[] = itemContext
    ? // Sized variants only: an unknown size is never shown as 256GB.
      hasStorage
      ? itemContext.variants
          .filter((v) => typeof v.storage_gb === 'number' && v.storage_gb > 0)
          .map((v) => ({
            storageGb: v.storage_gb!,
            label: v.variant_name || `${v.storage_gb}GB`,
            slug: v.slug,
            minPrice: v.min_price,
            maxPrice: v.max_price,
          }))
      : []
    : sameFamilyVariants.map((v) => ({
        storageGb: v.storage_gb || 256,
        label: `${v.storage_gb || 256}GB`,
        slug: v.slug,
        minPrice: v.min_price,
        maxPrice: v.max_price,
      }));

  if (itemContext) {
    // Ambiguous when no size is known among several, or the page states a size
    // the Item does not have: then no variant's prices may judge the page.
    if (
      itemContext.sizeMismatch ||
      (!itemContext.sizeChosen && variantCandidates.length > 1)
    ) {
      matchStatus = 'ambiguous_variant';
    } else if (matchStatus === 'ambiguous_variant') {
      matchStatus = 'canonical_model';
    }
  } else if (variantCandidates.length > 1 && !storageGb) {
    matchStatus = 'ambiguous_variant';
  }

  // Fetch offers, price history, and reviews for matched master product
  const offers = await getMasterProductOffers(matchedMaster.id);
  // Without a URL match, fall back to the cheapest plausible in-stock offer,
  // never a bait-price or sold-out listing (DOS/Rate#797, #1177).
  const inStockOffers = offers.filter((o) => !isOfferUnavailable(o));
  const urlMatchedOffer =
    offers.find(
      (o) =>
        (canonicalUrl && o.url.includes(canonicalUrl)) ||
        doesOfferUrlMatchCandidateIds(o.url, candidateItemIds)
    ) || null;
  const matchedOffer =
    urlMatchedOffer || plausibleOffers(inStockOffers)[0] || null;

  if (
    matchedOffer &&
    doesOfferUrlMatchCandidateIds(matchedOffer.url, candidateItemIds)
  ) {
    matchStatus = 'exact_listing';
  }

  const [priceHistory, reviews, sameCategoryPeers] = await Promise.all([
    getMasterProductPriceHistory(matchedMaster.id, offers),
    mode === 'full'
      ? getMasterProductReviews(matchedMaster.id)
      : Promise.resolve([]),
    getMasterProducts({ categorySlug: categoryPath, limit: 30 }),
  ]);

  const leaderboardStandings = computeProductStandingInCategory(
    matchedMaster,
    sameCategoryPeers.length > 0 ? sameCategoryPeers : [matchedMaster]
  );
  const topRival =
    sameCategoryPeers.find((peer) => peer.id !== matchedMaster!.id) || null;

  const rawTotalRevs =
    typeof matchedMaster.total_reviews === 'number'
      ? matchedMaster.total_reviews
      : 0;
  const totalRevs =
    Number.isFinite(rawTotalRevs) && rawTotalRevs > 0
      ? Math.floor(rawTotalRevs)
      : 0;
  const rawAuthRevs =
    typeof matchedMaster.authentic_review_count === 'number'
      ? matchedMaster.authentic_review_count
      : totalRevs;
  const authRevs =
    Number.isFinite(rawAuthRevs) && rawAuthRevs >= 0
      ? Math.min(totalRevs, Math.floor(rawAuthRevs))
      : totalRevs;
  const authPct =
    totalRevs > 0
      ? Math.min(100, Math.max(0, Math.round((authRevs / totalRevs) * 100)))
      : 100;

  const reviewSummary: ReviewAnalysisSummary | null =
    mode === 'full'
      ? await getMasterProductReviewSummary(matchedMaster.id, reviews)
      : {
          total_analyzed: totalRevs,
          authentic_pct: authPct,
          suspicious_pct: 0,
          fake_pct: Math.max(0, 100 - authPct),
          pros: [],
          cons: [],
          ai_summary: null,
        };

  const effectiveObservedPrice =
    observedPrice ?? matchedOffer?.price_current ?? null;
  const rawEffectiveOriginal =
    observedOriginalPrice ??
    (observedPrice === null ? matchedOffer?.price_original : null) ??
    null;
  const effectiveObservedOriginal =
    rawEffectiveOriginal !== null &&
    effectiveObservedPrice !== null &&
    rawEffectiveOriginal >= effectiveObservedPrice
      ? rawEffectiveOriginal
      : null;

  const isAmbiguous = matchStatus === 'ambiguous_variant';
  // The market reference and "cheaper elsewhere" leave bait-price and
  // sold-out listings out; the URL-matched offer above still comes from every
  // offer, so a shopper on such a listing sees it judged against the real
  // market (DOS/Rate#797, #1177).
  const marketOffers = plausibleOffers(inStockOffers);
  const priceAssessment = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: isAmbiguous,
    observedPrice: effectiveObservedPrice,
    observedOriginalPrice: effectiveObservedOriginal,
    offers,
    // The page's price belongs to the URL-matched listing; without a page
    // price the fallback offer's own price is the one judged.
    observedOfferId:
      urlMatchedOffer?.id ??
      (observedPrice === null ? (matchedOffer?.id ?? null) : null),
    priceHistory,
  });

  const topCheaperOffers = effectiveObservedPrice
    ? marketOffers
        .filter(
          (o) =>
            Number.isFinite(o.price_current) &&
            o.price_current > 0 &&
            o.price_current <= MAX_VALID_VND_PRICE &&
            o.price_current < effectiveObservedPrice - 50_000
        )
        .sort((a, b) => a.price_current - b.price_current)
        .slice(0, 4)
    : marketOffers.slice(0, 4);

  // Only the matched offer's merchant: this public endpoint used to read the
  // whole merchant directory on every lookup.
  const merchantProfile = matchedOffer
    ? ((await getMerchantsList({ ids: [matchedOffer.merchant.id] }))[0] ?? null)
    : null;
  const radarSignal = computeProductRadarSignal(matchedMaster, offers);

  // Bait prices are judged among the in-stock listings, as the market numbers
  // are; the flag lets the side panel mark the row (DOS/Rate#1297).
  const baitIds = implausiblyLowOfferIds(inStockOffers);
  const flagBait = (o: MerchantOffer): ExtensionOffer =>
    baitIds.has(o.id) ? { ...o, implausiblyLow: true } : o;
  const flaggedCheaperOffers = topCheaperOffers.map(flagBait);

  return {
    matchStatus,
    platform,
    capability,
    canonicalUrl,
    detectedStorageGb: hasStorage
      ? (storageGb ?? matchedMaster.storage_gb ?? null)
      : null,
    isAccessoryOrPart: false,
    accessoryReason: null,
    variantCandidates,
    priceAssessment,
    // The category's spec view, as rate.vn shows it: no earbud screen, RAM,
    // storage or camera, no watch 5G (DOS/Rate#1184).
    masterProduct: applyCategorySpecTemplate(categoryPath, matchedMaster),
    matchedOffer,
    topCheaperOffers: flaggedCheaperOffers,
    allOffers: mode === 'full' ? offers.map(flagBait) : flaggedCheaperOffers,
    merchantProfile,
    reviewSummary,
    priceHistory: mode === 'full' ? priceHistory : null,
    categorySlug: categoryPath,
    compareUrl: `/compare?cat=${categoryPath}&slugs=${encodeURIComponent(matchedMaster.slug)}`,
    productDetailUrl: itemContext
      ? itemProductPath(
          categoryPath,
          itemContext.item.slug,
          itemContext.sizeChosen ? itemContext.selected.variant_key : null
        )
      : `/${categoryPath}/${encodeURIComponent(matchedMaster.slug)}`,
    leaderboardUrl: `/leaderboard?cat=${categoryPath}`,
    versusUrl: topRival
      ? `/compare/${encodeURIComponent(matchedMaster.slug)}-vs-${encodeURIComponent(topRival.slug)}`
      : null,
    topRivalName: topRival?.name || null,
    leaderboardStandings,
    radarSignal,
    ...(itemContext
      ? {
          item: toApiItem(itemContext.item),
          selectedVariant: itemContext.sizeChosen
            ? itemContext.selected.variant_key
            : null,
        }
      : {}),
  };
}

type CrowdVerifySignalArgs =
  Database['rate']['Functions']['enqueue_crowd_verify_signal']['Args'];

/** The one RPC the ingest path calls; tests inject a fake with this shape. */
export interface CrowdIngestRpcClient {
  rpc: (
    fn: 'enqueue_crowd_verify_signal',
    args: CrowdVerifySignalArgs
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string; code?: string } | null;
  }>;
}

export interface ExtensionCrowdIngestInput {
  platform: SupportedEcommercePlatform;
  externalItemId: string;
  externalShopId?: string | null;
  url: string;
  title: string;
  selectedVariant?: string | null;
  price: number;
  originalPrice?: number | null;
  ratingStar?: number | null;
  ratingCount?: number | null;
  userConsentOptIn: boolean;
  /** Optional caller-scoped rate schema client (for authenticated requests or unit tests). */
  rateClient?: CrowdIngestRpcClient | null;
}

export interface ExtensionCrowdIngestResult {
  accepted: boolean;
  quarantinedForWorker: boolean;
  jobState: string;
  jobId: string | null;
  reason: string;
}

/**
 * Zero-Trust Crowdsourced Signal Quarantine (`POST /api/v1/rate/extension/ingest`).
 * Per Codex Review [P1] & Issue #159:
 * 1. NEVER writes directly to `rate.products` or `rate.price_history` from browser input.
 * 2. NEVER uses service-role credentials in `apps/web`.
 * 3. Checks user privacy Opt-In consent, Accessory Gatekeeper, and Platform Capability Matrix.
 * 4. Enqueues a quarantined verification job via narrow `SECURITY DEFINER` RPC `rate.enqueue_crowd_verify_signal`
 *    under the anon/authenticated role, and never echoes raw database `error.message` to callers.
 */
export async function ingestExtensionCrowdSignal(
  input: ExtensionCrowdIngestInput
): Promise<ExtensionCrowdIngestResult> {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !input.userConsentOptIn
  ) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'skipped_no_consent',
      jobId: null,
      reason:
        'Người dùng chưa bật tùy chọn đóng góp tín hiệu cộng đồng (Opt-In Privacy Gate).',
    };
  }

  const canonicalUrl = canonicalizeProductUrl(input.url);
  if (!canonicalUrl) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'rejected_invalid_url',
      jobId: null,
      reason: 'URL sản phẩm không hợp lệ.',
    };
  }

  const urlPlatform = detectPlatformFromInput(null, canonicalUrl);
  const parsedProductUrl = parseEcommerceUrlOrQuery(canonicalUrl);
  if (urlPlatform !== input.platform || !parsedProductUrl.platformItemId) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'rejected_invalid_url',
      jobId: null,
      reason:
        'URL sản phẩm không khớp với định dạng trang chi tiết sản phẩm của sàn TMĐT đã khai báo.',
    };
  }

  const capability = EXTENSION_CAPABILITY_MATRIX[input.platform];
  if (!capability || !capability.crowdVerifyQueue) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'platform_worker_pending_phase_5_1',
      jobId: null,
      reason: `Nền tảng ${input.platform} hiện hỗ trợ Tra cứu nhanh (Read-Only Lookup).`,
    };
  }

  if (
    typeof input.price !== 'number' ||
    !Number.isFinite(input.price) ||
    input.price <= 0 ||
    input.price > MAX_VALID_VND_PRICE
  ) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'rejected_invalid_price',
      jobId: null,
      reason: 'Mức giá sản phẩm không hợp lệ.',
    };
  }
  const safeObservedPrice = Math.round(input.price);

  const gatekeeper = detectAccessoryOrJunk({
    title: input.title,
    url: canonicalUrl,
    price: safeObservedPrice,
  });
  if (gatekeeper.isAccessory) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'skipped_accessory',
      jobId: null,
      reason:
        gatekeeper.reason ||
        'Bỏ qua phụ kiện/linh kiện để bảo vệ độ chính xác của biểu đồ giá thiết bị.',
    };
  }

  let rpcClient: CrowdIngestRpcClient | null = input.rateClient ?? null;
  if (!rpcClient) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        accepted: true,
        quarantinedForWorker: false,
        jobState: 'quarantined_dry_run',
        jobId: null,
        reason:
          'Đã ghi nhận tín hiệu ở chế độ cách ly (Quarantine Dry-Run) - chờ Worker xác minh độc lập.',
      };
    }
    rpcClient = getRateClient();
  }

  const rawCleanItemId = sanitizeExtensionField(input.externalItemId, 128);
  const cleanItemId = isValidExternalEntityId(rawCleanItemId)
    ? rawCleanItemId
    : '';
  const rawCleanShopId = sanitizeExtensionField(input.externalShopId, 128);
  const cleanShopId = isValidExternalEntityId(rawCleanShopId)
    ? rawCleanShopId
    : '';
  if (!cleanItemId || (rawCleanShopId !== '' && !cleanShopId)) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'rejected_invalid_url',
      jobId: null,
      reason: 'Mã định danh sản phẩm không hợp lệ.',
    };
  }
  const normalizedItemId = cleanShopId
    ? `${cleanShopId}_${cleanItemId}`
    : cleanItemId;
  const validOriginalPrice =
    typeof input.originalPrice === 'number' &&
    Number.isFinite(input.originalPrice) &&
    input.originalPrice >= safeObservedPrice &&
    input.originalPrice <= MAX_VALID_VND_PRICE
      ? Math.round(input.originalPrice)
      : null;
  const validRatingStar =
    typeof input.ratingStar === 'number' &&
    Number.isFinite(input.ratingStar) &&
    input.ratingStar > 0 &&
    input.ratingStar <= 5
      ? Number(input.ratingStar.toFixed(2))
      : null;
  const validRatingCount =
    typeof input.ratingCount === 'number' &&
    Number.isFinite(input.ratingCount) &&
    input.ratingCount >= 0 &&
    input.ratingCount <= 100_000_000
      ? Math.round(input.ratingCount)
      : null;

  const cleanObservedTitle = sanitizeExtensionField(input.title, 280);
  const cleanSelectedVariant =
    sanitizeExtensionField(input.selectedVariant, 120) || null;

  const { data, error } = await rpcClient.rpc('enqueue_crowd_verify_signal', {
    p_platform: input.platform,
    p_target_url: canonicalUrl,
    p_platform_item_id: normalizedItemId,
    p_platform_shop_id: cleanShopId || undefined,
    p_payload: {
      source: 'extension_mv3_quarantine',
      canonical_url: canonicalUrl,
      observed_title: cleanObservedTitle,
      selected_variant: cleanSelectedVariant,
      observed_price: safeObservedPrice,
      observed_original_price: validOriginalPrice,
      observed_rating_star: validRatingStar,
      observed_rating_count: validRatingCount,
      submitted_at: new Date().toISOString(),
    },
  });

  if (error) {
    log.warn('enqueue_crowd_verify_signal rejected', {
      code: error.code,
      message: error.message,
    });
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'queue_error',
      jobId: null,
      reason:
        'Không thể đưa tín hiệu vào hàng đợi xác minh lúc này. Vui lòng thử lại sau.',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    accepted: true,
    quarantinedForWorker: true,
    jobState: (row as { state?: string })?.state || 'enqueued',
    jobId: (row as { job_id?: string })?.job_id || null,
    reason:
      'Đã cách ly tín hiệu vào hàng đợi rate.crawl_jobs. Dữ liệu chỉ được cập nhật vào lịch sử giá sau khi Worker xác minh độc lập.',
  };
}
