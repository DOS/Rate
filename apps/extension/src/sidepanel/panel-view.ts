/**
 * Pure HTML builders for the side panel: no DOM and no chrome APIs, so the
 * test suite can render them. Every interpolated value goes through
 * escapeHtml or a formatSafe* helper.
 */
import type {
  ExtensionLookupData,
  ExtensionOfferItem,
  ExtensionPriceHistoryPoint,
  ExtensionVariantCandidate,
  ExtractedPageProductSignal,
  PinnedPriceAlert,
} from '../types.js';
import {
  escapeSafeExternalHref,
  filterValidSparklinePrices,
  formatSafeExtensionVnd,
  formatSafeNumber,
  MAX_VALID_EXTENSION_VND_PRICE,
  normalizeFiveStarRating,
  resolveExtensionMasterRating,
  resolveSafeApiRelativeUrl,
} from '../security-guards.js';
import { contentTextHtml, escapeHtml, t, type MessageKey } from '../i18n.js';
import {
  encodeSurrogateSafeUriComponent,
  sliceCodePoints,
  stripLoneSurrogates,
} from '../surrogate-safe.js';

export { escapeHtml };

export function buildSvgSparkline(
  points: ExtensionPriceHistoryPoint[]
): string {
  if (!points || points.length < 2) {
    return `<div style="font-size: 13px; color: #9ca3af; padding: 8px 0;">${escapeHtml(t('historyAccumulating'))}</div>`;
  }
  const prices = filterValidSparklinePrices(points);
  if (prices.length < 2) return '';

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = Math.max(1, maxP - minP);
  const width = 300;
  const height = 76;

  const coords = prices.map((p, idx) => {
    const x = Math.round((idx / (prices.length - 1)) * (width - 16) + 8);
    const y = Math.round(height - 10 - ((p - minP) / range) * (height - 20));
    return `${x},${y}`;
  });

  return `
    <svg aria-hidden="true" focusable="false" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="background: #101318; border-radius: 8px; border: 1px solid #2a2f3a; margin-top: 8px;">
      <polyline
        fill="none"
        stroke="#d83030"
        stroke-width="2.2"
        points="${coords.join(' ')}"
      />
    </svg>
  `;
}

export function isVariantCandidateActive(
  lookup: Pick<ExtensionLookupData, 'detectedStorageGb' | 'selectedVariant'> & {
    matchStatus?: ExtensionLookupData['matchStatus'];
  },
  candidate: Pick<ExtensionVariantCandidate, 'storageGb' | 'label' | 'slug'>
): boolean {
  if (lookup.matchStatus === 'ambiguous_variant') return false;
  if (
    typeof lookup.detectedStorageGb === 'number' &&
    Number.isFinite(lookup.detectedStorageGb) &&
    lookup.detectedStorageGb > 0 &&
    typeof candidate.storageGb === 'number' &&
    Number.isFinite(candidate.storageGb) &&
    candidate.storageGb > 0
  ) {
    return lookup.detectedStorageGb === candidate.storageGb;
  }
  const selected =
    typeof lookup.selectedVariant === 'string'
      ? lookup.selectedVariant.trim().toLowerCase()
      : '';
  if (!selected) return false;
  const label =
    typeof candidate.label === 'string'
      ? candidate.label.trim().toLowerCase()
      : '';
  const slug =
    typeof candidate.slug === 'string'
      ? candidate.slug.trim().toLowerCase()
      : '';
  return selected === label || selected === slug;
}

export function renderVariantPickerHtml(
  lookup: Pick<
    ExtensionLookupData,
    'variantCandidates' | 'detectedStorageGb' | 'selectedVariant'
  > & { matchStatus?: ExtensionLookupData['matchStatus'] },
  locale = t('langCode')
): string {
  if (lookup.variantCandidates.length <= 1) return '';
  return `
      <div class="card">
        <div class="card-title">${escapeHtml(t('variantPickerTitle'))}</div>
        <div class="variant-row">
          ${lookup.variantCandidates
            .map((v) => {
              const active = isVariantCandidateActive(lookup, v);
              return `
              <button
                type="button"
                class="variant-btn${active ? ' active' : ''}"
                aria-pressed="${active ? 'true' : 'false'}"
                data-variant="${escapeHtml(v.label)}"
              >
                ${contentTextHtml(v.label)} (${formatSafeExtensionVnd(v.minPrice, t('notAvailable'), locale)})
              </button>
            `;
            })
            .join('')}
        </div>
      </div>
    `;
}

