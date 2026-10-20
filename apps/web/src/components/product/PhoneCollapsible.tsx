'use client';

import { useId, useState, type ReactNode } from 'react';
import { BsChevronDown } from 'react-icons/bs';

// A long list that stays whole from tablets up; on phones only its first three
// children show until the reader expands it (DOS/Rate#621). The hidden part
// stays in the HTML, so search engines and in-page tools still see it.
export default function PhoneCollapsible({
  className,
  showMoreLabel,
  showLessLabel,
  children,
}: {
  className: string;
  showMoreLabel: string;
  showLessLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <div
        id={id}
        className={`${className} rate-phone-collapsible${open ? '' : ' is-collapsed'}`}
      >
        {children}
      </div>
      <button
        type="button"
        className="btn btn-outline-secondary rounded-pill d-md-none d-inline-flex align-items-center justify-content-center fw-semibold mt-3 w-100 gap-2"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
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
