interface RateWordmarkProps {
  /** `ink` for light grounds (navbar), `light` for obsidian grounds (footer). */
  readonly tone?: 'ink' | 'light';
  /** Height of the mark in px; the name scales with it. */
  readonly size?: number;
  readonly className?: string;
}

/**
 * The Rate.vn wordmark: the brand mark (a #ff2e29 dot on a #12151a disc,
 * the same geometry as the extension icon) followed by "Rate.vn" in Inter 800.
 */
export default function RateWordmark({
  tone = 'ink',
  size = 28,
  className = '',
}: RateWordmarkProps) {
  return (
    <span
      className={`rate-wordmark rate-wordmark-${tone} ${className}`.trim()}
      style={{ fontSize: `${Math.round(size * 0.82)}px` }}
    >
      <RateMark size={size} />
      <span className="rate-wordmark-name">Rate.vn</span>
    </span>
  );
}

export function RateMark({ size = 28 }: { readonly size?: number }) {
  return (
    <svg
      className="rate-mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="50" cy="50" r="46" fill="#12151a" />
      <circle cx="50" cy="50" r="24" fill="#ff2e29" />
    </svg>
  );
}
