'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsExclamationTriangle, BsStarFill, BsX } from 'react-icons/bs';
import {
  REVIEW_CRITERION_POINTS_MAX,
  REVIEW_POINTS_MAX,
  REVIEW_VERDICT_MAX,
  getRatingCriteria,
  type RatingCriterion,
} from '@repo/shared-data/rules';
import type { ReviewItem } from '@/lib/rate-domain';
import { jsonWriteHeaders } from '@/lib/auth/access-token';
import { submitErrorKey } from '@/lib/review-display';
import { formatDecimal } from '@/lib/locale-format';
import {
  REVIEW_FORM_VERSION,
  REVIEW_V2_DRAFT_PREFIX,
  emptyReviewV2Draft,
  parseReviewV2Draft,
  reviewV2Errors,
  reviewV2InputFromDraft,
  reviewV2Star,
  type ReviewV2Draft,
  type ReviewV2Error,
  type ReviewV2MessageKey,
} from '@/lib/review-form-v2';

export interface ReviewFormV2Props {
  masterProductId?: string;
  productName: string;
  /** The category row the v2 RPC rates against (never guessed). */
  categorySlug?: string;
  defaultAuthorName: string;
  onStored: (review: ReviewItem) => void;
}

const MESSAGE_KEYS = new Set<ReviewV2MessageKey>([
  'v2ErrCriterion',
  'v2ErrRequired',
  'v2ErrSkipped',
  'v2ErrVerdict',
  'v2ErrCount',
  'v2ErrLength',
  'v2ErrNoContent',
  'v2ErrEvasive',
  'v2ErrDuplicate',
  'v2ErrBoth',
  'v2ErrRejected',
]);

/** Field errors from the API, kept only when they have the known shape. */
function apiFieldErrors(value: unknown): ReviewV2Error[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (e): e is ReviewV2Error =>
        Boolean(e) &&
        typeof e.field === 'string' &&
        e.field.length <= 80 &&
        MESSAGE_KEYS.has(e.key)
    )
    .slice(0, 40)
    .map((e) => ({
      field: e.field,
      key: e.key,
      values:
        e.values && typeof e.values === 'object'
          ? Object.fromEntries(
              Object.entries(e.values).filter(
                ([, v]) => typeof v === 'number' && Number.isFinite(v)
              )
            )
          : undefined,
    }));
}

/**
 * Stars from 1 to 5 in half steps, as a radio group: one tab stop, arrows
 * move by half a star (design 4.1, no default value).
 */
function HalfStarPicker({
  value,
  label,
  invalid,
  required,
  describedBy,
  onChange,
}: {
  value: number | null;
  label: string;
  invalid: boolean;
  required: boolean;
  describedBy?: string;
  onChange: (star: number) => void;
}) {
  const t = useTranslations('reviews');
  const locale = useLocale();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusable = value ?? 1;

  function move(next: number) {
    const star = Math.max(1, Math.min(5, next));
    onChange(star);
    refs.current[String(star)]?.focus();
  }

  function handleKey(e: React.KeyboardEvent) {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? 0.5
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -0.5
          : 0;
    if (step) {
      e.preventDefault();
      move((value ?? (step > 0 ? 0.5 : 1.5)) + step);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      move(e.key === 'Home' ? 1 : 5);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
      aria-describedby={describedBy}
      className="d-inline-flex align-items-center"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill =
          value != null && value >= n
            ? 100
            : value != null && value >= n - 0.5
              ? 50
              : 0;
        return (
          <span
            key={n}
            className="position-relative d-inline-block"
            style={{ width: '1.6rem', height: '1.6rem' }}
          >
            <BsStarFill
              aria-hidden="true"
              className="position-absolute top-50 start-50 translate-middle text-secondary opacity-25"
              size={20}
            />
            {fill > 0 && (
              <span
                aria-hidden="true"
                className="position-absolute top-0 start-0 h-100 overflow-hidden"
                style={{ width: `${fill}%` }}
              >
                <BsStarFill
                  className="position-absolute text-warning top-50 translate-middle"
                  style={{ left: `${(100 * 50) / fill}%` }}
                  size={20}
                />
              </span>
            )}
            {[n - 0.5, n].map((star) =>
              star < 1 ? null : (
                <button
                  key={star}
                  ref={(el) => {
                    refs.current[String(star)] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={value === star}
                  aria-label={t('v2StarAria', {
                    criterion: label,
                    star: formatDecimal(star, locale, star % 1 ? 1 : 0),
                  })}
                  tabIndex={star === focusable ? 0 : -1}
                  onClick={() => onChange(star)}
                  onKeyDown={handleKey}
                  className="position-absolute top-0 h-100 border-0 bg-transparent p-0"
                  // The first star has no half below 1: it takes the whole star.
                  style={{
                    left: star === 1 || star % 1 ? 0 : '50%',
                    width: star === 1 ? '100%' : '50%',
                  }}
                />
              )
            )}
          </span>
        );
      })}
    </div>
  );
}

