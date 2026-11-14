import {
  POINT_AI_WEIGHT_SHARE,
  POINT_WRITER_SHARE_CAP,
  PRODUCT_CRITERION_POINTS_MAX,
  PRODUCT_POINTS_MAX,
  getRatingCriteria,
  hasRatingCriteria,
  type LegacyCriterionKey,
  type RatingCriterionKey,
} from '@repo/shared-data/rules';

export const PRODUCT_POINTS_OVERALL_MAX = PRODUCT_POINTS_MAX;
export const PRODUCT_POINTS_CRITERION_MAX = PRODUCT_CRITERION_POINTS_MAX;

export type ProductPointMethod = 'ai' | 'code';
export type ProductPointKind = 'pro' | 'con';

/** Row shape read from `rate.product_points`. */
export interface StoredProductPointRow {
  id: string;
  master_id?: string;
  criterion_key: string | null;
  kind: string;
  label: string;
  support: number | string;
  reviewer_count: number | string;
  has_expert: boolean;
  /** Optional server-computed flag indicating at least one writer-authored line. */
  has_own_words?: boolean;
  first_seen?: string;
  last_seen?: string;
  method: string;
  updated_at: string;
}

/** Validated, normalized point ready for ranking and rendering. */
export interface DisplayProductPoint {
  id: string;
  criterionKey: string | null;
  kind: ProductPointKind;
  label: string;
  support: number;
  reviewerCount: number;
  hasExpert: boolean;
  hasOwnWords: boolean;
  lastSeenMs: number;
  method: ProductPointMethod;
  updatedAt: string;
}

export interface SelectProductPointsOptions {
  categorySlug?: string | null;
  criterionKey?: string | null;
  /** Distinct eligible reviews in `rate.review_points` counted up to `updated_at`. */
  pointsReviewCount?: number | null;
}

export interface PointReviewLineCandidate {
  id?: string | null;
  kind?: string | null;
  criterion_key?: string | null;
  body?: string | null;
  method?: string | null;
  created_at?: string | null;
}

/** Shape of a review row checked when counting distinct reviews behind `product_points`. */
export interface PointEligibleReviewCandidate {
  id: string;
  reviewer_type?: string | null;
  helpfulness_weight?: number | string | null;
  created_at?: string | null;
  platform_created_at?: string | null;
  review_points?: readonly PointReviewLineCandidate[] | null;
  review_flags?:
    | { include_in_rating?: boolean | null; verdict?: string | null }
    | Array<{ include_in_rating?: boolean | null; verdict?: string | null }>
    | null;
}

export interface ProductPointsSelection {
  method: ProductPointMethod;
  pros: DisplayProductPoint[];
  cons: DisplayProductPoint[];
  /** Criterion keys in category display order that have at least one stored point. */
  availableCriteria: string[];
  /** Active criterion filter when set, or null for the overall product summary. */
  activeCriterion: string | null;
  /** Latest valid `updated_at` timestamp across the selected method's rows, or null. */
  updatedAt: string | null;
  /** Reviews backing the block: never 0 and never below any point's reviewer count. */
  reviewCount: number;
}

export type PointCriterionMessageKey =
  | 'pointCrit_performance'
  | 'pointCrit_camera'
  | 'pointCrit_battery'
  | 'pointCrit_display'
  | 'pointCrit_design'
  | 'pointCrit_value'
  | 'pointCrit_sound'
  | 'pointCrit_software'
  | 'pointCrit_keyboard'
  | 'pointCrit_thermals'
  | 'pointCrit_health'
  | 'pointCrit_apps'
  | 'pointCrit_anc'
  | 'pointCrit_comfort'
  | 'pointCrit_calls'
  | 'pointCrit_service_quality'
  | 'pointCrit_price'
  | 'pointCrit_attitude'
  | 'pointCrit_speed';

const CRITERION_MESSAGE_KEYS: Readonly<
  Record<RatingCriterionKey, PointCriterionMessageKey>
> = {
  performance: 'pointCrit_performance',
  camera: 'pointCrit_camera',
  battery: 'pointCrit_battery',
  display: 'pointCrit_display',
  design: 'pointCrit_design',
  value: 'pointCrit_value',
  sound: 'pointCrit_sound',
  software: 'pointCrit_software',
  keyboard: 'pointCrit_keyboard',
  thermals: 'pointCrit_thermals',
  health: 'pointCrit_health',
  apps: 'pointCrit_apps',
  anc: 'pointCrit_anc',
  comfort: 'pointCrit_comfort',
  calls: 'pointCrit_calls',
  service_quality: 'pointCrit_service_quality',
  price: 'pointCrit_price',
  attitude: 'pointCrit_attitude',
  speed: 'pointCrit_speed',
};

