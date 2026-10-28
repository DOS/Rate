import { extractProductSignalFromDom } from '../extractors/ecommerce-detector.js';
import {
  formatSafeExtensionVnd,
  formatSafeNumber,
  normalizeFiveStarRating,
  shouldRenderTrustPill,
} from '../security-guards.js';
import type { ExtensionLookupData } from '../types.js';
import { buildPillAriaLabel, resolvePillTheme } from '../verdict-display.js';

const HOST_ID = 'rate-vn-trust-pill-host';

function removeTrustPillHost(): void {
  const existing = document.getElementById(HOST_ID);
  if (existing) existing.remove();
}

function formatCurrencyVnd(amount: number | null | undefined): string {
  return formatSafeExtensionVnd(amount, 'Đang cập nhật');
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render an isolated Shadow DOM Floating Trust Pill on supported e-commerce pages.
 * Zero host CSS pollution; clicking opens the Chrome Native Side Panel.
 */
function renderShadowTrustPill(lookup: ExtensionLookupData): void {
  if (!shouldRenderTrustPill(lookup)) {
    removeTrustPillHost();
    return;
  }

  requestAnimationFrame(() => {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      document.body.appendChild(host);
    }

    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const assessment = lookup.priceAssessment;
    // A bait price uses the warning theme, not the neutral one (#1298).
    const theme = resolvePillTheme(
      assessment.verdict,
      assessment.implausiblyLow
    );

    const rawRating =
      lookup.masterProduct?.user_rating_weighted ||
      lookup.masterProduct?.average_rating ||
      null;
    const trustedRating = normalizeFiveStarRating(rawRating);
    // No share of genuine reviews when none was analysed (#1301).
    const authenticRatio =
      (lookup.reviewSummary?.total_analyzed ?? 0) > 0
        ? (lookup.reviewSummary?.authentic_pct ?? null)
        : null;

    const cheaperSummary =
      assessment.cheaperOfferCount > 0 && assessment.maxSavingsAmount > 0
        ? `Rẻ hơn tại ${formatSafeNumber(assessment.cheaperOfferCount, { min: 1 })} nơi (-${formatCurrencyVnd(assessment.maxSavingsAmount)})`
        : assessment.marketMinPrice
          ? `Đáy thị trường: ${formatCurrencyVnd(assessment.marketMinPrice)}`
          : 'Bấm để xem lịch sử giá & lọc review ảo';
    const radarSig = lookup.radarSignal;
    const radarSpreadPct = Number(radarSig?.spreadPct ?? 0);
    const radarChipHtml = radarSig
      ? radarSig.verdict === 'genuine_deal'
        ? `<span class="radar-chip radar-deal">🔥 Đáy đa sàn (-${formatSafeNumber(radarSig.savingsPct, { min: 0, max: 100 })}%)</span>`
        : radarSig.verdict === 'fake_sale_trap'
          ? `<span class="radar-chip radar-trap">🚨 Bẫy Sale (+${formatSafeNumber(radarSig.fakeMarkupPct, { min: 0, max: 10000 })}%)</span>`
          : Number.isFinite(radarSpreadPct) && radarSpreadPct >= 5
            ? `<span class="radar-chip radar-spread">📊 Lệch ${formatSafeNumber(radarSig.spreadPct, { min: 0, max: 10000 })}%</span>`
            : ''
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
      <div class="pill-card" id="rate-pill-trigger" role="button" tabindex="0" aria-label="${escapeHtml(buildPillAriaLabel(assessment.badgeLabel, cheaperSummary))}">
        <span class="brand-dot"></span>
        <div class="content">
          <div class="top-row">
            <span>Rate.vn</span>
            <span class="verdict-badge">${escapeHtml(assessment.badgeLabel)}</span>
            ${radarChipHtml}
            ${
              trustedRating
                ? `<span class="rating-tag">★ ${formatSafeNumber(trustedRating, { min: 0, max: 5, decimals: 1 })}${authenticRatio == null ? '' : ` (${formatSafeNumber(authenticRatio, { min: 0, max: 100 })}% thật)`}</span>`
                : ''
            }
          </div>
          <div class="sub-row">${escapeHtml(cheaperSummary)}</div>
        </div>
        <span class="cta-btn" aria-hidden="true">Chi tiết</span>
      </div>
    `;

    const trigger = shadow.getElementById('rate-pill-trigger');
    if (trigger) {
      const openSidePanel = () => {
        void chrome.runtime.sendMessage({ type: 'RATE_OPEN_SIDE_PANEL' });
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

let lastProcessedSignature = '';

async function inspectCurrentPage(): Promise<void> {
  requestAnimationFrame(async () => {
    const signal = extractProductSignalFromDom(document, window.location.href);
    if (!signal) {
      lastProcessedSignature = '';
      removeTrustPillHost();
      return;
    }

    const signature = `${signal.canonicalUrl}|${signal.selectedVariant || ''}|${signal.price || ''}`;
    if (signature === lastProcessedSignature) return;
    lastProcessedSignature = signature;

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'RATE_PRODUCT_DETECTED',
        signal,
      })) as { ok?: boolean; data?: ExtensionLookupData | null };

      if (response?.ok && response.data) {
        renderShadowTrustPill(response.data);
      } else {
        // Nothing matched or the lookup failed: never leave the previous
        // product's pill on a single-page shop (DOS/Rate#1300).
        removeTrustPillHost();
      }
    } catch {
      // Messaging failed (page unloading, worker restarting): drop the pill
      // rather than show a stale one (DOS/Rate#1300).
      removeTrustPillHost();
    }
  });
}

// Initial inspection + lightweight observation for SPA route/variant selection changes
void inspectCurrentPage();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void inspectCurrentPage();
  }, 700);
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
