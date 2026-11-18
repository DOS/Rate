import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

import ApiPlaygroundClient, {
  buildPlaygroundSnippets,
  executePlaygroundRequest,
  findMatchingPlaygroundPreset,
  formatPlaygroundResponsePayload,
  resolvePlaygroundDownloadSlug,
  toPythonLiteral,
  type ApiPresetEndpoint,
} from '@/components/developers/ApiPlaygroundClient';
import { pickClientMessages } from '@/lib/client-messages';
import { formatNumber } from '@/lib/locale-format';

// The /developers API table and spec group cards read their access, cache
// and title text from the messages, so the Czech and Vietnamese pages are
// not left with English cells (DOS/Rate#1372).

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, '../../..');
const page = fs.readFileSync(
  path.join(root, 'src/app/[locale]/developers/page.tsx'),
  'utf8'
);
const playgroundSrc = fs.readFileSync(
  path.join(root, 'src/components/developers/ApiPlaygroundClient.tsx'),
  'utf8'
);
const fullCatalogs = Object.fromEntries(
  (['vi', 'en', 'cs'] as const).map((locale) => [
    locale,
    JSON.parse(
      fs.readFileSync(path.join(root, `locales/${locale}.json`), 'utf8')
    ) as Record<string, unknown>,
  ])
);
const messages = Object.fromEntries(
  (['vi', 'en', 'cs'] as const).map((locale) => [
    locale,
    fullCatalogs[locale]!.developers as Record<string, unknown>,
  ])
);

