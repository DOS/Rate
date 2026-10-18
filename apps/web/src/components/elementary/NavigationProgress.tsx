'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './NavigationProgress.module.css';

// Hide the bar even if a navigation never commits (cancelled, or a link whose
// own handler prevented it).
const MAX_VISIBLE_MS = 8_000;

/**
 * Thin top bar from an internal link click until the next route renders.
 * Replaces the old route-level loading.tsx spinner, which had to go because a
 * Suspense boundary above detail pages turned their 404s into 200s
 * (DOS/Rate#316, #318).
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const current = `${pathname}?${search}`;
  const [active, setActive] = useState(false);
  // Any route change (link, back/forward, router.push) ends the bar. Adjusting
  // state during render is React's pattern for reacting to a changed value.
  const [shownFor, setShownFor] = useState(current);
  if (shownFor !== current) {
    setShownFor(current);
    setActive(false);
  }

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    // Capture phase: Next's <Link> calls preventDefault() in its own handler.
    function onClick(event: MouseEvent) {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.download)
        return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same page (hash links, the active nav item): nothing will render.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      setActive(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setActive(false), MAX_VISIBLE_MS);
    }
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!active) return null;
  return (
    <div className={styles.bar} data-testid="navigation-progress" aria-hidden />
  );
}
