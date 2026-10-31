/**
 * Rating criteria per category, with weights (DOS/Rate#1542, design #1531, D1).
 *
 * A Rate review rates each criterion of its category in stars, and its own
 * star is the weighted average of the criteria it rated, as in JReviews.
 * The lists are versioned: a review keeps the version it was written with, so
 * a later change of weights never rewrites stored reviews. Plain data and
 * functions only, like the rest of `rules`.
 */
import type { SpecGroupKey } from './spec-template.js';

/** Bump whenever a list, a key or a weight changes. */
export const RATING_CRITERIA_VERSION = 1;

export type RatingCriterionKey =
  | 'performance'
  | 'camera'
  | 'battery'
  | 'display'
  | 'design'
  | 'value'
  | 'sound'
  | 'software'
  | 'keyboard'
  | 'thermals'
  | 'health'
  | 'apps'
  | 'anc'
  | 'comfort'
  | 'calls'
  | 'service_quality'
  | 'price'
  | 'attitude'
  | 'speed';

export interface RatingCriterion {
  key: RatingCriterionKey;
  label: { vi: string; en: string };
  /** Share of the review star, in percent; a category's weights sum to 100. */
  weight: number;
  /** The spec group shown beside the score, when one fits. */
  specGroup: SpecGroupKey | null;
  /** A criterion every review must rate ("Đáng tiền", D5). */
  required: boolean;
}

/** The most criteria a review may leave unrated ("Chưa dùng tới", D5). */
export const MAX_SKIPPED_CRITERIA = 2;

const c = (
  key: RatingCriterionKey,
  vi: string,
  en: string,
  weight: number,
  specGroup: SpecGroupKey | null,
  required = false
): RatingCriterion => ({ key, label: { vi, en }, weight, specGroup, required });

const VALUE = c('value', 'Đáng tiền', 'Value for money', 15, null, true);

const RATING_CRITERIA: Readonly<Record<string, readonly RatingCriterion[]>> = {
  smartphones: [
    c('performance', 'Hiệu năng', 'Performance', 20, 'hardware'),
    c('camera', 'Camera', 'Camera', 20, 'camera'),
    c('battery', 'Pin và sạc', 'Battery and charging', 20, 'battery'),
    c('display', 'Màn hình', 'Display', 15, 'display'),
    c('design', 'Thiết kế và độ bền', 'Design and build', 10, 'design'),
    VALUE,
  ],
  tablets: [
    c('display', 'Màn hình', 'Display', 20, 'display'),
    c('performance', 'Hiệu năng', 'Performance', 20, 'hardware'),
    c('battery', 'Pin', 'Battery', 15, 'battery'),
    c('sound', 'Loa và giải trí', 'Speakers and media', 10, 'multimedia'),
    c('software', 'Phần mềm và phụ kiện', 'Software and accessories', 10, null),
    c('design', 'Thiết kế', 'Design', 10, 'design'),
    VALUE,
  ],
  laptops: [
    c('performance', 'Hiệu năng', 'Performance', 25, 'hardware'),
    c('display', 'Màn hình', 'Display', 15, 'display'),
    c('battery', 'Pin', 'Battery', 15, 'battery'),
    c('keyboard', 'Bàn phím và touchpad', 'Keyboard and touchpad', 10, null),
    c('thermals', 'Tản nhiệt và độ ồn', 'Thermals and noise', 10, 'hardware'),
    c('design', 'Thiết kế và độ bền', 'Design and build', 10, 'design'),
    VALUE,
  ],
  smartwatches: [
    c('health', 'Theo dõi sức khoẻ', 'Health tracking', 25, null),
    c('battery', 'Pin', 'Battery', 20, 'battery'),
    c('design', 'Thiết kế và đeo', 'Design and fit', 15, 'design'),
    c(
      'apps',
      'Ứng dụng và kết nối',
      'Apps and connectivity',
      15,
      'connectivity'
    ),
    c('display', 'Màn hình', 'Display', 10, 'display'),
    VALUE,
  ],
  earbuds: [
    c('sound', 'Chất âm', 'Sound quality', 30, 'multimedia'),
    c('anc', 'Chống ồn', 'Noise cancelling', 15, 'multimedia'),
    c('battery', 'Pin', 'Battery', 15, 'battery'),
    c('comfort', 'Đeo thoải mái', 'Comfort', 15, 'design'),
    c('calls', 'Mic và gọi', 'Microphone and calls', 10, 'multimedia'),
    VALUE,
  ],
  // Services (entity_type = 'service'): price is what every review must rate.
  services: [
    c('service_quality', 'Chất lượng dịch vụ', 'Service quality', 35, null),
    c('price', 'Giá cả', 'Price', 25, null, true),
    c('attitude', 'Thái độ phục vụ', 'Staff attitude', 20, null),
    c('speed', 'Tốc độ', 'Speed', 20, null),
  ],
};

/** Categories with their own criteria list. */
export const RATING_CRITERIA_CATEGORIES: readonly string[] =
  Object.keys(RATING_CRITERIA);

/**
 * The criteria of a category, in display order. A category without its own
 * list (or none given) rates as a smartphone, the catalog's default category.
 */
