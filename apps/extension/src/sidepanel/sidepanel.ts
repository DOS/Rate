import type {
  ExtensionLookupData,
  ExtensionPriceHistoryPoint,
  ExtensionSettings,
  ExtractedPageProductSignal,
} from '../types.js';
import {
  DEFAULT_API_BASE_URL,
  escapeSafeExternalHref,
  filterValidSparklinePrices,
  formatSafeExtensionVnd,
  formatSafeNumber,
  resolveSafeApiRelativeUrl,
  sanitizeVerdictClassSuffix,
} from '../security-guards.js';
import { applyDocumentMessages, t, tHtml, type MessageKey } from '../i18n.js';
import {
  classifyLookupFailure,
  escapeHtml,
  isLookupWithoutProduct,
  officialBadgeHtml,
  renderActionRowsHtml,
  renderLookupErrorHtml,
  renderNotFoundHtml,
  renderOffersCardHtml,
  renderReviewCardHtml,
  type PanelActionLink,
} from './panel-view.js';
import { verdictTexts } from '../verdict-display.js';

function formatVnd(val: number | null | undefined): string {
  return formatSafeExtensionVnd(val);
}

function buildSvgSparkline(points: ExtensionPriceHistoryPoint[]): string {
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
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" style="background: #101318; border-radius: 8px; border: 1px solid #2a2f3a; margin-top: 8px;">
      <polyline
        fill="none"
        stroke="#d83030"
        stroke-width="2.2"
        points="${coords.join(' ')}"
      />
    </svg>
  `;
}

interface DealRadarFeedItem {
  id: string;
  verdict: string;
  verdictBadgeVi: string;
  productSlug: string;
  productName: string;
  categorySlug: string;
  productHref: string;
  platform: string;
  merchantName: string;
  offerUrl: string;
  priceCurrent: number;
  priceOriginal: number | null;
  savingsVsMedianVnd: number;
  savingsVsMedianPct: number;
  fakeMarkupPct: number;
  explanationVi: string;
}

interface PriceSpreadFeedItem {
  id: string;
  productSlug: string;
  productName: string;
  productHref: string;
  minPrice: number;
  maxPrice: number;
  spreadVnd: number;
  spreadPct: number;
  cheapestPlatform: string;
  cheapestOfferUrl: string;
  priciestPlatform: string;
}

async function fetchAndRenderDealRadar(
  settings: ExtensionSettings,
  categorySlug?: string
): Promise<void> {
  const slot = document.getElementById('deal-radar-slot');
  if (!slot) return;

  try {
    const catParam = categorySlug
      ? `&category=${encodeURIComponent(categorySlug)}`
      : '';
    const res = await fetch(
      `${settings.apiBaseUrl}/api/v1/rate/deals?limit=4${catParam}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return;
    const json = (await res.json()) as {
      ok?: boolean;
      data?: {
        genuineDeals?: DealRadarFeedItem[];
        fakeSaleTraps?: DealRadarFeedItem[];
        priceSpreadLeaders?: PriceSpreadFeedItem[];
      };
    };
    const deals = json?.data?.genuineDeals || [];
    const traps = json?.data?.fakeSaleTraps || [];
    const spreads = json?.data?.priceSpreadLeaders || [];
    if (deals.length === 0 && traps.length === 0 && spreads.length === 0)
      return;

    slot.innerHTML = `
      <div class="card">
        <div class="card-title">🔥 ${escapeHtml(t('radarDealsTitle'))}</div>
        ${deals
          .slice(0, 4)
          .map(
            (d) => `
            <div class="offer-item">
              <div>
                <div class="offer-shop">
                  <a href="${resolveSafeApiRelativeUrl(settings.apiBaseUrl, d.productHref)}" target="_blank" rel="noopener noreferrer" style="color:#f3f4f6;text-decoration:none;">
                    ${escapeHtml(d.productName)}
                  </a>
                </div>
                <div class="offer-meta">
                  ${escapeHtml(d.platform.toUpperCase())} (${escapeHtml(d.merchantName)}) - ${escapeHtml(t('radarSavings', [formatVnd(d.savingsVsMedianVnd), formatSafeNumber(d.savingsVsMedianPct, { min: 0, max: 100 })]))}
                </div>
              </div>
              <a href="${escapeSafeExternalHref(d.offerUrl)}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:#34d399;">
                ${formatVnd(d.priceCurrent)}
              </a>
            </div>
          `
          )
          .join('')}
        ${
          spreads.length > 0
            ? `
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid #2a2f3a;">
              <div class="card-title" style="color:#60a5fa;">📊 ${escapeHtml(t('radarSpreadTitle'))}</div>
              ${spreads
                .slice(0, 2)
                .map(
                  (s) => `
                  <div class="offer-item">
                    <div>
                      <div class="offer-shop">${escapeHtml(s.productName)}</div>
                      <div class="offer-meta" style="color:#93c5fd;">
                        ${escapeHtml(t('radarSpreadVersus', [s.cheapestPlatform.toUpperCase(), formatVnd(s.minPrice), s.priciestPlatform.toUpperCase(), formatVnd(s.maxPrice)]))}
                      </div>
                    </div>
                    <a href="${escapeSafeExternalHref(s.cheapestOfferUrl)}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:#60a5fa;">
                      ${escapeHtml(t('radarSpreadAmount', [formatVnd(s.spreadVnd)]))}
                    </a>
                  </div>
                `
                )
                .join('')}
            </div>
          `
            : ''
        }
        ${
          traps.length > 0
            ? `
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid #2a2f3a;">
              <div class="card-title" style="color:#f87171;">⚠️ ${escapeHtml(t('radarTrapsTitle'))}</div>
              ${traps
                .slice(0, 2)
                .map(
                  (trap) => `
                  <div class="offer-item">
                    <div>
                      <div class="offer-shop">${escapeHtml(trap.productName)}</div>
                      <div class="offer-meta" style="color:#fca5a5;">
                        ${escapeHtml(trap.platform.toUpperCase())} - ${escapeHtml(t('radarTrapMarkup', [formatSafeNumber(trap.fakeMarkupPct, { min: 0, max: 10000 }), formatVnd(trap.priceOriginal)]))}
                      </div>
                    </div>
                    <span class="offer-price" style="color:#f87171;">${formatVnd(trap.priceCurrent)}</span>
                  </div>
                `
                )
                .join('')}
            </div>
          `
            : ''
        }
      </div>
    `;
  } catch {
    // Non-blocking radar feed
  }
}