type PanelOffer = Pick<
  ExtensionOfferItem,
  'id' | 'price_current' | 'availability' | 'implausiblyLow'
>;

export function isOfferSoldOut(offer: PanelOffer): boolean {
  return (
    offer.availability === 'out_of_stock' ||
    offer.availability === 'discontinued'
  );
}

/** Whether the row is a price someone can buy at now (DOS/Rate#1297). */
export function isOfferBuyable(offer: PanelOffer): boolean {
  return !isOfferSoldOut(offer) && !offer.implausiblyLow;
}

function hasValidPrice(offer: PanelOffer): boolean {
  return (
    typeof offer.price_current === 'number' &&
    Number.isFinite(offer.price_current) &&
    offer.price_current > 0
  );
}

/**
 * In-stock, plausible offers first, then bait prices, then sold-out and
 * discontinued rows; each group by price, ties in server order
 * (DOS/Rate#1297).
 */
export function orderOffersForPanel<T extends PanelOffer>(offers: T[]): T[] {
  const group = (o: T) => (isOfferSoldOut(o) ? 2 : o.implausiblyLow ? 1 : 0);
  return offers
    .map((offer, index) => ({ offer, index }))
    .sort((a, b) => {
      const byGroup = group(a.offer) - group(b.offer);
      if (byGroup !== 0) return byGroup;
      const aValid = hasValidPrice(a.offer);
      const bValid = hasValidPrice(b.offer);
      if (aValid !== bValid) return aValid ? -1 : 1;
      const byPrice = aValid
        ? a.offer.price_current - b.offer.price_current
        : 0;
      return byPrice !== 0 ? byPrice : a.index - b.index;
    })
    .map(({ offer }) => offer);
}

/** The cheapest row a shopper can buy at; never sold out or bait (#1297). */
export function cheapestBuyableOfferId(offers: PanelOffer[]): string | null {
  const buyable = orderOffersForPanel(offers).find(
    (o) => isOfferBuyable(o) && hasValidPrice(o)
  );
  return buyable ? buyable.id : null;
}

interface OfferMark {
  text: string;
  warn: boolean;
}

function offerMarkItems(offer: PanelOffer): OfferMark[] {
  const marks: OfferMark[] = [];
  if (offer.availability === 'out_of_stock') {
    marks.push({ text: t('offerOutOfStock'), warn: false });
  }
  if (offer.availability === 'discontinued') {
    marks.push({ text: t('offerDiscontinued'), warn: false });
  }
  if (offer.implausiblyLow) {
    marks.push({ text: t('offerImplausiblyLow'), warn: true });
  }
  return marks;
}

/** The marks the product page shows on a row (DOS/Rate#1297). */
export function offerMarks(offer: PanelOffer): string[] {
  return offerMarkItems(offer).map((m) => m.text);
}

/** A star rating, or null when unknown or zero (DOS/Rate#1301). */
export function ratingStarText(
  raw: unknown,
  locale = t('langCode')
): string | null {
  const rating = normalizeFiveStarRating(raw);
  return rating == null
    ? null
    : `★ ${formatSafeNumber(rating, { min: 0, max: 5, decimals: 1 }, locale)}`;
}

export function officialBadgeHtml(): string {
  return `<span style="color:#34d399;font-size: 13px;">${escapeHtml(t('officialStore'))}</span>`;
}

