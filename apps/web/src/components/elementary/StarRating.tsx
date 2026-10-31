import { useLocale, useTranslations } from 'next-intl';
import { BsStarFill } from 'react-icons/bs';
import {
  displayRating,
  formatRatingCount,
  formatRatingValue,
  ratingFillPercent,
  ratingTone,
} from '@/lib/rating-display';

export interface StarRatingProps {
  /** A 0-5 rating; 0, null or anything not finite shows the empty state. */
  readonly value: number | null | undefined;
  /** Review count, shown in parentheses. Omitted when null or undefined. */
  readonly count?: number | null;
  /** Decimals of the printed value: 1, or 2 where close scores are ranked. */
  readonly digits?: 1 | 2;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Short text when there is no rating; "Chưa có đánh giá" by default. */
  readonly emptyLabel?: string;
  /** Tooltip that keeps the longer meaning (how the score is computed). */
  readonly title?: string;
  readonly className?: string;
  readonly testId?: string;
}

const STARS = [0, 1, 2, 3, 4];

/**
 * The one way a rating is shown (DOS/Rate#1528): five stars filled to the
 * value, the value at one decimal and the count in parentheses, e.g.
 * `★★★★½ 4.6 (11.204)`. The stars are green from 4.0, orange from 3.0 and
 * red below (`ratingTone`). Screen readers get one label, "4.6 trên 5 sao,
 * 11.204 đánh giá".
 */
export default function StarRating({
  value,
  count,
  digits = 1,
  size = 'md',
  emptyLabel,
  title,
  className,
  testId,
}: StarRatingProps) {
  const t = useTranslations('starRating');
  const locale = useLocale();
  const rating = displayRating(value);
  const classes = ['rate-stars', `rate-stars-${size}`, className]
    .filter(Boolean)
    .join(' ');

  if (rating == null) {
    return (
      <span
        className={`${classes} is-empty`}
        title={title}
        data-testid={testId}
      >
        {emptyLabel ?? t('empty')}
        {title && <span className="visually-hidden">. {title}</span>}
      </span>
    );
  }

  const valueText = formatRatingValue(rating, locale, digits);
  const hasCount = typeof count === 'number' && Number.isFinite(count);
  const countText = hasCount ? formatRatingCount(count, locale) : '';
  const label = hasCount
    ? t('ariaWithCount', { value: valueText, count, countText })
    : t('aria', { value: valueText });

  const stars = (
    <span
      className={`${classes} is-${ratingTone(rating, digits)}`}
      role="img"
      aria-label={label}
      title={title}
      data-testid={testId}
      data-rating={valueText}
    >
      <span className="rate-stars-icons" aria-hidden="true">
        <span className="rate-stars-track">
          {STARS.map((i) => (
            <BsStarFill key={i} />
          ))}
        </span>
        <span
          className="rate-stars-fill"
          style={{ width: `${ratingFillPercent(rating, digits)}%` }}
        >
          {STARS.map((i) => (
            <BsStarFill key={i} />
          ))}
        </span>
      </span>
      <span className="rate-stars-value" aria-hidden="true">
        {valueText}
      </span>
      {hasCount && (
        <span className="rate-stars-count" aria-hidden="true">
          ({countText})
        </span>
      )}
    </span>
  );
  if (!title) return stars;
  // aria-label wins over title on role="img", so screen readers get the
  // tooltip's meaning from a hidden sibling.
  return (
    <>
      {stars}
      <span className="visually-hidden">{title}</span>
    </>
  );
}
