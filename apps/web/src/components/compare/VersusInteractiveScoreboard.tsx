'use client';

import { useId, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsSliders } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import { comparePositiveMinPrices } from '@/lib/rate-domain';
import {
  leaderboardCriteriaForCategory,
  sharedScoredCriteria,
} from '@/lib/leaderboard-engine';
import {
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import { versusVerdictFor } from '@/lib/versus-verdict';
import {
  PERSONA_WEIGHTS,
  computeVersusWeightedResult,
  resolveVersusPersona,
  sanitizeVersusScore5,
  versusAvailablePersonas,
  versusCriterionScore5,
  type CriteriaWeights,
  type PersonaPresetKey,
  type ScoredVersusItem,
} from '@/lib/versus-score';
import RadarBadge from '@/components/radar/RadarBadge';
import StarRating from '@/components/elementary/StarRating';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';
import { formatDecimal, formatPercent } from '@/lib/locale-format';
import {
  displayedScore5,
  formatRatingValue,
  formatScoreFixed,
} from '@/lib/rating-display';

export {
  PERSONA_WEIGHTS,
  computeVersusWeightedResult,
  resolveVersusPersona,
  sanitizeVersusScore5,
  versusAvailablePersonas,
  versusCriterionScore5,
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

export function formatVersusWeightedMarkdown(
  weightedResult: ReturnType<typeof computeVersusWeightedResult>,
  safeWinnerName: string,
  copy: {
    tie1v1Badge: string;
    mdTieLine: (score: string) => string;
    valNoReviews: string;
    mdLeadingDevice: string;
    mdScoreDelta: (delta: string) => string;
    mdRowWeightedScore: string;
    mdRowTie: string;
  }
): { summaryBullet: string; weightedScoreRow: string } {
  const shownA = displayedScore5(weightedResult.finalA);
  const shownB = displayedScore5(weightedResult.finalB);
  const anyScored = shownA > 0 || shownB > 0;
  const leadScore = formatScoreFixed(Math.max(shownA, shownB), 1);
  const summaryBullet = weightedResult.tie
    ? anyScored
      ? `- **${copy.tie1v1Badge}:** ${copy.mdTieLine(leadScore)}`
      : `- **${copy.tie1v1Badge}:** ${copy.valNoReviews}`
    : weightedResult.delta != null
      ? `- **${copy.mdLeadingDevice}:** **${safeWinnerName}** (${leadScore}/5.0 - ${copy.mdScoreDelta(weightedResult.delta)})`
      : `- **${copy.mdLeadingDevice}:** **${safeWinnerName}** (${leadScore}/5.0)`;
  const cellA = shownA > 0 ? `**${formatScoreFixed(shownA, 1)}/5.0**` : 'N/A';
  const cellB = shownB > 0 ? `**${formatScoreFixed(shownB, 1)}/5.0**` : 'N/A';
  const advantage = !anyScored
    ? '-'
    : weightedResult.tie
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
}: VersusInteractiveScoreboardProps) {
  // A pair has one URL, its sides sorted (DOS/Rate#1367), so the swap button
  // swaps the two sides here instead of linking to the other order.
  const [swapped, setSwapped] = useState<boolean>(false);
  const scoreA = swapped ? secondScore : firstScore;
  const scoreB = swapped ? firstScore : secondScore;
  const t = useTranslations('compare');
  const tStars = useTranslations('starRating');
  // A side with no score reads like its stars, not "0.0" (DOS/Rate#1545).
  const summaryScore = (score: number): string =>
    score > 0 ? formatRatingValue(score, locale) : tStars('empty');
  const locale = useLocale();
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

  const priceSide = comparePositiveMinPrices(scoreA.minPrice, scoreB.minPrice);
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
  // The same fallback as GET /api/v1/rate/versus (DOS/Rate#1647).
  const { persona: activePersona, weights: activeWeights } =
    resolveVersusPersona(scoreA, scoreB, persona, weights);

  const weightedResult = useMemo(
    () =>
      computeVersusWeightedResult(scoreA, scoreB, activeWeights, activePersona),
    [scoreA, scoreB, activeWeights, activePersona]
  );

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
  const criteriaRows = leaderboardCriteriaForCategory(scoreA.categorySlug).map(
    (key) => {
      const aVal = versusCriterionScore5(scoreA.criteria?.[key]);
      const bVal = versusCriterionScore5(scoreB.criteria?.[key]);
      const compared = aVal != null && bVal != null;
      return {
        key,
        label: criterionLabels[key],
        aVal,
        bVal,
        aWins: compared && aVal > bVal,
        bWins: compared && bVal > aVal,
        compared,
      };
    }
  );
  const criterionCell = (v: number | null) =>
    v != null ? `${formatScoreFixed(v, 2)}/5.0` : noData;

  const handleCopy1v1Markdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const sigA = getRadarSignal(radarIndex, scoreA.slug);
      const sigB = getRadarSignal(radarIndex, scoreB.slug);
      const safeNameA = sanitizeVersusMarkdownCell(scoreA.name);
      const safeNameB = sanitizeVersusMarkdownCell(scoreB.name);
      const safeWinnerName = sanitizeVersusMarkdownCell(
        weightedResult.winner.name
      );
      const safePriceAdv = sanitizeVersusMarkdownCell(priceAdvantageLabel);
      const { summaryBullet, weightedScoreRow } = formatVersusWeightedMarkdown(
        weightedResult,
        safeWinnerName,
        {
          tie1v1Badge: t('tie1v1Badge'),
          mdTieLine: (score) => t('mdTieLine', { score }),
          valNoReviews: t('valNoReviews'),
          mdLeadingDevice: t('mdLeadingDevice'),
          mdScoreDelta: (delta) => t('mdScoreDelta', { delta }),
          mdRowWeightedScore: t('mdRowWeightedScore'),
          mdRowTie: t('mdRowTie'),
        }
      );
      const lines = [
        `### ${t('md1v1Heading', { nameA: safeNameA, nameB: safeNameB })}`,
        summaryBullet,
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
        `| **${t('mdRowMinPrice')}** | ${scoreA.minPrice > 0 ? `${scoreA.minPrice.toLocaleString('vi-VN')} ₫` : '-'} | ${scoreB.minPrice > 0 ? `${scoreB.minPrice.toLocaleString('vi-VN')} ₫` : '-'} | ${safePriceAdv} |`,
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
    const shownA = displayedScore5(weightedResult.finalA);
    const shownB = displayedScore5(weightedResult.finalB);
    const rows: Array<Array<string | number>> = [
      [
        t('csvRowWeightedScore5'),
        100,
        shownA > 0 ? formatScoreFixed(shownA, 1) : '',
        shownB > 0 ? formatScoreFixed(shownB, 1) : '',
        shownA <= 0 && shownB <= 0
          ? '-'
          : weightedResult.tie
            ? t('mdRowTie')
            : weightedResult.winner.name,
      ],
      ...criteriaRows.map((r) => [
        r.label,
        activeWeights[r.key],
        r.aVal != null ? formatScoreFixed(r.aVal, 2) : '',
        r.bVal != null ? formatScoreFixed(r.bVal, 2) : '',
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
        scoreA.minPrice > 0 ? scoreA.minPrice : '',
        scoreB.minPrice > 0 ? scoreB.minPrice : '',
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
    const shownA = displayedScore5(weightedResult.finalA);
    const shownB = displayedScore5(weightedResult.finalB);
    const payload = {
      source: 'Rate.vn 1v1 Versus Scoreboard',
      versusSlug: `${safeSlugA}-vs-${safeSlugB}`,
      persona: activePersona,
      weights: activeWeights,
      exportedAt: new Date().toISOString(),
      tie: weightedResult.tie,
      winner: weightedResult.tie
        ? null
        : {
            slug: sanitizeVersusExportSlug(weightedResult.winner.slug),
            name: weightedResult.winner.name,
            scoreDelta5:
              weightedResult.delta != null
                ? Number(weightedResult.delta)
                : null,
          },
      productA: {
        slug: safeSlugA,
        name: scoreA.name,
        brand: scoreA.brand,
        weightedScore5: shownA > 0 ? shownA : null,
        expertScore10: scoreA.expertScore10,
        minPriceVnd: scoreA.minPrice,
        dealRadar: radarExportFields(sigA),
      },
      productB: {
        slug: safeSlugB,
        name: scoreB.name,
        brand: scoreB.brand,
        weightedScore5: shownB > 0 ? shownB : null,
        expertScore10: scoreB.expertScore10,
        minPriceVnd: scoreB.minPrice,
        dealRadar: radarExportFields(sigB),
      },
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
  const verdict = versusVerdictFor(
    weightedResult,
    scoreA.slug,
    activePersona,
    personaLabels,
    locale
  );

  return (
    <>
      {/* The verdict reads the scoreboard's own result, so it follows the
          weights the reader picks; other weights than the default are named
          (DOS/Rate#1235). */}
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
              {weightedResult.tie ? t('tie1v1Badge') : t('leading1v1Badge')}
            </span>
            {weightedResult.tie ? (
              <span className="text-white-50 small">
                {weightedResult.bothScored
                  ? t('tieDeltaNote')
                  : t('valNoReviews')}
              </span>
            ) : (
              <>
                <strong className="text-white">
                  {weightedResult.winner.name}
                </strong>
                {weightedResult.delta != null && (
                  <span className="text-white-50 small ms-2">
                    {t('leadingDeltaNote', {
                      delta: formatDecimal(
                        Number(weightedResult.delta),
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
            {scoreA.brand}: {summaryScore(weightedResult.finalA)} •{' '}
            {scoreB.brand}: {summaryScore(weightedResult.finalB)}
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
              <StarRating value={weightedResult.finalA} />
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
              <StarRating value={weightedResult.finalB} />
              <span className="rate-score-badge-expert">
                {scoreB.expertScore10 != null
                  ? `Lab ${formatDecimal(scoreB.expertScore10, locale, 1)}/10`
                  : t('labScorePending')}
              </span>
            </div>
          </div>
        </div>

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
                      ? `${formatRatingValue(row.aVal, locale, 2)}/5`
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
                      ? `${formatRatingValue(row.bVal, locale, 2)}/5`
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
