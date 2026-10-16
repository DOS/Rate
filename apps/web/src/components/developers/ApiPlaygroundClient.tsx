'use client';

import React, { useState } from 'react';
import {
  BsCheck2,
  BsClipboard,
  BsCodeSlash,
  BsFileEarmarkCode,
  BsLightningChargeFill,
  BsPlayFill,
  BsTerminal,
} from 'react-icons/bs';

export interface ApiPresetEndpoint {
  id: string;
  method: 'GET' | 'POST';
  title: string;
  path: string;
  description: string;
  defaultBody?: string;
}

const PRESET_ENDPOINTS: ApiPresetEndpoint[] = [
  {
    id: 'list-products',
    method: 'GET',
    title: 'Danh sách Master Products (10 Nhóm Thông Số)',
    path: '/api/v1/rate/products?limit=3&sort=rating_desc',
    description:
      'Truy vấn danh sách sản phẩm gốc chuẩn hóa từ rate.master_products kèm lọc theo ngành hàng, thương hiệu, RAM/ROM và điểm JReviews.',
  },
  {
    id: 'product-detail',
    method: 'GET',
    title: 'Chi tiết Sản phẩm + Lịch sử Giá + Review AI',
    path: '/api/v1/rate/products/apple-iphone-16-128gb',
    description:
      'Trả về toàn bộ 10 nhóm thông số kỹ thuật, danh sách gian hàng (rate.products), chuỗi thời gian giá 90 ngày (rate.price_history), phân tích giảm giá ảo và đánh giá đã kiểm duyệt AI.',
  },
  {
    id: 'leaderboard-ranking',
    method: 'GET',
    title: 'Bảng Xếp Hạng 4 Tầng JReviews (/leaderboard)',
    path: '/api/v1/rate/leaderboard?category=smartphones&criterion=camera&limit=5',
    description:
      'Xếp hạng thiết bị theo cấu trúc 4 tầng (Directory -> Category -> Master Product -> Listing) theo 8 tiêu chí JReviews (Combined, User, Expert, Màn hình, Hiệu năng, Camera, Pin, Đáng tiền).',
  },
  {
    id: 'compare-products',
    method: 'GET',
    title: 'So sánh Chéo 10 Nhóm Thông Số (/compare)',
    path: '/api/v1/rate/compare?slugs=apple-iphone-16-128gb,apple-iphone-16-plus-256gb',
    description:
      'Đặt tối đa 4 sản phẩm gốc lên bàn cân 10 nhóm thông số kỹ thuật chuẩn GSMArena & PhoneArena chỉ với 1 truy vấn REST.',
  },
  {
    id: 'versus-head-to-head',
    method: 'GET',
    title: 'Đối đầu 1v1 JReviews & Trọng số Persona (/versus)',
    path: '/api/v1/rate/versus?pair=apple-iphone-18-pro-max-256gb-vs-samsung-galaxy-s26-ultra-256gb&persona=balanced',
    description:
      'Chấm điểm đối đầu 1v1 trực tiếp giữa 2 mẫu cùng ngành hàng theo 5 tiêu chí JReviews (Màn hình, Hiệu năng, Camera, Pin, Đáng tiền), hỗ trợ tùy biến trọng số Persona và tính độ lệch giá.',
  },
  {
    id: 'inspect-url',
    method: 'GET',
    title: 'Trình Kiểm Định Giá & Link Sàn (/inspect)',
    path: '/api/v1/rate/inspect?q=https://shopee.vn/product/88201679/27110898667&price=21990000',
    description:
      'Kiểm định trực tiếp URL hoặc tên máy trên 10 sàn/đại lý (Shopee, Lazada, Tiki, TikTok Shop, CellphoneS, TGDĐ, FPT Shop, Hoàng Hà, Di Động Việt, Phong Vũ) kèm kết luận giá 5 mức.',
  },
  {
    id: 'extension-lookup',
    method: 'GET',
    title: 'Browser Extension MV3 Hybrid Lookup',
    path: '/api/v1/rate/extension/lookup?url=https://shopee.vn/product/88201679/27110898667',
    description:
      'Endpoint tốc độ cao phục vụ Rate Browser Extension MV3: chuẩn hóa URL, chặn phụ kiện/linh kiện và trả về kết luận giá 5 mức.',
  },
  {
    id: 'extension-ingest',
    method: 'POST',
    title: 'Zero-Trust Quarantine Ingest (POST)',
    path: '/api/v1/rate/extension/ingest',
    description:
      'Gửi tín hiệu sản phẩm ẩn danh từ Browser Extension MV3 (bắt buộc consentGranted=true) qua bộ lọc Zero-Trust Quarantine trước khi đẩy vào hàng đợi rate.crawl_jobs.',
    defaultBody: JSON.stringify(
      {
        url: 'https://cellphones.com.vn/iphone-16-pro-max.html?utm_source=extension_test',
        platform: 'cellphones',
        title: 'iPhone 16 Pro Max 256GB Chính hãng VN/A',
        currentPrice: 30990000,
        originalPrice: 34990000,
        skuText: '256GB Titan Tự Nhiên',
        sellerName: 'CellphoneS Official',
        isOfficialMall: true,
        consentGranted: true,
        extensionVersion: '2.1.0',
      },
      null,
      2
    ),
  },
  {
    id: 'list-merchants',
    method: 'GET',
    title: 'Danh bạ Tín nhiệm Gian hàng (Dual Risk Score)',
    path: '/api/v1/rate/merchants?officialOnly=true',
    description:
      'Liệt kê toàn bộ gian hàng TMĐT kèm điểm Trust Score, DOSafe Threat Intel Risk và AI Review Seeding Risk.',
  },
  {
    id: 'watchlist-check',
    method: 'GET',
    title: 'Theo dõi Biến động Giá (/watchlist)',
    path: '/api/v1/rate/watchlist?slugs=apple-iphone-16-128gb,samsung-galaxy-s24-ultra-256gb',
    description:
      'Truy vấn hàng loạt giá thấp nhất hiện tại, trung vị 90 ngày và trạng thái giảm giá thật/ảo cho danh sách sản phẩm đang theo dõi.',
  },
  {
    id: 'platform-stats',
    method: 'GET',
    title: 'Số liệu Thống kê Toàn Nền tảng (/stats)',
    path: '/api/v1/rate/stats',
    description:
      'Trả về số lượng sản phẩm chuẩn hóa, bản ghi lịch sử giá, tỷ lệ đánh giá thực chất và số lượng mẫu theo từng ngành hàng.',
  },
  {
    id: 'openapi-spec',
    method: 'GET',
    title: 'Đặc tả OpenAPI 3.1.0 (/openapi.json)',
    path: '/api/v1/rate/openapi.json',
    description:
      'Trả về tài liệu OpenAPI 3.1.0 chuẩn máy đọc (machine-readable JSON) cho toàn bộ 13 REST API v1 endpoints của Rate.vn.',
  },
];

