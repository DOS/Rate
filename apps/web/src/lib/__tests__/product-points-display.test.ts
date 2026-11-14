import assert from 'node:assert/strict';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import ProductPointsBlock from '../../components/reviews/ProductPointsBlock';
import JReviewsSection from '../../components/reviews/JReviewsSection';
import { pickClientMessages } from '../client-messages';
import {
  PRODUCT_POINTS_CRITERION_MAX,
  PRODUCT_POINTS_OVERALL_MAX,
  isEligiblePointReview,
  mapLegacyPointCriterionKey,
  pointCriterionMessageKey,
  preferProductPointsMethod,
  selectProductPoints,
  type StoredProductPointRow,
} from '../product-points-display';
import { RateDataUnavailableError, resetRateClientForTests } from '../rate-api';

const MASTER_ID = '22222222-2222-4222-8222-222222221624';

function makeRow(
  id: string,
  overrides: Partial<StoredProductPointRow> = {}
): StoredProductPointRow {
  return {
    id,
    master_id: MASTER_ID,
    criterion_key: 'battery',
    kind: 'pro',
    label: `Điểm thử nghiệm ${id}`,
    support: 4.5,
    reviewer_count: 6,
    has_expert: false,
    first_seen: '2026-10-01T00:00:00Z',
    last_seen: '2026-10-30T00:00:00Z',
    method: 'code',
    updated_at: '2026-10-31T05:00:00Z',
    ...overrides,
  };
}

function renderWithLocale(
  locale: 'vi' | 'en' | 'cs',
  element: React.ReactElement
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
      element
    )
  );
}

