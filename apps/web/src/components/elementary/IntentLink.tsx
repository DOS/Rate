'use client';

import { useState, type ComponentProps } from 'react';
import { Link } from '@/lib/navigation';

type IntentLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'>;

/**
 * A locale Link that prefetches only once the visitor shows intent (pointer
 * over it, keyboard focus, or a touch). Next prefetches every Link in the
 * viewport by default, so the header, footer and long link lists fetched
 * hundreds of KB of routes nobody opened on each page view (DOS/Rate#1330).
 * Use it for secondary links; keep the plain Link for the page's main next
 * steps.
 */
export function IntentLink({
  onPointerEnter,
  onFocus,
  onTouchStart,
  ...props
}: IntentLinkProps) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onPointerEnter={(event) => {
        setIntent(true);
        onPointerEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
