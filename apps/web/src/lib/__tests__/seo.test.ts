import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  OG_TRUTH_CARD_HEIGHT,
  OG_TRUTH_CARD_WIDTH,
  SHARE_IMAGE,
  SITE_URL,
  SOCIAL_TRUTH_CARD_HEIGHT,
  SOCIAL_TRUTH_CARD_WIDTH,
  absoluteUrl,
  buildOgTruthCardImage,
  buildOgTruthCardPath,
  defaultTwitterCard,
  fitDescription,
  fitTitle,
  isValidOgSlug,
  normalizeOgLocale,
  parseOgVersusPair,
  siteJsonLd,
} from '../seo';
import {
  OG_TRUTH_CARD_CACHE_CONTROL,
  parseOgTruthCardQuery,
  renderOgTruthCardPng,
  sanitizeOgCardText,
} from '../og-truth-card';
import { BoundedSlidingWindowRateLimiter } from '../../server/rate/api-handler';
import {
  OPTIONS as ogOptions,
  handleOgTruthCardRequest,
} from '../../app/api/v1/rate/og/route';
import { buildSafeCsvContent, escapeCsvCell } from '../csv-safe';
import {
  pageMerchantDirectory,
  parseMerchantDirectoryFilters,
} from '../merchant-directory';

function main() {
  console.warn('🧪 SEO helpers suite');

  // Relative paths resolve on rate.vn; absolute URLs pass through (#738).
  assert.equal(
    absoluteUrl('/img/devices/apple-iphone-16-128gb.jpg'),
    'https://rate.vn/img/devices/apple-iphone-16-128gb.jpg'
  );
  assert.equal(absoluteUrl('img/x.png'), 'https://rate.vn/img/x.png');
  assert.equal(
    absoluteUrl('https://cdn.example.com/a.jpg'),
    'https://cdn.example.com/a.jpg'
  );

  const site = siteJsonLd('en', 'Real prices and filtered reviews');
  const [org, web] = site['@graph'];
  assert.equal(org!['@type'], 'Organization');
  assert.equal(org!.logo, 'https://rate.vn/icon.png');
  assert.equal(web!['@type'], 'WebSite');
  assert.equal(web!.inLanguage, 'en');
  assert.deepEqual(web!.publisher, { '@id': org!['@id'] });

  // The first title that fits wins; otherwise the last is cut at a word (#777).
  assert.equal(fitTitle(['short', 'shorter']), 'short');
  const long = `So sánh ${'A'.repeat(30)} và ${'B'.repeat(30)}: 10 nhóm | Rate.vn`;
  assert.equal(
    fitTitle([long, 'Apple Watch Series 11 vs Apple Watch Ultra 2 | Rate.vn']),
    'Apple Watch Series 11 vs Apple Watch Ultra 2 | Rate.vn'
  );
  const cut = fitTitle([
    long,
    'Apple Watch Series 11 46mm GPS 64GB vs Apple Watch Ultra 2 49mm 64GB',
  ]);
  assert.equal(
    cut,
    'Apple Watch Series 11 46mm GPS 64GB vs Apple Watch Ultra 2 49mm…'
  );
  assert.ok(cut.length <= MAX_TITLE_LENGTH);
  // A single word longer than the limit is cut inside it.
  const word = fitTitle(['x'.repeat(80)]);
  assert.equal(word.length, MAX_TITLE_LENGTH);
  assert.ok(word.endsWith('…'));
  // No dangling "vs" before the ellipsis.
  assert.equal(
    fitTitle([
      'ABCDE Galaxy S25 Ultra 256GB vs Galaxy S25 Ultra 512GB Gold vs X Y',
    ]),
    'ABCDE Galaxy S25 Ultra 256GB vs Galaxy S25 Ultra 512GB Gold…'
  );
  // Degenerate input stays sane.
  assert.equal(fitTitle([]), '');
  assert.ok(fitTitle(['abc def ghi jkl'], 0).length <= 1);
  // An emoji is never split into a lone surrogate.
  const emoji = fitTitle(['😀'.repeat(70)]);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji));
  assert.ok(emoji.length <= MAX_TITLE_LENGTH);
  assert.ok(
    fitTitle([
      'iPhone 16 Pro Max 256GB vs Galaxy S25 Ultra 256GB 😀😀😀😀😀😀😀😀😀😀 extra words',
    ]).length <= MAX_TITLE_LENGTH
  );

  // Descriptions built from long names are cut at a word under 160 (#793).
  const longDesc = `So sánh giá ${'Galaxy Z Fold7 Ultra '.repeat(8)}từ 5 gian hàng trên Rate.vn.`;
  const fittedDesc = fitDescription(longDesc);
  assert.ok(fittedDesc.length <= MAX_DESCRIPTION_LENGTH);
  assert.ok(fittedDesc.endsWith('…'));
  assert.equal(fitDescription('Ngắn gọn.'), 'Ngắn gọn.');

  // DOS/Rate#848: absoluteUrl protocol-relative/credential/invalid guards, fitTitle NaN/control chars, CSV & merchant-directory bounds
  assert.equal(absoluteUrl('//evil.example.com/phish'), SITE_URL);
  assert.equal(absoluteUrl('/\\evil.example.com/phish'), SITE_URL);
  assert.equal(
    absoluteUrl('https://user:pass@cdn.example.com/a.jpg'),
    SITE_URL
  );
  assert.equal(absoluteUrl('javascript:alert(1)'), SITE_URL);
  assert.equal(absoluteUrl('http://[invalid-url'), SITE_URL);
  assert.equal(
    fitTitle(['  iPhone 16\u0000\r\nPro   Max  '], Number.NaN),
    'iPhone 16 Pro Max'
  );

  assert.equal(
    escapeCsvCell('\u0000=cmd|"/c calc"!A0'),
    `"'=cmd|""/c calc""!A0"`
  );
  assert.equal(escapeCsvCell('\u000b+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(escapeCsvCell('-15.4%'), '-15.4%');
  assert.equal(escapeCsvCell('x'.repeat(12_000)).length, 10_000);
  const csvOut = buildSafeCsvContent(['col1', 'col2'], [['\u0000=1+1', 42]]);
  assert.ok(csvOut.includes("'=1+1,42"));

  const params848 = new URLSearchParams(
    'q=  Apple\u0000\r\nStore  &platform=bad<script>plat'
  );
  const parsedFilters848 = parseMerchantDirectoryFilters((k) =>
    params848.get(k)
  );
  assert.equal(parsedFilters848.query, 'Apple Store');
  assert.equal(parsedFilters848.platform, 'all');
  const paged848 = pageMerchantDirectory([], parsedFilters848, -10, 999_999);
  assert.equal(paged848.offset, 0);

  // DOS/Rate#1865: Dynamic OpenGraph truth cards, strict anti-phishing query
  // validation, metadata wiring, and 100% offline PNG rendering (vi/en/cs).
  assert.equal(normalizeOgLocale('EN'), 'en');
  assert.equal(normalizeOgLocale(' cs\u0000 '), 'cs');
  assert.equal(normalizeOgLocale('__proto__'), 'vi');
  assert.equal(normalizeOgLocale(null), 'vi');

  assert.equal(isValidOgSlug('apple-iphone-17-pro-256gb'), true);
  assert.equal(isValidOgSlug('xiaomi.15.ultra'), true);
  assert.equal(isValidOgSlug('_undotted_catalog_slug'), true);
  assert.equal(isValidOgSlug('_dotted.slug'), false);
  assert.equal(isValidOgSlug('../etc/passwd'), false);
  assert.equal(isValidOgSlug('__proto__'), false);
  assert.equal(isValidOgSlug('tostring'), false);
  assert.equal(isValidOgSlug('hasownproperty'), false);
  assert.equal(isValidOgSlug('na'), false);
  assert.equal(isValidOgSlug('000'), false);
  assert.equal(isValidOgSlug('slug.'), false);
  assert.equal(isValidOgSlug('slug with space'), false);

  assert.deepEqual(
    parseOgVersusPair('iphone-17-pro-vs-samsung-galaxy-s26-ultra'),
    ['iphone-17-pro', 'samsung-galaxy-s26-ultra']
  );
  assert.equal(parseOgVersusPair('_leading-vs-samsung-galaxy-s26'), null);
  assert.equal(parseOgVersusPair('iphone-17-pro-vs-iphone-17-pro'), null);
  assert.equal(parseOgVersusPair('only-one-slug'), null);

  assert.equal(
    buildOgTruthCardPath({
      type: 'product',
      slug: 'apple-iphone-17-pro-256gb',
      locale: 'vi',
    }),
    '/api/v1/rate/og?type=product&slug=apple-iphone-17-pro-256gb&locale=vi'
  );
  assert.equal(
    buildOgTruthCardPath({
      type: 'product',
      slug: 'apple-iphone-17-pro-256gb',
      locale: 'cs',
      format: 'social',
      download: true,
    }),
    '/api/v1/rate/og?type=product&slug=apple-iphone-17-pro-256gb&locale=cs&format=social&download=1'
  );
  assert.equal(
    buildOgTruthCardPath({
      type: 'versus',
      versus: 'apple-iphone-17-pro-vs-samsung-galaxy-s26-ultra',
      locale: 'en',
    }),
    '/api/v1/rate/og?type=versus&versus=apple-iphone-17-pro-vs-samsung-galaxy-s26-ultra&locale=en'
  );
  assert.equal(
    buildOgTruthCardPath({ type: 'deals', locale: 'vi' }),
    '/api/v1/rate/og?type=deals&locale=vi'
  );
  assert.equal(
    buildOgTruthCardPath({ type: 'product', slug: '../bad' }),
    SHARE_IMAGE.url
  );

  const ogImgMeta = buildOgTruthCardImage({
    type: 'product',
    slug: 'apple-iphone-17-pro-256gb',
    locale: 'vi',
    alt: 'iPhone 17 Pro 256GB',
  });
  assert.equal(
    ogImgMeta.url,
    'https://rate.vn/api/v1/rate/og?type=product&slug=apple-iphone-17-pro-256gb&locale=vi'
  );
  assert.equal(ogImgMeta.width, OG_TRUTH_CARD_WIDTH);
  assert.equal(ogImgMeta.height, OG_TRUTH_CARD_HEIGHT);
  const twitterMeta = defaultTwitterCard(ogImgMeta);
  assert.equal(twitterMeta.card, 'summary_large_image');
  assert.equal(twitterMeta.site, '@rate_vn');
  assert.deepEqual(twitterMeta.images, [ogImgMeta]);

  // Anti-phishing / anti-DoS query parser rejects untrusted text & cache-busting params
  assert.equal(
    parseOgTruthCardQuery(
      new URLSearchParams('type=product&slug=iphone-17&title=Fake+1000d')
    ),
    null
  );
  assert.equal(
    parseOgTruthCardQuery(
      new URLSearchParams('type=product&slug=iphone-17&price=1000')
    ),
    null
  );
  assert.equal(
    parseOgTruthCardQuery(new URLSearchParams('type=deals&bust=123')),
    null
  );
  assert.equal(
    parseOgTruthCardQuery(new URLSearchParams('type=product&slug=a&slug=b')),
    null
  );
  assert.equal(
    parseOgTruthCardQuery(new URLSearchParams('type=deals&locale=fr')),
    null
  );
  assert.equal(
    parseOgTruthCardQuery(new URLSearchParams('type=deals&format=9999x9999')),
    null
  );
  assert.equal(parseOgTruthCardQuery(new URLSearchParams('type=DeAlS')), null);
  assert.equal(
    parseOgTruthCardQuery(new URLSearchParams('type=deals&locale=')),
    null
  );
  assert.equal(
    parseOgTruthCardQuery(new URLSearchParams('type=deals&locale=%20vi')),
    null
  );
  assert.equal(
    parseOgTruthCardQuery(new URLSearchParams('type=deals&locale=vi%00')),
    null
  );
  assert.deepEqual(
    parseOgTruthCardQuery(
      new URLSearchParams(
        'type=product&slug=apple-iphone-17-pro&variant=512gb&locale=vi&format=social&download=1'
      )
    ),
    {
      type: 'product',
      slug: 'apple-iphone-17-pro',
      variant: '512gb',
      locale: 'vi',
      format: 'social',
      download: true,
    }
  );
  assert.equal(
    parseOgTruthCardQuery(
      new URLSearchParams('type=deals'),
      `?${'a'.repeat(600)}`
    ),
    null
  );

  // Verify metadata wiring on product detail, compare/[versus], and deals pages
  for (const relPage of [
    '../../app/[locale]/smartphones/[slug]/page.tsx',
    '../../app/[locale]/compare/[versus]/page.tsx',
    '../../app/[locale]/deals/page.tsx',
  ]) {
    const pageSrc = readFileSync(new URL(relPage, import.meta.url), 'utf8');
    assert.ok(
      pageSrc.includes('buildOgTruthCardImage(') &&
        pageSrc.includes('defaultTwitterCard('),
      `${relPage} must wire buildOgTruthCardImage and defaultTwitterCard`
    );
  }

  // sanitizeOgCardText normalizes NFD Vietnamese/Czech diacritics, strips U+00AD SHY & unmapped codepoints, replaces ₫ and dashes, and strips emojis
  assert.equal(
    sanitizeOgCardText(
      'Đie\u0302\u0323n thoa\u0323i iPhone\u00AD17 \u0180 \u1E00 \u1EFF 28.490.000₫ \u2014 \u2013 🔥 Čtečka řádků'
    ),
    'Điện thoại iPhone17 28.490.000đ - - Čtečka řádků'
  );
}

async function runOgTruthCardAsyncSuite() {
  const pngMagic = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const originalFetch = globalThis.fetch;
  const externalUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (!rawUrl.startsWith('data:')) {
      externalUrls.push(rawUrl);
      throw new Error(`Unexpected external fetch during OG render: ${rawUrl}`);
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const sampleProduct = {
      type: 'product' as const,
      slug: 'apple-iphone-17-pro-256gb',
      categoryPath: '/smartphones',
      name: 'Điện thoại iPhone\u00AD17 Pro 256GB \u0180 \u1E00 Chính hãng ệ ắ đ ư ơ',
      brand: 'Apple',
      minPriceVnd: 28_490_000,
      maxPriceVnd: 31_990_000,
      sellerCount: 14,
      userScore5: 4.72,
      expertScore10: 9.2,
      authenticReviews: 1_420,
      filteredReviews: 140,
      radarKind: 'multi_platform_floor' as const,
      savingsPct: 8.4,
      fakeMarkupPct: 0,
      hasFakeSaleTrap: false,
    };

    const sampleVersus = {
      type: 'versus' as const,
      versusSlug: 'apple-iphone-17-pro-vs-samsung-galaxy-s26-ultra',
      itemA: {
        slug: 'apple-iphone-17-pro',
        name: 'Apple iPhone 17 Pro ệ ắ đ',
        brand: 'Apple',
        score5: 4.8,
        minPriceVnd: 28_490_000,
        sellerCount: 14,
        criterionWins: 3,
      },
      itemB: {
        slug: 'samsung-galaxy-s26-ultra',
        name: 'Samsung Galaxy S26 Ultra Čtečka řádků žlutá ě ů',
        brand: 'Samsung',
        score5: 4.7,
        minPriceVnd: 29_990_000,
        sellerCount: 16,
        criterionWins: 2,
      },
      winnerSide: 'A' as const,
      scoreDelta: '0.1',
    };

    const sampleDeals = {
      type: 'deals' as const,
      genuineDealCount: 18,
      fakeSaleTrapCount: 7,
      totalOffersAnalyzed: 312,
      totalClustersAnalyzed: 48,
      topDeals: [
        {
          name: 'iPhone 17 Pro 256GB Đáy giá đa sàn',
          minPriceVnd: 28_490_000,
          savingsPct: 8.4,
          offerCount: 14,
        },
        {
          name: 'Čtečka knih PocketBook Era žlutá ě ů',
          minPriceVnd: 5_490_000,
          savingsPct: 11.2,
          offerCount: 6,
        },
      ],
    };

    for (const locale of ['vi', 'en', 'cs'] as const) {
      for (const format of ['og', 'social'] as const) {
        const expectedWidth =
          format === 'social' ? SOCIAL_TRUTH_CARD_WIDTH : OG_TRUTH_CARD_WIDTH;
        const expectedHeight =
          format === 'social' ? SOCIAL_TRUTH_CARD_HEIGHT : OG_TRUTH_CARD_HEIGHT;

        for (const card of [sampleProduct, sampleVersus, sampleDeals]) {
          const bytes = Buffer.from(
            await renderOgTruthCardPng(card, format, locale)
          );
          assert.ok(
            bytes.subarray(0, 8).equals(pngMagic),
            `Expected PNG magic bytes for ${card.type}/${locale}/${format}`
          );
          assert.ok(bytes.length > 5_000, 'Expected non-trivial PNG payload');
          const meta = await sharp(bytes).metadata();
          assert.equal(meta.format, 'png');
          assert.equal(meta.width, expectedWidth);
          assert.equal(meta.height, expectedHeight);
        }
      }
    }

    assert.deepEqual(
      externalUrls,
      [],
      'OG truth card renderer must make zero external network calls'
    );

    // Route handler verification: OPTIONS, 200, 400, 404, 429, and 500
    const optRes = await ogOptions();
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get('access-control-allow-origin'), '*');

    const testLimiter = new BoundedSlidingWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 5,
      maxBuckets: 100,
    });
    const mockResolvers = {
      rateLimiter: testLimiter,
      resolveProduct: async (slug: string) =>
        slug === sampleProduct.slug ? sampleProduct : null,
      resolveVersus: async (pair: readonly [string, string]) =>
        pair[0] === 'apple-iphone-17-pro' ? sampleVersus : null,
      resolveDeals: async () => sampleDeals,
    };

    // 200 OK product social download
    const okRes = await handleOgTruthCardRequest(
      new NextRequest(
        'https://rate.vn/api/v1/rate/og?type=product&slug=apple-iphone-17-pro-256gb&locale=vi&format=social&download=1',
        { headers: { 'x-forwarded-for': '203.0.113.10' } }
      ),
      mockResolvers
    );
    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers.get('content-type'), 'image/png');
    assert.equal(
      okRes.headers.get('cache-control'),
      OG_TRUTH_CARD_CACHE_CONTROL
    );
    assert.match(
      okRes.headers.get('content-disposition') ?? '',
      /^attachment; filename="rate-truth-card-apple-iphone-17-pro-256gb-4x5\.png"$/
    );
    const okBytes = Buffer.from(await okRes.arrayBuffer());
    assert.ok(okBytes.subarray(0, 8).equals(pngMagic));

    // 400 Bad Request on untrusted free-form query parameters
    const phishRes = await handleOgTruthCardRequest(
      new NextRequest(
        'https://rate.vn/api/v1/rate/og?type=product&slug=apple-iphone-17-pro-256gb&title=Fake+Sale&price=1000',
        { headers: { 'x-forwarded-for': '203.0.113.10' } }
      ),
      mockResolvers
    );
    assert.equal(phishRes.status, 400);
    assert.equal(phishRes.headers.get('cache-control'), 'no-store');

    // 404 Not Found on unknown catalog slug
    const missingRes = await handleOgTruthCardRequest(
      new NextRequest(
        'https://rate.vn/api/v1/rate/og?type=product&slug=unknown-device-999&locale=en',
        { headers: { 'x-forwarded-for': '203.0.113.10' } }
      ),
      mockResolvers
    );
    assert.equal(missingRes.status, 404);

    // 429 Rate Limit Exceeded after 5 requests in window from same IP
    await handleOgTruthCardRequest(
      new NextRequest('https://rate.vn/api/v1/rate/og?type=deals&locale=cs', {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      }),
      mockResolvers
    );
    await handleOgTruthCardRequest(
      new NextRequest(
        'https://rate.vn/api/v1/rate/og?type=versus&versus=apple-iphone-17-pro-vs-samsung-galaxy-s26-ultra&locale=en',
        { headers: { 'x-forwarded-for': '203.0.113.10' } }
      ),
      mockResolvers
    );
    const limitedRes = await handleOgTruthCardRequest(
      new NextRequest('https://rate.vn/api/v1/rate/og?type=deals&locale=vi', {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      }),
      mockResolvers
    );
    assert.equal(limitedRes.status, 429);
    assert.equal(limitedRes.headers.get('retry-after'), '60');

    // 500 Internal Error masks internal database messages
    const errRes = await handleOgTruthCardRequest(
      new NextRequest('https://rate.vn/api/v1/rate/og?type=deals&locale=vi', {
        headers: { 'x-forwarded-for': '203.0.113.99' },
      }),
      {
        ...mockResolvers,
        resolveDeals: async () => {
          throw new Error('PGRST116: relation "rate.master_products" failed');
        },
      }
    );
    assert.equal(errRes.status, 500);
    const errBody = (await errRes.json()) as { ok: boolean; error: string };
    assert.equal(errBody.ok, false);
    assert.ok(!errBody.error.includes('PGRST'));
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.warn('✅ SEO & OG truth cards suite passed');
}

main();
void runOgTruthCardAsyncSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
