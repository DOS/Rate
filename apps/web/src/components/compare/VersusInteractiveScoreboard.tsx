'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type {
  RatingCriterionKey,
  UseCasePresetId,
} from '@repo/shared-data/rules';
import { Link } from '@/lib/navigation';
import { buildWatchlistComboHref } from '@/lib/combo-cart-links';
import {
  MAX_VALID_VND_PRICE,
  comparePositiveMinPrices,
} from '@/lib/rate-domain';
import {
  CRITERION_RANK_WRITERS,
  sharedScoredCriteria,
} from '@/lib/leaderboard-engine';
import {
  availableCategoryUseCasePresets,
  computeCustomWeightedScore5,
  defaultCategoryWeights,
  extractCategoryCriteriaScores,
  isDefaultCategoryWeights,
  mergeUseCaseQueryIntoSearch,
  normalizeCategoryWeights,
  parseUseCaseWeightsFromParams,
  resolveCategoryPreset,
  resolveLocalizedPresetName,
  sanitizeSliderWeight,
  sharedCategoryCriteriaForPair,
  toLegacyCriteriaWeights,
  toLegacyVersusPersona,
  type ActiveWeightMode,
  type CategoryCriterionWeights,
} from '@/lib/use-case-weights';
import UseCaseWeightBar from './UseCaseWeightBar';
import {
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import { versusPersonaLeadCopy, versusVerdictFor } from '@/lib/versus-verdict';
import {
  PERSONA_WEIGHTS,
  computeVersusResult,
  computeVersusWeightedResult,
  resolveVersusPersona,
  sanitizeVersusScore5,
  versusAvailablePersonas,
  versusCriterionScore5,
  versusCriteriaHeadToHead,
  versusCriterionWinner,
  type CriteriaWeights,
  type PersonaPresetKey,
  type ScoredVersusItem,
  type VersusOverallScoreSource,
} from '@/lib/versus-score';
import RadarBadge from '@/components/radar/RadarBadge';
import StarRating from '@/components/elementary/StarRating';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import {
  formatDecimal,
  formatPercent,
  formatPriceVnd,
} from '@/lib/locale-format';
import {
  displayedScore5,
  formatRatingValue,
  formatScoreFixed,
  roundScore,
} from '@/lib/rating-display';

export {
  PERSONA_WEIGHTS,
  computeVersusResult,
  computeVersusWeightedResult,
  resolveVersusPersona,
  sanitizeVersusScore5,
  versusAvailablePersonas,
  versusCriterionScore5,
  versusCriteriaHeadToHead,
  versusCriterionWinner,
};
export type { CriteriaWeights, PersonaPresetKey, ScoredVersusItem };

interface VersusInteractiveScoreboardProps {
  readonly scoreA: ScoredVersusItem;
  readonly scoreB: ScoredVersusItem;
  readonly locale?: string;
  readonly initialWeightMode?: ActiveWeightMode;
  readonly initialCategoryWeights?: CategoryCriterionWeights;
  readonly initialShowSliders?: boolean;
}

export function sanitizeVersusExportSlug(value: unknown): string {
  if (typeof value !== 'string') return 'device';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return cleaned || 'device';
}

export function sanitizeVersusMarkdownCell(value: unknown): string {
  if (typeof value !== 'string') return '-';
  const cleaned = value
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\|/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || '-';
}

export function sanitizeVersusPriceVnd(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  let num: number;
  if (typeof value === 'string') {
    if (/\p{Cc}/u.test(value)) return 0;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 32 || /^[+-]?0[xbo]/i.test(trimmed)) {
      return 0;
    }
    num = Number(trimmed);
  } else {
    num = value;
  }
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  const rounded = Math.round(num);
  return rounded > 0 && rounded <= MAX_VALID_VND_PRICE ? rounded : 0;
}

export function formatVersusPriceVnd(
  value: unknown,
  locale?: string | null
): string {
  const safe = sanitizeVersusPriceVnd(value);
  return safe > 0 ? formatPriceVnd(safe, locale) : '-';
}

export function resolveVersusScoreMinPriceVnd(
  score:
    | (Pick<ScoredVersusItem, 'minPrice'> & {
        product?: { min_price?: unknown } | null;
      })
    | null
    | undefined
): number {
  if (!score) return 0;
  if (score.product && Object.hasOwn(score.product, 'min_price')) {
    return sanitizeVersusPriceVnd(score.product.min_price);
  }
  return sanitizeVersusPriceVnd(score.minPrice);
}

export function buildVersusMarkdownMinPriceRow(
  rowLabel: string,
  minPriceA: unknown,
  minPriceB: unknown,
  safePriceAdv: string,
  locale?: string | null
): string {
  return `| **${rowLabel}** | ${formatVersusPriceVnd(minPriceA, locale)} | ${formatVersusPriceVnd(minPriceB, locale)} | ${safePriceAdv} |`;
}

