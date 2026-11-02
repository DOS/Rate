/**
 * A review's value score (DOS/Rate#1547, design #1531 section 6, D6, D7): 0
 * to 100 from completeness, specificity, a verified purchase, helpful votes
 * and the writer's trust. It sorts reviews and gives a public tier; only the
 * writer sees the number (D7). Of the five parts only completeness touches
 * the product rating, through a weight factor from x1.00 to x1.25 (D6).
 *
 * Plain data and functions only, like the rest of `rules`, and no database:
 * the scoring job reads a review into a ReviewValueInput and stores the
 * result through `rate.store_review_values`, which keeps the number in the
 * private `rate.review_values` and the tier in `rate.reviews.value_tier`
 * (DOS/Rate#1580). The DOS-Me rating refresh reads `weightCompleteness` from
 * the stored breakdown and applies completenessWeightFactor, so the two stay
 * equal.
 */
import { getRatingCriteria, hasRatingCriteria } from './rating-criteria.js';
import {
  REVIEW_POINT_MAX,
  REVIEW_POINT_MIN,
  REVIEW_VERDICT_MAX,
  REVIEW_VERDICT_MIN,
  comparablePoint,
  hasContent,
  isEvasiveCon,
  storedPoint,
} from './review-form.js';

/** The `value_breakdown` shape; bump when a part's rule changes. */
export const REVIEW_VALUE_VERSION = 1;

/** Each part's maximum, design 6.1; they sum to 100. */
export const REVIEW_VALUE_MAX = {
  completeness: 35,
  specificity: 20,
  verified: 15,
  helpful: 20,
  trust: 10,
} as const;

/** The completeness items, design 6.1; they sum to 35. */
export const REVIEW_COMPLETENESS_POINTS = {
  /** Every criterion of the category rated. */
  criteria: 10,
  /** A verdict. */
  verdict: 5,
  /** At least one pro and one con of the whole review. */
  prosCons: 10,
  /** Pros or cons for at least REVIEW_CRITERION_POINTS_MIN_CRITERIA criteria. */
  criterionPoints: 5,
  /** A real photo. */
  photo: 5,
} as const;

/** The criteria with their own pros or cons that earn `criterionPoints`. */
export const REVIEW_CRITERION_POINTS_MIN_CRITERIA = 2;

/** D6: a complete review weighs at most this much more (x1.25). */
export const REVIEW_COMPLETENESS_WEIGHT_LIFT = 0.25;
/** A review's rating weight never exceeds this, as in the product rating. */
export const REVIEW_RATING_WEIGHT_CAP = 3;

/** The completeness a review needs for the "Đầy đủ" tier. */
export const REVIEW_TIER_COMPLETE_MIN = 30;
/** The value score a complete review needs for the "Xuất sắc" tier. */
export const REVIEW_TIER_EXCELLENT_MIN = 70;

/**
 * Axis C of the review trust model (`Docs/Platform/review-trust-model.html`),
 * as `evaluateReviewTrustAssessment` in apps/web classifies it.
 */
export type ReviewDepth =
  | 'stars_only'
  | 'platform_label'
  | 'filler'
  | 'low_effort'
  | 'specific_short'
  | 'detailed'
  | 'expert_depth';

/**
 * Specificity points per depth. Length counts only through the depth, so
 * padding past a depth's threshold adds nothing. Padding up to a threshold
 * is axis C's to catch: as the web classifies it today, 30, 90 and 240
 * characters with a product word move a text up a depth.
 */
export const REVIEW_SPECIFICITY_POINTS: Readonly<Record<ReviewDepth, number>> =
  {
    stars_only: 0,
    platform_label: 0,
    filler: 0,
    low_effort: 5,
    specific_short: 12,
    detailed: 17,
    expert_depth: 20,
  };

// An unknown depth counts as no text. A constant, because the rules import
// check reads a quote on an export line as a module path.
const NO_TEXT: ReviewDepth = 'stars_only';

/** Depths that earn no completeness: filling the boxes is not enough (6.4). */
const SUPERFICIAL: ReadonlySet<ReviewDepth> = new Set<ReviewDepth>([
  'stars_only',
  'platform_label',
  'filler',
  'low_effort',
]);

