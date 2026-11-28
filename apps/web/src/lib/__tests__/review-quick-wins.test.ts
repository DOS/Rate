import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import JReviewsSection, {
  type JReviewsSectionProps,
} from '../../components/reviews/JReviewsSection';
import { pickClientMessages } from '../client-messages';
import {
  REVIEW_IMAGES_MAX,
  REVIEW_REPORT_REASONS,
  addReviewStarCounts,
  computeReviewStarCounts,
  isAllowedReviewImageHost,
  sanitizeReviewImages,
  type ReviewItem,
  type ReviewReportReason,
} from '../rate-domain';
import {
  REVIEW_REPORT_OPTION_COPY,
  buildReviewVoteRequestBody,
  mergeLoadedReviews,
} from '../review-display';
import {
  compareReviewOrderDesc,
  encodeReviewCursor,
  isAfterReviewCursor,
  parseReviewCursor,
} from '../review-cursor';
import {
  parseReviewsQueryParams,
  resolveReviewVoteInput,
} from '../../server/rate/api-handler';
import { toReviewItem } from '../../app/api/v1/rate/reviews/route';

function findOpeningTags(html: string, tagName: string): string[] {
  const prefix = `<${tagName}`;
  const out: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf(prefix, cursor);
    if (start === -1) break;
    const after = html.charAt(start + prefix.length);
    if (after === ' ' || after === '>' || after === '/') {
      const end = html.indexOf('>', start);
      if (end === -1) break;
      out.push(html.slice(start, end + 1));
      cursor = end + 1;
    } else {
      cursor = start + prefix.length;
    }
  }
  return out;
}

function readTagAttr(tag: string, attrName: string): string | null {
  const token = ` ${attrName.toLowerCase()}="`;
  const lower = tag.toLowerCase();
  const idx = lower.indexOf(token);
  if (idx === -1) return null;
  const valStart = idx + token.length;
  const valEnd = tag.indexOf('"', valStart);
  return valEnd === -1 ? null : tag.slice(valStart, valEnd);
}

function makeReview(
  id: string,
  overrides: Partial<ReviewItem> = {}
): ReviewItem {
  return {
    id,
    author_name: 'Minh',
    rating_star: 5,
    comment: 'Solid display, long battery life, and smooth daily performance.',
    variation: '256GB',
    created_at: '2026-11-20T10:00:00Z',
    reviewer_type: 'user',
    upvotes: 2,
    downvotes: 0,
    report_count: 0,
    helpfulness_weight: 1.5,
    include_in_rating: true,
    criteria_ratings: { display: 5, battery: 5 },
    verdict: 'authentic',
    fake_probability: 0.05,
    flag_category: 'authentic',
    reason: null,
    signals: null,
    images: [],
    ...overrides,
  };
}

