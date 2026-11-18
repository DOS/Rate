'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { escapeCsvCell } from '@/lib/csv-safe';
import { formatNumber } from '@/lib/locale-format';
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

export function sanitizePlaygroundApiPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\p{Cc}+/gu, '').trim();
  if (
    !cleaned ||
    cleaned.length > 2048 ||
    !cleaned.startsWith('/api/') ||
    cleaned.startsWith('/api//') ||
    cleaned.includes('\\') ||
    /(?:^|\/)\.\.(?:\/|\?|$)/.test(cleaned)
  ) {
    return null;
  }
  try {
    const parsed = new URL(cleaned, 'https://rate.vn');
    if (
      parsed.origin !== 'https://rate.vn' ||
      !parsed.pathname.startsWith('/api/') ||
      parsed.pathname.startsWith('/api//')
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}`.replace(
      /['"$`\\]/g,
      (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
    );
  } catch {
    return null;
  }
}

export function sanitizePlaygroundDownloadId(value: unknown): string {
  if (typeof value !== 'string') return 'endpoint';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return cleaned || 'endpoint';
}

export function sanitizePlaygroundMarkdownCell(value: unknown): string {
  if (typeof value !== 'string') return '-';
  const cleaned = value
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\|/g, '-')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  return cleaned || '-';
}

export interface ApiPlaygroundClientProps {
  initialMethod?: 'GET' | 'POST';
  initialPath?: string;
  initialBody?: string;
  initialSnippetMode?: 'curl' | 'fetch' | 'python';
}

export interface PlaygroundSnippets {
  safeSnippetPath: string;
  curlSnippet: string;
  fetchSnippet: string;
  pythonSnippet: string;
}

export interface PlaygroundRequestResult {
  statusCode: number;
  latencyMs: number | null;
  responseJson: string;
}

export interface PlaygroundAcceptedResponseState {
  statusCode: number | null;
  latencyMs: number | null;
  responseJson: string | null;
  responseDownloadSlug: string;
}

const DEFAULT_PLAYGROUND_PATH =
  '/api/v1/rate/products?limit=3&sort=rating_desc';
const MAX_NON_JSON_BODY_CHARS = 16_384;
const MAX_SNIPPET_JSON_DEPTH = 12;
const MAX_SNIPPET_BODY_CHARS = 8_192;

function toPythonStringLiteral(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x5c) {
      out += '\\\\';
    } else if (code === 0x22) {
      out += '\\"';
    } else if (code === 0x0a) {
      out += '\\n';
    } else if (code === 0x0d) {
      out += '\\r';
    } else if (code === 0x09) {
      out += '\\t';
    } else if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029
    ) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value[i]! + value[i + 1]!;
        i++;
      } else {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      out += value[i]!;
    }
  }
  out += '"';
  return out;
}

function formatPythonLiteralBounded(
  value: unknown,
  indent: number,
  maxDepth: number,
  budget: { remaining: number }
): string | null {
  const consume = (chunk: string): string | null => {
    budget.remaining -= chunk.length;
    return budget.remaining < 0 ? null : chunk;
  };

  const visit = (
    current: unknown,
    currentIndent: number,
    depth: number
  ): string | null => {
    if (current === null || current === undefined) return consume('None');
    if (typeof current === 'boolean') {
      return consume(current ? 'True' : 'False');
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) return consume('None');
      return consume(Object.is(current, -0) ? '-0.0' : String(current));
    }
    if (typeof current === 'string') {
      return consume(toPythonStringLiteral(current));
    }
    if (Array.isArray(current)) {
      if (current.length === 0) return consume('[]');
      if (depth >= maxDepth) return null;
      if (consume('[\n') === null) return null;
      const pad = ' '.repeat(currentIndent);
      const childPad = ' '.repeat(currentIndent + 4);
      const items: string[] = [];
      for (const item of current) {
        if (consume(childPad) === null) return null;
        const rendered = visit(item, currentIndent + 4, depth + 1);
        if (rendered === null) return null;
        if (consume(',\n') === null) return null;
        items.push(`${childPad}${rendered},`);
      }
      if (consume(`${pad}]`) === null) return null;
      return `[\n${items.join('\n')}\n${pad}]`;
    }
    if (typeof current === 'object') {
      const entries = Object.entries(current as Record<string, unknown>);
      if (entries.length === 0) return consume('{}');
      if (depth >= maxDepth) return null;
      if (consume('{\n') === null) return null;
      const pad = ' '.repeat(currentIndent);
      const childPad = ' '.repeat(currentIndent + 4);
      const lines: string[] = [];
      for (const [k, v] of entries) {
        const keyLiteral = toPythonStringLiteral(k);
        if (consume(`${childPad}${keyLiteral}: `) === null) return null;
        const rendered = visit(v, currentIndent + 4, depth + 1);
        if (rendered === null) return null;
        if (consume(',\n') === null) return null;
        lines.push(`${childPad}${keyLiteral}: ${rendered},`);
      }
      if (consume(`${pad}}`) === null) return null;
      return `{\n${lines.join('\n')}\n${pad}}`;
    }
    return consume('None');
  };

  return visit(value, indent, 0);
}

