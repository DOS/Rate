'use client';

import React, { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { escapeCsvCell } from '@/lib/csv-safe';
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

export default function ApiPlaygroundClient() {
  const t = useTranslations('developers');

  const presetEndpoints = useMemo<ApiPresetEndpoint[]>(
    () => [
      {
        id: 'list-products',
        method: 'GET',
        title: t('pgPreset1Title'),
        path: '/api/v1/rate/products?limit=3&sort=rating_desc',
        description: t('pgPreset1Desc'),
      },
      {
        id: 'product-detail',
        method: 'GET',
        title: t('pgPreset2Title'),
        path: '/api/v1/rate/products/apple-iphone-16-128gb',
        description: t('pgPreset2Desc'),
      },
      {
        id: 'leaderboard-ranking',
        method: 'GET',
        title: t('pgPreset3Title'),
        path: '/api/v1/rate/leaderboard?category=smartphones&criterion=camera&limit=5',
        description: t('pgPreset3Desc'),
      },
      {
        id: 'compare-products',
        method: 'GET',
        title: t('pgPreset4Title'),
        path: '/api/v1/rate/compare?slugs=apple-iphone-16-128gb,apple-iphone-16-plus-256gb',
        description: t('pgPreset4Desc'),
      },
      {
        id: 'versus-head-to-head',
        method: 'GET',
        title: t('pgPreset5Title'),
        path: '/api/v1/rate/versus?pair=apple-iphone-16-128gb-vs-apple-iphone-16-plus-256gb&persona=balanced',
        description: t('pgPreset5Desc'),
      },
      {
        id: 'inspect-url',
        method: 'GET',
        title: t('pgPreset6Title'),
        path: '/api/v1/rate/inspect?q=https://shopee.vn/product/88201679/27110898667&price=21990000',
        description: t('pgPreset6Desc'),
      },
      {
        id: 'extension-lookup',
        method: 'GET',
        title: t('pgPreset7Title'),
        path: '/api/v1/rate/extension/lookup?url=https://shopee.vn/product/88201679/27110898667',
        description: t('pgPreset7Desc'),
      },
      {
        id: 'extension-ingest',
        method: 'POST',
        title: t('pgPreset8Title'),
        path: '/api/v1/rate/extension/ingest',
        description: t('pgPreset8Desc'),
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
        title: t('pgPreset9Title'),
        path: '/api/v1/rate/merchants?officialOnly=true',
        description: t('pgPreset9Desc'),
      },
      {
        id: 'watchlist-check',
        method: 'GET',
        title: t('pgPreset10Title'),
        path: '/api/v1/rate/watchlist?slugs=apple-iphone-16-128gb,apple-iphone-16-plus-256gb',
        description: t('pgPreset10Desc'),
      },
      {
        id: 'platform-stats',
        method: 'GET',
        title: t('pgPreset11Title'),
        path: '/api/v1/rate/stats',
        description: t('pgPreset11Desc'),
      },
      {
        id: 'deals-radar',
        method: 'GET',
        title: t('pgPreset12Title'),
        path: '/api/v1/rate/deals?category=all&limit=6',
        description: t('pgPreset12Desc'),
      },
      {
        id: 'openapi-spec',
        method: 'GET',
        title: t('pgPreset13Title'),
        path: '/api/v1/rate/openapi.json',
        description: t('pgPreset13Desc'),
      },
    ],
    [t]
  );

  const [selectedId, setSelectedId] = useState<string>('list-products');
  const [customMethod, setCustomMethod] = useState<'GET' | 'POST'>('GET');
  const [customPath, setCustomPath] = useState<string>(
    '/api/v1/rate/products?limit=3&sort=rating_desc'
  );
  const fieldId = useId();
  const [requestBody, setRequestBody] = useState<string>('');
  const [snippetMode, setSnippetMode] = useState<'curl' | 'fetch' | 'python'>(
    'curl'
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [responseJson, setResponseJson] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);
  const [copiedCatalogMd, setCopiedCatalogMd] = useState<boolean>(false);

  const activePreset =
    presetEndpoints.find((p) => p.id === selectedId) ?? presetEndpoints[0]!;
  const displayedResponse = responseJson ?? t('pgInitialResponseComment');

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
            error: t('pgErrPathPrefix'),
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
            error: t('pgErrConnect'),
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
      await navigator.clipboard.writeText(displayedResponse);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadResponseJson = () => {
    if (typeof document === 'undefined') return;
    const blob = new Blob([displayedResponse], {
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

  const handleCopyApiCatalogMarkdown = async () => {
    if (typeof navigator === 'undefined') return;
    try {
      const lines = [
        t('pgMdTitle', { count: presetEndpoints.length }),
        '',
        t('pgMdHeaderRow'),
        '| --- | --- | --- | --- |',
        ...presetEndpoints.map(
          (ep) =>
            `| \`${ep.method}\` | \`${ep.path}\` | **${ep.title}** | ${ep.description} |`
        ),
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedCatalogMd(true);
      setTimeout(() => setCopiedCatalogMd(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadApiCatalogCsv = () => {
    if (typeof document === 'undefined') return;
    const headers = ['ID', 'Method', 'Path', 'Title', 'Description'];
    const rows = presetEndpoints.map((ep) => [
      ep.id,
      ep.method,
      ep.path,
      ep.title,
      ep.description,
    ]);
    const csvContent = `\uFEFF${[
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.map(escapeCsvCell).join(',')),
    ].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rate-rest-api-v1-catalog.csv';
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
          <span className="fw-bold">{t('pgHeaderTitle')}</span>
          <span className="badge bg-success rounded-pill small">
            {t('pgHeaderBadge')}
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
        <div className="d-flex align-items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopyApiCatalogMarkdown}
            data-testid="copy-api-catalog-md-btn"
            className="btn btn-sm btn-outline-light rounded-pill py-0"
          >
            {copiedCatalogMd ? t('pgCopyMdDone') : t('pgCopyMdBtn')}
          </button>
          <button
            type="button"
            onClick={handleDownloadApiCatalogCsv}
            data-testid="download-api-catalog-csv-btn"
            className="btn btn-sm btn-outline-info rounded-pill py-0"
          >
            {t('pgExportCsvBtn')}
          </button>
        </div>
      </div>

      <div className="card-body p-4">
        {/* Preset Selector Pills */}
        <div className="mb-3">
          <div className="small fw-bold text-uppercase text-muted mb-2">
            {t('pgSelectPresetLabel', { count: presetEndpoints.length })}
          </div>
          <div className="d-flex flex-wrap gap-2">
            {presetEndpoints.map((preset) => {
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
              aria-label={t('pgHttpMethodAria')}
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
              aria-label={t('pgEndpointPathAria')}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary fw-semibold d-inline-flex align-items-center gap-2 px-4"
            >
              <BsPlayFill className="fs-5" />
              {isLoading ? t('pgRunLoading') : t('pgRunBtn')}
            </button>
          </div>

          {customMethod === 'POST' && (
            <div className="mt-3">
              <label
                className="form-label small fw-bold text-uppercase text-muted mb-1"
                htmlFor={`${fieldId}-request-body`}
              >
                {t('pgRequestBodyLabel')}
              </label>
              <textarea
                id={`${fieldId}-request-body`}
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
                    <BsCodeSlash className="me-1" /> {t('pgCodeLabel')}
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
                      <BsCheck2 className="me-1" /> {t('pgCopiedBtn')}
                    </>
                  ) : (
                    <>
                      <BsClipboard className="me-1" /> {t('pgCopyBtn')}
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
                  {t('pgResponsePayloadTitle')}
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
                    {copiedResponse ? t('pgCopyJsonDone') : t('pgCopyJsonBtn')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadResponseJson}
                    className="btn btn-sm btn-outline-info rounded-pill py-0"
                    data-testid="download-api-response-btn"
                  >
                    {t('pgDownloadJsonBtn')}
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
                {displayedResponse}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
