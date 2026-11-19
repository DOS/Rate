'use client';

import { useId, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsSliders } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import {
  MAX_VALID_VND_PRICE,
  comparePositiveMinPrices,
} from '@/lib/rate-domain';
import { sharedScoredCriteria } from '@/lib/leaderboard-engine';
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

export default function VersusInteractiveScoreboard({
  scoreA: firstScore,
  scoreB: secondScore,
  locale: localeProp,
}: VersusInteractiveScoreboardProps) {
  // A pair has one URL, its sides sorted (DOS/Rate#1367), so the swap button
  // swaps the two sides here instead of linking to the other order.
  const [swapped, setSwapped] = useState<boolean>(false);
  const scoreA = swapped ? secondScore : firstScore;
  const scoreB = swapped ? firstScore : secondScore;
  const t = useTranslations('compare');
  const tStars = useTranslations('starRating');
  const hookLocale = useLocale();
  const locale = localeProp || hookLocale;
  // A side with no score reads like its stars, not "0.0" (DOS/Rate#1545).
  const summaryScore = (score: number): string =>
    score > 0 ? formatRatingValue(score, locale) : tStars('empty');
  const useCaseLabelId = useId();
  const slidersPanelId = useId();
  const [persona, setPersona] = useState<PersonaPresetKey>('default');
  const [weights, setWeights] = useState<CriteriaWeights>(
    PERSONA_WEIGHTS.default
  );
  const [showSliders, setShowSliders] = useState<boolean>(false);
  const [copiedVerdict, setCopiedVerdict] = useState<boolean>(false);
  const radarIndex = useDealRadarIndex();

  const selectPersona = (next: Exclude<PersonaPresetKey, 'custom'>) => {
    setPersona(next);
    setWeights(PERSONA_WEIGHTS[next]);
  };

  const updateWeight = (key: keyof CriteriaWeights, val: number) => {
    setPersona('custom');
    const safeVal = Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0;
    setWeights((prev) => ({
      ...prev,
      [key]: safeVal,
    }));
  };

  const safeMinPriceA = sanitizeVersusPriceVnd(scoreA.minPrice);
  const safeMinPriceB = sanitizeVersusPriceVnd(scoreB.minPrice);
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
  const canWeigh = availablePersonas.length > 0;
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
    value_hunter: t('personaValueHunter'),
    custom: t('customWeightsActive'),
  };

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
      const lines = [
        `### ${t('md1v1Heading', { nameA: safeNameA, nameB: safeNameB })}`,
        summaryBullet,
        ...(personaLead
          ? [
              `- ${t(
                personaLead.key,
                personaLead.key === 'versusPersonaLead'
                  ? {
                      ...personaLead.values,
                      winner: sanitizeVersusMarkdownCell(
                        personaResult?.winner.name
                      ),
                    }
                  : personaLead.values
              )}`,
            ]
          : []),
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
      ...(personaResult
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

  return (
    <>
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
        {personaLead && (
          <span className="d-block mt-1" data-testid="versus-persona-lead">
            {t(personaLead.key, personaLead.values)}
          </span>
        )}
      </p>
      <div className="rate-scoreboard-dark rounded-4 p-4">
        {/* Top Action & Persona Filter Strip */}
        <div className="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 mb-3 flex-wrap gap-2 pb-3">
          {/* Presets expose the pressed one, not only its colour (DOS/Rate#1069). */}
          {canWeigh ? (
            <div
              className="d-flex align-items-center flex-wrap gap-1"
              role="group"
              aria-labelledby={useCaseLabelId}
            >
              <span
                id={useCaseLabelId}
                className="small text-white-50 fw-semibold me-1"
              >
                {t('useCaseLabel')}
              </span>
              {(
                [
                  { key: 'default', label: t('personaDefault') },
                  { key: 'photography', label: t('personaPhotography') },
                  { key: 'gaming', label: t('personaGaming') },
                  { key: 'endurance', label: t('personaEndurance') },
                  { key: 'value_hunter', label: t('personaValueHunter') },
                ] as const
              )
                .filter((item) => availablePersonas.includes(item.key))
                .map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={activePersona === item.key}
                    onClick={() => selectPersona(item.key)}
                    className={`btn btn-sm rounded-pill px-3 py-1 ${
                      activePersona === item.key
                        ? 'btn-danger fw-bold text-white'
                        : 'btn-outline-light text-white-50'
                    }`}
                    style={{ fontSize: '0.8125rem' }}
                  >
                    {item.label}
                  </button>
                ))}
              <button
                type="button"
                aria-expanded={showSliders}
                aria-controls={slidersPanelId}
                onClick={() => setShowSliders((prev) => !prev)}
                className={`btn btn-sm rounded-pill px-3 py-1 ${
                  showSliders || activePersona === 'custom'
                    ? 'btn-warning text-dark fw-bold'
                    : 'btn-outline-secondary text-light'
                }`}
                style={{ fontSize: '0.8125rem' }}
              >
                <BsSliders aria-hidden="true" className="me-1" />
                {t('customWeightsBtn')}
                {/* Custom weights select no preset and are shown only by this
                button's colour, so its name says so too (DOS/Rate#1069). */}
                {activePersona === 'custom' && (
                  <span className="visually-hidden">{`: ${t('customWeightsActive')}`}</span>
                )}
              </button>
            </div>
          ) : (
            <span />
          )}

          <div className="d-flex align-items-center flex-wrap gap-2">
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
          </div>
        </div>

        {/* Interactive 5-Criteria Weight Sliders */}
        {showSliders && canWeigh && (
          <div
            id={slidersPanelId}
            className="rounded-3 border-secondary border-opacity-25 mb-3 border p-3"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <div className="row g-3">
              {criteriaRows
                .filter((c) => sharedCriteria.includes(c.key))
                .map((c) => (
                  <div key={c.key} className="col-md col-6">
                    <div className="d-flex justify-content-between small mb-1 text-white">
                      <span>{c.label}</span>
                      <strong className="text-warning rate-tabular">
                        {formatPercent(activeWeights[c.key], locale)}
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={activeWeights[c.key]}
                      onChange={(e) =>
                        updateWeight(c.key, Number(e.target.value))
                      }
                      className="form-range"
                      aria-label={c.label}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Dynamic 1v1 Winner Banner */}
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