function LineList({
  label,
  hint,
  field,
  lines,
  max,
  errorFor,
  onChange,
}: {
  label: string;
  hint?: string;
  field: string;
  lines: string[];
  max: number;
  errorFor: (field: string) => string | null;
  onChange: (lines: string[]) => void;
}) {
  const t = useTranslations('reviews');
  const baseId = useId();
  const listError = errorFor(field);
  const listErrorId = `${baseId}-err`;
  const rows = lines.length > 0 ? lines : [''];
  // Blank lines are dropped before the check, so error N is the Nth line
  // with text in it, not the Nth row.
  let checked = -1;
  const checkedIndex = rows.map((line) =>
    line.trim() ? (checked += 1) : null
  );
  return (
    <fieldset
      className="mb-2"
      aria-describedby={listError ? listErrorId : undefined}
    >
      <legend className="small fw-semibold mb-1">{label}</legend>
      {rows.map((line, index) => {
        const at = checkedIndex[index];
        const error = at == null ? null : errorFor(`${field}.${at}`);
        const errorId = `${baseId}-${index}-err`;
        return (
          <div key={index} className="mb-1">
            <div className="d-flex gap-1">
              <input
                type="text"
                value={line}
                maxLength={200}
                placeholder={index === 0 ? hint : undefined}
                aria-label={`${label} ${index + 1}`}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) =>
                  onChange(
                    rows.map((l, i) => (i === index ? e.target.value : l))
                  )
                }
                className={`form-control form-control-sm rounded-3 ${error ? 'is-invalid' : ''}`}
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={t('v2RemoveLine')}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="btn btn-sm btn-outline-secondary rounded-3"
                >
                  <BsX aria-hidden="true" />
                </button>
              )}
            </div>
            {error && (
              <div id={errorId} className="text-danger small">
                {error}
              </div>
            )}
          </div>
        );
      })}
      {listError && (
        <div id={listErrorId} className="text-danger small">
          {listError}
        </div>
      )}
      {rows.length < max && (
        <button
          type="button"
          onClick={() => onChange([...rows, ''])}
          className="btn btn-link btn-sm p-0"
        >
          + {t('v2AddLine')}
        </button>
      )}
    </fieldset>
  );
}

/**
 * The v2 review form (DOS/Rate#1544, design #1531 section 4.1): per-category
 * criteria in half stars with the weighted star beside them, a verdict, 1-5
 * pros and cons, and optional pros and cons per rated criterion. Errors show
 * on the field they belong to, and the draft stays in the browser until the
 * review is stored.
 */
