import { getTranslations } from 'next-intl/server';
import {
  BsBuilding,
  BsClock,
  BsGeoAlt,
  BsGlobe,
  BsMap,
  BsShopWindow,
  BsStarFill,
  BsTelephone,
} from 'react-icons/bs';
import { Link } from '@/lib/navigation';
import { formatDecimal } from '@/lib/locale-format';
import { formatScoreFixed } from '@/lib/rating-display';
import {
  extractPlaceDisplayFacts,
  formatPlaceLocationBadge,
  sanitizePlaceText,
  type PlaceBranchSibling,
  type PlaceDetail,
} from '@/lib/place-details';

export interface PlaceDetailsSectionProps {
  readonly locale: string;
  readonly categorySlug: string;
  readonly placeDetail: PlaceDetail | null;
  readonly branches: readonly PlaceBranchSibling[];
  readonly fallbackPriceMin?: number | null;
  readonly fallbackPriceMax?: number | null;
}

export default async function PlaceDetailsSection({
  locale,
  categorySlug,
  placeDetail,
  branches,
  fallbackPriceMin,
  fallbackPriceMax,
}: PlaceDetailsSectionProps) {
  const t = await getTranslations({ locale, namespace: 'placeDetail' });

  const {
    locationBadge,
    cleanAddress,
    cleanCuisine,
    cleanOpeningHours,
    safePhone,
    safeWebsite,
    coords,
    safeTier,
    safeStarRating,
    formattedPriceRange,
    safeWebsiteHost,
    hasPlaceFacts,
  } = extractPlaceDisplayFacts({
    placeDetail,
    branches,
    categorySlug,
    locale,
    fallbackPriceMin,
    fallbackPriceMax,
  });

  if (!hasPlaceFacts) {
    return null;
  }

  return (
    <section
      id="place-details-section"
      className="card border-0 shadow-sm mb-4"
      data-testid="place-details-section"
    >
      <div className="card-body p-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 className="h5 fw-bold mb-0 d-flex align-items-center gap-2">
            <BsShopWindow className="text-danger" aria-hidden="true" />
            <span>{t('heading')}</span>
          </h2>

          <div className="d-flex flex-wrap align-items-center gap-2">
            {locationBadge && (
              <span
                className="badge rounded-pill text-bg-light border text-dark fw-medium"
                data-testid="place-location-badge"
              >
                <BsGeoAlt className="me-1 text-danger" aria-hidden="true" />
                {locationBadge}
              </span>
            )}
            {cleanCuisine && (
              <span
                className="badge rounded-pill bg-secondary-subtle text-dark fw-medium"
                data-testid="place-cuisine-badge"
              >
                {cleanCuisine}
              </span>
            )}
            {safeStarRating !== null && (
              <span
                className="badge rounded-pill bg-warning-subtle text-dark fw-medium"
                data-testid="place-star-rating-badge"
              >
                <BsStarFill className="me-1 text-warning" aria-hidden="true" />
                {t('starRatingBadge', {
                  stars: formatDecimal(safeStarRating, locale, 1),
                })}
              </span>
            )}
            {safeTier && (
              <span
                className="badge rounded-pill bg-success-subtle text-success fw-semibold"
                data-testid="place-price-tier-badge"
              >
                {safeTier}
              </span>
            )}
          </div>
        </div>

        <div className="row g-3">
          {formattedPriceRange && (
            <div className="col-md-6">
              <div className="p-3 rounded-3 bg-light h-100">
                <div className="small text-secondary mb-1">
                  {t('referencePriceLabel')}
                </div>
                <div
                  className="fw-bold text-danger rate-tabular"
                  data-testid="place-price-range"
                >
                  {formattedPriceRange}
                </div>
              </div>
            </div>
          )}

          {cleanOpeningHours && (
            <div className="col-md-6">
              <div className="p-3 rounded-3 bg-light h-100">
                <div className="small text-secondary mb-1 d-flex align-items-center gap-1">
                  <BsClock aria-hidden="true" />
                  <span>{t('openingHoursLabel')}</span>
                </div>
                <div className="fw-medium text-dark" data-testid="place-hours">
                  {cleanOpeningHours}
                </div>
              </div>
            </div>
          )}

          {(cleanAddress || coords) && (
            <div className="col-12">
              <div className="p-3 rounded-3 bg-light">
                <div className="small text-secondary mb-1 d-flex align-items-center gap-1">
                  <BsGeoAlt aria-hidden="true" />
                  <span>{t('addressLabel')}</span>
                </div>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                  {cleanAddress ? (
                    <span
                      className="text-dark fw-medium"
                      data-testid="place-address"
                    >
                      {cleanAddress}
                    </span>
                  ) : (
                    <span className="text-secondary small">
                      {coords ? `${coords.latText}, ${coords.lngText}` : ''}
                    </span>
                  )}
                  {coords && (
                    <a
                      href={coords.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      className="btn btn-sm btn-outline-primary rounded-pill d-inline-flex align-items-center gap-1"
                      data-testid="place-map-link"
                    >
                      <BsMap aria-hidden="true" />
                      <span>{t('viewOnMap')}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {(safePhone || safeWebsite) && (
            <div className="col-12">
              <div className="d-flex flex-wrap align-items-center gap-3 pt-1">
                {safePhone && (
                  <a
                    href={safePhone.href}
                    className="btn btn-sm btn-outline-secondary rounded-pill d-inline-flex align-items-center gap-1"
                    data-testid="place-phone-link"
                  >
                    <BsTelephone aria-hidden="true" />
                    <span>{safePhone.display}</span>
                  </a>
                )}
                {safeWebsite && (
                  <a
                    href={safeWebsite}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="btn btn-sm btn-outline-secondary rounded-pill d-inline-flex align-items-center gap-1"
                    data-testid="place-website-link"
                  >
                    <BsGlobe aria-hidden="true" />
                    <span>{safeWebsiteHost ?? t('websiteLabel')}</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {branches.length > 0 && (
          <div
            className="mt-4 pt-3 border-top"
            data-testid="place-branches-section"
          >
            <h3 className="h6 fw-bold mb-2 d-flex align-items-center gap-2">
              <BsBuilding className="text-secondary" aria-hidden="true" />
              <span>{t('otherBranchesHeading')}</span>
            </h3>
            <div className="row g-2">
              {branches.map((branch) => {
                const branchLoc = formatPlaceLocationBadge(
                  branch.district_code,
                  branch.province_code
                );
                const branchAddr = sanitizePlaceText(branch.address, 140);
                const branchScore =
                  typeof branch.rating_score === 'number' &&
                  Number.isFinite(branch.rating_score) &&
                  branch.rating_score > 0
                    ? formatScoreFixed(branch.rating_score, 1)
                    : null;
                return (
                  <div key={branch.master_id} className="col-md-6 col-12">
                    <Link
                      href={branch.href}
                      className="d-block p-3 rounded-3 border text-decoration-none bg-white h-100"
                    >
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <span className="fw-semibold text-dark">
                          {branch.name}
                        </span>
                        {branchScore && (
                          <span className="badge bg-warning-subtle text-dark flex-shrink-0">
                            <BsStarFill
                              className="me-1 text-warning"
                              aria-hidden="true"
                            />
                            {branchScore}
                          </span>
                        )}
                      </div>
                      {(branchAddr || branchLoc) && (
                        <div className="small text-secondary text-truncate mt-1">
                          {branchAddr ?? branchLoc}
                        </div>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