function renderSection(
  locale: 'vi' | 'en' | 'cs',
  overrides: Partial<JReviewsSectionProps> = {}
): string {
  const full =
    locale === 'en' ? enMessages : locale === 'cs' ? csMessages : viMessages;
  const messages = pickClientMessages(
    full as unknown as Record<string, unknown>,
    'productDetail'
  );
  const Provider = NextIntlClientProvider as React.ComponentType<{
    locale: string;
    messages: typeof messages;
    timeZone: string;
    children?: React.ReactNode;
  }>;
  return renderToStaticMarkup(
    React.createElement(
      Provider,
      { locale, messages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(JReviewsSection, {
        masterProductId: '22222222-2222-4222-8222-222222221727',
        categorySlug: 'smartphones',
        reviewCategorySlug: 'smartphones',
        productSlug: 'iphone-16-pro-max-256gb',
        productName: 'iPhone 16 Pro Max 256GB',
        averageRating: 4.8,
        userRatingWeighted: 4.8,
        ratingScore: 4.8,
        expertRating: null,
        authenticReviewCount: 2,
        ignoredReviewCount: 0,
        reviews: [makeReview('44444444-4444-4444-8444-444444444441')],
        summary: {
          total_analyzed: 2,
          authentic_pct: 100,
          suspicious_pct: 0,
          fake_pct: 0,
          pros: [],
          cons: [],
          ai_summary: null,
        },
        ...overrides,
      })
    )
  );
}

function testReviewImageSanitizerAndStrip() {
  assert.deepEqual(sanitizeReviewImages(null), []);
  assert.deepEqual(sanitizeReviewImages(undefined), []);
  assert.deepEqual(
    sanitizeReviewImages('https://down-vn.img.susercontent.com/a.jpg'),
    []
  );

  const sanitized = sanitizeReviewImages([
    'http://insecure.example.com/1.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'blob:https://rate.vn/123',
    'file:///etc/passwd',
    '/img/local.jpg',
    '//protocol-relative.example.com/1.jpg',
    'https://user:pass@salt.tikicdn.com/secret.jpg',
    'https://salt.tikicdn.com:8443/port.jpg',
    'https://.bad.example.com/1.jpg',
    'https://bad.example.com./1.jpg',
    'https://a..b.example.com/1.jpg',
    'https://salt.tikicdn.com/space in path.jpg',
    'https://salt.tikicdn.com/ctrl\u0000.jpg',
    `https://salt.tikicdn.com/${'a'.repeat(2040)}.jpg`,
    123,
    { url: 'https://salt.tikicdn.com/obj.jpg' },
    '  https://SALT.TIKICDN.COM:443/photo-1.jpg  ',
    'https://salt.tikicdn.com/photo-1.jpg',
    'https://down-vn.img.susercontent.com/file/p2.webp',
    'https://down-vn.img.susercontent.com/file/p3.webp',
    'https://down-vn.img.susercontent.com/file/p4.webp',
    'https://down-vn.img.susercontent.com/file/p5.webp',
    'https://down-vn.img.susercontent.com/file/p6.webp',
    'https://down-vn.img.susercontent.com/file/p7-over-cap.webp',
  ]);
  assert.equal(sanitized.length, REVIEW_IMAGES_MAX);
  assert.deepEqual(sanitized, [
    'https://salt.tikicdn.com/photo-1.jpg',
    'https://down-vn.img.susercontent.com/file/p2.webp',
    'https://down-vn.img.susercontent.com/file/p3.webp',
    'https://down-vn.img.susercontent.com/file/p4.webp',
    'https://down-vn.img.susercontent.com/file/p5.webp',
    'https://down-vn.img.susercontent.com/file/p6.webp',
  ]);

  // Host allowlist (#1964): marketplace CDNs only, exact or subdomain match.
  assert.deepEqual(
    sanitizeReviewImages([
      'https://down-vn.img.susercontent.com/file/a.webp',
      'https://susercontent.com/file/b.webp',
      'https://cf.shopee.vn/file/c.jpg',
      'https://salt.tikicdn.com/ts/review/d.jpg',
      'https://evil.example.com/pixel.gif',
      'https://susercontent.com.evil.example/x.jpg',
      'https://notsusercontent.com/x.jpg',
      'https://evil.com/?u=https://salt.tikicdn.com/x.jpg',
      'https://shopee.vn/x.jpg',
      'https://tikicdn.com.attacker.io/x.jpg',
      'https://127.0.0.1/x.jpg',
    ]),
    [
      'https://down-vn.img.susercontent.com/file/a.webp',
      'https://susercontent.com/file/b.webp',
      'https://cf.shopee.vn/file/c.jpg',
      'https://salt.tikicdn.com/ts/review/d.jpg',
    ]
  );
  assert.equal(isAllowedReviewImageHost('evil.example.com'), false);
  assert.equal(isAllowedReviewImageHost('salt.tikicdn.com'), true);

  const mapped = toReviewItem(
    {
      id: '44444444-4444-4444-8444-444444444441',
      author_name: 'Buyer',
      rating_star: 5,
      comment: 'Clear camera photos and reliable battery.',
      images: [
        'http://bad.example.com/x.jpg',
        'https://salt.tikicdn.com/good-1.jpg',
        'https://salt.tikicdn.com/good-1.jpg',
        'https://salt.tikicdn.com/good-2.jpg',
      ],
    },
    {}
  );
  assert.deepEqual(mapped.images, [
    'https://salt.tikicdn.com/good-1.jpg',
    'https://salt.tikicdn.com/good-2.jpg',
  ]);

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const htmlWithPhotos = renderSection(loc, {
      reviews: [
        makeReview('44444444-4444-4444-8444-444444444441', {
          images: [
            'http://dropped.example.com/bad.jpg',
            'https://salt.tikicdn.com/photo-a.jpg',
            'https://salt.tikicdn.com/photo-b.jpg',
          ],
        }),
      ],
    });
    assert.ok(htmlWithPhotos.includes('data-testid="review-photo-strip"'));
    const photoAnchors = findOpeningTags(htmlWithPhotos, 'a').filter(
      (tag) => readTagAttr(tag, 'class') === 'rate-review-photo-thumb'
    );
    const photoHrefs = photoAnchors.map((tag) => readTagAttr(tag, 'href'));
    assert.deepEqual(photoHrefs, [
      'https://salt.tikicdn.com/photo-a.jpg',
      'https://salt.tikicdn.com/photo-b.jpg',
    ]);
    for (const tag of photoAnchors) {
      assert.equal(readTagAttr(tag, 'target'), '_blank');
      assert.equal(readTagAttr(tag, 'rel'), 'noopener noreferrer');
    }

    const imgTags = findOpeningTags(htmlWithPhotos, 'img');
    const photoSrcs = imgTags.map((tag) => readTagAttr(tag, 'src'));
    assert.deepEqual(photoSrcs, [
      'https://salt.tikicdn.com/photo-a.jpg',
      'https://salt.tikicdn.com/photo-b.jpg',
    ]);
    assert.equal(readTagAttr(imgTags[0]!, 'width'), '64');
    assert.equal(readTagAttr(imgTags[0]!, 'height'), '64');
    assert.equal(readTagAttr(imgTags[0]!, 'loading'), 'lazy');
    assert.equal(readTagAttr(imgTags[0]!, 'decoding'), 'async');
    assert.equal(readTagAttr(imgTags[0]!, 'referrerpolicy'), 'no-referrer');
    for (const u of [...photoHrefs, ...photoSrcs]) {
      assert.ok(typeof u === 'string');
      assert.notEqual(new URL(u).hostname, 'dropped.example.com');
    }

    const expectedAlt =
      loc === 'vi'
        ? 'Ảnh đánh giá số 1 của Minh'
        : loc === 'cs'
          ? 'Fotografie č. 1 od Minh'
          : 'Review photo 1 by Minh';
    assert.equal(
      readTagAttr(imgTags[0]!, 'alt'),
      expectedAlt,
      `${loc} photo alt text rendered`
    );

    const htmlUnsafeOnly = renderSection(loc, {
      reviews: [
        makeReview('44444444-4444-4444-8444-444444444441', {
          images: ['http://only-http.example.com/1.jpg', 'javascript:alert(1)'],
        }),
      ],
    });
    assert.doesNotMatch(htmlUnsafeOnly, /data-testid="review-photo-strip"/);
  }
}

