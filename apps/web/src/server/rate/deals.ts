import 'server-only';
import { cache } from 'react';
import {
  MAX_VALID_VND_PRICE,
  getMasterProductCategorySlug,
  getMasterProductOffersBatch,
  getMasterProducts,
  isCanonicalCategorySlug,
  normalizeOfferOriginalPrice,
  resolveProductImageUrl,
  type CanonicalCategorySlug,
  type MasterProduct,
  type MerchantOffer,
} from '../../lib/rate-api';
import {
  EMPTY_RADAR_SIGNAL,
  buildRadarIndex,
  getRadarSignal,
  type RadarSignal,
} from '../../lib/deal-radar';
import { plausibleOffers } from '../../lib/offer-plausibility';
import {
  RATE_CACHE_TAGS,
  categoryCacheTag,
  withRateDataCache,
} from './cache-tags';

export type DealRadarVerdict =
  'genuine_all_time_low' | 'best_market_deal' | 'inflated_fake_sale';

export interface CrossPlatformDealRadarItem {
  id: string;
  verdict: DealRadarVerdict;
  verdictBadgeVi: string;
  productSlug: string;
  productName: string;
  brand: string;
  categorySlug: CanonicalCategorySlug;
  productHref: string;
  imageUrl: string | null;
  platform: string;
  merchantId: string;
  merchantName: string;
  isOfficialMall: boolean;
  merchantRiskScore: number;
  offerUrl: string;
  priceCurrent: number;
  priceOriginal: number | null;
  marketMedianPrice: number;
  marketMinPrice: number;
  marketMaxPrice: number;
  savingsVsMedianVnd: number;
  savingsVsMedianPct: number;
  claimedDiscountPct: number;
  fakeMarkupPct: number;
  jreviewsScore10: number | null;
  explanationVi: string;
}

export interface CrossPlatformPriceSpreadItem {
  id: string;
  productSlug: string;
  productName: string;
  brand: string;
  categorySlug: CanonicalCategorySlug;
  productHref: string;
  imageUrl: string | null;
  platformCount: number;
  offerCount: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  spreadVnd: number;
  spreadPct: number;
  cheapestPlatform: string;
  cheapestMerchantName: string;
  cheapestOfferUrl: string;
  priciestPlatform: string;
  priciestMerchantName: string;
  explanationVi: string;
}

export interface CrossPlatformDealRadarResponse {
  generatedAt: string;
  categoryFilter: CanonicalCategorySlug | 'all';
  platformFilter?: string;
  totalClustersAnalyzed: number;
  totalOffersAnalyzed: number;
  genuineDeals: CrossPlatformDealRadarItem[];
  fakeSaleTraps: CrossPlatformDealRadarItem[];
  priceSpreadLeaders: CrossPlatformPriceSpreadItem[];
}

function computeMedian(values: number[]): number {
  const valid = values
    .filter((v) => Number.isFinite(v) && v > 0 && v <= MAX_VALID_VND_PRICE)
    .sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return valid[mid]!;
  }
  return Math.round((valid[mid - 1]! + valid[mid]!) / 2);
}

function resolveEffectiveMerchantRisk(
  merchant: MerchantOffer['merchant'] | undefined,
  fallback: number
): number {
  const safeFallback =
    typeof fallback === 'number' && Number.isFinite(fallback) && fallback >= 0
      ? Math.min(100, fallback)
      : 0;
  if (!merchant) return safeFallback;
  const risk =
    typeof merchant.risk_score === 'number' &&
    Number.isFinite(merchant.risk_score)
      ? merchant.risk_score
      : safeFallback;
  const dosafe =
    typeof merchant.dosafe_risk_score === 'number' &&
    Number.isFinite(merchant.dosafe_risk_score)
      ? merchant.dosafe_risk_score
      : 0;
  const review =
    typeof merchant.review_risk_score === 'number' &&
    Number.isFinite(merchant.review_risk_score)
      ? merchant.review_risk_score
      : 0;
  const rawMax = Math.max(risk, dosafe, review);
  return Math.min(100, Math.max(0, rawMax));
}

