import React from 'react';
import { useTranslations } from 'next-intl';
import { EMPTY_RADAR_SIGNAL, type RadarSignal } from '@/lib/deal-radar';

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
  let label = '';
  if (sig.verdict === 'genuine_deal') {
    label = tDeals('radarBadgeGenuine', { pct: sig.savingsPct.toFixed(1) });
  } else if (sig.verdict === 'fake_sale_trap') {
    label = tDeals('radarBadgeFakeTrap', {
      pct: sig.fakeMarkupPct.toFixed(1),
    });
  } else if (sig.spreadPct > 0 && sig.spreadPct >= minSpreadPct) {
    label = tDeals('radarBadgeSpread', { pct: sig.spreadPct.toFixed(1) });
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