function renderOfferRowHtml(
  off: ExtensionOfferItem,
  cheapest: boolean,
  locale: string
): string {
  const marks = offerMarkItems(off);
  const muted = !isOfferBuyable(off);
  const star = ratingStarText(off.rating_star, locale);
  const meta = [
    escapeHtml(String(off.platform ?? '').toUpperCase()),
    star,
    // The combined score, as the product page labels it (DOS/Rate#1280).
    // No score at all: "no data yet", never 0/100 (DOS/Rate#1484).
    escapeHtml(
      off.merchant.risk_score == null
        ? t('offerCombinedRiskNoData')
        : t('offerCombinedRisk', [
            formatSafeNumber(
              off.merchant.risk_score,
              { min: 0, max: 100 },
              locale
            ),
          ])
    ),
  ].filter(Boolean);
  const marksHtml = [
    ...(cheapest
      ? [
          `<span class="offer-mark offer-mark-best">${escapeHtml(t('offerCheapest'))}</span>`,
        ]
      : []),
    ...marks.map(
      (m) =>
        `<span class="offer-mark ${m.warn ? 'offer-mark-warn' : 'offer-mark-muted'}">${escapeHtml(m.text)}</span>`
    ),
  ].join(' ');
  const priceTitle = isOfferSoldOut(off)
    ? ` title="${escapeHtml(t('offerLastSeenPrice'))}"`
    : '';
  return `
            <div class="offer-item${muted ? ' offer-item-muted' : ''}">
              <div>
                <div class="offer-shop">
                  ${contentTextHtml(off.merchant.name)}
                  ${off.merchant.is_official ? officialBadgeHtml() : ''}
                  ${marksHtml}
                </div>
                <div class="offer-meta">
                  ${meta.join(' - ')}
                </div>
              </div>
              <a href="${escapeSafeExternalHref(off.url)}" target="_blank" rel="noopener noreferrer" class="offer-price${muted ? ' offer-price-muted' : ''}"${priceTitle} style="text-decoration:none;">
                ${formatSafeExtensionVnd(off.price_current, t('notAvailable'), locale)}
              </a>
            </div>
          `;
}

/** The store price list card, or '' with no offer (DOS/Rate#1297). */
export function renderOffersCardHtml(
  offers: ExtensionOfferItem[],
  locale = t('langCode')
): string {
  if (offers.length === 0) return '';
  const ordered = orderOffersForPanel(offers);
  const cheapestId = cheapestBuyableOfferId(ordered);
  return `
      <div class="card">
        <div class="card-title">${escapeHtml(t('offersCardTitle', [formatSafeNumber(offers.length, { min: 0 }, locale)]))}</div>
        ${ordered
          .slice(0, 5)
          .map((off) => renderOfferRowHtml(off, off.id === cheapestId, locale))
          .join('')}
      </div>
    `;
}

/**
 * The review card. With nothing analysed it says so instead of "100% genuine
 * of 0 reviews", and an unknown rating shows no star (DOS/Rate#1301).
 */
export function renderReviewCardHtml(
  reviews: ExtensionLookupData['reviewSummary'],
  master: Pick<
    NonNullable<ExtensionLookupData['masterProduct']>,
    | 'rating_score_5'
    | 'rating_score'
    | 'user_rating_weighted'
    | 'average_rating'
  > | null,
  locale = t('langCode')
): string {
  if (!reviews) return '';
  const star = ratingStarText(resolveExtensionMasterRating(master), locale);
  const analysed = Number(reviews.total_analyzed);
  const hasReviews = Number.isFinite(analysed) && analysed > 0;
  // The server writes the summary in Vietnamese only. An English or Czech
  // panel leaves it out rather than machine-translating it or guessing its
  // language: the genuine share and the count above say the same
  // (DOS/Rate#1374).
  const isViLocale =
    typeof locale === 'string' &&
    locale.trim().slice(0, 32).toLowerCase().split(/[-_]/)[0] === 'vi';
  const summary =
    hasReviews && reviews.ai_summary && isViLocale && t('langCode') === 'vi'
      ? reviews.ai_summary
      : null;
  return `
      <div class="card">
        <div class="card-title">${escapeHtml(t('reviewCardTitle'))}</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('reviewUserScore'))}</div>
            <div class="stat-val"${star ? ' style="color: #fbbf24;"' : ''}>${star ? `${star} / 5` : escapeHtml(t('notAvailable'))}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('reviewAuthenticShare'))}</div>
            ${
              hasReviews
                ? `<div class="stat-val" style="color: #34d399;">${escapeHtml(t('reviewAuthenticValue', [formatSafeNumber(reviews.authentic_pct, { min: 0, max: 100 }, locale), formatSafeNumber(analysed, { min: 0 }, locale)]))}</div>`
                : `<div class="stat-val">${escapeHtml(t('reviewNone'))}</div>`
            }
          </div>
        </div>
        ${
          summary
            ? `<p style="margin-top: 8px; color: #d1d5db; font-size: 13px;">${escapeHtml(summary)}</p>`
            : ''
        }
      </div>
    `;
}

