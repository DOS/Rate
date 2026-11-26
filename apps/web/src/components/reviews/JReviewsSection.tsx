'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ExportMenu from '@/components/elementary/ExportMenu';
import PhoneCollapsible from '@/components/product/PhoneCollapsible';
import StarRating from '@/components/elementary/StarRating';
import {
  BsAward,
  BsBarChart,
  BsCheckCircle,
  BsExclamationTriangle,
  BsFlag,
  BsHandThumbsDown,
  BsHandThumbsUp,
  BsInfoCircle,
  BsMegaphone,
  BsPatchCheck,
  BsRobot,
  BsStarFill,
  BsX,
} from 'react-icons/bs';
import { contentLang } from '@/lib/content-lang';
import { computeJReviewsUserScores } from '@/lib/jreviews-user-score';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  addReviewStarCounts,
  computeCombinedDualScore,
  computeJReviewsWeight,
  computeReviewStarCounts,
  computeWilsonLowerBound,
  detectStarDistributionAnomaly,
  evaluateReviewTrustAssessment,
  sanitizeReviewImages,
  type ReviewAnalysisSummary,
  type ReviewItem,
  type ReviewReportReason,
  type ReviewStarCounts,
  type ReviewStarTier,
} from '@/lib/rate-domain';
import type { CanonicalCategorySlug } from '@/lib/rate-domain-core';
import {
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarMarkdownCell,
  type RadarSignal,
} from '@/lib/deal-radar';
import {
  getBrowserAccessToken,
  jsonWriteHeaders,
} from '@/lib/auth/access-token';
import {
  REVIEW_REPORT_OPTION_COPY,
  blendNoteKey,
  buildReviewVoteRequestBody,
  isFilteredOutReview,
  mergeLoadedReviews,
  reviewBadgeKind,
  sponsorshipBadgeKey,
  submitErrorKey,
  weightExplanationCopy,
  type ReviewBadgeKind,
} from '@/lib/review-display';
import { inertOutside, tabbableIn, wrapFocusTarget } from '@/lib/focus-trap';
import AnalyzerText, { analyzerText } from './AnalyzerText';
import ProductPointsBlock from './ProductPointsBlock';
import ReviewFormV2 from './ReviewFormV2';
import { isReviewFormV2Enabled } from '@/lib/review-form-v2';
import {
  mapLegacyPointCriterionKey,
  pointCriterionMessageKey,
  selectProductPoints,
  type StoredProductPointRow,
} from '@/lib/product-points-display';
import {
  RATING_CRITERION_KEYS,
  getRatingCriteria,
  getRatingCriterionLabel,
  hasRatingCriteria,
  type RatingCriterionKey,
} from '@repo/shared-data/rules';
import {
  hasSessionCookie,
  isReviewId,
  MY_REVIEW_VALUES_MAX_IDS,
  parseMyReviewValue,
  compareByQuality,
  reviewTierBadgeKey,
  reviewValueGapKey,
  shownReviewTier,
  shownReviewValueGaps,
  type MyReviewValue,
} from '@/lib/review-value-display';
import {
  formatDecimal,
  formatNumber,
  formatPercent,
  formatPlainNumber,
} from '@/lib/locale-format';
import { formatRatingValue, roundScore } from '@/lib/rating-display';

type VoteChoice = 'up' | 'down' | 'report';
type FilterTab = 'all' | 'authentic' | 'expert' | 'ignored';
type SortMode = 'weight_desc' | 'newest' | 'rating_desc' | 'rating_asc';
type StarFilter = 'all' | ReviewStarTier;

interface StarSliceState {
  reviews: ReviewItem[];
  nextCursor: string | null;
  totalCount: number | null;
  loaded: boolean;
}

const STAR_TIERS_DESC: readonly ReviewStarTier[] = [5, 4, 3, 2, 1];

export interface JReviewsSectionProps {
  masterProductId?: string;
  /** Shows only this category's criteria: no screen for earbuds. */
  categorySlug?: CanonicalCategorySlug | 'services';
  /**
   * The category review form v2 rates (the product's category row, as the
   * v2 RPC reads it); null when it has none. Only read with v2 on.
   */
  reviewCategorySlug?: string | null;
  productSlug?: string;
  productName: string;
  averageRating: number;
  userRatingWeighted: number | null;
  /** The stored rating the page headline shows (D3), when there is one. */
  ratingScore?: number | null;
  expertRating: number | null;
  expertReviewSummary?: string | null;
  authenticReviewCount: number;
  ignoredReviewCount: number;
  reviews: ReviewItem[];
  /** DB-wide 1-5 star breakdown; falls back to `reviews` when omitted. */
  starCounts?: ReviewStarCounts;
  initialNextCursor?: string | null;
  totalReviewCount?: number;
  summary: ReviewAnalysisSummary;
  productPoints?: readonly StoredProductPointRow[];
  productPointsReviewCount?: number;
  radarSignal?: RadarSignal | null;
  defaultWriteFormOpen?: boolean;
  /** SSR/unit-test fixture override to render the report dialog open. */
  defaultReportReviewId?: string | null;
}

const LEGACY_WRITE_CRITERIA_KEYS = [
  { key: 'screen', labelKey: 'criteriaScreen' },
  { key: 'performance', labelKey: 'criteriaPerformance' },
  { key: 'camera', labelKey: 'criteriaCamera' },
  { key: 'battery', labelKey: 'criteriaBattery' },
  { key: 'value', labelKey: 'criteriaValue' },
] as const;

const LEGACY_V1_CRITERION_KEYS = [
  'screen',
  'performance',
  'camera',
  'battery',
  'value',
] as const;
const LEGACY_V1_KEY_SET = new Set<string>(LEGACY_V1_CRITERION_KEYS);

function isValidCriterionStar(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 5
  );
}

