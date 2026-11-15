'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ContentText from '@/components/elementary/ContentText';
import { formatDate } from '@/lib/locale-format';
import {
  pointCriterionMessageKey,
  selectProductPoints,
  type StoredProductPointRow,
} from '@/lib/product-points-display';

export interface ProductPointsBlockProps {
  points?: readonly StoredProductPointRow[] | null;
  categorySlug?: string | null;
  /** Distinct eligible reviews in `rate.review_points` counted for this master. */
  pointsReviewCount?: number | null;
  /** Optional controlled criterion key from parent (`JReviewsSection`). */
  selectedCriterion?: string | null;
  onSelectCriterion?: (criterionKey: string | null) => void;
}

const MINUS_SIGN = '\u2212';

export default function ProductPointsBlock({
  points,
  categorySlug,
  pointsReviewCount,
  selectedCriterion,
  onSelectCriterion,
}: ProductPointsBlockProps) {
  const t = useTranslations('reviews');
  const locale = useLocale();
  const [internalCriterion, setInternalCriterion] = useState<string | null>(
    null
  );

  const rawActiveCriterion =
    selectedCriterion !== undefined ? selectedCriterion : internalCriterion;

  const selection = useMemo(() => {
    const base = selectProductPoints(points, {
      categorySlug,
      criterionKey: null,
      pointsReviewCount,
    });
    if (!base) return null;
    if (
      rawActiveCriterion &&
      base.availableCriteria.includes(rawActiveCriterion)
    ) {
      return (
        selectProductPoints(points, {
          categorySlug,
          criterionKey: rawActiveCriterion,
          pointsReviewCount,
        }) ?? base
      );
    }
    return base;
  }, [points, categorySlug, pointsReviewCount, rawActiveCriterion]);

  if (
    !selection ||
    (selection.pros.length === 0 && selection.cons.length === 0)
  ) {
    return null;
  }

  const handleSelect = (next: string | null) => {
    if (selectedCriterion === undefined) {
      setInternalCriterion(next);
    }
    onSelectCriterion?.(next);
  };

  const labelForCriterion = (key: string): string => {
    const msgKey = pointCriterionMessageKey(key);
    return msgKey ? t(msgKey) : key;
  };

  const formattedUpdatedDate = selection.updatedAt
    ? formatDate(selection.updatedAt, locale, {
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    : null;

  const hasBothSides = selection.pros.length > 0 && selection.cons.length > 0;

  return (
    <div
      className="rate-points-block"
      data-testid="product-points-block"
      data-points-method={selection.method}
    >
      <div className="rate-points-head">
        <p
          className="rate-points-meta rate-tabular"
          data-testid="product-points-updated"
        >
          {formattedUpdatedDate
            ? t('pointsUpdatedWithReviews', {
                date: formattedUpdatedDate,
                count: selection.reviewCount,
              })
            : t('pointsFromReviewsOnly', {
                count: selection.reviewCount,
              })}
        </p>
      </div>

      {selection.availableCriteria.length > 0 && (
        <div
          className="rate-points-criteria"
          role="group"
          aria-label={t('pointsFilterGroupAria')}
          data-testid="product-points-criteria"
        >
          <button
            type="button"
            aria-pressed={selection.activeCriterion === null}
            onClick={() => handleSelect(null)}
            className="rate-points-pill"
          >
            {t('pointsFilterAll')}
          </button>
          {selection.availableCriteria.map((key) => {
            const isActive = selection.activeCriterion === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={isActive}
                data-criterion={key}
                onClick={() => handleSelect(isActive ? null : key)}
                className="rate-points-pill"
              >
                {labelForCriterion(key)}
              </button>
            );
          })}
        </div>
      )}

      <div className={`rate-points-grid${hasBothSides ? ' is-dual' : ''}`}>
        {selection.pros.length > 0 && (
          <div className="rate-points-col" data-testid="product-points-pros">
            <h3 className="rate-points-title is-pro">
              {t('pointsProsHeading')}
            </h3>
            <ul className="rate-points-list is-pro">
              {selection.pros.map((point) => (
                <li
                  key={point.id}
                  className="rate-points-item"
                  data-testid="product-point-pro"
                >
                  <span className="rate-points-sign is-pro" aria-hidden="true">
                    +
                  </span>
                  <span className="rate-points-body">
                    <ContentText text={point.label} locale={locale} />{' '}
                    <span className="rate-points-count rate-tabular">
                      {t('pointsMentionCount', { count: point.reviewerCount })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {selection.cons.length > 0 && (
          <div className="rate-points-col" data-testid="product-points-cons">
            <h3 className="rate-points-title is-con">
              {t('pointsConsHeading')}
            </h3>
            <ul className="rate-points-list is-con">
              {selection.cons.map((point) => (
                <li
                  key={point.id}
                  className="rate-points-item"
                  data-testid="product-point-con"
                >
                  <span className="rate-points-sign is-con" aria-hidden="true">
                    {MINUS_SIGN}
                  </span>
                  <span className="rate-points-body">
                    <ContentText text={point.label} locale={locale} />{' '}
                    <span className="rate-points-count rate-tabular">
                      {t('pointsMentionCount', { count: point.reviewerCount })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {selection.availableCriteria.length > 0 &&
        selection.activeCriterion === null && (
          <p className="rate-points-hint">{t('pointsCriterionHint')}</p>
        )}
    </div>
  );
}