export async function runProductPointsDisplaySuite(): Promise<void> {
  console.log('🧪 Running Product Points Selection & Render Suite (#1624)...');

  // 1. Empty / missing / invalid rows return null (hidden, never "0").
  assert.equal(selectProductPoints(null), null);
  assert.equal(selectProductPoints(undefined), null);
  assert.equal(selectProductPoints([]), null);
  assert.deepEqual(preferProductPointsMethod([]), []);
  assert.equal(
    selectProductPoints([
      makeRow('bad-method', { method: 'manual' }),
      makeRow('bad-kind', { kind: 'neutral' }),
      makeRow('empty-label', { label: '   ' }),
      makeRow('zero-reviewers', { reviewer_count: 0, has_expert: false }),
    ]),
    null
  );

  // Expert-only point (1 expert, reviewer_count 0) normalizes reviewerCount to 1.
  const expertOnly = selectProductPoints([
    makeRow('exp-1', { reviewer_count: 0, has_expert: true, support: 1 }),
  ]);
  assert.ok(expertOnly);
  assert.equal(expertOnly.pros[0]?.reviewerCount, 1);
  assert.equal(expertOnly.reviewCount, 1);

  // 2. Method preference: 'ai' rows preferred whenever any valid 'ai' row exists;
  // otherwise falls back to 'code' rows.
  const mixedRows: StoredProductPointRow[] = [
    makeRow('code-high', {
      method: 'code',
      label: 'Code câu thô',
      support: 99,
      reviewer_count: 80,
    }),
    makeRow('ai-pro', {
      method: 'ai',
      kind: 'pro',
      criterion_key: 'camera',
      label: 'Ảnh đêm rõ nét, ít nhiễu',
      support: 12.4,
      reviewer_count: 18,
      updated_at: '2026-11-02T08:00:00Z',
    }),
    makeRow('ai-con', {
      method: 'ai',
      kind: 'con',
      criterion_key: 'battery',
      label: 'Sạc đầy mất gần 90 phút',
      support: 6.2,
      reviewer_count: 9,
      updated_at: '2026-11-02T08:00:00Z',
    }),
  ];
  const aiSelected = selectProductPoints(mixedRows, {
    categorySlug: 'smartphones',
    pointsReviewCount: 45,
  });
  assert.ok(aiSelected);
  assert.equal(aiSelected.method, 'ai');
  assert.deepEqual(
    aiSelected.pros.map((p) => p.id),
    ['ai-pro']
  );
  assert.deepEqual(
    aiSelected.cons.map((p) => p.id),
    ['ai-con']
  );
  assert.equal(aiSelected.reviewCount, 45);
  assert.equal(aiSelected.updatedAt, '2026-11-02T08:00:00Z');
  assert.deepEqual(
    preferProductPointsMethod(mixedRows).map((r) => r.id),
    ['ai-pro', 'ai-con']
  );

  // Fallback to 'code' when no valid 'ai' row exists.
  const codeFallback = selectProductPoints([
    makeRow('invalid-ai', { method: 'ai', label: '   ' }),
    makeRow('code-only', {
      method: 'code',
      label: 'Pin dùng trọn ngày',
      reviewer_count: 14,
    }),
  ]);
  assert.ok(codeFallback);
  assert.equal(codeFallback.method, 'code');
  assert.deepEqual(
    codeFallback.pros.map((p) => p.id),
    ['code-only']
  );
  assert.equal(codeFallback.reviewCount, 14);

  // 3. Overall 5-cap & always-one-con rule (design 5.1):
  // 8 high-support pros + 7 cons -> 5 pros and 5 cons;
  // 10 overwhelming pros + 1 low-support con -> 5 pros AND the 1 con is kept.
  const manyOverall: StoredProductPointRow[] = [
    ...Array.from({ length: 8 }, (_, i) =>
      makeRow(`pro-${i + 1}`, {
        kind: 'pro',
        criterion_key: i % 2 === 0 ? 'performance' : 'display',
        support: 50 - i,
        reviewer_count: 30 - i,
      })
    ),
    ...Array.from({ length: 7 }, (_, i) =>
      makeRow(`con-${i + 1}`, {
        kind: 'con',
        criterion_key: 'battery',
        support: 20 - i,
        reviewer_count: 15 - i,
      })
    ),
  ];
  const overallCapped = selectProductPoints(manyOverall, {
    categorySlug: 'smartphones',
  });
  assert.ok(overallCapped);
  assert.equal(overallCapped.pros.length, PRODUCT_POINTS_OVERALL_MAX);
  assert.equal(overallCapped.cons.length, PRODUCT_POINTS_OVERALL_MAX);
  assert.deepEqual(
    overallCapped.pros.map((p) => p.id),
    ['pro-1', 'pro-2', 'pro-3', 'pro-4', 'pro-5']
  );
  assert.deepEqual(
    overallCapped.cons.map((p) => p.id),
    ['con-1', 'con-2', 'con-3', 'con-4', 'con-5']
  );

  const overwhelmingProsOneCon: StoredProductPointRow[] = [
    ...Array.from({ length: 10 }, (_, i) =>
      makeRow(`dom-pro-${i + 1}`, {
        kind: 'pro',
        criterion_key: 'performance',
        support: 95 - i,
        reviewer_count: 60 - i,
      })
    ),
    makeRow('lone-con', {
      kind: 'con',
      criterion_key: 'value',
      label: 'Giá cao so với phân khúc',
      support: 1.5,
      reviewer_count: 2,
    }),
  ];
  const alwaysOneConOverall = selectProductPoints(overwhelmingProsOneCon, {
    categorySlug: 'smartphones',
  });
  assert.ok(alwaysOneConOverall);
  assert.equal(alwaysOneConOverall.pros.length, PRODUCT_POINTS_OVERALL_MAX);
  assert.equal(alwaysOneConOverall.cons.length, 1);
  assert.equal(alwaysOneConOverall.cons[0]?.id, 'lone-con');

  // 4. Per-criterion 3-cap, criterion filtering, and always-one-con per criterion.
  const criterionPool: StoredProductPointRow[] = [
    ...Array.from({ length: 5 }, (_, i) =>
      makeRow(`bat-pro-${i + 1}`, {
        kind: 'pro',
        criterion_key: 'battery',
        support: 30 - i,
        reviewer_count: 20 - i,
      })
    ),
    makeRow('bat-con-1', {
      kind: 'con',
      criterion_key: 'battery',
      support: 1.5,
      reviewer_count: 2,
    }),
    makeRow('cam-pro-1', {
      kind: 'pro',
      criterion_key: 'camera',
      support: 40,
      reviewer_count: 25,
    }),
    makeRow('gen-pro-1', {
      kind: 'pro',
      criterion_key: null,
      support: 45,
      reviewer_count: 28,
    }),
  ];
  const batteryFiltered = selectProductPoints(criterionPool, {
    categorySlug: 'smartphones',
    criterionKey: 'battery',
  });
  assert.ok(batteryFiltered);
  assert.equal(batteryFiltered.activeCriterion, 'battery');
  assert.equal(batteryFiltered.pros.length, PRODUCT_POINTS_CRITERION_MAX);
  assert.deepEqual(
    batteryFiltered.pros.map((p) => p.id),
    ['bat-pro-1', 'bat-pro-2', 'bat-pro-3']
  );
  assert.deepEqual(
    batteryFiltered.cons.map((p) => p.id),
    ['bat-con-1']
  );
  // Category order on smartphones: camera before battery.
  assert.deepEqual(batteryFiltered.availableCriteria, ['camera', 'battery']);

  // Foreign criterion keys stay out of availableCriteria on strict categories;
  // legacy 'screen' maps to 'sound' on earbuds and 'display' on smartphones.
  const earbudsSelection = selectProductPoints(
    [
      makeRow('eb-screen', { criterion_key: 'screen', support: 5 }),
      makeRow('eb-foreign', { criterion_key: 'camera', support: 4 }),
      makeRow('eb-anc', { criterion_key: 'anc', support: 3 }),
    ],
    { categorySlug: 'earbuds' }
  );
  assert.ok(earbudsSelection);
  assert.deepEqual(earbudsSelection.availableCriteria, ['sound', 'anc']);
  assert.equal(mapLegacyPointCriterionKey('earbuds', 'screen'), 'sound');
  assert.equal(mapLegacyPointCriterionKey('earbuds', 'camera'), 'anc');
  assert.equal(mapLegacyPointCriterionKey('earbuds', 'performance'), null);
  assert.equal(mapLegacyPointCriterionKey('smartphones', 'screen'), 'display');
  assert.equal(mapLegacyPointCriterionKey('__proto__', 'constructor'), null);
  assert.equal(pointCriterionMessageKey('__proto__'), null);

  // Writer-first ranking parity with aggregateProductPoints (Codex P1):
  // 1) One expert-authored point (support 1, reviewer_count 1) ranks ahead of
  //    five AI-only points (support 2, reviewer_count 4, has_expert false).
  const expertPlusAiOnly: StoredProductPointRow[] = [
    ...Array.from({ length: 5 }, (_, i) =>
      makeRow(`ai-only-${i + 1}`, {
        method: 'code',
        kind: 'pro',
        criterion_key: 'battery',
        label: `AI-only pro ${i + 1}`,
        support: 2,
        reviewer_count: 4,
        has_expert: false,
      })
    ),
    makeRow('expert-own', {
      method: 'code',
      kind: 'pro',
      criterion_key: 'display',
      label: 'Expert own words pro',
      support: 1,
      reviewer_count: 1,
      has_expert: true,
    }),
  ];
  const writerFirstExpert = selectProductPoints(expertPlusAiOnly, {
    categorySlug: 'smartphones',
  });
  assert.ok(writerFirstExpert);
  assert.equal(writerFirstExpert.pros.length, 5);
  assert.equal(writerFirstExpert.pros[0]?.id, 'expert-own');

  // 2) Five writer-authored points (support 2, reviewer_count 2) rank ahead of
  //    a 20-reviewer AI-only point (support 10, reviewer_count 20).
  const writerVsHeavyAiOnly: StoredProductPointRow[] = [
    makeRow('heavy-ai-only', {
      method: 'code',
      kind: 'pro',
      criterion_key: 'battery',
      support: 10,
      reviewer_count: 20,
      has_expert: false,
    }),
    ...Array.from({ length: 5 }, (_, i) =>
      makeRow(`writer-pro-${i + 1}`, {
        method: 'code',
        kind: 'pro',
        criterion_key: 'performance',
        support: 2,
        reviewer_count: 2,
        has_expert: false,
      })
    ),
  ];
  const writerFirstSummary = selectProductPoints(writerVsHeavyAiOnly, {
    categorySlug: 'smartphones',
  });
  assert.ok(writerFirstSummary);
  assert.deepEqual(
    writerFirstSummary.pros.map((p) => p.id),
    [
      'writer-pro-1',
      'writer-pro-2',
      'writer-pro-3',
      'writer-pro-4',
      'writer-pro-5',
    ]
  );

  // Eligible point-review gate & review_points.created_at cutoff (design 5.3 & Codex P2).
  const batchCutoff = Date.parse('2026-11-02T08:00:00Z');
  assert.equal(
    isEligiblePointReview(
      {
        id: 'r-ok',
        reviewer_type: 'user',
        helpfulness_weight: 1,
        created_at: '2026-11-01T00:00:00Z',
        review_points: [
          {
            id: 'pt-1',
            kind: 'pro',
            body: 'Pin dùng cả ngày',
            method: 'writer',
            created_at: '2026-11-01T00:00:00Z',
          },
        ],
        review_flags: { include_in_rating: true, verdict: 'authentic' },
      },
      batchCutoff
    ),
    true
  );
  // Older review whose AI review_points line was extracted AFTER the batch ran: excluded.
  assert.equal(
    isEligiblePointReview(
      {
        id: 'r-old-review-new-ai-line',
        reviewer_type: 'user',
        helpfulness_weight: 1,
        created_at: '2026-10-15T00:00:00Z',
        review_points: [
          {
            id: 'pt-late',
            kind: 'pro',
            body: 'Pin dùng cả ngày',
            method: 'ai',
            created_at: '2026-11-04T00:00:00Z',
          },
        ],
        review_flags: { include_in_rating: true, verdict: 'authentic' },
      },
      batchCutoff
    ),
    false
  );
  assert.equal(
    isEligiblePointReview(
      {
        id: 'r-after-batch',
        reviewer_type: 'user',
        helpfulness_weight: 1,
        created_at: '2026-11-03T00:00:00Z',
        review_flags: { include_in_rating: true, verdict: 'authentic' },
      },
      batchCutoff
    ),
    false
  );
  assert.equal(
    isEligiblePointReview(
      {
        id: 'r-gated',
        reviewer_type: 'user',
        helpfulness_weight: 1,
        created_at: '2026-11-01T00:00:00Z',
        review_flags: { include_in_rating: false, verdict: 'fake' },
      },
      batchCutoff
    ),
    false
  );
  assert.equal(
    isEligiblePointReview(
      {
        id: 'r-expert',
        reviewer_type: 'expert',
        helpfulness_weight: 0,
        created_at: '2026-11-01T00:00:00Z',
        review_flags: null,
      },
      batchCutoff
    ),
    true
  );

  // 5. Server Data Layer: anon read, ai-over-code, distinct review_points count,
  // and RateDataUnavailableError propagation on DB errors.
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const prevFetch = globalThis.fetch;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub-points.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'stub-anon-points-key';
    resetRateClientForTests();

    let fetchCount = 0;
    let failNext = false;
    const seenHeaders: Headers[] = [];
    const seenUrls: string[] = [];
    const stubPointReviews = [
      {
        id: 'rev-1',
        reviewer_type: 'user',
        helpfulness_weight: 1,
        created_at: '2026-11-01T00:00:00Z',
        review_points: [
          {
            id: 'rp-1',
            kind: 'pro',
            criterion_key: 'camera',
            body: 'Ảnh đêm rõ nét, ít nhiễu',
            method: 'writer',
            created_at: '2026-11-01T00:00:00Z',
          },
        ],
        review_flags: { include_in_rating: true, verdict: 'authentic' },
      },
      {
        id: 'rev-2',
        reviewer_type: 'expert',
        helpfulness_weight: 0,
        created_at: '2026-11-01T12:00:00Z',
        review_points: [
          {
            id: 'rp-2',
            kind: 'con',
            criterion_key: 'battery',
            body: 'Sạc đầy mất gần 90 phút',
            method: 'writer',
            created_at: '2026-11-01T12:00:00Z',
          },
        ],
        review_flags: null,
      },
      {
        id: 'rev-old-late-ai',
        reviewer_type: 'user',
        helpfulness_weight: 1,
        created_at: '2026-10-10T00:00:00Z',
        review_points: [
          {
            id: 'rp-late',
            kind: 'pro',
            criterion_key: 'battery',
            body: 'Pin dùng cả ngày dài',
            method: 'ai',
            created_at: '2026-11-05T00:00:00Z',
          },
        ],
        review_flags: { include_in_rating: true, verdict: 'authentic' },
      },
      {
        id: 'rev-after',
        reviewer_type: 'user',
        helpfulness_weight: 1,
        created_at: '2026-11-05T00:00:00Z',
        review_points: [
          {
            id: 'rp-after',
            kind: 'pro',
            criterion_key: 'camera',
            body: 'Chụp đêm tốt',
            method: 'writer',
            created_at: '2026-11-05T00:00:00Z',
          },
        ],
        review_flags: { include_in_rating: true, verdict: 'authentic' },
      },
    ];

    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      fetchCount += 1;
      seenHeaders.push(new Headers(init?.headers));
      const reqUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      seenUrls.push(reqUrl);
      if (failNext) {
        return new Response(
          JSON.stringify({ message: 'simulated db outage', code: 'XX000' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const bodyRows = reqUrl.includes('/rest/v1/reviews?')
        ? stubPointReviews
        : mixedRows;
      return new Response(JSON.stringify(bodyRows), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Range': `0-${bodyRows.length - 1}/${bodyRows.length}`,
        },
      });
    }) as typeof fetch;

    const { getCachedMasterProductPoints, getMasterProductPoints } =
      await import('../../server/rate/product-points');

    // Invalid / sentinel UUIDs make zero network requests.
    assert.deepEqual(await getMasterProductPoints('not-a-uuid'), {
      rows: [],
      reviewCount: 0,
    });
    assert.deepEqual(
      await getMasterProductPoints('00000000-0000-0000-0000-000000000000'),
      { rows: [], reviewCount: 0 }
    );
    assert.equal(fetchCount, 0);

    const serverData = await getMasterProductPoints(MASTER_ID, 'smartphones');
    assert.equal(fetchCount, 2);
    assert.deepEqual(
      serverData.rows.map((r) => r.id),
      ['ai-pro', 'ai-con']
    );
    assert.equal(serverData.reviewCount, 2);
    assert.match(seenUrls[1] ?? '', /review_points\.created_at=lte\./);
    assert.equal(seenHeaders[0]?.get('apikey'), 'stub-anon-points-key');
    assert.match(seenHeaders[0]?.get('prefer') ?? '', /count=exact/);

    // Cached reader falls back cleanly outside Next incrementalCache and keeps
    // the preferred 'ai' rows and counted review total.
    const [cachedA, cachedB] = await Promise.all([
      getCachedMasterProductPoints(MASTER_ID, 'iphone-16-pro-max-256gb'),
      getCachedMasterProductPoints(MASTER_ID, 'iphone-16-pro-max-256gb'),
    ]);
    assert.deepEqual(
      cachedA.rows.map((r) => r.id),
      ['ai-pro', 'ai-con']
    );
    assert.equal(cachedA.reviewCount, 2);
    assert.deepEqual(
      cachedB.rows.map((r) => r.id),
      ['ai-pro', 'ai-con']
    );

    // DB failure throws RateDataUnavailableError rather than returning [].
    failNext = true;
    await assert.rejects(
      () => getMasterProductPoints('22222222-2222-4222-8222-222222229999'),
      (err: unknown) => err instanceof RateDataUnavailableError
    );
  } finally {
    globalThis.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevAnon === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
    resetRateClientForTests();
  }

  // 6. i18n parity & plural checks across vi, en, cs (no em/en-dashes).
  const pointKeys = Object.keys(viMessages.reviews).filter(
    (k) => k.startsWith('points') || k.startsWith('pointCrit_')
  );
  assert.ok(pointKeys.length >= 25);
  for (const key of pointKeys) {
    for (const [loc, dict] of [
      ['vi', viMessages.reviews],
      ['en', enMessages.reviews],
      ['cs', csMessages.reviews],
    ] as const) {
      const val = (dict as Record<string, unknown>)[key];
      assert.equal(typeof val, 'string', `${loc}.reviews.${key} must exist`);
      assert.ok((val as string).trim().length > 0);
      assert.doesNotMatch(
        val as string,
        /[\u2013\u2014]/,
        `${loc}.reviews.${key} must not contain en/em-dashes`
      );
    }
  }
  const tVi = createTranslator({ locale: 'vi', messages: viMessages });
  const tEn = createTranslator({ locale: 'en', messages: enMessages });
  const tCs = createTranslator({ locale: 'cs', messages: csMessages });
  assert.equal(
    tVi('reviews.pointsMentionCount', { count: 1200 }),
    '· 1.200 người'
  );
  assert.equal(
    tVi('reviews.pointsUpdatedWithReviews', {
      date: '31/10/2026',
      count: 1200,
    }),
    'Cập nhật ngày 31/10/2026 · từ 1.200 đánh giá'
  );
  assert.equal(tEn('reviews.pointsMentionCount', { count: 1 }), '· 1 person');
  assert.equal(tEn('reviews.pointsMentionCount', { count: 18 }), '· 18 people');
  assert.equal(tCs('reviews.pointsMentionCount', { count: 1 }), '· 1 člověk');
  assert.equal(tCs('reviews.pointsMentionCount', { count: 3 }), '· 3 lidé');
  assert.equal(tCs('reviews.pointsMentionCount', { count: 18 }), '· 18 lidí');
  assert.equal(
    tEn('reviews.pointsUpdatedWithReviews', { date: '31/10/2026', count: 1 }),
    'Updated 31/10/2026 · from 1 review'
  );
  assert.equal(
    tCs('reviews.pointsUpdatedWithReviews', {
      date: '31. 10. 2026',
      count: 12,
    }),
    'Aktualizováno 31. 10. 2026 · z 12 recenzí'
  );

  // 7. Component render tests (ProductPointsBlock & JReviewsSection):
  // - Absent when empty (no "0", no empty-list placeholder).
  assert.equal(
    renderWithLocale(
      'vi',
      React.createElement(ProductPointsBlock, { points: [] })
    ),
    ''
  );

  // - Renders pros, cons, mention counts, date & review count, criterion pills,
  //   and lang="vi" on non-vi pages.
  const viHtml = renderWithLocale(
    'vi',
    React.createElement(ProductPointsBlock, {
      points: mixedRows,
      categorySlug: 'smartphones',
      pointsReviewCount: 128,
    })
  );
  assert.match(viHtml, /data-testid="product-points-block"/);
  assert.match(viHtml, /class="rate-points-pill"/);
  assert.match(viHtml, /Ưu điểm/);
  assert.match(viHtml, /Nhược điểm/);
  assert.match(viHtml, /Ảnh đêm rõ nét, ít nhiễu/);
  assert.match(viHtml, /· 18 người/);
  assert.match(viHtml, /Sạc đầy mất gần 90 phút/);
  assert.match(viHtml, /· 9 người/);
  assert.match(viHtml, /Cập nhật ngày 2\/11\/2026 · từ 128 đánh giá/);
  assert.doesNotMatch(viHtml, /Code câu thô/);
  assert.doesNotMatch(viHtml, /lang="vi"/);

  const enHtml = renderWithLocale(
    'en',
    React.createElement(ProductPointsBlock, {
      points: mixedRows,
      categorySlug: 'smartphones',
      pointsReviewCount: 128,
    })
  );
  assert.match(enHtml, /Updated 2\/11\/2026 · from 128 reviews/);
  assert.match(enHtml, /· 18 people/);
  assert.match(enHtml, /lang="vi">Ảnh đêm rõ nét, ít nhiễu</);

  const csHtml = renderWithLocale(
    'cs',
    React.createElement(ProductPointsBlock, {
      points: mixedRows,
      categorySlug: 'smartphones',
      pointsReviewCount: 128,
    })
  );
  assert.match(csHtml, /Aktualizováno 2\.\s*11\.\s*2026 · z 128 recenzí/);
  assert.match(csHtml, /· 18 lidí/);
  assert.match(csHtml, /lang="vi">Ảnh đêm rõ nét, ít nhiễu</);

  // - Criterion selected with pros only: renders pros column only, no empty cons
  //   column, no "0".
  const cameraOnlyHtml = renderWithLocale(
    'vi',
    React.createElement(ProductPointsBlock, {
      points: mixedRows,
      categorySlug: 'smartphones',
      selectedCriterion: 'camera',
    })
  );
  assert.match(cameraOnlyHtml, /data-testid="product-points-pros"/);
  assert.doesNotMatch(cameraOnlyHtml, /data-testid="product-points-cons"/);
  assert.match(
    cameraOnlyHtml,
    /data-criterion="camera"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-criterion="camera"/
  );

  // - JReviewsSection integration: renders block with fixture rows (using
  //   productPointsReviewCount rather than total authenticReviewCount, keeping
  //   phrasing-only markup inside <button>, and suppressing duplicate legacy pros).
  const baseSummary = {
    total_analyzed: 6,
    authentic_pct: 90,
    suspicious_pct: 5,
    fake_pct: 5,
    sentiment_positive_pct: 85,
    ai_summary: null,
    pros: ['Legacy pro line'],
    cons: [],
  };
  const sectionWithPoints = renderWithLocale(
    'vi',
    React.createElement(JReviewsSection, {
      masterProductId: MASTER_ID,
      categorySlug: 'smartphones',
      productSlug: 'iphone-16-pro-max-256gb',
      productName: 'iPhone 16 Pro Max 256GB',
      averageRating: 4.8,
      userRatingWeighted: 4.8,
      ratingScore: 4.8,
      expertRating: null,
      authenticReviewCount: 250,
      ignoredReviewCount: 0,
      reviews: [],
      summary: baseSummary,
      productPoints: mixedRows,
      productPointsReviewCount: 24,
    })
  );
  assert.match(sectionWithPoints, /data-testid="product-points-block"/);
  assert.match(sectionWithPoints, /data-testid="jreviews-criterion-camera"/);
  assert.match(sectionWithPoints, /Cập nhật ngày 2\/11\/2026 · từ 24 đánh giá/);
  assert.doesNotMatch(sectionWithPoints, /từ 250 đánh giá/);
  assert.doesNotMatch(
    sectionWithPoints,
    /<button[^>]*data-testid="jreviews-criterion-camera"[^>]*>(?:(?!<\/button>).)*<div/s
  );
  assert.doesNotMatch(sectionWithPoints, /Legacy pro line/);

  const sectionWithoutPoints = renderWithLocale(
    'vi',
    React.createElement(JReviewsSection, {
      masterProductId: MASTER_ID,
      categorySlug: 'smartphones',
      productSlug: 'samsung-galaxy-s25-ultra-256gb',
      productName: 'Galaxy S25 Ultra 256GB',
      averageRating: 4.7,
      userRatingWeighted: 4.7,
      ratingScore: 4.7,
      expertRating: null,
      authenticReviewCount: 10,
      ignoredReviewCount: 0,
      reviews: [],
      summary: { ...baseSummary, pros: [] },
      productPoints: [],
    })
  );
  assert.doesNotMatch(
    sectionWithoutPoints,
    /data-testid="product-points-block"/
  );

  console.log('  ✅ Product Points Selection & Render Suite (#1624) passed');
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  runProductPointsDisplaySuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