export function toPythonLiteral(value: unknown, indent = 0): string {
  const bounded = formatPythonLiteralBounded(
    value,
    indent,
    MAX_SNIPPET_JSON_DEPTH,
    { remaining: MAX_SNIPPET_BODY_CHARS }
  );
  return bounded ?? 'None';
}

function escapeShellSingleQuoted(value: string): string {
  return value.split('\0').join('').replace(/'/g, "'\\''");
}

function escapeJsStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function hasOwnProtoKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasOwnProtoKey);
  if (Object.prototype.hasOwnProperty.call(value, '__proto__')) return true;
  return Object.values(value as Record<string, unknown>).some(hasOwnProtoKey);
}

function isLosslessBoundedJsonSource(
  trimmedSource: string,
  maxDepth: number,
  maxChars: number
): boolean {
  let depth = 0;
  let nonWhitespaceChars = 0;
  const maxNonWhitespaceSourceChars = maxChars * 6;
  const objectKeyStack: Array<Set<string> | null> = [];
  let lastStringToken: string | null = null;
  let i = 0;
  const len = trimmedSource.length;

  while (i < len) {
    const ch = trimmedSource[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    nonWhitespaceChars += 1;
    if (nonWhitespaceChars > maxNonWhitespaceSourceChars) {
      return false;
    }
    if (ch === '"') {
      const start = i;
      i += 1;
      while (i < len) {
        const c = trimmedSource[i]!;
        if (c === '\\') {
          i += 2;
        } else if (c === '"') {
          i += 1;
          break;
        } else {
          i += 1;
        }
      }
      nonWhitespaceChars += i - start - 1;
      if (nonWhitespaceChars > maxNonWhitespaceSourceChars) {
        return false;
      }
      lastStringToken = trimmedSource.slice(start, i);
      continue;
    }
    if (ch === ':') {
      const currentKeys = objectKeyStack[objectKeyStack.length - 1];
      if (currentKeys && lastStringToken !== null) {
        const parsedKey = JSON.parse(lastStringToken) as string;
        if (currentKeys.has(parsedKey)) {
          return false;
        }
        currentKeys.add(parsedKey);
      }
      lastStringToken = null;
      i += 1;
      continue;
    }
    lastStringToken = null;
    if (ch === '{' || ch === '[') {
      depth += 1;
      if (depth > maxDepth) {
        return false;
      }
      objectKeyStack.push(ch === '{' ? new Set<string>() : null);
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth -= 1;
      objectKeyStack.pop();
      i += 1;
      continue;
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      const start = i;
      i += 1;
      while (i < len) {
        const c = trimmedSource[i]!;
        if (
          (c >= '0' && c <= '9') ||
          c === '.' ||
          c === 'e' ||
          c === 'E' ||
          c === '+' ||
          c === '-'
        ) {
          i += 1;
        } else {
          break;
        }
      }
      const numToken = trimmedSource.slice(start, i);
      nonWhitespaceChars += numToken.length - 1;
      if (nonWhitespaceChars > maxNonWhitespaceSourceChars) {
        return false;
      }
      const num = Number(numToken);
      if (
        !Number.isFinite(num) ||
        Object.is(num, -0) ||
        String(num) !== numToken
      ) {
        return false;
      }
      continue;
    }
    i += 1;
  }

  return true;
}

export function buildPlaygroundSnippets(options: {
  method: 'GET' | 'POST';
  customPath: string;
  requestBody: string;
}): PlaygroundSnippets {
  const { method, customPath, requestBody } = options;
  const safeSnippetPath =
    sanitizePlaygroundApiPath(customPath) ?? '/api/v1/rate/products';

  if (method !== 'POST') {
    return {
      safeSnippetPath,
      curlSnippet: `curl -X GET "https://rate.vn${safeSnippetPath}" \\\n  -H "Accept: application/json"`,
      fetchSnippet: `const res = await fetch("https://rate.vn${safeSnippetPath}", {\n  headers: { Accept: "application/json" },\n});\nconst data = await res.json();`,
      pythonSnippet: `import requests\n\nres = requests.get(\n    "https://rate.vn${safeSnippetPath}",\n    headers={"Accept": "application/json"},\n    timeout=15,\n)\nprint(res.status_code, res.json())`,
    };
  }

  const trimmedBody = requestBody.trim();
  let parsedJson: { ok: true; value: unknown } | { ok: false };
  if (!trimmedBody) {
    parsedJson = { ok: true, value: {} };
  } else {
    try {
      parsedJson = { ok: true, value: JSON.parse(trimmedBody) };
    } catch {
      parsedJson = { ok: false };
    }
  }

  const isLosslessBoundedSource =
    parsedJson.ok &&
    (!trimmedBody ||
      isLosslessBoundedJsonSource(
        trimmedBody,
        MAX_SNIPPET_JSON_DEPTH,
        MAX_SNIPPET_BODY_CHARS
      ));
  const compactJson =
    isLosslessBoundedSource && parsedJson.ok
      ? JSON.stringify(parsedJson.value)
      : null;
  const canUseCompactJson =
    compactJson !== null && compactJson.length <= MAX_SNIPPET_BODY_CHARS;
  const rawFallbackBody = parsedJson.ok ? trimmedBody : requestBody;

  const curlPayload =
    canUseCompactJson && parsedJson.ok && parsedJson.value !== null
      ? compactJson
      : parsedJson.ok && parsedJson.value === null
        ? 'null'
        : rawFallbackBody;
  const curlSnippet = `curl -X POST "https://rate.vn${safeSnippetPath}" \\\n  -H "Accept: application/json" \\\n  -H "Content-Type: application/json" \\\n  --data-raw '${escapeShellSingleQuoted(curlPayload)}'`;

  let fetchBodyExpr: string;
  if (!canUseCompactJson || !parsedJson.ok || parsedJson.value === null) {
    fetchBodyExpr = escapeJsStringLiteral(
      parsedJson.ok && parsedJson.value === null ? 'null' : rawFallbackBody
    );
  } else if (hasOwnProtoKey(parsedJson.value)) {
    fetchBodyExpr = escapeJsStringLiteral(compactJson);
  } else {
    const prettyJson = JSON.stringify(parsedJson.value, null, 2);
    if (prettyJson.length <= MAX_SNIPPET_BODY_CHARS) {
      const formatted = prettyJson
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
        .replace(/\n/g, '\n  ');
      fetchBodyExpr = `JSON.stringify(${formatted})`;
    } else {
      fetchBodyExpr = escapeJsStringLiteral(rawFallbackBody);
    }
  }
  const fetchSnippet = `const res = await fetch("https://rate.vn${safeSnippetPath}", {\n  method: "POST",\n  headers: {\n    Accept: "application/json",\n    "Content-Type": "application/json",\n  },\n  body: ${fetchBodyExpr},\n});\nconst data = await res.json();`;

  let pythonSnippet: string;
  if (parsedJson.ok && parsedJson.value === null) {
    pythonSnippet = `import requests\n\nres = requests.post(\n    "https://rate.vn${safeSnippetPath}",\n    headers={"Accept": "application/json", "Content-Type": "application/json"},\n    data=b"null",\n    timeout=15,\n)\nprint(res.status_code, res.json())`;
  } else {
    const pythonLiteral =
      canUseCompactJson && parsedJson.ok
        ? formatPythonLiteralBounded(
            parsedJson.value,
            4,
            MAX_SNIPPET_JSON_DEPTH,
            { remaining: MAX_SNIPPET_BODY_CHARS }
          )
        : null;
    pythonSnippet =
      pythonLiteral !== null
        ? `import requests\n\nres = requests.post(\n    "https://rate.vn${safeSnippetPath}",\n    headers={"Accept": "application/json"},\n    json=${pythonLiteral},\n    timeout=15,\n)\nprint(res.status_code, res.json())`
        : `import requests\n\nres = requests.post(\n    "https://rate.vn${safeSnippetPath}",\n    headers={"Accept": "application/json", "Content-Type": "application/json"},\n    data=${toPythonStringLiteral(rawFallbackBody)}.encode("utf-8"),\n    timeout=15,\n)\nprint(res.status_code, res.json())`;
  }

  return {
    safeSnippetPath,
    curlSnippet,
    fetchSnippet,
    pythonSnippet,
  };
}

export function findMatchingPlaygroundPreset<
  T extends Pick<ApiPresetEndpoint, 'id' | 'method' | 'path'>,
>(
  presets: readonly T[],
  customMethod: 'GET' | 'POST',
  customPath: string
): T | null {
  const trimmedPath = customPath.trim();
  return (
    presets.find(
      (preset) => preset.method === customMethod && preset.path === trimmedPath
    ) ?? null
  );
}

export function resolvePlaygroundDownloadSlug(
  matchedPreset: Pick<ApiPresetEndpoint, 'id'> | null | undefined,
  safeSnippetPath: string
): string {
  if (matchedPreset?.id) {
    return sanitizePlaygroundDownloadId(matchedPreset.id);
  }
  const stripped = safeSnippetPath.replace(/^\/api\/(?:v1\/rate\/)?/i, '');
  return sanitizePlaygroundDownloadId(stripped);
}

export function createInitialPlaygroundResponseState(
  presets: readonly Pick<ApiPresetEndpoint, 'id' | 'method' | 'path'>[],
  initialMethod: 'GET' | 'POST',
  initialPath: string
): PlaygroundAcceptedResponseState {
  const safeInitialPath =
    sanitizePlaygroundApiPath(initialPath) ?? '/api/v1/rate/products';
  const initialPreset = findMatchingPlaygroundPreset(
    presets,
    initialMethod,
    initialPath
  );
  return {
    statusCode: null,
    latencyMs: null,
    responseJson: null,
    responseDownloadSlug: resolvePlaygroundDownloadSlug(
      initialPreset,
      safeInitialPath
    ),
  };
}

export function selectPresetPlaygroundResponseState(
  preset: Pick<ApiPresetEndpoint, 'id'>
): PlaygroundAcceptedResponseState {
  return {
    statusCode: null,
    latencyMs: null,
    responseJson: null,
    responseDownloadSlug: sanitizePlaygroundDownloadId(preset.id),
  };
}

export function acceptExecutedPlaygroundResponseState(
  presets: readonly Pick<ApiPresetEndpoint, 'id' | 'method' | 'path'>[],
  executedMethod: 'GET' | 'POST',
  executedPath: string,
  outcome: PlaygroundRequestResult
): PlaygroundAcceptedResponseState {
  const targetPath = sanitizePlaygroundApiPath(executedPath);
  const matched = targetPath
    ? findMatchingPlaygroundPreset(presets, executedMethod, executedPath)
    : null;
  return {
    statusCode: outcome.statusCode,
    latencyMs: outcome.latencyMs,
    responseJson: outcome.responseJson,
    responseDownloadSlug: targetPath
      ? resolvePlaygroundDownloadSlug(matched, targetPath)
      : 'endpoint',
  };
}

export function formatPlaygroundResponsePayload(
  rawText: string,
  status: number
): string {
  if (!rawText.trim()) {
    return JSON.stringify({ status, body: null }, null, 2);
  }
  try {
    const parsed: unknown = JSON.parse(rawText);
    return JSON.stringify(parsed, null, 2);
  } catch {
    const boundedBody =
      rawText.length > MAX_NON_JSON_BODY_CHARS
        ? `${rawText.slice(0, MAX_NON_JSON_BODY_CHARS)}...`
        : rawText;
    return JSON.stringify({ status, body: boundedBody }, null, 2);
  }
}

export async function executePlaygroundRequest(options: {
  method: 'GET' | 'POST';
  customPath: string;
  requestBody: string;
  invalidPathMessage: string;
  connectErrorMessage: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<PlaygroundRequestResult> {
  const {
    method,
    customPath,
    requestBody,
    invalidPathMessage,
    connectErrorMessage,
    fetchImpl = fetch,
    now = () => performance.now(),
  } = options;

  const targetPath = sanitizePlaygroundApiPath(customPath);
  if (!targetPath) {
    return {
      statusCode: 400,
      latencyMs: null,
      responseJson: JSON.stringify({ error: invalidPathMessage }, null, 2),
    };
  }

  const start = now();
  try {
    const fetchInit: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' && requestBody.trim() ? { body: requestBody } : {}),
    };

    const res = await fetchImpl(targetPath, fetchInit);
    const rawText = await res.text();
    const elapsed = Math.max(0, Math.round(now() - start));
    return {
      statusCode: res.status,
      latencyMs: elapsed,
      responseJson: formatPlaygroundResponsePayload(rawText, res.status),
    };
  } catch (err) {
    return {
      statusCode: 500,
      latencyMs: null,
      responseJson: JSON.stringify(
        {
          error: connectErrorMessage,
          details: err instanceof Error ? err.message : String(err),
        },
        null,
        2
      ),
    };
  }
}

export default function ApiPlaygroundClient({
  initialMethod = 'GET',
  initialPath = DEFAULT_PLAYGROUND_PATH,
  initialBody = '',
  initialSnippetMode = 'curl',
}: ApiPlaygroundClientProps) {
  const t = useTranslations('developers');
  const locale = useLocale();

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
            selectedVariant: '256GB Titan Tự Nhiên',
            price: 30990000,
            originalPrice: 34990000,
            userConsentOptIn: true,
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

  const [customMethod, setCustomMethod] = useState<'GET' | 'POST'>(
    initialMethod
  );
  const [customPath, setCustomPath] = useState<string>(initialPath);
  const fieldId = useId();
  const [requestBody, setRequestBody] = useState<string>(initialBody);
  const [snippetMode, setSnippetMode] = useState<'curl' | 'fetch' | 'python'>(
    initialSnippetMode
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [
    { statusCode, latencyMs, responseJson, responseDownloadSlug },
    setAcceptedResponse,
  ] = useState<PlaygroundAcceptedResponseState>(() =>
    createInitialPlaygroundResponseState(
      presetEndpoints,
      initialMethod,
      initialPath
    )
  );
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);
  const [copiedCatalogMd, setCopiedCatalogMd] = useState<boolean>(false);
  const requestSeqRef = useRef<number>(0);

  const matchedPreset = useMemo(
    () =>
      findMatchingPlaygroundPreset(presetEndpoints, customMethod, customPath),
    [presetEndpoints, customMethod, customPath]
  );
  const displayedResponse = responseJson ?? t('pgInitialResponseComment');

  const handleSelectPreset = (preset: ApiPresetEndpoint) => {
    requestSeqRef.current += 1;
    setIsLoading(false);
    setCustomMethod(preset.method);
    setCustomPath(preset.path);
    setRequestBody(preset.defaultBody ?? '');
    setAcceptedResponse(selectPresetPlaygroundResponseState(preset));
  };

  const handleRunRequest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const executedMethod = customMethod;
    const executedPath = customPath;
    const executedBody = requestBody;
    if (!sanitizePlaygroundApiPath(executedPath)) {
      requestSeqRef.current += 1;
      setIsLoading(false);
      setAcceptedResponse(
        acceptExecutedPlaygroundResponseState(
          presetEndpoints,
          executedMethod,
          executedPath,
          {
            statusCode: 400,
            latencyMs: null,
            responseJson: JSON.stringify(
              {
                error: t('pgErrPathPrefix'),
              },
              null,
              2
            ),
          }
        )
      );
      return;
    }

    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    try {
      const outcome = await executePlaygroundRequest({
        method: executedMethod,
        customPath: executedPath,
        requestBody: executedBody,
        invalidPathMessage: t('pgErrPathPrefix'),
        connectErrorMessage: t('pgErrConnect'),
      });
      if (requestSeqRef.current !== seq) return;
      setAcceptedResponse(
        acceptExecutedPlaygroundResponseState(
          presetEndpoints,
          executedMethod,
          executedPath,
          outcome
        )
      );
    } finally {
      if (requestSeqRef.current === seq) {
        setIsLoading(false);
      }
    }
  };

  const { curlSnippet, fetchSnippet, pythonSnippet } = useMemo(
    () =>
      buildPlaygroundSnippets({
        method: customMethod,
        customPath,
        requestBody,
      }),
    [customMethod, customPath, requestBody]
  );

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
    a.download = `rate-api-${responseDownloadSlug}.json`;
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
            `| \`${sanitizePlaygroundMarkdownCell(ep.method)}\` | \`${sanitizePlaygroundMarkdownCell(ep.path)}\` | **${sanitizePlaygroundMarkdownCell(ep.title)}** | ${sanitizePlaygroundMarkdownCell(ep.description)} |`
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
          <BsTerminal aria-hidden="true" className="text-danger fs-5" />
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
            <BsFileEarmarkCode aria-hidden="true" /> OpenAPI 3.1 JSON
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
          <div
            id={`${fieldId}-presets`}
            className="small fw-bold text-uppercase text-muted mb-2"
          >
            {t('pgSelectPresetLabel', { count: presetEndpoints.length })}
          </div>
          {/* The pressed preset is exposed, not only its colour (DOS/Rate#1069). */}
          <div
            className="d-flex flex-wrap gap-2"
            role="group"
            aria-labelledby={`${fieldId}-presets`}
          >
            {presetEndpoints.map((preset) => {
              const isSelected = matchedPreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isSelected}
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
          {matchedPreset && (
            <p className="text-muted small mt-2 mb-0">
              <BsLightningChargeFill
                aria-hidden="true"
                className="text-warning me-1"
              />
              {matchedPreset.description}
            </p>
          )}
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
              <BsPlayFill aria-hidden="true" className="fs-5" />
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
                placeholder='{"userConsentOptIn": true, ...}'
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
                  <span
                    id={`${fieldId}-code`}
                    className="small fw-semibold text-white-50"
                  >
                    <BsCodeSlash aria-hidden="true" className="me-1" />{' '}
                    {t('pgCodeLabel')}
                  </span>
                  <div
                    className="btn-group btn-group-sm"
                    role="group"
                    aria-labelledby={`${fieldId}-code`}
                  >
                    <button
                      type="button"
                      aria-pressed={snippetMode === 'curl'}
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
                      aria-pressed={snippetMode === 'fetch'}
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
                      aria-pressed={snippetMode === 'python'}
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
                      <BsCheck2 aria-hidden="true" className="me-1" />{' '}
                      {t('pgCopiedBtn')}
                    </>
                  ) : (
                    <>
                      <BsClipboard aria-hidden="true" className="me-1" />{' '}
                      {t('pgCopyBtn')}
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
                      {formatNumber(latencyMs, locale)} ms
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
