'use client';

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/navigation';
import {
  BsCheckCircleFill,
  BsExclamationTriangleFill,
  BsSendFill,
  BsShieldCheck,
} from 'react-icons/bs';

// Body of POST /api/v1/rate/extension/ingest: { ok, data } on 200, { ok: false,
// error } otherwise.
interface IngestResponse {
  ok?: boolean;
  data?: { accepted?: boolean; jobState?: string; jobId?: string | null };
}

type SubmitOutcome =
  | 'accepted'
  | 'noConsent'
  | 'invalidUrl'
  | 'platformPending'
  | 'invalidPrice'
  | 'accessory'
  | 'rateLimited'
  | 'invalidInput'
  | 'failed';

interface SubmitResult {
  accepted: boolean;
  outcome: SubmitOutcome;
  jobId: string | null;
}

function outcomeFromJobState(jobState: string | undefined): SubmitOutcome {
  switch (jobState) {
    case 'skipped_no_consent':
      return 'noConsent';
    case 'rejected_invalid_url':
      return 'invalidUrl';
    // A valid link from a store whose checking worker is not running yet.
    case 'platform_worker_pending_phase_5_1':
      return 'platformPending';
    case 'rejected_invalid_price':
      return 'invalidPrice';
    case 'skipped_accessory':
      return 'accessory';
    default:
      return 'failed';
  }
}

export default function CommunityQuarantineSubmitForm() {
  const t = useTranslations('staticPages');
  const fieldId = useId();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [skuText, setSkuText] = useState('');
  const [consentGranted, setConsentGranted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/v1/rate/extension/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim(),
          price: Math.round(Number(currentPrice)),
          originalPrice: originalPrice.trim()
            ? Math.round(Number(originalPrice))
            : undefined,
          selectedVariant: skuText.trim() || undefined,
          userConsentOptIn: consentGranted,
        }),
      });
      const body = (await res
        .json()
        .catch(() => null)) as IngestResponse | null;
      if (res.ok && body?.ok && body.data) {
        // A dry run (no database configured) queues nothing, so it is not
        // reported as received.
        const accepted =
          body.data.accepted === true &&
          body.data.jobState !== 'quarantined_dry_run';
        setResult({
          accepted,
          outcome: accepted
            ? 'accepted'
            : outcomeFromJobState(body.data.jobState),
          jobId: accepted ? (body.data.jobId ?? null) : null,
        });
      } else {
        setResult({
          accepted: false,
          outcome:
            res.status === 429
              ? 'rateLimited'
              : res.status === 400
                ? 'invalidInput'
                : 'failed',
          jobId: null,
        });
      }
    } catch {
      setResult({ accepted: false, outcome: 'failed', jobId: null });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card rounded-4 p-md-5 border bg-white p-4 shadow-sm">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <span className="badge bg-danger bg-opacity-10 text-danger rounded-pill fw-semibold mb-2 px-3 py-1">
            {t('quarantineBadge')}
          </span>
          <h3 className="h4 fw-bold mb-1">{t('quarantineTitle')}</h3>
          <p className="text-muted small mb-0">{t('quarantineSubtitle')}</p>
        </div>
        <Link
          href={`/inspect?q=${encodeURIComponent(url)}`}
          className="btn btn-sm btn-outline-primary rounded-pill fw-semibold px-3"
        >
          {t('quarantineOpenInspectBtn')}
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="row g-3">
        <div className="col-md-7">
          <label
            className="form-label small fw-bold text-secondary"
            htmlFor={`${fieldId}-url`}
          >
            {t('quarantineUrlLabel')}
          </label>
          <input
            id={`${fieldId}-url`}
            type="url"
            required
            maxLength={1024}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="form-control"
            placeholder={t('quarantineUrlPlaceholder')}
          />
        </div>

        <div className="col-md-5">
          <label
            className="form-label small fw-bold text-secondary"
            htmlFor={`${fieldId}-title`}
          >
            {t('quarantineTitleLabel')}
          </label>
          <input
            id={`${fieldId}-title`}
            type="text"
            required
            minLength={3}
            maxLength={320}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="form-control"
            placeholder={t('quarantineTitlePlaceholder')}
          />
        </div>

        <div className="col-md-4 col-6">
          <label
            className="form-label small fw-bold text-secondary"
            htmlFor={`${fieldId}-current-price`}
          >
            {t('quarantineCurrentPriceLabel')}
          </label>
          <input
            id={`${fieldId}-current-price`}
            type="number"
            required
            min={50000}
            inputMode="numeric"
            value={currentPrice}
            onChange={(e) => setCurrentPrice(e.target.value)}
            className="form-control"
          />
        </div>

        <div className="col-md-4 col-6">
          <label
            className="form-label small fw-bold text-secondary"
            htmlFor={`${fieldId}-original-price`}
          >
            {t('quarantineOriginalPriceLabel')}
          </label>
          <input
            id={`${fieldId}-original-price`}
            type="number"
            min={1000}
            inputMode="numeric"
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            className="form-control"
            placeholder={t('quarantineOptionalPlaceholder')}
          />
        </div>

        <div className="col-md-4">
          <label
            className="form-label small fw-bold text-secondary"
            htmlFor={`${fieldId}-sku`}
          >
            {t('quarantineSkuLabel')}
          </label>
          <input
            id={`${fieldId}-sku`}
            type="text"
            maxLength={160}
            value={skuText}
            onChange={(e) => setSkuText(e.target.value)}
            className="form-control"
            placeholder={t('quarantineSkuPlaceholder')}
          />
        </div>

        <div className="col-12">
          <div className="form-check bg-light rounded-3 border p-3 ps-5">
            <input
              id="community-quarantine-consent"
              type="checkbox"
              required
              checked={consentGranted}
              onChange={(e) => setConsentGranted(e.target.checked)}
              className="form-check-input"
            />
            <label
              htmlFor="community-quarantine-consent"
              className="form-check-label small text-secondary"
            >
              <strong>{t('quarantineConsentStrong')}</strong>{' '}
              {t('quarantineConsentText')}
            </label>
          </div>
        </div>

        <div className="d-flex align-items-center justify-content-between col-12 flex-wrap gap-3">
          <div className="small text-muted d-flex align-items-center gap-1">
            <BsShieldCheck className="text-success fs-5" />
            <span>{t('quarantineAccessoryNote')}</span>
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-danger rounded-pill fw-semibold d-inline-flex align-items-center gap-2 px-4 py-2"
          >
            <BsSendFill />
            {isSubmitting
              ? t('quarantineSubmittingBtn')
              : t('quarantineSubmitBtn')}
          </button>
        </div>
      </form>

      <div role="status" aria-live="polite">
        {result && (
          <div
            className={`alert rounded-4 mt-4 mb-0 border ${
              result.accepted
                ? 'alert-success border-success'
                : 'alert-warning border-warning'
            }`}
          >
            <div className="d-flex align-items-start gap-2">
              {result.accepted ? (
                <BsCheckCircleFill className="text-success fs-4 mt-1 flex-shrink-0" />
              ) : (
                <BsExclamationTriangleFill className="text-warning fs-4 mt-1 flex-shrink-0" />
              )}
              <div>
                <div className="fw-bold mb-1">
                  {result.accepted
                    ? t('quarantineAcceptedTitle')
                    : t('quarantineRejectedTitle')}
                </div>
                <div className="small mb-1">
                  {t(`quarantineOutcome.${result.outcome}`)}
                </div>
                {result.jobId && (
                  <div className="small text-muted">
                    {t('quarantineJobRef', { id: result.jobId })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