/**
 * The lookup found no product, or the page is an accessory: the panel shows
 * a short state, not a product card (DOS/Rate#1299).
 */
export function isLookupWithoutProduct(
  lookup: Pick<
    ExtensionLookupData,
    'matchStatus' | 'isAccessoryOrPart' | 'priceAssessment'
  > | null
): boolean {
  if (!lookup) return true;
  return (
    lookup.matchStatus === 'not_found' ||
    lookup.matchStatus === 'accessory_skip' ||
    lookup.isAccessoryOrPart ||
    lookup.priceAssessment?.verdict === 'accessory_skip'
  );
}

export function renderNotFoundHtml(
  signal: Pick<ExtractedPageProductSignal, 'title'>,
  apiBaseUrl: string,
  accessory: boolean
): string {
  const query = sliceCodePoints(String(signal.title ?? '').trim(), 500).trim();
  const searchUrl = resolveSafeApiRelativeUrl(
    apiBaseUrl,
    query
      ? `/inspect?q=${encodeSurrogateSafeUriComponent(query, 500)}`
      : '/inspect',
    '/inspect'
  );
  return `
      <div class="card">
        <div class="card-title">${escapeHtml(t('notFoundTitle'))}</div>
        ${query ? `<div class="product-name">${contentTextHtml(query)}</div>` : ''}
        <p style="color: #9ca3af;">
          ${escapeHtml(t(accessory ? 'notFoundAccessory' : 'notFoundNoData'))}
        </p>
        <div class="btn-row">
          <a class="btn-secondary" href="${searchUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('notFoundSearch'))}</a>
        </div>
      </div>
    `;
}

export type LookupFailureKind = 'rate_limited' | 'server' | 'network' | 'other';

/** `null` status: the request never got an answer (DOS/Rate#1300). */
export function classifyLookupFailure(
  status: number | null | undefined
): LookupFailureKind {
  if (typeof status !== 'number' || !Number.isFinite(status) || status <= 0) {
    return 'network';
  }
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'other';
}

const LOOKUP_FAILURE_MESSAGE = {
  rate_limited: 'lookupErrorRateLimited',
  server: 'lookupErrorServer',
  network: 'lookupErrorNetwork',
  other: 'lookupErrorOther',
} as const satisfies Record<LookupFailureKind, MessageKey>;

/** An error card with a retry button (`data-action="retry"`), #1300. */
export function renderLookupErrorHtml(
  kind: LookupFailureKind,
  productTitle?: string | null,
  retryAfterSeconds?: number | null,
  locale = t('langCode')
): string {
  const title = stripLoneSurrogates(String(productTitle ?? '')).trim();
  // A rate limit says how long to wait when the server said so (DOS/Rate#1466).
  const wait =
    kind === 'rate_limited' &&
    typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds)
      : null;
  const message =
    wait !== null
      ? t('lookupErrorRateLimitedWait', [
          formatSafeNumber(wait, { min: 1 }, locale),
        ])
      : t(LOOKUP_FAILURE_MESSAGE[kind]);
  return `
      <div class="card" role="alert">
        <div class="card-title">${escapeHtml(t('lookupErrorTitle'))}</div>
        ${title ? `<div class="product-name">${contentTextHtml(title)}</div>` : ''}
        <p style="color: #9ca3af;">${escapeHtml(message)}</p>
        <div class="btn-row">
          <button type="button" class="btn-secondary" data-action="retry">${escapeHtml(t('retry'))}</button>
        </div>
      </div>
    `;
}

