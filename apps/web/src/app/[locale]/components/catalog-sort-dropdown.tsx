'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@/lib/navigation';

export interface CatalogSortItem {
  href: string;
  label: string;
  active: boolean;
}

/**
 * The catalogue's sort menu, driven by React state instead of Bootstrap's JS
 * bundle (DOS/Rate#1331). Bootstrap's CSS still styles it: `.dropdown-menu.show`
 * opens the menu. It closes on a pick, a click outside or Escape (focus returns
 * to the button).
 */
export default function CatalogSortDropdown({
  label,
  items,
}: {
  label: string;
  items: CatalogSortItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="dropdown d-inline-flex mw-100 p-0">
      <button
        ref={buttonRef}
        type="button"
        className={`dropdown-toggle toogleDrops px-3 py-2${open ? ' show' : ''}`}
        id="shortfilter"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      <div
        id={menuId}
        className={`dropdown-menu dropdown-menu-end border shadow-sm${open ? ' show' : ''}`}
        style={
          open ? { position: 'absolute', inset: '100% 0 auto auto' } : undefined
        }
      >
        <ul className="card rounded-0 list-unstyled mb-0 p-0">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`dropdown-item ${item.active ? 'active' : ''}`}
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