export function getRatingCriteria(
  categorySlug: string | null | undefined
): readonly RatingCriterion[] {
  return (
    ownValue(RATING_CRITERIA, categorySlug) ?? RATING_CRITERIA.smartphones!
  );
}

/**
 * Whether a category has its own criteria list. An API that must not rate a
 * new category ("tvs") or a typo ("service") as a phone checks this first.
 */
export function hasRatingCriteria(
  categorySlug: string | null | undefined
): boolean {
  return ownValue(RATING_CRITERIA, categorySlug) !== undefined;
}

/**
 * A record's own entry: "toString" or "__proto__" as a category slug or a
 * rating key never reaches Object.prototype.
 */
function ownValue<T>(
  record: Readonly<Record<string, T>> | null | undefined,
  key: string | null | undefined
): T | undefined {
  return record && key && Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

/**
 * Criterion stars as stored in `rate.reviews.criteria_ratings`. A criterion
 * the writer left out ("Chưa dùng tới") is missing, undefined or null.
 */
export type CriteriaRatings = Partial<Record<string, number | null>>;

export type CriteriaRatingsIssue =
  | { kind: 'unknown_key'; key: string }
  | { kind: 'bad_star'; key: string }
  | { kind: 'missing_required'; key: RatingCriterionKey }
  | { kind: 'too_many_skipped'; skipped: number };

/** A stored star: any number from 1 to 5 (legacy reviews kept 0.1 steps). */
function isStoredStar(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 5
  );
}

/** A star the form gives: 1 to 5 in half steps. */
function isStar(value: unknown): value is number {
  return isStoredStar(value) && Number.isInteger(value * 2);
}

/**
 * What is wrong with a review's criterion stars under D5: a key the category
 * does not have, a star outside 1-5 in half steps, a required criterion left
 * out, or more than MAX_SKIPPED_CRITERIA criteria left out. An empty list is
 * a valid review.
 */
export function validateCriteriaRatings(
  categorySlug: string | null | undefined,
  ratings: CriteriaRatings
): CriteriaRatingsIssue[] {
  const criteria = getRatingCriteria(categorySlug);
  const known = new Set<string>(criteria.map((criterion) => criterion.key));
  const issues: CriteriaRatingsIssue[] = [];
  const given = ratings && typeof ratings === 'object' ? ratings : {};
  for (const [key, star] of Object.entries(given)) {
    if (!known.has(key)) issues.push({ kind: 'unknown_key', key });
    else if (star != null && !isStar(star))
      issues.push({ kind: 'bad_star', key });
  }
  let skipped = 0;
  for (const criterion of criteria) {
    if (ownValue(given, criterion.key) != null) continue;
    if (criterion.required)
      issues.push({ kind: 'missing_required', key: criterion.key });
    else skipped += 1;
  }
  if (skipped > MAX_SKIPPED_CRITERIA)
    issues.push({ kind: 'too_many_skipped', skipped });
  return issues;
}

/**
 * A review's own star: the weighted average of the criteria it rated, at one
 * decimal (design 2.2). Keys the category does not have and stars outside
 * 1-5 are ignored; null when nothing valid is rated. Any star from 1 to 5
 * counts, so a legacy review's 0.1-step stars do too: half steps are a rule
 * of the form (validateCriteriaRatings), not of stored data.
 */
export function weightedReviewStar(
  categorySlug: string | null | undefined,
  ratings: CriteriaRatings
): number | null {
  let sum = 0;
  let weights = 0;
  for (const criterion of getRatingCriteria(categorySlug)) {
    const star = ownValue(ratings, criterion.key);
    if (!isStoredStar(star)) continue;
    sum += star * criterion.weight;
    weights += criterion.weight;
  }
  if (weights === 0) return null;
  return Math.round((sum * 10) / weights) / 10;
}

/** The five keys of the first review form, before the per-category lists. */
export type LegacyCriterionKey =
  'screen' | 'performance' | 'camera' | 'battery' | 'value';

// What each legacy key rated per category. The product page labels an
// earbud's "screen" score soundstage and its "camera" score ANC / mic, so
// they map to sound and anc. A key with no counterpart (a tablet's, laptop's
// or watch's camera, a watch's or earbud's performance) maps to nothing and
// its star is dropped. A mapped legacy review can rate fewer criteria than
// validateCriteriaRatings asks of a new one: that check is for new reviews.
const LEGACY_MAP: Readonly<
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
  smartwatches: { screen: 'display', battery: 'battery', value: 'value' },
  earbuds: {
    screen: 'sound',
    camera: 'anc',
    battery: 'battery',
    value: 'value',
  },
  services: {},
};

/**
 * A review written with the five legacy keys, in the category's keys. A
 * criterion the legacy form did not ask stays unrated: nothing is inferred.
 * The review API stored legacy stars at 0.1, so any star from 1 to 5
 * carries over as it is.
 */
export function mapLegacyCriteriaRatings(
  categorySlug: string | null | undefined,
  legacy: Partial<Record<string, unknown>>
): CriteriaRatings {
  const map = ownValue(LEGACY_MAP, categorySlug) ?? LEGACY_MAP.smartphones!;
  const out: CriteriaRatings = {};
  for (const [legacyKey, key] of Object.entries(map)) {
    const star = ownValue(legacy, legacyKey);
    if (key && isStoredStar(star)) out[key] = star;
  }
  return out;
}
