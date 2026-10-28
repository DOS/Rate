/**
 * Pure HTML builders for the side panel: no DOM and no chrome APIs, so the
 * test suite can render them. Every interpolated value goes through
 * escapeHtml or a formatSafe* helper.
 */
import type {
  ExtensionLookupData,
  ExtensionOfferItem,
  ExtractedPageProductSignal,
} from '../types.js';
import {
  escapeSafeExternalHref,
  formatSafeExtensionVnd,
  formatSafeNumber,
  normalizeFiveStarRating,
  resolveSafeApiRelativeUrl,
} from '../security-guards.js';

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

/** The marks the product page shows on a row (DOS/Rate#1297). */
export function offerMarks(offer: PanelOffer): string[] {
  const marks: string[] = [];
  if (offer.availability === 'out_of_stock') marks.push('Hết hàng');
  if (offer.availability === 'discontinued') marks.push('Ngừng bán');
  if (offer.implausiblyLow) marks.push('Giá thấp bất thường');
  return marks;
}

/** A star rating, or null when unknown or zero (DOS/Rate#1301). */
export function ratingStarText(raw: unknown): string | null {
  const rating = normalizeFiveStarRating(raw);
  return rating == null
    ? null
    : `★ ${formatSafeNumber(rating, { min: 0, max: 5, decimals: 1 })}`;
}

const OFFICIAL_BADGE_HTML =
  '<span style="color:#34d399;font-size: 13px;">Chính hãng</span>';

function renderOfferRowHtml(
  off: ExtensionOfferItem,
  cheapest: boolean
): string {
  const marks = offerMarks(off);
  const muted = !isOfferBuyable(off);
  const star = ratingStarText(off.rating_star);
  const meta = [
    escapeHtml(String(off.platform ?? '').toUpperCase()),
    star,
    // The combined score, as the product page labels it (DOS/Rate#1280).
    `Rủi ro tổng hợp: ${formatSafeNumber(off.merchant.risk_score, { min: 0, max: 100 })}/100`,
  ].filter(Boolean);
  const marksHtml = [
    ...(cheapest
      ? ['<span class="offer-mark offer-mark-best">Rẻ nhất</span>']
      : []),
    ...marks.map(
      (m) =>
        `<span class="offer-mark ${m === 'Giá thấp bất thường' ? 'offer-mark-warn' : 'offer-mark-muted'}">${escapeHtml(m)}</span>`
    ),
  ].join(' ');
  const priceTitle = isOfferSoldOut(off)
    ? ' title="Giá ghi nhận lần cuối, không phải giá đang bán"'
    : '';
  return `
            <div class="offer-item${muted ? ' offer-item-muted' : ''}">
              <div>
                <div class="offer-shop">
                  ${escapeHtml(off.merchant.name)}
                  ${off.merchant.is_official ? OFFICIAL_BADGE_HTML : ''}
                  ${marksHtml}
                </div>
                <div class="offer-meta">
                  ${meta.join(' - ')}
                </div>
              </div>
              <a href="${escapeSafeExternalHref(off.url)}" target="_blank" rel="noopener noreferrer" class="offer-price${muted ? ' offer-price-muted' : ''}"${priceTitle} style="text-decoration:none;">
                ${formatSafeExtensionVnd(off.price_current)}
              </a>
            </div>
          `;
}

