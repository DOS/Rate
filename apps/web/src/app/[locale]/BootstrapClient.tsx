'use client';

import { useEffect } from 'react';

export default function BootstrapClient() {
  useEffect(() => {
    // Dynamically import bootstrap JS on client only and expose to window
    (async () => {
      try {
        const bs = await import('bootstrap/dist/js/bootstrap.bundle.min.js');
        (window as any).bootstrap = bs;
      } catch {
        // noop
      }
    })();
  }, []);
  return null;
}


