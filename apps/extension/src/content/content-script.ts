import {
  extractProductSignalFromDom,
  sanitizeProductUrl,
} from '../extractors/ecommerce-detector.js';
import {
  buildCartItemsSignature,
  extractCartLineItems,
  isCheckoutOrCartUrl,
  sanitizeRateComparisonUrl,
} from '../extractors/checkout-detector.js';
import {
  buildProductSignalSignature,
  formatSafeExtensionVnd,
  formatSafeNumber,
  MAX_VALID_EXTENSION_VND_PRICE,
  resolveExtensionMasterRating,
  shouldRenderTrustPill,
  stripLoneSurrogates,
} from '../security-guards.js';
import { escapeHtml, isForeignVietnamese, t } from '../i18n.js';
import type {
  CheckoutPriceTrapWarning,
  ExtensionLookupData,
} from '../types.js';
import { RateLimitRetry } from '../rate-limit.js';
import {
  buildPillAriaLabel,
  resolvePillTheme,
  verdictTexts,
} from '../verdict-display.js';

const HOST_ID = 'rate-vn-trust-pill-host';
const CHECKOUT_GUARD_HOST_ID = 'rate-vn-checkout-guard-host';

function removeTrustPillHost(): void {
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();
}

function removeCheckoutGuardHost(): void {
  const existing = document.getElementById(CHECKOUT_GUARD_HOST_ID);
  if (existing) existing.remove();
}

function isValidPillVndPrice(amount: unknown): amount is number {
  return (
    typeof amount === 'number' &&
    Number.isFinite(amount) &&
    Math.round(amount) > 0 &&
    amount <= MAX_VALID_EXTENSION_VND_PRICE
  );
}

function formatCurrencyVnd(
  amount: number | null | undefined,
  locale = t('langCode')
): string {
  return formatSafeExtensionVnd(amount, t('priceUpdating'), locale);
}

/**
 * Render an isolated Shadow DOM Floating Trust Pill on supported e-commerce pages.
 * Zero host CSS pollution; clicking opens the Chrome Native Side Panel.
 */
