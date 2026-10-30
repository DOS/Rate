'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ExportMenu from '@/components/elementary/ExportMenu';
import PhoneCollapsible from '@/components/product/PhoneCollapsible';
import {
  BsBarChart,
  BsCheckCircle,
  BsExclamationTriangle,
  BsFlag,
  BsHandThumbsDown,
  BsHandThumbsUp,
  BsInfoCircle,
  BsMegaphone,
  BsRobot,
  BsStarFill,
} from 'react-icons/bs';
import { contentLang } from '@/lib/content-lang';
import { computeJReviewsUserScores } from '@/lib/jreviews-user-score';
import { escapeCsvCell } from '@/lib/csv-safe';
import {
  computeCombinedDualScore,
  computeJReviewsWeight,
  computeWilsonLowerBound,
  detectStarDistributionAnomaly,
  evaluateReviewTrustAssessment,
  type ReviewAnalysisSummary,
  type ReviewItem,
} from '@/lib/rate-domain';
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
  blendNoteKey,
  isFilteredOutReview,
  reviewBadgeKind,
  sponsorshipBadgeKey,
  submitErrorKey,
  weightExplanationCopy,
  type ReviewBadgeKind,
} from '@/lib/review-display';
import AnalyzerText, { analyzerText } from './AnalyzerText';
import {
  formatDecimal,
  formatPercent,
  formatPlainNumber,
} from '@/lib/locale-format';

type VoteChoice = 'up' | 'down' | 'report';
type FilterTab = 'all' | 'authentic' | 'expert' | 'ignored';
type SortMode = 'weight_desc' | 'newest' | 'rating_desc' | 'rating_asc';

export interface JReviewsSectionProps {
  masterProductId?: string;
  productSlug?: string;
  productName: string;
  averageRating: number;
  userRatingWeighted: number | null;
  expertRating: number | null;
  expertReviewSummary?: string | null;
  authenticReviewCount: number;
  ignoredReviewCount: number;
  reviews: ReviewItem[];
  summary: ReviewAnalysisSummary;
  radarSignal?: RadarSignal | null;
}

const CRITERIA_KEYS = [
  { key: 'screen', labelKey: 'criteriaScreen' },
  { key: 'performance', labelKey: 'criteriaPerformance' },
  { key: 'camera', labelKey: 'criteriaCamera' },
  { key: 'battery', labelKey: 'criteriaBattery' },
  { key: 'value', labelKey: 'criteriaValue' },
] as const;

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