function testReportReasonPickerAndPayload() {
  assert.deepEqual(
    REVIEW_REPORT_OPTION_COPY.map((opt) => opt.reason),
    [...REVIEW_REPORT_REASONS]
  );

  for (const reason of REVIEW_REPORT_REASONS) {
    const body = buildReviewVoteRequestBody('report', reason);
    assert.deepEqual(body, { voteType: 'report', reportReason: reason });
    assert.deepEqual(resolveReviewVoteInput(body), {
      voteType: 'report',
      reportReason: reason,
    });
  }
  assert.deepEqual(buildReviewVoteRequestBody('up'), { voteType: 'up' });
  assert.deepEqual(buildReviewVoteRequestBody('down'), { voteType: 'down' });
  assert.deepEqual(buildReviewVoteRequestBody('clear'), { voteType: 'clear' });
  assert.deepEqual(
    buildReviewVoteRequestBody('report', 'not-valid' as ReviewReportReason),
    { voteType: 'report', reportReason: 'spam' }
  );

  const reviewId = '44444444-4444-4444-8444-444444444441';
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const closedHtml = renderSection(loc);
    assert.equal(
      closedHtml.includes('data-testid="review-report-dialog"'),
      false
    );
    const closedButtons = findOpeningTags(closedHtml, 'button');
    assert.ok(
      closedButtons.some(
        (tag) =>
          tag.includes('aria-haspopup="dialog"') &&
          tag.includes('aria-expanded="false"')
      )
    );

    const openHtml = renderSection(loc, {
      defaultReportReviewId: reviewId,
    });
    const openDialogs = findOpeningTags(openHtml, 'div');
    assert.ok(
      openDialogs.some(
        (tag) =>
          tag.includes('role="dialog"') &&
          tag.includes('aria-modal="true"') &&
          tag.includes('data-testid="review-report-dialog"')
      )
    );
    const fsStart = openHtml.indexOf('<fieldset');
    const legendStart = openHtml.indexOf('<legend', fsStart);
    assert.ok(fsStart !== -1 && legendStart > fsStart);
    const inputTags = findOpeningTags(openHtml, 'input');
    for (const reason of REVIEW_REPORT_REASONS) {
      assert.ok(
        inputTags.some(
          (tag) =>
            tag.includes('type="radio"') && tag.includes(`value="${reason}"`)
        ),
        `${loc}: radio input rendered for ${reason}`
      );
    }
    const dict = (
      loc === 'en' ? enMessages : loc === 'cs' ? csMessages : viMessages
    ).reviews;
    for (const opt of REVIEW_REPORT_OPTION_COPY) {
      assert.ok(
        openHtml.includes(dict[opt.labelKey]),
        `${loc}: dialog includes ${opt.labelKey}`
      );
      assert.ok(
        openHtml.includes(dict[opt.descKey]),
        `${loc}: dialog includes ${opt.descKey}`
      );
    }
  }
}

