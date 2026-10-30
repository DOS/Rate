'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from '@/lib/navigation';

export interface CatalogSortItem {
  href: string;
  label: string;
  active: boolean;
}

// Keep the menu this far from the viewport edges.
const EDGE_PX = 8;

const itemLinks = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLAnchorElement>('.dropdown-item') ?? []);

/** Focuses item `index` of the menu, wrapping around both ends. */
const focusItem = (menu: HTMLElement | null, index: number) => {
  const links = itemLinks(menu);
  if (links.length === 0) return;
  links[(index + links.length) % links.length]!.focus();
};

/**
 * The catalogue's sort menu, driven by React state instead of Bootstrap's JS
 * bundle (DOS/Rate#1331). Bootstrap's CSS still styles it: `.dropdown-menu.show`
 * opens the menu. Like Bootstrap's dropdown it opens with a click or ArrowDown,
 * moves between items with the arrow keys, Home and End, and closes on a pick,
 * a click outside, Escape (focus returns to the button) or focus leaving it.
 * It is aligned to the button's right edge unless that would cross the
 * viewport's left edge, and never wider than the viewport.
 */
export default function CatalogSortDropdown({
  label,
  items,
}: {
  label: string;
  items: CatalogSortItem[];
}) {
  const [open, setOpen] = useState(false);
  const [alignStart, setAlignStart] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const { right } = button.getBoundingClientRect();
    setAlignStart(right - menu.offsetWidth < EDGE_PX);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      const links = itemLinks(menuRef.current);
      const at = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (at < 0) return;
      const moves: Record<string, number> = {
        ArrowDown: at + 1,
        ArrowUp: at - 1,
        Home: 0,
        End: links.length - 1,
      };
      if (e.key in moves) {
        e.preventDefault();
        focusItem(menuRef.current, moves[e.key]!);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const toLast = e.key === 'ArrowUp';
      requestAnimationFrame(() => focusItem(menuRef.current, toLast ? -1 : 0));
    }
  };
  return (
    <div
      ref={rootRef}
      className="dropdown d-inline-flex mw-100 p-0"
      onBlur={(e) => {
        // Only focus moving to another element outside closes it (Tab out).
        // A mouse press moves focus nowhere in Safari (relatedTarget null);
        // closing then would drop the click on an item, and the pointerdown
        // listener already handles clicks outside.
        const next = e.relatedTarget as Node | null;
        if (next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`dropdown-toggle toogleDrops px-3 py-2${open ? ' show' : ''}`}
        id="shortfilter"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
      >
        {label}
      </button>
      <div
        ref={menuRef}
        id={menuId}
        className={`dropdown-menu dropdown-menu-end border shadow-sm${open ? ' show' : ''}`}
        style={
          open
            ? {
                position: 'absolute',
                top: '100%',
                ...(alignStart ? { left: 0 } : { right: 0 }),
                maxWidth: `calc(100vw - ${2 * EDGE_PX}px)`,
              }
            : undefined
        }
      >
        <ul className="card rounded-0 list-unstyled mb-0 p-0">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`dropdown-item text-wrap ${item.active ? 'active' : ''}`}
                aria-current={item.active ? 'true' : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