export default function ApiPlaygroundClient() {
  const [selectedId, setSelectedId] = useState<string>(PRESET_ENDPOINTS[0]!.id);
  const [customMethod, setCustomMethod] = useState<'GET' | 'POST'>(
    PRESET_ENDPOINTS[0]!.method
  );
  const [customPath, setCustomPath] = useState<string>(
    PRESET_ENDPOINTS[0]!.path
  );
  const [requestBody, setRequestBody] = useState<string>('');
  const [snippetMode, setSnippetMode] = useState<'curl' | 'fetch' | 'python'>(
    'curl'
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [responseJson, setResponseJson] = useState<string>(
    '// Bấm "Chạy thử Request trực tiếp" để xem dữ liệu JSON thực tế từ Supabase rate schema...'
  );
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);

  const activePreset =
    PRESET_ENDPOINTS.find((p) => p.id === selectedId) ?? PRESET_ENDPOINTS[0]!;

  const handleSelectPreset = (preset: ApiPresetEndpoint) => {
    setSelectedId(preset.id);
    setCustomMethod(preset.method);
    setCustomPath(preset.path);
    setRequestBody(preset.defaultBody ?? '');
  };

  const handleRunRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetPath = customPath.trim();
    if (!targetPath.startsWith('/api/')) {
      setStatusCode(400);
      setResponseJson(
        JSON.stringify(
          {
            error: 'Đường dẫn thử nghiệm phải bắt đầu bằng /api/...',
          },
          null,
          2
        )
      );
      return;
    }

    setIsLoading(true);
    const start = performance.now();
    try {
      const fetchInit: RequestInit = {
        method: customMethod,
        headers: {
          Accept: 'application/json',
          ...(customMethod === 'POST'
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(customMethod === 'POST' && requestBody.trim()
          ? { body: requestBody }
          : {}),
      };

      const res = await fetch(targetPath, fetchInit);
      const elapsed = Math.round(performance.now() - start);
      setStatusCode(res.status);
      setLatencyMs(elapsed);
      const data = await res.json();
      setResponseJson(JSON.stringify(data, null, 2));
    } catch (err) {
      setStatusCode(500);
      setResponseJson(
        JSON.stringify(
          {
            error: 'Không thể kết nối tới API endpoint',
            details: err instanceof Error ? err.message : String(err),
          },
          null,
          2
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const curlSnippet =
    customMethod === 'POST'
      ? `curl -X POST "https://rate.vn${customPath}" \\\n  -H "Accept: application/json" \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody.replace(/\s+/g, ' ').trim()}'`
      : `curl -X GET "https://rate.vn${customPath}" \\\n  -H "Accept: application/json"`;

  const fetchSnippet =
    customMethod === 'POST'
      ? `const res = await fetch("https://rate.vn${customPath}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${requestBody.trim() || '{}'}),\n});\nconst data = await res.json();`
      : `const res = await fetch("https://rate.vn${customPath}", {\n  headers: { Accept: "application/json" },\n});\nconst data = await res.json();`;

  const pythonSnippet =
    customMethod === 'POST'
      ? `import requests\n\nres = requests.post(\n    "https://rate.vn${customPath}",\n    json=${requestBody.trim() || '{}'},\n    timeout=15,\n)\nprint(res.status_code, res.json())`
      : `import requests\n\nres = requests.get(\n    "https://rate.vn${customPath}",\n    headers={"Accept": "application/json"},\n    timeout=15,\n)\nprint(res.status_code, res.json())`;

  const activeSnippet =
    snippetMode === 'curl'
      ? curlSnippet
      : snippetMode === 'fetch'
        ? fetchSnippet
        : pythonSnippet;

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(activeSnippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleCopyResponseJson = async () => {
    try {
      await navigator.clipboard.writeText(responseJson);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadResponseJson = () => {
    if (typeof document === 'undefined') return;
    const blob = new Blob([responseJson], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rate-api-${selectedId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card rounded-4 overflow-hidden border bg-white shadow-sm">
      <div className="card-header bg-dark d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 px-4 py-3 text-white">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <BsTerminal className="text-danger fs-5" />
          <span className="fw-bold">
            Interactive Open-Core REST API v1 Playground
          </span>
          <span className="badge bg-success rounded-pill small">
            Live Supabase Rate Schema
          </span>
          <a
            href="/api/v1/rate/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="badge bg-primary text-decoration-none rounded-pill d-inline-flex align-items-center gap-1"
          >
            <BsFileEarmarkCode /> OpenAPI 3.1 JSON
          </a>
        </div>
        <div className="small text-white-50">
          Không yêu cầu API Key cho các truy vấn đọc công khai (`GET`)
        </div>
      </div>

      <div className="card-body p-4">
        {/* Preset Selector Pills */}
        <div className="mb-3">
          <div className="small fw-bold text-uppercase text-muted mb-2">
            Chọn nhanh Endpoint mẫu (12 kịch bản thực tế):
          </div>
          <div className="d-flex flex-wrap gap-2">
            {PRESET_ENDPOINTS.map((preset) => {
              const isSelected = preset.id === selectedId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`btn btn-sm rounded-pill fw-medium px-3 py-2 ${
                    isSelected ? 'btn-danger' : 'btn-outline-secondary'
                  }`}
                >
                  <span
                    className={`badge me-2 ${
                      preset.method === 'POST'
                        ? 'bg-warning text-dark'
                        : 'bg-dark'
                    }`}
                  >
                    {preset.method}
                  </span>
                  {preset.title}
                </button>
              );
            })}
          </div>
          <p className="text-muted small mt-2 mb-0">
            <BsLightningChargeFill className="text-warning me-1" />
            {activePreset.description}
          </p>
        </div>

        {/* Request Bar */}
        <form onSubmit={handleRunRequest} className="mb-3">
          <div className="input-group">
            <select
              value={customMethod}
              onChange={(e) =>
                setCustomMethod(e.target.value as 'GET' | 'POST')
              }
              className="form-select bg-dark fw-bold border-0 text-white"
              style={{ maxWidth: '105px' }}
              aria-label="HTTP Method"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              className="form-control font-monospace bg-light"
              placeholder="/api/v1/rate/products?limit=5"
              aria-label="API Endpoint Path"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary fw-semibold d-inline-flex align-items-center gap-2 px-4"
            >
              <BsPlayFill className="fs-5" />
              {isLoading ? 'Đang truy vấn...' : 'Chạy thử Request trực tiếp'}
            </button>
          </div>

          {customMethod === 'POST' && (
            <div className="mt-3">
              <label className="form-label small fw-bold text-uppercase text-muted mb-1">
                JSON Request Body (`application/json`):
              </label>
              <textarea
                rows={6}
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                className="form-control font-monospace small bg-light"
                placeholder='{"consentGranted": true, ...}'
              />
            </div>
          )}
        </form>

        {/* cURL / Fetch / Python Snippet & Telemetry Bar */}
        <div className="row g-3">
          <div className="col-lg-5">
            <div className="rounded-3 bg-dark h-100 p-3 text-white">
              <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-1">
                <div className="d-flex align-items-center gap-2">
                  <span className="small fw-semibold text-white-50">
                    <BsCodeSlash className="me-1" /> Code:
                  </span>
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      onClick={() => setSnippetMode('curl')}
                      className={`btn btn-sm py-0 ${
                        snippetMode === 'curl'
                          ? 'btn-danger'
                          : 'btn-outline-secondary text-light'
                      }`}
                    >
                      cURL
                    </button>
                    <button
                      type="button"
                      onClick={() => setSnippetMode('fetch')}
                      className={`btn btn-sm py-0 ${
                        snippetMode === 'fetch'
                          ? 'btn-danger'
                          : 'btn-outline-secondary text-light'
                      }`}
                    >
                      TS fetch()
                    </button>
                    <button
                      type="button"
                      onClick={() => setSnippetMode('python')}
                      className={`btn btn-sm py-0 ${
                        snippetMode === 'python'
                          ? 'btn-danger'
                          : 'btn-outline-secondary text-light'
                      }`}
                    >
                      Python
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopySnippet}
                  className="btn btn-sm btn-outline-light rounded-pill py-0"
                  data-testid="copy-api-snippet-btn"
                >
                  {copiedSnippet ? (
                    <>
                      <BsCheck2 className="me-1" /> Đã sao chép
                    </>
                  ) : (
                    <>
                      <BsClipboard className="me-1" /> Copy
                    </>
                  )}
                </button>
              </div>
              <pre
                className="font-monospace small text-warning mb-0"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {activeSnippet}
              </pre>
            </div>
          </div>

          <div className="col-lg-7">
            <div className="rounded-3 bg-dark h-100 p-3 text-white">
              <div className="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 mb-2 flex-wrap gap-2 pb-2">
                <span className="small fw-semibold text-white-50">
                  JSON Response Payload
                </span>
                <div className="d-flex align-items-center flex-wrap gap-2">
                  {statusCode !== null && (
                    <span
                      className={`badge rounded-pill ${
                        statusCode >= 200 && statusCode < 300
                          ? 'bg-success'
                          : 'bg-danger'
                      }`}
                    >
                      HTTP {statusCode}
                    </span>
                  )}
                  {latencyMs !== null && (
                    <span className="badge bg-secondary rounded-pill">
                      {latencyMs} ms
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyResponseJson}
                    className="btn btn-sm btn-outline-light rounded-pill py-0"
                    data-testid="copy-api-response-btn"
                  >
                    {copiedResponse ? '✅ Đã chép JSON' : '📋 Copy JSON'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadResponseJson}
                    className="btn btn-sm btn-outline-info rounded-pill py-0"
                    data-testid="download-api-response-btn"
                  >
                    📥 Tải JSON
                  </button>
                </div>
              </div>
              <pre
                className="font-monospace small text-info mb-0"
                style={{
                  maxHeight: '340px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {responseJson}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