export interface PanelActionLink {
  href: string;
  label: string;
  icon?: string;
  primary?: boolean;
}

/**
 * The product card's links, two per row, each once: no rival means no
 * versus link, not a second inspect link (DOS/Rate#1299). `href`
 * values are already escaped by resolveSafeApiRelativeUrl.
 */
export function renderActionRowsHtml(links: PanelActionLink[]): string {
  const rows: string[] = [];
  for (let i = 0; i < links.length; i += 2) {
    const cells = links
      .slice(i, i + 2)
      .map((l) => {
        const iconHtml = l.icon
          ? `<span aria-hidden="true">${escapeHtml(l.icon)} </span>`
          : '';
        return `<a class="${l.primary ? 'btn-primary' : 'btn-secondary'}" href="${l.href}" target="_blank" rel="noopener noreferrer">${iconHtml}${escapeHtml(l.label)}</a>`;
      })
      .join('\n        ');
    rows.push(
      `<div class="btn-row"${i > 0 ? ' style="margin-top: 6px;"' : ''}>
        ${cells}
      </div>`
    );
  }
  return rows.join('\n      ');
}

export type MerchantTrustColor = '#34d399' | '#fbbf24' | '#f87171' | '#9ca3af';

/**
 * Resolves the side panel trust score colour from canonical rate.vn merchant
 * risk cutoffs (`risk < 20` / `trust > 80` `#34d399`, `20 <= risk < 50` /
 * `trust > 50` `#fbbf24`, `risk >= 50` / `trust <= 50` `#f87171`, unknown
 * `#9ca3af`), preferring finite `risk_score` over `100 - trust_score`
 * (DOS/Rate#1720).
 */
export function merchantTrustColor(
  merchant:
    | {
        risk_score?: number | null;
        trust_score?: number | null;
      }
    | null
    | undefined
): MerchantTrustColor {
  if (!merchant || typeof merchant !== 'object') return '#9ca3af';
  const risk =
    typeof merchant.risk_score === 'number' &&
    Number.isFinite(merchant.risk_score)
      ? merchant.risk_score
      : typeof merchant.trust_score === 'number' &&
          Number.isFinite(merchant.trust_score)
        ? 100 - merchant.trust_score
        : null;
  if (risk === null) return '#9ca3af';
  if (risk < 20) return '#34d399';
  if (risk < 50) return '#fbbf24';
  return '#f87171';
}

// A risk score that is not known reads as no data, never as 0, the lowest risk: a store
// with no analysed review (DOS/Rate#1258) or no DOSafe score (DOS/Rate#1465).
/** "Trust N/100", or "no data yet" for a store with nothing to score (DOS/Rate#1484). */
export function trustText(
  score: number | null | undefined,
  locale = t('langCode')
): string {
  return typeof score !== 'number' || !Number.isFinite(score)
    ? t('merchantTrustNoData')
    : t('merchantTrust', [
        formatSafeNumber(score, { min: 0, max: 100 }, locale),
      ]);
}

export function riskScoreText(
  score: number | null | undefined,
  locale = t('langCode')
): string {
  return typeof score !== 'number' || !Number.isFinite(score)
    ? t('reviewRiskNoData')
    : formatSafeNumber(score, { min: 0, max: 100 }, locale);
}

export const MAX_PINNED_ALERTS = 50;
export const PINNED_ALERTS_STORAGE_KEY = 'pinnedAlerts';

const ALLOWED_PIN_CATEGORIES = new Set<PinnedPriceAlert['categorySlug']>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

const RESERVED_PIN_SLUGS =
  /^(?:__proto__|constructor|prototype|toString|valueOf|null|undefined|nan|infinity|-infinity|true|false|0+)$/i;

export function isValidPinnedProductSlug(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const cleaned = stripLoneSurrogates(raw)
    .replace(/\p{Cc}+/gu, '')
    .trim();
  if (cleaned.length < 2 || cleaned.length > 200) return false;
  if (cleaned.includes('..') || RESERVED_PIN_SLUGS.test(cleaned)) return false;
  return /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(cleaned);
}