export default function JReviewsSection({
  masterProductId,
  productSlug,
  productName,
  averageRating,
  userRatingWeighted,
  expertRating,
  expertReviewSummary,
  authenticReviewCount,
  ignoredReviewCount,
  reviews: initialReviews,
  summary,
  radarSignal,
}: JReviewsSectionProps) {
  const t = useTranslations('reviews');
  const tAnalyzer = useTranslations('analyzerCopy');
  const locale = useLocale();

  const criteriaMeta = useMemo(
    () =>
      CRITERIA_KEYS.map((c) => ({
        key: c.key,
        label: t(c.labelKey),
      })),
    [t]
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

  const [reviews, setReviews] = useState<ReviewItem[]>(initialReviews);
  const [userVotes, setUserVotes] = useState<Record<string, VoteChoice>>({});
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('weight_desc');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [starFilter, setStarFilter] = useState<'all' | 5 | 4 | 3>('all');

  // 5-Criteria Write Review Form State
  const [showWriteForm, setShowWriteForm] = useState(false);
  const fieldId = useId();
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
          setReviews((prev) => {
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

  const counts = useMemo(() => {
    const authentic = reviews.filter(
      (r) => r.include_in_rating && r.helpfulness_weight > 0
    ).length;
    const ignored = reviews.filter(isFilteredOutReview).length;
    const expert = reviews.filter((r) => r.reviewer_type === 'expert').length;
    return {
      all: reviews.length,
      authentic: authentic || authenticReviewCount,
      ignored: ignored || ignoredReviewCount,
      expert,
    };
  }, [reviews, authenticReviewCount, ignoredReviewCount]);

  // Live JReviews weighted scores based on current review weights
  const liveScores = useMemo(() => {
    const validUserReviews = reviews.filter(
      (r) =>
        r.reviewer_type !== 'expert' &&
        r.include_in_rating &&
        r.helpfulness_weight > 0
    );
    const validExpertReviews = reviews.filter(
      (r) => r.reviewer_type === 'expert' && r.helpfulness_weight > 0
    );

    const {
      user: computedUser,
      bayesianUser: bayesianUserScore,
      bayesianConfidence,
      userWeightSum,
    } = computeJReviewsUserScores(reviews, userRatingWeighted, averageRating);
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
        computedExpert = Number((expStars / expWeightSum).toFixed(2));
      }
    }

    // The buyer score the header shows, so a 100% buyer composite equals it
    // (DOS/Rate#1144).
    const dualScore = computeCombinedDualScore({
      userScore: bayesianUserScore,
      expertScore: computedExpert,
      userConfidence: bayesianConfidence,
      fallbackAverage: averageRating,
    });
    const starAnomaly = detectStarDistributionAnomaly(reviews);

    const criteriaAverages = criteriaMeta.map((crit) => {
      let wSum = 0;
      let valSum = 0;
      for (const r of validUserReviews) {
        const cVal = r.criteria_ratings?.[crit.key];
        if (typeof cVal === 'number' && cVal >= 1 && cVal <= 5) {
          wSum += r.helpfulness_weight;
          valSum += cVal * r.helpfulness_weight;
        }
      }
      if (wSum > 0) {
        return {
          ...crit,
          score: Number((valSum / wSum).toFixed(2)) as number | null,
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
      bayesianUser: bayesianUserScore,
      bayesianConfidence,
      confidenceTier,
      confidenceLabel,
      userWeightSum: Number(userWeightSum.toFixed(2)),
      expert: computedExpert,
      criteriaAverages,
    };
  }, [
    reviews,
    averageRating,
    userRatingWeighted,
    expertRating,
    criteriaMeta,
    t,
  ]);

  const filteredAndSortedReviews = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const filtered = reviews.filter((r) => {
      if (activeTab === 'authentic') {
        if (!r.include_in_rating || r.helpfulness_weight <= 0) return false;
      } else if (activeTab === 'expert') {
        if (r.reviewer_type !== 'expert') return false;
      } else if (activeTab === 'ignored') {
        if (!isFilteredOutReview(r)) return false;
      }

      if (starFilter === 5 && Math.round(r.rating_star) !== 5) return false;
      if (starFilter === 4 && Math.round(r.rating_star) !== 4) return false;
      if (starFilter === 3 && Math.round(r.rating_star) > 3) return false;

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
        const wilsonA = computeWilsonLowerBound(a.upvotes, a.downvotes);
        const wilsonB = computeWilsonLowerBound(b.upvotes, b.downvotes);
        if (
          a.include_in_rating &&
          b.include_in_rating &&
          Math.abs(wilsonB - wilsonA) >= 0.005
        ) {
          return wilsonB - wilsonA;
        }
        if (b.helpfulness_weight !== a.helpfulness_weight) {
          return b.helpfulness_weight - a.helpfulness_weight;
        }
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
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
  }, [reviews, activeTab, sortMode, searchKeyword, starFilter, tAnalyzer]);

  async function handleVote(reviewId: string, clickedVote: VoteChoice) {
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
    const reviewBefore = reviews.find((r) => r.id === reviewId);
    const rollBack = (notice: string) => {
      if (reviewBefore) {
        setReviews((prevList) =>
          prevList.map((r) => (r.id === reviewId ? reviewBefore : r))
        );
      }
      setVoteFor(prevVote);
      setAuthNotice(notice);
    };

    // Optimistic state update using the canonical SQL/Importer JReviews weight formula
    setPendingIds((prev) => ({ ...prev, [reviewId]: true }));
    setReviews((prevList) =>
      prevList.map((r) => {
        if (r.id !== reviewId) return r;
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
      })
    );

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
        body: JSON.stringify({
          voteType: nextAction,
          reportReason: nextAction === 'report' ? 'spam' : undefined,
        }),
      });
      if (res.ok) {
        const payload = await res.json();
        setAuthNotice(null);
        if (payload && typeof payload.helpfulnessWeight === 'number') {
          setReviews((prevList) =>
            prevList.map((r) =>
              r.id === reviewId
                ? {
                    ...r,
                    upvotes: Number(payload.upvotes ?? r.upvotes),
                    downvotes: Number(payload.downvotes ?? r.downvotes),
                    report_count: Number(payload.reports ?? r.report_count),
                    helpfulness_weight: Number(payload.helpfulnessWeight),
                  }
                : r
            )
          );
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

      const newRev = payload.review as ReviewItem;
      setReviews((prev) => [newRev, ...prev]);

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

      setComment('');
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
    } catch {
      setSubmitError(t('errNetworkFailed'));
    } finally {
      setSubmittingReview(false);
    }
  }

  const [copiedReviewsMd, setCopiedReviewsMd] = useState(false);

  const handleCopyReviewsMarkdown = async () => {
    if (
      typeof navigator === 'undefined' ||
      filteredAndSortedReviews.length === 0
    )
      return;
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
    const rows = filteredAndSortedReviews.map((r) => [
      sanitizeJReviewsMarkdownCell(r.author_name, 80),
      r.reviewer_type === 'expert' ? 'Expert' : 'Verified Buyer',
      `${r.rating_star}/5★`,
      `${r.helpfulness_weight.toFixed(2)}x`,
      reviewBadgeKind(r),
      String(r.upvotes),
      sanitizeJReviewsMarkdownCell(r.comment, 120),
    ]);
    const md = [
      `### ⭐ Rate.vn JReviews AI-checked buyer reviews: ${sanitizeJReviewsMarkdownCell(productName, 160)} (${filteredAndSortedReviews.length} reviews)`,
      `- **Price signal:** ${radarMarkdownCell(radarSignal)}`,
      '',
      `| ${headers.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...rows.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n');

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
          {masterProductId && (
            <button
              type="button"
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

      {/* Interactive 5-Criteria Write Review Form */}
      {showWriteForm && (
        <form
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
                        <div className="btn-group btn-group-sm" role="group">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
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
                {formatDecimal(
                  Object.values(criteriaScores).reduce((a, b) => a + b, 0) /
                    Object.values(criteriaScores).length,
                  locale,
                  1
                )}{' '}
                / {formatDecimal(5, locale, 1)} ★
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
              <div className="d-flex align-items-baseline my-2 gap-2">
                <span className="display-5 fw-bold font-monospace text-white">
                  {liveScores.overall > 0
                    ? formatDecimal(liveScores.overall, locale, 1)
                    : 'N/A'}
                </span>
                <span className="text-white-50 fw-medium">
                  / {formatDecimal(5, locale, 1)}
                </span>
              </div>
              <div className="text-warning fs-5 mb-2">
                {'★'.repeat(Math.round(liveScores.overall || 5))}
                <span className="text-white opacity-25">
                  {'★'.repeat(
                    Math.max(0, 5 - Math.round(liveScores.overall || 5))
                  )}
                </span>
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
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="text-uppercase small fw-bold text-primary">
                  {t('authenticUserScoreTitle')}
                </span>
                <span className="rate-score-badge-user">
                  ★{' '}
                  {liveScores.user != null
                    ? formatDecimal(liveScores.user, locale, 2)
                    : 'N/A'}
                </span>
              </div>
              <div className="d-flex align-items-baseline my-2 gap-2">
                <span
                  className={`display-6 fw-bold text-dark font-monospace ${
                    liveScores.confidenceTier === 'insufficient_data'
                      ? 'opacity-50'
                      : ''
                  }`}
                >
                  {liveScores.bayesianUser != null
                    ? formatDecimal(liveScores.bayesianUser, locale, 2)
                    : 'N/A'}
                </span>
                <span className="text-muted small">
                  / {formatDecimal(5, locale, 1)} (Bayes)
                </span>
              </div>
              <div className="small text-secondary mb-2">
                {t('basedOnAuthenticReviews', {
                  count: counts.authentic,
                  // The cs decimal comma, as avgScore (DOS/Rate#1411).
                  weightSum: formatPlainNumber(
                    liveScores.userWeightSum,
                    locale
                  ),
                  avgScore:
                    liveScores.user != null
                      ? formatDecimal(liveScores.user, locale, 2)
                      : 'N/A',
                })}
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
              <span className="badge bg-success-subtle text-success small">
                {t('validCountBadge', { count: counts.authentic })}
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
                <span className="rate-score-badge-expert">
                  Expert{' '}
                  {liveScores.expert != null
                    ? `${formatDecimal(liveScores.expert, locale, 1)}/${formatDecimal(5, locale, 1)}`
                    : t('expertPendingShort')}
                </span>
              </div>
              {liveScores.expert != null ? (
                <>
                  <div className="d-flex align-items-baseline my-2 gap-2">
                    <span className="display-6 fw-bold text-dark font-monospace">
                      {formatDecimal(liveScores.expert, locale, 1)}
                    </span>
                    <span className="text-muted small">
                      / {formatDecimal(5, locale, 1)}
                    </span>
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
        <div className="row g-3">
          {liveScores.criteriaAverages.map((crit) => {
            const pct =
              crit.score != null
                ? Math.min(
                    100,
                    Math.max(10, Math.round((crit.score / 5) * 100))
                  )
                : 0;
            return (
              <div key={crit.key} className="col-lg col-md-4 col-sm-6 col-12">
                <div className="rounded-3 bg-light h-100 border p-2 px-3">
                  <div className="d-flex justify-content-between align-items-center small mb-1">
                    <span className="text-muted fw-medium">{crit.label}</span>
                    <strong className="text-dark font-monospace">
                      {crit.score != null
                        ? `${formatDecimal(crit.score, locale, 1)}/${formatDecimal(5, locale, 1)}`
                        : t('notAvailableShort')}
                    </strong>
                  </div>
                  <div
                    className="progress rounded-pill"
                    style={{ height: '6px' }}
                  >
                    <div
                      className="progress-bar bg-warning"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
        </div>

        {/* Progress Bar: draws the badge percentages above, so it is hidden
            from assistive tech rather than labelled (DOS/Rate#1071). */}
        <div
          className="progress rounded-pill mb-3"
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

        {summary.ai_summary && (
          <div className="rounded-3 small text-dark mb-3 border bg-white p-3">
            <strong>{t('aiSummaryPrefix')}</strong>{' '}
            <AnalyzerText text={summary.ai_summary} />
          </div>
        )}

        {(summary.pros.length > 0 || summary.cons.length > 0) && (
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
            {(
              [
                { id: 'all', label: t('starFilterAll') },
                { id: 5, label: '5 ★' },
                { id: 4, label: '4 ★' },
                { id: 3, label: '≤ 3 ★' },
              ] as const
            ).map((tier) => (
              <button
                key={String(tier.id)}
                type="button"
                onClick={() => setStarFilter(tier.id)}
                className={`btn btn-sm rounded-pill px-3 py-1 ${
                  starFilter === tier.id
                    ? 'btn-warning text-dark fw-semibold'
                    : 'btn-outline-secondary bg-white'
                }`}
                style={{ fontSize: '0.8125rem' }}
              >
                {tier.label}
              </button>
            ))}
            {(searchKeyword.trim() !== '' || starFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchKeyword('');
                  setStarFilter('all');
                }}
                className="btn btn-sm btn-link text-danger text-decoration-none small px-2"
              >
                {t('clearFilterBtn')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Review Cards List */}
      {filteredAndSortedReviews.length === 0 ? (
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
                      <span className="badge bg-warning text-dark small font-monospace">
                        {'★'.repeat(Math.max(1, Math.min(5, rev.rating_star)))}
                      </span>
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
                    </div>

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

                    {rev.criteria_ratings &&
                      Object.keys(rev.criteria_ratings).length > 0 && (
                        <div className="d-flex mb-2 flex-wrap gap-1">
                          {criteriaMeta.map((crit) => {
                            const val = rev.criteria_ratings?.[crit.key];
                            if (val == null) return null;
                            return (
                              <span
                                key={crit.key}
                                className="badge bg-light text-dark rounded-pill border"
                                style={{ fontSize: '0.8125rem' }}
                              >
                                {crit.label.split(' ')[0]}: {val}/5 ★
                              </span>
                            );
                          })}
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
                        type="button"
                        disabled={isPending}
                        onClick={() => handleVote(rev.id, 'report')}
                        aria-pressed={myVote === 'report'}
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
    </div>
  );
}
