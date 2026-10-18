import React from 'react';
import { useTranslations } from 'next-intl';
import { BsGraphUpArrow, BsPatchCheckFill } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import RadarBadge from '@/components/radar/RadarBadge';
import type { RadarSignal } from '@/lib/deal-radar';

export interface ProductCardSpec {
  readonly key: string;
  readonly icon: React.ReactNode;
  readonly label: string;
}

export interface ProductCardProps {
  readonly slug: string;
  readonly href: string;
  /** Category listing path, used by the watchlist and compare tray. */
  readonly categoryPath: string;
  readonly name: string;
  readonly brand: string;
  readonly thumbnail: string | null;
  /** Short facts shown after the brand, e.g. "8GB RAM", "120Hz". */
  readonly tags?: readonly string[];
  /** Up to three key specs, one per line. */
  readonly specs?: readonly ProductCardSpec[];
  readonly userScore: number | null;
  readonly reviewCount: number;
  readonly expertScore: number | null;
  readonly radarSignal: RadarSignal;
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly merchantCount: number;
  readonly verified?: boolean;
}

const formatVnd = (value: number) =>
  `${Number(value).toLocaleString('vi-VN')} ₫`;

/**
 * Product tile for the home grid and the category catalogs. Fixed regions
 * (media, meta, two-line title, scores, specs, price, actions) keep every
 * card in a row aligned whatever data a product has.
 */
export default function ProductCard({
  slug,
  href,
  categoryPath,
  name,
  brand,
  thumbnail,
  tags = [],
  specs = [],
  userScore,
  reviewCount,
  expertScore,
  radarSignal,
  minPrice,
  maxPrice,
  merchantCount,
  verified = false,
}: ProductCardProps) {
  const t = useTranslations('productCard');
  const hasRange = maxPrice > minPrice;
  const meta = [brand, ...tags].filter(Boolean);

  return (
    <article className="rate-card rate-product-card h-100">
      <div className="rate-product-card-media">
        <Link
          href={href}
          className="rate-product-card-media-link"
          tabIndex={-1}
        >
          {thumbnail ? (
            <img src={thumbnail} alt={name} loading="lazy" />
          ) : (
            <span className="rate-product-card-noimage">{t('noImage')}</span>
          )}
        </Link>
        <div className="rate-product-card-actions">
          <CompareQuickToggle
            compact
            item={{
              slug,
              name,
              brand,
              thumbnail,
              min_price: minPrice,
              categoryPath,
            }}
          />
        </div>
      </div>

      <div className="rate-product-card-body">
        <p className="rate-product-card-meta">{meta.join(' · ')}</p>

        <h3 className="rate-product-card-title">
          <Link href={href}>
            {name}
            {verified && (
              <BsPatchCheckFill
                className="rate-product-card-verified"
                aria-label={t('verified')}
              />
            )}
          </Link>
        </h3>

        <div className="rate-product-card-scores">
          {userScore != null ? (
            <>
              <span className="rate-score-badge-user">
                ★ {userScore.toFixed(1)}
              </span>
              <span className="rate-product-card-muted">
                {t('reviewCount', { count: reviewCount })}
              </span>
            </>
          ) : (
            <span className="rate-product-card-muted">{t('noReviews')}</span>
          )}
          {expertScore != null && (
            <span className="rate-score-badge-expert">
              {t('expertScore', { score: expertScore.toFixed(1) })}
            </span>
          )}
        </div>

        <RadarBadge signal={radarSignal} className="rate-product-card-radar" />

        {specs.length > 0 && (
          <ul className="rate-product-card-specs">
            {specs.slice(0, 3).map((spec) => (
              <li key={spec.key} title={spec.label}>
                <span
                  className="rate-product-card-spec-icon"
                  aria-hidden="true"
                >
                  {spec.icon}
                </span>
                <span className="text-truncate">{spec.label}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="rate-product-card-footer">
          <div className="rate-product-card-price-row">
            <div>
              <div className="rate-product-card-muted">{t('refPrice')}</div>
              <div className="rate-product-card-price">
                {formatVnd(minPrice)}
              </div>
            </div>
            <div className="rate-product-card-price-aside">
              {hasRange && (
                <div>{t('priceUpTo', { price: formatVnd(maxPrice) })}</div>
              )}
              <div>{t('sources', { count: merchantCount })}</div>
            </div>
          </div>

          <div className="rate-product-card-cta">
            <Link href={href} className="btn btn-primary fw-semibold">
              {t('viewDetails')}
            </Link>
            <Link
              href={`/inspect?q=${encodeURIComponent(slug)}`}
              className="btn btn-outline-secondary fw-medium"
              title={t('priceHistoryTitle')}
            >
              <BsGraphUpArrow aria-hidden="true" />
              <span>{t('priceHistory')}</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
