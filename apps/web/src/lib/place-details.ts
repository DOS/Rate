import { HttpUrlSchema } from '@repo/shared-data';
import { formatHref } from './navigation';
import { formatListingPrice, type PlacePriceUnit } from './locale-format';
import { formatScoreFixed } from './rating-display';

export type PlacePriceTier = '$' | '$$' | '$$$' | '$$$$';

export type PlaceJsonLdType =
  | 'Restaurant'
  | 'CafeOrCoffeeShop'
  | 'Hotel'
  | 'LodgingBusiness'
  | 'LocalBusiness';

export interface PlaceDetail {
  readonly master_id: string;
  readonly place_key: string;
  readonly branch_group_key: string;
  readonly geo_lat: number | null;
  readonly geo_lng: number | null;
  readonly geohash7: string | null;
  readonly address: string | null;
  readonly province_code: string;
  readonly district_code: string | null;
  readonly price_min: number | null;
  readonly price_max: number | null;
  readonly price_tier: PlacePriceTier | null;
  readonly price_unit: PlacePriceUnit | null;
  readonly opening_hours: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly cuisine: string | null;
  readonly star_rating: number | null;
  readonly overture_confidence: number | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PlaceBranchSibling {
  readonly master_id: string;
  readonly slug: string;
  readonly name: string;
  readonly href: string;
  readonly address: string | null;
  readonly province_code: string;
  readonly district_code: string | null;
  readonly price_min: number | null;
  readonly price_max: number | null;
  readonly price_tier: PlacePriceTier | null;
  readonly price_unit: PlacePriceUnit | null;
  readonly rating_score: number | null;
  readonly total_reviews: number;
}

export interface SanitizedPlacePhone {
  readonly display: string;
  readonly href: string;
}

export interface SanitizedPlaceCoordinates {
  readonly lat: number;
  readonly lng: number;
  readonly latText: string;
  readonly lngText: string;
  readonly mapUrl: string;
}

export const PLACE_BRANCH_GROUP_KEY_RE = /^[a-z0-9_-]{1,128}$/;
const PLACE_ADMIN_CODE_RE = /^[a-z0-9_-]{1,64}$/;
const PLACE_PHONE_COMPACT_RE = /^\+?[0-9-]{6,20}$/;
const CONTROL_CHARS_RE = /\p{Cc}+/gu;
const UNSAFE_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
]);
const VALID_PRICE_TIERS = new Set<PlacePriceTier>(['$', '$$', '$$$', '$$$$']);
const VALID_PRICE_UNITS = new Set<PlacePriceUnit>([
  'vnd_per_person',
  'vnd_per_night_ref',
]);

export function sanitizePlaceText(
  value: unknown,
  maxLength = 300
): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

export function sanitizePlaceBranchGroupKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (UNSAFE_KEYS.has(value) || !PLACE_BRANCH_GROUP_KEY_RE.test(value)) {
    return null;
  }
  return value;
}

export function sanitizePlaceAdminCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (UNSAFE_KEYS.has(value) || !PLACE_ADMIN_CODE_RE.test(value)) {
    return null;
  }
  return value;
}

export function sanitizePlacePriceTier(value: unknown): PlacePriceTier | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim() as PlacePriceTier;
  return VALID_PRICE_TIERS.has(trimmed) ? trimmed : null;
}

export function sanitizePlacePriceUnit(value: unknown): PlacePriceUnit | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase() as PlacePriceUnit;
  return VALID_PRICE_UNITS.has(trimmed) ? trimmed : null;
}

/**
 * Validates external place website URLs: accepts only clean `http:`/`https:` URLs,
 * rejecting scripts, data URIs, embedded credentials, non-standard ports, whitespace,
 * and loopback hosts.
 */
export function sanitizePlaceWebsiteUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value || /\p{Cc}/u.test(value) || /\s/.test(value)) return null;
  const parsedSchema = HttpUrlSchema.safeParse(value);
  if (!parsedSchema.success) return null;
  try {
    const parsed = new URL(parsedSchema.data);
    const bareHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      bareHost === 'localhost' ||
      bareHost === '127.0.0.1' ||
      bareHost === '::1' ||
      bareHost.endsWith('.local')
    ) {
      return null;
    }
    if (parsed.port !== '') return null;
    if (parsed.username !== '' || parsed.password !== '') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Normalizes a place phone string, stripping control characters for display and
 * collapsing whitespace for `/^\+?[0-9-]{6,20}$/` validation so `formatHref`
 * accepts valid spaced numbers such as `"+84 28 3823 6688"`.
 */
export function sanitizePlacePhone(value: unknown): SanitizedPlacePhone | null {
  const display = sanitizePlaceText(value, 32);
  if (!display) return null;
  const compact = display.replace(/\s+/g, '');
  if (!PLACE_PHONE_COMPACT_RE.test(compact)) return null;
  const href = formatHref(`tel:${compact}`);
  if (!href.startsWith('tel:')) return null;
  return { display, href };
}

/**
 * Validates geo coordinates strictly on finite ranges (`[-90, 90]` / `[-180, 180]`),
 * treating `0` as a valid coordinate and formatting `.toFixed(6)` in map URLs.
 */
