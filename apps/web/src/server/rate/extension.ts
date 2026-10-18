import 'server-only';
import type { Database } from '@repo/shared-data';
import {
  getMasterProductBySlug,
  getMasterProductCategorySlug,
  getMasterProductOffers,
  getMasterProductPriceHistory,
  getMasterProductReviews,
  getMasterProductReviewSummary,
  getMasterProducts,
  getMerchantsList,
  getRateClient,
  parseEcommerceUrlOrQuery,
  type CanonicalCategorySlug,
  type MasterProduct,
  type MasterProductPriceHistorySummary,
  type MerchantOffer,
  type MerchantSummary,
  type ReviewAnalysisSummary,
} from '../../lib/rate-api';
import {
  computeProductStandingInCategory,
  type ProductLeaderboardBadgeInfo,
} from '../../lib/leaderboard-engine';
import { computeProductRadarSignal } from './deals';
import type { RadarSignal } from '../../lib/deal-radar';
import { createLogger } from '@/lib/logger';

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
}

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
  topCheaperOffers: MerchantOffer[];
  allOffers: MerchantOffer[];
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

const MINIMUM_DEVICE_PRICE_FLOOR_VND = 1_200_000;
const MINIMUM_EARBUDS_PRICE_FLOOR_VND = 400_000;
const EARBUDS_TITLE_REGEX = /\b(?:airpods|buds|wf-|tai\s*nghe|earbuds)\b/i;

function isDomainOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Strip all tracking & session parameters (sp_atk, xptdk, utm_*, fbclid, etc.)
 * to comply with Chrome Web Store User Data Privacy policies.
 */
