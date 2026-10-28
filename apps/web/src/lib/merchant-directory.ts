import type { MerchantSummary } from './rate-domain';
import { hasReviewRiskEvidence } from './merchant-risk-tone';

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

const SAFE_PLATFORM_FILTER_REGEX = /^(?=.*[a-z0-9])[a-z0-9_-]{1,40}$/;
const MAX_MERCHANT_DIRECTORY_SCAN = 5_000;

function isValidMerchantPlatform(raw: string): boolean {
  return (
    SAFE_PLATFORM_FILTER_REGEX.test(raw) &&
    !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i.test(
      raw
    )
  );
}

function isOfficialMerchantFlag(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    (typeof value === 'string' && value.trim().toLowerCase() === 'true')
  );
}

/** Parses filters from URL search params, falling back to the defaults. */
export function parseMerchantDirectoryFilters(
  get: (key: string) => string | null | undefined
): MerchantDirectoryFilters {
  if (typeof get !== 'function') {
    return { ...DEFAULT_MERCHANT_DIRECTORY_FILTERS };
  }
  const safeGet = (key: string): string => {
    const raw = get(key);
    return typeof raw === 'string' ? raw : '';
  };
  const pick = <T extends string>(
    raw: string | null | undefined,
    allowed: readonly T[],
    fallback: T
  ): T => {
    const v = (typeof raw === 'string' ? raw : '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase() as T;
    return allowed.includes(v) ? v : fallback;
  };
  const official = (safeGet('official') || safeGet('officialOnly'))
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  const rawPlatform = (safeGet('platform') || 'all')
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  const platform =
    rawPlatform !== 'all' && isValidMerchantPlatform(rawPlatform)
      ? rawPlatform
      : 'all';
  return {
    query: safeGet('q')
      .replace(/\p{Cc}+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160),
    platform,
    officialOnly: official === 'true' || official === '1',
    riskTier: pick(safeGet('risk'), RISK_TIERS, 'all'),
    seedingTier: pick(safeGet('seeding'), SEEDING_TIERS, 'all'),
    sortBy: pick(safeGet('sort'), SORTS, 'trust_desc'),
  };
}

/** Search params for `filters`, omitting defaults. */
export function merchantDirectoryFilterParams(
  filters: MerchantDirectoryFilters
): URLSearchParams {
  const params = new URLSearchParams();
  const safeFilters =
    filters && typeof filters === 'object' && !Array.isArray(filters)
      ? filters
      : DEFAULT_MERCHANT_DIRECTORY_FILTERS;
  const safeQuery = (
    typeof safeFilters.query === 'string' ? safeFilters.query : ''
  )
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  if (safeQuery) params.set('q', safeQuery);
  const safePlatform = (
    typeof safeFilters.platform === 'string' ? safeFilters.platform : 'all'
  )
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  if (safePlatform !== 'all' && isValidMerchantPlatform(safePlatform)) {
    params.set('platform', safePlatform);
  }
  if (safeFilters.officialOnly === true) params.set('official', 'true');
  if (
    RISK_TIERS.includes(safeFilters.riskTier) &&
    safeFilters.riskTier !== 'all'
  ) {
    params.set('risk', safeFilters.riskTier);
  }
  if (
    SEEDING_TIERS.includes(safeFilters.seedingTier) &&
    safeFilters.seedingTier !== 'all'
  ) {
    params.set('seeding', safeFilters.seedingTier);
  }
  if (
    SORTS.includes(safeFilters.sortBy) &&
    safeFilters.sortBy !== 'trust_desc'
  ) {
    params.set('sort', safeFilters.sortBy);
  }
  return params;
}

function toSafeScore100(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  let n = Number.NaN;
  if (typeof value === 'number') {
    n = value;
  } else {
    const cleaned = value.replace(/\p{Cc}+/gu, '').trim();
    if (
      cleaned.length > 0 &&
      cleaned.length <= 32 &&
      !/^[+-]?0[xbo]/i.test(cleaned)
    ) {
      n = Number(cleaned);
    }
  }
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
}

function toSafeCount(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  let n = Number.NaN;
  if (typeof value === 'number') {
    n = value;
  } else {
    const cleaned = value.replace(/\p{Cc}+/gu, '').trim();
    if (
      cleaned.length > 0 &&
      cleaned.length <= 32 &&
      !/^[+-]?0[xbo]/i.test(cleaned)
    ) {
      n = Number(cleaned);
    }
  }
  return Number.isFinite(n) && n > 0 ? Math.min(100_000_000, Math.floor(n)) : 0;
}

export function summarizeMerchantDirectory(
  merchants: readonly MerchantSummary[]
): MerchantDirectorySummary {
  const safeMerchants = Array.isArray(merchants)
    ? merchants
        .filter((m): m is MerchantSummary =>
          Boolean(m && typeof m === 'object' && !Array.isArray(m))
        )
        .slice(0, MAX_MERCHANT_DIRECTORY_SCAN)
    : [];
  const platformCounts: Record<string, number> = {};
  let official = 0;
  let safe = 0;
  let trustSum = 0;
  for (const m of safeMerchants) {
    const p = (typeof m.platform === 'string' ? m.platform : '')
      .replace(/\p{Cc}+/gu, '')
      .trim()
      .toLowerCase();
    if (isValidMerchantPlatform(p)) {
      const prev = Object.hasOwn(platformCounts, p)
        ? (platformCounts[p] ?? 0)
        : 0;
      platformCounts[p] = prev + 1;
    }
    if (isOfficialMerchantFlag(m.is_official)) official += 1;
    const trustScore = toSafeScore100(m.trust_score);
    if (trustScore >= 80) safe += 1;
    trustSum += trustScore;
  }
  const total = safeMerchants.length;
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
  const safeMerchants = Array.isArray(merchants)
    ? merchants
        .filter((m): m is MerchantSummary =>
          Boolean(m && typeof m === 'object' && !Array.isArray(m))
        )
        .slice(0, MAX_MERCHANT_DIRECTORY_SCAN)
    : [];
  const safeFilters =
    filters && typeof filters === 'object' && !Array.isArray(filters)
      ? filters
      : DEFAULT_MERCHANT_DIRECTORY_FILTERS;
  const rawPlatform = (
    typeof safeFilters.platform === 'string' ? safeFilters.platform : 'all'
  )
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase();
  const platform =
    rawPlatform !== 'all' && isValidMerchantPlatform(rawPlatform)
      ? rawPlatform
      : 'all';
  const officialOnly = safeFilters.officialOnly === true;
  const riskTier = RISK_TIERS.includes(safeFilters.riskTier)
    ? safeFilters.riskTier
    : 'all';
  const seedingTier = SEEDING_TIERS.includes(safeFilters.seedingTier)
    ? safeFilters.seedingTier
    : 'all';
  const sortBy = SORTS.includes(safeFilters.sortBy)
    ? safeFilters.sortBy
    : 'trust_desc';
  const kw = (typeof safeFilters.query === 'string' ? safeFilters.query : '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
    .toLowerCase();
  const toCleanLower = (val: unknown): string =>
    typeof val === 'string'
      ? val
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase()
      : '';
  const filtered = safeMerchants.filter((m) => {
    const mPlatform =
      typeof m.platform === 'string'
        ? m.platform
            .replace(/\p{Cc}+/gu, '')
            .trim()
            .toLowerCase()
        : '';
    if (platform !== 'all' && mPlatform !== platform) {
      return false;
    }
    if (officialOnly && !isOfficialMerchantFlag(m.is_official)) return false;
    const trustScore = toSafeScore100(m.trust_score);
    const reviewRiskScore = toSafeScore100(m.review_risk_score);
    // A store with no analysed reviews has no measured review risk: it
    // matches neither review tier (DOS/Rate#1249).
    const reviewRiskKnown = hasReviewRiskEvidence(m.review_risk_breakdown);
    if (riskTier === 'safe' && trustScore < 80) return false;
    if (riskTier === 'moderate' && (trustScore < 60 || trustScore >= 80)) {
      return false;
    }
    if (riskTier === 'warning' && trustScore >= 60) return false;
    if (seedingTier === 'low' && (!reviewRiskKnown || reviewRiskScore > 15)) {
      return false;
    }
    if (
      seedingTier === 'elevated' &&
      (!reviewRiskKnown || reviewRiskScore <= 15)
    ) {
      return false;
    }
    if (kw) {
      const hit =
        toCleanLower(m.name).includes(kw) ||
        toCleanLower(m.platform_shop_id).includes(kw) ||
        mPlatform.includes(kw) ||
        toCleanLower(m.slug).includes(kw);
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
        // Measured scores first: no reviews is not the lowest risk (#1249).
        return (
          Number(!hasReviewRiskEvidence(a.review_risk_breakdown)) -
            Number(!hasReviewRiskEvidence(b.review_risk_breakdown)) ||
          toSafeScore100(a.review_risk_score) -
            toSafeScore100(b.review_risk_score) ||
          bTrust - aTrust
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
  const start =
    typeof offset === 'number' && Number.isFinite(offset) && offset >= 0
      ? Math.min(100_000, Math.floor(offset))
      : 0;
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
      ? Math.min(500, Math.floor(limit))
      : MERCHANT_PAGE_SIZE;
  return {
    items: matching.slice(start, start + safeLimit),
    matched: matching.length,
    offset: start,
  };
}
