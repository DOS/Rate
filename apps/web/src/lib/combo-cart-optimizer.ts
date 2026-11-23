import {
  MAX_VALID_VND_PRICE,
  hasImplausiblyLowOfferId,
  implausiblyLowOfferIds,
  isOfferImplausiblyLowAgainstInStock,
  normalizeOfferId,
} from '@repo/shared-data/rules';
import {
  isOfferUnavailable,
  type OfferAvailability,
} from './product-market-stats';

export const COMBO_CART_MIN_ITEMS = 2;
export const COMBO_CART_MAX_ITEMS = 5;
export const COMBO_CART_DEFAULT_MIN_TRUST = 80;
export const COMBO_CART_DEFAULT_MAX_STORES = 3;
export const COMBO_CART_MIN_MAX_STORES = 1;
export const COMBO_CART_MAX_MAX_STORES = 5;
export const COMBO_CART_DEFAULT_SHIPPING_VND = 0;
export const COMBO_CART_MAX_SHIPPING_VND = 500_000;
export const COMBO_CART_TOP_CHEAPEST_STORES = 8;
export const COMBO_CART_MAX_CANDIDATES_PER_ITEM = 14;
export const COMBO_CART_MAX_SEARCH_NODES = 50_000;

export interface ComboCartMerchantInput {
  id?: string | null;
  name?: string | null;
  platform?: string | null;
  is_official?: boolean | null;
  risk_score?: number | null;
  dosafe_risk_score?: number | null;
  review_risk_score?: number | null;
}

export interface ComboCartOfferInput {
  id?: string | null;
  platform?: string | null;
  title?: string | null;
  price_current: number;
  price_original?: number | null;
  url?: string | null;
  availability?: OfferAvailability | string | null;
  merchant?: ComboCartMerchantInput | null;
}

export interface ComboCartItemInput {
  slug: string;
  name: string;
  offers: readonly ComboCartOfferInput[];
  implausiblyLowOfferIds?: ReadonlySet<string> | readonly string[] | null;
}

export interface ComboCartOptimizeOptions {
  officialOnly?: boolean;
  minTrust?: number;
  maxStores?: number;
  shippingVndPerOrder?: number;
}

export interface ComboCartSelectedAllocation {
  itemSlug: string;
  itemName: string;
  offerId: string;
  offerTitle: string;
  offerUrl: string;
  platform: string;
  storeKey: string;
  merchantId: string | null;
  merchantName: string;
  isOfficial: boolean;
  riskScore: number | null;
  trustScore: number | null;
  priceVnd: number;
}

export interface ComboCartStoreGroup {
  storeKey: string;
  merchantId: string | null;
  merchantName: string;
  platform: string;
  isOfficial: boolean;
  riskScore: number | null;
  trustScore: number | null;
  itemCount: number;
  itemsSubtotalVnd: number;
  shippingVnd: number;
  storeTotalVnd: number;
  items: ComboCartSelectedAllocation[];
}

export interface ComboCartPlan {
  kind: 'single_store' | 'multi_store';
  distinctStoreCount: number;
  itemsSubtotalVnd: number;
  shippingVnd: number;
  totalVnd: number;
  allOfficial: boolean;
  avgTrustScore: number | null;
  allocations: ComboCartSelectedAllocation[];
  storeGroups: ComboCartStoreGroup[];
}

export interface ComboCartItemDiagnostic {
  slug: string;
  name: string;
  totalOffers: number;
  inStockValidOffers: number;
  baitExcludedCount: number;
  qualifyingOfferCount: number;
  candidateStoreCount: number;
  covered: boolean;
}

export interface ComboCartDiagnostics {
  itemCount: number;
  maxStores: number;
  minTrust: number;
  officialOnly: boolean;
  shippingVndPerOrder: number;
  searchNodesVisited: number;
  maxSearchNodes: number;
  nodeCapReached: boolean;
  candidateCapPerItem: number;
  itemDiagnostics: ComboCartItemDiagnostic[];
}

