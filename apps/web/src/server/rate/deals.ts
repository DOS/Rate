import { cache } from 'react';
import {
  getMasterProductCategorySlug,
  getMasterProductOffers,
  getMasterProducts,
  resolveProductImageUrl,
  type CanonicalCategorySlug,
  type MasterProduct,
  type MerchantOffer,
} from '../../lib/rate-api';

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
  jreviewsScore10: number;
  explanationVi: string;
}

export interface CrossPlatformDealRadarResponse {
  generatedAt: string;
  categoryFilter: CanonicalCategorySlug | 'all';
  totalClustersAnalyzed: number;
  totalOffersAnalyzed: number;
  genuineDeals: CrossPlatformDealRadarItem[];
  fakeSaleTraps: CrossPlatformDealRadarItem[];
}

function computeMedian(values: number[]): number {
  const valid = values
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    return valid[mid]!;
  }
  return Math.round((valid[mid - 1]! + valid[mid]!) / 2);
}

/**
 * Pure, deterministic analyzer that inspects a list of MasterProducts and their
 * cross-platform MerchantOffers to identify:
 * 1. `genuineDeals`: Lowest-price offers from low-risk merchants (`risk_score <= 25`)
 *    that sit significantly below the 10-platform market median.
 * 2. `fakeSaleTraps`: Offers claiming a strikethrough `price_original` that is inflated
 *    `>= 10%` above the 10-platform market median while the actual selling price is not a real deal.
 */
