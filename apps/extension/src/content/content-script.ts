import { extractProductSignalFromDom } from '../extractors/ecommerce-detector.js';
import type { ExtensionLookupData } from '../types.js';

const HOST_ID = 'rate-vn-trust-pill-host';

function formatCurrencyVnd(amount: number | null | undefined): string {
  if (!amount || amount <= 0) return 'Đang cập nhật';
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getVerdictTheme(verdict: string): {
  bg: string;
  border: string;
  dot: string;
} {
  switch (verdict) {
    case 'inflated_fake_sale':
      return {
        bg: 'rgba(216, 48, 48, 0.16)',
        border: '#d83030',
        dot: '#d83030',
      };
    case 'genuine_deal':
      return {
        bg: 'rgba(45, 186, 105, 0.16)',
        border: '#2dba69',
        dot: '#2dba69',
      };
    case 'above_market':
      return {
        bg: 'rgba(245, 158, 11, 0.16)',
        border: '#f59e0b',
        dot: '#f59e0b',
      };
    default:
      return {
        bg: 'rgba(59, 130, 246, 0.16)',
        border: '#3b82f6',
        dot: '#3b82f6',
      };
  }
}

/**
 * Render an isolated Shadow DOM Floating Trust Pill on supported e-commerce pages.
 * Zero host CSS pollution; clicking opens the Chrome Native Side Panel.
 */
function renderShadowTrustPill(lookup: ExtensionLookupData): void {
  if (lookup.isAccessoryOrPart || lookup.matchStatus === 'accessory_skip') {
    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();
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
    const theme = getVerdictTheme(assessment.verdict);

    const trustedRating =
      lookup.masterProduct?.user_rating_weighted ||
      lookup.masterProduct?.average_rating ||
      null;
    const authenticRatio = lookup.reviewSummary?.authentic_pct ?? null;

    const cheaperSummary =
      assessment.cheaperOfferCount > 0 && assessment.maxSavingsAmount > 0
        ? `Rẻ hơn tại ${assessment.cheaperOfferCount} nơi (-${formatCurrencyVnd(assessment.maxSavingsAmount)})`
        : assessment.marketMinPrice
          ? `Đáy thị trường: ${formatCurrencyVnd(assessment.marketMinPrice)}`
          : 'Bấm để xem lịch sử giá & lọc review ảo';
    const radarSig = lookup.radarSignal;
    const radarChipHtml = radarSig
      ? radarSig.verdict === 'genuine_deal'
        ? `<span class="radar-chip radar-deal">🔥 Đáy 60N (-${radarSig.savingsPct}%)</span>`
        : radarSig.verdict === 'fake_sale_trap'
          ? `<span class="radar-chip radar-trap">🚨 Bẫy Sale (+${radarSig.fakeMarkupPct}%)</span>`
          : radarSig.spreadPct >= 5
            ? `<span class="radar-chip radar-spread">📊 Lệch ${radarSig.spreadPct}%</span>`
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
      <div class="pill-card" id="rate-pill-trigger" role="button" tabindex="0" aria-label="Mở bảng phân tích giá Rate.vn">
        <span class="brand-dot"></span>
        <div class="content">
          <div class="top-row">
            <span>Rate.vn</span>
            <span class="verdict-badge">${escapeHtml(assessment.badgeLabel)}</span>
            ${radarChipHtml}
            ${
              trustedRating
                ? `<span class="rating-tag">★ ${Number(trustedRating).toFixed(1)} (${Number(authenticRatio ?? 100)}% thật)</span>`
                : ''
            }
          </div>
          <div class="sub-row">${escapeHtml(cheaperSummary)}</div>
        </div>
        <button class="cta-btn" type="button">Chi tiết</button>
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
    if (!signal) return;

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
      }
    } catch {
      // Ignore transient messaging errors during page unload
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