function testCursorParsingOrderAndPaginationUi() {
  const rowA = {
    id: '44444444-4444-4444-8444-444444444442',
    created_at: '2026-11-26T04:00:00.123456+00:00',
  };
  const rowB = {
    id: '44444444-4444-4444-8444-444444444441',
    created_at: '2026-11-26T04:00:00.123456Z',
  };
  const rowMicroOlder = {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    created_at: '2026-11-26T04:00:00.123455Z',
  };

  assert.ok(compareReviewOrderDesc(rowA, rowB) < 0);
  assert.ok(compareReviewOrderDesc(rowB, rowMicroOlder) < 0);

  const cursorA = encodeReviewCursor(rowA);
  assert.ok(cursorA, 'valid review row encodes a cursor');
  const parsedA = parseReviewCursor(cursorA);
  assert.deepEqual(parsedA, {
    createdAt: '2026-11-26T04:00:00.123456Z',
    id: rowA.id,
  });
  assert.equal(isAfterReviewCursor(rowA, parsedA), false);
  assert.equal(isAfterReviewCursor(rowB, parsedA), true);
  assert.equal(isAfterReviewCursor(rowMicroOlder, parsedA), true);

  const invalidCursors = [
    null,
    undefined,
    '',
    '   ',
    'not-valid-json',
    'a'.repeat(513),
    `${cursorA}=`,
    `${cursorA!.slice(0, 8)}\u0000${cursorA!.slice(8)}`,
    Buffer.from('[]').toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 2, c: rowA.created_at, i: rowA.id })
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 1, c: rowA.created_at, i: rowA.id, extra: 1 })
    ).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, c: 'not-a-date', i: rowA.id })).toString(
      'base64url'
    ),
    Buffer.from(
      JSON.stringify({ v: 1, c: '2026-02-29T00:00:00Z', i: rowA.id })
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 1, c: '2026-02-31T00:00:00Z', i: rowA.id })
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 1, c: '2026-04-31T00:00:00Z', i: rowA.id })
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 1, c: '2026-11-26T00:00:00+99:99', i: rowA.id })
    ).toString('base64url'),
    Buffer.from(
      JSON.stringify({ v: 1, c: rowA.created_at, i: 'not-a-uuid' })
    ).toString('base64url'),
    Buffer.from(
      '{"v":1,"c":"2026-11-26T04:00:00Z","i":"44444444-4444-4444-8444-444444444441","__proto__":{}}'
    ).toString('base64url'),
  ];
  for (const bad of invalidCursors) {
    assert.equal(parseReviewCursor(bad), null, `reject cursor: ${String(bad)}`);
  }

  const leapCursor = encodeReviewCursor({
    id: rowA.id,
    created_at: '2024-02-29T12:00:00Z',
  });
  assert.ok(parseReviewCursor(leapCursor), 'leap day 2024-02-29 is accepted');

  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams({ slug: 'iphone-16', cursor: 'bad-cursor' })
    ),
    null
  );
  assert.deepEqual(
    parseReviewsQueryParams(
      new URLSearchParams({
        slug: 'iphone-16',
        limit: '25',
        cursor: cursorA!,
      })
    ),
    {
      masterProductId: null,
      slug: 'iphone-16',
      hideFake: false,
      star: null,
      limit: 25,
      cursor: parsedA,
    }
  );
  for (const s of ['1', '2', '3', '4', '5'] as const) {
    assert.equal(
      parseReviewsQueryParams(
        new URLSearchParams({ slug: 'iphone-16', star: s })
      )?.star,
      Number(s)
    );
  }
  assert.equal(
    parseReviewsQueryParams(
      new URLSearchParams({ slug: 'iphone-16', star: '' })
    )?.star,
    null
  );
  for (const badStar of [
    '0',
    '6',
    '-1',
    '4.5',
    '5.0',
    '05',
    '+5',
    'abc',
    '1\u00000',
  ]) {
    assert.equal(
      parseReviewsQueryParams(
        new URLSearchParams({ slug: 'iphone-16', star: badStar })
      ),
      null,
      `reject invalid star=${JSON.stringify(badStar)}`
    );
  }

  // Deduplicating client merge
  const r1 = makeReview('11111111-1111-4111-8111-111111111111');
  const r2 = makeReview('22222222-2222-4222-8222-222222222222');
  const r3 = makeReview('33333333-3333-4333-8333-333333333333');
  const merged = mergeLoadedReviews([r1, r2], [r2, r3, r3, r1]);
  assert.deepEqual(
    merged.map((r) => r.id),
    [r1.id, r2.id, r3.id]
  );

  // Pagination UI SSR
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const withMoreHtml = renderSection(loc, {
      initialNextCursor: cursorA,
      totalReviewCount: 75,
    });
    assert.ok(withMoreHtml.includes('data-testid="reviews-loaded-scope-note"'));
    assert.ok(withMoreHtml.includes('data-testid="load-more-reviews-btn"'));
    if (loc === 'cs') {
      assert.ok(withMoreHtml.includes('zbývá 74'));
      const fewHtml = renderSection('cs', {
        initialNextCursor: cursorA,
        totalReviewCount: 4,
      });
      assert.ok(fewHtml.includes('zbývají 3'));
    }

    const noMoreHtml = renderSection(loc, {
      initialNextCursor: null,
      totalReviewCount: 1,
    });
    assert.equal(
      noMoreHtml.includes('data-testid="reviews-loaded-scope-note"'),
      false
    );
    assert.equal(
      noMoreHtml.includes('data-testid="load-more-reviews-btn"'),
      false
    );
  }
}

