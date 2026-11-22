import type {
  ExtensionLookupData,
  ExtensionSettings,
  ExtractedPageProductSignal,
} from '../types.js';
import {
  DEFAULT_API_BASE_URL,
  escapeSafeExternalHref,
  formatSafeExtensionVnd,
  formatSafeNumber,
  normalizeAllowedApiBaseUrl,
  resolveSafeApiRelativeUrl,
  sanitizeVerdictClassSuffix,
} from '../security-guards.js';
import {
  encodeSurrogateSafeUriComponent,
  sliceCodePoints,
  stripLoneSurrogates,
} from '../surrogate-safe.js';
import {
  applyDocumentMessages,
  contentLangAttr,
  contentTextHtml,
  t,
  tHtml,
  type MessageKey,
} from '../i18n.js';
import {
  buildSvgSparkline,
  classifyLookupFailure,
  escapeHtml,
  isLookupWithoutProduct,
  merchantTrustColor,
  officialBadgeHtml,
  renderActionRowsHtml,
  renderLookupErrorHtml,
  renderNotFoundHtml,
  renderOffersCardHtml,
  renderReviewCardHtml,
  renderVariantPickerHtml,
  type PanelActionLink,
  riskScoreText,
  trustText,
} from './panel-view.js';
import { verdictTexts } from '../verdict-display.js';

function formatVnd(
  val: number | null | undefined,
  locale = t('langCode')
): string {
  return formatSafeExtensionVnd(val, t('notAvailable'), locale);
}