interface MerchantTrustFeedItem {
  id: string;
  platform: string;
  name: string;
  slug: string | null;
  is_official: boolean;
  dosafe_risk_score: number;
  /** Null when the store has no analysed review (DOS/Rate#1258). */
  review_risk_score: number | null;
  risk_score: number;
  trust_score: number;
  product_count: number;
}

// A store with no analysed review has no review risk score (DOS/Rate#1258).
function reviewRiskText(score: number | null | undefined): string {
  return score == null
    ? t('reviewRiskNoData')
    : formatSafeNumber(score, { min: 0, max: 100 });
}

async function fetchAndRenderMerchantTrustDirectory(
  settings: ExtensionSettings,
  platform?: string
): Promise<void> {
  const slot = document.getElementById('merchant-trust-slot');
  if (!slot) return;

  try {
    const res = await fetch(
      `${settings.apiBaseUrl}/api/v1/rate/merchants?sort=trust_desc&limit=18`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return;
    const json = (await res.json()) as {
      ok?: boolean;
      data?: MerchantTrustFeedItem[];
    };
    const allMerchants = json?.data || [];
    if (allMerchants.length === 0) return;

    const sorted = [...allMerchants].sort((a, b) => {
      if (platform) {
        const aMatch =
          a.platform.toLowerCase() === platform.toLowerCase() ? 1 : 0;
        const bMatch =
          b.platform.toLowerCase() === platform.toLowerCase() ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return b.trust_score - a.trust_score || b.product_count - a.product_count;
    });

    slot.innerHTML = `
      <div class="card">
        <div class="card-title">🛡️ ${escapeHtml(t('merchantDirTitle', [formatSafeNumber(allMerchants.length, { min: 0 })]))}</div>
        ${sorted
          .slice(0, 5)
          .map((m) => {
            const detailHref = resolveSafeApiRelativeUrl(
              settings.apiBaseUrl,
              `/merchants/${encodeURIComponent(m.slug || m.id)}`,
              '/merchants'
            );
            const trustScoreNum = Number(m.trust_score);
            const trustColor =
              trustScoreNum >= 85
                ? '#34d399'
                : trustScoreNum >= 65
                  ? '#fbbf24'
                  : '#f87171';
            return `
              <div class="offer-item">
                <div>
                  <div class="offer-shop">
                    <a href="${detailHref}" target="_blank" rel="noopener noreferrer" style="color:#f3f4f6;text-decoration:none;">
                      ${escapeHtml(m.name)}
                    </a>
                    ${m.is_official ? officialBadgeHtml() : ''}
                  </div>
                  <div class="offer-meta">
                    ${escapeHtml(m.platform.toUpperCase())} (${escapeHtml(t('merchantProductCount', [formatSafeNumber(m.product_count, { min: 0 })]))}) - ${escapeHtml(t('merchantScamRisk', [formatSafeNumber(m.dosafe_risk_score, { min: 0, max: 100 })]))} | ${escapeHtml(t('merchantReviewRisk', [reviewRiskText(m.review_risk_score)]))}
                  </div>
                </div>
                <a href="${detailHref}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:${trustColor};">
                  ${escapeHtml(t('merchantTrust', [formatSafeNumber(m.trust_score, { min: 0, max: 100 })]))}
                </a>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  } catch {
    // Non-blocking merchant trust directory
  }
}

function renderPanelContent(
  root: HTMLElement,
  signal: ExtractedPageProductSignal | null,
  lookup: ExtensionLookupData | null,
  settings: ExtensionSettings,
  onSelectVariant: (variantLabel: string) => void
): void {
  if (!signal) {
    root.innerHTML = `
      <div class="card">
        <div class="card-title">${escapeHtml(t('noProductTitle'))}</div>
        <p style="color: #9ca3af;">
          ${tHtml('noProductBody', [
            `<strong>${escapeHtml(t('noProductStores'))}</strong>`,
            `<strong>${escapeHtml(t('noProductLastStore'))}</strong>`,
            `<strong>${escapeHtml(t('quickLookupBoxName'))}</strong>`,
          ])}
        </p>
      </div>
      <div id="deal-radar-slot"></div>
      <div id="merchant-trust-slot"></div>
    `;
    void fetchAndRenderDealRadar(settings);
    void fetchAndRenderMerchantTrustDirectory(settings);
    return;
  }

  // Not found or an accessory: a short state with a search link, no product
  // card and no product buttons (DOS/Rate#1299). A failed lookup never gets
  // here; it renders an error card (DOS/Rate#1300).
  if (!lookup || isLookupWithoutProduct(lookup)) {
    const accessory = Boolean(
      lookup &&
      (lookup.isAccessoryOrPart ||
        lookup.matchStatus === 'accessory_skip' ||
        lookup.priceAssessment?.verdict === 'accessory_skip')
    );
    root.innerHTML = `
      ${renderNotFoundHtml(signal, settings.apiBaseUrl, accessory)}
      <div id="deal-radar-slot"></div>
      <div id="merchant-trust-slot"></div>
    `;
    void fetchAndRenderDealRadar(settings);
    void fetchAndRenderMerchantTrustDirectory(settings, signal.platform);
    return;
  }

  const assessment = lookup.priceAssessment;
  // The verdict in the extension's language (DOS/Rate#1326).
  const verdict = verdictTexts(assessment);
  const master = lookup.masterProduct;
  const reviews = lookup.reviewSummary;
  const merchant = lookup.merchantProfile;

  const variantButtonsHtml =
    lookup.variantCandidates.length > 1
      ? `
      <div class="card">
        <div class="card-title">${escapeHtml(t('variantPickerTitle'))}</div>
        <div class="variant-row">
          ${lookup.variantCandidates
            .map(
              (v) => `
              <button
                type="button"
                class="variant-btn ${lookup.detectedStorageGb === v.storageGb ? 'active' : ''}"
                data-variant="${escapeHtml(v.label)}"
              >
                ${escapeHtml(v.label)} (${formatVnd(v.minPrice)})
              </button>
            `
            )
            .join('')}
        </div>
      </div>
    `
      : '';

  const keySpecs = master?.key_specs;
  const keySpecsHtml =
    keySpecs &&
    (keySpecs.screen || keySpecs.chip || keySpecs.camera || keySpecs.battery)
      ? `
      <div class="card">
        <div class="card-title">${escapeHtml(t('keySpecsTitle'))}</div>
        <div class="stats-grid">
          ${
            keySpecs.screen
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specScreen'))}</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.screen)}</div></div>`
              : ''
          }
          ${
            keySpecs.chip
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specChip'))}</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.chip)}</div></div>`
              : ''
          }
          ${
            keySpecs.camera
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specCamera'))}</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.camera)}</div></div>`
              : ''
          }
          ${
            keySpecs.battery
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specBattery'))}</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.battery)}</div></div>`
              : ''
          }
        </div>
      </div>
    `
      : '';

  const offersList =
    lookup.allOffers.length > 0 ? lookup.allOffers : lookup.topCheaperOffers;

  const offersHtml = renderOffersCardHtml(offersList);

  const reviewHtml = renderReviewCardHtml(reviews, master);

  const merchantRiskHtml = merchant
    ? `
      <div class="card">
        <div class="card-title">${escapeHtml(t('merchantCardTitle'))}</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('merchantTrustScore'))}</div>
            <div class="stat-val" style="color: #34d399;">${formatSafeNumber(merchant.trust_score, { min: 0, max: 100 })}/100</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('merchantRiskPair'))}</div>
            <div class="stat-val">${formatSafeNumber(merchant.dosafe_risk_score, { min: 0, max: 100 })} / ${escapeHtml(reviewRiskText(merchant.review_risk_score))}</div>
          </div>
        </div>
      </div>
    `
    : '';

  const historyHtml = lookup.priceHistory
    ? `
      <div class="card">
        <div class="card-title">${escapeHtml(t('historyTitle'))}</div>
        ${buildSvgSparkline(lookup.priceHistory.points)}
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('historyLow'))}</div>
            <div class="stat-val" style="color: #34d399;">${formatVnd(lookup.priceHistory.lowestEverPrice)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('historyHigh'))}</div>
            <div class="stat-val">${formatVnd(lookup.priceHistory.highestEverPrice)}</div>
          </div>
        </div>
      </div>
    `
    : '';

  const categoryNameMap: Record<string, MessageKey> = {
    smartphones: 'categorySmartphones',
    tablets: 'categoryTablets',
    laptops: 'categoryLaptops',
    smartwatches: 'categorySmartwatches',
    earbuds: 'categoryEarbuds',
  };
  const rawCategorySlug = lookup.categorySlug || 'smartphones';
  const categorySlug = Object.prototype.hasOwnProperty.call(
    categoryNameMap,
    rawCategorySlug
  )
    ? rawCategorySlug
    : 'smartphones';
  const focusLabelMap: Record<string, MessageKey> = {
    combined: 'focusCombined',
    screen: 'focusScreen',
    performance: 'focusPerformance',
    camera: 'focusCamera',
    battery: 'focusBattery',
    value: 'focusValue',
  };
  const focusLabel = (criterion: string) => {
    const key = Object.prototype.hasOwnProperty.call(focusLabelMap, criterion)
      ? focusLabelMap[criterion]
      : undefined;
    return key ? t(key) : criterion;
  };

  const standings = lookup.leaderboardStandings;
  const overallBadge =
    standings?.find((b) => b.criterion === 'combined') ||
    standings?.[0] ||
    null;
  const subBadges = standings?.filter((b) => b.criterion !== 'combined') || [];
  const leaderboardCardHtml = overallBadge
    ? `
      <div class="card">
        <div class="card-title">${escapeHtml(t('leaderboardCardTitle', [t(categoryNameMap[categorySlug] ?? 'categoryFallback')]))}</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('leaderboardRank'))}</div>
            <div class="stat-val" style="color: #ff6b6b;">#${formatSafeNumber(overallBadge.rank, { min: 1 })} / ${formatSafeNumber(overallBadge.totalInCategory, { min: 1 })}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('leaderboardScore'))}</div>
            <div class="stat-val" style="color: #34d399;">${formatSafeNumber(overallBadge.score10, { min: 0, max: 10, decimals: 1 })} / 10</div>
          </div>
        </div>
        ${
          subBadges.length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
                ${subBadges
                  .map(
                    (sr) =>
                      `<span style="font-size: 13px;background:#181c24;border:1px solid #2a2f3a;color:#e5e7eb;padding:3px 7px;border-radius:6px;">🏆 #${formatSafeNumber(sr.rank, { min: 1 })} ${escapeHtml(focusLabel(sr.criterion))} (${formatSafeNumber(sr.score10, { min: 0, max: 10, decimals: 1 })})</span>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>
    `
    : '';

  const detailUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    lookup.productDetailUrl,
    `/${categorySlug}`
  );
  const compareUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    lookup.compareUrl,
    // The compare page reads `category` (DOS/Rate#1299).
    `/compare?category=${categorySlug}`
  );
  const leaderboardUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    lookup.leaderboardUrl,
    `/leaderboard?cat=${categorySlug}`
  );
  const versusUrl = lookup.versusUrl
    ? resolveSafeApiRelativeUrl(
        settings.apiBaseUrl,
        lookup.versusUrl,
        `/compare?category=${categorySlug}`
      )
    : null;
  const inspectUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    `/inspect?q=${encodeURIComponent(
      signal.canonicalUrl || master?.slug || signal.title
    )}`,
    '/inspect'
  );
  // Alerts are per size: an Item page with no stated size adds nothing until
  // a size is picked (DOS/Rate#1158).
  const sizeUnknown = Boolean(lookup.item) && !lookup.selectedVariant;
  const watchlistUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    master?.slug && !sizeUnknown
      ? `/watchlist?add=${encodeURIComponent(master.slug)}`
      : '/watchlist',
    '/watchlist'
  );

  const radarSig = lookup.radarSignal;
  const radarSpreadPct = Number(radarSig?.spreadPct ?? 0);
  const radarPillHtml = radarSig
    ? radarSig.verdict === 'genuine_deal'
      ? `<span class="verdict-pill verdict-genuine_deal" style="margin-left:6px;">🔥 ${escapeHtml(t('radarPillDeal', [formatSafeNumber(radarSig.savingsPct, { min: 0, max: 100 })]))}</span>`
      : radarSig.verdict === 'fake_sale_trap'
        ? `<span class="verdict-pill verdict-inflated_fake_sale" style="margin-left:6px;">🚨 ${escapeHtml(t('radarPillTrap', [formatSafeNumber(radarSig.fakeMarkupPct, { min: 0, max: 10000 })]))}</span>`
        : Number.isFinite(radarSpreadPct) && radarSpreadPct >= 5
          ? `<span class="verdict-pill" style="margin-left:6px;background:#1e293b;color:#38bdf8;border:1px solid #0284c7;">📊 ${escapeHtml(t('radarPillSpread', [formatSafeNumber(radarSig.spreadPct, { min: 0, max: 10000 })]))}</span>`
          : ''
    : '';

  // Each link once; with no rival the versus slot is simply absent
  // (DOS/Rate#1299).
  const actionLinks: PanelActionLink[] = [
    { href: detailUrl, label: t('linkDetail'), primary: true },
    { href: compareUrl, label: t('linkCompare') },
    { href: leaderboardUrl, label: `🏆 ${t('linkLeaderboard')}` },
    ...(versusUrl ? [{ href: versusUrl, label: `⚔️ ${t('linkVersus')}` }] : []),
    { href: inspectUrl, label: `🔬 ${t('linkInspect')}` },
    { href: watchlistUrl, label: `🔔 ${t('linkWatch')}` },
  ];

  root.innerHTML = `
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        <span class="verdict-pill verdict-${
          // A bait price warns in amber, as the badge and pill do (#1298).
          assessment.implausiblyLow
            ? 'implausibly_low'
            : sanitizeVerdictClassSuffix(assessment.verdict)
        }">${escapeHtml(verdict.label)}</span>
        ${radarPillHtml}
      </div>
      <div class="product-name">${escapeHtml((sizeUnknown ? lookup.item?.name : master?.name) || signal.title)}</div>
      <p style="color: #d1d5db; font-size: 13px;">${escapeHtml(verdict.explanation)}</p>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">${escapeHtml(t('observedPrice'))}</div>
          <div class="stat-val">${formatVnd(assessment.observedPrice ?? signal.price)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">${escapeHtml(t('marketMedian'))}</div>
          <div class="stat-val">${formatVnd(assessment.marketMedianPrice)}</div>
        </div>
      </div>
      ${renderActionRowsHtml(actionLinks)}
    </div>
    ${leaderboardCardHtml}
    ${variantButtonsHtml}
    ${keySpecsHtml}
    ${historyHtml}
    ${offersHtml}
    ${reviewHtml}
    ${merchantRiskHtml}
    <div id="deal-radar-slot"></div>
    <div id="merchant-trust-slot"></div>
  `;

  void fetchAndRenderDealRadar(settings, categorySlug);
  void fetchAndRenderMerchantTrustDirectory(settings, signal.platform);

  root.querySelectorAll<HTMLButtonElement>('.variant-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-variant');
      if (selected) {
        onSelectVariant(selected);
      }
    });
  });
}

