import React from 'react';
import { Spinner } from '@/components/elementary/Spinner';

export default function Loading() {
  return (
    <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center bg-light gap-3 py-5">
      <Spinner className="size-8 border-3 border-danger" />
      <div className="small fw-semibold text-muted">
        Rate.vn - 10 Spec Groups &amp; Price History...
      </div>
    </div>
  );
}
