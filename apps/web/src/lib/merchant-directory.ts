import type { MerchantSummary } from './rate-domain';

// Filters, sort and paging of the /merchants directory, shared by the page,
// its API (/api/v1/rate/merchants/directory) and the explorer. The page and
// the explorer used to ship and filter every store client-side (DOS/Rate#452).

/** Stores per directory page (initial render and each "show more"). */
export const MERCHANT_PAGE_SIZE = 48;

export type MerchantSortOption =
  'trust_desc' | 'products_desc' | 'seeding_asc' | 'followers_desc';
export type MerchantRiskTier = 'all' | 'safe' | 'moderate' | 'warning';
export type MerchantSeedingTier = 'all' | 'low' | 'elevated';

export interface MerchantDirectoryFilters {
  query: string;
  platform: string;
  officialOnly: boolean;
  riskTier: MerchantRiskTier;
  seedingTier: MerchantSeedingTier;
  sortBy: MerchantSortOption;
}

export const DEFAULT_MERCHANT_DIRECTORY_FILTERS: MerchantDirectoryFilters = {
  query: '',
  platform: 'all',
  officialOnly: false,
  riskTier: 'all',
  seedingTier: 'all',
  sortBy: 'trust_desc',
};

/** Stats over the whole directory; they do not change with the filters. */
export interface MerchantDirectorySummary {
  total: number;
  official: number;
  safe: number;
  avgTrust: number;
  platformCounts: Record<string, number>;
}

export interface MerchantDirectoryPage {
  items: MerchantSummary[];
  /** Stores matching the filters, across all pages. */
  matched: number;
  offset: number;
}

const SORTS: readonly MerchantSortOption[] = [
  'trust_desc',
  'products_desc',
  'seeding_asc',
  'followers_desc',
];
const RISK_TIERS: readonly MerchantRiskTier[] = [
  'all',
  'safe',
  'moderate',
  'warning',
];
const SEEDING_TIERS: readonly MerchantSeedingTier[] = [
  'all',
  'low',
  'elevated',
];

/** Parses filters from URL search params, falling back to the defaults. */
export function parseMerchantDirectoryFilters(
  get: (key: string) => string | null | undefined
): MerchantDirectoryFilters {
  const pick = <T extends string>(
    raw: string | null | undefined,
    allowed: readonly T[],
    fallback: T
  ): T => {
    const v = (raw ?? '').trim().toLowerCase() as T;
    return allowed.includes(v) ? v : fallback;
  };
  const official = (get('official') ?? get('officialOnly') ?? '').toLowerCase();
  return {
    query: (get('q') ?? '').trim().slice(0, 160),
    platform:
      (get('platform') ?? 'all').trim().toLowerCase().slice(0, 40) || 'all',
    officialOnly: official === 'true' || official === '1',
    riskTier: pick(get('risk'), RISK_TIERS, 'all'),
    seedingTier: pick(get('seeding'), SEEDING_TIERS, 'all'),
    sortBy: pick(get('sort'), SORTS, 'trust_desc'),
  };
}

/** Search params for `filters`, omitting defaults. */
export function merchantDirectoryFilterParams(
  filters: MerchantDirectoryFilters
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.platform !== 'all') params.set('platform', filters.platform);
  if (filters.officialOnly) params.set('official', 'true');
  if (filters.riskTier !== 'all') params.set('risk', filters.riskTier);
  if (filters.seedingTier !== 'all') params.set('seeding', filters.seedingTier);
  if (filters.sortBy !== 'trust_desc') params.set('sort', filters.sortBy);
  return params;
}

export function summarizeMerchantDirectory(
  merchants: readonly MerchantSummary[]
): MerchantDirectorySummary {
  const platformCounts: Record<string, number> = {};
  let official = 0;
  let safe = 0;
  let trustSum = 0;
  for (const m of merchants) {
    const p = m.platform.toLowerCase();
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
    if (m.is_official) official += 1;
    if (m.trust_score >= 80) safe += 1;
    trustSum += m.trust_score;
  }
  const total = merchants.length;
  return {
    total,
    official,
    safe,
    avgTrust: total > 0 ? Math.round(trustSum / total) : 100,
    platformCounts,
  };
}

/** Every store matching `filters`, in the chosen order. */
export function filterMerchantDirectory(
  merchants: readonly MerchantSummary[],
  filters: MerchantDirectoryFilters
): MerchantSummary[] {
  const { platform, officialOnly, riskTier, seedingTier, sortBy } = filters;
  const kw = filters.query.trim().toLowerCase();
  const filtered = merchants.filter((m) => {
    if (platform !== 'all' && m.platform.toLowerCase() !== platform) {
      return false;
    }
    if (officialOnly && !m.is_official) return false;
    if (riskTier === 'safe' && m.trust_score < 80) return false;
    if (
      riskTier === 'moderate' &&
      (m.trust_score < 60 || m.trust_score >= 80)
    ) {
      return false;
    }
    if (riskTier === 'warning' && m.trust_score >= 60) return false;
    if (seedingTier === 'low' && m.review_risk_score > 15) return false;
    if (seedingTier === 'elevated' && m.review_risk_score <= 15) return false;
    if (kw) {
      const hit =
        m.name.toLowerCase().includes(kw) ||
        m.platform_shop_id.toLowerCase().includes(kw) ||
        m.platform.toLowerCase().includes(kw) ||
        (m.slug ? m.slug.toLowerCase().includes(kw) : false);
      if (!hit) return false;
    }
    return true;
  });
  return filtered.sort((a, b) => {
    switch (sortBy) {
      case 'trust_desc':
        return (
          b.trust_score - a.trust_score || b.product_count - a.product_count
        );
      case 'products_desc':
        return (
          b.product_count - a.product_count || b.trust_score - a.trust_score
        );
      case 'seeding_asc':
        return (
          a.review_risk_score - b.review_risk_score ||
          b.trust_score - a.trust_score
        );
      case 'followers_desc':
        return (
          b.follower_count - a.follower_count || b.trust_score - a.trust_score
        );
      default:
        return 0;
    }
  });
}

/** One page of the filtered directory. */
export function pageMerchantDirectory(
  merchants: readonly MerchantSummary[],
  filters: MerchantDirectoryFilters,
  offset: number,
  limit: number
): MerchantDirectoryPage {
  const matching = filterMerchantDirectory(merchants, filters);
  const start = Math.max(0, Math.floor(offset));
  return {
    items: matching.slice(start, start + Math.max(0, Math.floor(limit))),
    matched: matching.length,
    offset: start,
  };
}