export interface ComboCartOptimizationResult {
  singleStoreBest: ComboCartPlan | null;
  multiStoreOptimal: ComboCartPlan | null;
  savingsVsSingleStoreVnd: number;
  savingsVsSingleStorePct: number;
  cheapestPerItemSubtotalVnd: number | null;
  uncoveredSlugs: string[];
  diagnostics: ComboCartDiagnostics;
}

interface NormalizedCandidateOffer {
  itemIndex: number;
  itemSlug: string;
  itemName: string;
  offerId: string;
  offerTitle: string;
  offerUrl: string;
  platform: string;
  storeKey: string;
  storeId: number;
  merchantId: string | null;
  merchantName: string;
  isOfficial: boolean;
  riskScore: number | null;
  trustScore: number | null;
  priceVnd: number;
}

function cleanText(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function cleanKeyPart(raw: unknown, maxLen = 128): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeSafeOfferUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.replace(/\p{Cc}+/gu, '').trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    if (parsed.username || parsed.password) return '';
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      !host.includes('.') ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..') ||
      host.startsWith('[') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^\d+(?:\.\d+){3}$/.test(host)
    ) {
      return '';
    }
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') {
      return '';
    }
    return trimmed;
  } catch {
    return '';
  }
}

function compareAscii(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function resolveOfferRiskScore(
  merchant: ComboCartMerchantInput | null | undefined
): number | null {
  if (!merchant || typeof merchant !== 'object' || Array.isArray(merchant)) {
    return null;
  }
  const raw = merchant.risk_score;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null;
  }
  return Math.max(0, Math.min(100, raw));
}

function computeTrustScore(riskScore: number | null): number | null {
  if (riskScore === null) return null;
  return Math.round((100 - riskScore) * 100) / 100;
}

function normalizeOfferAvailability(raw: unknown): OfferAvailability | null {
  return raw === 'in_stock' || raw === 'out_of_stock' || raw === 'discontinued'
    ? raw
    : null;
}

function isValidIntegerVndPrice(raw: unknown): raw is number {
  return (
    typeof raw === 'number' &&
    Number.isSafeInteger(raw) &&
    raw >= 1 &&
    raw <= MAX_VALID_VND_PRICE
  );
}

function normalizeOptions(options?: ComboCartOptimizeOptions): {
  officialOnly: boolean;
  minTrust: number;
  maxStores: number;
  shippingVndPerOrder: number;
} {
  const safeOpts =
    options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : {};
  const officialOnly = safeOpts.officialOnly === true;

  const rawMinTrust = safeOpts.minTrust;
  const minTrust =
    typeof rawMinTrust === 'number' && Number.isFinite(rawMinTrust)
      ? Math.max(0, Math.min(100, rawMinTrust))
      : COMBO_CART_DEFAULT_MIN_TRUST;

  const rawMaxStores = safeOpts.maxStores;
  const maxStores =
    typeof rawMaxStores === 'number' && Number.isFinite(rawMaxStores)
      ? Math.max(
          COMBO_CART_MIN_MAX_STORES,
          Math.min(COMBO_CART_MAX_MAX_STORES, Math.trunc(rawMaxStores))
        )
      : COMBO_CART_DEFAULT_MAX_STORES;

  const rawShipping = safeOpts.shippingVndPerOrder;
  const shippingVndPerOrder =
    typeof rawShipping === 'number' && Number.isFinite(rawShipping)
      ? Math.max(
          0,
          Math.min(COMBO_CART_MAX_SHIPPING_VND, Math.round(rawShipping))
        )
      : COMBO_CART_DEFAULT_SHIPPING_VND;

  return { officialOnly, minTrust, maxStores, shippingVndPerOrder };
}

