'use client';

import React, { useState } from 'react';
import {
  BsCheck2,
  BsClipboard,
  BsCodeSlash,
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
    id: 'compare-products',
    method: 'GET',
    title: 'So sánh Chéo 10 Nhóm Thông Số (/compare)',
    path: '/api/v1/rate/compare?slugs=apple-iphone-16-128gb,apple-iphone-16-plus-256gb',
    description:
      'Đặt tối đa 4 sản phẩm gốc lên bàn cân 10 nhóm thông số kỹ thuật chuẩn GSMArena & PhoneArena chỉ với 1 truy vấn REST.',
  },
  {
    id: 'lookup-url',
    method: 'GET',
    title: 'Kiểm định Link Sàn TMĐT (URL / Link Inspector)',
    path: '/api/v1/rate/lookup?q=https://shopee.vn/product/88201679/27110898667',
    description:
      'Bóc tách shop_id / item_id hoặc tên sản phẩm từ link Shopee, Lazada, Tiki và trả về kết quả kiểm định giảm giá ảo + điểm tín nhiệm gian hàng tức thì.',
  },
  {
    id: 'list-merchants',
    method: 'GET',
    title: 'Danh bạ Tín nhiệm Gian hàng (Dual Risk Score)',
    path: '/api/v1/rate/merchants',
    description:
      'Liệt kê toàn bộ gian hàng TMĐT kèm điểm Trust Score, DOSafe Threat Intel Risk và AI Review Seeding Risk.',
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
    id: 'extension-lookup',
    method: 'GET',
    title: 'Browser Extension MV3 Hybrid Lookup',
    path: '/api/v1/rate/extension/lookup?url=https://shopee.vn/product/88201679/27110898667',
    description:
      'Endpoint tốc độ cao phục vụ Rate Browser Extension MV3: chuẩn hóa URL, chặn phụ kiện/linh kiện và trả về kết luận giá 5 mức.',
  },
];

export default function ApiPlaygroundClient() {
  const [selectedId, setSelectedId] = useState<string>(PRESET_ENDPOINTS[0]!.id);
  const [customPath, setCustomPath] = useState<string>(
    PRESET_ENDPOINTS[0]!.path
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [responseJson, setResponseJson] = useState<string>(
    '// Bấm "Chạy thử Request trực tiếp" để xem dữ liệu JSON thực tế từ Supabase rate schema...'
  );
  const [copiedCurl, setCopiedCurl] = useState<boolean>(false);

  const activePreset =
    PRESET_ENDPOINTS.find((p) => p.id === selectedId) ?? PRESET_ENDPOINTS[0]!;

  const handleSelectPreset = (preset: ApiPresetEndpoint) => {
    setSelectedId(preset.id);
    setCustomPath(preset.path);
  };

  const handleRunRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetPath = customPath.trim();
    if (!targetPath.startsWith('/api/')) {
      setStatusCode(400);
      setResponseJson(
        JSON.stringify(
          {
            error: 'Đường dẫn thử nghiệm phải bắt đầu bằng /api/v1/rate/...',
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
      const res = await fetch(targetPath, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
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

  const curlSnippet = `curl -X GET "https://rate.vn${customPath}" \\\n  -H "Accept: application/json"`;

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="card rounded-4 overflow-hidden border bg-white shadow-sm">
      <div className="card-header bg-dark d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 px-4 py-3 text-white">
        <div className="d-flex align-items-center gap-2">
          <BsTerminal className="text-danger fs-5" />
          <span className="fw-bold">
            Interactive Open-Core REST API v1 Playground
          </span>
          <span className="badge bg-success rounded-pill small">
            Live Supabase Rate Schema
          </span>
        </div>
        <div className="small text-white-50">
          Không yêu cầu API Key cho các truy vấn đọc công khai (`GET`)
        </div>
      </div>

      <div className="card-body p-4">
        {/* Preset Selector Pills */}
        <div className="mb-3">
          <div className="small fw-bold text-uppercase text-muted mb-2">
            Chọn nhanh Endpoint mẫu:
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
                  <span className="badge bg-dark me-2">{preset.method}</span>
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
            <span className="input-group-text bg-dark fw-bold border-0 px-3 text-white">
              GET
            </span>
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
              {isLoading
                ? 'Đang truy vấn...'
                : 'Chạy thử Request trực tiếp'}
            </button>
          </div>
        </form>

        {/* cURL Snippet & Telemetry Bar */}
        <div className="row g-3">
          <div className="col-lg-5">
            <div className="rounded-3 bg-dark h-100 p-3 text-white">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="small fw-semibold text-white-50">
                  <BsCodeSlash className="me-1" /> Lệnh cURL / BFF Integration
                </span>
                <button
                  type="button"
                  onClick={handleCopyCurl}
                  className="btn btn-sm btn-outline-light rounded-pill py-0"
                >
                  {copiedCurl ? (
                    <>
                      <BsCheck2 className="me-1" /> Đã sao chép
                    </>
                  ) : (
                    <>
                      <BsClipboard className="me-1" /> Copy cURL
                    </>
                  )}
                </button>
              </div>
              <pre
                className="font-monospace small text-warning mb-0"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {curlSnippet}
              </pre>
            </div>
          </div>

          <div className="col-lg-7">
            <div className="rounded-3 bg-dark h-100 p-3 text-white">
              <div className="d-flex justify-content-between align-items-center border-bottom border-secondary border-opacity-25 mb-2 pb-2">
                <span className="small fw-semibold text-white-50">
                  JSON Response Payload
                </span>
                <div className="d-flex align-items-center gap-2">
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