export default function ReviewFormV2({
  masterProductId,
  productName,
  categorySlug,
  defaultAuthorName,
  onStored,
}: ReviewFormV2Props) {
  const t = useTranslations('reviews');
  const locale = useLocale();
  const fieldId = useId();
  const criteria: readonly RatingCriterion[] = useMemo(
    () => getRatingCriteria(categorySlug ?? null),
    [categorySlug]
  );
  const labelOf = (c: RatingCriterion) =>
    locale === 'vi' ? c.label.vi : c.label.en;
  const draftKey = masterProductId
    ? `${REVIEW_V2_DRAFT_PREFIX}${masterProductId}`
    : null;

  const [draft, setDraft] = useState<ReviewV2Draft>(emptyReviewV2Draft);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [variation, setVariation] = useState('');
  const [openPoints, setOpenPoints] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ReviewV2Error[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = parseReviewV2Draft(window.localStorage.getItem(draftKey));
      if (saved) setDraft(saved);
    } catch {
      // Storage blocked: the form starts empty.
    }
    setDraftLoaded(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded || !draftKey) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Storage full or blocked: the draft lives only in the page.
    }
  }, [draft, draftKey, draftLoaded]);

  const input = useMemo(() => reviewV2InputFromDraft(draft), [draft]);
  const overall = reviewV2Star(categorySlug ?? null, input.criteriaRatings);
  const liveErrors = useMemo(
    () => (attempted ? reviewV2Errors(categorySlug ?? null, input) : []),
    [attempted, categorySlug, input]
  );
  const errors = liveErrors.length > 0 ? liveErrors : serverErrors;
  const errorFor = (field: string): string | null => {
    const error = errors.find((e) => e.field === field);
    return error ? t(error.key, error.values) : null;
  };

  function update(next: (prev: ReviewV2Draft) => ReviewV2Draft) {
    setServerErrors([]);
    setDraft(next);
  }

  function setRating(key: string, star: number | null) {
    update((prev) => ({ ...prev, ratings: { ...prev.ratings, [key]: star } }));
    if (star == null && openPoints === key) setOpenPoints(null);
  }

  function setPoints(key: string, list: 'pros' | 'cons', lines: string[]) {
    update((prev) => {
      const entry = prev.points[key] ?? { pros: [], cons: [] };
      return {
        ...prev,
        points: { ...prev.points, [key]: { ...entry, [list]: lines } },
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setAttempted(true);
    if (!masterProductId) {
      setSubmitError(t('errMissingMasterId'));
      return;
    }
    if (reviewV2Errors(categorySlug ?? null, input).length > 0) {
      setSubmitError(t('v2ErrInvalid'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/rate/reviews', {
        method: 'POST',
        headers: await jsonWriteHeaders(),
        body: JSON.stringify({
          masterProductId,
          formVersion: REVIEW_FORM_VERSION,
          authorName: authorName.trim() || defaultAuthorName,
          variation: variation.trim() || undefined,
          comment: draft.comment.trim() || undefined,
          ...input,
        }),
      });
      if (res.status === 401) {
        setSubmitError(t('errLoginRequired'));
        return;
      }
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok || !payload?.review) {
        setServerErrors(apiFieldErrors(payload?.fieldErrors));
        setSubmitError(t(submitErrorKey(payload?.code)));
        return;
      }
      try {
        if (draftKey) window.localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clear when storage is blocked.
      }
      setDraft(emptyReviewV2Draft());
      setAttempted(false);
      onStored(payload.review as ReviewItem);
    } catch {
      setSubmitError(t('errNetworkFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const skippedError = errorFor('criteria');
  const verdictError = errorFor('verdict');
  const commentError = errorFor('comment');
  const verdictLength = [...draft.verdict.trim()].length;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="review-form-v2"
      className="border-primary border-opacity-25 rounded-4 bg-light mb-4 border p-4"
    >
      <h3 className="h6 fw-bold text-dark mb-3">
        {t('v2FormHeading', { productName })}
      </h3>

      {submitError && (
        <div
          role="alert"
          className="alert alert-danger small rounded-3 mb-3 px-3 py-2"
        >
          <BsExclamationTriangle aria-hidden="true" className="me-1" />
          {submitError}
        </div>
      )}

      <div className="row g-3 mb-3">
        <div className="col-md-6 col-12">
          <label
            className="form-label small fw-semibold mb-1"
            htmlFor={`${fieldId}-author`}
          >
            {t('authorNameLabel')}
          </label>
          <input
            id={`${fieldId}-author`}
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder={t('authorNamePlaceholder')}
            className="form-control form-control-sm rounded-3"
            maxLength={80}
          />
        </div>
        <div className="col-md-6 col-12">
          <label
            className="form-label small fw-semibold mb-1"
            htmlFor={`${fieldId}-variation`}
          >
            {t('variationLabel')}
          </label>
          <input
            id={`${fieldId}-variation`}
            type="text"
            value={variation}
            onChange={(e) => setVariation(e.target.value)}
            placeholder={t('variationPlaceholder')}
            className="form-control form-control-sm rounded-3"
            maxLength={100}
          />
        </div>
      </div>

      <div className="rounded-3 mb-3 border bg-white p-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="small fw-semibold">{t('v2CriteriaLabel')}</span>
          <span className="small" data-testid="review-v2-overall">
            {t('v2Overall')}{' '}
            <strong>
              {overall == null ? '-' : formatDecimal(overall, locale, 1)} ★
            </strong>
          </span>
        </div>
        {criteria.map((c) => {
          const value = draft.ratings[c.key] ?? null;
          // Skipped on purpose: null; not rated yet: no key at all.
          const skipped =
            Object.prototype.hasOwnProperty.call(draft.ratings, c.key) &&
            value == null;
          const label = labelOf(c);
          const error = errorFor(`criterion.${c.key}`);
          const errorId = `${fieldId}-${c.key}-err`;
          const pointsOpen = openPoints === c.key && value != null;
          const points = draft.points[c.key] ?? { pros: [], cons: [] };
          return (
            <div key={c.key} className="border-bottom py-2">
              <div className="d-flex align-items-center flex-wrap gap-2">
                <span className="small" style={{ minWidth: '9rem' }}>
                  {label}
                  {c.required && (
                    <span className="text-danger" aria-hidden="true">
                      {' '}
                      *
                    </span>
                  )}
                </span>
                <HalfStarPicker
                  value={value}
                  label={label}
                  invalid={Boolean(error)}
                  required={c.required}
                  describedBy={error ? errorId : undefined}
                  onChange={(star) => setRating(c.key, star)}
                />
                <span className="small fw-bold" style={{ minWidth: '2rem' }}>
                  {value == null ? '' : formatDecimal(value, locale, 1)}
                </span>
                {!c.required && (
                  <button
                    type="button"
                    aria-pressed={skipped}
                    onClick={() => setRating(c.key, null)}
                    className={`btn btn-sm rounded-pill py-0 ${skipped ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  >
                    {t('v2Skip')}
                  </button>
                )}
                {value != null && (
                  <button
                    type="button"
                    aria-expanded={pointsOpen}
                    onClick={() => setOpenPoints(pointsOpen ? null : c.key)}
                    className="btn btn-link btn-sm py-0"
                  >
                    {t('v2CriterionPoints')}
                  </button>
                )}
              </div>
              {error && (
                <div id={errorId} className="text-danger small">
                  {error}
                </div>
              )}
              {pointsOpen && (
                <div className="row g-2 mt-1">
                  <div className="col-md-6 col-12">
                    <LineList
                      label={`${t('v2Pros')}: ${label}`}
                      field={`points.${c.key}.pros`}
                      lines={points.pros}
                      max={REVIEW_CRITERION_POINTS_MAX}
                      errorFor={errorFor}
                      onChange={(lines) => setPoints(c.key, 'pros', lines)}
                    />
                  </div>
                  <div className="col-md-6 col-12">
                    <LineList
                      label={`${t('v2Cons')}: ${label}`}
                      field={`points.${c.key}.cons`}
                      lines={points.cons}
                      max={REVIEW_CRITERION_POINTS_MAX}
                      errorFor={errorFor}
                      onChange={(lines) => setPoints(c.key, 'cons', lines)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {skippedError && (
          <div id={`${fieldId}-skipped-err`} className="text-danger small mt-1">
            {skippedError}
          </div>
        )}
      </div>

      <div className="mb-3">
        <label
          className="form-label small fw-semibold mb-1"
          htmlFor={`${fieldId}-verdict`}
        >
          {t('v2Verdict')}
        </label>
        <textarea
          id={`${fieldId}-verdict`}
          rows={2}
          value={draft.verdict}
          maxLength={REVIEW_VERDICT_MAX + 50}
          placeholder={t('v2VerdictHint')}
          aria-invalid={verdictError ? true : undefined}
          aria-describedby={verdictError ? `${fieldId}-verdict-err` : undefined}
          onChange={(e) =>
            update((prev) => ({ ...prev, verdict: e.target.value }))
          }
          className={`form-control form-control-sm rounded-3 ${verdictError ? 'is-invalid' : ''}`}
        />
        <div className="d-flex justify-content-between small">
          <span id={`${fieldId}-verdict-err`} className="text-danger">
            {verdictError}
          </span>
          <span className="text-muted">
            {verdictLength}/{REVIEW_VERDICT_MAX}
          </span>
        </div>
      </div>

      <div className="row g-3 mb-2">
        <div className="col-md-6 col-12">
          <LineList
            label={t('v2Pros')}
            field="pros"
            lines={draft.pros}
            max={REVIEW_POINTS_MAX}
            errorFor={errorFor}
            onChange={(lines) => update((prev) => ({ ...prev, pros: lines }))}
          />
        </div>
        <div className="col-md-6 col-12">
          <LineList
            label={t('v2Cons')}
            hint={t('v2ConsHint')}
            field="cons"
            lines={draft.cons}
            max={REVIEW_POINTS_MAX}
            errorFor={errorFor}
            onChange={(lines) => update((prev) => ({ ...prev, cons: lines }))}
          />
        </div>
      </div>

      <div className="mb-3">
        <label
          className="form-label small fw-semibold mb-1"
          htmlFor={`${fieldId}-comment`}
        >
          {t('v2Comment')}
        </label>
        <textarea
          id={`${fieldId}-comment`}
          rows={3}
          value={draft.comment}
          maxLength={3000}
          aria-invalid={commentError ? true : undefined}
          aria-describedby={commentError ? `${fieldId}-comment-err` : undefined}
          onChange={(e) =>
            update((prev) => ({ ...prev, comment: e.target.value }))
          }
          className={`form-control form-control-sm rounded-3 ${commentError ? 'is-invalid' : ''}`}
        />
        {commentError && (
          <div id={`${fieldId}-comment-err`} className="text-danger small">
            {commentError}
          </div>
        )}
      </div>

      <div className="d-flex justify-content-end">
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary btn-sm rounded-pill fw-medium px-4 py-2"
        >
          {submitting ? t('v2Submitting') : t('v2Submit')}
        </button>
      </div>
    </form>
  );
}