function buildCombinedBaitIdSet(
  inStockOffers: readonly { id?: string | null; price_current: number }[],
  callerBaitIds: ReadonlySet<string> | readonly string[] | null | undefined
): Set<string> {
  const combined = implausiblyLowOfferIds(
    inStockOffers.map((o, idx) => ({
      id: cleanKeyPart(o.id, 256) || `anon-${idx}`,
      price_current: o.price_current,
    }))
  );
  if (callerBaitIds) {
    const iter = Array.isArray(callerBaitIds)
      ? callerBaitIds
      : typeof (callerBaitIds as ReadonlySet<string>).values === 'function'
        ? (callerBaitIds as ReadonlySet<string>).values()
        : [];
    for (const rawId of iter) {
      const normalized = normalizeOfferId(rawId);
      if (normalized) {
        combined.add(normalized);
      }
    }
  }
  return combined;
}

function compareItemOffers(
  a: Omit<NormalizedCandidateOffer, 'storeId'>,
  b: Omit<NormalizedCandidateOffer, 'storeId'>
): number {
  if (a.priceVnd !== b.priceVnd) return a.priceVnd - b.priceVnd;
  if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
  const trustDiff = (b.trustScore ?? -1) - (a.trustScore ?? -1);
  if (trustDiff !== 0) return trustDiff;
  const keyDiff = compareAscii(a.storeKey, b.storeKey);
  if (keyDiff !== 0) return keyDiff;
  return compareAscii(a.offerId, b.offerId);
}

function computeAvgTrustScore(
  allocations: readonly Pick<NormalizedCandidateOffer, 'trustScore'>[]
): number | null {
  let sum = 0;
  let count = 0;
  for (const a of allocations) {
    if (a.trustScore !== null) {
      sum += a.trustScore;
      count += 1;
    }
  }
  if (count === 0) return null;
  return Math.round((sum / count) * 100) / 100;
}

function toAllocation(
  c: NormalizedCandidateOffer
): ComboCartSelectedAllocation {
  return {
    itemSlug: c.itemSlug,
    itemName: c.itemName,
    offerId: c.offerId,
    offerTitle: c.offerTitle,
    offerUrl: c.offerUrl,
    platform: c.platform,
    storeKey: c.storeKey,
    merchantId: c.merchantId,
    merchantName: c.merchantName,
    isOfficial: c.isOfficial,
    riskScore: c.riskScore,
    trustScore: c.trustScore,
    priceVnd: c.priceVnd,
  };
}

function buildPlanFromSelections(
  kind: 'single_store' | 'multi_store',
  selectionsInItemOrder: readonly NormalizedCandidateOffer[],
  shippingVndPerOrder: number
): ComboCartPlan {
  const allocations = selectionsInItemOrder.map(toAllocation);
  const byStore = new Map<
    string,
    {
      meta: ComboCartSelectedAllocation;
      items: ComboCartSelectedAllocation[];
      itemsSubtotalVnd: number;
    }
  >();

  let itemsSubtotalVnd = 0;
  let allOfficial = true;

  for (const alloc of allocations) {
    itemsSubtotalVnd += alloc.priceVnd;
    if (!alloc.isOfficial) allOfficial = false;
    const existing = byStore.get(alloc.storeKey);
    if (existing) {
      existing.items.push(alloc);
      existing.itemsSubtotalVnd += alloc.priceVnd;
    } else {
      byStore.set(alloc.storeKey, {
        meta: alloc,
        items: [alloc],
        itemsSubtotalVnd: alloc.priceVnd,
      });
    }
  }

  const storeGroups: ComboCartStoreGroup[] = Array.from(byStore.values())
    .map((group) => ({
      storeKey: group.meta.storeKey,
      merchantId: group.meta.merchantId,
      merchantName: group.meta.merchantName,
      platform: group.meta.platform,
      isOfficial: group.meta.isOfficial,
      riskScore: group.meta.riskScore,
      trustScore: group.meta.trustScore,
      itemCount: group.items.length,
      itemsSubtotalVnd: group.itemsSubtotalVnd,
      shippingVnd: shippingVndPerOrder,
      storeTotalVnd: group.itemsSubtotalVnd + shippingVndPerOrder,
      items: group.items,
    }))
    .sort((a, b) => {
      if (b.itemsSubtotalVnd !== a.itemsSubtotalVnd) {
        return b.itemsSubtotalVnd - a.itemsSubtotalVnd;
      }
      return compareAscii(a.storeKey, b.storeKey);
    });

  const distinctStoreCount = storeGroups.length;
  const shippingVnd = distinctStoreCount * shippingVndPerOrder;
  const totalVnd = itemsSubtotalVnd + shippingVnd;

  return {
    kind,
    distinctStoreCount,
    itemsSubtotalVnd,
    shippingVnd,
    totalVnd,
    allOfficial,
    avgTrustScore: computeAvgTrustScore(selectionsInItemOrder),
    allocations,
    storeGroups,
  };
}