/**
 * Pure, deterministic analyzer that inspects a list of MasterProducts and their
 * cross-platform MerchantOffers to identify:
 * 1. `genuineDeals`: Lowest-price offers from low-risk merchants (`risk_score <= 25`)
 *    that sit significantly below the 10-platform market median.
 * 2. `fakeSaleTraps`: Offers claiming a strikethrough `price_original` that is inflated
 *    `>= 10%` above the 10-platform market median while the actual selling price is not a real deal.
 * 3. `priceSpreadLeaders`: Products with the largest absolute price spread (`max_price - min_price`)
 *    across 10 retailers so buyers can avoid overpriced listings and buy at the lowest verified retailer.
 */
const SAFE_PLATFORM_FILTER_REGEX = /^[a-z0-9_-]{1,40}$/;
export const MAX_DEAL_RADAR_CLUSTERS = 500;

function sanitizeDealOfferHttpUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  if (/\p{Cc}/u.test(rawUrl)) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return '';
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
      return '';
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function normalizeDealRadarOptions(options?: {
  categorySlug?: string | null;
  platform?: string | null;
  limit?: number;
}): {
  categoryFilter: CanonicalCategorySlug | 'all';
  platformFilter: string;
  limit: number;
} {
  const safeOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : undefined;
  const rawCat =
    typeof safeOptions?.categorySlug === 'string'
      ? safeOptions.categorySlug
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  const categoryFilter: CanonicalCategorySlug | 'all' =
    rawCat && isCanonicalCategorySlug(rawCat) ? rawCat : 'all';

  const rawPlat =
    typeof safeOptions?.platform === 'string'
      ? safeOptions.platform
          .replace(/\p{Cc}+/gu, '')
          .trim()
          .toLowerCase()
      : '';
  const platformFilter =
    rawPlat &&
    rawPlat !== 'all' &&
    SAFE_PLATFORM_FILTER_REGEX.test(rawPlat) &&
    /[a-z0-9]/.test(rawPlat) &&
    !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(rawPlat)
      ? rawPlat
      : 'all';

  const rawLimit =
    typeof safeOptions?.limit === 'number' ? safeOptions.limit : Number.NaN;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), 50)
      : 12;

  return { categoryFilter, platformFilter, limit };
}

