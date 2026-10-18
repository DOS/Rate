'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Native <details> menus have no light-dismiss. This closes the menu on a
 * pointer press outside it or on Escape (returning focus to its <summary>),
 * and returns a `close` helper for actions that should dismiss it.
 */
export function useDetailsDismiss() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const menu = ref.current;
      if (menu?.open && !menu.contains(e.target as Node)) menu.open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const menu = ref.current;
      if (e.key === 'Escape' && menu?.open) {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const close = useCallback(() => {
    if (ref.current) ref.current.open = false;
  }, []);

  return { ref, close };
}