interface PlanComparisonMetrics {
  totalVnd: number;
  distinctStoreCount: number;
  allOfficial: boolean;
  avgTrustScore: number | null;
  canonicalKey: string;
}

function isBetterMultiPlan(
  candidate: PlanComparisonMetrics,
  incumbent: PlanComparisonMetrics | null
): boolean {
  if (!incumbent) return true;
  if (candidate.totalVnd !== incumbent.totalVnd) {
    return candidate.totalVnd < incumbent.totalVnd;
  }
  if (candidate.distinctStoreCount !== incumbent.distinctStoreCount) {
    return candidate.distinctStoreCount < incumbent.distinctStoreCount;
  }
  if (candidate.allOfficial !== incumbent.allOfficial) {
    return candidate.allOfficial;
  }
  const candTrust = candidate.avgTrustScore ?? -1;
  const incTrust = incumbent.avgTrustScore ?? -1;
  if (candTrust !== incTrust) {
    return candTrust > incTrust;
  }
  return compareAscii(candidate.canonicalKey, incumbent.canonicalKey) < 0;
}

function canonicalAllocationKey(
  selectionsInItemOrder: readonly NormalizedCandidateOffer[]
): string {
  return selectionsInItemOrder
    .map((s) => `${s.storeKey}:${s.offerId}`)
    .join('|');
}

/**
 * Solves exact single-store and bounded multi-store optimal purchasing plans
 * across 2 to 5 distinct items using deterministic branch-and-bound pruning.
 */
