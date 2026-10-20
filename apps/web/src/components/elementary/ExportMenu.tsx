'use client';

import type { ReactNode } from 'react';
import { BsDownload } from 'react-icons/bs';
import { useDetailsDismiss } from '@/components/elementary/use-details-dismiss';

// One "Export data" disclosure for a section's Markdown/CSV/JSON actions, so
// developer exports do not crowd shopper-facing headers (DOS/Rate#623).
// `children` receives `close` for actions that should dismiss the menu.
export default function ExportMenu({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const { ref, close } = useDetailsDismiss();

  return (
    <details
      ref={ref}
      className={
        className ? `rate-export-menu ${className}` : 'rate-export-menu'
      }
    >
      <summary>
        <BsDownload aria-hidden="true" />
        {label}
      </summary>
      <div className="rate-export-menu-list">{children(close)}</div>
    </details>
  );
}