/** The store price list card, or '' with no offer (DOS/Rate#1297). */
export function renderOffersCardHtml(offers: ExtensionOfferItem[]): string {
  if (offers.length === 0) return '';
  const ordered = orderOffersForPanel(offers);
  const cheapestId = cheapestBuyableOfferId(ordered);
  return `
      <div class="card">
        <div class="card-title">So Sánh Giá Các Gian Hàng (${formatSafeNumber(offers.length, { min: 0 })})</div>
        ${ordered
          .slice(0, 5)
          .map((off) => renderOfferRowHtml(off, off.id === cheapestId))
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
    'user_rating_weighted' | 'average_rating'
  > | null
): string {
  if (!reviews) return '';
  const star = ratingStarText(
    master?.user_rating_weighted || master?.average_rating
  );
  const analysed = Number(reviews.total_analyzed);
  const hasReviews = Number.isFinite(analysed) && analysed > 0;
  return `
      <div class="card">
        <div class="card-title">Chất lượng đánh giá (đã lọc đánh giá ảo)</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">Điểm người dùng (đã lọc)</div>
            <div class="stat-val"${star ? ' style="color: #fbbf24;"' : ''}>${star ? `${star} / 5` : 'Chưa có'}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Tỷ Lệ Đánh Giá Thật</div>
            ${
              hasReviews
                ? `<div class="stat-val" style="color: #34d399;">${formatSafeNumber(reviews.authentic_pct, { min: 0, max: 100 })}% (${formatSafeNumber(analysed, { min: 0 })} đánh giá)</div>`
                : '<div class="stat-val">Chưa có đánh giá</div>'
            }
          </div>
        </div>
        ${
          hasReviews && reviews.ai_summary
            ? `<p style="margin-top: 8px; color: #d1d5db; font-size: 13px;">${escapeHtml(reviews.ai_summary)}</p>`
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
  const query = String(signal.title ?? '').trim();
  const searchUrl = resolveSafeApiRelativeUrl(
    apiBaseUrl,
    query ? `/inspect?q=${encodeURIComponent(query)}` : '/inspect',
    '/inspect'
  );
  return `
      <div class="card">
        <div class="card-title">Chưa có sản phẩm này trên Rate.vn</div>
        ${query ? `<div class="product-name">${escapeHtml(query)}</div>` : ''}
        <p style="color: #9ca3af;">
          ${
            accessory
              ? 'Đây có vẻ là phụ kiện hoặc linh kiện. Rate.vn chưa so sánh giá cho loại hàng này.'
              : 'Rate.vn chưa có dữ liệu giá và đánh giá cho sản phẩm này.'
          }
        </p>
        <div class="btn-row">
          <a class="btn-secondary" href="${searchUrl}" target="_blank" rel="noopener noreferrer">Tìm trên Rate.vn</a>
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

const LOOKUP_FAILURE_TEXT: Record<LookupFailureKind, string> = {
  rate_limited: 'Bạn tra cứu hơi nhanh, thử lại sau ít phút.',
  server: 'Rate.vn đang gặp sự cố, thử lại sau.',
  network: 'Không kết nối được Rate.vn. Kiểm tra mạng rồi thử lại.',
  other: 'Không tra cứu được sản phẩm này lúc này.',
};

/** An error card with a retry button (`data-action="retry"`), #1300. */
export function renderLookupErrorHtml(
  kind: LookupFailureKind,
  productTitle?: string | null
): string {
  const title = String(productTitle ?? '').trim();
  return `
      <div class="card" role="alert">
        <div class="card-title">Chưa tra cứu được</div>
        ${title ? `<div class="product-name">${escapeHtml(title)}</div>` : ''}
        <p style="color: #9ca3af;">${escapeHtml(LOOKUP_FAILURE_TEXT[kind])}</p>
        <div class="btn-row">
          <button type="button" class="btn-secondary" data-action="retry">Thử lại</button>
        </div>
      </div>
    `;
}

export interface PanelActionLink {
  href: string;
  label: string;
  primary?: boolean;
}

/**
 * The product card's links, two per row, each once: no rival means no
 * versus link, not a second "Kiểm tra chi tiết" (DOS/Rate#1299). `href`
 * values are already escaped by resolveSafeApiRelativeUrl.
 */
export function renderActionRowsHtml(links: PanelActionLink[]): string {
  const rows: string[] = [];
  for (let i = 0; i < links.length; i += 2) {
    const cells = links
      .slice(i, i + 2)
      .map(
        (l) =>
          `<a class="${l.primary ? 'btn-primary' : 'btn-secondary'}" href="${l.href}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`
      )
      .join('\n        ');
    rows.push(
      `<div class="btn-row"${i > 0 ? ' style="margin-top: 6px;"' : ''}>
        ${cells}
      </div>`
    );
  }
  return rows.join('\n      ');
}