export function sanitizePlaceCoordinates(
  rawLat: unknown,
  rawLng: unknown
): SanitizedPlaceCoordinates | null {
  if (
    rawLat === null ||
    rawLat === undefined ||
    rawLng === null ||
    rawLng === undefined
  ) {
    return null;
  }
  const lat =
    typeof rawLat === 'number'
      ? rawLat
      : typeof rawLat === 'string' && rawLat.trim() !== ''
        ? Number(rawLat.trim())
        : Number.NaN;
  const lng =
    typeof rawLng === 'number'
      ? rawLng
      : typeof rawLng === 'string' && rawLng.trim() !== ''
        ? Number(rawLng.trim())
        : Number.NaN;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  const latText = lat.toFixed(6);
  const lngText = lng.toFixed(6);
  return {
    lat,
    lng,
    latText,
    lngText,
    mapUrl: `https://www.openstreetmap.org/?mlat=${latText}&mlon=${lngText}#map=17/${latText}/${lngText}`,
  };
}

export function formatPlaceLocationBadge(
  districtCode?: string | null,
  provinceCode?: string | null
): string | null {
  const cleanDistrict = sanitizePlaceAdminCode(districtCode);
  const cleanProvince = sanitizePlaceAdminCode(provinceCode);
  const formatCode = (code: string) =>
    code.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  if (cleanDistrict && cleanProvince) {
    return `${formatCode(cleanDistrict)}, ${formatCode(cleanProvince)}`;
  }
  if (cleanProvince) return formatCode(cleanProvince);
  if (cleanDistrict) return formatCode(cleanDistrict);
  return null;
}

export function formatPlaceReferencePriceRange(options: {
  readonly priceMin: number | null | undefined;
  readonly priceMax: number | null | undefined;
  readonly categorySlug: string;
  readonly priceUnit?: string | null;
  readonly locale?: string | null;
}): string | null {
  const min =
    typeof options.priceMin === 'number' &&
    Number.isFinite(options.priceMin) &&
    options.priceMin > 0
      ? Math.round(options.priceMin)
      : null;
  const max =
    typeof options.priceMax === 'number' &&
    Number.isFinite(options.priceMax) &&
    options.priceMax > 0
      ? Math.round(options.priceMax)
      : null;
  const unit = sanitizePlacePriceUnit(options.priceUnit);
  if (min !== null && max !== null && max > min) {
    const minStr = formatListingPrice(min, 'VND', options.locale, {
      categorySlug: options.categorySlug,
      priceUnit: unit,
      includeUnitSuffix: false,
    });
    const maxStr = formatListingPrice(max, 'VND', options.locale, {
      categorySlug: options.categorySlug,
      priceUnit: unit,
    });
    return `${minStr} - ${maxStr}`;
  }
  const single = min ?? max;
  if (single === null) return null;
  return formatListingPrice(single, 'VND', options.locale, {
    categorySlug: options.categorySlug,
    priceUnit: unit,
  });
}

export function resolvePlaceJsonLdType(
  categorySlug: string | null | undefined
): PlaceJsonLdType {
  switch (categorySlug) {
    case 'restaurants':
      return 'Restaurant';
    case 'cafes':
      return 'CafeOrCoffeeShop';
    case 'hotels':
      return 'Hotel';
    case 'homestays':
      return 'LodgingBusiness';
    default:
      return 'LocalBusiness';
  }
}

export function buildPlaceStructuredData(params: {
  readonly name: string;
  readonly categorySlug: string;
  readonly canonicalUrl: string;
  readonly imageUrl?: string | null;
  readonly description?: string | null;
  readonly placeDetail?: PlaceDetail | null;
  readonly ratingValue?: number | null;
  readonly ratingCount?: number | null;
}): Record<string, unknown> {
  const detail = params.placeDetail ?? null;
  const schemaType = resolvePlaceJsonLdType(params.categorySlug);
  const cleanAddress = sanitizePlaceText(detail?.address, 400);
  const cleanDistrict = sanitizePlaceAdminCode(detail?.district_code);
  const cleanProvince = sanitizePlaceAdminCode(detail?.province_code);
  const coords = detail
    ? sanitizePlaceCoordinates(detail.geo_lat, detail.geo_lng)
    : null;
  const safePhone = detail ? sanitizePlacePhone(detail.phone) : null;
  const safeWebsite = detail ? sanitizePlaceWebsiteUrl(detail.website) : null;
  const safeTier = detail ? sanitizePlacePriceTier(detail.price_tier) : null;
  const cleanCuisine = sanitizePlaceText(detail?.cuisine, 160);
  const ratingCount =
    typeof params.ratingCount === 'number' &&
    Number.isFinite(params.ratingCount) &&
    params.ratingCount > 0
      ? Math.round(params.ratingCount)
      : 0;
  const ratingValue =
    typeof params.ratingValue === 'number' &&
    Number.isFinite(params.ratingValue) &&
    params.ratingValue > 0
      ? Number(formatScoreFixed(params.ratingValue, 1))
      : 0;

  return {
    '@type': schemaType,
    name: params.name,
    url: params.canonicalUrl,
    ...(params.imageUrl ? { image: params.imageUrl } : {}),
    ...(params.description ? { description: params.description } : {}),
    ...(cleanAddress || cleanProvince || cleanDistrict
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(cleanAddress ? { streetAddress: cleanAddress } : {}),
            ...(cleanDistrict ? { addressLocality: cleanDistrict } : {}),
            ...(cleanProvince ? { addressRegion: cleanProvince } : {}),
            addressCountry: 'VN',
          },
        }
      : {}),
    ...(coords
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: coords.lat,
            longitude: coords.lng,
          },
        }
      : {}),
    ...(safePhone ? { telephone: safePhone.display } : {}),
    ...(safeTier ? { priceRange: safeTier } : {}),
    ...(params.categorySlug === 'restaurants' && cleanCuisine
      ? { servesCuisine: cleanCuisine }
      : {}),
    ...(safeWebsite ? { sameAs: safeWebsite } : {}),
    ...(ratingCount > 0 && ratingValue > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue,
            ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
