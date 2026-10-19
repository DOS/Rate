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
  normalizeFiveStarRating,
  resolveSafeApiRelativeUrl,
  sanitizeVerdictClassSuffix,
} from '../security-guards.js';

function formatVnd(val: number | null | undefined): string {
  return formatSafeExtensionVnd(val);
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
    return `<div style="font-size: 13px; color: #9ca3af; padding: 8px 0;">Đang tích lũy thêm các mốc thời gian lịch sử giá.</div>`;
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
      `${settings.apiBaseUrl}/api/v1/rate/deals?limit=4${catParam}`
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
        <div class="card-title">🔥 Radar Kèo Thơm Đáy Lịch Sử 10 Sàn</div>
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
                  ${escapeHtml(d.platform.toUpperCase())} (${escapeHtml(d.merchantName)}) - Tiết kiệm ${formatVnd(d.savingsVsMedianVnd)} (-${formatSafeNumber(d.savingsVsMedianPct, { min: 0, max: 100 })}%)
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
              <div class="card-title" style="color:#60a5fa;">📊 Chênh Lệch Giá Đa Sàn Lớn Nhất</div>
              ${spreads
                .slice(0, 2)
                .map(
                  (s) => `
                  <div class="offer-item">
                    <div>
                      <div class="offer-shop">${escapeHtml(s.productName)}</div>
                      <div class="offer-meta" style="color:#93c5fd;">
                        ${escapeHtml(s.cheapestPlatform.toUpperCase())} (${formatVnd(s.minPrice)}) vs ${escapeHtml(s.priciestPlatform.toUpperCase())} (${formatVnd(s.maxPrice)})
                      </div>
                    </div>
                    <a href="${escapeSafeExternalHref(s.cheapestOfferUrl)}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:#60a5fa;">
                      Lệch ${formatVnd(s.spreadVnd)}
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
              <div class="card-title" style="color:#f87171;">⚠️ Cảnh Báo Bẫy Nâng Giá Gốc (Fake Sale)</div>
              ${traps
                .slice(0, 2)
                .map(
                  (t) => `
                  <div class="offer-item">
                    <div>
                      <div class="offer-shop">${escapeHtml(t.productName)}</div>
                      <div class="offer-meta" style="color:#fca5a5;">
                        ${escapeHtml(t.platform.toUpperCase())} - Giá gốc kê khống +${formatSafeNumber(t.fakeMarkupPct, { min: 0, max: 10000 })}% (${formatVnd(t.priceOriginal)})
                      </div>
                    </div>
                    <span class="offer-price" style="color:#f87171;">${formatVnd(t.priceCurrent)}</span>
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
  review_risk_score: number;
  risk_score: number;
  trust_score: number;
  product_count: number;
}

async function fetchAndRenderMerchantTrustDirectory(
  settings: ExtensionSettings,
  platform?: string
): Promise<void> {
  const slot = document.getElementById('merchant-trust-slot');
  if (!slot) return;

  try {
    const res = await fetch(
      `${settings.apiBaseUrl}/api/v1/rate/merchants?sort=trust_desc&limit=18`
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
        <div class="card-title">🛡️ Kiểm Toán Độ Tin Cậy Đại Lý 10 Sàn (${allMerchants.length})</div>
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
                    ${m.is_official ? '<span style="color:#34d399;font-size: 13px;">[Mall]</span>' : ''}
                  </div>
                  <div class="offer-meta">
                    ${escapeHtml(m.platform.toUpperCase())} (${formatSafeNumber(m.product_count, { min: 0 })} SP) - DOSafe: ${formatSafeNumber(m.dosafe_risk_score, { min: 0, max: 100 })} | Seeding: ${formatSafeNumber(m.review_risk_score, { min: 0, max: 100 })}
                  </div>
                </div>
                <a href="${detailHref}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;color:${trustColor};">
                  Trust ${formatSafeNumber(m.trust_score, { min: 0, max: 100 })}/100
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
        <div class="card-title">Chưa nhận diện trang sản phẩm</div>
        <p style="color: #9ca3af;">
          Hãy mở một trang chi tiết sản phẩm trên <strong>Shopee, Lazada, Tiki, TikTok Shop, CellphoneS, Thế Giới Di Động, FPT Shop, Hoàng Hà Mobile, Di Động Việt</strong> hoặc <strong>Phong Vũ</strong>, hoặc dán link/tên máy vào ô <strong>Tra cứu nhanh</strong> phía trên.
        </p>
      </div>
      <div id="deal-radar-slot"></div>
      <div id="merchant-trust-slot"></div>
    `;
    void fetchAndRenderDealRadar(settings);
    void fetchAndRenderMerchantTrustDirectory(settings);
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
      <div id="deal-radar-slot"></div>
      <div id="merchant-trust-slot"></div>
    `;
    void fetchAndRenderDealRadar(settings);
    void fetchAndRenderMerchantTrustDirectory(settings, signal.platform);
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

  const keySpecs = master?.key_specs;
  const keySpecsHtml =
    keySpecs &&
    (keySpecs.screen || keySpecs.chip || keySpecs.camera || keySpecs.battery)
      ? `
      <div class="card">
        <div class="card-title">Tóm Tắt 10 Nhóm Thông Số Chuẩn</div>
        <div class="stats-grid">
          ${
            keySpecs.screen
              ? `<div class="stat-box"><div class="stat-label">Màn hình</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.screen)}</div></div>`
              : ''
          }
          ${
            keySpecs.chip
              ? `<div class="stat-box"><div class="stat-label">Vi xử lý</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.chip)}</div></div>`
              : ''
          }
          ${
            keySpecs.camera
              ? `<div class="stat-box"><div class="stat-label">Camera</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.camera)}</div></div>`
              : ''
          }
          ${
            keySpecs.battery
              ? `<div class="stat-box"><div class="stat-label">Pin &amp; Sạc</div><div class="stat-val" style="font-size: 13px;">${escapeHtml(keySpecs.battery)}</div></div>`
              : ''
          }
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
                  ${off.merchant.is_official ? '<span style="color:#34d399;font-size: 13px;">[Mall]</span>' : ''}
                </div>
                <div class="offer-meta">
                  ${escapeHtml(off.platform.toUpperCase())} - ★ ${formatSafeNumber(off.rating_star, { min: 0, max: 5, decimals: 1 })} - Rủi ro shop: ${formatSafeNumber(off.merchant.risk_score, { min: 0, max: 100 })}/100
                </div>
              </div>
              <a href="${escapeSafeExternalHref(off.url)}" target="_blank" rel="noopener noreferrer" class="offer-price" style="text-decoration:none;">
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
            <div class="stat-val" style="color: #fbbf24;">★ ${formatSafeNumber(normalizeFiveStarRating(master?.user_rating_weighted || master?.average_rating) ?? 0, { min: 0, max: 5, decimals: 1 })} / 5</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Tỷ Lệ Đánh Giá Thật</div>
            <div class="stat-val" style="color: #34d399;">${formatSafeNumber(reviews.authentic_pct, { min: 0, max: 100 })}% (${formatSafeNumber(reviews.total_analyzed, { min: 0 })} đánh giá)</div>
          </div>
        </div>
        ${
          reviews.ai_summary
            ? `<p style="margin-top: 8px; color: #d1d5db; font-size: 13px;">${escapeHtml(reviews.ai_summary)}</p>`
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
            <div class="stat-val" style="color: #34d399;">${formatSafeNumber(merchant.trust_score, { min: 0, max: 100 })}/100</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">DOSafe / Seeding Risk</div>
            <div class="stat-val">${formatSafeNumber(merchant.dosafe_risk_score, { min: 0, max: 100 })} / ${formatSafeNumber(merchant.review_risk_score, { min: 0, max: 100 })}</div>
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

  const categoryNameMap: Record<string, string> = {
    smartphones: 'Điện thoại',
    tablets: 'Máy tính bảng',
    laptops: 'Laptop',
    smartwatches: 'Đồng hồ thông minh',
    earbuds: 'Tai nghe không dây',
  };
  const rawCategorySlug = lookup.categorySlug || 'smartphones';
  const categorySlug = Object.prototype.hasOwnProperty.call(
    categoryNameMap,
    rawCategorySlug
  )
    ? rawCategorySlug
    : 'smartphones';
  const focusLabelMap: Record<string, string> = {
    combined: 'Tổng hợp',
    screen: 'Màn hình',
    performance: 'Hiệu năng',
    camera: 'Camera / Âm thanh',
    battery: 'Pin & Sạc',
    value: 'Đáng tiền',
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
        <div class="card-title">Xếp Hạng Chuyên Sâu (${escapeHtml(categoryNameMap[categorySlug] || 'Thiết bị')})</div>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">Hạng Danh Mục</div>
            <div class="stat-val" style="color: #ff6b6b;">#${formatSafeNumber(overallBadge.rank, { min: 1 })} / ${formatSafeNumber(overallBadge.totalInCategory, { min: 1 })}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Điểm Tổng Hợp</div>
            <div class="stat-val" style="color: #34d399;">${formatSafeNumber(overallBadge.score10, { min: 0, max: 10, decimals: 1 })} / 10</div>
          </div>
        </div>
        ${
          subBadges.length > 0
            ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
                ${subBadges
                  .map(
                    (sr) =>
                      `<span style="font-size: 13px;background:#181c24;border:1px solid #2a2f3a;color:#e5e7eb;padding:3px 7px;border-radius:6px;">🏆 #${formatSafeNumber(sr.rank, { min: 1 })} ${escapeHtml(focusLabelMap[sr.criterion] || sr.criterion)} (${formatSafeNumber(sr.score10, { min: 0, max: 10, decimals: 1 })})</span>`
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
    `/compare?cat=${categorySlug}`
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
        `/compare?cat=${categorySlug}`
      )
    : null;
  const inspectUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    `/inspect?q=${encodeURIComponent(
      signal.canonicalUrl || master?.slug || signal.title
    )}`,
    '/inspect'
  );
  const watchlistUrl = resolveSafeApiRelativeUrl(
    settings.apiBaseUrl,
    master?.slug
      ? `/watchlist?add=${encodeURIComponent(master.slug)}`
      : '/watchlist',
    '/watchlist'
  );

  const radarSig = lookup.radarSignal;
  const radarSpreadPct = Number(radarSig?.spreadPct ?? 0);
  const radarPillHtml = radarSig
    ? radarSig.verdict === 'genuine_deal'
      ? `<span class="verdict-pill verdict-genuine_deal" style="margin-left:6px;">🔥 Đáy giá 60N (-${formatSafeNumber(radarSig.savingsPct, { min: 0, max: 100 })}%)</span>`
      : radarSig.verdict === 'fake_sale_trap'
        ? `<span class="verdict-pill verdict-inflated_fake_sale" style="margin-left:6px;">🚨 Cảnh báo Sale Ảo (+${formatSafeNumber(radarSig.fakeMarkupPct, { min: 0, max: 10000 })}%)</span>`
        : Number.isFinite(radarSpreadPct) && radarSpreadPct >= 5
          ? `<span class="verdict-pill" style="margin-left:6px;background:#1e293b;color:#38bdf8;border:1px solid #0284c7;">📊 Lệch 10 sàn ${formatSafeNumber(radarSig.spreadPct, { min: 0, max: 10000 })}%</span>`
          : ''
    : '';

  root.innerHTML = `
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
        <span class="verdict-pill verdict-${sanitizeVerdictClassSuffix(assessment.verdict)}">${escapeHtml(assessment.badgeLabel)}</span>
        ${radarPillHtml}
      </div>
      <div class="product-name">${escapeHtml(master?.name || signal.title)}</div>
      <p style="color: #d1d5db; font-size: 13px;">${escapeHtml(assessment.explanation)}</p>
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
        <a class="btn-primary" href="${detailUrl}" target="_blank" rel="noopener noreferrer">Xem Trên Rate.vn</a>
        <a class="btn-secondary" href="${compareUrl}" target="_blank" rel="noopener noreferrer">So Sánh Cấu Hình</a>
      </div>
      <div class="btn-row" style="margin-top: 6px;">
        <a class="btn-secondary" href="${leaderboardUrl}" target="_blank" rel="noopener noreferrer">🏆 Bảng Xếp Hạng</a>
        ${
          versusUrl
            ? `<a class="btn-secondary" href="${versusUrl}" target="_blank" rel="noopener noreferrer">⚔️ Đối Đầu 1v1</a>`
            : `<a class="btn-secondary" href="${inspectUrl}" target="_blank" rel="noopener noreferrer">🔬 Kiểm Toán Sâu</a>`
        }
      </div>
      <div class="btn-row" style="margin-top: 6px;">
        <a class="btn-secondary" href="${inspectUrl}" target="_blank" rel="noopener noreferrer">🔬 Kiểm Toán Sâu</a>
        <a class="btn-secondary" href="${watchlistUrl}" target="_blank" rel="noopener noreferrer">🔔 Canh Giá Thật</a>
      </div>
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

async function runQuickQuery(query: string): Promise<void> {
  const root = document.getElementById('panel-root');
  if (!root || !query.trim()) return;

  root.innerHTML = `
    <div class="card">
      <p style="color: #9ca3af;">Đang kiểm toán nhanh dữ liệu cho "${escapeHtml(query.trim())}"...</p>
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
    };

    const settings: ExtensionSettings = res?.settings || {
      apiBaseUrl: DEFAULT_API_BASE_URL,
      crowdContributeOptIn: false,
    };

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
        <div class="card-title">Lỗi tra cứu nhanh</div>
        <p style="color: #9ca3af;">${escapeHtml(err instanceof Error ? err.message : 'Không thể kiểm tra sản phẩm.')}</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
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