function renderShadowTrustPill(
  lookup: ExtensionLookupData,
  expectedGeneration = detectGeneration,
  expectedCanonicalUrl?: string
): void {
  if (!shouldRenderTrustPill(lookup)) {
    removeTrustPillHost();
    return;
  }

  requestAnimationFrame(() => {
    if (expectedGeneration !== detectGeneration) {
      return;
    }
    if (
      expectedCanonicalUrl &&
      sanitizeProductUrl(window.location.href) !== expectedCanonicalUrl
    ) {
      void inspectCurrentPage();
      return;
    }
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      document.body.appendChild(host);
    }

    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const uiLocale = t('langCode');
    const assessment = lookup.priceAssessment;
    // The verdict in the extension's language (DOS/Rate#1326).
    const verdict = verdictTexts(assessment);
    // A bait price uses the warning theme, not the neutral one (#1298).
    const theme = resolvePillTheme(
      assessment.verdict,
      assessment.implausiblyLow
    );

    const trustedRating = resolveExtensionMasterRating(lookup.masterProduct);
    // No share of genuine reviews when none was analysed (#1301).
    const authenticRatio =
      (lookup.reviewSummary?.total_analyzed ?? 0) > 0
        ? (lookup.reviewSummary?.authentic_pct ?? null)
        : null;

    const hasCheaperOffers =
      typeof assessment.cheaperOfferCount === 'number' &&
      Number.isFinite(assessment.cheaperOfferCount) &&
      assessment.cheaperOfferCount > 0;
    const cheaperSummary =
      hasCheaperOffers && isValidPillVndPrice(assessment.maxSavingsAmount)
        ? t('pillCheaperAt', [
            formatSafeNumber(
              assessment.cheaperOfferCount,
              { min: 1 },
              uiLocale
            ),
            formatCurrencyVnd(assessment.maxSavingsAmount, uiLocale),
          ])
        : isValidPillVndPrice(assessment.marketMinPrice)
          ? t('pillMarketLow', [
              formatCurrencyVnd(assessment.marketMinPrice, uiLocale),
            ])
          : t('pillPrompt');
    const radarSig = lookup.radarSignal;
    const radarSpreadPct = Number(radarSig?.spreadPct ?? 0);
    const radarBadge = radarSig
      ? radarSig.verdict === 'genuine_deal'
        ? // Only a 3+ offer floor is the multi-platform floor; fewer offers
          // are just below the median (DOS/Rate#1145).
          radarSig.genuineDeal?.verdict === 'genuine_all_time_low'
          ? {
              cls: 'radar-deal',
              icon: '🔥',
              text: t('pillRadarDeal', [
                formatSafeNumber(
                  radarSig.savingsPct,
                  { min: 0, max: 100 },
                  uiLocale
                ),
              ]),
            }
          : {
              cls: 'radar-deal',
              icon: '✅',
              text: t('pillRadarBelowMedian', [
                formatSafeNumber(
                  radarSig.savingsPct,
                  { min: 0, max: 100 },
                  uiLocale
                ),
              ]),
            }
        : radarSig.verdict === 'fake_sale_trap'
          ? {
              cls: 'radar-trap',
              icon: '🚨',
              text: t('pillRadarTrap', [
                formatSafeNumber(
                  radarSig.fakeMarkupPct,
                  {
                    min: 0,
                    max: 10000,
                  },
                  uiLocale
                ),
              ]),
            }
          : Number.isFinite(radarSpreadPct) && radarSpreadPct >= 5
            ? {
                cls: 'radar-spread',
                icon: '📊',
                text: t('pillRadarSpread', [
                  formatSafeNumber(
                    radarSig.spreadPct,
                    { min: 0, max: 10000 },
                    uiLocale
                  ),
                ]),
              }
            : null
      : null;
    const radarChipHtml = radarBadge
      ? `<span class="radar-chip ${radarBadge.cls}"><span aria-hidden="true">${radarBadge.icon} </span>${escapeHtml(radarBadge.text)}</span>`
      : '';
    const ratingText = trustedRating
      ? `${formatSafeNumber(trustedRating, { min: 0, max: 5, decimals: 1 }, uiLocale)}${authenticRatio == null ? '' : ` ${t('pillAuthentic', [formatSafeNumber(authenticRatio, { min: 0, max: 100 }, uiLocale)])}`}`
      : '';

    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          right: 20px;
          bottom: 24px;
          z-index: 2147483646;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .pill-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #12151a;
          color: #f3f4f6;
          border: 1.5px solid ${theme.border};
          border-radius: 999px;
          padding: 10px 16px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
          cursor: pointer;
          transition: transform 0.16s ease, box-shadow 0.16s ease;
          max-width: 480px;
        }
        .pill-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 38px rgba(0, 0, 0, 0.7);
        }
        .brand-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: ${theme.dot};
          box-shadow: 0 0 10px ${theme.dot};
          flex-shrink: 0;
        }
        .content {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .top-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px 8px;
          font-size: 13px;
          font-weight: 700;
        }
        .verdict-badge {
          background: ${theme.bg};
          color: #ffffff;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 13px;
        }
        .radar-chip {
          padding: 2px 7px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
        }
        .radar-deal {
          background: rgba(45, 186, 105, 0.2);
          color: #34d399;
        }
        .radar-trap {
          background: rgba(216, 48, 48, 0.2);
          color: #fca5a5;
        }
        .radar-spread {
          background: rgba(56, 189, 248, 0.18);
          color: #38bdf8;
        }
        .rating-tag {
          color: #fbbf24;
          font-size: 13px;
          font-weight: 700;
        }
        .sub-row {
          font-size: 13px;
          color: #9ca3af;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cta-btn {
          background: #d83030;
          color: #ffffff;
          border: none;
          border-radius: 999px;
          padding: 6px 11px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
        }
      </style>
      <div class="pill-card" id="rate-pill-trigger" role="button" tabindex="0" aria-label="${escapeHtml(buildPillAriaLabel(verdict.label, cheaperSummary, [radarBadge?.text, ratingText]))}">
        <span class="brand-dot" aria-hidden="true"></span>
        <div class="content">
          <div class="top-row">
            <span>Rate.vn</span>
            <span class="verdict-badge">${escapeHtml(verdict.label)}</span>
            ${radarChipHtml}
            ${
              ratingText
                ? `<span class="rating-tag"><span aria-hidden="true">★ </span>${escapeHtml(ratingText)}</span>`
                : ''
            }
          </div>
          <div class="sub-row">${escapeHtml(cheaperSummary)}</div>
        </div>
        <span class="cta-btn" aria-hidden="true">${escapeHtml(t('pillDetails'))}</span>
      </div>
    `;

    const trigger = shadow.getElementById('rate-pill-trigger');
    if (trigger) {
      const openSidePanel = () => {
        sendRuntimeMessageFireAndForget({ type: 'RATE_OPEN_SIDE_PANEL' });
      };
      trigger.addEventListener('click', openSidePanel);
      trigger.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openSidePanel();
        }
      });
    }
  });
}

function sendRuntimeMessageFireAndForget(
  payload: Record<string, unknown>
): void {
  try {
    void Promise.resolve(chrome.runtime.sendMessage(payload)).catch(() => {
      // Ignore messaging rejections during page unload or worker restart
    });
  } catch {
    // Ignore synchronous messaging errors if extension context was invalidated
  }
}

// Lookups sent from this page, so a late answer for an earlier product is
// ignored (DOS/Rate#1300, #1809).
let detectGeneration = 0;
let lastProcessedSignature = '';
let hasDetectedProduct = false;
let prerenderListenerAttached = false;
let checkoutGeneration = 0;
let lastCheckoutSignature = '';
let dismissedCheckoutSignature = '';
let localCheckoutGuardEnabled = true;
// After a rate limit the same product is looked up again once the wait is over
// (DOS/Rate#1466).
const rateLimitRetry = new RateLimitRetry();

const CHECKOUT_GUARD_STYLES = `
  :host {
    all: initial;
    position: fixed;
    right: 20px;
    bottom: 24px;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .guard-card {
    background: #12151a;
    color: #f3f4f6;
    border: 1.5px solid #d83030;
    border-radius: 14px;
    padding: 12px 14px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.62);
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .guard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .guard-brand-wrap {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .brand-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ff2e29;
    box-shadow: 0 0 9px #ff2e29;
    flex-shrink: 0;
  }
  .guard-brand {
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
  }
  .guard-badge {
    background: rgba(216, 48, 48, 0.22);
    color: #fca5a5;
    border: 1px solid rgba(216, 48, 48, 0.45);
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 700;
  }
  .dismiss-btn {
    background: #1c2027;
    color: #d1d5db;
    border: 1px solid #2a2f3a;
    border-radius: 8px;
    padding: 4px 9px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }
  .dismiss-btn:hover {
    color: #ffffff;
    border-color: #4b5563;
  }
  .guard-item {
    border-top: 1px solid #232833;
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .guard-item-title {
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.35;
  }
  .guard-item-body {
    font-size: 12.5px;
    color: #d1d5db;
    line-height: 1.45;
  }
  .guard-cta-link {
    align-self: flex-start;
    margin-top: 2px;
    background: #d83030;
    color: #ffffff;
    text-decoration: none;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12.5px;
    font-weight: 700;
  }
`;

function clearShadowChildren(shadow: ShadowRoot): void {
  const candidate = shadow as ShadowRoot & {
    replaceChildren?: () => void;
    firstChild?: ChildNode | null;
    removeChild?: (child: ChildNode) => ChildNode;
  };
  if (typeof candidate.replaceChildren === 'function') {
    candidate.replaceChildren();
    return;
  }
  while (candidate.firstChild && typeof candidate.removeChild === 'function') {
    candidate.removeChild(candidate.firstChild);
  }
}

/**
 * Renders an accessible, Shadow-DOM-isolated, dismissible checkout warning banner
 * built strictly with safe DOM APIs (`createElement` + `textContent`) and a
 * strict `https://rate.vn` comparison URL guard.
 */
function renderShadowCheckoutGuardBanner(
  warnings: readonly CheckoutPriceTrapWarning[],
  expectedGeneration: number,
  expectedSignature: string
): void {
  if (!warnings || warnings.length === 0 || !localCheckoutGuardEnabled) {
    removeCheckoutGuardHost();
    return;
  }

  requestAnimationFrame(() => {
    if (
      expectedGeneration !== checkoutGeneration ||
      !localCheckoutGuardEnabled ||
      dismissedCheckoutSignature === expectedSignature ||
      !isCheckoutOrCartUrl(window.location.href)
    ) {
      return;
    }

    let host = document.getElementById(CHECKOUT_GUARD_HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = CHECKOUT_GUARD_HOST_ID;
      document.body.appendChild(host);
    }

    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    clearShadowChildren(shadow);

    const styleEl = document.createElement('style');
    styleEl.textContent = CHECKOUT_GUARD_STYLES;
    shadow.appendChild(styleEl);

    const uiLocale = t('langCode');
    const card = document.createElement('div');
    card.className = 'guard-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', t('checkoutGuardRegionAria'));

    const dismiss = () => {
      dismissedCheckoutSignature = expectedSignature;
      removeCheckoutGuardHost();
    };
    if (typeof card.addEventListener === 'function') {
      card.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          dismiss();
        }
      });
    }

    const header = document.createElement('div');
    header.className = 'guard-header';

    const brandWrap = document.createElement('div');
    brandWrap.className = 'guard-brand-wrap';

    const dot = document.createElement('span');
    dot.className = 'brand-dot';
    dot.setAttribute('aria-hidden', 'true');
    brandWrap.appendChild(dot);

    const brand = document.createElement('span');
    brand.className = 'guard-brand';
    brand.textContent = 'Rate.vn';
    brandWrap.appendChild(brand);

    const badge = document.createElement('span');
    badge.className = 'guard-badge';
    badge.textContent = t('checkoutGuardTitle');
    brandWrap.appendChild(badge);

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.id = 'rate-checkout-guard-dismiss';
    dismissBtn.className = 'dismiss-btn';
    dismissBtn.textContent = t('checkoutGuardDismiss');
    if (typeof dismissBtn.addEventListener === 'function') {
      dismissBtn.addEventListener('click', dismiss);
    }

    header.appendChild(brandWrap);
    header.appendChild(dismissBtn);
    card.appendChild(header);

    for (const warning of warnings.slice(0, 3)) {
      const row = document.createElement('div');
      row.className = 'guard-item';

      const titleEl = document.createElement('div');
      titleEl.className = 'guard-item-title';
      const cleanTitle = stripLoneSurrogates(
        String(warning.itemTitle ?? '')
      ).trim();
      titleEl.textContent = cleanTitle;
      if (isForeignVietnamese(cleanTitle)) {
        titleEl.setAttribute('lang', 'vi');
      }
      row.appendChild(titleEl);

      const bodyEl = document.createElement('div');
      bodyEl.className = 'guard-item-body';
      if (warning.reason === 'cheaper_official') {
        const storeLabel =
          stripLoneSurrogates(
            String(
              warning.cheaperMerchantName ||
                warning.cheaperPlatform ||
                'Rate.vn'
            )
          ).trim() || 'Rate.vn';
        bodyEl.textContent = t('checkoutGuardCheaperOfficial', [
          storeLabel,
          formatCurrencyVnd(warning.savingsVnd, uiLocale),
          formatSafeNumber(
            warning.savingsPct,
            { min: 1, max: 99, decimals: 1 },
            uiLocale
          ),
        ]);
      } else {
        bodyEl.textContent = t('checkoutGuardMarkupTrap', [
          formatSafeNumber(
            warning.markupPct,
            { min: 1, max: 10000, decimals: 1 },
            uiLocale
          ),
          formatCurrencyVnd(warning.referencePriceVnd, uiLocale),
        ]);
      }
      row.appendChild(bodyEl);

      const linkEl = document.createElement('a');
      linkEl.className = 'guard-cta-link';
      linkEl.href = sanitizeRateComparisonUrl(warning.comparisonUrl, {
        strictProdHttpsOnly: true,
      });
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = t('checkoutGuardCompareCta');
      row.appendChild(linkEl);

      card.appendChild(row);
    }

    shadow.appendChild(card);
  });
}