function ownCriterionValue(
  record: Record<string, unknown>,
  key: string
): unknown {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function normalizeCategorySlug(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(JREVIEWS_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase();
  return cleaned || null;
}

/**
 * Normalizes a review's stored `criteria_ratings` for a product category:
 * - Canonical `getRatingCriteria(categorySlug)` keys take precedence.
 * - Legacy v1 keys (`screen`, `performance`, `camera`, `battery`, `value`) map
 *   via `mapLegacyPointCriterionKey` only when the target canonical key is not
 *   already rated on the same review (never double-counting) and are dropped
 *   when the category has no counterpart (e.g. `camera` on smartwatches).
 * - Any additional valid `RatingCriterionKey` present on the review is kept so
 *   individual review cards can render extra rated criteria.
 */
export function normalizeReviewCriteriaRatings(
  categorySlug: string | null | undefined,
  rawRatings: unknown
): Partial<Record<RatingCriterionKey, number>> {
  if (
    !rawRatings ||
    typeof rawRatings !== 'object' ||
    Array.isArray(rawRatings)
  ) {
    return {};
  }
  const record = rawRatings as Record<string, unknown>;
  const cleanCategory = normalizeCategorySlug(categorySlug);
  const categoryCriteria = getRatingCriteria(cleanCategory);
  const canonicalKeys = new Set<string>(categoryCriteria.map((c) => c.key));
  const out: Partial<Record<RatingCriterionKey, number>> = {};

  for (const crit of categoryCriteria) {
    const star = ownCriterionValue(record, crit.key);
    if (isValidCriterionStar(star)) {
      out[crit.key] = star;
    }
  }

  for (const legacyKey of LEGACY_V1_CRITERION_KEYS) {
    if (canonicalKeys.has(legacyKey)) continue;
    const star = ownCriterionValue(record, legacyKey);
    if (!isValidCriterionStar(star)) continue;
    const mapped = mapLegacyPointCriterionKey(cleanCategory, legacyKey);
    if (mapped && out[mapped] === undefined) {
      out[mapped] = star;
    }
  }

  for (const key of RATING_CRITERION_KEYS) {
    if (canonicalKeys.has(key) || LEGACY_V1_KEY_SET.has(key)) continue;
    if (out[key] !== undefined) continue;
    const star = ownCriterionValue(record, key);
    if (isValidCriterionStar(star)) {
      out[key] = star;
    }
  }

  return out;
}

const FLAG_STYLES: Record<ReviewBadgeKind, string> = {
  pending: 'bg-info-subtle text-info-emphasis border border-info-subtle',
  authentic: 'bg-success-subtle text-success border border-success-subtle',
  low_value_coin_spam:
    'bg-secondary-subtle text-secondary border border-secondary-subtle',
  seeding_fake: 'bg-danger-subtle text-danger border border-danger-subtle',
  competitor_sabotage:
    'bg-warning-subtle text-warning-emphasis border border-warning-subtle',
  review_bombing: 'bg-danger-subtle text-danger border border-danger-subtle',
};

const STORAGE_KEY = 'rate_review_votes_v1';
const LOCAL_REVIEWS_PREFIX = 'rate_community_reviews_v1_';
const JREVIEWS_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeJReviewsExportSlug(value: unknown): string {
  if (typeof value !== 'string') return 'audit';
  const cleaned = value
    .replace(JREVIEWS_CONTROL_CHARS_RE, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned || 'audit';
}

export function sanitizeJReviewsMarkdownCell(
  value: unknown,
  maxLen = 120
): string {
  if (typeof value !== 'string') return '-';
  const cleaned = value
    .replace(JREVIEWS_CONTROL_CHARS_RE, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
  return cleaned || '-';
}

export function sanitizeJReviewsPercentage(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function buildJReviewsMarkdown({
  productName,
  reviews,
  radarSignal,
  locale,
}: {
  productName: string;
  reviews: readonly ReviewItem[];
  radarSignal?: RadarSignal | null;
  locale?: string;
}): string {
  const headers = [
    'Author',
    'Type',
    'Rating',
    'JReviews Weight',
    'AI Flag Category',
    'Upvotes',
    'Comment',
  ];
  const sep = headers.map(() => '---');
  const rows = reviews.map((r) => [
    sanitizeJReviewsMarkdownCell(r.author_name, 80),
    r.reviewer_type === 'expert' ? 'Expert' : 'Verified Buyer',
    `${r.rating_star}/5★`,
    `${r.helpfulness_weight.toFixed(2)}x`,
    reviewBadgeKind(r),
    String(r.upvotes),
    sanitizeJReviewsMarkdownCell(r.comment, 120),
  ]);
  return [
    `### ⭐ Rate.vn JReviews AI-checked buyer reviews: ${sanitizeJReviewsMarkdownCell(productName, 160)} (${reviews.length} reviews)`,
    `- **Price signal:** ${radarMarkdownCell(radarSignal, locale)}`,
    '',
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function ReviewPhotoStrip({
  images,
  authorLabel,
}: {
  images: readonly string[] | undefined;
  authorLabel: string;
}) {
  const t = useTranslations('reviews');
  const safeImages = useMemo(() => sanitizeReviewImages(images), [images]);
  const [brokenUrls, setBrokenUrls] = useState<Record<string, boolean>>({});
  const imgRefs = useRef<Record<string, HTMLImageElement | null>>({});

  useEffect(() => {
    // Images that failed before hydration do not re-fire React's onError.
    const newlyBroken: string[] = [];
    for (const url of safeImages) {
      const el = imgRefs.current[url];
      if (el && el.complete && el.naturalWidth === 0 && !brokenUrls[url]) {
        newlyBroken.push(url);
      }
    }
    if (newlyBroken.length > 0) {
      setBrokenUrls((prev) => {
        const next = { ...prev };
        for (const u of newlyBroken) next[u] = true;
        return next;
      });
    }
  }, [safeImages, brokenUrls]);

  const visibleImages = safeImages.filter((url) => !brokenUrls[url]);
  if (visibleImages.length === 0) return null;

  const markBroken = (url: string) => {
    setBrokenUrls((prev) => (prev[url] ? prev : { ...prev, [url]: true }));
  };

  return (
    <div
      className="rate-review-photos d-flex flex-wrap gap-2 mb-2"
      role="group"
      aria-label={t('reviewPhotosAria')}
      data-testid="review-photo-strip"
    >
      {visibleImages.map((url, idx) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rate-review-photo-thumb"
        >
          <img
            ref={(node) => {
              imgRefs.current[url] = node;
            }}
            src={url}
            alt={t('reviewPhotoAlt', {
              index: idx + 1,
              author: authorLabel,
            })}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => markBroken(url)}
          />
        </a>
      ))}
    </div>
  );
}

function ReportReasonDialog({
  dialogId,
  reviewId,
  onClose,
  onSubmit,
}: {
  dialogId: string;
  reviewId: string;
  onClose: (restoreFocus: boolean) => void;
  onSubmit: (reviewId: string, reason: ReviewReportReason) => void;
}) {
  const t = useTranslations('reviews');
  const titleId = `${dialogId}-title`;
  const descId = `${dialogId}-desc`;
  const radioName = `${dialogId}-reason`;
  const [selectedReason, setSelectedReason] =
    useState<ReviewReportReason>('spam');
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restore = inertOutside([dialog]);
    firstRadioRef.current?.focus({ preventScroll: true });

    let pressedOutside = false;
    const isBackdropPress = (e: Event) => e.target === backdropRef.current;

    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isBackdropPress(e);
    };

    const onClick = (e: MouseEvent) => {
      if (e.button === 0 && pressedOutside && isBackdropPress(e)) {
        onClose(true);
      }
      pressedOutside = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(true);
        return;
      }
      if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
      const items = tabbableIn(dialog);
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const target = wrapFocusTarget(items, active, e.shiftKey);
      if (!target) return;
      e.preventDefault();
      target.focus();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      restore();
    };
  }, [onClose]);

  return (
    <div ref={backdropRef} className="rate-report-dialog-backdrop">
      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="rate-report-dialog"
        data-testid="review-report-dialog"
      >
        <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
          <h3 id={titleId} className="h6 fw-bold mb-0">
            {t('reportDialogTitle')}
          </h3>
          <button
            type="button"
            className="btn btn-sm btn-outline-dark rounded-circle rate-report-dialog-close"
            aria-label={t('closeAlertAria')}
            onClick={() => onClose(true)}
          >
            <BsX aria-hidden="true" size={20} />
          </button>
        </div>
        <p id={descId} className="rate-report-dialog-desc small mb-3">
          {t('reportDialogDesc')}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(reviewId, selectedReason);
          }}
        >
          <fieldset className="m-0 border-0 p-0">
            <legend className="visually-hidden">
              {t('reportReasonsLegend')}
            </legend>
            <div className="d-flex flex-column gap-2 mb-3">
              {REVIEW_REPORT_OPTION_COPY.map((opt, idx) => {
                const inputId = `${dialogId}-opt-${opt.reason}`;
                const optDescId = `${inputId}-desc`;
                const isSelected = selectedReason === opt.reason;
                return (
                  <div
                    key={opt.reason}
                    className={`rate-report-option${isSelected ? ' is-selected' : ''}`}
                  >
                    <input
                      ref={idx === 0 ? firstRadioRef : undefined}
                      id={inputId}
                      type="radio"
                      name={radioName}
                      value={opt.reason}
                      checked={isSelected}
                      onChange={() => setSelectedReason(opt.reason)}
                      aria-describedby={optDescId}
                      className="form-check-input mt-1 flex-shrink-0"
                    />
                    <div className="flex-grow-1">
                      <label
                        htmlFor={inputId}
                        className="d-block small fw-semibold stretched-link"
                        style={{ cursor: 'pointer' }}
                      >
                        {t(opt.labelKey)}
                      </label>
                      <span
                        id={optDescId}
                        className="rate-report-option-desc d-block"
                        style={{ fontSize: '0.8125rem' }}
                      >
                        {t(opt.descKey)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-dark rounded-pill px-3"
              onClick={() => onClose(true)}
            >
              {t('reportCancelBtn')}
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-danger rounded-pill px-3 text-white"
              data-testid="review-report-submit-btn"
            >
              {t('reportSubmitBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function JReviewsSection({
  masterProductId,
  productSlug,
  productName,
  averageRating,
  userRatingWeighted,
  ratingScore,
  expertRating,
  expertReviewSummary,
  authenticReviewCount,
  ignoredReviewCount,
  reviews: initialReviews,
  starCounts: starCountsProp,
  initialNextCursor = null,
  totalReviewCount,
  summary,
  productPoints,
  productPointsReviewCount,
  radarSignal,
  categorySlug,
  reviewCategorySlug,
  defaultWriteFormOpen = false,
  defaultReportReviewId = null,
}: JReviewsSectionProps) {
  const t = useTranslations('reviews');
  const tAnalyzer = useTranslations('analyzerCopy');
  const locale = useLocale();

  const cleanCategorySlug = useMemo(
    () => normalizeCategorySlug(categorySlug),
    [categorySlug]
  );
  const cleanReviewCategorySlug = useMemo(
    () => normalizeCategorySlug(reviewCategorySlug),
    [reviewCategorySlug]
  );
  // Authoritative DB category (`reviewCategorySlug`) wins when present (e.g.
  // `services` or `tvs` routed under `/smartphones/[slug]`), falling back to
  // the route `categorySlug` when v2 is disabled (`reviewCategorySlug` null).
  const effectiveCategorySlug = cleanReviewCategorySlug ?? cleanCategorySlug;

  // Kept only for the legacy v1 5-slider write form when v2 is disabled.
  const criteriaMeta = useMemo(
    () =>
      LEGACY_WRITE_CRITERIA_KEYS.map((c) => ({
        key: c.key,
        label: t(c.labelKey),
      })),
    [t]
  );
  // Category criteria from shared RATING_CRITERIA, localized for vi/en/cs.
  const shownCriteriaMeta = useMemo(
    () =>
      getRatingCriteria(effectiveCategorySlug).map((c) => ({
        key: c.key,
        label: getRatingCriterionLabel(c, locale),
      })),
    [effectiveCategorySlug, locale]
  );

  const flagMetaMap = useMemo<
    Record<
      ReviewBadgeKind,
      { label: string; badgeClass: string; description: string }
    >
  >(
    () => ({
      pending: {
        label: t('flagPendingLabel'),
        badgeClass: FLAG_STYLES.pending,
        description: t('flagPendingDesc'),
      },
      authentic: {
        label: t('flagAuthenticLabel'),
        badgeClass: FLAG_STYLES.authentic,
        description: t('flagAuthenticDesc'),
      },
      low_value_coin_spam: {
        label: t('flagCoinSpamLabel'),
        badgeClass: FLAG_STYLES.low_value_coin_spam,
        description: t('flagCoinSpamDesc'),
      },
      seeding_fake: {
        label: t('flagSeedingFakeLabel'),
        badgeClass: FLAG_STYLES.seeding_fake,
        description: t('flagSeedingFakeDesc'),
      },
      competitor_sabotage: {
        label: t('flagSabotageLabel'),
        badgeClass: FLAG_STYLES.competitor_sabotage,
        description: t('flagSabotageDesc'),
      },
      review_bombing: {
        label: t('flagBombingLabel'),
        badgeClass: FLAG_STYLES.review_bombing,
        description: t('flagBombingDesc'),
      },
    }),
    [t]
  );

  const [allReviews, setAllReviews] = useState<ReviewItem[]>(initialReviews);
  const [allNextCursor, setAllNextCursor] = useState<string | null>(
    initialNextCursor ?? null
  );
  const [allKnownTotalCount, setAllKnownTotalCount] = useState<number | null>(
    typeof totalReviewCount === 'number' &&
      Number.isFinite(totalReviewCount) &&
      totalReviewCount >= 0
      ? totalReviewCount
      : null
  );
  const [sessionAddedReviews, setSessionAddedReviews] = useState<ReviewItem[]>(
    []
  );
  const [starSlices, setStarSlices] = useState<
    Partial<Record<ReviewStarTier, StarSliceState>>
  >({});
  const [starFilterLoading, setStarFilterLoading] = useState(false);
  const [starFilterError, setStarFilterError] = useState<string | null>(null);
  const starFetchControllerRef = useRef<AbortController | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, VoteChoice>>({});
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(
    defaultReportReviewId ?? null
  );
  const reportButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingReportFocusIdRef = useRef<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('weight_desc');
  // The signed-in writer's own value scores, by review id (DOS/Rate#1547).
  const [myValues, setMyValues] = useState<Record<string, MyReviewValue>>({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [starFilter, setStarFilter] = useState<StarFilter>('all');
  const [selectedPointCriterion, setSelectedPointCriterion] = useState<
    string | null
  >(null);

  const pointsOverview = useMemo(
    () =>
      selectProductPoints(productPoints, {
        categorySlug: effectiveCategorySlug,
        pointsReviewCount: productPointsReviewCount,
      }),
    [productPoints, effectiveCategorySlug, productPointsReviewCount]
  );
  const availablePointCriteria = useMemo(
    () => new Set(pointsOverview?.availableCriteria ?? []),
    [pointsOverview]
  );
  const showLegacyProsCons =
    !pointsOverview && (summary.pros.length > 0 || summary.cons.length > 0);

  // 5-Criteria Write Review Form State
  const v2Enabled = isReviewFormV2Enabled();
  const canWriteReview =
    Boolean(masterProductId) &&
    (!v2Enabled || hasRatingCriteria(cleanReviewCategorySlug));
  const [showWriteForm, setShowWriteForm] = useState(
    Boolean(defaultWriteFormOpen) && canWriteReview
  );
  const fieldId = useId();
  const writeFormId = `${fieldId}-write-form`;
  const reportDialogId = `${fieldId}-report-dialog`;

  useEffect(() => {
    const targetId = pendingReportFocusIdRef.current;
    if (reportingReviewId === null && targetId && !pendingIds[targetId]) {
      const targetBtn = reportButtonRefs.current[targetId];
      pendingReportFocusIdRef.current = null;
      targetBtn?.focus({ preventScroll: true });
    }
  }, [reportingReviewId, pendingIds]);

  const closeReportDialog = React.useCallback(
    (restoreFocus: boolean) => {
      if (restoreFocus && reportingReviewId) {
        pendingReportFocusIdRef.current = reportingReviewId;
      } else {
        pendingReportFocusIdRef.current = null;
      }
      setReportingReviewId(null);
    },
    [reportingReviewId]
  );
  const totalAnalyzedCount = Number(summary.total_analyzed);
  const hasAnalyzedReviews =
    Number.isFinite(totalAnalyzedCount) && totalAnalyzedCount > 0;
  const [authorName, setAuthorName] = useState('');
  const [variation, setVariation] = useState('');
  const [comment, setComment] = useState('');
  const [criteriaScores, setCriteriaScores] = useState<Record<string, number>>({
    screen: 5,
    performance: 5,
    camera: 5,
    battery: 5,
    value: 5,
  });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setUserVotes(parsed);
        }
      }
      const cacheKey = `${LOCAL_REVIEWS_PREFIX}${masterProductId || productSlug || productName}`;
      const savedLocal = window.localStorage.getItem(cacheKey);
      if (savedLocal) {
        const parsedLocal = JSON.parse(savedLocal);
        if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
          setAllReviews((prev) => {
            const existingIds = new Set(prev.map((x) => x.id));
            const uniqueNew = parsedLocal.filter(
              (x: ReviewItem) => x && x.id && !existingIds.has(x.id)
            );
            return [...uniqueNew, ...prev];
          });
        }
      }
    } catch {
      // Ignore storage access errors in private browsing
    }
  }, [masterProductId, productSlug, productName]);

  useEffect(
    () => () => {
      starFetchControllerRef.current?.abort();
      loadMoreControllerRef.current?.abort();
    },
    []
  );

  const effectiveStarCounts = useMemo(() => {
    if (starCountsProp) {
      if (sessionAddedReviews.length === 0) {
        return starCountsProp;
      }
      return addReviewStarCounts(
        starCountsProp,
        computeReviewStarCounts(sessionAddedReviews)
      );
    }
    return computeReviewStarCounts(allReviews);
  }, [starCountsProp, sessionAddedReviews, allReviews]);

  const counts = useMemo(() => {
    const authentic = allReviews.filter(
      (r) => r.include_in_rating && r.helpfulness_weight > 0
    ).length;
    const ignored = allReviews.filter(isFilteredOutReview).length;
    const expert = allReviews.filter(
      (r) => r.reviewer_type === 'expert'
    ).length;
    return {
      all: allReviews.length,
      authentic: authentic || authenticReviewCount,
      ignored: ignored || ignoredReviewCount,
      expert,
    };
  }, [allReviews, authenticReviewCount, ignoredReviewCount]);

  // Live JReviews weighted scores based on current review weights
  const liveScores = useMemo(() => {
    const validUserReviews = allReviews.filter(
      (r) =>
        r.reviewer_type !== 'expert' &&
        r.include_in_rating &&
        r.helpfulness_weight > 0
    );
    const validExpertReviews = allReviews.filter(
      (r) => r.reviewer_type === 'expert' && r.helpfulness_weight > 0
    );

    const {
      user: computedUser,
      bayesianUser: bayesianUserScore,
      bayesianConfidence,
      userWeightSum,
    } = computeJReviewsUserScores(
      allReviews,
      userRatingWeighted,
      averageRating
    );
    // The buyer score is the stored rating every page shows (D3); the list
    // only gives the weight and the confidence.
    const shownUserScore =
      ratingScore != null && ratingScore > 0 ? ratingScore : bayesianUserScore;
    const confidenceTier: 'insufficient_data' | 'low' | 'medium' | 'high' =
      bayesianConfidence < 0.3
        ? 'insufficient_data'
        : bayesianConfidence < 0.6
          ? 'low'
          : bayesianConfidence < 0.85
            ? 'medium'
            : 'high';
    const confidenceLabel =
      confidenceTier === 'insufficient_data'
        ? t('confidenceInsufficient')
        : confidenceTier === 'low'
          ? t('confidenceLow')
          : confidenceTier === 'medium'
            ? t('confidenceMedium')
            : t('confidenceHigh');

    let computedExpert: number | null = expertRating;
    if (validExpertReviews.length > 0) {
      const expWeightSum = validExpertReviews.reduce(
        (acc, r) => acc + r.helpfulness_weight,
        0
      );
      const expStars = validExpertReviews.reduce(
        (acc, r) => acc + r.rating_star * r.helpfulness_weight,
        0
      );
      if (expWeightSum > 0) {
        computedExpert = roundScore(expStars / expWeightSum, 2);
      }
    }

    // The buyer score the header shows, so a 100% buyer composite equals it
    // (DOS/Rate#1144).
    const dualScore = computeCombinedDualScore({
      userScore: shownUserScore,
      expertScore: computedExpert,
      userConfidence: bayesianConfidence,
      fallbackAverage: averageRating,
    });
    const starAnomaly = detectStarDistributionAnomaly(allReviews);

    const normalizedUserCriteria = validUserReviews.map((r) => ({
      weight: r.helpfulness_weight,
      ratings: normalizeReviewCriteriaRatings(
        effectiveCategorySlug,
        r.criteria_ratings
      ),
    }));

    const criteriaAverages = shownCriteriaMeta.map((crit) => {
      let wSum = 0;
      let valSum = 0;
      for (const entry of normalizedUserCriteria) {
        const cVal = entry.ratings[crit.key];
        if (typeof cVal === 'number' && cVal >= 1 && cVal <= 5) {
          wSum += entry.weight;
          valSum += cVal * entry.weight;
        }
      }
      if (wSum > 0) {
        return {
          ...crit,
          // Unrounded: printed once, at one decimal (D3, DOS/Rate#1647).
          score: (valSum / wSum) as number | null,
        };
      }
      return {
        ...crit,
        score: null as number | null,
      };
    });

    return {
      overall: dualScore.overall,
      isBlended: dualScore.isBlended,
      blendMode: dualScore.blendMode,
      starAnomaly,
      user: computedUser,
      bayesianUser: shownUserScore,
      bayesianConfidence,
      confidenceTier,
      confidenceLabel,
      userWeightSum: Number(userWeightSum.toFixed(2)),
      expert: computedExpert,
      criteriaAverages,
    };
  }, [
    allReviews,
    averageRating,
    userRatingWeighted,
    ratingScore,
    expertRating,
    effectiveCategorySlug,
    shownCriteriaMeta,
    t,
  ]);

  const activeStarSlice =
    starFilter !== 'all' ? starSlices[starFilter] : undefined;
  const activeSourceReviews = useMemo(() => {
    if (starFilter === 'all') {
      return allReviews;
    }
    if (activeStarSlice?.loaded) {
      const matchingSession = sessionAddedReviews.filter(
        (r) => Math.round(r.rating_star) === starFilter
      );
      return matchingSession.length > 0
        ? mergeLoadedReviews(matchingSession, activeStarSlice.reviews)
        : activeStarSlice.reviews;
    }
    return allReviews;
  }, [starFilter, activeStarSlice, allReviews, sessionAddedReviews]);

  const activeNextCursor =
    starFilter === 'all'
      ? allNextCursor
      : activeStarSlice?.loaded
        ? activeStarSlice.nextCursor
        : null;
  const activeKnownTotalCount =
    starFilter === 'all'
      ? allKnownTotalCount
      : activeStarSlice?.loaded
        ? activeStarSlice.totalCount
        : null;

  const filteredAndSortedReviews = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const filtered = activeSourceReviews.filter((r) => {
      if (activeTab === 'authentic') {
        if (!r.include_in_rating || r.helpfulness_weight <= 0) return false;
      } else if (activeTab === 'expert') {
        if (r.reviewer_type !== 'expert') return false;
      } else if (activeTab === 'ignored') {
        if (!isFilteredOutReview(r)) return false;
      }

      if (
        typeof starFilter === 'number' &&
        Math.round(r.rating_star) !== starFilter
      ) {
        return false;
      }

      if (kw) {
        const haystack = [
          r.comment || '',
          r.author_name || '',
          r.variation || '',
          r.reason || '',
          // The reason as shown, so a search in the active locale finds it.
          r.reason ? analyzerText(r.reason, tAnalyzer) : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'weight_desc') {
        // The public quality tier leads (DOS/Rate#1547, D7).
        return compareByQuality(a, b, computeWilsonLowerBound);
      }
      if (sortMode === 'rating_desc') {
        return b.rating_star - a.rating_star;
      }
      if (sortMode === 'rating_asc') {
        return a.rating_star - b.rating_star;
      }
      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });
  }, [
    activeSourceReviews,
    activeTab,
    sortMode,
    searchKeyword,
    starFilter,
    tAnalyzer,
  ]);

  // Ids of the reviews on the page, stable across votes, for the lookup below.
  const reviewIdsKey = useMemo(
    () =>
      [
        ...new Set(
          [...allReviews, ...activeSourceReviews]
            .map((r) => r.id)
            .filter(isReviewId)
        ),
      ]
        .slice(0, MY_REVIEW_VALUES_MAX_IDS)
        .sort()
        .join(','),
    [allReviews, activeSourceReviews]
  );

  // A signed-in writer sees the value score and gaps of their own reviews
  // (DOS/Rate#1547, D7). Visitors without a session cookie make no call and
  // never load the Supabase client.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Without a session, or on any failure, no number stays on screen.
      let next: Record<string, MyReviewValue> = {};
      try {
        const token =
          reviewIdsKey && hasSessionCookie(document.cookie)
            ? await getBrowserAccessToken()
            : null;
        if (token && !cancelled) {
          const res = await fetch('/api/v1/rate/reviews/my-values', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ids: reviewIdsKey.split(',') }),
          });
          const payload = res.ok ? await res.json() : null;
          for (const row of Array.isArray(payload?.values)
            ? payload.values
            : []) {
            const value = parseMyReviewValue(row?.score, { gaps: row?.gaps });
            if (isReviewId(row?.id) && value) {
              next[row.id.toLowerCase()] = value;
            }
          }
        }
      } catch {
        // The hint is optional; the page works without it.
        next = {};
      }
      if (!cancelled) setMyValues(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewIdsKey]);

  function updateReviewAcrossLists(
    reviewId: string,
    updater: (r: ReviewItem) => ReviewItem
  ) {
    setAllReviews((prevList) =>
      prevList.map((r) => (r.id === reviewId ? updater(r) : r))
    );
    setSessionAddedReviews((prevList) =>
      prevList.map((r) => (r.id === reviewId ? updater(r) : r))
    );
    setStarSlices((prev) => {
      let changed = false;
      const next: Partial<Record<ReviewStarTier, StarSliceState>> = {};
      for (const tier of STAR_TIERS_DESC) {
        const slice = prev[tier];
        if (!slice) continue;
        if (slice.reviews.some((r) => r.id === reviewId)) {
          changed = true;
          next[tier] = {
            ...slice,
            reviews: slice.reviews.map((r) =>
              r.id === reviewId ? updater(r) : r
            ),
          };
        } else {
          next[tier] = slice;
        }
      }
      return changed ? next : prev;
    });
  }

  async function fetchStarSlice(star: ReviewStarTier) {
    if (!masterProductId && !productSlug) return;
    starFetchControllerRef.current?.abort();
    const controller = new AbortController();
    starFetchControllerRef.current = controller;
    setStarFilterLoading(true);
    setStarFilterError(null);
    try {
      const params = new URLSearchParams();
      if (masterProductId) {
        params.set('masterProductId', masterProductId);
      } else if (productSlug) {
        params.set('slug', productSlug);
      }
      params.set('star', String(star));
      params.set('limit', '50');
      const res = await fetch(`/api/v1/rate/reviews?${params.toString()}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (res.status === 429) {
        setStarFilterError(t('loadMoreReviewsRateLimit'));
        return;
      }
      if (!res.ok) {
        setStarFilterError(t('starFilterLoadError'));
        return;
      }
      const payload = (await res.json()) as {
        ok?: boolean;
        data?: ReviewItem[];
        nextCursor?: string | null;
        totalCount?: number;
      };
      if (controller.signal.aborted) return;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setStarFilterError(t('starFilterLoadError'));
        return;
      }
      const nextCursorVal =
        typeof payload.nextCursor === 'string' && payload.nextCursor
          ? payload.nextCursor
          : null;
      const nextTotalVal =
        typeof payload.totalCount === 'number' &&
        Number.isFinite(payload.totalCount) &&
        payload.totalCount >= 0
          ? payload.totalCount
          : null;
      setStarSlices((prev) => ({
        ...prev,
        [star]: {
          reviews: payload.data ?? [],
          nextCursor: nextCursorVal,
          totalCount: nextTotalVal,
          loaded: true,
        },
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (controller.signal.aborted) return;
      setStarFilterError(t('starFilterLoadError'));
    } finally {
      if (starFetchControllerRef.current === controller) {
        setStarFilterLoading(false);
      }
    }
  }

  function handleSelectStarFilter(nextFilter: StarFilter) {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadingMore(false);
    setLoadMoreError(null);
    starFetchControllerRef.current?.abort();
    starFetchControllerRef.current = null;
    setStarFilterError(null);
    setStarFilter(nextFilter);

    if (nextFilter === 'all') {
      setStarFilterLoading(false);
      return;
    }

    if (
      allNextCursor === null ||
      (!masterProductId && !productSlug) ||
      starSlices[nextFilter]?.loaded ||
      (starCountsProp != null && effectiveStarCounts[nextFilter] === 0)
    ) {
      setStarFilterLoading(false);
      return;
    }

    void fetchStarSlice(nextFilter);
  }

  async function handleVote(
    reviewId: string,
    clickedVote: VoteChoice,
    reportReason?: ReviewReportReason
  ) {
    if (pendingIds[reviewId]) return;

    const prevVote: VoteChoice | null = userVotes[reviewId] || null;
    const nextAction: VoteChoice | 'clear' =
      prevVote === clickedVote ? 'clear' : clickedVote;

    // Only this review's entry changes: votes on other reviews may be in
    // flight, so the map is never restored from a render-time copy
    // (DOS/Rate#799).
    const setVoteFor = (choice: VoteChoice | null) => {
      setUserVotes((prev) => {
        const next = { ...prev };
        if (choice) {
          next[reviewId] = choice;
        } else {
          delete next[reviewId];
        }
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
    };

    // Kept to roll back the optimistic update when the server refuses the
    // vote for a signed-in reader (DOS/Rate#790).
    const reviewBefore =
      allReviews.find((r) => r.id === reviewId) ??
      activeSourceReviews.find((r) => r.id === reviewId);
    const rollBack = (notice: string) => {
      if (reviewBefore) {
        updateReviewAcrossLists(reviewId, () => reviewBefore);
      }
      setVoteFor(prevVote);
      setAuthNotice(notice);
    };

    // Optimistic state update using the canonical SQL/Importer JReviews weight formula
    setPendingIds((prev) => ({ ...prev, [reviewId]: true }));
    updateReviewAcrossLists(reviewId, (r) => {
      let u = r.upvotes;
      let d = r.downvotes;
      let rep = r.report_count;

      if (prevVote === 'up') u = Math.max(0, u - 1);
      if (prevVote === 'down') d = Math.max(0, d - 1);
      if (prevVote === 'report') rep = Math.max(0, rep - 1);

      if (nextAction === 'up') u += 1;
      if (nextAction === 'down') d += 1;
      if (nextAction === 'report') rep += 1;

      const nextWeight = computeJReviewsWeight({
        upvotes: u,
        downvotes: d,
        reports: rep,
        flagCategory: r.flag_category,
        verdict: r.verdict,
        includeInRating: r.include_in_rating,
      });
      return {
        ...r,
        upvotes: u,
        downvotes: d,
        report_count: rep,
        helpfulness_weight: nextWeight,
      };
    });

    setVoteFor(nextAction === 'clear' ? null : nextAction);

    try {
      const bearerToken = await getBrowserAccessToken();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
      }

      const res = await fetch(`/api/reviews/${reviewId}/vote`, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildReviewVoteRequestBody(
            nextAction,
            nextAction === 'report' ? reportReason : undefined
          )
        ),
      });
      if (res.ok) {
        const payload = await res.json();
        setAuthNotice(null);
        if (payload && typeof payload.helpfulnessWeight === 'number') {
          updateReviewAcrossLists(reviewId, (r) => ({
            ...r,
            upvotes: Number(payload.upvotes ?? r.upvotes),
            downvotes: Number(payload.downvotes ?? r.downvotes),
            report_count: Number(payload.reports ?? r.report_count),
            helpfulness_weight: Number(payload.helpfulnessWeight),
          }));
        }
      } else if (res.status === 401) {
        // Signed out: the vote stays as a browser-only simulation.
        setAuthNotice(t('authVoteNotice'));
      } else {
        const payload = (await res.json().catch(() => null)) as {
          code?: string;
        } | null;
        rollBack(
          payload?.code === 'VOTER_NOT_ELIGIBLE'
            ? t('voteNotEligibleNotice')
            : payload?.code === 'RATE_LIMIT_EXCEEDED' || res.status === 429
              ? t('voteRateLimitNotice')
              : t('voteFailedNotice')
        );
      }
    } catch (err) {
      console.error('Failed to sync review vote:', err);
      rollBack(t('voteFailedNotice'));
    } finally {
      setPendingIds((prev) => ({ ...prev, [reviewId]: false }));
    }
  }

  async function handleLoadMoreReviews() {
    const cursorToFetch = activeNextCursor;
    const targetFilter = starFilter;
    if (!cursorToFetch || loadingMore || (!masterProductId && !productSlug)) {
      return;
    }
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const params = new URLSearchParams();
      if (masterProductId) {
        params.set('masterProductId', masterProductId);
      } else if (productSlug) {
        params.set('slug', productSlug);
      }
      if (targetFilter !== 'all') {
        params.set('star', String(targetFilter));
      }
      params.set('limit', '50');
      params.set('cursor', cursorToFetch);
      const res = await fetch(`/api/v1/rate/reviews?${params.toString()}`, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (res.status === 429) {
        setLoadMoreError(t('loadMoreReviewsRateLimit'));
        return;
      }
      if (!res.ok) {
        setLoadMoreError(t('loadMoreReviewsError'));
        return;
      }
      const payload = (await res.json()) as {
        ok?: boolean;
        data?: ReviewItem[];
        nextCursor?: string | null;
        totalCount?: number;
      };
      if (controller.signal.aborted) return;
      if (!payload?.ok || !Array.isArray(payload.data)) {
        setLoadMoreError(t('loadMoreReviewsError'));
        return;
      }
      const nextCursorVal =
        typeof payload.nextCursor === 'string' && payload.nextCursor
          ? payload.nextCursor
          : null;
      const nextTotalVal =
        typeof payload.totalCount === 'number' &&
        Number.isFinite(payload.totalCount) &&
        payload.totalCount >= 0
          ? payload.totalCount
          : null;
      if (targetFilter === 'all') {
        setAllReviews((prev) => mergeLoadedReviews(prev, payload.data ?? []));
        setAllNextCursor(nextCursorVal);
        if (nextTotalVal !== null) {
          setAllKnownTotalCount(nextTotalVal);
        }
      } else {
        setStarSlices((prev) => {
          const existing = prev[targetFilter];
          return {
            ...prev,
            [targetFilter]: {
              reviews: mergeLoadedReviews(
                existing?.reviews ?? [],
                payload.data ?? []
              ),
              nextCursor: nextCursorVal,
              totalCount: nextTotalVal ?? existing?.totalCount ?? null,
              loaded: true,
            },
          };
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (controller.signal.aborted) return;
      setLoadMoreError(t('loadMoreReviewsError'));
    } finally {
      if (loadMoreControllerRef.current === controller) {
        setLoadingMore(false);
      }
    }
  }

  async function handleSubmitCommunityReview(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const cleanComment = comment.trim();
    if (cleanComment.length < 15) {
      setSubmitError(t('errCommentTooShort'));
      return;
    }

    if (!masterProductId) {
      setSubmitError(t('errMissingMasterId'));
      return;
    }

    setSubmittingReview(true);
    try {
      const avgStar = Math.round(
        Object.values(criteriaScores).reduce((a, b) => a + b, 0) /
          Object.values(criteriaScores).length
      );
      const res = await fetch('/api/v1/rate/reviews', {
        method: 'POST',
        headers: await jsonWriteHeaders(),
        body: JSON.stringify({
          masterProductId,
          authorName: authorName.trim() || t('defaultAuthorName'),
          variation: variation.trim() || undefined,
          ratingStar: avgStar,
          comment: cleanComment,
          criteriaRatings: criteriaScores,
        }),
      });

      if (res.status === 401) {
        setSubmitError(t('errLoginRequired'));
        return;
      }
      const payload = await res.json();
      if (!res.ok || !payload?.ok || !payload?.review) {
        setSubmitError(t(submitErrorKey(payload?.code)));
        return;
      }

      setComment('');
      handleReviewStored(payload.review as ReviewItem);
    } catch {
      setSubmitError(t('errNetworkFailed'));
    } finally {
      setSubmittingReview(false);
    }
  }

  /** Shows a stored review at the top and says how it was classified. */
  function handleReviewStored(newRev: ReviewItem) {
    setAllReviews((prev) => mergeLoadedReviews([newRev], prev));
    setSessionAddedReviews((prev) => mergeLoadedReviews([newRev], prev));
    setAllKnownTotalCount((prev) => (prev !== null ? prev + 1 : null));

    try {
      const cacheKey = `${LOCAL_REVIEWS_PREFIX}${masterProductId || productSlug || productName}`;
      const existingLocal = JSON.parse(
        window.localStorage.getItem(cacheKey) || '[]'
      );
      const nextLocal = [
        newRev,
        ...(Array.isArray(existingLocal) ? existingLocal : []),
      ].slice(0, 20);
      window.localStorage.setItem(cacheKey, JSON.stringify(nextLocal));
    } catch {
      // Ignore storage quota errors
    }

    setShowWriteForm(false);
    setSubmitSuccess(
      newRev.verdict === 'unanalyzed'
        ? t('successPendingModeration')
        : newRev.include_in_rating
          ? t('successPublishedAuthentic', {
              weight: formatDecimal(newRev.helpfulness_weight, locale, 2),
            })
          : t('successFlaggedFiltered', {
              flag:
                flagMetaMap[newRev.flag_category]?.label ??
                newRev.flag_category,
            })
    );
  }

  const [copiedReviewsMd, setCopiedReviewsMd] = useState(false);

  const handleCopyReviewsMarkdown = async () => {
    if (
      typeof navigator === 'undefined' ||
      filteredAndSortedReviews.length === 0
    )
      return;
    const md = buildJReviewsMarkdown({
      productName,
      reviews: filteredAndSortedReviews,
      radarSignal,
      locale,
    });

    try {
      await navigator.clipboard.writeText(md);
      setCopiedReviewsMd(true);
      setTimeout(() => setCopiedReviewsMd(false), 2500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadReviewsCsv = () => {
    if (
      typeof document === 'undefined' ||
      filteredAndSortedReviews.length === 0
    )
      return;
    const headers = [
      'ReviewID',
      'Author',
      'ReviewerType',
      'RatingStar',
      'HelpfulnessWeight',
      'IncludeInRating',
      'FlagCategory',
      'Verdict',
      'Upvotes',
      'Downvotes',
      'CreatedAt',
      ...RADAR_CSV_HEADERS,
      'Comment',
    ];
    const rows = filteredAndSortedReviews.map((r) => [
      r.id,
      r.author_name,
      r.reviewer_type,
      String(r.rating_star),
      r.helpfulness_weight.toFixed(2),
      r.include_in_rating ? 'true' : 'false',
      reviewBadgeKind(r),
      r.verdict || 'authentic',
      String(r.upvotes),
      String(r.downvotes),
      r.created_at,
      ...radarCsvCells(radarSignal),
      r.comment.replace(/\r?\n/g, ' '),
    ]);
    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsvCell).join(','),
        ...rows.map((row) => row.map(escapeCsvCell).join(',')),
      ].join('\r\n');

    const safeExportSlug = sanitizeJReviewsExportSlug(productSlug);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-jreviews-${safeExportSlug}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadReviewsJson = () => {
    if (
      typeof document === 'undefined' ||
      filteredAndSortedReviews.length === 0
    )
      return;
    const safeExportSlug = sanitizeJReviewsExportSlug(productSlug);
    const payload = {
      source: 'Rate.vn JReviews AI-checked buyer reviews',
      productSlug: safeExportSlug,
      productName,
      exportedAt: new Date().toISOString(),
      deal_radar: radarExportFields(radarSignal),
      reviewCount: filteredAndSortedReviews.length,
      reviews: filteredAndSortedReviews,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-jreviews-${safeExportSlug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="jreviews-section"
      className="card rounded-4 p-md-5 border-0 p-4 shadow-sm"
    >
      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <div>
          <h2 className="h4 fw-bold d-flex align-items-center mb-1 gap-2">
            <BsStarFill aria-hidden="true" className="text-warning" />{' '}
            {t('sectionHeading')}
          </h2>
          <p className="text-muted small mb-0">
            {t('sectionSubtitle', { productName })}
          </p>
        </div>
        <div className="d-flex align-items-center flex-wrap gap-2">
          <ExportMenu label={t('exportMenu')}>
            {(close) => (
              <>
                <button
                  type="button"
                  onClick={handleCopyReviewsMarkdown}
                  data-testid="copy-reviews-md-btn"
                >
                  {copiedReviewsMd
                    ? t('copiedReviewsMd')
                    : t('copyReviewsMdBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadReviewsCsv();
                    close();
                  }}
                  data-testid="download-reviews-csv-btn"
                >
                  {t('exportReviewsCsvBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleDownloadReviewsJson();
                    close();
                  }}
                  data-testid="download-reviews-json-btn"
                >
                  {t('exportJsonBtn')}
                </button>
              </>
            )}
          </ExportMenu>
          {/* v2 rates a category's own criteria: a category without a
              list has no form, as the RPC refuses it (DOS/Rate#1544). */}
          {canWriteReview && (
            <button
              type="button"
              aria-expanded={showWriteForm}
              aria-controls={showWriteForm ? writeFormId : undefined}
              onClick={() => {
                setShowWriteForm((v) => !v);
                setSubmitError(null);
              }}
              className="btn btn-primary btn-sm rounded-pill fw-medium px-3 py-2"
            >
              {showWriteForm ? t('closeFormBtn') : t('openWriteFormBtn')}
            </button>
          )}
          <span className="badge bg-dark rounded-pill small px-3 py-2 text-white">
            {t('dualRatingStandardBadge')}
          </span>
        </div>
      </div>

      {submitSuccess && (
        <div className="alert alert-success small rounded-3 d-flex justify-content-between align-items-center mb-4 px-3 py-2">
          <span>
            <BsCheckCircle aria-hidden="true" className="me-1" />
            {submitSuccess}
          </span>
          <button
            type="button"
            className="btn-close btn-sm"
            aria-label={t('closeAlertAria')}
            onClick={() => setSubmitSuccess(null)}
          />
        </div>
      )}

      {/* Review form v2 behind its flag (DOS/Rate#1544) */}
      {canWriteReview && showWriteForm && v2Enabled && (
        <div id={writeFormId}>
          <ReviewFormV2
            key={masterProductId ?? productSlug ?? productName}
            masterProductId={masterProductId}
            productName={productName}
            categorySlug={cleanReviewCategorySlug ?? undefined}
            defaultAuthorName={t('defaultAuthorName')}
            onStored={handleReviewStored}
          />
        </div>
      )}

      {/* Interactive 5-Criteria Write Review Form */}
      {canWriteReview && showWriteForm && !v2Enabled && (
        <form
          id={writeFormId}
          onSubmit={handleSubmitCommunityReview}
          className="border-primary border-opacity-25 rounded-4 bg-light mb-4 border p-4"
        >
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h3 className="h6 fw-bold text-dark mb-0">
              {t('writeFormHeading', { productName })}
            </h3>
            <span className="badge bg-primary-subtle text-primary rounded-pill small">
              {t('aiModerationBadge')}
            </span>
          </div>

          {submitError && (
            <div className="alert alert-danger small rounded-3 mb-3 px-3 py-2">
              <BsExclamationTriangle aria-hidden="true" className="me-1" />
              {submitError}
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-md-6 col-12">
              <label
                className="form-label small fw-semibold mb-1"
                htmlFor={`${fieldId}-author`}
              >
                {t('authorNameLabel')}
              </label>
              <input
                id={`${fieldId}-author`}
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder={t('authorNamePlaceholder')}
                className="form-control form-control-sm rounded-3"
                maxLength={80}
              />
            </div>
            <div className="col-md-6 col-12">
              <label
                className="form-label small fw-semibold mb-1"
                htmlFor={`${fieldId}-variation`}
              >
                {t('variationLabel')}
              </label>
              <input
                id={`${fieldId}-variation`}
                type="text"
                value={variation}
                onChange={(e) => setVariation(e.target.value)}
                placeholder={t('variationPlaceholder')}
                className="form-control form-control-sm rounded-3"
                maxLength={100}
              />
            </div>
          </div>

          {/* 5 Criteria Sliders / Star Selectors */}
          <div className="rounded-3 mb-3 border bg-white p-3">
            <div className="small fw-semibold text-dark mb-2">
              {t('rate5CriteriaPrompt')}
            </div>
            <div className="row g-2">
              {criteriaMeta.map((crit) => {
                const score = criteriaScores[crit.key] ?? 5;
                return (
                  <div
                    key={crit.key}
                    className="col-lg col-md-4 col-sm-6 col-12"
                  >
                    <div className="rounded-3 bg-light h-100 border p-2">
                      <div className="small text-muted mb-1">{crit.label}</div>
                      <div className="d-flex align-items-center justify-content-between">
                        <div
                          className="btn-group btn-group-sm"
                          role="group"
                          aria-label={crit.label}
                        >
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              aria-pressed={star === score}
                              aria-label={`${crit.label}: ${star}/5 ★`}
                              onClick={() =>
                                setCriteriaScores((prev) => ({
                                  ...prev,
                                  [crit.key]: star,
                                }))
                              }
                              className={`btn btn-sm px-2 py-0 ${
                                star <= score
                                  ? 'btn-warning text-dark'
                                  : 'btn-outline-secondary'
                              }`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        <span className="fw-bold small ms-1">{score}/5</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-3">
            <label
              className="form-label small fw-semibold mb-1"
              htmlFor={`${fieldId}-comment`}
            >
              {t('commentLabel')}
            </label>
            <textarea
              id={`${fieldId}-comment`}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t('commentPlaceholder')}
              className="form-control form-control-sm rounded-3"
              required
            />
          </div>

          <div className="d-flex justify-content-between align-items-center">
            <span className="text-muted small">
              {t('avg5CriteriaLabel')}{' '}
              <strong className="text-danger">
                {formatRatingValue(
                  Object.values(criteriaScores).reduce((a, b) => a + b, 0) /
                    Object.values(criteriaScores).length,
                  locale,
                  1
                )}{' '}
                ★
              </strong>
            </span>
            <button
              type="submit"
              disabled={submittingReview}
              className="btn btn-primary btn-sm rounded-pill fw-medium px-4 py-2"
            >
              {submittingReview ? t('submittingAiBtn') : t('submitJReviewsBtn')}
            </button>
          </div>
        </form>
      )}

      {authNotice && (
        <div className="alert alert-info small rounded-3 d-flex justify-content-between align-items-center mb-4 px-3 py-2">
          <span>
            <BsInfoCircle aria-hidden="true" className="me-1" />
            {authNotice}
          </span>
          <button
            type="button"
            className="btn-close btn-sm"
            aria-label={t('closeAlertAria')}
            onClick={() => setAuthNotice(null)}
          />
        </div>
      )}

      {/* 1. JReviews Dual Rating Scoreboard (DESIGN.md v3.0) */}
      <div className="row g-3 mb-4">
        {/* Overall Combined Score */}
        <div className="col-md-4 col-12">
          <div className="rate-scoreboard-dark d-flex flex-column justify-content-between h-100 p-4">
            <div>
              <div className="text-uppercase small fw-bold text-white-50 mb-1">
                {t('overallScoreTitle')}
              </div>
              <div className="my-2">
                <StarRating
                  value={liveScores.overall}
                  size="lg"
                  testId="jreviews-overall-score"
                />
              </div>
            </div>
            <div className="small text-white-50 border-top border-secondary border-opacity-25 mt-2 pt-2">
              {t(blendNoteKey(liveScores.blendMode))}
            </div>
          </div>
        </div>

        {/* Weighted Authentic User Score */}
        <div className="col-md-4 col-12">
          <div className="rounded-4 d-flex flex-column justify-content-between h-100 border bg-white p-4">
            <div>
              <div className="text-uppercase small fw-bold text-primary mb-1">
                {t('authenticUserScoreTitle')}
              </div>
              {/* No fading for thin data: the confidence badge below says
              so, and faded text fails contrast (DOS/Rate#1528). */}
              <div className="my-2">
                <StarRating
                  value={liveScores.bayesianUser}
                  count={
                    liveScores.bayesianUser != null ? counts.authentic : null
                  }
                  size="lg"
                  testId="jreviews-user-score"
                  // How the score is computed, kept as a tooltip (DOS/Rate#1528).
                  title={t('basedOnAuthenticReviews', {
                    count: counts.authentic,
                    // The cs decimal comma, as avgScore (DOS/Rate#1411).
                    weightSum: formatPlainNumber(
                      liveScores.userWeightSum,
                      locale
                    ),
                    avgScore:
                      liveScores.user != null
                        ? formatRatingValue(liveScores.user, locale, 2)
                        : 'N/A',
                  })}
                />
              </div>
            </div>
            <div className="d-flex border-top mt-2 flex-wrap gap-2 pt-2">
              <span
                className={`badge small ${
                  liveScores.confidenceTier === 'high' ||
                  liveScores.confidenceTier === 'medium'
                    ? 'bg-primary-subtle text-primary'
                    : liveScores.confidenceTier === 'low'
                      ? 'bg-warning-subtle text-warning-emphasis'
                      : 'bg-secondary-subtle text-secondary'
                }`}
                title={t('bayesianConfidenceTooltip', {
                  pct: formatPlainNumber(
                    Math.round(liveScores.bayesianConfidence * 100),
                    locale
                  ),
                })}
              >
                <BsBarChart aria-hidden="true" className="me-1" />
                {liveScores.confidenceLabel} (
                {formatPercent(
                  Math.round(liveScores.bayesianConfidence * 100),
                  locale
                )}
                )
              </span>
              {counts.ignored > 0 && (
                <span className="badge bg-danger-subtle text-danger small">
                  {t('blockedSeedingBadge', { count: counts.ignored })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expert Review Score */}
        <div className="col-md-4 col-12">
          <div className="rounded-4 d-flex flex-column justify-content-between h-100 border bg-white p-4">
            <div>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="text-uppercase small fw-bold text-dark">
                  {t('expertLabScoreTitle')}
                </span>
                {liveScores.expert == null && (
                  <span className="rate-score-badge-expert">
                    {t('expertPendingShort')}
                  </span>
                )}
              </div>
              {liveScores.expert != null ? (
                <>
                  <div className="d-flex align-items-baseline my-2 gap-2">
                    {/* On 10, as the scoreboard above shows it. */}
                    <span className="display-6 fw-bold text-dark font-monospace">
                      {formatRatingValue(liveScores.expert * 2, locale, 1)}
                    </span>
                    <span className="text-muted small">/10</span>
                  </div>
                  <div className="small text-secondary">
                    {expertReviewSummary ? (
                      <span lang={contentLang(expertReviewSummary, locale)}>
                        {expertReviewSummary}
                      </span>
                    ) : (
                      t('defaultExpertSummary')
                    )}
                  </div>
                </>
              ) : (
                <div className="my-3">
                  <div className="fw-semibold text-secondary small mb-1">
                    {t('updatingLabTestsTitle')}
                  </div>
                  <p className="text-muted small mb-0">
                    {t('updatingLabTestsDesc')}
                  </p>
                </div>
              )}
            </div>
            <div className="small text-muted border-top mt-2 pt-2">
              {counts.expert > 0
                ? t('expertReviewsCountNote', { count: counts.expert })
                : t('zeroAdDilutionNote')}
            </div>
          </div>
        </div>
      </div>

      {/* 1a. 5-to-1 Star Rating Histogram */}
      <div
        className="rounded-4 p-md-4 mb-4 border bg-white p-3"
        data-testid="review-star-histogram"
        role="group"
        aria-label={t('starHistogramHeading')}
      >
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <span className="small fw-bold text-uppercase text-secondary">
            {t('starHistogramHeading')}
          </span>
          <span className="small text-muted">
            {t('starHistogramTotal', {
              count: formatNumber(effectiveStarCounts.total, locale),
            })}
          </span>
        </div>
        <div className="d-flex flex-column gap-2">
          {STAR_TIERS_DESC.map((star) => {
            const count = effectiveStarCounts[star];
            const total = effectiveStarCounts.total;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const isSelected = starFilter === star;
            const isZero = count === 0;
            return (
              <button
                key={star}
                type="button"
                aria-pressed={isSelected}
                data-testid={`review-star-histogram-btn-${star}`}
                onClick={() =>
                  handleSelectStarFilter(isSelected ? 'all' : star)
                }
                className={`rate-star-hist-btn${isSelected ? ' is-selected' : ''}${isZero ? ' is-empty' : ''}`}
              >
                <span className="rate-star-hist-label">
                  {star} <span className="rate-star-hist-star">★</span>
                </span>
                <span className="rate-star-hist-track" aria-hidden="true">
                  <span
                    className="rate-star-hist-fill"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="rate-star-hist-meta">
                  <span className="fw-semibold font-monospace">
                    {formatNumber(count, locale)}
                  </span>{' '}
                  <span className="rate-star-hist-pct">
                    ({formatPercent(pct, locale)})
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1b. JReviews 5-Criteria Aggregated Breakdown */}
      <div className="rounded-4 p-md-4 mb-4 border bg-white p-3">
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <span className="small fw-bold text-uppercase text-secondary">
            {t('criteriaMatrixHeading')}
          </span>
          <span className="badge bg-light text-secondary rounded-pill small border">
            {t('normalizedByHelpfulnessBadge')}
          </span>
        </div>
        {availablePointCriteria.size > 0 && (
          <span
            id={`${fieldId}-points-filter-desc`}
            className="visually-hidden"
          >
            {t('pointsCriterionHint')}
          </span>
        )}
        <div className="row g-3">
          {liveScores.criteriaAverages.map((crit) => {
            const pct =
              crit.score != null
                ? Math.min(
                    100,
                    Math.max(10, Math.round((crit.score / 5) * 100))
                  )
                : 0;
            const canFilterPoints = availablePointCriteria.has(crit.key);
            const isCriterionSelected =
              canFilterPoints && selectedPointCriterion === crit.key;
            const cardInner = (
              <>
                <span className="d-flex justify-content-between align-items-center small mb-1">
                  <span className="text-muted fw-medium">{crit.label}</span>
                  <strong className="text-dark font-monospace">
                    {crit.score != null
                      ? `${formatRatingValue(crit.score, locale, 1)}/5`
                      : t('notAvailableShort')}
                  </strong>
                </span>
                <span
                  className="progress d-flex rounded-pill"
                  style={{ height: '6px' }}
                  aria-hidden="true"
                >
                  <span
                    className="progress-bar bg-warning"
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </>
            );
            return (
              <div
                key={crit.key}
                data-criterion-card={crit.key}
                className="col-lg col-md-4 col-sm-6 col-12"
              >
                {canFilterPoints ? (
                  <button
                    type="button"
                    aria-pressed={isCriterionSelected}
                    aria-describedby={`${fieldId}-points-filter-desc`}
                    data-testid={`jreviews-criterion-${crit.key}`}
                    onClick={() =>
                      setSelectedPointCriterion((prev) =>
                        prev === crit.key ? null : crit.key
                      )
                    }
                    className="rate-crit-card-btn rounded-3 h-100 p-2 px-3"
                  >
                    {cardInner}
                  </button>
                ) : (
                  <div className="rounded-3 bg-light h-100 border p-2 px-3">
                    {cardInner}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 1c. Product Pros & Cons from rate.product_points (DOS/Rate#1624, design 7.1) */}
      <ProductPointsBlock
        points={productPoints}
        categorySlug={effectiveCategorySlug}
        pointsReviewCount={productPointsReviewCount}
        selectedCriterion={selectedPointCriterion}
        onSelectCriterion={setSelectedPointCriterion}
      />

      {liveScores.starAnomaly.isAnomalous && (
        <div
          className="alert alert-warning rounded-4 small d-flex align-items-center mb-4 gap-2 px-3 py-2"
          data-testid="star-distribution-anomaly-alert"
        >
          <BsExclamationTriangle aria-hidden="true" className="flex-shrink-0" />
          <span>
            {t('starAnomalyWarning', {
              fiveStarPct: formatPlainNumber(
                liveScores.starAnomaly.fiveStarRatioPct,
                locale
              ),
              lowEffortPct: formatPlainNumber(
                liveScores.starAnomaly.lowEffortOrSeedingRatioPct,
                locale
              ),
            })}
          </span>
        </div>
      )}

      {/* 2. AI Review Synthesis (Pros / Cons / Authenticity Bar) */}
      <div className="rounded-4 bg-light mb-4 border p-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-3 gap-2">
          <div className="fw-bold text-dark d-flex align-items-center gap-2">
            <BsRobot aria-hidden="true" /> {t('aiAuthenticityHeading')}
          </div>
          {hasAnalyzedReviews ? (
            <div className="d-flex small flex-wrap gap-2">
              <span className="badge bg-success text-white">
                {t('authenticPctBadge', {
                  pct: formatPlainNumber(
                    sanitizeJReviewsPercentage(summary.authentic_pct),
                    locale
                  ),
                })}
              </span>
              <span className="badge bg-warning text-dark">
                {t('suspiciousPctBadge', {
                  pct: formatPlainNumber(
                    sanitizeJReviewsPercentage(summary.suspicious_pct),
                    locale
                  ),
                })}
              </span>
              <span className="badge bg-danger text-white">
                {t('fakePctBadge', {
                  pct: formatPlainNumber(
                    sanitizeJReviewsPercentage(summary.fake_pct),
                    locale
                  ),
                })}
              </span>
            </div>
          ) : (
            <span
              className="badge bg-secondary-subtle text-secondary rounded-pill small"
              data-testid="jreviews-authenticity-empty-badge"
            >
              {t('notAvailableShort')}
            </span>
          )}
        </div>

        {/* Progress Bar: draws the badge percentages above, so it is hidden
            from assistive tech rather than labelled (DOS/Rate#1071). */}
        {hasAnalyzedReviews ? (
          <div
            className={`progress rounded-pill ${
              summary.ai_summary || showLegacyProsCons ? 'mb-3' : 'mb-0'
            }`}
            style={{ height: '10px' }}
            aria-hidden="true"
          >
            <div
              className="progress-bar bg-success"
              style={{
                width: `${sanitizeJReviewsPercentage(summary.authentic_pct)}%`,
              }}
              title={t('authenticPctBadge', {
                pct: formatPlainNumber(
                  sanitizeJReviewsPercentage(summary.authentic_pct),
                  locale
                ),
              })}
            />
            <div
              className="progress-bar bg-warning"
              style={{
                width: `${sanitizeJReviewsPercentage(summary.suspicious_pct)}%`,
              }}
              title={t('suspiciousPctBadge', {
                pct: formatPlainNumber(
                  sanitizeJReviewsPercentage(summary.suspicious_pct),
                  locale
                ),
              })}
            />
            <div
              className="progress-bar bg-danger"
              style={{
                width: `${sanitizeJReviewsPercentage(summary.fake_pct)}%`,
              }}
              title={t('fakePctBadge', {
                pct: formatPlainNumber(
                  sanitizeJReviewsPercentage(summary.fake_pct),
                  locale
                ),
              })}
            />
          </div>
        ) : (
          <div
            className={`small text-muted ${
              summary.ai_summary || showLegacyProsCons ? 'mb-3' : 'mb-0'
            }`}
            data-testid="jreviews-authenticity-empty-note"
          >
            {t('blendNoteInsufficientData')}
          </div>
        )}

        {summary.ai_summary && (
          <div
            className={`rounded-3 small text-dark border bg-white p-3 ${
              showLegacyProsCons ? 'mb-3' : 'mb-0'
            }`}
          >
            <strong>{t('aiSummaryPrefix')}</strong>{' '}
            <AnalyzerText text={summary.ai_summary} />
          </div>
        )}

        {showLegacyProsCons && (
          <div className="row g-3">
            <div className="col-md-6 col-12">
              <div className="rounded-3 h-100 border bg-white p-3">
                <div className="fw-semibold text-success small mb-2">
                  {t('prosHeading')}
                </div>
                {summary.pros.length === 0 ? (
                  <div className="text-muted small">{t('prosEmpty')}</div>
                ) : (
                  <ul className="small text-secondary mb-0 ps-3">
                    {summary.pros.map((pro, idx) => (
                      <li key={idx} className="mb-1">
                        <AnalyzerText text={pro} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="col-md-6 col-12">
              <div className="rounded-3 h-100 border bg-white p-3">
                <div className="fw-semibold text-danger small mb-2">
                  {t('consHeading')}
                </div>
                {summary.cons.length === 0 ? (
                  <div className="text-muted small">{t('consEmpty')}</div>
                ) : (
                  <ul className="small text-secondary mb-0 ps-3">
                    {summary.cons.map((con, idx) => (
                      <li key={idx} className="mb-1">
                        <AnalyzerText text={con} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Filter Tabs, Keyword Search, Star Filter & Sort Controls */}
      <div className="d-flex flex-column mb-4 gap-3">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
          {/* Filter toggles, not tabs with panels: a labelled group. */}
          <div
            className="d-flex flex-wrap gap-2"
            role="group"
            aria-label={t('filterGroupAria')}
          >
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              aria-pressed={activeTab === 'all'}
              className={`btn btn-sm rounded-pill px-3 ${
                activeTab === 'all' ? 'btn-dark' : 'btn-outline-secondary'
              }`}
            >
              {t('tabAll', { count: counts.all })}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('authentic')}
              aria-pressed={activeTab === 'authentic'}
              className={`btn btn-sm rounded-pill px-3 ${
                activeTab === 'authentic'
                  ? 'btn-success'
                  : 'btn-outline-success'
              }`}
            >
              {t('tabAuthentic', { count: counts.authentic })}
            </button>
            {counts.expert > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('expert')}
                aria-pressed={activeTab === 'expert'}
                className={`btn btn-sm rounded-pill px-3 ${
                  activeTab === 'expert'
                    ? 'btn-warning text-dark'
                    : 'btn-outline-warning text-dark'
                }`}
              >
                {t('tabExpert', { count: counts.expert })}
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('ignored')}
              aria-pressed={activeTab === 'ignored'}
              className={`btn btn-sm rounded-pill px-3 ${
                activeTab === 'ignored' ? 'btn-danger' : 'btn-outline-danger'
              }`}
            >
              {t('tabIgnored', { count: counts.ignored })}
            </button>
          </div>

          <div className="d-flex align-items-center small gap-2">
            <label
              htmlFor="review-sort-select"
              className="text-muted mb-0 text-nowrap"
            >
              {t('sortByLabel')}
            </label>
            <select
              id="review-sort-select"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="form-select form-select-sm rounded-pill"
              // Up to 240px, shrinking with the row on a 320px phone
              // (DOS/Rate#809).
              style={{ flex: '0 1 240px', minWidth: 0 }}
            >
              <option value="weight_desc">{t('sortMostHelpful')}</option>
              <option value="newest">{t('sortNewest')}</option>
              <option value="rating_desc">{t('sortRatingDesc')}</option>
              <option value="rating_asc">{t('sortRatingAsc')}</option>
            </select>
          </div>
        </div>

        {/* Keyword Search & Star Filter Bar */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-stretch align-items-md-center rounded-4 bg-light gap-2 border p-2 px-3">
          <div className="flex-grow-1">
            <input
              type="search"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder={t('searchReviewsPlaceholder')}
              className="form-control form-control-sm rounded-pill border-0 bg-white px-3"
              aria-label={t('searchReviewsAria')}
            />
          </div>
          <div className="d-flex align-items-center flex-wrap gap-1">
            <div
              className="d-flex align-items-center flex-wrap gap-1"
              role="group"
              aria-label={t('starFilterAll')}
            >
              {(
                [
                  { id: 'all', label: t('starFilterAll') },
                  { id: 5, label: '5 ★' },
                  { id: 4, label: '4 ★' },
                  { id: 3, label: '3 ★' },
                  { id: 2, label: '2 ★' },
                  { id: 1, label: '1 ★' },
                ] as const
              ).map((tier) => (
                <button
                  key={String(tier.id)}
                  type="button"
                  aria-pressed={starFilter === tier.id}
                  onClick={() =>
                    handleSelectStarFilter(
                      tier.id === 'all'
                        ? 'all'
                        : starFilter === tier.id
                          ? 'all'
                          : tier.id
                    )
                  }
                  className={`btn btn-sm rounded-pill rate-star-chip-btn px-3 py-1 ${
                    starFilter === tier.id
                      ? 'btn-warning text-dark fw-semibold'
                      : 'btn-outline-secondary bg-white'
                  }`}
                  style={{ fontSize: '0.8125rem' }}
                >
                  {tier.label}
                </button>
              ))}
            </div>
            {(searchKeyword.trim() !== '' || starFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchKeyword('');
                  handleSelectStarFilter('all');
                }}
                className="btn btn-sm btn-link text-danger text-decoration-none small px-2"
              >
                {t('clearFilterBtn')}
              </button>
            )}
          </div>
        </div>

        {activeNextCursor && (
          <p
            className="text-muted small mb-0"
            data-testid="reviews-loaded-scope-note"
          >
            {activeKnownTotalCount != null &&
            activeKnownTotalCount > activeSourceReviews.length
              ? t('loadedReviewsScopeWithTotal', {
                  loaded: formatPlainNumber(activeSourceReviews.length, locale),
                  total: formatPlainNumber(activeKnownTotalCount, locale),
                })
              : t('loadedReviewsScope', {
                  loaded: formatPlainNumber(activeSourceReviews.length, locale),
                })}
          </p>
        )}
      </div>

      {starFilterLoading && (
        <div
          role="status"
          aria-live="polite"
          data-testid="star-filter-loading"
          className="rounded-4 bg-light small text-secondary mb-3 d-flex align-items-center justify-content-center gap-2 border px-3 py-3"
        >
          <span
            className="spinner-border spinner-border-sm"
            aria-hidden="true"
          />
          <span>{t('loadingStarReviews')}</span>
        </div>
      )}

      {starFilterError && typeof starFilter === 'number' && (
        <div
          role="alert"
          data-testid="star-filter-error"
          className="alert alert-warning small rounded-3 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 px-3 py-2"
        >
          <span>{starFilterError}</span>
          <button
            type="button"
            onClick={() => void fetchStarSlice(starFilter)}
            className="btn btn-sm btn-outline-dark rounded-pill px-3"
            data-testid="star-filter-retry-btn"
          >
            {t('retryStarFilterBtn')}
          </button>
        </div>
      )}

      {/* 4. Review Cards List */}
      {starFilterLoading ? null : filteredAndSortedReviews.length === 0 ? (
        <div className="bg-light rounded-4 py-5 text-center">
          <p className="text-muted mb-0">{t('noMatchingReviews')}</p>
        </div>
      ) : (
        // Phones show the first three reviews until the reader expands the
        // rest; all stay in the HTML (DOS/Rate#1469).
        <PhoneCollapsible
          className="row g-3"
          showMoreLabel={t('reviewsShowMore', {
            count: filteredAndSortedReviews.length - 3,
          })}
          showLessLabel={t('reviewsShowLess')}
          collapsible={filteredAndSortedReviews.length > 3}
        >
          {filteredAndSortedReviews.map((rev) => {
            const flagMeta =
              flagMetaMap[reviewBadgeKind(rev)] || flagMetaMap.authentic;
            const assessment =
              rev.trust_assessment ?? evaluateReviewTrustAssessment(rev);
            const sponsorshipKey = sponsorshipBadgeKey(assessment.independence);
            const weightCopy = weightExplanationCopy(
              assessment.breakdown,
              locale
            );
            const weightExplanation =
              'key' in weightCopy
                ? t(weightCopy.key, weightCopy.values)
                : weightCopy.text;
            const myVote = userVotes[rev.id] || null;
            const isPending = Boolean(pendingIds[rev.id]);
            const isZeroWeight =
              !rev.include_in_rating || rev.helpfulness_weight <= 0;
            const tier = shownReviewTier(rev);
            const tierKey = reviewTierBadgeKey(tier);
            const myValue = myValues[rev.id.toLowerCase()];
            const myGaps = myValue
              ? shownReviewValueGaps(
                  myValue.gaps,
                  v2Enabled
                    ? hasRatingCriteria(cleanReviewCategorySlug)
                    : hasRatingCriteria(effectiveCategorySlug)
                )
              : [];
            const normalizedRevCriteria = normalizeReviewCriteriaRatings(
              effectiveCategorySlug,
              rev.criteria_ratings
            );
            const reviewCriterionBadges: Array<{
              key: RatingCriterionKey;
              label: string;
              score: number;
            }> = [];
            const seenBadgeKeys = new Set<RatingCriterionKey>();
            for (const crit of shownCriteriaMeta) {
              const val = normalizedRevCriteria[crit.key];
              if (val != null) {
                reviewCriterionBadges.push({
                  key: crit.key,
                  label: crit.label,
                  score: val,
                });
                seenBadgeKeys.add(crit.key);
              }
            }
            for (const extraKey of RATING_CRITERION_KEYS) {
              if (seenBadgeKeys.has(extraKey)) continue;
              const val = normalizedRevCriteria[extraKey];
              if (val != null) {
                const msgKey = pointCriterionMessageKey(extraKey);
                reviewCriterionBadges.push({
                  key: extraKey,
                  label: msgKey ? t(msgKey) : extraKey,
                  score: val,
                });
              }
            }

            return (
              <div key={rev.id} className="col-md-6 col-12">
                {/* Excluded reviews are set apart by background and border,
                    not opacity, which dropped their text below 4.5:1
                    (DOS/Rate#811). */}
                <div
                  className={`rounded-4 d-flex flex-column justify-content-between h-100 p-3 ${
                    isFilteredOutReview(rev)
                      ? 'card bg-light border-danger-subtle border'
                      : 'rate-card border bg-white shadow-sm'
                  }`}
                >
                  <div>
                    {/* Top Row: Author + Role + Star Rating */}
                    <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
                      <div className="d-flex align-items-center flex-wrap gap-2">
                        <span
                          className="fw-semibold small text-dark"
                          lang={contentLang(rev.author_name, locale)}
                        >
                          {rev.author_name}
                        </span>
                        {rev.reviewer_type === 'expert' ? (
                          <span className="badge bg-warning text-dark rounded-pill small">
                            {t('roleExpertBadge')}
                          </span>
                        ) : (
                          <span className="badge bg-light text-secondary rounded-pill small border">
                            {t('roleBuyerBadge')}
                          </span>
                        )}
                        {sponsorshipKey && (
                          <span className="badge bg-warning-subtle text-warning-emphasis border-warning-subtle rounded-pill small border">
                            <BsMegaphone aria-hidden="true" className="me-1" />
                            {t(sponsorshipKey)}
                          </span>
                        )}
                        {assessment.routesTo === 'merchant' && (
                          <span className="badge bg-info-subtle text-info-emphasis border-info-subtle rounded-pill small border">
                            {t('routedToMerchantBadge')}
                          </span>
                        )}
                      </div>
                      <StarRating
                        value={Math.max(1, Math.min(5, rev.rating_star))}
                        size="sm"
                      />
                    </div>

                    {/* Second Row: Flag Category Badge + JReviews Weight Badge */}
                    <div className="d-flex align-items-center mb-2 flex-wrap gap-2">
                      <span
                        className={`badge rounded-pill small ${flagMeta.badgeClass}`}
                        title={flagMeta.description}
                      >
                        {flagMeta.label}
                      </span>
                      <span
                        className={`badge rounded-pill small font-monospace ${
                          isZeroWeight
                            ? 'bg-secondary-subtle text-secondary'
                            : rev.helpfulness_weight > 1
                              ? 'bg-primary-subtle text-primary'
                              : 'bg-light text-muted border'
                        }`}
                        title={t('ratingWeightTitle')}
                        data-testid="review-rating-weight"
                      >
                        {t('ratingWeightBadge', {
                          weight: formatDecimal(
                            rev.helpfulness_weight,
                            locale,
                            2
                          ),
                        })}
                      </span>
                      {tierKey && (
                        <span
                          className={`badge rounded-pill small border ${
                            tier === 'excellent'
                              ? 'bg-primary-subtle text-primary-emphasis border-primary-subtle'
                              : 'bg-light text-dark'
                          }`}
                          title={t('valueTierTitle')}
                          data-testid="review-value-tier"
                        >
                          {tier === 'excellent' ? (
                            <BsAward aria-hidden="true" className="me-1" />
                          ) : (
                            <BsPatchCheck
                              aria-hidden="true"
                              className="text-success me-1"
                            />
                          )}
                          {t(tierKey)}
                        </span>
                      )}
                    </div>

                    {/* The writer's own number and what would raise it; the
                        public sees only the tier (DOS/Rate#1547, D7). */}
                    {/* A gated review scores 0 with no gaps: its flag says why. */}
                    {myValue && (myValue.score > 0 || myGaps.length > 0) && (
                      <div
                        className="small text-secondary mb-2"
                        data-testid="my-review-value"
                      >
                        {t('myReviewValue', { score: myValue.score })}
                        {myGaps.length > 0 &&
                          ` · ${t('myReviewValueGaps', {
                            gaps: myGaps
                              .map((gap) => reviewValueGapKey(gap))
                              .filter((key) => key !== null)
                              .map((key) => t(key))
                              .join(', '),
                          })}`}
                      </div>
                    )}

                    {rev.variation && (
                      <div className="text-muted small mb-2">
                        {t.rich('variationPrefix', {
                          variation: rev.variation,
                          value: (chunks) => (
                            <span lang={contentLang(rev.variation, locale)}>
                              {chunks}
                            </span>
                          ),
                        })}
                      </div>
                    )}

                    {reviewCriterionBadges.length > 0 && (
                      <div className="d-flex mb-2 flex-wrap gap-1">
                        {reviewCriterionBadges.map((badge) => (
                          <span
                            key={badge.key}
                            data-testid={`review-criterion-badge-${badge.key}`}
                            className="badge bg-light text-dark rounded-pill border text-wrap mw-100 text-start"
                            style={{ fontSize: '0.8125rem' }}
                          >
                            {badge.label}:{' '}
                            {`${formatRatingValue(badge.score, locale, 1)}/5`} ★
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Review Comment */}
                    <p
                      className="small text-dark lh-base mb-2"
                      style={{ whiteSpace: 'pre-line' }}
                      lang={contentLang(rev.comment, locale)}
                    >
                      {rev.comment || t('emptyCommentPlaceholder')}
                    </p>

                    <ReviewPhotoStrip
                      images={rev.images}
                      authorLabel={
                        rev.author_name.trim() || t('roleBuyerBadge')
                      }
                    />

                    {/* AI Flag Reason Transparency Note */}
                    {rev.reason && (
                      <div className="rounded-3 bg-light small text-secondary mb-2 border p-2">
                        <strong>{t('aiReasonPrefix')}</strong>{' '}
                        <AnalyzerText text={rev.reason} />
                      </div>
                    )}

                    {/* The 6-factor model's estimate is a reference, not the
                        weight the rating uses, so it is folded and says so;
                        the card shows one weight (DOS/Rate#1471, #596). */}
                    <details className="small text-secondary mb-2">
                      <summary>{t('weightWhySummary')}</summary>
                      <p
                        className="mb-0 mt-1"
                        data-testid="review-6axis-breakdown"
                      >
                        {t('trustModelBadge', {
                          explanation: weightExplanation,
                        })}
                      </p>
                    </details>
                  </div>

                  {/* Bottom Row: JReviews Vote Bar (Helpful Up / Down / Report) */}
                  <div className="d-flex justify-content-between align-items-center border-top mt-2 flex-wrap gap-2 pt-2">
                    <span
                      className="text-muted"
                      style={{ fontSize: '0.8125rem' }}
                    >
                      {t('isHelpfulPrompt')}
                    </span>
                    <div className="d-flex align-items-center gap-1">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleVote(rev.id, 'up')}
                        aria-pressed={myVote === 'up'}
                        className={`btn btn-sm rounded-pill px-2 py-1 ${
                          myVote === 'up'
                            ? 'btn-success text-white'
                            : 'btn-outline-secondary'
                        }`}
                        style={{ fontSize: '0.8125rem' }}
                        title={t('upvoteTitle')}
                      >
                        <BsHandThumbsUp aria-hidden="true" className="me-1" />
                        {t('upvoteBtnLabel', { count: rev.upvotes })}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleVote(rev.id, 'down')}
                        aria-pressed={myVote === 'down'}
                        className={`btn btn-sm rounded-pill px-2 py-1 ${
                          myVote === 'down'
                            ? 'btn-warning text-dark'
                            : 'btn-outline-secondary'
                        }`}
                        style={{ fontSize: '0.8125rem' }}
                        title={t('downvoteTitle')}
                      >
                        <BsHandThumbsDown aria-hidden="true" className="me-1" />
                        <span className="visually-hidden">
                          {t('downvoteTitle')}
                        </span>
                        ({rev.downvotes})
                      </button>
                      <button
                        ref={(node) => {
                          reportButtonRefs.current[rev.id] = node;
                        }}
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (myVote === 'report') {
                            void handleVote(rev.id, 'report');
                          } else {
                            setReportingReviewId(rev.id);
                          }
                        }}
                        aria-pressed={myVote === 'report'}
                        aria-haspopup={
                          myVote === 'report' ? undefined : 'dialog'
                        }
                        aria-expanded={
                          myVote === 'report'
                            ? undefined
                            : reportingReviewId === rev.id
                        }
                        aria-controls={
                          reportingReviewId === rev.id
                            ? reportDialogId
                            : undefined
                        }
                        className={`btn btn-sm rounded-pill px-2 py-1 ${
                          myVote === 'report'
                            ? 'btn-danger text-white'
                            : 'btn-outline-danger'
                        }`}
                        style={{ fontSize: '0.8125rem' }}
                        title={t('reportTitle')}
                      >
                        <BsFlag aria-hidden="true" className="me-1" />
                        {t('reportBtnLabel', { count: rev.report_count })}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </PhoneCollapsible>
      )}

      {(activeNextCursor || loadMoreError) && (
        <div className="d-flex flex-column align-items-center mt-4 gap-2">
          {loadMoreError && (
            <div
              role="alert"
              className="alert alert-warning small rounded-3 mb-0 px-3 py-2"
            >
              {loadMoreError}
            </div>
          )}
          {activeNextCursor && (
            <button
              type="button"
              disabled={loadingMore}
              aria-busy={loadingMore}
              onClick={handleLoadMoreReviews}
              className="btn btn-outline-dark btn-sm rounded-pill fw-medium px-4 py-2"
              data-testid="load-more-reviews-btn"
            >
              {loadingMore
                ? t('loadingMoreReviewsBtn')
                : activeKnownTotalCount != null &&
                    activeKnownTotalCount > activeSourceReviews.length
                  ? t('loadMoreReviewsRemainingBtn', {
                      remaining:
                        activeKnownTotalCount - activeSourceReviews.length,
                    })
                  : t('loadMoreReviewsBtn')}
            </button>
          )}
        </div>
      )}

      {reportingReviewId && (
        <ReportReasonDialog
          dialogId={reportDialogId}
          reviewId={reportingReviewId}
          onClose={closeReportDialog}
          onSubmit={(reviewId, reason) => {
            closeReportDialog(true);
            void handleVote(reviewId, 'report', reason);
          }}
        />
      )}
    </div>
  );
}