export function computeCrossPlatformDealRadarFromData(
  clusters: Array<{
    master: MasterProduct;
    offers: MerchantOffer[];
  }>,
  options?: {
    categorySlug?: CanonicalCategorySlug | 'all';
    platform?: string;
    limit?: number;
  }
): CrossPlatformDealRadarResponse {
  const { categoryFilter, platformFilter, limit } =
    normalizeDealRadarOptions(options);

  const genuineDeals: CrossPlatformDealRadarItem[] = [];
  const fakeSaleTraps: CrossPlatformDealRadarItem[] = [];
  const priceSpreadLeaders: CrossPlatformPriceSpreadItem[] = [];
  let totalClustersAnalyzed = 0;
  let totalOffersAnalyzed = 0;

  const boundedClusters = Array.isArray(clusters)
    ? clusters.slice(0, MAX_DEAL_RADAR_CLUSTERS)
    : [];

  for (const cluster of boundedClusters) {
    if (
      !cluster ||
      typeof cluster !== 'object' ||
      Array.isArray(cluster) ||
      !cluster.master ||
      typeof cluster.master !== 'object' ||
      Array.isArray(cluster.master)
    ) {
      continue;
    }
    const { master, offers } = cluster;
    const rawMasterSlug =
      typeof master.slug === 'string'
        ? master.slug
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .slice(0, 200)
        : '';
    const safeMasterSlug =
      /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(rawMasterSlug) &&
      !rawMasterSlug.endsWith('.') &&
      !rawMasterSlug.includes('..') &&
      !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(
        rawMasterSlug
      )
        ? rawMasterSlug
        : '';
    if (!safeMasterSlug) {
      continue;
    }
    const categorySlug = getMasterProductCategorySlug(master);
    if (categoryFilter !== 'all' && categorySlug !== categoryFilter) {
      continue;
    }

    // Every offer counts: offers arrive sorted by price, so a slice would keep
    // only the cheapest and understate the spread (DOS/Rate#867, #333).
    const clusterOffers = Array.isArray(offers) ? offers : [];

    // Bait-price listings (far below every other store) set no market floor,
    // spread, deal or trap (DOS/Rate#797).
    const validOffers = plausibleOffers(
      clusterOffers
        .filter(
          (o): o is MerchantOffer =>
            Boolean(o && typeof o === 'object' && !Array.isArray(o)) &&
            typeof o.price_current === 'number' &&
            Number.isFinite(o.price_current) &&
            o.price_current > 0 &&
            o.price_current <= MAX_VALID_VND_PRICE
        )
        .map((o, idx) => {
          const cleanedPlat =
            typeof o.platform === 'string'
              ? o.platform
                  .replace(/\p{Cc}+/gu, '')
                  .trim()
                  .toLowerCase()
                  .slice(0, 40)
              : '';
          const safePlatform =
            cleanedPlat &&
            SAFE_PLATFORM_FILTER_REGEX.test(cleanedPlat) &&
            /[a-z0-9]/.test(cleanedPlat) &&
            !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(
              cleanedPlat
            )
              ? cleanedPlat
              : 'shopee';
          const rawMerchant =
            o.merchant &&
            typeof o.merchant === 'object' &&
            !Array.isArray(o.merchant)
              ? o.merchant
              : ({} as MerchantOffer['merchant']);
          const safeMerchantName =
            typeof rawMerchant.name === 'string'
              ? rawMerchant.name
                  .replace(/\p{Cc}+/gu, ' ')
                  .trim()
                  .slice(0, 160) || safePlatform.toUpperCase()
              : safePlatform.toUpperCase();
          const cleanedMerchantId =
            typeof rawMerchant.id === 'string'
              ? rawMerchant.id
                  .replace(/\p{Cc}+/gu, '')
                  .trim()
                  .slice(0, 128)
              : '';
          const safeMerchantId =
            /^[a-zA-Z0-9._-]{1,128}$/.test(cleanedMerchantId) &&
            !cleanedMerchantId.startsWith('.') &&
            !cleanedMerchantId.endsWith('.') &&
            !cleanedMerchantId.includes('..') &&
            !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(
              cleanedMerchantId
            )
              ? cleanedMerchantId
              : '';
          const cleanedOfferId =
            typeof o.id === 'string'
              ? o.id
                  .replace(/\p{Cc}+/gu, '')
                  .trim()
                  .slice(0, 128)
              : '';
          const safeOfferId =
            /^[a-zA-Z0-9._-]{1,128}$/.test(cleanedOfferId) &&
            !cleanedOfferId.startsWith('.') &&
            !cleanedOfferId.endsWith('.') &&
            !cleanedOfferId.includes('..') &&
            !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(
              cleanedOfferId
            )
              ? cleanedOfferId
              : `offer-${idx + 1}`;
          return {
            ...o,
            id: safeOfferId,
            platform: safePlatform,
            url: sanitizeDealOfferHttpUrl(o.url),
            merchant: {
              ...rawMerchant,
              id: safeMerchantId,
              name: safeMerchantName,
              platform: safePlatform,
              is_official: Boolean(rawMerchant.is_official),
            },
          };
        })
    );
    if (validOffers.length < 2) continue;

    totalClustersAnalyzed++;
    totalOffersAnalyzed += validOffers.length;

    const prices = validOffers.map((o) => o.price_current);
    const marketMinPrice = Math.min(...prices);
    const marketMaxPrice = Math.max(...prices);
    const marketMedianPrice = computeMedian(prices);
    if (marketMedianPrice <= 0) continue;

    const pickPositiveRating = (val: unknown): number =>
      typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : 0;
    const rawExpert =
      pickPositiveRating(master.expert_rating) ||
      pickPositiveRating(master.user_rating_weighted) ||
      pickPositiveRating(master.average_rating);
    // No expert or user rating yet: leave the score empty instead of inventing one.
    const jreviewsScore10 =
      Number.isFinite(rawExpert) && rawExpert > 0 && rawExpert <= 10
        ? Number((rawExpert <= 5 ? rawExpert * 2 : rawExpert).toFixed(1))
        : null;
    const imageUrl = resolveProductImageUrl(master);
    const productHref = `/${categorySlug}/${safeMasterSlug}`;

    // 1. Identify best genuine deal for this Master Product
    const sortedByPrice = [...validOffers].sort(
      (a, b) => a.price_current - b.price_current
    );
    const cheapestOffer = sortedByPrice[0]!;
    const priciestOffer = sortedByPrice[sortedByPrice.length - 1]!;
    const spreadVnd = Math.max(0, marketMaxPrice - marketMinPrice);
    const spreadPct =
      marketMinPrice > 0
        ? Math.round((spreadVnd / marketMinPrice) * 1000) / 10
        : 0;
    const platformCount = new Set(
      validOffers.map((o) => o.platform.toLowerCase())
    ).size;

    if (
      spreadVnd > 0 &&
      (platformFilter === 'all' ||
        cheapestOffer.platform.toLowerCase() === platformFilter ||
        priciestOffer.platform.toLowerCase() === platformFilter)
    ) {
      priceSpreadLeaders.push({
        id: `spread-${safeMasterSlug}`,
        productSlug: safeMasterSlug,
        productName: master.name,
        brand: master.brand,
        categorySlug,
        productHref,
        imageUrl,
        platformCount,
        offerCount: validOffers.length,
        minPrice: marketMinPrice,
        maxPrice: marketMaxPrice,
        medianPrice: marketMedianPrice,
        spreadVnd,
        spreadPct,
        cheapestPlatform: cheapestOffer.platform,
        cheapestMerchantName: cheapestOffer.merchant.name,
        cheapestOfferUrl: cheapestOffer.url,
        priciestPlatform: priciestOffer.platform,
        priciestMerchantName: priciestOffer.merchant.name,
        explanationVi: `Chênh lệch ${spreadVnd.toLocaleString('vi-VN')} ₫ (${spreadPct}%) giữa ${cheapestOffer.platform.toUpperCase()} (${marketMinPrice.toLocaleString('vi-VN')} ₫) và ${priciestOffer.platform.toUpperCase()} (${marketMaxPrice.toLocaleString('vi-VN')} ₫).`,
      });
    }

    const bestOffer = sortedByPrice.find(
      (o) =>
        resolveEffectiveMerchantRisk(o.merchant, 10) <= 30 &&
        (platformFilter === 'all' ||
          o.platform.toLowerCase() === platformFilter)
    );

    if (bestOffer && bestOffer.price_current < marketMedianPrice) {
      const savingsVsMedianVnd = marketMedianPrice - bestOffer.price_current;
      const savingsVsMedianPct = Number(
        ((savingsVsMedianVnd / marketMedianPrice) * 100).toFixed(1)
      );
      const validBestOrig = normalizeOfferOriginalPrice(
        bestOffer.price_current,
        bestOffer.price_original
      );
      const claimedDiscountPct =
        validBestOrig && validBestOrig > bestOffer.price_current
          ? Math.round(
              ((validBestOrig - bestOffer.price_current) / validBestOrig) * 100
            )
          : 0;

      const isAllTimeLow =
        bestOffer.price_current <= marketMinPrice && savingsVsMedianPct >= 2.0;
      const verdict: DealRadarVerdict = isAllTimeLow
        ? 'genuine_all_time_low'
        : 'best_market_deal';

      genuineDeals.push({
        id: `deal-${safeMasterSlug}-${bestOffer.platform}`,
        verdict,
        verdictBadgeVi: isAllTimeLow
          ? '🔥 Đáy Giá Đa Sàn'
          : '✅ Giá Tốt Nhất 10 Sàn',
        productSlug: safeMasterSlug,
        productName: master.name,
        brand: master.brand,
        categorySlug,
        productHref,
        imageUrl,
        platform: bestOffer.platform,
        merchantId: bestOffer.merchant.id,
        merchantName: bestOffer.merchant.name,
        isOfficialMall: Boolean(bestOffer.merchant.is_official),
        merchantRiskScore: resolveEffectiveMerchantRisk(bestOffer.merchant, 5),
        offerUrl: bestOffer.url,
        priceCurrent: bestOffer.price_current,
        priceOriginal: validBestOrig,
        marketMedianPrice,
        marketMinPrice,
        marketMaxPrice,
        savingsVsMedianVnd,
        savingsVsMedianPct,
        claimedDiscountPct,
        fakeMarkupPct: 0,
        jreviewsScore10,
        explanationVi: `Rẻ hơn trung vị 10 sàn ${savingsVsMedianVnd.toLocaleString('vi-VN')} ₫ (-${savingsVsMedianPct}%) tại ${bestOffer.merchant.name} (${bestOffer.platform.toUpperCase()}).`,
      });
    }

    // 2. Identify the worst fake-sale trap (highest inflated strikethrough markup) for this cluster (#396)
    let worstTrap: CrossPlatformDealRadarItem | null = null;
    for (const off of validOffers) {
      if (
        platformFilter !== 'all' &&
        off.platform.toLowerCase() !== platformFilter
      ) {
        continue;
      }
      const validOrig = normalizeOfferOriginalPrice(
        off.price_current,
        off.price_original
      );
      if (!validOrig || validOrig <= off.price_current) {
        continue;
      }
      const fakeMarkupPct = Number(
        (((validOrig - marketMedianPrice) / marketMedianPrice) * 100).toFixed(1)
      );
      const claimedDiscountPct = Math.round(
        ((validOrig - off.price_current) / validOrig) * 100
      );

      // Flag when original price is >= 11% above market median and current price is >= market median
      if (fakeMarkupPct >= 11 && off.price_current >= marketMedianPrice) {
        const candidateTrap: CrossPlatformDealRadarItem = {
          id: `trap-${safeMasterSlug}-${off.platform}-${off.id}`,
          verdict: 'inflated_fake_sale',
          verdictBadgeVi: `⚠️ Nâng giá gốc +${fakeMarkupPct}%`,
          productSlug: safeMasterSlug,
          productName: master.name,
          brand: master.brand,
          categorySlug,
          productHref,
          imageUrl,
          platform: off.platform,
          merchantId: off.merchant.id,
          merchantName: off.merchant.name,
          isOfficialMall: Boolean(off.merchant.is_official),
          merchantRiskScore: resolveEffectiveMerchantRisk(off.merchant, 15),
          offerUrl: off.url,
          priceCurrent: off.price_current,
          priceOriginal: validOrig,
          marketMedianPrice,
          marketMinPrice,
          marketMaxPrice,
          savingsVsMedianVnd: marketMedianPrice - off.price_current,
          savingsVsMedianPct: Number(
            (
              ((marketMedianPrice - off.price_current) / marketMedianPrice) *
              100
            ).toFixed(1)
          ),
          claimedDiscountPct,
          fakeMarkupPct,
          jreviewsScore10,
          explanationVi: `Gian hàng treo giá gốc gạch ngang ${validOrig.toLocaleString('vi-VN')} ₫ (cao hơn trung vị thị trường +${fakeMarkupPct}%) để tạo cảm giác giảm ${claimedDiscountPct}%, nhưng giá thực bán cao hơn đáy thị trường ${(off.price_current - marketMinPrice).toLocaleString('vi-VN')} ₫.`,
        };

        if (
          !worstTrap ||
          candidateTrap.fakeMarkupPct > worstTrap.fakeMarkupPct ||
          (candidateTrap.fakeMarkupPct === worstTrap.fakeMarkupPct &&
            (candidateTrap.claimedDiscountPct > worstTrap.claimedDiscountPct ||
              (candidateTrap.claimedDiscountPct ===
                worstTrap.claimedDiscountPct &&
                candidateTrap.priceCurrent > worstTrap.priceCurrent)))
        ) {
          worstTrap = candidateTrap;
        }
      }
    }

    if (worstTrap) {
      fakeSaleTraps.push(worstTrap);
    }
  }

  genuineDeals.sort((a, b) => {
    if (b.savingsVsMedianPct !== a.savingsVsMedianPct) {
      return b.savingsVsMedianPct - a.savingsVsMedianPct;
    }
    return b.savingsVsMedianVnd - a.savingsVsMedianVnd;
  });

  fakeSaleTraps.sort((a, b) => b.fakeMarkupPct - a.fakeMarkupPct);

  priceSpreadLeaders.sort(
    (a, b) => b.spreadVnd - a.spreadVnd || b.spreadPct - a.spreadPct
  );

  return {
    generatedAt: new Date().toISOString(),
    categoryFilter,
    platformFilter,
    totalClustersAnalyzed,
    totalOffersAnalyzed,
    genuineDeals: genuineDeals.slice(0, limit),
    fakeSaleTraps: fakeSaleTraps.slice(0, limit),
    priceSpreadLeaders: priceSpreadLeaders.slice(0, limit),
  };
}