export function formatVersusWeightedMarkdown(
  overallResult: ReturnType<typeof computeVersusWeightedResult>,
  safeWinnerName: string,
  copy: {
    tie1v1Badge: string;
    mdTieLine: (score: string) => string;
    valNoReviews: string;
    mdLeadingDevice: string;
    mdScoreDelta: (delta: string) => string;
    mdRowWeightedScore: string;
    mdRowTie: string;
    /** Tag after a score from experts/criteria (DOS/Rate#1663). */
    expertSourceTag?: string;
  }
): { summaryBullet: string; weightedScoreRow: string } {
  const shownA = displayedScore5(overallResult.finalA);
  const shownB = displayedScore5(overallResult.finalB);
  const anyScored = shownA > 0 || shownB > 0;
  const leadScore = formatScoreFixed(Math.max(shownA, shownB), 1);
  // A model with no buyer rating keeps its composite, said so (#1663).
  const sourceTag = (source: string | null) =>
    source === 'expert_criteria' && copy.expertSourceTag
      ? ` (${sanitizeVersusMarkdownCell(copy.expertSourceTag)})`
      : '';
  const winnerTag = sourceTag(
    overallResult.winnerSide === 'A'
      ? overallResult.sourceA
      : overallResult.sourceB
  );
  const summaryBullet = overallResult.tie
    ? anyScored
      ? `- **${copy.tie1v1Badge}:** ${copy.mdTieLine(leadScore)}`
      : `- **${copy.tie1v1Badge}:** ${copy.valNoReviews}`
    : overallResult.delta != null
      ? `- **${copy.mdLeadingDevice}:** **${safeWinnerName}** (${leadScore}/5.0${winnerTag} - ${copy.mdScoreDelta(overallResult.delta)})`
      : `- **${copy.mdLeadingDevice}:** **${safeWinnerName}** (${leadScore}/5.0${winnerTag})`;
  const cellA =
    shownA > 0
      ? `**${formatScoreFixed(shownA, 1)}/5.0**${sourceTag(overallResult.sourceA)}`
      : 'N/A';
  const cellB =
    shownB > 0
      ? `**${formatScoreFixed(shownB, 1)}/5.0**${sourceTag(overallResult.sourceB)}`
      : 'N/A';
  const advantage = !anyScored
    ? '-'
    : overallResult.tie
      ? `**${sanitizeVersusMarkdownCell(copy.mdRowTie)}**`
      : `**${safeWinnerName}**`;
  return {
    summaryBullet,
    weightedScoreRow: `| **${copy.mdRowWeightedScore}** | ${cellA} | ${cellB} | ${advantage} |`,
  };
}

function VersusUrlWeightsSync({
  categorySlug,
  onSync,
}: {
  readonly categorySlug: string;
  readonly onSync: (
    cat: string,
    rawPreset: string | null,
    rawWeights: string | null
  ) => void;
}) {
  const searchParams = useSearchParams();
  const rawPreset = searchParams.get('preset');
  const rawWeights = searchParams.get('weights');
  useEffect(
    () => onSync(categorySlug, rawPreset, rawWeights),
    [categorySlug, rawPreset, rawWeights, onSync]
  );
  return null;
}

