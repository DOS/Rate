import Image from 'next/image';

interface RateWordmarkProps {
  /** `ink` for light grounds (navbar), `light` for obsidian grounds (footer). */
  readonly tone?: 'ink' | 'light';
  /** Height of the mark in px; the name scales with it. */
  readonly size?: number;
  readonly className?: string;
}

/**
 * The Rate.vn wordmark: the official split star (red #D83030 / green #2DBA69,
 * from the brand logo files) followed by "Rate.vn" in Inter 800.
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

/** The official star mark alone (public/img/rate-logo-512.png, 512x512 with transparent padding). */
export function RateMark({ size = 28 }: { readonly size?: number }) {
  return (
    <Image
      className="rate-mark"
      src="/img/rate-logo-512.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      priority
    />
  );
}