export interface ReviewValuePoint {
  kind: 'pro' | 'con';
  /** The line's own criterion, or null for a pro or con of the whole review. */
  criterionKey: string | null;
  body: string;
  /**
   * `rate.review_points.method`: 'ai' lines are extracted from a marketplace
   * review for clustering (design 4.3) and earn nothing here.
   */
  method?: 'writer' | 'ai';
}

export interface ReviewValueInput {
  categorySlug: string | null;
  /**
   * Blocked by a gate (fake, copied, filler, excluded from the rating): the
   * value score is 0 however complete the review is (6.1).
   */
  gated: boolean;
  /** Axis C, measured on all the review's text: comment, verdict and lines. */
  depth: ReviewDepth;
  /** `rate.reviews.criteria_ratings`. */
  criteriaRatings: unknown;
  verdict: string | null;
  points: readonly ReviewValuePoint[];
  /** At least one photo of the product itself, not a stock image. */
  hasRealPhoto: boolean;
  /** A marketplace's purchase mark, later an invoice. */
  verifiedPurchase: boolean;
  /** Helpful and unhelpful votes, weighted as the review sort counts them. */
  helpfulVotes: number;
  unhelpfulVotes: number;
  /**
   * Axis D, the writer's trust from 0 to 1 (account age, review history,
   * category standing); null when unknown, which counts as 0.5.
   */
  authorTrust: number | null;
}

/** A completeness item or another step that would raise the score. */
export type ReviewValueGap =
  | 'detail'
  | 'criteria'
  | 'verdict'
  | 'pros_cons'
  | 'criterion_points'
  | 'photo'
  | 'verified';

export type ReviewValueTier = 'basic' | 'complete' | 'excellent';