export function canonicalizeProductUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export function detectPlatformFromInput(
  rawPlatform?: string | null,
  rawUrl?: string | null
): SupportedEcommercePlatform | null {
  const norm = (rawPlatform || '').trim().toLowerCase();
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
  let host: string;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    host = parsed.hostname.toLowerCase();
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
  price?: number | null;
}): { isAccessory: boolean; reason: string | null } {
  const titleLower = (params.title || '').trim().toLowerCase();
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

  const minFloor = EARBUDS_TITLE_REGEX.test(titleLower)
    ? MINIMUM_EARBUDS_PRICE_FLOOR_VND
    : MINIMUM_DEVICE_PRICE_FLOOR_VND;

  if (
    typeof params.price === 'number' &&
    params.price > 0 &&
    params.price < minFloor
  ) {
    return {
      isAccessory: true,
      reason: `Mức giá (${params.price.toLocaleString('vi-VN')} ₫) thấp hơn ngưỡng tối thiểu của thiết bị chính hãng (${minFloor.toLocaleString('vi-VN')} ₫) - khả năng cao là phụ kiện hoặc linh kiện.`,
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
    // Match RAM/ROM slash pattern like 8GB/256GB or 12/512GB first
    const slashRegex =
      /\b(?:4|6|8|12|16|24|32)\s*(?:gb)?\s*[/|-]\s*(64|128|256|512|1024)\s*gb\b/gi;
    let m: RegExpExecArray | null;
    while ((m = slashRegex.exec(text)) !== null) {
      const cap = Number(m[1]);
      if (cap >= 64) found.add(cap);
    }

    // Match standalone storage capacities (64GB, 128GB, 256GB, 512GB, 1TB, 2TB)
    const capRegex = /\b(64|128|256|512)\s*gb\b|\b(1|2)\s*tb\b/gi;
    while ((m = capRegex.exec(text)) !== null) {
      if (m[1]) {
        found.add(Number(m[1]));
      } else if (m[2]) {
        found.add(Number(m[2]) * 1024);
      }
    }
    return Array.from(found).sort((a, b) => a - b);
  };

  const variantText = (params.selectedVariant || '').trim();
  const titleText = (params.title || '').trim();

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

  // Build clean core device query (strip promotional brackets, Shopee noise, and capacity suffixes)
  const cleanModelSearchQuery = titleText
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(
      /(?:^|\s)(chính hãng|vn\/a|vna|fullbox|mới 100%|nguyên seal|trả góp 0%|bảo hành \d+ tháng|freeship|hoả tốc|hỏa tốc|điện thoại|di động|smartphone|máy tính bảng|tablet|laptop)(?=\s|$|[,.|-])/giu,
      ' '
    )
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
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
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
  priceHistory: MasterProductPriceHistorySummary | null;
}): ExtensionPriceAssessment {
  const {
    isAccessory,
    accessoryReason,
    isAmbiguousVariant,
    observedPrice,
    observedOriginalPrice,
    offers,
    priceHistory,
  } = params;

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

  const offerPrices = offers
    .map((o) => o.price_current)
    .filter((p) => Number.isFinite(p) && p > 0);

  const marketMinPrice =
    offerPrices.length > 0 ? Math.min(...offerPrices) : null;
  const marketMaxPrice =
    offerPrices.length > 0 ? Math.max(...offerPrices) : null;
  const marketMedianPrice =
    offerPrices.length > 0 ? computeMedian(offerPrices) : null;

  const historicalMinPrice = priceHistory?.lowestEverPrice ?? marketMinPrice;
  const historicalMaxPrice = priceHistory?.highestEverPrice ?? marketMaxPrice;

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

  const effectivePrice =
    observedPrice && observedPrice > 0
      ? observedPrice
      : (offers[0]?.price_current ?? null);

  const effectiveOriginalPrice =
    observedOriginalPrice &&
    effectivePrice &&
    observedOriginalPrice > effectivePrice
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

  const cheaperOffers = offers.filter(
    (o) => o.price_current > 0 && o.price_current < effectivePrice - 50_000
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
      badgeLabel: 'Cảnh báo Giảm giá ảo',
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
    params.price > 0
      ? Math.round(params.price)
      : null;
  const observedOriginalPrice =
    typeof params.originalPrice === 'number' &&
    Number.isFinite(params.originalPrice) &&
    params.originalPrice > 0
      ? Math.round(params.originalPrice)
      : null;

  // Step 1: Accessory / Junk Gatekeeper
  const gatekeeper = detectAccessoryOrJunk({
    title: params.title,
    price: observedPrice,
  });

  const { storageGb, hasMultipleStorageInTitle, cleanModelSearchQuery } =
    extractStorageAndAmbiguity({
      title: params.title,
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
  const rawExternalId =
    (params.externalId || '').trim() || parsedFromUrl?.platformItemId || null;

  // Normalize externalId (handle both `shopId_itemId` and raw `itemId`)
  const candidateItemIds = new Set<string>();
  if (rawExternalId) {
    candidateItemIds.add(rawExternalId);
    if (rawExternalId.includes('_')) {
      const parts = rawExternalId.split('_');
      if (parts[1]) candidateItemIds.add(parts[1]);
    }
    if (params.shopId && !rawExternalId.includes('_')) {
      candidateItemIds.add(`${params.shopId}_${rawExternalId}`);
    }
  }

  // Step 3: Search candidate Master Products in DB (Read-Only)
  const searchKeyword =
    cleanModelSearchQuery || params.title || canonicalUrl || '';
  const [catalogCandidates, merchantsList] = await Promise.all([
    searchKeyword
      ? getMasterProducts({ search: searchKeyword, limit: 8 })
      : getMasterProducts({ limit: 6 }),
    getMerchantsList(),
  ]);

  let matchedMaster: MasterProduct | null = null;
  let matchStatus: ExtensionMatchStatus = 'not_found';

  // Try matching via URL / externalId inspection if available
  if (canonicalUrl || rawExternalId) {
    const queryStr = canonicalUrl || rawExternalId || '';
    const parsed = parseEcommerceUrlOrQuery(queryStr);
    if (parsed.internalSlug) {
      const bySlug = await getMasterProductBySlug(parsed.internalSlug);
      if (bySlug) {
        matchedMaster = bySlug;
        matchStatus = 'canonical_model';
      }
    }
  }

  // Filter catalog candidates by storageGb if known
  if (!matchedMaster && catalogCandidates.length > 0) {
    if (storageGb) {
      const exactStorageMatch = catalogCandidates.find(
        (m) => m.storage_gb === storageGb
      );
      matchedMaster = exactStorageMatch || catalogCandidates[0]!;
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

  // Build variant candidates across same model family
  const sameFamilyVariants = catalogCandidates.filter(
    (c) =>
      c.brand.toLowerCase() === matchedMaster!.brand.toLowerCase() &&
      c.model.toLowerCase() === matchedMaster!.model.toLowerCase() &&
      typeof c.storage_gb === 'number'
  );
  const variantCandidates: ExtensionVariantCandidate[] = sameFamilyVariants.map(
    (v) => ({
      storageGb: v.storage_gb || 256,
      label: `${v.storage_gb || 256}GB`,
      slug: v.slug,
      minPrice: v.min_price,
      maxPrice: v.max_price,
    })
  );

  if (variantCandidates.length > 1 && !storageGb) {
    matchStatus = 'ambiguous_variant';
  }

  // Fetch offers, price history, and reviews for matched master product
  const offers = await getMasterProductOffers(matchedMaster.id);
  const matchedOffer =
    offers.find(
      (o) =>
        (canonicalUrl && o.url.includes(canonicalUrl)) ||
        Array.from(candidateItemIds).some((id) => o.url.includes(id))
    ) ||
    offers[0] ||
    null;

  if (matchedOffer && candidateItemIds.size > 0) {
    for (const id of candidateItemIds) {
      if (matchedOffer.url.includes(id)) {
        matchStatus = 'exact_listing';
        break;
      }
    }
  }

  const categoryPath = getMasterProductCategorySlug(matchedMaster);

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

  const totalRevs = Number(matchedMaster.total_reviews || 0);
  const authRevs = Number(matchedMaster.authentic_review_count ?? totalRevs);
  const authPct =
    totalRevs > 0 ? Math.round((authRevs / totalRevs) * 100) : 100;

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
  const effectiveObservedOriginal =
    observedOriginalPrice ?? matchedOffer?.price_original ?? null;

  const isAmbiguous = matchStatus === 'ambiguous_variant';
  const priceAssessment = evaluateExtensionPriceVerdict({
    isAccessory: false,
    accessoryReason: null,
    isAmbiguousVariant: isAmbiguous,
    observedPrice: effectiveObservedPrice,
    observedOriginalPrice: effectiveObservedOriginal,
    offers,
    priceHistory,
  });

  const topCheaperOffers = effectiveObservedPrice
    ? offers
        .filter(
          (o) =>
            o.price_current > 0 &&
            o.price_current < effectiveObservedPrice - 50_000
        )
        .sort((a, b) => a.price_current - b.price_current)
        .slice(0, 4)
    : offers.slice(0, 4);

  const merchantProfile = matchedOffer
    ? merchantsList.find((m) => m.id === matchedOffer.merchant.id) || null
    : null;
  const radarSignal = computeProductRadarSignal(matchedMaster, offers);

  return {
    matchStatus,
    platform,
    capability,
    canonicalUrl,
    detectedStorageGb: storageGb ?? matchedMaster.storage_gb ?? null,
    isAccessoryOrPart: false,
    accessoryReason: null,
    variantCandidates,
    priceAssessment,
    masterProduct: matchedMaster,
    matchedOffer,
    topCheaperOffers,
    allOffers: mode === 'full' ? offers : topCheaperOffers,
    merchantProfile,
    reviewSummary,
    priceHistory: mode === 'full' ? priceHistory : null,
    categorySlug: categoryPath,
    compareUrl: `/compare?cat=${categoryPath}&slugs=${encodeURIComponent(matchedMaster.slug)}`,
    productDetailUrl: `/${categoryPath}/${encodeURIComponent(matchedMaster.slug)}`,
    leaderboardUrl: `/leaderboard?cat=${categoryPath}`,
    versusUrl: topRival
      ? `/compare/${encodeURIComponent(matchedMaster.slug)}-vs-${encodeURIComponent(topRival.slug)}`
      : null,
    topRivalName: topRival?.name || null,
    leaderboardStandings,
    radarSignal,
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
  if (!input.userConsentOptIn) {
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
  if (urlPlatform !== input.platform) {
    return {
      accepted: false,
      quarantinedForWorker: false,
      jobState: 'rejected_invalid_url',
      jobId: null,
      reason: 'URL sản phẩm không khớp với tên miền của sàn TMĐT đã khai báo.',
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

  const gatekeeper = detectAccessoryOrJunk({
    title: input.title,
    price: input.price,
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

  const normalizedItemId = input.externalShopId
    ? `${input.externalShopId}_${input.externalItemId}`
    : input.externalItemId;

  const { data, error } = await rpcClient.rpc('enqueue_crowd_verify_signal', {
    p_platform: input.platform,
    p_target_url: canonicalUrl,
    p_platform_item_id: normalizedItemId,
    p_platform_shop_id: input.externalShopId || undefined,
    p_payload: {
      source: 'extension_mv3_quarantine',
      canonical_url: canonicalUrl,
      observed_title: input.title.slice(0, 280),
      selected_variant: input.selectedVariant?.slice(0, 120) || null,
      observed_price: input.price,
      observed_original_price: input.originalPrice || null,
      observed_rating_star: input.ratingStar || null,
      observed_rating_count: input.ratingCount || null,
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