export default function VersusInteractiveScoreboard({
  scoreA: firstScore,
  scoreB: secondScore,
  locale: localeProp,
  initialWeightMode = 'default',
  initialCategoryWeights,
  initialShowSliders = false,
}: VersusInteractiveScoreboardProps) {
  // A pair has one URL, its sides sorted (DOS/Rate#1367), so the swap button
  // swaps the two sides here instead of linking to the other order.
  const [swapped, setSwapped] = useState<boolean>(false);
  const scoreA = swapped ? secondScore : firstScore;
  const scoreB = swapped ? firstScore : secondScore;
  const catSlug = scoreA.categorySlug || 'smartphones';
  const t = useTranslations('compare');
  const tStars = useTranslations('starRating');
  const hookLocale = useLocale();
  const locale = localeProp || hookLocale;
  // A side with no score reads like its stars, not "0.0" (DOS/Rate#1545).
  const summaryScore = (score: number): string =>
    score > 0 ? formatRatingValue(score, locale) : tStars('empty');
  const useCaseLabelId = useId();
  const slidersPanelId = useId();
  const [weightMode, setWeightMode] =
    useState<ActiveWeightMode>(initialWeightMode);
  const [categoryWeights, setCategoryWeights] =
    useState<CategoryCriterionWeights>(() => {
      if (initialCategoryWeights) {
        return normalizeCategoryWeights(catSlug, initialCategoryWeights)
          .sliderWeights;
      }
      if (initialWeightMode !== 'default' && initialWeightMode !== 'custom') {
        return normalizeCategoryWeights(
          catSlug,
          resolveCategoryPreset(catSlug, initialWeightMode).weights
        ).sliderWeights;
      }
      return defaultCategoryWeights(catSlug);
    });
  const [showSliders, setShowSliders] = useState<boolean>(initialShowSliders);
  const [copiedVerdict, setCopiedVerdict] = useState<boolean>(false);
  const radarIndex = useDealRadarIndex();

  const catScoresA = useMemo(
    () =>
      extractCategoryCriteriaScores(
        scoreA.product,
        catSlug,
        CRITERION_RANK_WRITERS,
        scoreA.rankCriteria
      ),
    [scoreA.product, scoreA.rankCriteria, catSlug]
  );
  const catScoresB = useMemo(
    () =>
      extractCategoryCriteriaScores(
        scoreB.product,
        catSlug,
        CRITERION_RANK_WRITERS,
        scoreB.rankCriteria
      ),
    [scoreB.product, scoreB.rankCriteria, catSlug]
  );
  const sharedCategoryCriteria = useMemo(
    () => sharedCategoryCriteriaForPair(catSlug, catScoresA, catScoresB),
    [catSlug, catScoresA, catScoresB]
  );

  const replaceVersusQuery = useCallback(
    (
      nextMode: ActiveWeightMode,
      nextWeights: CategoryCriterionWeights,
      available: readonly RatingCriterionKey[]
    ) => {
      if (typeof window === 'undefined') return;
      const merged =
        available.length > 0
          ? mergeUseCaseQueryIntoSearch(
              window.location.search,
              catSlug,
              nextMode,
              nextWeights,
              available
            )
          : mergeUseCaseQueryIntoSearch(
              window.location.search,
              catSlug,
              'default',
              defaultCategoryWeights(catSlug),
              []
            );
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${merged}`
      );
    },
    [catSlug]
  );

  const handleUrlWeightsSync = useCallback(
    (cat: string, rawPreset: string | null, rawWeights: string | null) => {
      const parsed = parseUseCaseWeightsFromParams(cat, {
        preset: rawPreset ?? undefined,
        weights: rawWeights ?? undefined,
      });
      setWeightMode(parsed.mode);
      setCategoryWeights(parsed.weights);
    },
    []
  );

  const selectUseCasePreset = (presetId: UseCasePresetId) => {
    const preset = resolveCategoryPreset(catSlug, presetId);
    const norm = normalizeCategoryWeights(
      catSlug,
      preset.weights,
      sharedCategoryCriteria
    );
    setWeightMode(preset.id);
    setCategoryWeights(norm.sliderWeights);
    replaceVersusQuery(preset.id, norm.sliderWeights, sharedCategoryCriteria);
  };

  const updateCategoryWeight = (key: RatingCriterionKey, val: number) => {
    const candidate: CategoryCriterionWeights = {
      ...categoryWeights,
      [key]: sanitizeSliderWeight(val, categoryWeights[key] ?? 0),
    };
    const normalized = normalizeCategoryWeights(
      catSlug,
      candidate,
      sharedCategoryCriteria
    );
    const collapsesToDefault =
      normalized.wasAllZeroReset ||
      isDefaultCategoryWeights(
        catSlug,
        'custom',
        normalized.sliderWeights,
        sharedCategoryCriteria
      );
    const nextMode: ActiveWeightMode = collapsesToDefault
      ? 'default'
      : 'custom';
    const nextWeights = collapsesToDefault
      ? defaultCategoryWeights(catSlug)
      : normalized.sliderWeights;
    setWeightMode(nextMode);
    setCategoryWeights(nextWeights);
    replaceVersusQuery(nextMode, nextWeights, sharedCategoryCriteria);
  };

  const resetVersusWeights = () => {
    selectUseCasePreset('default');
  };

  const safeMinPriceA = resolveVersusScoreMinPriceVnd(scoreA);
  const safeMinPriceB = resolveVersusScoreMinPriceVnd(scoreB);
  const priceSide = comparePositiveMinPrices(safeMinPriceA, safeMinPriceB);
  const priceAdvantageLabel =
    priceSide === 'A'
      ? scoreA.name
      : priceSide === 'B'
        ? scoreB.name
        : priceSide === 'equal'
          ? t('mdRowTie')
          : '-';

  // Presets and weights only where both models have a real criterion score;
  // otherwise they would change nothing, so they are not offered
  // (DOS/Rate#1556).
  const sharedCriteria = useMemo(
    () => sharedScoredCriteria(scoreA.rankCriteria, scoreB.rankCriteria),
    [scoreA.rankCriteria, scoreB.rankCriteria]
  );
  const availablePersonas = versusAvailablePersonas(sharedCriteria);
  const availableCategoryPresets = useMemo(
    () => availableCategoryUseCasePresets(catSlug, sharedCategoryCriteria),
    [catSlug, sharedCategoryCriteria]
  );
  const canWeigh =
    availablePersonas.length > 0 && availableCategoryPresets.length > 0;

  useEffect(() => {
    if (!canWeigh) {
      if (weightMode !== 'default' || showSliders) {
        const defaults = defaultCategoryWeights(catSlug);
        setWeightMode('default');
        setShowSliders(false);
        setCategoryWeights(defaults);
        replaceVersusQuery('default', defaults, []);
      }
      return;
    }
    if (
      weightMode !== 'default' &&
      (isDefaultCategoryWeights(
        catSlug,
        weightMode,
        categoryWeights,
        sharedCategoryCriteria
      ) ||
        (weightMode !== 'custom' &&
          !availableCategoryPresets.some((p) => p.id === weightMode)))
    ) {
      const defaults = defaultCategoryWeights(catSlug);
      setWeightMode('default');
      setCategoryWeights(defaults);
      replaceVersusQuery('default', defaults, sharedCategoryCriteria);
    }
  }, [
    canWeigh,
    weightMode,
    categoryWeights,
    showSliders,
    catSlug,
    availableCategoryPresets,
    sharedCategoryCriteria,
    replaceVersusQuery,
  ]);

  const hasActiveCustomWeights =
    canWeigh &&
    !isDefaultCategoryWeights(
      catSlug,
      weightMode,
      categoryWeights,
      sharedCategoryCriteria
    );

  const activePresetTitle = resolveLocalizedPresetName(
    catSlug,
    weightMode,
    locale,
    undefined,
    t('customWeightsActive')
  );

  const persona: PersonaPresetKey = useMemo(
    () =>
      hasActiveCustomWeights ? toLegacyVersusPersona(weightMode) : 'default',
    [hasActiveCustomWeights, weightMode]
  );
  const weights: CriteriaWeights = useMemo(
    () =>
      !hasActiveCustomWeights
        ? PERSONA_WEIGHTS.default
        : toLegacyCriteriaWeights(
            catSlug,
            categoryWeights,
            sharedCategoryCriteria
          ),
    [hasActiveCustomWeights, catSlug, categoryWeights, sharedCategoryCriteria]
  );

  // The same result as GET /api/v1/rate/versus (DOS/Rate#1647): the final
  // winner by the overall stars as shown, whatever weights are picked; a
  // preset or custom weights only add their own lead, shown apart.
  const versus = useMemo(
    () => computeVersusResult(scoreA, scoreB, persona, weights),
    [scoreA, scoreB, persona, weights]
  );
  const overallResult = versus.overall;
  const personaResult = versus.persona;
  const activePersona = versus.appliedPersona;
  const activeWeights = versus.appliedWeights;

  // A model with no buyer rating yet keeps its composite (expert and/or
  // criterion scores) as its overall stars; wherever they show, they say so
  // (DOS/Rate#1663, JOY 2026-11-16).
  const overallSourceLabel = (source: VersusOverallScoreSource | null) =>
    source === 'buyers'
      ? t('overallSourceBuyers')
      : source === 'expert_criteria'
        ? t('overallSourceExpertBadge')
        : '';
  const expertSourceNote = (
    source: VersusOverallScoreSource | null,
    name: string
  ) =>
    source === 'expert_criteria'
      ? t('overallSourceExpertNote', { name })
      : undefined;
  const expertSourceBadge = (
    source: VersusOverallScoreSource | null,
    name: string,
    side: 'a' | 'b'
  ) =>
    source === 'expert_criteria' ? (
      <span
        className="rate-score-badge-expert"
        title={t('overallSourceExpertNote', { name })}
        data-testid={`versus-overall-source-${side}`}
      >
        {t('overallSourceExpertBadge')}
      </span>
    ) : null;
  const sourceSuffix = (source: VersusOverallScoreSource | null) =>
    source === 'expert_criteria' ? ` (${t('overallSourceExpertBadge')})` : null;
  const expertSourceNotes = [
    { side: 'a', note: expertSourceNote(overallResult.sourceA, scoreA.name) },
    { side: 'b', note: expertSourceNote(overallResult.sourceB, scoreB.name) },
  ].filter((entry): entry is { side: string; note: string } => !!entry.note);
  // The verdict quotes the leader's score, or the level score of both: it
  // names the models whose stars come from experts/criteria.
  const verdictExpertNames = (
    overallResult.tie
      ? [
          { source: overallResult.sourceA, name: scoreA.name },
          { source: overallResult.sourceB, name: scoreB.name },
        ]
      : [
          {
            source:
              overallResult.winnerSide === 'A'
                ? overallResult.sourceA
                : overallResult.sourceB,
            name: overallResult.winner.name,
          },
        ]
  )
    .filter((entry) => entry.source === 'expert_criteria')
    .map((entry) => entry.name);

  // The criteria of the pair's category (no screen for earbuds); a side
  // without a real score reads "Chưa đủ dữ liệu", and a row wins only when
  // both sides have one (DOS/Rate#1143).
  const criterionLabels = {
    screen: t('criteriaScreen'),
    performance: t('criteriaPerformance'),
    camera: t('criteriaCamera'),
    battery: t('criteriaBattery'),
    value: t('criteriaValue'),
  };
  const noData = t('criterionNoData');
  // The same rows and criterion winners as the API, on the shown stars
  // (DOS/Rate#1647).
  const criteriaRows = versusCriteriaHeadToHead(scoreA, scoreB).map((row) => ({
    key: row.key,
    label: criterionLabels[row.key],
    aVal: row.aVal,
    bVal: row.bVal,
    aWins: row.winner === 'A',
    bWins: row.winner === 'B',
    compared: row.winner != null,
  }));
  const criterionCell = (v: number | null) =>
    v != null ? `${formatScoreFixed(v, 1)}/5.0` : noData;

  const personaLabels: Partial<Record<PersonaPresetKey, string>> & {
    custom: string;
  } = {
    default: t('personaDefault'),
    photography: t('personaPhotography'),
    gaming: t('personaGaming'),
    endurance: t('personaEndurance'),
    business: activePresetTitle,
    value_hunter: t('personaValueHunter'),
    custom: t('customWeightsActive'),
    ...(hasActiveCustomWeights ? { [activePersona]: activePresetTitle } : {}),
  };

  const customWeightedPair = useMemo(() => {
    if (!hasActiveCustomWeights) return null;
    const resA = computeCustomWeightedScore5(
      catSlug,
      catScoresA,
      categoryWeights,
      {
        onlyCriteria: sharedCategoryCriteria,
        officialScore5: overallResult.finalA,
      }
    );
    const resB = computeCustomWeightedScore5(
      catSlug,
      catScoresB,
      categoryWeights,
      {
        onlyCriteria: sharedCategoryCriteria,
        officialScore5: overallResult.finalB,
      }
    );
    if (resA.customScore5 == null || resB.customScore5 == null) return null;
    const isTie = resA.customScore5 === resB.customScore5;
    const gap = roundScore(Math.abs(resA.customScore5 - resB.customScore5), 2);
    const leadSide: 'A' | 'B' =
      resA.customScore5 >= resB.customScore5 ? 'A' : 'B';
    const leadItem = leadSide === 'A' ? scoreA : scoreB;
    const leadScore = leadSide === 'A' ? resA.customScore5 : resB.customScore5;
    return {
      scoreA5: resA.customScore5,
      scoreB5: resB.customScore5,
      isTie,
      leadSide,
      leadSlug: leadItem.slug,
      leadName: leadItem.name,
      leadScore5: leadScore,
      delta5: gap,
    };
  }, [
    hasActiveCustomWeights,
    catSlug,
    catScoresA,
    catScoresB,
    categoryWeights,
    sharedCategoryCriteria,
    overallResult.finalA,
    overallResult.finalB,
    scoreA,
    scoreB,
  ]);

  const handleCopy1v1Markdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const sigA = getRadarSignal(radarIndex, scoreA.slug);
      const sigB = getRadarSignal(radarIndex, scoreB.slug);
      const safeNameA = sanitizeVersusMarkdownCell(scoreA.name);
      const safeNameB = sanitizeVersusMarkdownCell(scoreB.name);
      const safeWinnerName = sanitizeVersusMarkdownCell(
        overallResult.winner.name
      );
      const safePriceAdv = sanitizeVersusMarkdownCell(priceAdvantageLabel);
      const { summaryBullet, weightedScoreRow } = formatVersusWeightedMarkdown(
        overallResult,
        safeWinnerName,
        {
          tie1v1Badge: t('tie1v1Badge'),
          mdTieLine: (score) => t('mdTieLine', { score }),
          valNoReviews: t('valNoReviews'),
          mdLeadingDevice: t('mdLeadingDevice'),
          mdScoreDelta: (delta) => t('mdScoreDelta', { delta }),
          mdRowWeightedScore: t('mdRowWeightedScore'),
          mdRowTie: t('mdRowTie'),
          expertSourceTag: t('overallSourceExpertBadge'),
        }
      );
      const customMdBullet = customWeightedPair
        ? `- **${sanitizeVersusMarkdownCell(t('yourCustomScoreLabel'))} (${sanitizeVersusMarkdownCell(activePresetTitle)}):** ${
            customWeightedPair.isTie
              ? t('customWinnerTie', {
                  preset: sanitizeVersusMarkdownCell(activePresetTitle),
                  score: formatRatingValue(
                    customWeightedPair.leadScore5,
                    locale,
                    2
                  ),
                })
              : t('customWinnerSummary', {
                  preset: sanitizeVersusMarkdownCell(activePresetTitle),
                  winner: sanitizeVersusMarkdownCell(
                    customWeightedPair.leadName
                  ),
                  score: formatRatingValue(
                    customWeightedPair.leadScore5,
                    locale,
                    2
                  ),
                  delta: formatRatingValue(
                    customWeightedPair.delta5,
                    locale,
                    2
                  ),
                })
          }`
        : personaLead
          ? `- ${t(
              personaLead.key,
              personaLead.key === 'versusPersonaLead'
                ? {
                    ...personaLead.values,
                    winner: sanitizeVersusMarkdownCell(
                      personaResult?.winner.name
                    ),
                  }
                : personaLead.values
            )}`
          : null;
      const lines = [
        `### ${t('md1v1Heading', { nameA: safeNameA, nameB: safeNameB })}`,
        summaryBullet,
        ...(customMdBullet ? [customMdBullet] : []),
        `- **${t('mdAuditUrl')}:** ${window.location.href}`,
        '',
        `| ${t('mdColCriterion')} | ${safeNameA} | ${safeNameB} | ${t('mdColAdvantage')} |`,
        `| --- | --- | --- | --- |`,
        weightedScoreRow,
        ...criteriaRows.map((r) => {
          const winName = !r.compared
            ? '-'
            : r.aWins
              ? safeNameA
              : r.bWins
                ? safeNameB
                : sanitizeVersusMarkdownCell(t('mdRowTie'));
          return `| ${sanitizeVersusMarkdownCell(r.label)} | ${sanitizeVersusMarkdownCell(criterionCell(r.aVal))} | ${sanitizeVersusMarkdownCell(criterionCell(r.bVal))} | ${winName} |`;
        }),
        buildVersusMarkdownMinPriceRow(
          t('mdRowMinPrice'),
          safeMinPriceA,
          safeMinPriceB,
          safePriceAdv,
          locale
        ),
        `| **${t('mdRowDealRadar')}** | ${radarMarkdownCell(sigA, locale)} | ${radarMarkdownCell(sigB, locale)} | ${sigA.verdict === 'genuine_deal' ? safeNameA : sigB.verdict === 'genuine_deal' ? safeNameB : '-'} |`,
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedVerdict(true);
      setTimeout(() => setCopiedVerdict(false), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleDownloadVersusCsv = () => {
    if (typeof window === 'undefined') return;
    const sigA = getRadarSignal(radarIndex, scoreA.slug);
    const sigB = getRadarSignal(radarIndex, scoreB.slug);
    const cellsA = radarCsvCells(sigA);
    const cellsB = radarCsvCells(sigB);
    const headers = [
      t('csvColCriterion'),
      t('csvColWeight'),
      scoreA.name,
      scoreB.name,
      t('csvColAdvantage'),
    ];
    const shownA = displayedScore5(overallResult.finalA);
    const shownB = displayedScore5(overallResult.finalB);
    const rows: Array<Array<string | number>> = [
      [
        t('csvRowWeightedScore5'),
        '-',
        shownA > 0 ? formatScoreFixed(shownA, 1) : '',
        shownB > 0 ? formatScoreFixed(shownB, 1) : '',
        shownA <= 0 && shownB <= 0
          ? '-'
          : overallResult.tie
            ? t('mdRowTie')
            : overallResult.winner.name,
      ],
      // Where each overall score comes from (DOS/Rate#1663).
      [
        t('csvRowOverallSource'),
        '-',
        overallSourceLabel(overallResult.sourceA),
        overallSourceLabel(overallResult.sourceB),
        '-',
      ],
      // The lead under the picked weights, apart from the overall row.
      ...(customWeightedPair
        ? [
            [
              `${t('yourCustomScoreLabel')} (${activePresetTitle})`,
              100,
              formatScoreFixed(customWeightedPair.scoreA5, 2),
              formatScoreFixed(customWeightedPair.scoreB5, 2),
              customWeightedPair.isTie
                ? t('mdRowTie')
                : customWeightedPair.leadName,
            ],
          ]
        : personaResult
          ? [
              [
                personaLabels[activePersona] ?? personaLabels.custom,
                100,
                formatScoreFixed(displayedScore5(personaResult.finalA), 1),
                formatScoreFixed(displayedScore5(personaResult.finalB), 1),
                personaResult.tie ? t('mdRowTie') : personaResult.winner.name,
              ],
            ]
          : []),
      ...criteriaRows.map((r) => [
        r.label,
        activeWeights[r.key],
        r.aVal != null ? formatScoreFixed(r.aVal, 1) : '',
        r.bVal != null ? formatScoreFixed(r.bVal, 1) : '',
        !r.compared
          ? ''
          : r.aWins
            ? scoreA.name
            : r.bWins
              ? scoreB.name
              : t('mdRowTie'),
      ]),
      [
        t('csvRowExpertScore10'),
        '-',
        scoreA.expertScore10 != null
          ? formatScoreFixed(scoreA.expertScore10, 1)
          : '',
        scoreB.expertScore10 != null
          ? formatScoreFixed(scoreB.expertScore10, 1)
          : '',
        scoreA.expertScore10 != null && scoreB.expertScore10 != null
          ? scoreA.expertScore10 > scoreB.expertScore10
            ? scoreA.name
            : scoreB.expertScore10 > scoreA.expertScore10
              ? scoreB.name
              : t('mdRowTie')
          : scoreA.expertScore10 != null
            ? scoreA.name
            : scoreB.expertScore10 != null
              ? scoreB.name
              : '-',
      ],
      [
        t('csvRowMinPriceVnd'),
        '-',
        safeMinPriceA > 0 ? safeMinPriceA : '',
        safeMinPriceB > 0 ? safeMinPriceB : '',
        priceAdvantageLabel,
      ],
      [
        t('mdRowDealRadar'),
        '-',
        radarLabel(sigA, 0, locale),
        radarLabel(sigB, 0, locale),
        sigA.verdict === 'genuine_deal'
          ? scoreA.name
          : sigB.verdict === 'genuine_deal'
            ? scoreB.name
            : '-',
      ],
      ...RADAR_CSV_HEADERS.map((hdr, idx) => [
        hdr,
        '-',
        cellsA[idx] ?? '',
        cellsB[idx] ?? '',
        '-',
      ]),
    ];
    const csvContent = `\uFEFF${[
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.map(escapeCsvCell).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-1v1-${sanitizeVersusExportSlug(scoreA.slug)}-vs-${sanitizeVersusExportSlug(scoreB.slug)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadVersusJson = () => {
    if (typeof window === 'undefined') return;
    const sigA = getRadarSignal(radarIndex, scoreA.slug);
    const sigB = getRadarSignal(radarIndex, scoreB.slug);
    const safeSlugA = sanitizeVersusExportSlug(scoreA.slug);
    const safeSlugB = sanitizeVersusExportSlug(scoreB.slug);
    const shownA = displayedScore5(overallResult.finalA);
    const shownB = displayedScore5(overallResult.finalB);
    const payload = {
      source: 'Rate.vn 1v1 Versus Scoreboard',
      versusSlug: `${safeSlugA}-vs-${safeSlugB}`,
      persona: activePersona,
      weights: activeWeights,
      useCaseMode: weightMode,
      categoryWeights: normalizeCategoryWeights(
        catSlug,
        categoryWeights,
        sharedCategoryCriteria
      ).normalizedPercent,
      customWeightedResult: customWeightedPair
        ? {
            tie: customWeightedPair.isTie,
            winnerSlug: customWeightedPair.isTie
              ? null
              : sanitizeVersusExportSlug(customWeightedPair.leadSlug),
            winnerName: customWeightedPair.isTie
              ? null
              : customWeightedPair.leadName,
            scoreA5: customWeightedPair.scoreA5,
            scoreB5: customWeightedPair.scoreB5,
            delta5: customWeightedPair.delta5,
          }
        : null,
      exportedAt: new Date().toISOString(),
      tie: overallResult.tie,
      winner: overallResult.tie
        ? null
        : {
            slug: sanitizeVersusExportSlug(overallResult.winner.slug),
            name: overallResult.winner.name,
            scoreDelta5:
              overallResult.delta != null ? Number(overallResult.delta) : null,
          },
      productA: {
        slug: safeSlugA,
        name: scoreA.name,
        brand: scoreA.brand,
        weightedScore5: shownA > 0 ? shownA : null,
        // As the API's `overall_score_source` (DOS/Rate#1663).
        overallScoreSource: overallResult.sourceA,
        expertScore10: scoreA.expertScore10,
        minPriceVnd: safeMinPriceA,
        dealRadar: radarExportFields(sigA),
      },
      productB: {
        slug: safeSlugB,
        name: scoreB.name,
        brand: scoreB.brand,
        weightedScore5: shownB > 0 ? shownB : null,
        overallScoreSource: overallResult.sourceB,
        expertScore10: scoreB.expertScore10,
        minPriceVnd: safeMinPriceB,
        dealRadar: radarExportFields(sigB),
      },
      // The lead under the picked preset or weights; never the winner.
      personaResult: personaResult
        ? {
            tie: personaResult.tie,
            winnerSlug: personaResult.tie
              ? null
              : sanitizeVersusExportSlug(personaResult.winner.slug),
            scoreA5: displayedScore5(personaResult.finalA) || null,
            scoreB5: displayedScore5(personaResult.finalB) || null,
          }
        : null,
      criteriaBreakdown: criteriaRows.map((r) => ({
        key: r.key,
        label: r.label,
        weightPercent: activeWeights[r.key],
        scoreA: r.aVal,
        scoreB: r.bVal,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-1v1-${safeSlugA}-vs-${safeSlugB}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // The final verdict reads the overall stars, so it names no weights.
  const verdict = versusVerdictFor(
    overallResult,
    scoreA.slug,
    'default',
    personaLabels,
    locale
  );
  // The lead under the picked preset or weights, apart from the verdict.
  const personaLead = versusPersonaLeadCopy(
    personaResult,
    scoreA.slug,
    activePersona,
    personaLabels,
    locale
  );

  const comboCartHref = useMemo(
    () =>
      buildWatchlistComboHref([scoreA.slug, scoreB.slug], {
        minItems: 2,
      }),
    [scoreA.slug, scoreB.slug]
  );

  const actionButtons = (
    <>
      {comboCartHref && (
        <Link
          href={comboCartHref}
          prefetch={false}
          data-testid="versus-combo-cart-link"
          className="btn btn-sm btn-outline-light rounded-pill fw-semibold px-3"
        >
          {t('comboCartBtn', { count: 2 })}
        </Link>
      )}
      <button
        type="button"
        onClick={handleCopy1v1Markdown}
        className="btn btn-sm btn-outline-warning rounded-pill fw-semibold px-3"
      >
        {copiedVerdict ? t('copied1v1Markdown') : t('copy1v1VerdictBtn')}
      </button>
      <button
        type="button"
        onClick={handleDownloadVersusCsv}
        data-testid="versus-export-csv-btn"
        className="btn btn-sm btn-outline-light rounded-pill fw-semibold px-3"
      >
        CSV
      </button>
      <button
        type="button"
        onClick={handleDownloadVersusJson}
        data-testid="versus-export-json-btn"
        className="btn btn-sm btn-outline-light rounded-pill fw-semibold px-3"
      >
        JSON
      </button>
      <button
        type="button"
        onClick={() => setSwapped((prev) => !prev)}
        aria-pressed={swapped}
        data-testid="versus-swap-btn"
        className="btn btn-sm btn-outline-light rounded-pill px-3"
        title={t('swapDevicesTitle')}
      >
        ⇄ {t('swapAbBtn')}
      </button>
    </>
  );

  return (
    <>
      <Suspense fallback={null}>
        <VersusUrlWeightsSync
          categorySlug={catSlug}
          onSync={handleUrlWeightsSync}
        />
      </Suspense>
      {/* The verdict names the final winner by the overall stars; the
          picked weights only add their own lead below (DOS/Rate#1647). */}
      <p
        className="text-white-50 small mb-4"
        data-testid="versus-verdict"
        aria-live="polite"
      >
        {/* Narrows the values to each key's own placeholders. */}
        {verdict.key === 'versusAutoVerdictNoScore'
          ? t(verdict.key)
          : verdict.key === 'versusAutoVerdictTie'
            ? t(verdict.key, verdict.values)
            : t(verdict.key, verdict.values)}
        {verdict.weightsLabel &&
          ` ${t('versusVerdictWeights', { weights: verdict.weightsLabel })}`}
        {verdictExpertNames.length > 0 &&
          ` ${t('versusVerdictExpertSource', { name: verdictExpertNames.join(', ') })}`}
        {personaLead && !customWeightedPair && (
          <span className="d-block mt-1" data-testid="versus-persona-lead">
            {t(personaLead.key, personaLead.values)}
          </span>
        )}
      </p>
      <div className="rate-scoreboard-dark rounded-4 p-4">
        {/* Top Action & RTINGS-Style Category Use-Case Filter Strip (#1864) */}
        <div className="border-bottom border-secondary border-opacity-25 mb-3 pb-3">
          <UseCaseWeightBar
            categorySlug={catSlug}
            availableCriteria={canWeigh ? sharedCategoryCriteria : []}
            mode={weightMode}
            weights={categoryWeights}
            showSliders={showSliders}
            onToggleSliders={() => setShowSliders((prev) => !prev)}
            onSelectPreset={selectUseCasePreset}
            onUpdateWeight={updateCategoryWeight}
            onReset={resetVersusWeights}
            locale={locale}
            variant="dark"
            groupLabelId={useCaseLabelId}
            slidersPanelId={slidersPanelId}
            trailingActions={actionButtons}
            testIdPrefix="versus-weights"
            copy={{
              groupLabel: t('useCaseLabel'),
              customizeBtn: t('customWeightsBtn'),
              customActiveBadge: t('customWeightsActive'),
              resetBtn: t('resetWeightsBtn'),
              normalizedSummaryPrefix: t('normalizedWeightsPrefix'),
              officialKeepNote: t('officialScoreKeepNote'),
            }}
          />
        </div>

        {/* Dynamic 1v1 Official Winner Banner (#1531 D3) */}
        <div
          className="rounded-3 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 p-3"
          style={{
            background:
              'linear-gradient(90deg, rgba(45, 186, 105, 0.16) 0%, rgba(216, 48, 48, 0.12) 100%)',
            border: '1px solid rgba(52,211,153,0.35)',
          }}
        >
          <div>
            <span className="badge bg-success rounded-pill me-2 text-white">
              {overallResult.tie ? t('tie1v1Badge') : t('leading1v1Badge')}
            </span>
            {hasActiveCustomWeights && (
              <span
                className="text-white-50 small fw-semibold me-2"
                data-testid="versus-official-score-label"
              >
                {t('officialRateScoreLabel')}:
              </span>
            )}
            {overallResult.tie ? (
              <span className="text-white-50 small">
                {overallResult.bothScored
                  ? t('tieDeltaNote')
                  : t('valNoReviews')}
              </span>
            ) : (
              <>
                <strong className="text-white">
                  {overallResult.winner.name}
                </strong>
                {overallResult.delta != null && (
                  <span className="text-white-50 small ms-2">
                    {t('leadingDeltaNote', {
                      delta: formatDecimal(
                        Number(overallResult.delta),
                        locale,
                        1
                      ),
                    })}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="rate-tabular small text-warning fw-bold">
            {scoreA.brand}: {summaryScore(overallResult.finalA)}
            {sourceSuffix(overallResult.sourceA)} • {scoreB.brand}:{' '}
            {summaryScore(overallResult.finalB)}
            {sourceSuffix(overallResult.sourceB)}
          </div>
        </div>

        {/* Personalized Custom-Weight Score Callout (#1864, #1531 D3/D9) */}
        <div role="status" aria-live="polite">
          {customWeightedPair && (
            <div
              data-testid="versus-custom-score-banner"
              className="rounded-3 d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2 p-3"
              style={{
                background: 'rgba(245, 158, 11, 0.10)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
              }}
            >
              <div>
                <span className="badge bg-warning text-dark rounded-pill fw-bold me-2">
                  {t('yourCustomScoreLabel')}
                </span>
                <span className="small text-white">
                  {customWeightedPair.isTie
                    ? t('customWinnerTie', {
                        preset: activePresetTitle,
                        score: formatRatingValue(
                          customWeightedPair.leadScore5,
                          locale,
                          2
                        ),
                      })
                    : t('customWinnerSummary', {
                        preset: activePresetTitle,
                        winner: customWeightedPair.leadName,
                        score: formatRatingValue(
                          customWeightedPair.leadScore5,
                          locale,
                          2
                        ),
                        delta: formatRatingValue(
                          customWeightedPair.delta5,
                          locale,
                          2
                        ),
                      })}
                </span>
              </div>
              <div className="rate-tabular small text-warning fw-bold">
                {scoreA.name}:{' '}
                {formatRatingValue(customWeightedPair.scoreA5, locale, 2)}/5 •{' '}
                {scoreB.name}:{' '}
                {formatRatingValue(customWeightedPair.scoreB5, locale, 2)}/5
              </div>
            </div>
          )}
        </div>

        {/* Product Headers */}
        <div className="row g-3 align-items-center border-bottom border-secondary border-opacity-25 mb-3 pb-3">
          <div className="col-5">
            <Link
              href={scoreA.productHref}
              className="fw-bold text-decoration-none d-block text-white"
            >
              {scoreA.name}
            </Link>
            <div className="d-flex mt-1 flex-wrap gap-2">
              <StarRating value={overallResult.finalA} />
              {expertSourceBadge(overallResult.sourceA, scoreA.name, 'a')}
              <span className="rate-score-badge-expert">
                {scoreA.expertScore10 != null
                  ? `Lab ${formatDecimal(scoreA.expertScore10, locale, 1)}/10`
                  : t('labScorePending')}
              </span>
            </div>
          </div>
          <div className="col-2 text-center">
            <span className="badge bg-danger rounded-pill fw-bold px-3 py-2">
              VS
            </span>
          </div>
          <div className="col-5 text-end">
            <Link
              href={scoreB.productHref}
              className="fw-bold text-decoration-none d-block text-white"
            >
              {scoreB.name}
            </Link>
            <div className="d-flex justify-content-end mt-1 flex-wrap gap-2">
              <StarRating value={overallResult.finalB} />
              {expertSourceBadge(overallResult.sourceB, scoreB.name, 'b')}
              <span className="rate-score-badge-expert">
                {scoreB.expertScore10 != null
                  ? `Lab ${formatDecimal(scoreB.expertScore10, locale, 1)}/10`
                  : t('labScorePending')}
              </span>
            </div>
          </div>
        </div>

        {/* A model with no buyer rating shows its composite as its stars,
            and says so (DOS/Rate#1663). */}
        {expertSourceNotes.length > 0 && (
          <div
            className="small text-warning mb-3"
            data-testid="versus-overall-source-note"
          >
            {expertSourceNotes.map(({ side, note }) => (
              <div key={side}>{note}</div>
            ))}
          </div>
        )}

        {/* 5-Criteria Dual Progress Bar Comparison Rows */}
        <div className="small text-white-50 mt-2">
          {t('criteriaSourceExpert')}
        </div>
        {criteriaRows.map((row) => {
          const { aWins, bWins } = row;
          const aPct = Math.min(100, Math.round(((row.aVal ?? 0) / 5) * 100));
          const bPct = Math.min(100, Math.round(((row.bVal ?? 0) / 5) * 100));
          return (
            <div
              key={row.key}
              className="row align-items-center g-2 border-bottom border-secondary border-opacity-10 py-2"
            >
              <div className="col-4">
                <div className="d-flex align-items-center gap-2">
                  <span
                    className={`rate-tabular fw-bold ${
                      aWins ? 'text-success' : 'text-white-50'
                    }`}
                  >
                    {row.aVal != null
                      ? `${formatRatingValue(row.aVal, locale, 1)}/5`
                      : noData}{' '}
                    {aWins ? '✓' : ''}
                  </span>
                  <div
                    className="progress bg-dark d-none d-md-flex flex-grow-1"
                    style={{ height: 6 }}
                  >
                    <div
                      className={`progress-bar ${
                        aWins ? 'bg-success' : 'bg-secondary'
                      }`}
                      style={{
                        width: `${aPct}%`,
                        visibility: row.aVal != null ? undefined : 'hidden',
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="small text-light fw-semibold col-4 text-center">
                {row.label}{' '}
                <span className="text-white-50 rate-tabular">
                  ({formatPercent(activeWeights[row.key], locale)})
                </span>
              </div>
              <div className="col-4 text-end">
                <div className="d-flex align-items-center justify-content-end gap-2">
                  <div
                    className="progress bg-dark d-none d-md-flex justify-content-end flex-grow-1"
                    style={{ height: 6 }}
                  >
                    <div
                      className={`progress-bar ${
                        bWins ? 'bg-success' : 'bg-secondary'
                      }`}
                      style={{
                        width: `${bPct}%`,
                        visibility: row.bVal != null ? undefined : 'hidden',
                      }}
                    />
                  </div>
                  <span
                    className={`rate-tabular fw-bold ${
                      bWins ? 'text-success' : 'text-white-50'
                    }`}
                  >
                    {bWins ? '✓ ' : ''}
                    {row.bVal != null
                      ? `${formatRatingValue(row.bVal, locale, 1)}/5`
                      : noData}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* 1v1 Live Deal Radar & Fake-Sale Trap Comparison Row */}
        <div
          data-testid="versus-radar-row"
          className="row align-items-center g-2 border-top border-secondary border-opacity-25 mt-2 pt-3"
        >
          <div className="col-4">
            <RadarBadge
              signal={getRadarSignal(radarIndex, scoreA.slug)}
              minSpreadPct={Infinity}
              emptyFallback={
                <span className="badge bg-dark border-secondary text-white-50 rounded-pill rate-tabular border">
                  {t('price60dStable')}
                </span>
              }
            />
          </div>
          <div className="small text-warning fw-semibold col-4 text-center">
            {t('radarRowTitle')}
          </div>
          <div className="col-4 text-end">
            <RadarBadge
              signal={getRadarSignal(radarIndex, scoreB.slug)}
              minSpreadPct={Infinity}
              emptyFallback={
                <span className="badge bg-dark border-secondary text-white-50 rounded-pill rate-tabular border">
                  {t('price60dStable')}
                </span>
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
