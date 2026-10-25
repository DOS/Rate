import React from 'react';
import { useTranslations } from 'next-intl';
import { EMPTY_RADAR_SIGNAL, type RadarSignal } from '@/lib/deal-radar';

export function sanitizeRadarPercentage(value: unknown, maxPct = 1000): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(maxPct, num);
}

interface RadarBadgeProps {
  readonly signal: RadarSignal;
  /** Hide the spread-only badge below this percentage (default 10). */
  readonly minSpreadPct?: number;
  readonly className?: string;
  /** Rendered when the product has no radar signal. */
  readonly emptyFallback?: React.ReactNode;
  readonly style?: React.CSSProperties;
}

/**
 * The only place that decides how a Deal Radar signal looks.
 * Renders nothing when the product has no signal.
 */
export default function RadarBadge({
  signal,
  minSpreadPct = 10,
  className = '',
  emptyFallback = null,
  style,
}: RadarBadgeProps) {
  const tDeals = useTranslations('deals');
  const sig = signal ?? EMPTY_RADAR_SIGNAL;
  const safeSavingsPct = sanitizeRadarPercentage(sig.savingsPct, 100);
  const safeFakeMarkupPct = sanitizeRadarPercentage(sig.fakeMarkupPct, 1000);
  const safeSpreadPct = sanitizeRadarPercentage(sig.spreadPct, 1000);
  const safeMinSpreadPct = Number.isFinite(minSpreadPct)
    ? Math.max(0, minSpreadPct)
    : 10;
  let label = '';
  if (sig.verdict === 'genuine_deal' && safeSavingsPct > 0) {
    label = tDeals('radarBadgeGenuine', { pct: safeSavingsPct.toFixed(1) });
  } else if (sig.verdict === 'fake_sale_trap' && safeFakeMarkupPct > 0) {
    label = tDeals('radarBadgeFakeTrap', {
      pct: safeFakeMarkupPct.toFixed(1),
    });
  } else if (safeSpreadPct > 0 && safeSpreadPct >= safeMinSpreadPct) {
    label = tDeals('radarBadgeSpread', { pct: safeSpreadPct.toFixed(1) });
  }
  if (!label) return <>{emptyFallback}</>;
  const tone =
    sig.verdict === 'genuine_deal'
      ? 'bg-success text-white'
      : sig.verdict === 'fake_sale_trap'
        ? 'bg-danger text-white'
        : 'bg-warning-subtle text-dark border border-warning-subtle';
  return (
    <span
      data-testid="radar-badge"
      data-radar-verdict={sig.verdict}
      className={`badge rounded-pill small rate-tabular ${tone} ${className}`.trim()}
      style={style}
    >
      {label}
    </span>
  );
}