export function optimizeComboCart(
  rawItems: readonly ComboCartItemInput[],
  options?: ComboCartOptimizeOptions
): ComboCartOptimizationResult {
  if (!Array.isArray(rawItems)) {
    throw new RangeError(
      'Combo cart optimizer requires an array of 2 to 5 items.'
    );
  }

  const seenSlugs = new Set<string>();
  const items: ComboCartItemInput[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const slug = cleanKeyPart(item.slug, 160);
    if (!slug) continue;
    const lowerSlug = slug.toLowerCase();
    if (seenSlugs.has(lowerSlug)) continue;
    seenSlugs.add(lowerSlug);
    items.push({
      ...item,
      slug,
      name: cleanText(item.name, 240) || slug,
    });
  }

  if (
    items.length < COMBO_CART_MIN_ITEMS ||
    items.length > COMBO_CART_MAX_ITEMS
  ) {
    throw new RangeError(
      `Combo cart optimizer requires ${COMBO_CART_MIN_ITEMS} to ${COMBO_CART_MAX_ITEMS} distinct items.`
    );
  }

  const { officialOnly, minTrust, maxStores, shippingVndPerOrder } =
    normalizeOptions(options);
  const maxAllowedRiskScaled = Math.round((100 - minTrust) * 1_000_000);

  const storeKeyToId = new Map<string, number>();
  const getStoreId = (storeKey: string): number => {
    const existing = storeKeyToId.get(storeKey);
    if (existing !== undefined) return existing;
    const next = storeKeyToId.size;
    storeKeyToId.set(storeKey, next);
    return next;
  };

  const dedupedPerItem: Map<string, NormalizedCandidateOffer>[] = [];
  const sortedOffersPerItem: NormalizedCandidateOffer[][] = [];
  const itemDiagnostics: ComboCartItemDiagnostic[] = [];
  const uncoveredSlugs: string[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex]!;
    const rawOffers = Array.isArray(item.offers) ? item.offers : [];

    // Compute in-stock market pool first before trust/official filters so bait
    // detection reflects the true marketplace distribution for this item.
    const inStockValidOffers: ComboCartOfferInput[] = [];
    for (const offer of rawOffers) {
      if (!offer || typeof offer !== 'object' || Array.isArray(offer)) continue;
      const avail = normalizeOfferAvailability(offer.availability);
      if (isOfferUnavailable({ availability: avail })) continue;
      if (!isValidIntegerVndPrice(offer.price_current)) continue;
      inStockValidOffers.push({ ...offer, availability: avail });
    }

    const baitIdSet = buildCombinedBaitIdSet(
      inStockValidOffers,
      item.implausiblyLowOfferIds
    );

    const bestByStore = new Map<
      string,
      Omit<NormalizedCandidateOffer, 'storeId'>
    >();
    let baitExcludedCount = 0;

    for (let idx = 0; idx < inStockValidOffers.length; idx++) {
      const offer = inStockValidOffers[idx]!;
      const isExplicitCallerBait = hasImplausiblyLowOfferId(
        baitIdSet,
        offer.id
      );
      const isBait =
        isExplicitCallerBait ||
        isOfferImplausiblyLowAgainstInStock(
          offer,
          inStockValidOffers,
          baitIdSet
        );
      if (isBait) {
        baitExcludedCount += 1;
        continue;
      }

      const merchant =
        offer.merchant &&
        typeof offer.merchant === 'object' &&
        !Array.isArray(offer.merchant)
          ? offer.merchant
          : null;
      const isOfficial = merchant?.is_official === true;
      if (officialOnly && !isOfficial) {
        continue;
      }

      const riskScore = resolveOfferRiskScore(merchant);
      if (minTrust > 0) {
        if (
          riskScore === null ||
          Math.round(riskScore * 1_000_000) > maxAllowedRiskScaled
        ) {
          continue;
        }
      }

      const cleanPlatform =
        cleanKeyPart(merchant?.platform ?? offer.platform, 40).toLowerCase() ||
        'shopee';
      const cleanMerchantId = cleanKeyPart(merchant?.id, 128);
      const cleanOfferId =
        cleanKeyPart(offer.id, 128) || `offer-${itemIndex}-${idx + 1}`;
      const storeKey = cleanMerchantId || cleanPlatform;
      const cleanMerchantName =
        cleanText(merchant?.name, 160) || cleanPlatform.toUpperCase();

      const candidate: Omit<NormalizedCandidateOffer, 'storeId'> = {
        itemIndex,
        itemSlug: item.slug,
        itemName: item.name,
        offerId: cleanOfferId,
        offerTitle: cleanText(offer.title, 320) || item.name,
        offerUrl: sanitizeSafeOfferUrl(offer.url),
        platform: cleanPlatform,
        storeKey,
        merchantId: cleanMerchantId || null,
        merchantName: cleanMerchantName,
        isOfficial,
        riskScore,
        trustScore: computeTrustScore(riskScore),
        priceVnd: offer.price_current,
      };

      const existing = bestByStore.get(storeKey);
      if (!existing || compareItemOffers(candidate, existing) < 0) {
        bestByStore.set(storeKey, candidate);
      }
    }

    const dedupedSorted = Array.from(bestByStore.values())
      .sort(compareItemOffers)
      .map((entry) => ({
        ...entry,
        storeId: getStoreId(entry.storeKey),
      }));

    const itemMap = new Map<string, NormalizedCandidateOffer>();
    for (const c of dedupedSorted) {
      itemMap.set(c.storeKey, c);
    }

    dedupedPerItem.push(itemMap);
    sortedOffersPerItem.push(dedupedSorted);
    if (dedupedSorted.length === 0) {
      uncoveredSlugs.push(item.slug);
    }

    itemDiagnostics.push({
      slug: item.slug,
      name: item.name,
      totalOffers: rawOffers.length,
      inStockValidOffers: inStockValidOffers.length,
      baitExcludedCount,
      qualifyingOfferCount: dedupedSorted.length,
      candidateStoreCount: 0,
      covered: dedupedSorted.length > 0,
    });
  }

  const allItemsCovered = uncoveredSlugs.length === 0;
  const cheapestPerItemSubtotalVnd = allItemsCovered
    ? sortedOffersPerItem.reduce((sum, list) => sum + list[0]!.priceVnd, 0)
    : null;

  // Plan A: exact intersection of stores carrying all k items
  let singleStoreBest: ComboCartPlan | null = null;
  let singleStoreBestMetrics: {
    storeKey: string;
    totalVnd: number;
    allOfficial: boolean;
    avgTrustScore: number | null;
    selections: NormalizedCandidateOffer[];
  } | null = null;

  if (allItemsCovered) {
    const firstItemStores = sortedOffersPerItem[0]!;
    for (const firstOffer of firstItemStores) {
      const storeKey = firstOffer.storeKey;
      const selections: NormalizedCandidateOffer[] = [firstOffer];
      let coversAll = true;
      let subtotal = firstOffer.priceVnd;
      let allOfficial = firstOffer.isOfficial;

      for (let i = 1; i < items.length; i++) {
        const match = dedupedPerItem[i]!.get(storeKey);
        if (!match) {
          coversAll = false;
          break;
        }
        selections.push(match);
        subtotal += match.priceVnd;
        if (!match.isOfficial) allOfficial = false;
      }

      if (!coversAll) continue;
      const totalVnd = subtotal + shippingVndPerOrder;
      const avgTrustScore = computeAvgTrustScore(selections);

      const isBetterSingle =
        !singleStoreBestMetrics ||
        totalVnd < singleStoreBestMetrics.totalVnd ||
        (totalVnd === singleStoreBestMetrics.totalVnd &&
          (allOfficial !== singleStoreBestMetrics.allOfficial
            ? allOfficial
            : (avgTrustScore ?? -1) !==
                (singleStoreBestMetrics.avgTrustScore ?? -1)
              ? (avgTrustScore ?? -1) >
                (singleStoreBestMetrics.avgTrustScore ?? -1)
              : compareAscii(storeKey, singleStoreBestMetrics.storeKey) < 0));

      if (isBetterSingle) {
        singleStoreBestMetrics = {
          storeKey,
          totalVnd,
          allOfficial,
          avgTrustScore,
          selections,
        };
      }
    }

    if (singleStoreBestMetrics) {
      singleStoreBest = buildPlanFromSelections(
        'single_store',
        singleStoreBestMetrics.selections,
        shippingVndPerOrder
      );
    }
  }

  // Count how many items each store carries for Plan B candidate selection
  const storeItemFrequency = new Map<string, number>();
  for (const itemMap of dedupedPerItem) {
    for (const storeKey of itemMap.keys()) {
      storeItemFrequency.set(
        storeKey,
        (storeItemFrequency.get(storeKey) ?? 0) + 1
      );
    }
  }

  const candidateOffersPerItem: NormalizedCandidateOffer[][] = [];
  for (let i = 0; i < items.length; i++) {
    const sorted = sortedOffersPerItem[i]!;
    const picked = new Set<string>();
    const combined: NormalizedCandidateOffer[] = [];

    for (
      let idx = 0;
      idx < sorted.length && combined.length < COMBO_CART_TOP_CHEAPEST_STORES;
      idx++
    ) {
      const offer = sorted[idx]!;
      picked.add(offer.storeKey);
      combined.push(offer);
    }

    for (
      let idx = 0;
      idx < sorted.length &&
      combined.length < COMBO_CART_MAX_CANDIDATES_PER_ITEM;
      idx++
    ) {
      const offer = sorted[idx]!;
      if (picked.has(offer.storeKey)) continue;
      if ((storeItemFrequency.get(offer.storeKey) ?? 0) >= 2) {
        picked.add(offer.storeKey);
        combined.push(offer);
      }
    }

    candidateOffersPerItem.push(combined);
    itemDiagnostics[i]!.candidateStoreCount = combined.length;
  }

  // Plan B: exact bounded branch-and-bound solver
  let multiStoreOptimal: ComboCartPlan | null = null;
  let searchNodesVisited = 0;
  let nodeCapReached = false;

  if (allItemsCovered) {
    let bestSelections: NormalizedCandidateOffer[] | null = null;
    let bestMetrics: PlanComparisonMetrics | null = null;

    if (singleStoreBestMetrics && maxStores >= 1) {
      bestSelections = singleStoreBestMetrics.selections;
      bestMetrics = {
        totalVnd: singleStoreBestMetrics.totalVnd,
        distinctStoreCount: 1,
        allOfficial: singleStoreBestMetrics.allOfficial,
        avgTrustScore: singleStoreBestMetrics.avgTrustScore,
        canonicalKey: canonicalAllocationKey(singleStoreBestMetrics.selections),
      };
    }

    // Order items by fewest candidates first (MRV) for tighter branch-and-bound pruning
    const searchOrder = items
      .map((_, index) => index)
      .sort((a, b) => {
        const lenDiff =
          candidateOffersPerItem[a]!.length - candidateOffersPerItem[b]!.length;
        return lenDiff !== 0 ? lenDiff : a - b;
      });

    const k = searchOrder.length;
    const orderedCandidates = searchOrder.map(
      (origIdx) => candidateOffersPerItem[origIdx]!
    );
    const suffixMinPrices = new Array<number>(k + 1).fill(0);
    for (let d = k - 1; d >= 0; d--) {
      suffixMinPrices[d] =
        suffixMinPrices[d + 1]! + orderedCandidates[d]![0]!.priceVnd;
    }

    const totalStores = storeKeyToId.size;
    const storeFreq = new Int32Array(totalStores);
    const currentBySearchDepth = new Array<NormalizedCandidateOffer | null>(
      k
    ).fill(null);

    const dfs = (
      depth: number,
      currentSubtotal: number,
      distinctStores: number
    ): void => {
      if (searchNodesVisited >= COMBO_CART_MAX_SEARCH_NODES) {
        nodeCapReached = true;
        return;
      }
      searchNodesVisited += 1;

      if (depth === k) {
        const selectionsInItemOrder = new Array<NormalizedCandidateOffer>(k);
        for (let d = 0; d < k; d++) {
          const picked = currentBySearchDepth[d]!;
          selectionsInItemOrder[picked.itemIndex] = picked;
        }
        const totalVnd = currentSubtotal + distinctStores * shippingVndPerOrder;
        const allOfficial = selectionsInItemOrder.every((s) => s.isOfficial);
        const avgTrustScore = computeAvgTrustScore(selectionsInItemOrder);
        const candidateMetrics: PlanComparisonMetrics = {
          totalVnd,
          distinctStoreCount: distinctStores,
          allOfficial,
          avgTrustScore,
          canonicalKey: canonicalAllocationKey(selectionsInItemOrder),
        };
        if (isBetterMultiPlan(candidateMetrics, bestMetrics)) {
          bestMetrics = candidateMetrics;
          bestSelections = selectionsInItemOrder;
        }
        return;
      }

      // Compute admissible lower bound for remaining depth..k-1
      let lowerBoundTotal: number;
      if (distinctStores === maxStores) {
        let remMinCost = 0;
        for (let j = depth; j < k; j++) {
          let minUsedPrice = -1;
          for (const cand of orderedCandidates[j]!) {
            if (storeFreq[cand.storeId]! > 0) {
              minUsedPrice = cand.priceVnd;
              break; // orderedCandidates[j] is sorted by priceVnd ascending
            }
          }
          if (minUsedPrice < 0) {
            return; // Impossible to complete without exceeding maxStores
          }
          remMinCost += minUsedPrice;
        }
        lowerBoundTotal =
          currentSubtotal + remMinCost + distinctStores * shippingVndPerOrder;
      } else {
        let needsNewStore = distinctStores === 0;
        if (!needsNewStore) {
          for (let j = depth; j < k; j++) {
            let hasUsed = false;
            for (const cand of orderedCandidates[j]!) {
              if (storeFreq[cand.storeId]! > 0) {
                hasUsed = true;
                break;
              }
            }
            if (!hasUsed) {
              needsNewStore = true;
              break;
            }
          }
        }
        const minStoresNeeded = distinctStores + (needsNewStore ? 1 : 0);
        if (minStoresNeeded > maxStores) {
          return;
        }
        lowerBoundTotal =
          currentSubtotal +
          suffixMinPrices[depth]! +
          minStoresNeeded * shippingVndPerOrder;
      }

      if (bestMetrics !== null && lowerBoundTotal > bestMetrics.totalVnd) {
        return;
      }

      const candidates = orderedCandidates[depth]!;
      const remSuffix = suffixMinPrices[depth + 1]!;

      for (let idx = 0; idx < candidates.length; idx++) {
        if (searchNodesVisited >= COMBO_CART_MAX_SEARCH_NODES) {
          nodeCapReached = true;
          return;
        }
        const cand = candidates[idx]!;
        const prevCount = storeFreq[cand.storeId]!;
        const nextDistinct = distinctStores + (prevCount === 0 ? 1 : 0);
        if (nextDistinct > maxStores) {
          continue;
        }
        const nextSubtotal = currentSubtotal + cand.priceVnd;
        const childMinTotal =
          nextSubtotal + remSuffix + nextDistinct * shippingVndPerOrder;
        if (bestMetrics !== null && childMinTotal > bestMetrics.totalVnd) {
          continue;
        }

        storeFreq[cand.storeId] = prevCount + 1;
        currentBySearchDepth[depth] = cand;
        dfs(depth + 1, nextSubtotal, nextDistinct);
        currentBySearchDepth[depth] = null;
        storeFreq[cand.storeId] = prevCount;
      }
    };

    dfs(0, 0, 0);

    if (bestSelections) {
      multiStoreOptimal = buildPlanFromSelections(
        'multi_store',
        bestSelections,
        shippingVndPerOrder
      );
    }
  }

  const savingsVsSingleStoreVnd =
    singleStoreBest && multiStoreOptimal
      ? Math.max(0, singleStoreBest.totalVnd - multiStoreOptimal.totalVnd)
      : 0;
  const savingsVsSingleStorePct =
    singleStoreBest &&
    multiStoreOptimal &&
    singleStoreBest.totalVnd > 0 &&
    savingsVsSingleStoreVnd > 0
      ? Math.round(
          (savingsVsSingleStoreVnd / singleStoreBest.totalVnd) * 1000
        ) / 10
      : 0;

  return {
    singleStoreBest,
    multiStoreOptimal,
    savingsVsSingleStoreVnd,
    savingsVsSingleStorePct,
    cheapestPerItemSubtotalVnd,
    uncoveredSlugs,
    diagnostics: {
      itemCount: items.length,
      maxStores,
      minTrust,
      officialOnly,
      shippingVndPerOrder,
      searchNodesVisited,
      maxSearchNodes: COMBO_CART_MAX_SEARCH_NODES,
      nodeCapReached,
      candidateCapPerItem: COMBO_CART_MAX_CANDIDATES_PER_ITEM,
      itemDiagnostics,
    },
  };
}