const LEGACY_CRITERION_MAP: Readonly<
  Record<string, Partial<Record<LegacyCriterionKey, RatingCriterionKey>>>
> = {
  smartphones: {
    screen: 'display',
    performance: 'performance',
    camera: 'camera',
    battery: 'battery',
    value: 'value',
  },
  tablets: {
    screen: 'display',
    performance: 'performance',
    battery: 'battery',
    value: 'value',
  },
  laptops: {
    screen: 'display',
    performance: 'performance',
    battery: 'battery',
    value: 'value',
  },
  smartwatches: {
    screen: 'display',
    battery: 'battery',
    value: 'value',
  },
  earbuds: {
    screen: 'sound',
    camera: 'anc',
    battery: 'battery',
    value: 'value',
  },
  services: {},
};

const CRITERION_KEY_RE = /^[a-z_]{2,32}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTROL_CHARS_RE = /\p{Cc}+/gu;
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const MAX_LABEL_LENGTH = 200;

function ownValue<T>(
  record: Readonly<Record<string, T>> | null | undefined,
  key: string | null | undefined
): T | undefined {
  return record && key && Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

/** Translation key in the `reviews` namespace for a criterion key, or null. */
export function pointCriterionMessageKey(
  key: string | null | undefined
): PointCriterionMessageKey | null {
  return ownValue(CRITERION_MESSAGE_KEYS, key) ?? null;
}

/**
 * Maps one of the 5 legacy breakdown keys (`screen`, `performance`, `camera`,
 * `battery`, `value`) to the category's canonical `RatingCriterionKey`, or null
 * when that legacy slot does not apply to the category.
 */
export function mapLegacyPointCriterionKey(
  categorySlug: string | null | undefined,
  legacyKey: string | null | undefined
): RatingCriterionKey | null {
  if (!legacyKey || UNSAFE_KEYS.has(legacyKey)) return null;
  const cleanCat =
    typeof categorySlug === 'string' ? categorySlug.trim().toLowerCase() : '';
  const map =
    ownValue(LEGACY_CRITERION_MAP, cleanCat) ??
    LEGACY_CRITERION_MAP.smartphones!;
  return ownValue(map, legacyKey) ?? null;
}

/** Normalizes a criterion key, mapping legacy `screen` to the category's key. */
export function normalizePointCriterionKey(
  rawKey: unknown,
  categorySlug?: string | null
): string | null {
  if (typeof rawKey !== 'string') return null;
  const cleaned = rawKey.replace(CONTROL_CHARS_RE, '').trim().toLowerCase();
  if (!cleaned || UNSAFE_KEYS.has(cleaned) || !CRITERION_KEY_RE.test(cleaned)) {
    return null;
  }
  if (cleaned === 'screen') {
    const cleanCat =
      typeof categorySlug === 'string' ? categorySlug.trim().toLowerCase() : '';
    return cleanCat === 'earbuds' ? 'sound' : 'display';
  }
  return cleaned;
}

function sanitizePointLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(LONE_SURROGATE_RE, '')
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

function parseTimestampMs(raw: unknown): number {
  if (typeof raw !== 'string' || !raw.trim()) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeRow(
  raw: unknown,
  index: number,
  categorySlug?: string | null
): DisplayProductPoint | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Partial<StoredProductPointRow>;

  const rawMethod =
    typeof row.method === 'string' ? row.method.trim().toLowerCase() : '';
  if (rawMethod !== 'ai' && rawMethod !== 'code') return null;

  const rawKind =
    typeof row.kind === 'string' ? row.kind.trim().toLowerCase() : '';
  if (rawKind !== 'pro' && rawKind !== 'con') return null;

  const label = sanitizePointLabel(row.label);
  if (!label) return null;

  const hasExpert = row.has_expert === true;
  const rawReviewers = Number(row.reviewer_count);
  const parsedReviewers =
    Number.isFinite(rawReviewers) && rawReviewers >= 0
      ? Math.trunc(rawReviewers)
      : 0;
  const reviewerCount =
    parsedReviewers > 0 ? parsedReviewers : hasExpert ? 1 : 0;
  // Never display a point with "0 people".
  if (reviewerCount <= 0) return null;

  const rawSupport = Number(row.support);
  const support =
    Number.isFinite(rawSupport) && rawSupport >= 0 ? rawSupport : 0;

  // Every AI-only line contributes at most POINT_AI_WEIGHT_SHARE * POINT_WRITER_SHARE_CAP
  // (0.5) per writer and is never an expert line, so any row with hasExpert or
  // support above 0.5 * reviewerCount provably contains a writer's own words.
  const aiOnlySupportCeiling =
    POINT_AI_WEIGHT_SHARE * POINT_WRITER_SHARE_CAP * reviewerCount + 1e-6;
  const hasOwnWords =
    typeof row.has_own_words === 'boolean'
      ? row.has_own_words
      : hasExpert || support > aiOnlySupportCeiling;

  const rawId =
    typeof row.id === 'string'
      ? row.id.replace(CONTROL_CHARS_RE, '').trim()
      : '';
  const id = rawId.slice(0, 128) || `point-${index}`;

  const updatedMs = parseTimestampMs(row.updated_at);
  const updatedAt =
    updatedMs > 0 && typeof row.updated_at === 'string'
      ? row.updated_at.trim()
      : '';

  return {
    id,
    criterionKey: normalizePointCriterionKey(row.criterion_key, categorySlug),
    kind: rawKind,
    label,
    support,
    reviewerCount,
    hasExpert,
    hasOwnWords,
    lastSeenMs: parseTimestampMs(row.last_seen),
    method: rawMethod,
    updatedAt,
  };
}

/**
 * Deterministic display rank matching `@repo/shared-data/rules` (`byRank`):
 * writer-authored points before AI-only points, then higher decayed support,
 * more distinct writers, expert-backed, newer `last_seen`, then stable id.
 */
export function compareProductPoints(
  a: DisplayProductPoint,
  b: DisplayProductPoint
): number {
  return (
    Number(b.hasOwnWords) - Number(a.hasOwnWords) ||
    b.support - a.support ||
    b.reviewerCount - a.reviewerCount ||
    Number(b.hasExpert) - Number(a.hasExpert) ||
    b.lastSeenMs - a.lastSeenMs ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Keeps only valid rows of the preferred method for a master: `'ai'` rows when
 * at least one valid `'ai'` row exists, otherwise `'code'` rows.
 */
export function preferProductPointsMethod(
  rows: readonly StoredProductPointRow[] | null | undefined
): StoredProductPointRow[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const valid: Array<{
    raw: StoredProductPointRow;
    method: ProductPointMethod;
  }> = [];
  rows.forEach((raw, idx) => {
    const normalized = normalizeRow(raw, idx);
    if (normalized) {
      valid.push({ raw, method: normalized.method });
    }
  });
  if (valid.length === 0) return [];
  const targetMethod: ProductPointMethod = valid.some((v) => v.method === 'ai')
    ? 'ai'
    : 'code';
  return valid.filter((v) => v.method === targetMethod).map((v) => v.raw);
}

/**
 * Selects the pros and cons to render on the product page (DOS/Rate#1624,
 * design sections 5.1, 5.3, 7.1):
 * - Prefers `method = 'ai'` rows when any valid `ai` row exists, else `code`.
 * - Overall (`criterionKey` absent/null): up to 5 pros and up to 5 cons.
 * - Per criterion (`criterionKey` set): up to 3 pros and up to 3 cons for that criterion.
 * - Pros and cons have independent caps, so a stored con is always shown
 *   whenever one exists for the active scope (always-one-con rule, design 5.1).
 * - Returns `null` when the master has no valid rows so the block is hidden.
 */
export function selectProductPoints(
  rows: readonly StoredProductPointRow[] | null | undefined,
  options: SelectProductPointsOptions = {}
): ProductPointsSelection | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const cleanCategory =
    typeof options.categorySlug === 'string'
      ? options.categorySlug.replace(CONTROL_CHARS_RE, '').trim().toLowerCase()
      : null;

  const valid: DisplayProductPoint[] = [];
  rows.forEach((raw, idx) => {
    const normalized = normalizeRow(raw, idx, cleanCategory);
    if (normalized) valid.push(normalized);
  });
  if (valid.length === 0) return null;

  const chosenMethod: ProductPointMethod = valid.some((r) => r.method === 'ai')
    ? 'ai'
    : 'code';
  const methodRows = valid
    .filter((r) => r.method === chosenMethod)
    .sort(compareProductPoints);

  const presentKeys = new Set<string>();
  for (const row of methodRows) {
    if (row.criterionKey) presentKeys.add(row.criterionKey);
  }

  const categoryCriteria = getRatingCriteria(cleanCategory);
  const categoryKeyOrder = categoryCriteria.map((c) => c.key as string);
  const strictCategory = hasRatingCriteria(cleanCategory);

  const availableCriteria: string[] = [];
  for (const key of categoryKeyOrder) {
    if (presentKeys.has(key)) availableCriteria.push(key);
  }
  if (!strictCategory) {
    for (const key of [...presentKeys].sort()) {
      if (!availableCriteria.includes(key)) availableCriteria.push(key);
    }
  }

  const requestedCriterion = normalizePointCriterionKey(
    options.criterionKey,
    cleanCategory
  );
  const scopedRows =
    requestedCriterion !== null
      ? methodRows.filter((r) => r.criterionKey === requestedCriterion)
      : methodRows;
  const maxPerSide =
    requestedCriterion !== null
      ? PRODUCT_POINTS_CRITERION_MAX
      : PRODUCT_POINTS_OVERALL_MAX;

  const pros = scopedRows.filter((r) => r.kind === 'pro').slice(0, maxPerSide);
  const cons = scopedRows.filter((r) => r.kind === 'con').slice(0, maxPerSide);

  let latestUpdatedMs = 0;
  let updatedAt: string | null = null;
  let maxReviewerCount = 0;
  for (const row of methodRows) {
    if (row.reviewerCount > maxReviewerCount) {
      maxReviewerCount = row.reviewerCount;
    }
    const ms = parseTimestampMs(row.updatedAt);
    if (ms > latestUpdatedMs) {
      latestUpdatedMs = ms;
      updatedAt = row.updatedAt;
    }
  }

  const rawPointsReviews = options.pointsReviewCount;
  const safePointsReviews =
    typeof rawPointsReviews === 'number' &&
    Number.isFinite(rawPointsReviews) &&
    rawPointsReviews > 0
      ? Math.trunc(rawPointsReviews)
      : 0;
  const reviewCount = Math.max(safePointsReviews, maxReviewerCount);

  return {
    method: chosenMethod,
    pros,
    cons,
    availableCriteria,
    activeCriterion: requestedCriterion,
    updatedAt,
    reviewCount,
  };
}

export function isPointLineBeforeCutoff(
  line: PointReviewLineCandidate,
  latestUpdatedMs = 0
): boolean {
  if (!line || (line.kind !== 'pro' && line.kind !== 'con')) return false;
  const method = line.method ?? 'writer';
  if (method !== 'writer' && method !== 'ai') return false;
  if (latestUpdatedMs > 0) {
    const lineCreatedMs = parseTimestampMs(line.created_at);
    if (lineCreatedMs > latestUpdatedMs) return false;
  }
  return true;
}

/**
 * Mirrors `reviewPointWeight` from the `product-points` batch job, returning 0
 * when gated or when the review (or all of its `review_points` lines) postdates
 * `latestUpdatedMs`.
 */
export function eligiblePointReviewWeight(
  review: PointEligibleReviewCandidate,
  latestUpdatedMs = 0
): number {
  if (!review || typeof review.id !== 'string' || !review.id.trim()) {
    return 0;
  }
  if (latestUpdatedMs > 0) {
    const createdMs = parseTimestampMs(review.created_at);
    if (createdMs > latestUpdatedMs) return 0;
  }
  if (
    Array.isArray(review.review_points) &&
    !review.review_points.some((pt) =>
      isPointLineBeforeCutoff(pt, latestUpdatedMs)
    )
  ) {
    return 0;
  }
  const flag = Array.isArray(review.review_flags)
    ? (review.review_flags[0] ?? null)
    : (review.review_flags ?? null);
  const stored = Number(review.helpfulness_weight ?? 0);
  const weight = Number.isFinite(stored) && stored > 0 ? stored : 0;
  if (review.reviewer_type === 'expert') {
    const excluded =
      flag !== null &&
      flag.include_in_rating === false &&
      (flag.verdict ?? 'unanalyzed') !== 'unanalyzed';
    return excluded ? 0 : Math.max(1, weight);
  }
  return flag !== null && flag.include_in_rating !== false ? weight : 0;
}

export function isEligiblePointReview(
  review: PointEligibleReviewCandidate,
  latestUpdatedMs = 0
): boolean {
  return eligiblePointReviewWeight(review, latestUpdatedMs) > 0;
}