function testStarHistogramSsrAndFallback() {
  const counts = computeReviewStarCounts([
    makeReview('44444444-4444-4444-8444-444444444501', { rating_star: 5 }),
    makeReview('44444444-4444-4444-8444-444444444502', { rating_star: 5 }),
    makeReview('44444444-4444-4444-8444-444444444503', { rating_star: 4 }),
    makeReview('44444444-4444-4444-8444-444444444504', { rating_star: 2.6 }),
    makeReview('44444444-4444-4444-8444-444444444505', { rating_star: 1 }),
  ]);
  assert.deepEqual(counts, { 1: 1, 2: 0, 3: 1, 4: 1, 5: 2, total: 5 });
  assert.deepEqual(
    addReviewStarCounts(counts, { 1: 0, 2: 1, 3: 0, 4: 0, 5: 1, total: 2 }),
    { 1: 1, 2: 1, 3: 1, 4: 1, 5: 3, total: 7 }
  );

  for (const loc of ['vi', 'en', 'cs'] as const) {
    const dbHistogramHtml = renderSection(loc, {
      starCounts: { 1: 5, 2: 5, 3: 10, 4: 20, 5: 60, total: 100 },
      initialNextCursor: null,
      totalReviewCount: 100,
    });
    assert.ok(dbHistogramHtml.includes('data-testid="review-star-histogram"'));
    const histStart = dbHistogramHtml.indexOf(
      'data-testid="review-star-histogram"'
    );
    const btnPositions = [5, 4, 3, 2, 1].map((star) =>
      dbHistogramHtml.indexOf(
        `data-testid="review-star-histogram-btn-${star}"`,
        histStart
      )
    );
    assert.ok(
      btnPositions.every((pos) => pos > histStart) &&
        btnPositions[0]! < btnPositions[1]! &&
        btnPositions[1]! < btnPositions[2]! &&
        btnPositions[2]! < btnPositions[3]! &&
        btnPositions[3]! < btnPositions[4]!,
      `${loc}: histogram renders 5-to-1 buttons in descending order`
    );
    assert.ok(
      dbHistogramHtml.includes('width:60%') &&
        dbHistogramHtml.includes('width:20%') &&
        dbHistogramHtml.includes('width:10%') &&
        dbHistogramHtml.includes('width:5%'),
      `${loc}: proportional percentage bar widths rendered`
    );
    assert.ok(
      loc === 'cs'
        ? dbHistogramHtml.includes('60\u00a0%')
        : dbHistogramHtml.includes('60%'),
      `${loc}: localized percent formatting in histogram`
    );
    const histButtons = findOpeningTags(dbHistogramHtml, 'button').filter(
      (tag) =>
        (readTagAttr(tag, 'data-testid') ?? '').startsWith(
          'review-star-histogram-btn-'
        )
    );
    assert.equal(histButtons.length, 5);
    for (const tag of histButtons) {
      assert.equal(readTagAttr(tag, 'aria-pressed'), 'false');
    }

    // Fallback when starCounts prop is omitted computes from reviews prop.
    const fallbackHtml = renderSection(loc, {
      reviews: [
        makeReview('44444444-4444-4444-8444-444444444511', { rating_star: 5 }),
        makeReview('44444444-4444-4444-8444-444444444512', { rating_star: 4 }),
      ],
    });
    assert.ok(fallbackHtml.includes('width:50%'));
    assert.ok(fallbackHtml.includes('width:0%'));
    assert.ok(
      loc === 'cs'
        ? fallbackHtml.includes('50\u00a0%')
        : fallbackHtml.includes('50%')
    );
  }
}

function testLocaleParityAndDashes() {
  const enKeys = Object.keys(enMessages.reviews).sort();
  const viKeys = Object.keys(viMessages.reviews).sort();
  const csKeys = Object.keys(csMessages.reviews).sort();
  assert.deepEqual(viKeys, enKeys);
  assert.deepEqual(csKeys, enKeys);

  for (const [locale, dict] of Object.entries({
    en: enMessages.reviews,
    vi: viMessages.reviews,
    cs: csMessages.reviews,
  })) {
    for (const [k, v] of Object.entries(dict)) {
      assert.equal(
        /[\u2013\u2014]/.test(v),
        false,
        `${locale}.reviews.${k} must not contain en-dash or em-dash`
      );
    }
  }
}

function main() {
  console.warn('🧪 Review quick-wins suite (#1924, #1925, #1926, #1940)');
  testReviewImageSanitizerAndStrip();
  testReportReasonPickerAndPayload();
  testCursorParsingOrderAndPaginationUi();
  testStarHistogramSsrAndFallback();
  testLocaleParityAndDashes();
  console.warn('✅ Review quick-wins suite passed');
}

main();
