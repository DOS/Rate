'use client';

import React, { Suspense } from 'react';
import { NavigationProgress } from '@/components/elementary/NavigationProgress';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* useSearchParams needs its own boundary; it wraps only the bar. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {children}
    </>
  );
}
