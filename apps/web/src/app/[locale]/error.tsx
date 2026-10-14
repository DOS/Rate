'use client';

import React, { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/navigation';
import { isDevelopment } from '@/lib/general-helpers';

interface Props {
  readonly error: Error;
  readonly reset: () => void;
}

export default function Error({ error, reset }: Props) {
  const t = useTranslations('errors.global');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const isDev = isDevelopment();

  return (
    <section className="bg-light py-5 min-vh-100 d-flex align-items-center">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-7">
            <div className="card border-0 rounded-4 shadow-sm p-4 p-md-5 text-center bg-white">
              <div className="mb-3">
                <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill px-3 py-2 fw-semibold">
                  Rate.vn System Guard
                </span>
              </div>
              <h1 className="h3 fw-bold text-dark mb-2">
                {t('somethingWentWrong')}
              </h1>
              <p className="text-muted mb-4">
                {t('invalidContent')}
                {isDev ? `: ${error.message}` : null}
              </p>

              {isDev && error.stack && (
                <div className="text-start bg-dark text-light rounded-3 p-3 mb-4 small overflow-auto">
                  <pre className="mb-0">
                    {error.stack.split('\n').slice(0, 7).join('\n')}
                  </pre>
                </div>
              )}

              <div className="d-flex flex-wrap justify-content-center gap-2">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="btn btn-danger rounded-pill px-4 fw-semibold"
                >
                  🔄 {t('tryAgain')}
                </button>
                <Link
                  href="/"
                  className="btn btn-outline-dark rounded-pill px-4 fw-medium"
                >
                  🏠 Rate.vn Home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