async function inspectCheckoutCartPage(currentUrl: string): Promise<void> {
  const items = extractCartLineItems(document, currentUrl);
  if (items.length === 0) {
    ++checkoutGeneration;
    lastCheckoutSignature = '';
    removeCheckoutGuardHost();
    return;
  }

  if (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage?.local?.get === 'function'
  ) {
    try {
      const stored = await chrome.storage.local.get('checkoutGuardEnabled');
      localCheckoutGuardEnabled = stored?.checkoutGuardEnabled !== false;
    } catch {
      // Fall through to service worker settings check
    }
  }

  if (!localCheckoutGuardEnabled) {
    ++checkoutGeneration;
    lastCheckoutSignature = '';
    removeCheckoutGuardHost();
    return;
  }

  const signature = buildCartItemsSignature(currentUrl, items);
  if (
    signature === dismissedCheckoutSignature ||
    signature === lastCheckoutSignature
  ) {
    return;
  }

  lastCheckoutSignature = signature;
  rateLimitRetry.track(signature);
  const generation = ++checkoutGeneration;

  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'RATE_CHECKOUT_GUARD_LOOKUP',
      pageUrl: currentUrl,
      items,
    })) as {
      ok?: boolean;
      enabled?: boolean;
      stale?: boolean;
      status?: number | null;
      retryAfterSeconds?: number;
      warnings?: CheckoutPriceTrapWarning[];
    };

    if (generation !== checkoutGeneration || response?.stale === true) return;
    if (!isCheckoutOrCartUrl(window.location.href)) {
      removeCheckoutGuardHost();
      return;
    }
    if (response?.enabled === false) {
      localCheckoutGuardEnabled = false;
      lastCheckoutSignature = '';
      removeCheckoutGuardHost();
      return;
    }
    if (response?.ok === false) {
      if (response.status === 429) {
        rateLimitRetry.after(signature, response, () => {
          lastCheckoutSignature = '';
          void inspectCurrentPage();
        });
      } else {
        lastCheckoutSignature = '';
      }
      removeCheckoutGuardHost();
      return;
    }
    if (
      response?.ok &&
      Array.isArray(response.warnings) &&
      response.warnings.length > 0
    ) {
      renderShadowCheckoutGuardBanner(response.warnings, generation, signature);
    } else {
      removeCheckoutGuardHost();
    }
  } catch {
    if (generation === checkoutGeneration) {
      lastCheckoutSignature = '';
      removeCheckoutGuardHost();
    }
  }
}

