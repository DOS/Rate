'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BsInfoCircle } from 'react-icons/bs';

/**
 * A small info (i) button with a short explanation (DOS/Rate#1946). The text
 * shows on hover and on keyboard focus (CSS), and a tap or click pins it open
 * until the next tap, a press outside or Escape, so it also works on touch
 * screens. Escape also hides a bubble opened by hover or focus (WCAG 1.4.13)
 * until the pointer or focus leaves. The button's accessible name is `label`
 * and the text is its description, so screen readers read it without opening
 * anything.
 *
 * The bubble is positioned against the nearest positioned ancestor, so the
 * caller decides how wide it may grow (the scoreboard uses the score label).
 */
export default function InfoTip({
  label,
  text,
  testId,
}: {
  label: string;
  text: string;
  testId?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinned]);

  // A bubble hidden with Escape comes back on the next hover.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onMouseLeave = () => setDismissed(false);
    root.addEventListener('mouseleave', onMouseLeave);
    return () => root.removeEventListener('mouseleave', onMouseLeave);
  }, []);

  const classes = [
    'rate-infotip',
    pinned && 'is-open',
    dismissed && 'is-dismissed',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span ref={rootRef} className={classes} data-testid={testId}>
      <button
        type="button"
        className="rate-infotip-btn"
        aria-label={label}
        aria-describedby={tipId}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || dismissed) return;
          e.preventDefault();
          setPinned(false);
          setDismissed(true);
        }}
        onBlur={() => setDismissed(false)}
        onClick={() => {
          setDismissed(false);
          setPinned((open) => !open);
        }}
      >
        <BsInfoCircle aria-hidden="true" />
      </button>
      <span id={tipId} role="tooltip" className="rate-infotip-bubble">
        {text}
      </span>
    </span>
  );
}