export function computeDefaultAlertTargetVnd(
  bestPriceVnd: number | null | undefined
): number | null {
  if (
    typeof bestPriceVnd !== 'number' ||
    !Number.isFinite(bestPriceVnd) ||
    Math.round(bestPriceVnd) < 10_000 ||
    Math.round(bestPriceVnd) > MAX_VALID_EXTENSION_VND_PRICE
  ) {
    return null;
  }
  return Math.max(
    10_000,
    Math.floor((Math.round(bestPriceVnd) * 0.95) / 10_000) * 10_000
  );
}

export function resolveLookupBestPriceVnd(
  lookup: ExtensionLookupData | null | undefined,
  signal?: Pick<ExtractedPageProductSignal, 'price'> | null
): number | null {
  const isValidVnd = (v: unknown): v is number =>
    typeof v === 'number' &&
    Number.isFinite(v) &&
    Math.round(v) >= 10_000 &&
    Math.round(v) <= MAX_VALID_EXTENSION_VND_PRICE;

  if (lookup) {
    const offersSource =
      Array.isArray(lookup.allOffers) && lookup.allOffers.length > 0
        ? lookup.allOffers
        : Array.isArray(lookup.topCheaperOffers)
          ? lookup.topCheaperOffers
          : [];
    const buyable = orderOffersForPanel(offersSource).find(
      (o) => isOfferBuyable(o) && isValidVnd(o.price_current)
    );
    if (buyable && isValidVnd(buyable.price_current)) {
      return Math.round(buyable.price_current);
    }
    if (isValidVnd(lookup.priceAssessment?.marketMinPrice)) {
      return Math.round(lookup.priceAssessment.marketMinPrice);
    }
    if (isValidVnd(lookup.masterProduct?.min_price)) {
      return Math.round(lookup.masterProduct.min_price);
    }
    if (isValidVnd(lookup.priceAssessment?.observedPrice)) {
      return Math.round(lookup.priceAssessment.observedPrice);
    }
  }
  if (isValidVnd(signal?.price)) {
    return Math.round(signal.price);
  }
  return null;
}

function sanitizeSinglePinnedAlert(raw: unknown): PinnedPriceAlert | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const getOwn = (key: string): unknown =>
    Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;

  const rawSlug = getOwn('slug');
  if (!isValidPinnedProductSlug(rawSlug)) return null;
  const slug = stripLoneSurrogates(rawSlug)
    .replace(/\p{Cc}+/gu, '')
    .trim();

  const rawName = getOwn('productName');
  if (typeof rawName !== 'string') return null;
  const productName = sliceCodePoints(
    stripLoneSurrogates(rawName)
      .replace(/\p{Cc}+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    200
  );
  if (!productName) return null;

  const rawCat = getOwn('categorySlug');
  const categorySlug: PinnedPriceAlert['categorySlug'] =
    typeof rawCat === 'string' &&
    ALLOWED_PIN_CATEGORIES.has(rawCat as PinnedPriceAlert['categorySlug'])
      ? (rawCat as PinnedPriceAlert['categorySlug'])
      : 'smartphones';

  const rawTarget = getOwn('targetPriceVnd');
  if (
    typeof rawTarget !== 'number' ||
    !Number.isFinite(rawTarget) ||
    Math.round(rawTarget) < 10_000 ||
    Math.round(rawTarget) > MAX_VALID_EXTENSION_VND_PRICE
  ) {
    return null;
  }
  const targetPriceVnd = Math.round(rawTarget);

  const rawBest = getOwn('bestPriceAtPinVnd');
  const bestPriceAtPinVnd =
    typeof rawBest === 'number' &&
    Number.isFinite(rawBest) &&
    Math.round(rawBest) >= 10_000 &&
    Math.round(rawBest) <= MAX_VALID_EXTENSION_VND_PRICE
      ? Math.round(rawBest)
      : targetPriceVnd;

  const rawPinnedAt = getOwn('pinnedAt');
  let pinnedAt = '1970-01-01T00:00:00.000Z';
  if (typeof rawPinnedAt === 'string' && rawPinnedAt.length <= 64) {
    const ts = Date.parse(rawPinnedAt.trim());
    if (Number.isFinite(ts)) {
      pinnedAt = new Date(ts).toISOString();
    }
  }

  return {
    slug,
    productName,
    categorySlug,
    targetPriceVnd,
    bestPriceAtPinVnd,
    pinnedAt,
  };
}