// No access label, no-store note or group title is written in the page.
for (const english of [
  'Public (CORS)',
  'Opt-in consent required',
  'Bearer token (Supabase Auth)',
  '(queues rate.crawl_jobs)',
  '(database trigger)',
  'Cameras (PhoneArena split)',
  'Launch & availability',
]) {
  assert.ok(!page.includes(`'${english}`), `page still writes "${english}"`);
}
assert.doesNotMatch(page, /\btitle: '/, 'group titles come from messages');

const keys = [
  'authPublic',
  'authOptIn',
  'authBearer',
  'cacheNoStoreQueue',
  'cacheNoStoreRpc',
  'cacheNoStoreTrigger',
];
const groups = [
  'launch',
  'body',
  'display',
  'platform',
  'memory',
  'cameras',
  'audio',
  'connectivity',
  'battery',
  'misc',
];
for (const locale of ['vi', 'en', 'cs']) {
  const dev = messages[locale]!;
  const titles = dev.groupTitles as Record<string, string>;
  for (const key of keys) {
    assert.equal(typeof dev[key], 'string', `${locale}.${key}`);
  }
  assert.deepEqual(Object.keys(titles).sort(), [...groups].sort(), locale);
  for (const value of [
    ...keys.map((key) => dev[key]),
    ...groups.map((group) => titles[group]),
  ]) {
    assert.ok(
      typeof value === 'string' && value.trim().length > 0,
      `${locale}: an empty label`
    );
  }
}
for (const group of groups) {
  assert.ok(page.includes(`key: '${group}'`), `${group} card exists`);
}
// The page renders them through t(), not a literal.
for (const key of keys) {
  assert.ok(page.includes(`t('${key}')`), `the page renders ${key}`);
}
assert.ok(page.includes('t(`groupTitles.${group.key}`)'), 'group titles');
assert.doesNotMatch(page, /\((?:Ultrawide|Telephoto)\)/, 'no English notes');
// The Czech and Vietnamese text differs from the English wherever words,
// not identifiers, carry the meaning.
for (const locale of ['vi', 'cs']) {
  const dev = messages[locale]!;
  for (const key of ['authPublic', 'authOptIn', 'cacheNoStoreQueue']) {
    assert.notEqual(dev[key], messages.en![key], `${locale}.${key}`);
  }
  for (const group of groups) {
    assert.notEqual(
      (dev.groupTitles as Record<string, string>)[group],
      (messages.en!.groupTitles as Record<string, string>)[group],
      `${locale} group ${group}`
    );
  }
}

console.warn('  ✅ /developers table and group titles are localized (#1372)');

// ---------------------------------------------------------------------------
// DOS/Rate#1747: Runnable POST snippets, non-JSON HTTP status preservation,
// preset state synchronization, decorative icon a11y, th scope & telemetry formatting.
// ---------------------------------------------------------------------------

function stripDoubleQuotedStrings(code: string): string {
  return code.replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function assertValidAsyncFetchSyntax(snippet: string, label: string): void {
  assert.doesNotThrow(() => {
    new vm.Script(`(async () => {\n${snippet}\n});`);
  }, `fetchSnippet must parse cleanly (${label})`);
}

// 1. toPythonLiteral & buildPlaygroundSnippets (extension-ingest booleans/nulls,
//    string-literal spaces, and mid-edit non-JSON safety).
const extensionIngestBody = JSON.stringify(
  {
    url: 'https://cellphones.com.vn/iphone-16-pro-max.html?utm_source=extension_test&officialOnly=true&cursor=null',
    platform: 'cellphones',
    title: 'iPhone 16 Pro Max  256GB   Chính hãng VN/A',
    selectedVariant: "256GB  Titan   Tự Nhiên ('VN/A')",
    price: 30990000,
    originalPrice: 34990000,
    userConsentOptIn: true,
    isSponsored: false,
    couponCode: null,
    tags: [true, false, null, 'keep  double   spaces'],
  },
  null,
  2
);

const postSnippets = buildPlaygroundSnippets({
  method: 'POST',
  customPath: '/api/v1/rate/extension/ingest',
  requestBody: extensionIngestBody,
});

assert.ok(
  postSnippets.pythonSnippet.includes('"userConsentOptIn": True,') &&
    postSnippets.pythonSnippet.includes('"isSponsored": False,') &&
    postSnippets.pythonSnippet.includes('"couponCode": None,'),
  'pythonSnippet converts JSON true/false/null to Python True/False/None'
);
assert.ok(
  postSnippets.pythonSnippet.includes('officialOnly=true&cursor=null'),
  'pythonSnippet preserves lowercase true/null inside URL string literals'
);
assert.doesNotMatch(
  stripDoubleQuotedStrings(postSnippets.pythonSnippet),
  /\b(?:true|false|null)\b/,
  'pythonSnippet must not emit bare JSON true/false/null tokens outside strings'
);
assert.equal(
  toPythonLiteral({
    lineBreak: 'line1\nline2\t"quoted"\\slash\u0000',
    negZero: -0,
    emptyArr: [],
    emptyObj: {},
  }),
  '{\n    "lineBreak": "line1\\nline2\\t\\"quoted\\"\\\\slash\\u0000",\n    "negZero": -0.0,\n    "emptyArr": [],\n    "emptyObj": {},\n}'
);

// curlSnippet preserves spaces inside string values and escapes single quotes.
assert.ok(
  postSnippets.curlSnippet.includes(
    '"title":"iPhone 16 Pro Max  256GB   Chính hãng VN/A"'
  ),
  'curlSnippet preserves consecutive spaces inside JSON string values'
);
assert.ok(
  postSnippets.curlSnippet.includes("256GB  Titan   Tự Nhiên ('\\''VN/A'\\'')"),
  'curlSnippet escapes single quotes for POSIX single-quoted -d flag'
);

assertValidAsyncFetchSyntax(postSnippets.fetchSnippet, 'valid POST JSON');
assertValidAsyncFetchSyntax(
  buildPlaygroundSnippets({
    method: 'GET',
    customPath: '/api/v1/rate/products?limit=3&sort=rating_desc',
    requestBody: '',
  }).fetchSnippet,
  'GET request'
);
assertValidAsyncFetchSyntax(
  buildPlaygroundSnippets({
    method: 'POST',
    customPath: '/api/v1/rate/extension/ingest',
    requestBody: '   ',
  }).fetchSnippet,
  'blank POST body'
);
assertValidAsyncFetchSyntax(
  buildPlaygroundSnippets({
    method: 'POST',
    customPath: '/api/v1/rate/extension/ingest',
    requestBody: '{"__proto__":{"polluted":true},"lineSep":"\u2028\u2029"}',
  }).fetchSnippet,
  '__proto__ and line separators'
);

// Mid-edit non-JSON payloads keep fetchSnippet & pythonSnippet valid and preserve spaces.
for (const brokenBody of [
  '{"userConsentOptIn": tru',
  '{"title": "iPhone  16   Pro',
  'raw line 1\nraw   line 2 "quote" \'single\' \\backslash `${1 + 1}`',
]) {
  const midEdit = buildPlaygroundSnippets({
    method: 'POST',
    customPath: '/api/v1/rate/extension/ingest',
    requestBody: brokenBody,
  });
  assertValidAsyncFetchSyntax(midEdit.fetchSnippet, `mid-edit: ${brokenBody}`);
  assert.ok(
    midEdit.pythonSnippet.includes('data="'),
    'non-JSON POST body falls back to Python string data=...'
  );
  assert.doesNotMatch(
    stripDoubleQuotedStrings(midEdit.pythonSnippet),
    /\b(?:true|false|null|tru)\b/,
    'non-JSON pythonSnippet has no unquoted broken tokens outside string literal'
  );
}
assert.ok(
  buildPlaygroundSnippets({
    method: 'POST',
    customPath: '/api/v1/rate/extension/ingest',
    requestBody: '{"title": "iPhone  16   Pro',
  }).curlSnippet.includes('iPhone  16   Pro'),
  'mid-edit curlSnippet does not collapse inner spaces'
);

// 2. Preset matching and download filename slug synchronization.
const samplePresets: ApiPresetEndpoint[] = [
  {
    id: 'list-products',
    method: 'GET',
    title: 'List products',
    path: '/api/v1/rate/products?limit=3&sort=rating_desc',
    description: 'Desc 1',
  },
  {
    id: 'extension-ingest',
    method: 'POST',
    title: 'Extension ingest',
    path: '/api/v1/rate/extension/ingest',
    description: 'Desc 8',
  },
];

assert.equal(
  findMatchingPlaygroundPreset(
    samplePresets,
    'GET',
    '  /api/v1/rate/products?limit=3&sort=rating_desc  '
  )?.id,
  'list-products'
);
assert.equal(
  findMatchingPlaygroundPreset(
    samplePresets,
    'POST',
    '/api/v1/rate/products?limit=3&sort=rating_desc'
  ),
  null,
  'changing method from GET to POST clears GET preset match'
);
assert.equal(
  findMatchingPlaygroundPreset(
    samplePresets,
    'GET',
    '/api/v1/rate/products?limit=10'
  ),
  null,
  'editing query string clears preset match'
);
assert.equal(
  findMatchingPlaygroundPreset(
    samplePresets,
    'POST',
    '/api/v1/rate/extension/ingest'
  )?.id,
  'extension-ingest'
);

assert.equal(
  resolvePlaygroundDownloadSlug(
    samplePresets[0],
    '/api/v1/rate/products?limit=3&sort=rating_desc'
  ),
  'list-products'
);
assert.equal(
  resolvePlaygroundDownloadSlug(
    null,
    '/api/v1/rate/merchants/directory?limit=5'
  ),
  'merchants-directory-limit-5'
);
assert.equal(
  resolvePlaygroundDownloadSlug(null, '/api/reviews/123/vote'),
  'reviews-123-vote'
);
assert.equal(resolvePlaygroundDownloadSlug(null, '/api/v1/rate/'), 'endpoint');

// 3. SSR render verification of ApiPlaygroundClient across vi, en, cs.
const IntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string;
  messages: Record<string, unknown>;
  timeZone: string;
  children?: React.ReactNode;
}>;

for (const locale of ['vi', 'en', 'cs'] as const) {
  const clientScoped = {
    ...pickClientMessages(fullCatalogs[locale]!),
    developers: messages[locale]!,
  };

  // Default state: exactly 1 preset pill pressed, preset 1 description shown, all SVGs aria-hidden.
  const defaultHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale, messages: clientScoped, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ApiPlaygroundClient)
    )
  );
  const svgTags = [...defaultHtml.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(svgTags.length >= 5, `${locale}: renders decorative SVG icons`);
  for (const svgTag of svgTags) {
    assert.match(
      svgTag,
      /\baria-hidden="true"/,
      `${locale}: every rendered SVG icon must carry aria-hidden="true": ${svgTag}`
    );
  }
  // 1 pressed preset pill + 1 pressed snippet mode pill = 2 total aria-pressed="true" buttons.
  assert.equal(
    [...defaultHtml.matchAll(/\baria-pressed="true"/g)].length,
    2,
    `${locale}: default playground has 1 active preset pill and 1 active snippet mode pill`
  );
  assert.ok(
    defaultHtml.includes(String(messages[locale]!.pgPreset1Desc)),
    `${locale}: default playground renders active preset description`
  );

  // Edited customPath: 0 preset pills pressed (only snippet mode pill stays pressed), stale description cleared.
  const editedPathHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale, messages: clientScoped, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ApiPlaygroundClient, {
        initialMethod: 'GET',
        initialPath: '/api/v1/rate/products?limit=99',
      })
    )
  );
  assert.equal(
    [...editedPathHtml.matchAll(/\baria-pressed="true"/g)].length,
    1,
    `${locale}: custom path clears aria-pressed="true" on all preset pills`
  );
  for (let i = 1; i <= 13; i++) {
    assert.equal(
      editedPathHtml.includes(String(messages[locale]![`pgPreset${i}Desc`])),
      false,
      `${locale}: custom path clears stale preset ${i} description`
    );
  }

  // Edited customMethod (POST on GET preset path): 0 preset pills pressed.
  const editedMethodHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale, messages: clientScoped, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ApiPlaygroundClient, {
        initialMethod: 'POST',
        initialPath: '/api/v1/rate/products?limit=3&sort=rating_desc',
      })
    )
  );
  assert.equal(
    [...editedMethodHtml.matchAll(/\baria-pressed="true"/g)].length,
    1,
    `${locale}: changing method clears aria-pressed="true" on GET preset pill`
  );

  // Built-in extension-ingest POST preset in Python mode renders True, never bare true.
  const ingestPythonHtml = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale, messages: clientScoped, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(ApiPlaygroundClient, {
        initialMethod: 'POST',
        initialPath: '/api/v1/rate/extension/ingest',
        initialBody: JSON.stringify({ userConsentOptIn: true }, null, 2),
        initialSnippetMode: 'python',
      })
    )
  );
  assert.equal(
    [...ingestPythonHtml.matchAll(/\baria-pressed="true"/g)].length,
    2,
    `${locale}: extension-ingest POST preset matches and marks preset pill pressed`
  );
  assert.ok(
    ingestPythonHtml.includes(String(messages[locale]!.pgPreset8Desc)),
    `${locale}: extension-ingest preset renders pgPreset8Desc`
  );
  const snippetPreMatch = ingestPythonHtml.match(
    /<pre class="font-monospace small text-warning mb-0"[^>]*>([\s\S]*?)<\/pre>/
  );
  assert.ok(snippetPreMatch, `${locale}: renders active code snippet <pre>`);
  const pythonPreHtml = snippetPreMatch[1]!;
  assert.ok(
    pythonPreHtml.includes('&quot;userConsentOptIn&quot;: True'),
    `${locale}: rendered Python snippet uses Python True`
  );
  assert.equal(
    pythonPreHtml.includes('&quot;userConsentOptIn&quot;: true'),
    false,
    `${locale}: rendered Python snippet never emits bare JSON true`
  );
}

