'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/navigation';
import type { ScoredLeaderboardItem } from '@/lib/leaderboard-engine';
import {
  getRadarSignal,
  RADAR_CSV_HEADERS,
  radarCsvCells,
  radarExportFields,
  radarLabel,
  radarMarkdownCell,
} from '@/lib/deal-radar';
import { escapeCsvCell } from '@/lib/csv-safe';
import RadarBadge from '@/components/radar/RadarBadge';
import { useDealRadarIndex } from '@/components/radar/use-deal-radar';

type ScoredVersusItem = Omit<ScoredLeaderboardItem, 'rank'>;

interface VersusInteractiveScoreboardProps {
  readonly scoreA: ScoredVersusItem;
  readonly scoreB: ScoredVersusItem;
  readonly locale?: string;
}

type PersonaPresetKey =
  | 'default'
  | 'photography'
  | 'gaming'
  | 'endurance'
  | 'business'
  | 'value_hunter'
  | 'custom';

interface CriteriaWeights {
  screen: number;
  performance: number;
  camera: number;
  battery: number;
  value: number;
}

const PERSONA_WEIGHTS: Record<
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

export default function VersusInteractiveScoreboard({
  scoreA,
  scoreB,
}: VersusInteractiveScoreboardProps) {
  const t = useTranslations('compare');
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
    setWeights((prev) => ({
      ...prev,
      [key]: Math.max(0, Math.min(100, val)),
    }));
  };

  const weightedResult = useMemo(() => {
    const sumW =
      weights.screen +
        weights.performance +
        weights.camera +
        weights.battery +
        weights.value || 100;

    const calcWeighted = (item: ScoredVersusItem): number => {
      if (persona === 'default') {
        return item.combinedScore5;
      }
      const c = item.criteria;
      const wAvg =
        (c.screen * weights.screen +
          c.performance * weights.performance +
          c.camera * weights.camera +
          c.battery * weights.battery +
          c.value * weights.value) /
        sumW;
      return Number((item.combinedScore5 * 0.35 + wAvg * 0.65).toFixed(2));
    };

    const finalA = calcWeighted(scoreA);
    const finalB = calcWeighted(scoreB);
    const winner =
      finalA > finalB
        ? scoreA
        : finalB > finalA
          ? scoreB
          : scoreA.minPrice <= scoreB.minPrice
            ? scoreA
            : scoreB;

    return {
      finalA,
      finalB,
      delta: Math.abs(finalA - finalB).toFixed(2),
      winner,
    };
  }, [scoreA, scoreB, weights, persona]);

  const criteriaRows = [
    {
      key: 'screen' as const,
      label: t('criteriaScreen'),
      aVal: scoreA.criteria.screen,
      bVal: scoreB.criteria.screen,
    },
    {
      key: 'performance' as const,
      label: t('criteriaPerformance'),
      aVal: scoreA.criteria.performance,
      bVal: scoreB.criteria.performance,
    },
    {
      key: 'camera' as const,
      label: t('criteriaCamera'),
      aVal: scoreA.criteria.camera,
      bVal: scoreB.criteria.camera,
    },
    {
      key: 'battery' as const,
      label: t('criteriaBattery'),
      aVal: scoreA.criteria.battery,
      bVal: scoreB.criteria.battery,
    },
    {
      key: 'value' as const,
      label: t('criteriaValue'),
      aVal: scoreA.criteria.value,
      bVal: scoreB.criteria.value,
    },
  ];

  const handleCopy1v1Markdown = async () => {
    if (typeof window === 'undefined') return;
    try {
      const sigA = getRadarSignal(radarIndex, scoreA.slug);
      const sigB = getRadarSignal(radarIndex, scoreB.slug);
      const leadScore =
        weightedResult.finalA >= weightedResult.finalB
          ? weightedResult.finalA.toFixed(2)
          : weightedResult.finalB.toFixed(2);
      const lines = [
        `### ${t('md1v1Heading', { nameA: scoreA.name, nameB: scoreB.name })}`,
        `- **${t('mdLeadingDevice')}:** **${weightedResult.winner.name}** (${leadScore}/5.0 - ${t('mdScoreDelta', { delta: weightedResult.delta })})`,
        `- **${t('mdAuditUrl')}:** ${window.location.href}`,
        '',
        `| ${t('mdColCriterion')} | ${scoreA.name} | ${scoreB.name} | ${t('mdColAdvantage')} |`,
        `| --- | --- | --- | --- |`,
        `| **${t('mdRowWeightedScore')}** | **${weightedResult.finalA.toFixed(2)}/5.0** | **${weightedResult.finalB.toFixed(2)}/5.0** | **${weightedResult.winner.name}** |`,
        ...criteriaRows.map((r) => {
          const winName =
            r.aVal > r.bVal
              ? scoreA.name
              : r.bVal > r.aVal
                ? scoreB.name
                : t('mdRowTie');
          return `| ${r.label} | ${r.aVal.toFixed(2)}/5.0 | ${r.bVal.toFixed(2)}/5.0 | ${winName} |`;
        }),
        `| **${t('mdRowMinPrice')}** | ${scoreA.minPrice.toLocaleString('vi-VN')} ₫ | ${scoreB.minPrice.toLocaleString('vi-VN')} ₫ | ${scoreA.minPrice <= scoreB.minPrice ? scoreA.name : scoreB.name} |`,
        `| **${t('mdRowDealRadar')}** | ${radarMarkdownCell(sigA)} | ${radarMarkdownCell(sigB)} | ${sigA.verdict === 'genuine_deal' ? scoreA.name : sigB.verdict === 'genuine_deal' ? scoreB.name : '-'} |`,
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
          ? scoreA.expertScore10 >= scoreB.expertScore10
            ? scoreA.name
            : scoreB.name
          : scoreA.expertScore10 != null
            ? scoreA.name
            : scoreB.expertScore10 != null
              ? scoreB.name
              : '-',
      ],
      [
        t('csvRowMinPriceVnd'),
        '-',
        scoreA.minPrice,
        scoreB.minPrice,
        scoreA.minPrice <= scoreB.minPrice ? scoreA.name : scoreB.name,
      ],
      [
        t('mdRowDealRadar'),
        '-',
        radarLabel(sigA),
        radarLabel(sigB),
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
    a.download = `rate-1v1-${scoreA.slug}-vs-${scoreB.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadVersusJson = () => {
    if (typeof window === 'undefined') return;
    const sigA = getRadarSignal(radarIndex, scoreA.slug);
    const sigB = getRadarSignal(radarIndex, scoreB.slug);
    const payload = {
      source: 'Rate.vn 1v1 Versus Scoreboard',
      versusSlug: `${scoreA.slug}-vs-${scoreB.slug}`,
      persona,
      weights,
      exportedAt: new Date().toISOString(),
      winner: {
        slug: weightedResult.winner.slug,
        name: weightedResult.winner.name,
        scoreDelta5: Number(weightedResult.delta),
      },
      productA: {
        slug: scoreA.slug,
        name: scoreA.name,
        brand: scoreA.brand,
        weightedScore5: weightedResult.finalA,
        expertScore10: scoreA.expertScore10,
        minPriceVnd: scoreA.minPrice,
        dealRadar: radarExportFields(sigA),
      },
      productB: {
        slug: scoreB.slug,
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
    a.download = `rate-1v1-${scoreA.slug}-vs-${scoreB.slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rate-scoreboard-dark rounded-4 p-4">
      {/* Top Action & Persona Filter Strip */}
      <div className="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 mb-3 flex-wrap gap-2 pb-3">
        <div className="d-flex align-items-center flex-wrap gap-1">
          <span className="small text-white-50 fw-semibold me-1">
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
            onClick={() => setShowSliders((prev) => !prev)}
            className={`btn btn-sm rounded-pill px-3 py-1 ${
              showSliders || persona === 'custom'
                ? 'btn-warning text-dark fw-bold'
                : 'btn-outline-secondary text-light'
            }`}
            style={{ fontSize: '0.8125rem' }}
          >
            🎛️ {t('customWeightsBtn')}
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
            📥 CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadVersusJson}
            data-testid="versus-export-json-btn"
            className="btn btn-sm btn-outline-light rounded-pill fw-semibold px-3"
          >
            📦 JSON
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
          className="rounded-3 border-secondary border-opacity-25 mb-3 border p-3"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <div className="row g-3">
            {criteriaRows.map((c) => (
              <div key={c.key} className="col-md col-6">
                <div className="d-flex justify-content-between small mb-1 text-white">
                  <span>{c.label}</span>
                  <strong className="text-warning font-monospace">
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
            'linear-gradient(90deg, rgba(16,185,129,0.16) 0%, rgba(255,46,41,0.12) 100%)',
          border: '1px solid rgba(52,211,153,0.35)',
        }}
      >
        <div>
          <span className="badge bg-success rounded-pill me-2 text-white">
            {t('leading1v1Badge')}
          </span>
          <strong className="text-white">{weightedResult.winner.name}</strong>
          <span className="text-white-50 small ms-2">
            {t('leadingDeltaNote', { delta: weightedResult.delta })}
          </span>
        </div>
        <div className="font-monospace small text-warning fw-bold">
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
                  className={`font-monospace fw-bold ${
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
              <span className="text-white-50 font-monospace">
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
                  className={`font-monospace fw-bold ${
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
              <span className="badge bg-dark border-secondary text-white-50 rounded-pill font-monospace border">
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
              <span className="badge bg-dark border-secondary text-white-50 rounded-pill font-monospace border">
                {t('price60dStable')}
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}
