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

const SAFE_PLATFORM_FILTER_REGEX = /^[a-z0-9_-]{1,40}$/;

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
  const rawPlatform = (get('platform') ?? 'all')
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  const platform = SAFE_PLATFORM_FILTER_REGEX.test(rawPlatform)
    ? rawPlatform
    : 'all';
  return {
    query: (get('q') ?? '')
      .replace(/\p{Cc}+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160),
    platform,
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
  const safeQuery = (typeof filters.query === 'string' ? filters.query : '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  if (safeQuery) params.set('q', safeQuery);
  const safePlatform = (
    typeof filters.platform === 'string' ? filters.platform : 'all'
  )
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  if (safePlatform !== 'all' && SAFE_PLATFORM_FILTER_REGEX.test(safePlatform)) {
    params.set('platform', safePlatform);
  }
  if (filters.officialOnly) params.set('official', 'true');
  if (RISK_TIERS.includes(filters.riskTier) && filters.riskTier !== 'all') {
    params.set('risk', filters.riskTier);
  }
  if (
    SEEDING_TIERS.includes(filters.seedingTier) &&
    filters.seedingTier !== 'all'
  ) {
    params.set('seeding', filters.seedingTier);
  }
  if (SORTS.includes(filters.sortBy) && filters.sortBy !== 'trust_desc') {
    params.set('sort', filters.sortBy);
  }
  return params;
}

function toSafeScore100(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
}

function toSafeCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function summarizeMerchantDirectory(
  merchants: readonly MerchantSummary[]
): MerchantDirectorySummary {
  const platformCounts: Record<string, number> = {};
  let official = 0;
  let safe = 0;
  let trustSum = 0;
  for (const m of merchants) {
    const p = (m.platform || '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase();
    if (
      SAFE_PLATFORM_FILTER_REGEX.test(p) &&
      p !== '__proto__' &&
      p !== 'constructor' &&
      p !== 'prototype'
    ) {
      const prev = Object.hasOwn(platformCounts, p)
        ? (platformCounts[p] ?? 0)
        : 0;
      platformCounts[p] = prev + 1;
    }
    if (m.is_official) official += 1;
    const trustScore = toSafeScore100(m.trust_score);
    if (trustScore >= 80) safe += 1;
    trustSum += trustScore;
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
  const kw = (typeof filters.query === 'string' ? filters.query : '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    .toLowerCase();
  const filtered = merchants.filter((m) => {
    if (platform !== 'all' && (m.platform || '').toLowerCase() !== platform) {
      return false;
    }
    if (officialOnly && !m.is_official) return false;
    const trustScore = toSafeScore100(m.trust_score);
    const reviewRiskScore = toSafeScore100(m.review_risk_score);
    if (riskTier === 'safe' && trustScore < 80) return false;
    if (riskTier === 'moderate' && (trustScore < 60 || trustScore >= 80)) {
      return false;
    }
    if (riskTier === 'warning' && trustScore >= 60) return false;
    if (seedingTier === 'low' && reviewRiskScore > 15) return false;
    if (seedingTier === 'elevated' && reviewRiskScore <= 15) return false;
    if (kw) {
      const hit =
        (m.name || '').toLowerCase().includes(kw) ||
        (m.platform_shop_id || '').toLowerCase().includes(kw) ||
        (m.platform || '').toLowerCase().includes(kw) ||
        (m.slug ? m.slug.toLowerCase().includes(kw) : false);
      if (!hit) return false;
    }
    return true;
  });
  return filtered.sort((a, b) => {
    const aTrust = toSafeScore100(a.trust_score);
    const bTrust = toSafeScore100(b.trust_score);
    const aProducts = toSafeCount(a.product_count);
    const bProducts = toSafeCount(b.product_count);
    switch (sortBy) {
      case 'trust_desc':
        return bTrust - aTrust || bProducts - aProducts;
      case 'products_desc':
        return bProducts - aProducts || bTrust - aTrust;
      case 'seeding_asc':
        return (
          toSafeScore100(a.review_risk_score) -
            toSafeScore100(b.review_risk_score) || bTrust - aTrust
        );
      case 'followers_desc':
        return (
          toSafeCount(b.follower_count) - toSafeCount(a.follower_count) ||
          bTrust - aTrust
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
  const start = Number.isFinite(offset) && offset >= 0 ? Math.floor(offset) : 0;
  const safeLimit =
    Number.isFinite(limit) && limit >= 0
      ? Math.min(500, Math.floor(limit))
      : MERCHANT_PAGE_SIZE;
  return {
    items: matching.slice(start, start + safeLimit),
    matched: matching.length,
    offset: start,
  };
}
