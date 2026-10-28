'use client';

import { useId, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsSliders } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import {
  comparePositiveMinPrices,
  type ScoredLeaderboardItem,
} from '@/lib/rate-domain';
import {
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import { isVersusScoreTie } from '@/lib/versus-verdict';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';

export type ScoredVersusItem = Omit<ScoredLeaderboardItem, 'rank'>;

interface VersusInteractiveScoreboardProps {
  readonly scoreA: ScoredVersusItem;
  readonly scoreB: ScoredVersusItem;
  readonly locale?: string;
}

export type PersonaPresetKey =
  | 'default'
  | 'photography'
  | 'gaming'
  | 'endurance'
  | 'business'
  | 'value_hunter'
  | 'custom';

export interface CriteriaWeights {
  screen: number;
  performance: number;
  camera: number;
  battery: number;
  value: number;
}

export const PERSONA_WEIGHTS: Record<
  Exclude<PersonaPresetKey, 'custom'>,
  CriteriaWeights
> = {
  default: { screen: 20, performance: 20, camera: 20, battery: 20, value: 20 },
  photography: {
    screen: 20,
    performance: 15,
    camera: 45,
    battery: 10,
    value: 10,
  },
  gaming: { screen: 25, performance: 45, camera: 5, battery: 15, value: 10 },
  endurance: {
    screen: 15,
    performance: 15,
    camera: 10,
    battery: 45,
    value: 15,
  },
  business: { screen: 35, performance: 25, camera: 10, battery: 20, value: 10 },
  value_hunter: {
    screen: 15,
    performance: 20,
    camera: 10,
    battery: 15,
    value: 40,
  },
};

export function sanitizeVersusScore5(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Number(Math.min(5, num).toFixed(2));
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

export function computeVersusWeightedResult(
  scoreA: ScoredVersusItem,
  scoreB: ScoredVersusItem,
  weights: CriteriaWeights,
  persona: PersonaPresetKey
) {
  const sanitizeWeight = (v: number): number =>
    Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  const wScreen = sanitizeWeight(weights.screen);
  const wPerf = sanitizeWeight(weights.performance);
  const wCam = sanitizeWeight(weights.camera);
  const wBat = sanitizeWeight(weights.battery);
  const wVal = sanitizeWeight(weights.value);
  const rawSumW = wScreen + wPerf + wCam + wBat + wVal;

  const calcWeighted = (item: ScoredVersusItem): number => {
    const baseScore5 = sanitizeVersusScore5(item.combinedScore5);
    if (persona === 'default') {
      return baseScore5;
    }
    const cScreen = sanitizeVersusScore5(item.criteria?.screen);
    const cPerf = sanitizeVersusScore5(item.criteria?.performance);
    const cCam = sanitizeVersusScore5(item.criteria?.camera);
    const cBat = sanitizeVersusScore5(item.criteria?.battery);
    const cVal = sanitizeVersusScore5(item.criteria?.value);
    const wAvg =
      rawSumW > 0
        ? (cScreen * wScreen +
            cPerf * wPerf +
            cCam * wCam +
            cBat * wBat +
            cVal * wVal) /
          rawSumW
        : (cScreen + cPerf + cCam + cBat + cVal) / 5;
    return sanitizeVersusScore5(baseScore5 * 0.35 + wAvg * 0.65);
  };

  const finalA = calcWeighted(scoreA);
  const finalB = calcWeighted(scoreB);
  const tiePriceSide = comparePositiveMinPrices(
    scoreA.minPrice,
    scoreB.minPrice
  );
  const winner =
    finalA > finalB
      ? scoreA
      : finalB > finalA
        ? scoreB
        : tiePriceSide === 'B'
          ? scoreB
          : scoreA;

  return {
    finalA,
    finalB,
    delta: Math.abs(finalA - finalB).toFixed(2),
    winner,
    // Level at the shown precision: no lead for either (DOS/Rate#1209).
    tie: isVersusScoreTie(finalA, finalB),
  };
}

export default function VersusInteractiveScoreboard({
  scoreA,
  scoreB,
}: VersusInteractiveScoreboardProps) {
  const t = useTranslations('compare');
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

  const weightedResult = useMemo(
    () => computeVersusWeightedResult(scoreA, scoreB, weights, persona),
    [scoreA, scoreB, weights, persona]
  );

  const criteriaRows = [
    {
      key: 'screen' as const,
      label: t('criteriaScreen'),
      aVal: sanitizeVersusScore5(scoreA.criteria?.screen),
      bVal: sanitizeVersusScore5(scoreB.criteria?.screen),
    },
    {
      key: 'performance' as const,
      label: t('criteriaPerformance'),
      aVal: sanitizeVersusScore5(scoreA.criteria?.performance),
      bVal: sanitizeVersusScore5(scoreB.criteria?.performance),
    },
    {
      key: 'camera' as const,
      label: t('criteriaCamera'),
      aVal: sanitizeVersusScore5(scoreA.criteria?.camera),
      bVal: sanitizeVersusScore5(scoreB.criteria?.camera),
    },
    {
      key: 'battery' as const,
      label: t('criteriaBattery'),
      aVal: sanitizeVersusScore5(scoreA.criteria?.battery),
      bVal: sanitizeVersusScore5(scoreB.criteria?.battery),
    },
    {
      key: 'value' as const,
      label: t('criteriaValue'),
      aVal: sanitizeVersusScore5(scoreA.criteria?.value),
      bVal: sanitizeVersusScore5(scoreB.criteria?.value),
    },
  ];

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
      const leadScore =
        weightedResult.finalA >= weightedResult.finalB
          ? weightedResult.finalA.toFixed(2)
          : weightedResult.finalB.toFixed(2);
      const lines = [
        `### ${t('md1v1Heading', { nameA: safeNameA, nameB: safeNameB })}`,
        weightedResult.tie
          ? `- **${t('mdLeadingDevice')}:** ${t('mdTieLine', { score: leadScore })}`
          : `- **${t('mdLeadingDevice')}:** **${safeWinnerName}** (${leadScore}/5.0 - ${t('mdScoreDelta', { delta: weightedResult.delta })})`,
        `- **${t('mdAuditUrl')}:** ${window.location.href}`,
        '',
        `| ${t('mdColCriterion')} | ${safeNameA} | ${safeNameB} | ${t('mdColAdvantage')} |`,
        `| --- | --- | --- | --- |`,
        `| **${t('mdRowWeightedScore')}** | **${weightedResult.finalA.toFixed(2)}/5.0** | **${weightedResult.finalB.toFixed(2)}/5.0** | **${weightedResult.tie ? sanitizeVersusMarkdownCell(t('mdRowTie')) : safeWinnerName}** |`,
        ...criteriaRows.map((r) => {
          const winName =
            r.aVal > r.bVal
              ? safeNameA
              : r.bVal > r.aVal
                ? safeNameB
                : sanitizeVersusMarkdownCell(t('mdRowTie'));
          return `| ${sanitizeVersusMarkdownCell(r.label)} | ${r.aVal.toFixed(2)}/5.0 | ${r.bVal.toFixed(2)}/5.0 | ${winName} |`;
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
    const rows: Array<Array<string | number>> = [
      [
        t('csvRowWeightedScore5'),
        100,
        weightedResult.finalA.toFixed(2),
        weightedResult.finalB.toFixed(2),
        weightedResult.winner.name,
      ],
      ...criteriaRows.map((r) => [
        r.label,
        weights[r.key],
        r.aVal.toFixed(2),
        r.bVal.toFixed(2),
        r.aVal > r.bVal
          ? scoreA.name
          : r.bVal > r.aVal
            ? scoreB.name
            : t('mdRowTie'),
      ]),
      [
        t('csvRowExpertScore10'),
        '-',
        scoreA.expertScore10 != null ? scoreA.expertScore10.toFixed(1) : '',
        scoreB.expertScore10 != null ? scoreB.expertScore10.toFixed(1) : '',
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
    const payload = {
      source: 'Rate.vn 1v1 Versus Scoreboard',
      versusSlug: `${safeSlugA}-vs-${safeSlugB}`,
      persona,
      weights,
      exportedAt: new Date().toISOString(),
      tie: weightedResult.tie,
      winner: weightedResult.tie
        ? null
        : {
            slug: sanitizeVersusExportSlug(weightedResult.winner.slug),
            name: weightedResult.winner.name,
            scoreDelta5: Number(weightedResult.delta),
          },
      productA: {
        slug: safeSlugA,
        name: scoreA.name,
        brand: scoreA.brand,
        weightedScore5: weightedResult.finalA,
        expertScore10: scoreA.expertScore10,
        minPriceVnd: scoreA.minPrice,
        dealRadar: radarExportFields(sigA),
      },
      productB: {
        slug: safeSlugB,
        name: scoreB.name,
        brand: scoreB.brand,
        weightedScore5: weightedResult.finalB,
        expertScore10: scoreB.expertScore10,
        minPriceVnd: scoreB.minPrice,
        dealRadar: radarExportFields(sigB),
      },
      criteriaBreakdown: criteriaRows.map((r) => ({
        key: r.key,
        label: r.label,
        weightPercent: weights[r.key],
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

  return (
    <div className="rate-scoreboard-dark rounded-4 p-4">
      {/* Top Action & Persona Filter Strip */}
      <div className="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 mb-3 flex-wrap gap-2 pb-3">
        {/* Presets expose the pressed one, not only its colour (DOS/Rate#1069). */}
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
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={persona === item.key}
              onClick={() => selectPersona(item.key)}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                persona === item.key
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
              showSliders || persona === 'custom'
                ? 'btn-warning text-dark fw-bold'
                : 'btn-outline-secondary text-light'
            }`}
            style={{ fontSize: '0.8125rem' }}
          >
            <BsSliders aria-hidden="true" className="me-1" />
            {t('customWeightsBtn')}
            {/* Custom weights select no preset and are shown only by this
                button's colour, so its name says so too (DOS/Rate#1069). */}
            {persona === 'custom' && (
              <span className="visually-hidden">{`: ${t('customWeightsActive')}`}</span>
            )}
          </button>
        </div>

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
          <Link
            href={`/compare/${scoreB.slug}-vs-${scoreA.slug}`}
            className="btn btn-sm btn-outline-light rounded-pill px-3"
            title={t('swapDevicesTitle')}
          >
            ⇄ {t('swapAbBtn')}
          </Link>
        </div>
      </div>

      {/* Interactive 5-Criteria Weight Sliders */}
      {showSliders && (
        <div
          id={slidersPanelId}
          className="rounded-3 border-secondary border-opacity-25 mb-3 border p-3"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <div className="row g-3">
            {criteriaRows.map((c) => (
              <div key={c.key} className="col-md col-6">
                <div className="d-flex justify-content-between small mb-1 text-white">
                  <span>{c.label}</span>
                  <strong className="text-warning rate-tabular">
                    {weights[c.key]}%
                  </strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={weights[c.key]}
                  onChange={(e) => updateWeight(c.key, Number(e.target.value))}
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
            <span className="text-white-50 small">{t('tieDeltaNote')}</span>
          ) : (
            <>
              <strong className="text-white">
                {weightedResult.winner.name}
              </strong>
              <span className="text-white-50 small ms-2">
                {t('leadingDeltaNote', { delta: weightedResult.delta })}
              </span>
            </>
          )}
        </div>
        <div className="rate-tabular small text-warning fw-bold">
          {scoreA.brand}: {weightedResult.finalA.toFixed(2)}/5.0 •{' '}
          {scoreB.brand}: {weightedResult.finalB.toFixed(2)}/5.0
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
            <span className="rate-score-badge-user">
              ★ {weightedResult.finalA.toFixed(2)}/5.0
            </span>
            <span className="rate-score-badge-expert">
              {scoreA.expertScore10 != null
                ? `Lab ${scoreA.expertScore10.toFixed(1)}/10`
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
            <span className="rate-score-badge-user">
              ★ {weightedResult.finalB.toFixed(2)}/5.0
            </span>
            <span className="rate-score-badge-expert">
              {scoreB.expertScore10 != null
                ? `Lab ${scoreB.expertScore10.toFixed(1)}/10`
                : t('labScorePending')}
            </span>
          </div>
        </div>
      </div>

      {/* 5-Criteria Dual Progress Bar Comparison Rows */}
      {criteriaRows.map((row) => {
        const aWins = row.aVal > row.bVal;
        const bWins = row.bVal > row.aVal;
        const aPct = Math.min(100, Math.round((row.aVal / 5) * 100));
        const bPct = Math.min(100, Math.round((row.bVal / 5) * 100));
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
                  {row.aVal.toFixed(2)}/5.0 {aWins ? '✓' : ''}
                </span>
                <div
                  className="progress bg-dark d-none d-md-flex flex-grow-1"
                  style={{ height: 6 }}
                >
                  <div
                    className={`progress-bar ${
                      aWins ? 'bg-success' : 'bg-secondary'
                    }`}
                    style={{ width: `${aPct}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="small text-light fw-semibold col-4 text-center">
              {row.label}{' '}
              <span className="text-white-50 rate-tabular">
                ({weights[row.key]}%)
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
                    style={{ width: `${bPct}%` }}
                  />
                </div>
                <span
                  className={`rate-tabular fw-bold ${
                    bWins ? 'text-success' : 'text-white-50'
                  }`}
                >
                  {bWins ? '✓ ' : ''}
                  {row.bVal.toFixed(2)}/5.0
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
  );
}