// 4. Source-level guards for all 13 <Bs* /> icons (7 in ApiPlaygroundClient + 6 in page.tsx),
//    scope="col" on all 5 <th> cells, and formatNumber(..., locale) on telemetry counters.
const playgroundBsTags = [
  ...playgroundSrc.matchAll(/<Bs[A-Z]\w*[\s\S]*?\/>/g),
].map((m) => m[0]);
const pageBsTags = [...page.matchAll(/<Bs[A-Z]\w*[\s\S]*?\/>/g)].map(
  (m) => m[0]
);
assert.equal(
  playgroundBsTags.length,
  7,
  'ApiPlaygroundClient renders 7 decorative Bs* icons'
);
assert.equal(
  pageBsTags.length,
  6,
  'developers/page.tsx renders 6 decorative Bs* icons'
);
for (const tag of [...playgroundBsTags, ...pageBsTags]) {
  assert.match(
    tag,
    /\baria-hidden="true"/,
    `Decorative Bs* icon must include aria-hidden="true": ${tag}`
  );
}

const thTags = [...page.matchAll(/<th\b[^>]*>/g)].map((m) => m[0]);
assert.equal(
  thTags.length,
  5,
  'developers/page.tsx endpoint table has 5 <th> headers'
);
for (const thTag of thTags) {
  assert.match(
    thTag,
    /\bscope="col"/,
    `Endpoint table <th> must include scope="col": ${thTag}`
  );
}