function deferWhilePrerendering(): boolean {
  const prerenderingDoc = document as Document & {
    prerendering?: boolean;
    addEventListener?: (
      type: string,
      listener: () => void,
      options?: { once?: boolean }
    ) => void;
  };
  if (prerenderingDoc.prerendering !== true) {
    return false;
  }
  if (
    !prerenderListenerAttached &&
    typeof prerenderingDoc.addEventListener === 'function'
  ) {
    prerenderListenerAttached = true;
    prerenderingDoc.addEventListener(
      'prerenderingchange',
      () => {
        prerenderListenerAttached = false;
        void inspectCurrentPage();
      },
      { once: true }
    );
  }
  return true;
}

async function inspectCurrentPage(): Promise<void> {
  if (deferWhilePrerendering()) return;
  requestAnimationFrame(async () => {
    if (deferWhilePrerendering()) return;
    const currentUrl = window.location.href;
    const isCheckoutRoute = isCheckoutOrCartUrl(currentUrl);
    const signal = isCheckoutRoute
      ? null
      : extractProductSignalFromDom(document, currentUrl);
    if (!signal) {
      ++detectGeneration;
      const shouldNotifyCleared = hasDetectedProduct;
      hasDetectedProduct = false;
      lastProcessedSignature = '';
      rateLimitRetry.track('');
      removeTrustPillHost();
      if (shouldNotifyCleared) {
        sendRuntimeMessageFireAndForget({ type: 'RATE_PRODUCT_CLEARED' });
      }
      if (isCheckoutRoute) {
        await inspectCheckoutCartPage(currentUrl);
      } else {
        ++checkoutGeneration;
        lastCheckoutSignature = '';
        removeCheckoutGuardHost();
      }
      return;
    }

    ++checkoutGeneration;
    lastCheckoutSignature = '';
    removeCheckoutGuardHost();

    const signature = buildProductSignalSignature(signal);
    if (signature === lastProcessedSignature) return;
    lastProcessedSignature = signature;
    hasDetectedProduct = true;
    rateLimitRetry.track(signature);
    // Only the latest page's answer may draw or clear the pill: on a
    // single-page shop an earlier lookup can answer after a later one.
    const generation = ++detectGeneration;

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'RATE_PRODUCT_DETECTED',
        signal,
      })) as {
        ok?: boolean;
        stale?: boolean;
        data?: ExtensionLookupData | null;
        status?: number | null;
        retryAfterSeconds?: number;
      };

      if (generation !== detectGeneration || response?.stale === true) return;
      if (sanitizeProductUrl(window.location.href) !== signal.canonicalUrl) {
        void inspectCurrentPage();
        return;
      }
      if (response?.ok === false && response.status === undefined) {
        lastProcessedSignature = '';
        hasDetectedProduct = false;
        removeTrustPillHost();
        return;
      }
      rateLimitRetry.after(signature, response, () => {
        lastProcessedSignature = '';
        void inspectCurrentPage();
      });
      if (response?.ok && response.data) {
        renderShadowTrustPill(response.data, generation, signal.canonicalUrl);
      } else {
        // Nothing matched or the lookup failed: never leave the previous
        // product's pill on a single-page shop (DOS/Rate#1300).
        removeTrustPillHost();
      }
    } catch {
      // Messaging failed (page unloading, worker restarting): drop the pill
      // rather than show a stale one (DOS/Rate#1300).
      if (generation === detectGeneration) removeTrustPillHost();
    }
  });
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleImmediateInspection(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void inspectCurrentPage();
}

// Initial inspection + lightweight observation for SPA route/variant selection changes
void inspectCurrentPage();

if (typeof window !== 'undefined') {
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', scheduleImmediateInspection);
    window.addEventListener('hashchange', scheduleImmediateInspection);
  }
  const nav = (
    window as Window & {
      navigation?: {
        addEventListener?: (type: string, listener: () => void) => void;
      };
    }
  ).navigation;
  if (nav && typeof nav.addEventListener === 'function') {
    nav.addEventListener('currententrychange', scheduleImmediateInspection);
  }
}

const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void inspectCurrentPage();
  }, 700);
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

if (typeof chrome !== 'undefined') {
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (
      !Object.prototype.hasOwnProperty.call(changes, 'checkoutGuardEnabled')
    ) {
      return;
    }
    const enabled = changes.checkoutGuardEnabled?.newValue !== false;
    localCheckoutGuardEnabled = enabled;
    if (!enabled) {
      ++checkoutGeneration;
      lastCheckoutSignature = '';
      removeCheckoutGuardHost();
    } else if (isCheckoutOrCartUrl(window.location.href)) {
      lastCheckoutSignature = '';
      dismissedCheckoutSignature = '';
      void inspectCurrentPage();
    }
  });
}