async function loadSidePanel(selectedVariant?: string): Promise<void> {
  const root = document.getElementById('panel-root');
  const chkOptIn = document.getElementById(
    'chk-crowd-optin'
  ) as HTMLInputElement | null;
  const inpApiBase = document.getElementById(
    'inp-api-base'
  ) as HTMLInputElement | null;
  if (!root) return;

  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'RATE_SIDEPANEL_FETCH_FULL',
      selectedVariant: selectedVariant ?? null,
    })) as {
      ok?: boolean;
      settings?: ExtensionSettings;
      signal?: ExtractedPageProductSignal | null;
      data?: ExtensionLookupData | null;
      status?: number | null;
    };

    const settings: ExtensionSettings = res?.settings || {
      apiBaseUrl: DEFAULT_API_BASE_URL,
      crowdContributeOptIn: false,
    };

    if (chkOptIn) {
      chkOptIn.checked = Boolean(settings.crowdContributeOptIn);
    }
    if (inpApiBase && !inpApiBase.value) {
      inpApiBase.value = settings.apiBaseUrl;
    }

    if (res?.ok === false) {
      renderLookupError(root, res.status, res.signal?.title, () => {
        void loadSidePanel(selectedVariant);
      });
      return;
    }

    renderPanelContent(
      root,
      res?.signal || null,
      res?.data || null,
      settings,
      (variantLabel) => {
        void loadSidePanel(variantLabel);
      }
    );
  } catch {
    renderLookupError(root, null, null, () => {
      void loadSidePanel(selectedVariant);
    });
  }
}