/**
 * Radar signal for ONE product, computed from its own offers.
 * Each cluster is analysed independently, so this equals the signal the
 * global radar would produce, without the top-N truncation of the feed.
 */
export function computeProductRadarSignal(
  master: MasterProduct,
  offers: MerchantOffer[]
): RadarSignal {
  if (!master || typeof master !== 'object' || Array.isArray(master)) {
    return EMPTY_RADAR_SIGNAL;
  }
  const radar = computeCrossPlatformDealRadarFromData([{ master, offers }], {
    categorySlug: 'all',
    limit: 50,
  });
  return getRadarSignal(
    buildRadarIndex(radar),
    typeof master.slug === 'string' ? master.slug : ''
  );
}

const _getCrossPlatformDealRadarByKey = cache(
  (
    categorySlug: CanonicalCategorySlug | 'all',
    platformFilter: string,
    limit: number
  ): Promise<CrossPlatformDealRadarResponse> =>
    withRateDataCache(
      async (cat: CanonicalCategorySlug | 'all', plat: string, lim: number) => {
        const masters = await getMasterProducts({
          categorySlug: cat === 'all' ? undefined : cat,
          limit: Math.max(36, lim * 2),
        });

        const offersByMaster = await getMasterProductOffersBatch(
          masters.map((m) => m.id)
        );

        const clusters = masters.map((master) => ({
          master,
          offers: offersByMaster.get(master.id) ?? [],
        }));

        return computeCrossPlatformDealRadarFromData(clusters, {
          categorySlug: cat,
          platform: plat,
          limit: lim,
        });
      },
      [
        'rate-cross-platform-deal-radar',
        categorySlug,
        platformFilter,
        String(limit),
      ],
      {
        revalidate: 180,
        tags: [
          RATE_CACHE_TAGS.DEALS,
          RATE_CACHE_TAGS.PRODUCTS,
          RATE_CACHE_TAGS.OFFERS,
          ...(categorySlug !== 'all' ? [categoryCacheTag(categorySlug)] : []),
        ],
      }
    )(categorySlug, platformFilter, limit)
);

export function getCrossPlatformDealRadar(options?: {
  categorySlug?: CanonicalCategorySlug | 'all';
  platform?: string;
  limit?: number;
}): Promise<CrossPlatformDealRadarResponse> {
  const { categoryFilter, platformFilter, limit } =
    normalizeDealRadarOptions(options);
  return _getCrossPlatformDealRadarByKey(categoryFilter, platformFilter, limit);
}
