import React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BsGraphUpArrow, BsPatchCheckFill } from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import CompareQuickToggle from '@/components/compare/CompareQuickToggle';
import RadarBadge from '@/components/radar/RadarBadge';
import type { RadarSignal } from '@/lib/deal-radar';
import { contentLang } from '@/lib/content-lang';
import { MAX_VALID_VND_PRICE } from '@/lib/rate-domain';

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

export function sanitizeProductCardPriceVnd(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || num > MAX_VALID_VND_PRICE) {
    return 0;
  }
  return Math.round(num);
}

export function formatProductCardVnd(value: unknown): string {
  return `${sanitizeProductCardPriceVnd(value).toLocaleString('vi-VN')} ₫`;
}

export function sanitizeProductCardScore(
  value: unknown,
  maxScore: number
): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.min(maxScore, num);
}

const PRODUCT_CARD_CONTROL_CHARS_RE = /\p{Cc}+/gu;

export function sanitizeProductCardSlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(PRODUCT_CARD_CONTROL_CHARS_RE, '').trim().slice(0, 256);
}

export function sanitizeProductCardCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(10_000_000, Math.round(num));
}

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
  const locale = useLocale();
  const safeMinPrice = sanitizeProductCardPriceVnd(minPrice);
  const safeMaxPrice = sanitizeProductCardPriceVnd(maxPrice);
  const hasRange = safeMinPrice > 0 && safeMaxPrice > safeMinPrice;
  const safeUserScore = sanitizeProductCardScore(userScore, 5);
  const safeExpertScore = sanitizeProductCardScore(expertScore, 10);
  const safeReviewCount = sanitizeProductCardCount(reviewCount);
  const safeMerchantCount = sanitizeProductCardCount(merchantCount);
  const safeSlug = sanitizeProductCardSlug(slug);
  const meta = [brand, ...(Array.isArray(tags) ? tags : [])].filter(Boolean);

  return (
    <article className="rate-card rate-product-card h-100">
      <div className="rate-product-card-media">
        <Link
          href={href}
          className="rate-product-card-media-link"
          tabIndex={-1}
          aria-hidden="true"
        >
          {thumbnail ? (
            <img src={thumbnail} alt="" loading="lazy" />
          ) : (
            <span className="rate-product-card-noimage">{t('noImage')}</span>
          )}
        </Link>
        <div className="rate-product-card-actions">
          <CompareQuickToggle
            compact
            item={{
              slug: safeSlug,
              name,
              brand,
              thumbnail,
              min_price: safeMinPrice,
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
                role="img"
                aria-label={t('verified')}
              />
            )}
          </Link>
        </h3>

        <div className="rate-product-card-scores">
          {safeUserScore != null ? (
            <>
              <span className="rate-score-badge-user">
                ★ {safeUserScore.toFixed(1)}
              </span>
              <span className="rate-product-card-muted">
                {t('reviewCount', { count: safeReviewCount })}
              </span>
            </>
          ) : (
            <span className="rate-product-card-muted">{t('noReviews')}</span>
          )}
          {safeExpertScore != null && (
            <span className="rate-score-badge-expert">
              {t('expertScore', { score: safeExpertScore.toFixed(1) })}
            </span>
          )}
        </div>

        <RadarBadge signal={radarSignal} className="rate-product-card-radar" />

        {Array.isArray(specs) && specs.length > 0 && (
          <ul className="rate-product-card-specs">
            {specs.slice(0, 3).map((spec) => (
              <li
                key={spec.key}
                title={spec.label}
                lang={contentLang(spec.label, locale)}
              >
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
                {formatProductCardVnd(safeMinPrice)}
              </div>
            </div>
            <div className="rate-product-card-price-aside">
              {hasRange && (
                <div>
                  {t('priceUpTo', {
                    price: formatProductCardVnd(safeMaxPrice),
                  })}
                </div>
              )}
              <div>{t('sources', { count: safeMerchantCount })}</div>
            </div>
          </div>

          <div className="rate-product-card-cta">
            <Link href={href} className="btn btn-primary fw-semibold">
              {t('viewDetails')}
            </Link>
            <Link
              href={`/inspect?q=${encodeURIComponent(safeSlug)}`}
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
