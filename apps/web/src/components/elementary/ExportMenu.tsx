'use client';

import type { ReactNode, SyntheticEvent } from 'react';
import { BsDownload } from 'react-icons/bs';
import { useDetailsDismiss } from '@/components/elementary/use-details-dismiss';

// Keep the open list this far from the viewport edges.
const EDGE_GAP = 8;

// One "Export data" disclosure for a section's Markdown/CSV/JSON actions, so
// developer exports do not crowd shopper-facing headers (DOS/Rate#623).
// `children` receives `close` for actions that should dismiss the menu.
export default function ExportMenu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const { ref, close } = useDetailsDismiss();

  // The list hangs from the summary's right edge by default; where that would
  // run off the left of the screen (the menu starts a wrapped row), open it
  // rightwards instead. Measured on open because each section header wraps
  // at its own breakpoint.
  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const menu = e.currentTarget;
    if (!menu.open) return;
    const summary = menu.querySelector('summary');
    const list = menu.querySelector<HTMLElement>('.rate-export-menu-list');
    if (!summary || !list) return;
    const { right } = summary.getBoundingClientRect();
    const fitsEndAligned = right - list.offsetWidth >= EDGE_GAP;
    menu.dataset.align = fitsEndAligned ? 'end' : 'start';
  };

  return (
    <details ref={ref} className="rate-export-menu" onToggle={onToggle}>
      <summary>
        <BsDownload aria-hidden="true" />
        {label}
      </summary>
      <div className="rate-export-menu-list">{children(close)}</div>
    </details>
  );
}