/**
 * A failed lookup shows why and a retry button, never "not a product page"
 * or the server settings hint (DOS/Rate#1300).
 */
function renderLookupError(
  root: HTMLElement,
  status: number | null | undefined,
  productTitle: string | null | undefined,
  retry: () => void
): void {
  root.innerHTML = renderLookupErrorHtml(
    classifyLookupFailure(status),
    productTitle
  );
  root
    .querySelector<HTMLButtonElement>('[data-action="retry"]')
    ?.addEventListener('click', retry);
}

async function runQuickQuery(query: string): Promise<void> {
  const root = document.getElementById('panel-root');
  if (!root || !query.trim()) return;

  root.innerHTML = `
    <div class="card">
      <p style="color: #9ca3af;">${escapeHtml(t('quickLookupLoading', [query.trim()]))}</p>
    </div>
  `;

  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'RATE_SIDEPANEL_QUICK_QUERY',
      query: query.trim(),
    })) as {
      ok?: boolean;
      settings?: ExtensionSettings;
      signal?: ExtractedPageProductSignal | null;
      data?: ExtensionLookupData | null;
      error?: string;
      status?: number | null;
    };

    const settings: ExtensionSettings = res?.settings || {
      apiBaseUrl: DEFAULT_API_BASE_URL,
      crowdContributeOptIn: false,
    };

    if (res?.ok === false) {
      renderLookupError(root, res.status, res.signal?.title ?? query, () => {
        void runQuickQuery(query);
      });
      return;
    }

    renderPanelContent(
      root,
      res?.signal || null,
      res?.data || null,
      settings,
      (variantLabel) => {
        void loadSidePanel(variantLabel);
      }
    );
  } catch {
    renderLookupError(root, null, query, () => {
      void runQuickQuery(query);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyDocumentMessages(document);
  const btnRefresh = document.getElementById('btn-refresh');
  const formQuickInspect = document.getElementById(
    'form-quick-inspect'
  ) as HTMLFormElement | null;
  const inpQuickQuery = document.getElementById(
    'inp-quick-query'
  ) as HTMLInputElement | null;
  const chkOptIn = document.getElementById(
    'chk-crowd-optin'
  ) as HTMLInputElement | null;
  const inpApiBase = document.getElementById(
    'inp-api-base'
  ) as HTMLInputElement | null;

  btnRefresh?.addEventListener('click', () => {
    void loadSidePanel();
  });

  formQuickInspect?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (inpQuickQuery?.value.trim()) {
      void runQuickQuery(inpQuickQuery.value.trim());
    }
  });

  chkOptIn?.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      type: 'RATE_UPDATE_SETTINGS',
      crowdContributeOptIn: chkOptIn.checked,
    });
  });

  inpApiBase?.addEventListener('change', async () => {
    if (inpApiBase.value.trim()) {
      const updated = (await chrome.runtime.sendMessage({
        type: 'RATE_UPDATE_SETTINGS',
        apiBaseUrl: inpApiBase.value.trim(),
      })) as { settings?: ExtensionSettings } | undefined;
      if (updated?.settings?.apiBaseUrl) {
        inpApiBase.value = updated.settings.apiBaseUrl;
      }
      void loadSidePanel();
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'session' && changes.lookup_tab_latest) {
        void loadSidePanel();
      }
    });
  }

  void loadSidePanel();
});
