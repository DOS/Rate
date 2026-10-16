'use client';

import { useEffect } from 'react';
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
    <section className="bg-light min-vh-100 d-flex align-items-center py-5">
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-lg-7">
            <div className="card rounded-4 p-md-5 border-0 bg-white p-4 text-center shadow-sm">
              <div className="mb-3">
                <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill fw-semibold px-3 py-2">
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
                <div className="bg-dark text-light rounded-3 small mb-4 overflow-auto p-3 text-start">
                  <pre className="mb-0">
                    {error.stack.split('\n').slice(0, 7).join('\n')}
                  </pre>
                </div>
              )}

              <div className="d-flex justify-content-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="btn btn-danger rounded-pill fw-semibold px-4"
                >
                  🔄 {t('tryAgain')}
                </button>
                <Link
                  href="/"
                  className="btn btn-outline-dark rounded-pill fw-medium px-4"
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
