'use client';

import { useEffect } from 'react';

export default function BootstrapClient() {
  useEffect(() => {
    // Dynamically import bootstrap JS on client only
    import('bootstrap/dist/js/bootstrap.bundle.min.js').catch(() => {});
  }, []);
  return null;
}