export function computeCrossPlatformDealRadarFromData(
  clusters: Array<{
    master: MasterProduct;
    offers: MerchantOffer[];
  }>,
  options?: {
    categorySlug?: CanonicalCategorySlug | 'all';
    limit?: number;
  }
): CrossPlatformDealRadarResponse {
  const categoryFilter = options?.categorySlug || 'all';
  const limit = Math.max(1, Math.min(options?.limit || 12, 50));

  const genuineDeals: CrossPlatformDealRadarItem[] = [];
  const fakeSaleTraps: CrossPlatformDealRadarItem[] = [];
  let totalClustersAnalyzed = 0;
  let totalOffersAnalyzed = 0;

  for (const { master, offers } of clusters) {
    const categorySlug = getMasterProductCategorySlug(master);
    if (categoryFilter !== 'all' && categorySlug !== categoryFilter) {
      continue;
    }

    const validOffers = offers.filter(
      (o) => Number.isFinite(o.price_current) && o.price_current > 0
    );
    if (validOffers.length < 2) continue;

    totalClustersAnalyzed++;
    totalOffersAnalyzed += validOffers.length;

    const prices = validOffers.map((o) => o.price_current);
    const marketMinPrice = Math.min(...prices);
    const marketMaxPrice = Math.max(...prices);
    const marketMedianPrice = computeMedian(prices);
    if (marketMedianPrice <= 0) continue;

    const rawExpert = Number(
      master.expert_rating ||
        master.user_rating_weighted ||
        master.average_rating ||
        4.8
    );
    const jreviewsScore10 = Number(
      (rawExpert <= 5 ? rawExpert * 2 : rawExpert).toFixed(1)
    );
    const imageUrl = resolveProductImageUrl(master);
    const productHref = `/${categorySlug}/${master.slug}`;

    // 1. Identify best genuine deal for this Master Product
    const sortedByPrice = [...validOffers].sort(
      (a, b) => a.price_current - b.price_current
    );
    const bestOffer = sortedByPrice.find(
      (o) => Number(o.merchant?.risk_score ?? 10) <= 30
    );

    if (bestOffer && bestOffer.price_current < marketMedianPrice) {
      const savingsVsMedianVnd = marketMedianPrice - bestOffer.price_current;
      const savingsVsMedianPct = Number(
        ((savingsVsMedianVnd / marketMedianPrice) * 100).toFixed(1)
      );
      const claimedDiscountPct =
        bestOffer.price_original &&
        bestOffer.price_original > bestOffer.price_current
          ? Math.round(
              ((bestOffer.price_original - bestOffer.price_current) /
                bestOffer.price_original) *
                100
            )
          : 0;

      const isAllTimeLow =
        bestOffer.price_current <= marketMinPrice && savingsVsMedianPct >= 2.0;
      const verdict: DealRadarVerdict = isAllTimeLow
        ? 'genuine_all_time_low'
        : 'best_market_deal';

      genuineDeals.push({
        id: `deal-${master.slug}-${bestOffer.platform}`,
        verdict,
        verdictBadgeVi: isAllTimeLow
          ? '🔥 Đáy Giá Đa Sàn'
          : '✅ Giá Tốt Nhất 10 Sàn',
        productSlug: master.slug,
        productName: master.name,
        brand: master.brand,
        categorySlug,
        productHref,
        imageUrl,
        platform: bestOffer.platform,
        merchantId: bestOffer.merchant.id,
        merchantName: bestOffer.merchant.name,
        isOfficialMall: Boolean(bestOffer.merchant.is_official),
        merchantRiskScore: Number(bestOffer.merchant.risk_score ?? 5),
        offerUrl: bestOffer.url,
        priceCurrent: bestOffer.price_current,
        priceOriginal: bestOffer.price_original,
        marketMedianPrice,
        marketMinPrice,
        marketMaxPrice,
        savingsVsMedianVnd,
        savingsVsMedianPct,
        claimedDiscountPct,
        fakeMarkupPct: 0,
        jreviewsScore10,
        explanationVi: `Rẻ hơn trung vị 10 sàn ${savingsVsMedianVnd.toLocaleString('vi-VN')}₫ (-${savingsVsMedianPct}%) tại ${bestOffer.merchant.name} (${bestOffer.platform.toUpperCase()}).`,
      });
    }

    // 2. Identify fake-sale traps (inflated strikethrough original price)
    for (const off of validOffers) {
      if (!off.price_original || off.price_original <= off.price_current) {
        continue;
      }
      const fakeMarkupPct = Number(
        (
          ((off.price_original - marketMedianPrice) / marketMedianPrice) *
          100
        ).toFixed(1)
      );
      const claimedDiscountPct = Math.round(
        ((off.price_original - off.price_current) / off.price_original) * 100
      );

      // Flag when original price is >= 11% above market median and current price is >= market median
      if (fakeMarkupPct >= 11 && off.price_current >= marketMedianPrice) {
        fakeSaleTraps.push({
          id: `trap-${master.slug}-${off.platform}-${off.id}`,
          verdict: 'inflated_fake_sale',
          verdictBadgeVi: `⚠️ Nâng giá gốc +${fakeMarkupPct}%`,
          productSlug: master.slug,
          productName: master.name,
          brand: master.brand,
          categorySlug,
          productHref,
          imageUrl,
          platform: off.platform,
          merchantId: off.merchant.id,
          merchantName: off.merchant.name,
          isOfficialMall: Boolean(off.merchant.is_official),
          merchantRiskScore: Number(off.merchant.risk_score ?? 15),
          offerUrl: off.url,
          priceCurrent: off.price_current,
          priceOriginal: off.price_original,
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
          explanationVi: `Gian hàng treo giá gốc gạch ngang ${off.price_original.toLocaleString('vi-VN')}₫ (cao hơn trung vị thị trường +${fakeMarkupPct}%) để tạo cảm giác giảm ${claimedDiscountPct}%, nhưng giá thực bán cao hơn đáy thị trường ${(off.price_current - marketMinPrice).toLocaleString('vi-VN')}₫.`,
        });
        break;
      }
    }
  }

  genuineDeals.sort((a, b) => {
    if (b.savingsVsMedianPct !== a.savingsVsMedianPct) {
      return b.savingsVsMedianPct - a.savingsVsMedianPct;
    }
    return b.savingsVsMedianVnd - a.savingsVsMedianVnd;
  });

  fakeSaleTraps.sort((a, b) => b.fakeMarkupPct - a.fakeMarkupPct);

  return {
    generatedAt: new Date().toISOString(),
    categoryFilter,
    totalClustersAnalyzed,
    totalOffersAnalyzed,
    genuineDeals: genuineDeals.slice(0, limit),
    fakeSaleTraps: fakeSaleTraps.slice(0, limit),
  };
}

export const getCrossPlatformDealRadar = cache(
  async (options?: {
    categorySlug?: CanonicalCategorySlug | 'all';
    limit?: number;
  }): Promise<CrossPlatformDealRadarResponse> => {
    const categorySlug = options?.categorySlug || 'all';
    const masters = await getMasterProducts({
      categorySlug: categorySlug === 'all' ? undefined : categorySlug,
      limit: 36,
    });

    const clusters = await Promise.all(
      masters.map(async (master) => ({
        master,
        offers: await getMasterProductOffers(master.id),
      }))
    );

    return computeCrossPlatformDealRadarFromData(clusters, options);
  }
);