for (const statField of [
  'stats.masterProductsCount',
  'stats.priceObservationsCount',
  'stats.totalReviewsCount',
  'stats.merchantsCount',
]) {
  assert.ok(
    page.includes(`formatNumber(${statField}, locale)`),
    `developers/page.tsx formats ${statField} via formatNumber(..., locale)`
  );
  assert.equal(
    page.includes(`{${statField}}`),
    false,
    `developers/page.tsx must not render unformatted {${statField}}`
  );
}
assert.ok(
  playgroundSrc.includes('formatNumber(latencyMs, locale)'),
  'ApiPlaygroundClient formats latencyMs with formatNumber(latencyMs, locale)'
);
assert.equal(formatNumber(12_345, 'vi'), '12.345');
assert.equal(formatNumber(12_345, 'cs'), '12\u00a0345');

// 5. Async unit tests for executePlaygroundRequest (400 validation, non-JSON 404/429/502/204,
//    200 JSON, and network failure clearing latencyMs).
async function runAsyncPlaygroundTests() {
  let clock = 100;
  const now = () => clock;

  // 200 JSON response sets statusCode and latencyMs.
  const okRes = await executePlaygroundRequest({
    method: 'GET',
    customPath: '/api/v1/rate/stats',
    requestBody: '',
    invalidPathMessage: 'Invalid path',
    connectErrorMessage: 'Connect error',
    now,
    fetchImpl: async () => {
      clock += 37;
      return new Response('{"ok":true,"count":42}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.latencyMs, 37);
  assert.deepEqual(JSON.parse(okRes.responseJson), { ok: true, count: 42 });

  // Validation rejection (400) clears latencyMs to null.
  const invalidRes = await executePlaygroundRequest({
    method: 'GET',
    customPath: 'https://evil.example/api/v1/rate/stats',
    requestBody: '',
    invalidPathMessage: 'Invalid path',
    connectErrorMessage: 'Connect error',
    now,
    fetchImpl: async () => {
      throw new Error('must not call fetch on invalid path');
    },
  });
  assert.equal(invalidRes.statusCode, 400);
  assert.equal(invalidRes.latencyMs, null);
  assert.deepEqual(JSON.parse(invalidRes.responseJson), {
    error: 'Invalid path',
  });

  // Non-JSON HTTP statuses (404 HTML, 429 plain text, 502 plain text, 204 empty)
  // preserve real res.status instead of overwriting with 500.
  const nonJsonCases = [
    { status: 404, raw: '<!DOCTYPE html><html><body>Not Found</body></html>' },
    { status: 429, raw: 'Too Many Requests: retry after 60s' },
    { status: 502, raw: '502 Bad Gateway' },
    { status: 204, raw: '' },
  ] as const;

  for (const c of nonJsonCases) {
    const res = await executePlaygroundRequest({
      method: 'GET',
      customPath: '/api/v1/rate/unknown',
      requestBody: '',
      invalidPathMessage: 'Invalid path',
      connectErrorMessage: 'Connect error',
      now,
      fetchImpl: async () => {
        clock += 19;
        return new Response(c.status === 204 ? null : c.raw, {
          status: c.status,
          headers: { 'Content-Type': 'text/plain' },
        });
      },
    });
    assert.equal(
      res.statusCode,
      c.status,
      `non-JSON HTTP ${c.status} must not be overwritten with 500`
    );
    assert.equal(res.latencyMs, 19);
    assert.deepEqual(JSON.parse(res.responseJson), {
      status: c.status,
      body: c.status === 204 ? null : c.raw,
    });
  }

  // Oversized non-JSON response body is bounded cleanly.
  const hugePayload = formatPlaygroundResponsePayload('x'.repeat(20_000), 502);
  const parsedHuge = JSON.parse(hugePayload) as {
    status: number;
    body: string;
  };
  assert.equal(parsedHuge.status, 502);
  assert.equal(parsedHuge.body.length, 16_387);

  // Network error sets statusCode 500 and clears latencyMs to null.
  const netErrRes = await executePlaygroundRequest({
    method: 'POST',
    customPath: '/api/v1/rate/extension/ingest',
    requestBody: '{"userConsentOptIn":true}',
    invalidPathMessage: 'Invalid path',
    connectErrorMessage: 'Connect error',
    now,
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  assert.equal(netErrRes.statusCode, 500);
  assert.equal(netErrRes.latencyMs, null);
  assert.deepEqual(JSON.parse(netErrRes.responseJson), {
    error: 'Connect error',
    details: 'Failed to fetch',
  });

  console.warn(
    '  ✅ /developers playground snippets, HTTP status preservation, preset sync & a11y (#1747)'
  );
}

runAsyncPlaygroundTests().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
