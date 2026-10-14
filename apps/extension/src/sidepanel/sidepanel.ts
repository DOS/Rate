import type {
  ExtensionLookupData,
  ExtensionPriceHistoryPoint,
  ExtensionSettings,
  ExtractedPageProductSignal,
} from '../types.js';

function formatVnd(val: number | null | undefined): string {
  if (!val || val <= 0) return 'Chưa có';
  return `${val.toLocaleString('vi-VN')} ₫`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSvgSparkline(points: ExtensionPriceHistoryPoint[]): string {
  if (!points || points.length < 2) {
    return `<div style="font-size: 12px; color: #9ca3af; padding: 8px 0;">Đang tích lũy thêm các mốc thời gian lịch sử giá.</div>`;
  }
  const prices = points.map((p) => p.price).filter((p) => p > 0);
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
        stroke="#FF2E29"
        stroke-width="2.2"
        points="${coords.join(' ')}"
      />
    </svg>
  `;
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
        <div class="card-title">Chưa nhận diện trang sản phẩm</div>
        <p style="color: #9ca3af;">
          Hãy mở một trang chi tiết sản phẩm trên <strong>Shopee, Lazada, Tiki, CellphoneS, Thế Giới Di Động</strong> hoặc <strong>FPT Shop</strong> rồi bấm <strong>Làm mới</strong>.
        </p>
      </div>
    `;
    return;
  }

  if (!lookup) {
    root.innerHTML = `
      <div class="card">
        <div class="card-title">Không kết nối được Rate API</div>
        <div class="product-name">${escapeHtml(signal.title)}</div>
        <p style="color: #9ca3af;">
          Kiểm tra lại địa chỉ máy chủ Rate API (${escapeHtml(settings.apiBaseUrl)}).
        </p>
      </div>
    `;
    return;
  }

  const assessment = lookup.priceAssessment;
  const master = lookup.masterProduct;
  const reviews = lookup.reviewSummary;
  const merchant = lookup.merchantProfile;

  const variantButtonsHtml =
    lookup.variantCandidates.length > 1
      ? `
      <div class="card">
        <div class="card-title">Chọn Phiên Bản Bộ Nhớ Đang Xem</div>
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

  const offersList =
    lookup.allOffers.length > 0 ? lookup.allOffers : lookup.topCheaperOffers;

  const offersHtml =
    offersList.length > 0
      ? `
      <div class="card">
        <div class="card-title">So Sánh Giá Các Gian Hàng (${offersList.length})</div>
        ${offersList
          .slice(0, 5)
          .map(
            (off) => `
            <div class="offer-item">
              <div>
                <div class="offer-shop">
                  ${escapeHtml(off.merchant.name)}
                  ${off.merchant.is_official ? '<span style="color:#34d399;font-size:11px;">[Mall]</span>' : ''}
                </div>
                <div class="offer-meta">
                  ${escapeHtml(off.platform.toUpperCase())} - ★ ${Number(off.rating_star || 0).toFixed(1)} - Rủi ro shop: ${off.merchant.risk_score}/100
                </div>
              </div>
              <a href="${escapeHtml(off.url)}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;">
                ${formatVnd(off.price_current)}
              </a>
            </div>
          `
          )
          .join('')}
      </div>
    `
      : '';

  const reviewHtml = reviews
    ? `
      <div class="card">
        <div class="card-title">Chất Lượng Đánh Giá Đã Lọc Seeding AI</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">Điểm User Đã Lọc</div>
            <div class="stat-val" style="color: #fbbf24;">★ ${Number(master?.user_rating_weighted || master?.average_rating || 0).toFixed(1)} / 5</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Tỷ Lệ Đánh Giá Thật</div>
            <div class="stat-val" style="color: #34d399;">${reviews.authentic_pct}% (${reviews.total_analyzed} đánh giá)</div>
          </div>
        </div>
        ${
          reviews.ai_summary
            ? `<p style="margin-top: 8px; color: #d1d5db; font-size: 12.5px;">${escapeHtml(reviews.ai_summary)}</p>`
            : ''
        }
      </div>
    `
    : '';

  const merchantRiskHtml = merchant
    ? `
      <div class="card">
        <div class="card-title">Độ Tin Cậy Gian Hàng (Dual Risk Score)</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">Trust Score</div>
            <div class="stat-val" style="color: #34d399;">${merchant.trust_score}/100</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">DOSafe / Seeding Risk</div>
            <div class="stat-val">${merchant.dosafe_risk_score} / ${merchant.review_risk_score}</div>
          </div>
        </div>
      </div>
    `
    : '';

  const historyHtml = lookup.priceHistory
    ? `
      <div class="card">
        <div class="card-title">Biến Động Lịch Sử Giá</div>
        ${buildSvgSparkline(lookup.priceHistory.points)}
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">Đáy Lịch Sử</div>
            <div class="stat-val" style="color: #34d399;">${formatVnd(lookup.priceHistory.lowestEverPrice)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Đỉnh Lịch Sử</div>
            <div class="stat-val">${formatVnd(lookup.priceHistory.highestEverPrice)}</div>
          </div>
        </div>
      </div>
    `
    : '';

  const detailUrl = lookup.productDetailUrl
    ? `${settings.apiBaseUrl}${lookup.productDetailUrl}`
    : `${settings.apiBaseUrl}/smartphones`;
  const compareUrl = lookup.compareUrl
    ? `${settings.apiBaseUrl}${lookup.compareUrl}`
    : `${settings.apiBaseUrl}/compare`;

  root.innerHTML = `
    <div class="card">
      <span class="verdict-pill verdict-${assessment.verdict}">${escapeHtml(assessment.badgeLabel)}</span>
      <div class="product-name">${escapeHtml(master?.name || signal.title)}</div>
      <p style="color: #d1d5db; font-size: 12.5px;">${escapeHtml(assessment.explanation)}</p>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-label">Giá Đang Xem</div>
          <div class="stat-val">${formatVnd(assessment.observedPrice ?? signal.price)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Trung Vị Thị Trường</div>
          <div class="stat-val">${formatVnd(assessment.marketMedianPrice)}</div>
        </div>
      </div>
      <div class="btn-row">
        <a class="btn-primary" href="${escapeHtml(detailUrl)}" target="_blank" rel="noopener noreferrer">Xem Trên Rate.vn</a>
        <a class="btn-secondary" href="${escapeHtml(compareUrl)}" target="_blank" rel="noopener noreferrer">So Sánh Cấu Hình</a>
      </div>
    </div>
    ${variantButtonsHtml}
    ${historyHtml}
    ${offersHtml}
    ${reviewHtml}
    ${merchantRiskHtml}
  `;

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
    };

    const settings: ExtensionSettings = res?.settings || {
      apiBaseUrl: 'http://localhost:3000',
      crowdContributeOptIn: false,
    };

    if (chkOptIn) {
      chkOptIn.checked = Boolean(settings.crowdContributeOptIn);
    }
    if (inpApiBase && !inpApiBase.value) {
      inpApiBase.value = settings.apiBaseUrl;
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
  } catch (err) {
    root.innerHTML = `
      <div class="card">
        <div class="card-title">Lỗi tải dữ liệu</div>
        <p style="color: #9ca3af;">${escapeHtml(err instanceof Error ? err.message : 'Không thể tải dữ liệu.')}</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btnRefresh = document.getElementById('btn-refresh');
  const chkOptIn = document.getElementById(
    'chk-crowd-optin'
  ) as HTMLInputElement | null;
  const inpApiBase = document.getElementById(
    'inp-api-base'
  ) as HTMLInputElement | null;

  btnRefresh?.addEventListener('click', () => {
    void loadSidePanel();
  });

  chkOptIn?.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      type: 'RATE_UPDATE_SETTINGS',
      crowdContributeOptIn: chkOptIn.checked,
    });
  });

  inpApiBase?.addEventListener('change', async () => {
    if (inpApiBase.value.trim()) {
      await chrome.runtime.sendMessage({
        type: 'RATE_UPDATE_SETTINGS',
        apiBaseUrl: inpApiBase.value.trim(),
      });
      void loadSidePanel();
    }
  });

  void loadSidePanel();
});
