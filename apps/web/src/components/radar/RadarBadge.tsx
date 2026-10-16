import React from 'react';
import { radarLabel, type RadarSignal } from '@/lib/deal-radar';

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
  const label = radarLabel(signal, minSpreadPct);
  if (!label) return <>{emptyFallback}</>;
  const tone =
    signal.verdict === 'genuine_deal'
      ? 'bg-success text-white'
      : signal.verdict === 'fake_sale_trap'
        ? 'bg-danger text-white'
        : 'bg-warning-subtle text-dark border border-warning-subtle';
  return (
    <span
      data-testid="radar-badge"
      data-radar-verdict={signal.verdict}
      className={`badge rounded-pill small font-monospace ${tone} ${className}`.trim()}
      style={style}
    >
      {label}
    </span>
  );
}