/**
 * Prototype-safe schema validation and deduplication for `pinnedAlerts` read
 * from `chrome.storage.local`, strictly bounded to `<= 50` items.
 */
export function sanitizePinnedAlerts(raw: unknown): PinnedPriceAlert[] {
  if (!Array.isArray(raw)) return [];
  const out: PinnedPriceAlert[] = [];
  const seenSlugs = new Set<string>();

  for (const item of raw) {
    if (out.length >= MAX_PINNED_ALERTS) break;
    const clean = sanitizeSinglePinnedAlert(item);
    if (!clean) continue;
    const lowerSlug = clean.slug.toLowerCase();
    if (seenSlugs.has(lowerSlug)) continue;
    seenSlugs.add(lowerSlug);
    out.push(clean);
  }
  return out;
}

export function togglePinnedAlert(
  existingRaw: unknown,
  candidateRaw: PinnedPriceAlert
): { alerts: PinnedPriceAlert[]; pinned: boolean } {
  const existing = sanitizePinnedAlerts(existingRaw);
  const candidate = sanitizeSinglePinnedAlert(candidateRaw);
  if (!candidate) {
    return { alerts: existing, pinned: false };
  }
  const lowerSlug = candidate.slug.toLowerCase();
  const alreadyPinned = existing.some(
    (a) => a.slug.toLowerCase() === lowerSlug
  );
  if (alreadyPinned) {
    return {
      alerts: existing.filter((a) => a.slug.toLowerCase() !== lowerSlug),
      pinned: false,
    };
  }
  return {
    alerts: [candidate, ...existing].slice(0, MAX_PINNED_ALERTS),
    pinned: true,
  };
}

export function removePinnedAlertBySlug(
  existingRaw: unknown,
  rawSlug: unknown
): PinnedPriceAlert[] {
  const existing = sanitizePinnedAlerts(existingRaw);
  if (typeof rawSlug !== 'string') return existing;
  const targetLower = stripLoneSurrogates(rawSlug).trim().toLowerCase();
  if (!targetLower) return existing;
  return existing.filter((a) => a.slug.toLowerCase() !== targetLower);
}

export function resolveExtensionUrlLocalePrefix(
  rawLocale = t('langCode')
): 'vi' | 'en' | 'cs' {
  if (typeof rawLocale !== 'string') return 'vi';
  const primary = rawLocale.trim().slice(0, 32).toLowerCase().split(/[-_]/)[0];
  if (primary === 'en' || primary === 'cs') return primary;
  return 'vi';
}

export function buildWatchlistEmailAlertUrl(
  apiBaseUrl: string | null | undefined,
  slug: string,
  targetPriceVnd: number,
  locale = t('langCode')
): string {
  const localePrefix = resolveExtensionUrlLocalePrefix(locale);
  const cleanSlug = isValidPinnedProductSlug(slug)
    ? stripLoneSurrogates(slug)
        .replace(/\p{Cc}+/gu, '')
        .trim()
    : '';
  const cleanTarget =
    typeof targetPriceVnd === 'number' &&
    Number.isFinite(targetPriceVnd) &&
    Math.round(targetPriceVnd) >= 10_000 &&
    Math.round(targetPriceVnd) <= MAX_VALID_EXTENSION_VND_PRICE
      ? Math.round(targetPriceVnd)
      : null;
  if (!cleanSlug || cleanTarget === null) {
    return resolveSafeApiRelativeUrl(
      apiBaseUrl,
      `/${localePrefix}/watchlist`,
      '/watchlist'
    );
  }
  return resolveSafeApiRelativeUrl(
    apiBaseUrl,
    `/${localePrefix}/watchlist?add=${encodeSurrogateSafeUriComponent(cleanSlug, 200)}&target=${cleanTarget}`,
    '/watchlist'
  );
}