/** What `rate.reviews.value_breakdown` holds; `score` is `value_score`. */
export interface ReviewValue {
  version: number;
  gated: boolean;
  score: number;
  completeness: number;
  /**
   * The completeness the rating weight reads (D6): completeness, less the
   * photo of a review without pros and cons, so a marketplace review keeps
   * its weight (6.2). The DOS-Me refresh reads this key.
   */
  weightCompleteness: number;
  specificity: number;
  verified: number;
  helpful: number;
  trust: number;
  /** The public tier (D7); null for a gated review, which shows none. */
  tier: ReviewValueTier | null;
  /** For the writer only: what would raise the score, in form order. */
  gaps: ReviewValueGap[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * The 95% Wilson lower bound of the helpful share, at four decimals: two
 * votes out of two do not beat ninety out of a hundred. The same formula as
 * computeWilsonLowerBound in apps/web, which sorts reviews today.
 */
export function wilsonLowerBound(helpful: number, unhelpful: number): number {
  const pos = clamp(finiteOr(helpful, 0), 0, 10_000_000);
  const neg = clamp(finiteOr(unhelpful, 0), 0, 10_000_000);
  const n = pos + neg;
  if (n <= 0) return 0;
  const z = 1.96;
  const pHat = pos / n;
  const z2 = z * z;
  const radicand = Math.max(0, (pHat * (1 - pHat) + z2 / (4 * n)) / n);
  const bound = (pHat + z2 / (2 * n) - z * Math.sqrt(radicand)) / (1 + z2 / n);
  return Number(clamp(bound, 0, 1).toFixed(4));
}

function isStar(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 5
  );
}

function ownValue(record: unknown, key: string): unknown {
  return record &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    Object.prototype.hasOwnProperty.call(record, key)
    ? (record as Record<string, unknown>)[key]
    : undefined;
}

/**
 * The words a line is scored on: comparablePoint without diacritics, so a
 * copy typed without them ("Pin dung ca ngay") is the same line. Stricter
 * than the form, which keeps "sạc" and "sắc" apart: a false merge here only
 * drops one line's credit.
 */
function scoringWords(text: string): string[] {
  return comparablePoint(text)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd')
    .split(' ')
    .filter(Boolean);
}

// Words of praise that say nothing about the product ("rất tốt", "sản phẩm
// ok", "dùng ổn"), without diacritics. A line made only of them earns
// nothing (6.4).
const GENERIC_WORDS: ReadonlySet<string> = new Set([
  'a',
  'bt',
  'binh',
  'chat',
  'cuc',
  'cung',
  'dep',
  'duoc',
  'dung',
  'em',
  'good',
  'great',
  'hai',
  'hang',
  'kha',
  'ky',
  'lam',
  'long',
  'luong',
  'may',
  'minh',
  'ngon',
  'nha',
  'nhe',
  'nice',
  'ok',
  'oke',
  'on',
  'pham',
  'qua',
  'rat',
  'san',
  'sp',
  'thich',
  'thuong',
  'tot',
  'tuyet',
  'ung',
  'very',
  'voi',
  'xai',
  'xin',
  'y',
]);

/**
 * A writer's line that counts: the form's length, words in it, not a dodge,
 * not praise alone. Lines extracted by AI and malformed lines count for
 * nothing.
 */
function countedLine(point: ReviewValuePoint): boolean {
  if (!point || typeof point !== 'object') return false;
  if (point.kind !== 'pro' && point.kind !== 'con') return false;
  if (point.method === 'ai') return false;
  const body = String(point.body ?? '');
  const length = [...storedPoint(body)].length;
  if (length < REVIEW_POINT_MIN || length > REVIEW_POINT_MAX) return false;
  if (!hasContent(body) || isEvasiveCon(body)) return false;
  return !scoringWords(body).every((word) => GENERIC_WORDS.has(word));
}

interface CompletenessParts {
  criteria: boolean;
  verdict: boolean;
  prosCons: boolean;
  criterionPoints: boolean;
  photo: boolean;
}

function completenessParts(input: ReviewValueInput): CompletenessParts {
  // A category without its own list has no criteria to complete: never the
  // smartphone fallback of getRatingCriteria.
  const criteria = hasRatingCriteria(input.categorySlug)
    ? getRatingCriteria(input.categorySlug)
    : [];
  const keys = new Set<string>(criteria.map((criterion) => criterion.key));
  const verdict = String(input.verdict ?? '');
  // Each line counts once, wherever it is repeated: the same words as a pro
  // and a con, twice in a list, again under a criterion, or with other
  // diacritics, case, punctuation or spacing.
  const seen = new Set<string>();
  let pro = false;
  let con = false;
  const criteriaWithLines = new Set<string>();
  const points = Array.isArray(input.points) ? input.points : [];
  // Lines of the whole review first, so a criterion line copied from one is
  // the one dropped.
  const ordered = [
    ...points.filter((point) => point?.criterionKey == null),
    ...points.filter((point) => point?.criterionKey != null),
  ];
  for (const point of ordered) {
    if (!countedLine(point)) continue;
    const compared = scoringWords(point.body).join('');
    if (seen.has(compared)) continue;
    seen.add(compared);
    if (point.criterionKey == null) {
      if (point.kind === 'pro') pro = true;
      else con = true;
    } else if (keys.has(point.criterionKey)) {
      criteriaWithLines.add(point.criterionKey);
    }
  }
  return {
    criteria:
      criteria.length > 0 &&
      criteria.every((criterion) =>
        isStar(ownValue(input.criteriaRatings, criterion.key))
      ),
    // The form's verdict, and not one of the lines again.
    verdict:
      [...storedPoint(verdict)].length >= REVIEW_VERDICT_MIN &&
      [...storedPoint(verdict)].length <= REVIEW_VERDICT_MAX &&
      hasContent(verdict) &&
      !seen.has(scoringWords(verdict).join('')),
    prosCons: pro && con,
    criterionPoints:
      criteriaWithLines.size >= REVIEW_CRITERION_POINTS_MIN_CRITERIA,
    photo: input.hasRealPhoto === true,
  };
}

// A malformed input reads as an empty review. A function of its own, because
// the rules import check reads a quote on an export line as a module path.
function asInput(raw: unknown): ReviewValueInput {
  return (raw && typeof raw === 'object' ? raw : {}) as ReviewValueInput;
}

/**
 * The value score of one review and its parts (design 6.1). A gated review
 * scores 0. Completeness counts only when the text is more than superficial,
 * each pro or con line counts once however often or however it is retyped,
 * and length counts only through the depth.
 */
export function reviewValue(raw: ReviewValueInput): ReviewValue {
  const input = asInput(raw);
  const depth: ReviewDepth = Object.prototype.hasOwnProperty.call(
    REVIEW_SPECIFICITY_POINTS,
    input?.depth
  )
    ? input.depth
    : NO_TEXT;
  const parts = completenessParts(input);
  const superficial = SUPERFICIAL.has(depth);
  const P = REVIEW_COMPLETENESS_POINTS;
  const completeness = superficial
    ? 0
    : (parts.criteria ? P.criteria : 0) +
      (parts.verdict ? P.verdict : 0) +
      (parts.prosCons ? P.prosCons : 0) +
      (parts.criterionPoints ? P.criterionPoints : 0) +
      (parts.photo ? P.photo : 0);
  const weightCompleteness =
    completeness -
    (parts.photo && !parts.prosCons && completeness ? P.photo : 0);
  const specificity = REVIEW_SPECIFICITY_POINTS[depth];
  const verified =
    input.verifiedPurchase === true ? REVIEW_VALUE_MAX.verified : 0;
  const helpful = round2(
    REVIEW_VALUE_MAX.helpful *
      wilsonLowerBound(input.helpfulVotes, input.unhelpfulVotes)
  );
  const trust = round2(
    REVIEW_VALUE_MAX.trust * clamp(finiteOr(input.authorTrust, 0.5), 0, 1)
  );

  const gaps: ReviewValueGap[] = [];
  if (superficial) gaps.push('detail');
  if (!parts.criteria) gaps.push('criteria');
  if (!parts.verdict) gaps.push('verdict');
  if (!parts.prosCons) gaps.push('pros_cons');
  if (!parts.criterionPoints) gaps.push('criterion_points');
  if (!parts.photo) gaps.push('photo');
  if (!verified) gaps.push('verified');

  if (input.gated === true) {
    return {
      version: REVIEW_VALUE_VERSION,
      gated: true,
      score: 0,
      completeness: 0,
      weightCompleteness: 0,
      specificity: 0,
      verified: 0,
      helpful: 0,
      trust: 0,
      tier: null,
      gaps: [],
    };
  }
  const score = round2(
    clamp(completeness + specificity + verified + helpful + trust, 0, 100)
  );
  const tier: ReviewValueTier =
    completeness < REVIEW_TIER_COMPLETE_MIN
      ? 'basic'
      : score >= REVIEW_TIER_EXCELLENT_MIN
        ? 'excellent'
        : 'complete';
  return {
    version: REVIEW_VALUE_VERSION,
    gated: false,
    score,
    completeness,
    weightCompleteness,
    specificity,
    verified,
    helpful,
    trust,
    tier,
    gaps,
  };
}

/**
 * D6: the rating weight factor of a review's `weightCompleteness`, from 1
 * (nothing) to 1.25 (everything), at four decimals. A number outside 0 to
 * 35 counts as its nearest bound; anything else, a numeric string included,
 * as 0, so a review the job has not scored yet keeps its weight. Read the
 * stored value as a number (jsonb `->`, not `->>`).
 */
export function completenessWeightFactor(completeness: unknown): number {
  const c = clamp(finiteOr(completeness, 0), 0, REVIEW_VALUE_MAX.completeness);
  return Number(
    (
      1 +
      (REVIEW_COMPLETENESS_WEIGHT_LIFT * c) / REVIEW_VALUE_MAX.completeness
    ).toFixed(4)
  );
}

/**
 * A review's weight in the product rating: the stored helpfulness weight
 * times the factor of its weightCompleteness, capped at
 * REVIEW_RATING_WEIGHT_CAP (6.2).
 */
export function reviewRatingWeight(
  helpfulnessWeight: number,
  weightCompleteness: unknown
): number {
  if (Number.isNaN(helpfulnessWeight) || !(helpfulnessWeight > 0)) return 0;
  return Math.min(
    REVIEW_RATING_WEIGHT_CAP,
    helpfulnessWeight * completenessWeightFactor(weightCompleteness)
  );
}
