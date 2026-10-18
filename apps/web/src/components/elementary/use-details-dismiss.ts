'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Native <details> menus have no light-dismiss. This closes the menu on a
 * pointer press outside it, when keyboard focus leaves it, or on Escape
 * pressed inside it (returning focus to its <summary>), and returns a
 * `close` helper for actions that should dismiss it.
 */
export function useDetailsDismiss() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;

    const onPointerDown = (e: PointerEvent) => {
      if (menu.open && !e.composedPath().includes(menu)) menu.open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !menu.open) return;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (menu.open && next && !menu.contains(next)) menu.open = false;
    };

    document.addEventListener('pointerdown', onPointerDown);
    menu.addEventListener('keydown', onKeyDown);
    menu.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      menu.removeEventListener('keydown', onKeyDown);
      menu.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const close = useCallback(() => {
    if (ref.current) ref.current.open = false;
  }, []);

  return { ref, close };
}