export function renderPinAlertButtonHtml(options: {
  pinnedAlert: PinnedPriceAlert | null;
  defaultTargetVnd: number | null;
  locale?: string;
}): string {
  const locale = options.locale ?? t('langCode');
  const existing = options.pinnedAlert;
  const displayTarget = existing?.targetPriceVnd ?? options.defaultTargetVnd;
  if (displayTarget === null) return '';

  const formattedTarget = formatSafeExtensionVnd(
    displayTarget,
    t('notAvailable'),
    locale
  );
  const isPinned = existing !== null;
  const label = isPinned
    ? t('unpinAlertBtn', [formattedTarget])
    : t('pinAlertBtn', [formattedTarget]);

  return `
      <div class="btn-row" style="margin-top: 8px;">
        <button
          type="button"
          class="btn-pin-alert${isPinned ? ' active' : ''}"
          data-pin-alert-toggle="true"
          aria-pressed="${isPinned ? 'true' : 'false'}"
        ><span aria-hidden="true">📌 </span>${escapeHtml(label)}</button>
      </div>
    `;
}

export function renderPinnedAlertsCardHtml(
  alerts: readonly PinnedPriceAlert[],
  options: {
    apiBaseUrl: string;
    livePriceBySlug?: ReadonlyMap<string, number>;
    locale?: string;
  }
): string {
  const safeAlerts = sanitizePinnedAlerts(alerts);
  if (safeAlerts.length === 0) return '';
  const locale = options.locale ?? t('langCode');

  const rows = safeAlerts
    .map((alert) => {
      const liveOverride = options.livePriceBySlug?.get(
        alert.slug.toLowerCase()
      );
      const livePrice =
        typeof liveOverride === 'number' &&
        Number.isFinite(liveOverride) &&
        Math.round(liveOverride) >= 10_000 &&
        Math.round(liveOverride) <= MAX_VALID_EXTENSION_VND_PRICE
          ? Math.round(liveOverride)
          : alert.bestPriceAtPinVnd;
      const hitTarget = livePrice <= alert.targetPriceVnd;
      const productHref = resolveSafeApiRelativeUrl(
        options.apiBaseUrl,
        `/${alert.categorySlug}/${encodeSurrogateSafeUriComponent(alert.slug, 200)}`,
        `/${alert.categorySlug}`
      );
      const emailAlertHref = buildWatchlistEmailAlertUrl(
        options.apiBaseUrl,
        alert.slug,
        alert.targetPriceVnd,
        locale
      );
      const targetVsLive = t('pinnedAlertTargetVsLive', [
        formatSafeExtensionVnd(alert.targetPriceVnd, t('notAvailable'), locale),
        formatSafeExtensionVnd(livePrice, t('notAvailable'), locale),
      ]);

      return `
        <div class="pinned-alert-row">
          <div style="min-width:0;flex:1;">
            <div class="offer-shop">
              <a href="${productHref}" target="_blank" rel="noopener noreferrer" style="color:#f3f4f6;text-decoration:none;">
                ${contentTextHtml(alert.productName)}
              </a>
            </div>
            <div class="offer-meta" style="color:${hitTarget ? '#34d399' : '#9ca3af'};">
              ${escapeHtml(targetVsLive)}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
              <a
                href="${emailAlertHref}"
                target="_blank"
                rel="noopener noreferrer"
                class="pin-email-link"
              ><span aria-hidden="true">✉️ </span>${escapeHtml(t('pinnedAlertEmailCta'))}</a>
              <button
                type="button"
                class="pin-remove-btn"
                data-unpin-slug="${escapeHtml(alert.slug)}"
              >${escapeHtml(t('pinnedAlertUnpinShort'))}</button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  return `
      <div class="card">
        <div class="card-title"><span aria-hidden="true">📌 </span>${escapeHtml(t('pinnedAlertsTitle', [formatSafeNumber(safeAlerts.length, { min: 1, max: MAX_PINNED_ALERTS }, locale)]))}</div>
        ${rows}
      </div>
    `;
}