function cleanUrlSegment(raw: unknown, maxCodePoints: number): string {
  if (typeof raw !== 'string') return '';
  const cleaned = stripLoneSurrogates(raw).trim();
  if (!cleaned) return '';
  return sliceCodePoints(cleaned, maxCodePoints).trim();
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
  const generationAtStart = panelLoadGeneration;
  slot.innerHTML = '';

  try {
    const safeCategory = cleanUrlSegment(categorySlug, 120);
    const catParam = safeCategory
      ? `&category=${encodeSurrogateSafeUriComponent(safeCategory)}`
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
    if (generationAtStart !== panelLoadGeneration) return;
    if (!json || json.ok === false) return;
    const deals = (
      Array.isArray(json.data?.genuineDeals) ? json.data.genuineDeals : []
    ).filter((d): d is DealRadarFeedItem =>
      Boolean(d && typeof d === 'object')
    );
    const traps = (
      Array.isArray(json.data?.fakeSaleTraps) ? json.data.fakeSaleTraps : []
    ).filter((d): d is DealRadarFeedItem =>
      Boolean(d && typeof d === 'object')
    );
    const spreads = (
      Array.isArray(json.data?.priceSpreadLeaders)
        ? json.data.priceSpreadLeaders
        : []
    ).filter((s): s is PriceSpreadFeedItem =>
      Boolean(s && typeof s === 'object')
    );
    if (deals.length === 0 && traps.length === 0 && spreads.length === 0)
      return;

    const uiLocale = t('langCode');
    const sections: string[] = [];
    if (deals.length > 0) {
      sections.push(`
        <div class="card-title"><span aria-hidden="true">🔥 </span>${escapeHtml(t('radarDealsTitle'))}</div>
        ${deals
          .slice(0, 4)
          .map(
            (d) => `
            <div class="offer-item">
              <div>
                <div class="offer-shop">
                  <a href="${resolveSafeApiRelativeUrl(settings.apiBaseUrl, d.productHref)}" target="_blank" rel="noopener noreferrer" style="color:#f3f4f6;text-decoration:none;">
                    ${contentTextHtml(stripLoneSurrogates(String(d.productName ?? '')))}
                  </a>
                </div>
                <div class="offer-meta">
                  ${escapeHtml(String(d.platform ?? '').toUpperCase())} (${contentTextHtml(stripLoneSurrogates(String(d.merchantName ?? '')))}) - ${escapeHtml(t('radarSavings', [formatVnd(d.savingsVsMedianVnd, uiLocale), formatSafeNumber(d.savingsVsMedianPct, { min: 0, max: 100 }, uiLocale)]))}
                </div>
              </div>
              <a href="${escapeSafeExternalHref(d.offerUrl)}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:#34d399;">
                ${formatVnd(d.priceCurrent, uiLocale)}
              </a>
            </div>
          `
          )
          .join('')}
      `);
    }
    if (spreads.length > 0) {
      sections.push(`
        <div class="card-title" style="color:#60a5fa;"><span aria-hidden="true">📊 </span>${escapeHtml(t('radarSpreadTitle'))}</div>
        ${spreads
          .slice(0, 2)
          .map(
            (s) => `
            <div class="offer-item">
              <div>
                <div class="offer-shop">${contentTextHtml(stripLoneSurrogates(String(s.productName ?? '')))}</div>
                <div class="offer-meta" style="color:#93c5fd;">
                  ${escapeHtml(t('radarSpreadVersus', [String(s.cheapestPlatform ?? '').toUpperCase(), formatVnd(s.minPrice, uiLocale), String(s.priciestPlatform ?? '').toUpperCase(), formatVnd(s.maxPrice, uiLocale)]))}
                </div>
              </div>
              <a href="${escapeSafeExternalHref(s.cheapestOfferUrl)}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:#60a5fa;">
                ${escapeHtml(t('radarSpreadAmount', [formatVnd(s.spreadVnd, uiLocale)]))}
              </a>
            </div>
          `
          )
          .join('')}
      `);
    }
    if (traps.length > 0) {
      sections.push(`
        <div class="card-title" style="color:#f87171;"><span aria-hidden="true">⚠️ </span>${escapeHtml(t('radarTrapsTitle'))}</div>
        ${traps
          .slice(0, 2)
          .map(
            (trap) => `
            <div class="offer-item">
              <div>
                <div class="offer-shop">${contentTextHtml(stripLoneSurrogates(String(trap.productName ?? '')))}</div>
                <div class="offer-meta" style="color:#fca5a5;">
                  ${escapeHtml(String(trap.platform ?? '').toUpperCase())} - ${escapeHtml(t('radarTrapMarkup', [formatSafeNumber(trap.fakeMarkupPct, { min: 0, max: 10000 }, uiLocale), formatVnd(trap.priceOriginal, uiLocale)]))}
                </div>
              </div>
              <span class="offer-price" style="color:#f87171;">${formatVnd(trap.priceCurrent, uiLocale)}</span>
            </div>
          `
          )
          .join('')}
      `);
    }

    slot.innerHTML = `
      <div class="card">
        ${sections
          .map((section, idx) =>
            idx === 0
              ? `<div>${section}</div>`
              : `<div style="margin-top:10px;padding-top:8px;border-top:1px solid #2a2f3a;">${section}</div>`
          )
          .join('')}
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
  /** Null when no DOSafe score is known (DOS/Rate#1465). */
  dosafe_risk_score: number | null;
  /** Null when the store has no analysed review (DOS/Rate#1258). */
  review_risk_score: number | null;
  /** Null for a store with neither a DOSafe score nor analysed reviews (DOS/Rate#1484). */
  risk_score: number | null;
  trust_score: number | null;
  product_count: number;
}

async function fetchAndRenderMerchantTrustDirectory(
  settings: ExtensionSettings,
  platform?: string
): Promise<void> {
  const slot = document.getElementById('merchant-trust-slot');
  if (!slot) return;
  const generationAtStart = panelLoadGeneration;
  slot.innerHTML = '';

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
    if (generationAtStart !== panelLoadGeneration) return;
    if (!json || json.ok === false) return;
    const allMerchants = (Array.isArray(json.data) ? json.data : []).filter(
      (m): m is MerchantTrustFeedItem => Boolean(m && typeof m === 'object')
    );
    if (allMerchants.length === 0) return;

    const sorted = [...allMerchants].sort((a, b) => {
      if (platform) {
        const aMatch =
          String(a.platform ?? '').toLowerCase() === platform.toLowerCase()
            ? 1
            : 0;
        const bMatch =
          String(b.platform ?? '').toLowerCase() === platform.toLowerCase()
            ? 1
            : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      // A store with no trust score sorts last (DOS/Rate#1484).
      return (
        (b.trust_score ?? -1) - (a.trust_score ?? -1) ||
        (Number(b.product_count) || 0) - (Number(a.product_count) || 0)
      );
    });

    const uiLocale = t('langCode');
    slot.innerHTML = `
      <div class="card">
        <div class="card-title"><span aria-hidden="true">🛡️ </span>${escapeHtml(t('merchantDirTitle', [formatSafeNumber(allMerchants.length, { min: 0 }, uiLocale)]))}</div>
        ${sorted
          .slice(0, 5)
          .map((m) => {
            const merchantSegment =
              cleanUrlSegment(m.slug, 200) || cleanUrlSegment(m.id, 200);
            const detailHref = resolveSafeApiRelativeUrl(
              settings.apiBaseUrl,
              merchantSegment
                ? `/merchants/${encodeSurrogateSafeUriComponent(merchantSegment)}`
                : '/merchants',
              '/merchants'
            );
            const trustColor =
              m.trust_score == null || !Number.isFinite(m.trust_score)
                ? '#9ca3af'
                : merchantTrustColor(m);
            return `
              <div class="offer-item">
                <div>
                  <div class="offer-shop">
                    <a href="${detailHref}" target="_blank" rel="noopener noreferrer" style="color:#f3f4f6;text-decoration:none;">
                      ${contentTextHtml(stripLoneSurrogates(String(m.name ?? '')))}
                    </a>
                    ${m.is_official ? officialBadgeHtml() : ''}
                  </div>
                  <div class="offer-meta">
                    ${escapeHtml(String(m.platform ?? '').toUpperCase())} (${escapeHtml(t('merchantProductCount', [formatSafeNumber(m.product_count, { min: 0 }, uiLocale)]))}) - ${escapeHtml(t('merchantScamRisk', [riskScoreText(m.dosafe_risk_score)]))} | ${escapeHtml(t('merchantReviewRisk', [riskScoreText(m.review_risk_score)]))}
                  </div>
                </div>
                <a href="${detailHref}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:${trustColor};">
                  ${escapeHtml(trustText(m.trust_score))}
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
            `<strong>${contentTextHtml(t('noProductStores'))}</strong>`,
            `<strong>${contentTextHtml(t('noProductLastStore'))}</strong>`,
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

  const uiLocale = t('langCode');
  const assessment = lookup.priceAssessment;
  // The verdict in the extension's language (DOS/Rate#1326).
  const verdict = verdictTexts(assessment);
  const master = lookup.masterProduct;
  const reviews = lookup.reviewSummary;
  const merchant = lookup.merchantProfile;

  const variantButtonsHtml = renderVariantPickerHtml(lookup, uiLocale);

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
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specScreen'))}</div><div class="stat-val" style="font-size: 13px;"${contentLangAttr(keySpecs.screen)}>${escapeHtml(keySpecs.screen)}</div></div>`
              : ''
          }
          ${
            keySpecs.chip
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specChip'))}</div><div class="stat-val" style="font-size: 13px;"${contentLangAttr(keySpecs.chip)}>${escapeHtml(keySpecs.chip)}</div></div>`
              : ''
          }
          ${
            keySpecs.camera
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specCamera'))}</div><div class="stat-val" style="font-size: 13px;"${contentLangAttr(keySpecs.camera)}>${escapeHtml(keySpecs.camera)}</div></div>`
              : ''
          }
          ${
            keySpecs.battery
              ? `<div class="stat-box"><div class="stat-label">${escapeHtml(t('specBattery'))}</div><div class="stat-val" style="font-size: 13px;"${contentLangAttr(keySpecs.battery)}>${escapeHtml(keySpecs.battery)}</div></div>`
              : ''
          }
        </div>
      </div>
    `
      : '';

  const offersList =
    lookup.allOffers.length > 0 ? lookup.allOffers : lookup.topCheaperOffers;

  const offersHtml = renderOffersCardHtml(offersList, uiLocale);

  const reviewHtml = renderReviewCardHtml(reviews, master, uiLocale);

  const merchantNoTrust =
    !merchant ||
    merchant.trust_score == null ||
    !Number.isFinite(merchant.trust_score);
  const merchantRiskHtml = merchant
    ? `
      <div class="card">
        <div class="card-title">${escapeHtml(t('merchantCardTitle'))}</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('merchantTrustScore'))}</div>
            <div class="stat-val" style="color: ${merchantNoTrust ? '#9ca3af' : merchantTrustColor(merchant)};">${escapeHtml(merchantNoTrust ? t('noDataYet') : `${formatSafeNumber(merchant.trust_score, { min: 0, max: 100 }, uiLocale)}/100`)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('merchantRiskPair'))}</div>
            <div class="stat-val">${escapeHtml(riskScoreText(merchant.dosafe_risk_score))} / ${escapeHtml(riskScoreText(merchant.review_risk_score))}</div>
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
            <div class="stat-val" style="color: #34d399;">${formatVnd(lookup.priceHistory.lowestEverPrice, uiLocale)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('historyHigh'))}</div>
            <div class="stat-val">${formatVnd(lookup.priceHistory.highestEverPrice, uiLocale)}</div>
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
            <div class="stat-val" style="color: #ff6b6b;">#${formatSafeNumber(overallBadge.rank, { min: 1 }, uiLocale)} / ${formatSafeNumber(overallBadge.totalInCategory, { min: 1 }, uiLocale)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">${escapeHtml(t('leaderboardScore'))}</div>
            <div class="stat-val" style="color: #34d399;">${formatSafeNumber(overallBadge.score10, { min: 0, max: 10, decimals: 1 }, uiLocale)} / 10</div>
          </div>
        </div>
        ${
          subBadges.length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
                ${subBadges
                  .map(
                    (sr) =>
                      `<span style="font-size: 13px;background:#181c24;border:1px solid #2a2f3a;color:#e5e7eb;padding:3px 7px;border-radius:6px;"><span aria-hidden="true">🏆 </span>#${formatSafeNumber(sr.rank, { min: 1 }, uiLocale)} ${escapeHtml(focusLabel(sr.criterion))} (${formatSafeNumber(sr.score10, { min: 0, max: 10, decimals: 1 }, uiLocale)})</span>`
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
  const rawInspectTarget =
    cleanUrlSegment(signal.canonicalUrl, 2048) ||
    cleanUrlSegment(master?.slug, 200) ||
    cleanUrlSegment(signal.title, 500);
  const inspectUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    rawInspectTarget
      ? `/inspect?q=${encodeSurrogateSafeUriComponent(rawInspectTarget)}`
      : '/inspect',
    '/inspect'
  );
  // Alerts are per size: an Item page with no stated size adds nothing until
  // a size is picked (DOS/Rate#1158).
  const sizeUnknown = Boolean(lookup.item) && !lookup.selectedVariant;
  const watchlistSlug = !sizeUnknown ? cleanUrlSegment(master?.slug, 200) : '';
  const watchlistUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    watchlistSlug
      ? `/watchlist?add=${encodeSurrogateSafeUriComponent(watchlistSlug)}`
      : '/watchlist',
    '/watchlist'
  );

  const radarSig = lookup.radarSignal;
  const radarSpreadPct = Number(radarSig?.spreadPct ?? 0);
  const radarPillHtml = radarSig
    ? radarSig.verdict === 'genuine_deal'
      ? // Only a 3+ offer floor is the multi-platform floor; fewer offers are
        // just below the median (DOS/Rate#1145).
        radarSig.genuineDeal?.verdict === 'genuine_all_time_low'
        ? `<span class="verdict-pill verdict-genuine_deal" style="margin-left:6px;"><span aria-hidden="true">🔥 </span>${escapeHtml(t('radarPillDeal', [formatSafeNumber(radarSig.savingsPct, { min: 0, max: 100 }, uiLocale)]))}</span>`
        : `<span class="verdict-pill verdict-genuine_deal" style="margin-left:6px;"><span aria-hidden="true">✅ </span>${escapeHtml(t('radarPillBelowMedian', [formatSafeNumber(radarSig.savingsPct, { min: 0, max: 100 }, uiLocale)]))}</span>`
      : radarSig.verdict === 'fake_sale_trap'
        ? `<span class="verdict-pill verdict-inflated_fake_sale" style="margin-left:6px;"><span aria-hidden="true">🚨 </span>${escapeHtml(t('radarPillTrap', [formatSafeNumber(radarSig.fakeMarkupPct, { min: 0, max: 10000 }, uiLocale)]))}</span>`
        : Number.isFinite(radarSpreadPct) && radarSpreadPct >= 5
          ? `<span class="verdict-pill" style="margin-left:6px;background:#1e293b;color:#38bdf8;border:1px solid #0284c7;"><span aria-hidden="true">📊 </span>${escapeHtml(t('radarPillSpread', [formatSafeNumber(radarSig.spreadPct, { min: 0, max: 10000 }, uiLocale)]))}</span>`
          : ''
    : '';

  // Each link once; with no rival the versus slot is simply absent
  // (DOS/Rate#1299).
  const actionLinks: PanelActionLink[] = [
    { href: detailUrl, label: t('linkDetail'), primary: true },
    { href: compareUrl, label: t('linkCompare') },
    { href: leaderboardUrl, icon: '🏆', label: t('linkLeaderboard') },
    ...(versusUrl
      ? [{ href: versusUrl, icon: '⚔️', label: t('linkVersus') }]
      : []),
    { href: inspectUrl, icon: '🔬', label: t('linkInspect') },
    { href: watchlistUrl, icon: '🔔', label: t('linkWatch') },
  ];

  root.innerHTML = `
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        <span class="verdict-pill verdict-${
          // A bait price warns in amber, as the badge and pill do (#1298).
          assessment.implausiblyLow
            ? 'implausibly_low'
            : sanitizeVerdictClassSuffix(assessment.verdict)
        }">${contentTextHtml(verdict.label)}</span>
        ${radarPillHtml}
      </div>
      <div class="product-name">${contentTextHtml((sizeUnknown ? lookup.item?.name : master?.name) || signal.title)}</div>
      <p style="color: #d1d5db; font-size: 13px;">${contentTextHtml(verdict.explanation)}</p>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">${escapeHtml(t('observedPrice'))}</div>
          <div class="stat-val">${formatVnd(assessment.observedPrice ?? signal.price, uiLocale)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">${escapeHtml(t('marketMedian'))}</div>
          <div class="stat-val">${formatVnd(assessment.marketMedianPrice, uiLocale)}</div>
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

const OPT_IN_CONSENT_VERSION = 2;

let panelLoadGeneration = 0;
let consentHydrated = false;
let apiBaseHydrated = false;
let sawRawConsentStorage = false;
let storedOptIn = false;
let storedConsentVersion = 0;
let lastConfirmedOptIn = false;
let consentMutationSeq = 0;
let optInOpCounter = 0;
let lastConfirmedOptInSeq = 0;
let optInSaveInFlight = 0;
let bufferedConsentUpdate: {
  hasOptIn: boolean;
  optIn: boolean;
  hasVersion: boolean;
  consentVersion: number;
} | null = null;

let lastConfirmedApiBaseUrl = DEFAULT_API_BASE_URL;
let lastLoadedPanelApiBaseUrl = DEFAULT_API_BASE_URL;
let apiBaseMutationSeq = 0;
let apiBaseOpCounter = 0;
let lastConfirmedApiBaseSeq = 0;
let apiBaseSaveInFlight = 0;

function isEffectiveConsentOptIn(): boolean {
  return storedOptIn && storedConsentVersion === OPT_IN_CONSENT_VERSION;
}

/**
 * A full lookup the service worker marks stale (a newer tab detection started
 * while it was in flight) is fetched again once when no newer panel load has
 * started: if that detection resolves to the same product it writes an
 * unchanged `lookup_tab_latest`, Chrome fires no `onChanged`, and nothing else
 * would reload the panel (DOS/Rate#1710). The retry is the reload that
 * `onChanged` would have made: no variant, so a variant picked on the old
 * product is never saved onto a newer one. One retry keeps two panels from
 * invalidating each other forever.
 */
const STALE_FULL_LOOKUP_RETRIES = 1;

async function loadSidePanel(
  selectedVariant?: string,
  staleRetriesLeft = STALE_FULL_LOOKUP_RETRIES
): Promise<void> {
  const root = document.getElementById('panel-root');
  const chkOptIn = document.getElementById(
    'chk-crowd-optin'
  ) as HTMLInputElement | null;
  const inpApiBase = document.getElementById(
    'inp-api-base'
  ) as HTMLInputElement | null;
  if (!root) return;
  const generation = ++panelLoadGeneration;
  const consentSeqAtStart = consentMutationSeq;
  const apiSeqAtStart = apiBaseMutationSeq;

  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'RATE_SIDEPANEL_FETCH_FULL',
      selectedVariant: selectedVariant ?? null,
    })) as {
      ok?: boolean;
      stale?: boolean;
      settings?: ExtensionSettings;
      signal?: ExtractedPageProductSignal | null;
      data?: ExtensionLookupData | null;
      status?: number | null;
      retryAfterSeconds?: number;
    };
    if (generation !== panelLoadGeneration) return;
    if (res?.stale) {
      if (staleRetriesLeft > 0) {
        void loadSidePanel(undefined, staleRetriesLeft - 1);
      }
      return;
    }

    const rawSettings = res?.settings;
    const settings: ExtensionSettings = {
      apiBaseUrl: normalizeAllowedApiBaseUrl(rawSettings?.apiBaseUrl),
      crowdContributeOptIn: rawSettings?.crowdContributeOptIn === true,
    };
    lastLoadedPanelApiBaseUrl = settings.apiBaseUrl;

    if (
      rawSettings &&
      consentMutationSeq === consentSeqAtStart &&
      optInSaveInFlight === 0
    ) {
      if (!sawRawConsentStorage) {
        storedOptIn = settings.crowdContributeOptIn;
        storedConsentVersion = 0;
        lastConfirmedOptIn = settings.crowdContributeOptIn;
        if (chkOptIn) {
          chkOptIn.checked = settings.crowdContributeOptIn;
        }
      } else if (consentHydrated) {
        lastConfirmedOptIn = isEffectiveConsentOptIn();
        if (chkOptIn) {
          chkOptIn.checked = lastConfirmedOptIn;
        }
      }
    } else if (
      !rawSettings &&
      chkOptIn &&
      optInSaveInFlight === 0 &&
      consentHydrated &&
      sawRawConsentStorage
    ) {
      chkOptIn.checked = isEffectiveConsentOptIn();
    }

    if (apiBaseMutationSeq === apiSeqAtStart && apiBaseSaveInFlight === 0) {
      if (
        typeof rawSettings?.apiBaseUrl === 'string' &&
        rawSettings.apiBaseUrl.trim()
      ) {
        lastConfirmedApiBaseUrl = settings.apiBaseUrl;
      }
      if (inpApiBase && !inpApiBase.value.trim()) {
        inpApiBase.value = lastConfirmedApiBaseUrl;
      }
    }

    if (res?.ok === false) {
      renderLookupError(
        root,
        res.status,
        res.signal?.title,
        () => {
          void loadSidePanel(selectedVariant);
        },
        res.retryAfterSeconds
      );
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
    if (generation !== panelLoadGeneration) return;
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
  retry: () => void,
  retryAfterSeconds?: number | null
): void {
  root.innerHTML = renderLookupErrorHtml(
    classifyLookupFailure(status),
    productTitle,
    retryAfterSeconds
  );
  root
    .querySelector<HTMLButtonElement>('[data-action="retry"]')
    ?.addEventListener('click', retry);
}

async function runQuickQuery(query: string): Promise<void> {
  const root = document.getElementById('panel-root');
  if (!root || !query.trim()) return;
  const generation = ++panelLoadGeneration;

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
      retryAfterSeconds?: number;
    };
    if (generation !== panelLoadGeneration) return;

    const rawSettings = res?.settings;
    const settings: ExtensionSettings = {
      apiBaseUrl: normalizeAllowedApiBaseUrl(rawSettings?.apiBaseUrl),
      crowdContributeOptIn: rawSettings?.crowdContributeOptIn === true,
    };

    if (res?.ok === false) {
      renderLookupError(
        root,
        res.status,
        res.signal?.title ?? query,
        () => {
          void runQuickQuery(query);
        },
        res.retryAfterSeconds
      );
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
    if (generation !== panelLoadGeneration) return;
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

  const hasLocalStorageGet =
    typeof chrome !== 'undefined' &&
    typeof chrome.storage?.local?.get === 'function';

  consentHydrated = !hasLocalStorageGet;
  apiBaseHydrated = !hasLocalStorageGet;
  sawRawConsentStorage = hasLocalStorageGet;
  storedOptIn = false;
  storedConsentVersion = 0;
  lastConfirmedOptIn = false;
  consentMutationSeq = 0;
  optInOpCounter = 0;
  lastConfirmedOptInSeq = 0;
  optInSaveInFlight = 0;
  bufferedConsentUpdate = null;

  lastConfirmedApiBaseUrl = inpApiBase?.value.trim()
    ? normalizeAllowedApiBaseUrl(inpApiBase.value)
    : DEFAULT_API_BASE_URL;
  lastLoadedPanelApiBaseUrl = lastConfirmedApiBaseUrl;
  apiBaseMutationSeq = 0;
  apiBaseOpCounter = 0;
  lastConfirmedApiBaseSeq = 0;
  apiBaseSaveInFlight = 0;
  if (chkOptIn) {
    chkOptIn.checked = false;
  }

  btnRefresh?.addEventListener('click', () => {
    void loadSidePanel();
  });

  formQuickInspect?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (inpQuickQuery?.value.trim()) {
      void runQuickQuery(inpQuickQuery.value.trim());
    }
  });

  const finishStorageHydration = (
    stored: Record<string, unknown> | undefined
  ) => {
    if (!consentHydrated) {
      const buffered = bufferedConsentUpdate;
      bufferedConsentUpdate = null;
      sawRawConsentStorage = true;
      const baseOptIn = stored?.crowdContributeOptIn === true;
      const baseVersion =
        typeof stored?.crowdConsentVersion === 'number'
          ? stored.crowdConsentVersion
          : 0;
      storedOptIn = buffered?.hasOptIn ? buffered.optIn : baseOptIn;
      storedConsentVersion = buffered?.hasVersion
        ? buffered.consentVersion
        : baseVersion;
      lastConfirmedOptIn = isEffectiveConsentOptIn();
      consentHydrated = true;
      if (optInSaveInFlight === 0 && chkOptIn) {
        chkOptIn.checked = lastConfirmedOptIn;
      }
    }

    if (!apiBaseHydrated) {
      apiBaseHydrated = true;
      if (
        apiBaseMutationSeq === 0 &&
        apiBaseSaveInFlight === 0 &&
        stored &&
        typeof stored.apiBaseUrl === 'string' &&
        stored.apiBaseUrl.trim()
      ) {
        const normalized = normalizeAllowedApiBaseUrl(stored.apiBaseUrl);
        lastConfirmedApiBaseUrl = normalized;
        if (inpApiBase && !inpApiBase.value.trim()) {
          inpApiBase.value = normalized;
        }
      }
    }
  };

  if (hasLocalStorageGet) {
    void Promise.resolve(
      chrome.storage.local.get([
        'crowdContributeOptIn',
        'crowdConsentVersion',
        'apiBaseUrl',
      ])
    )
      .then((stored) => {
        finishStorageHydration(stored);
      })
      .catch(() => {
        finishStorageHydration(undefined);
      });
  }

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'session') {
      if (changes.lookup_tab_latest) {
        void loadSidePanel();
      }
      return;
    }
    if (areaName !== 'local') return;

    if (Object.prototype.hasOwnProperty.call(changes, 'apiBaseUrl')) {
      const rawNewApiBase = changes.apiBaseUrl?.newValue;
      const nextApiBase = normalizeAllowedApiBaseUrl(
        typeof rawNewApiBase === 'string' ? rawNewApiBase : null
      );
      apiBaseHydrated = true;
      lastConfirmedApiBaseUrl = nextApiBase;
      if (apiBaseSaveInFlight === 0) {
        apiBaseMutationSeq += 1;
        if (inpApiBase) {
          inpApiBase.value = nextApiBase;
        }
      }
    }

    const hasOptIn = Object.prototype.hasOwnProperty.call(
      changes,
      'crowdContributeOptIn'
    );
    const hasVersion = Object.prototype.hasOwnProperty.call(
      changes,
      'crowdConsentVersion'
    );
    if (!hasOptIn && !hasVersion) return;

    consentMutationSeq += 1;
    sawRawConsentStorage = true;
    const nextOptInValue = changes.crowdContributeOptIn?.newValue === true;
    const nextVersionValue =
      typeof changes.crowdConsentVersion?.newValue === 'number'
        ? changes.crowdConsentVersion.newValue
        : 0;

    if (!consentHydrated) {
      if (hasOptIn && hasVersion) {
        consentHydrated = true;
        bufferedConsentUpdate = null;
        storedOptIn = nextOptInValue;
        storedConsentVersion = nextVersionValue;
        lastConfirmedOptIn = isEffectiveConsentOptIn();
        if (optInSaveInFlight === 0 && chkOptIn) {
          chkOptIn.checked = lastConfirmedOptIn;
        }
        return;
      }
      bufferedConsentUpdate = {
        hasOptIn: hasOptIn || Boolean(bufferedConsentUpdate?.hasOptIn),
        optIn: hasOptIn
          ? nextOptInValue
          : (bufferedConsentUpdate?.optIn ?? false),
        hasVersion: hasVersion || Boolean(bufferedConsentUpdate?.hasVersion),
        consentVersion: hasVersion
          ? nextVersionValue
          : (bufferedConsentUpdate?.consentVersion ?? 0),
      };
      if (
        (hasOptIn && !nextOptInValue) ||
        (hasVersion && nextVersionValue !== OPT_IN_CONSENT_VERSION)
      ) {
        lastConfirmedOptIn = false;
        if (optInSaveInFlight === 0 && chkOptIn) {
          chkOptIn.checked = false;
        }
      }
      return;
    }

    if (hasOptIn) {
      storedOptIn = nextOptInValue;
    }
    if (hasVersion) {
      storedConsentVersion = nextVersionValue;
    }
    lastConfirmedOptIn = isEffectiveConsentOptIn();
    if (optInSaveInFlight === 0 && chkOptIn) {
      chkOptIn.checked = lastConfirmedOptIn;
    }
  });

  chkOptIn?.addEventListener('change', async () => {
    const desired = Boolean(chkOptIn.checked);
    consentMutationSeq += 1;
    const opSeq = ++optInOpCounter;
    optInSaveInFlight += 1;
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'RATE_UPDATE_SETTINGS',
        crowdContributeOptIn: desired,
      })) as { ok?: boolean; settings?: ExtensionSettings } | undefined;
      if (
        !res ||
        res.ok === false ||
        typeof res.settings?.crowdContributeOptIn !== 'boolean' ||
        res.settings.crowdContributeOptIn !== desired
      ) {
        throw new Error('Settings update failed');
      }
      if (opSeq >= lastConfirmedOptInSeq) {
        lastConfirmedOptInSeq = opSeq;
        consentHydrated = true;
        bufferedConsentUpdate = null;
        sawRawConsentStorage = true;
        storedOptIn = desired;
        storedConsentVersion = desired ? OPT_IN_CONSENT_VERSION : 0;
        lastConfirmedOptIn = desired;
      }
    } catch {
      // Reconciled against latest confirmed state in finally once in-flight saves settle.
    } finally {
      optInSaveInFlight = Math.max(0, optInSaveInFlight - 1);
      if (optInSaveInFlight === 0 && chkOptIn) {
        chkOptIn.checked =
          sawRawConsentStorage && consentHydrated
            ? isEffectiveConsentOptIn()
            : lastConfirmedOptIn;
      }
    }
  });

  inpApiBase?.addEventListener('change', async () => {
    const rawInput = inpApiBase.value.trim();
    const requestedApiBase = rawInput || DEFAULT_API_BASE_URL;
    apiBaseMutationSeq += 1;
    const opSeq = ++apiBaseOpCounter;
    apiBaseSaveInFlight += 1;
    let succeeded = false;
    if (!rawInput) {
      inpApiBase.value = DEFAULT_API_BASE_URL;
    }
    try {
      const updated = (await chrome.runtime.sendMessage({
        type: 'RATE_UPDATE_SETTINGS',
        apiBaseUrl: requestedApiBase,
      })) as { ok?: boolean; settings?: ExtensionSettings } | undefined;
      if (
        !updated ||
        updated.ok === false ||
        typeof updated.settings?.apiBaseUrl !== 'string' ||
        !updated.settings.apiBaseUrl.trim()
      ) {
        throw new Error('API base URL update failed');
      }
      const savedApiBase = normalizeAllowedApiBaseUrl(
        updated.settings.apiBaseUrl
      );
      succeeded = true;
      apiBaseHydrated = true;
      if (opSeq >= lastConfirmedApiBaseSeq) {
        lastConfirmedApiBaseSeq = opSeq;
        lastConfirmedApiBaseUrl = savedApiBase;
      }
    } catch {
      // Reconciled against lastConfirmedApiBaseUrl in finally once in-flight saves settle.
    } finally {
      apiBaseSaveInFlight = Math.max(0, apiBaseSaveInFlight - 1);
      if (apiBaseSaveInFlight === 0) {
        if (inpApiBase) {
          inpApiBase.value = lastConfirmedApiBaseUrl;
        }
        if (
          succeeded ||
          lastConfirmedApiBaseUrl !== lastLoadedPanelApiBaseUrl
        ) {
          void loadSidePanel();
        }
      }
    }
  });

  void loadSidePanel();
});
