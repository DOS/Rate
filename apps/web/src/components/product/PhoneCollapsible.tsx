'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { BsChevronDown } from 'react-icons/bs';

// A long list that stays whole from tablets up; on phones only its first three
// children show until the reader expands it (DOS/Rate#621). The hidden part
// stays in the HTML for search engines, but browser find-in-page skips it
// until it is expanded.
export default function PhoneCollapsible({
  className,
  showMoreLabel,
  showLessLabel,
  openOnHash,
  collapsible = true,
  children,
}: {
  className: string;
  showMoreLabel: string;
  showLessLabel: string;
  /** Expand when the page is opened or navigated to this hash, e.g. "#specs". */
  openOnHash?: string;
  /**
   * False when there is nothing past the first three children: the list then
   * shows whole, with no toggle (DOS/Rate#1186).
   */
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openOnHash) return;
    const sync = () => {
      if (window.location.hash === openOnHash) setOpen(true);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [openOnHash]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Collapsing removes a long stretch above the button; keep it in view.
    if (!next) {
      requestAnimationFrame(() =>
        buttonRef.current?.scrollIntoView({ block: 'nearest' })
      );
    }
  };

  if (!collapsible) {
    return (
      <div className={`${className} rate-phone-collapsible`}>{children}</div>
    );
  }

  return (
    <>
      <div
        id={id}
        className={`${className} rate-phone-collapsible${open ? '' : ' is-collapsed'}`}
      >
        {children}
      </div>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-outline-secondary rounded-pill d-md-none d-print-none d-inline-flex align-items-center justify-content-center fw-semibold mt-3 w-100 gap-2"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        {open ? showLessLabel : showMoreLabel}
        <BsChevronDown
          aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
    </>
  );
}
