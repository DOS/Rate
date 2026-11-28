import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import csMessages from '../../../locales/cs.json';
import enMessages from '../../../locales/en.json';
import viMessages from '../../../locales/vi.json';
import {
  RATING_CRITERIA_CATEGORIES,
  getRatingCriteria,
} from '@repo/shared-data/rules';
import JReviewsSection, {
  buildJReviewsMarkdown,
  normalizeReviewCriteriaRatings,
  type JReviewsSectionProps,
} from '../../components/reviews/JReviewsSection';
import ReviewFormV2 from '../../components/reviews/ReviewFormV2';
import { pickClientMessages } from '../client-messages';
import { EMPTY_RADAR_SIGNAL, type RadarSignal } from '../deal-radar';
import {
  isFilteredOutReview,
  isPendingReview,
  reviewBadgeKind,
  blendNoteKey,
  sponsorshipBadgeKey,
  submitErrorKey,
  weightExplanationCopy,
} from '../review-display';
import {
  computeCombinedDualScore,
  detectStarDistributionAnomaly,
  evaluateReviewTrustAssessment,
  type ReviewItem,
} from '../rate-api';

function renderReviewsSection(
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
  const baseProps: JReviewsSectionProps = {
    masterProductId: '22222222-2222-4222-8222-222222221727',
    categorySlug: 'smartphones',
    reviewCategorySlug:
      'reviewCategorySlug' in overrides
        ? overrides.reviewCategorySlug
        : (overrides.categorySlug ?? 'smartphones'),
    productSlug: 'iphone-16-pro-max-256gb',
    productName: 'iPhone 16 Pro Max 256GB',
    averageRating: 0,
    userRatingWeighted: null,
    ratingScore: null,
    expertRating: null,
    authenticReviewCount: 0,
    ignoredReviewCount: 0,
    reviews: [],
    summary: {
      total_analyzed: 0,
      authentic_pct: 100,
      suspicious_pct: 0,
      fake_pct: 0,
      pros: [],
      cons: [],
      ai_summary: null,
    },
    ...overrides,
  };
  return renderToStaticMarkup(
    React.createElement(
      Provider,
      { locale, messages, timeZone: 'Asia/Ho_Chi_Minh' },
      React.createElement(JReviewsSection, baseProps)
    )
  );
}

function main() {
  console.warn('🧪 Review display suite');

  // A community review is stored unanalyzed with a NULL flag category, which
  // the read path turns into 'authentic'. It must show as pending, not authentic.
  const pending = {
    verdict: 'unanalyzed' as const,
    flag_category: 'authentic' as const,
    include_in_rating: false,
    helpfulness_weight: 0,
  };
  assert.equal(isPendingReview(pending), true);
  assert.equal(reviewBadgeKind(pending), 'pending');
  assert.equal(isFilteredOutReview(pending), false);

  const flagged = {
    verdict: 'suspicious' as const,
    flag_category: 'low_value_coin_spam' as const,
    include_in_rating: false,
    helpfulness_weight: 0,
  };
  assert.equal(reviewBadgeKind(flagged), 'low_value_coin_spam');
  assert.equal(isFilteredOutReview(flagged), true);

  const counted = {
    verdict: 'authentic' as const,
    flag_category: 'authentic' as const,
    include_in_rating: true,
    helpfulness_weight: 1.2,
  };
  assert.equal(reviewBadgeKind(counted), 'authentic');
  assert.equal(isFilteredOutReview(counted), false);
  // A crawled review with no verdict yet keeps its category badge.
  assert.equal(
    reviewBadgeKind({ verdict: null, flag_category: 'seeding_fake' }),
    'seeding_fake'
  );
  assert.equal(
    isFilteredOutReview({ ...counted, helpfulness_weight: 0 }),
    true
  );

  // Every error code the route returns maps to a localized key; unknown or
  // missing codes fall back to the generic message.
  assert.equal(submitErrorKey('AUTH_REQUIRED'), 'errLoginRequired');
  assert.equal(submitErrorKey('AUTH_INVALID'), 'errLoginRequired');
  assert.equal(submitErrorKey('FORBIDDEN'), 'errRealAccountRequired');
  assert.equal(submitErrorKey('DUPLICATE_REVIEW'), 'errDuplicateReview');
  assert.equal(submitErrorKey('RATE_LIMITED'), 'errRateLimited');
  assert.equal(submitErrorKey('RATE_LIMIT_EXCEEDED'), 'errRateLimited');
  assert.equal(submitErrorKey('REJECTED'), 'errInvalidReview');
  assert.equal(submitErrorKey('INVALID_BODY'), 'errInvalidReview');
  assert.equal(submitErrorKey('NO_LINKED_LISTING'), 'errNoLinkedListing');
  assert.equal(submitErrorKey('INVALID_REVIEW'), 'v2ErrInvalid');
  assert.equal(submitErrorKey('PERSIST_FAILED'), 'errSubmitFailed');
  assert.equal(submitErrorKey('constructor'), 'errSubmitFailed');
  assert.equal(submitErrorKey(undefined), 'errSubmitFailed');

  // Disclosure badges follow the independence axis, organic reviews get none.
  assert.equal(
    sponsorshipBadgeKey('sponsored_balanced'),
    'sponsorshipBadgeSponsoredBalanced'
  );
  assert.equal(
    sponsorshipBadgeKey('sponsored_promo'),
    'sponsorshipBadgeSponsoredPromo'
  );
  assert.equal(
    sponsorshipBadgeKey('incentivized'),
    'sponsorshipBadgeIncentivized'
  );
  assert.equal(sponsorshipBadgeKey('affiliate'), 'sponsorshipBadgeAffiliate');
  assert.equal(sponsorshipBadgeKey('organic'), null);
  assert.equal(sponsorshipBadgeKey('undisclosed_paid'), null);

  // The Vietnamese copy matches the server-built strings it replaces, so vi
  // pages render exactly as before.
  const vi = JSON.parse(
    readFileSync(new URL('../../../locales/vi.json', import.meta.url), 'utf8')
  ) as { reviews: Record<string, string> };
  const disclosures = [
    'Máy được tài trợ, dùng tốt nhưng pin hơi tiếc một chút khi chơi game',
    'Máy được tài trợ, tuyệt vời, mua ngay đi mọi người',
    'Đánh giá 5 sao để nhận voucher, máy dùng ổn định',
    'Mua qua link affiliate bên dưới để có giá tốt nhất nhé',
  ];
  let badges = 0;
  for (const comment of disclosures) {
    const assessment = evaluateReviewTrustAssessment({
      id: comment,
      rating_star: 5,
      comment,
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
      helpfulness_weight: 1,
    } as ReviewItem);
    const key = sponsorshipBadgeKey(assessment.independence);
    assert.equal(
      key ? vi.reviews[key] : null,
      assessment.sponsorshipBadgeVi,
      comment
    );
    if (key) badges += 1;
  }
  assert.equal(
    badges,
    disclosures.length,
    'every disclosure sample gets a badge'
  );

  const anomaly = detectStarDistributionAnomaly(
    Array.from({ length: 6 }, () => ({
      rating_star: 5,
      comment: 'Tốt',
      flag_category: 'authentic' as const,
    }))
  );
  assert.equal(anomaly.isAnomalous, true);
  assert.equal(
    String(vi.reviews.starAnomalyWarning)
      .replace('{fiveStarPct}', String(anomaly.fiveStarRatioPct))
      .replace('{lowEffortPct}', String(anomaly.lowEffortOrSeedingRatioPct)),
    anomaly.warningLabelVi
  );

  // Every weight explanation case rebuilds the Vietnamese server text; the
  // formula case and assessments cached without a kind keep the server text.
  const fill = (template: string, values: Record<string, string>) =>
    template.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');
  const weightSamples: Array<[string, Partial<ReviewItem>]> = [
    ['shipping_only', { comment: 'Giao hàng nhanh, đóng gói cẩn thận' }],
    [
      'filler',
      {
        comment: 'Nhận xét cho đủ chữ để nhận xu thôi',
        flag_category: 'low_value_coin_spam',
      },
    ],
    [
      'sabotage',
      {
        comment: 'Máy dùng rất mượt, pin trâu suốt cả ngày',
        flag_category: 'competitor_sabotage',
      },
    ],
    [
      'bombing',
      {
        comment: 'Máy dùng rất mượt, pin trâu suốt cả ngày',
        flag_category: 'review_bombing',
      },
    ],
    [
      'seeding',
      {
        comment: 'Máy dùng rất mượt, pin trâu suốt cả ngày',
        flag_category: 'seeding_fake',
      },
    ],
    ['stars_only', { comment: '' }],
    ['platform_label', { comment: 'Hài lòng' }],
    ['low_effort', { comment: 'Ổn áp nha mọi người' }],
    ['formula', { comment: 'Máy dùng rất mượt, pin trâu suốt cả ngày nha' }],
  ];
  for (const [kind, overrides] of weightSamples) {
    const { breakdown } = evaluateReviewTrustAssessment({
      id: kind,
      rating_star: 5,
      comment: '',
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
      helpfulness_weight: 1,
      ...overrides,
    } as ReviewItem);
    assert.equal(breakdown.explanationKind, kind, `sample for ${kind}`);
    const copy = weightExplanationCopy(breakdown);
    const text =
      'key' in copy ? fill(vi.reviews[copy.key]!, copy.values) : copy.text;
    // The UI calls this the trust level, apart from the rating weight on
    // the badge (DOS/Rate#1215); the rest is the server's text.
    assert.equal(
      text,
      'key' in copy
        ? breakdown.explanationVi.replace(/^Trọng số /, 'Ước tính ')
        : breakdown.explanationVi,
      kind
    );
    assert.ok(!text.startsWith('Trọng số'), `${kind} says Trọng số`);
    assert.equal('key' in copy, kind !== 'formula', `${kind} is localized`);
  }
  // Reviews that cover the product as well as delivery are not shipping-only
  // (DOS/Rate#596): Shopee's structured product fields and any product word
  // count, matched as whole words.
  const assess = (comment: string) =>
    evaluateReviewTrustAssessment({
      id: comment,
      rating_star: 5,
      comment,
      verdict: 'authentic',
      flag_category: 'authentic',
      include_in_rating: true,
      helpfulness_weight: 1,
    } as ReviewItem);
  for (const comment of [
    'Chất lượng sản phẩm:tốt\nĐúng với mô tả:đúng mô tả\nTính năng nổi bật:dep\n\nĐóng gói cẩn thận. Giao hàng nhanh chóng.',
    'Lần đầu tiên mình đặt điện thoại qua Ecommerce. Khá run. Nhưng giao hàng khá nhanh.',
    'Giao hàng nhanh, máy đẹp, đóng gói kỹ',
    'Sản phẩm rất tốt, giao hàng nhanh',
    'Chất lượng tốt, giao hàng nhanh chóng',
    'Hàng đẹp, ship nhanh',
    'Đẹp lắm, giao hàng nhanh',
    'Giao hàng nhanh, sản phẩm tuyệt vời',
    'Hàng chất lượng, giao hàng nhanh',
    'Sản phẩm chuẩn, giao nhanh',
    'Hàng đúng mô tả, giao nhanh',
    'sản phẩm tốt giao hàng nhanh',
    'Đúng như mô tả, giao hàng nhanh',
    'Hàng tuyệt vời, giao hàng nhanh',
    'Hàng nhận được tốt, giao nhanh',
  ]) {
    const a = assess(comment);
    assert.notEqual(a.breakdown.explanationKind, 'shipping_only', comment);
    assert.equal(a.routesTo, 'product', comment);
  }
  for (const comment of [
    'Giao hàng nhanh, đóng gói cẩn thận',
    'Giao hàng nhanh như chớp, shipper thân thiện',
    'Shopping vui, giao hàng nhanh',
    'Đóng gói đẹp, giao hàng nhanh',
    'Sản phẩm được đóng gói cẩn thận, giao nhanh',
    'Shipper chạy nhanh, giao hàng đúng giờ',
    'Shop cam kết giao hàng đúng hẹn',
    'Giao hàng rất tốt, đóng gói cẩn thận',
    'Hộp đẹp, giao nhanh',
    'Đóng gói hàng đẹp, giao nhanh',
    'Hộp đựng đẹp, giao nhanh',
    'Giao hàng nhanh, đóng gói rất đẹp',
    'Nhận hàng tốt, giao nhanh',
    'Chất lượng đóng gói tốt, giao nhanh',
  ]) {
    const a = assess(comment);
    assert.equal(a.breakdown.explanationKind, 'shipping_only', comment);
    assert.equal(a.routesTo, 'merchant', comment);
  }

  const cached = { weight: 0.25, explanationVi: 'Trọng số 0.25x: cũ' };
  assert.deepEqual(weightExplanationCopy(cached), {
    text: cached.explanationVi,
  });
  assert.deepEqual(
    weightExplanationCopy({
      ...cached,
      explanationKind: 'constructor' as never,
    }),
    { text: cached.explanationVi }
  );
  // DOS/Rate#850: NaN weight, prototype keys, and control chars in explanationVi
  assert.equal(
    isFilteredOutReview({ ...counted, helpfulness_weight: Number.NaN }),
    true
  );
  assert.equal(sponsorshipBadgeKey('constructor' as never), null);
  assert.equal(
    blendNoteKey('constructor' as never),
    'blendNoteInsufficientData'
  );
  assert.deepEqual(
    weightExplanationCopy({
      weight: Number.NaN,
      explanationVi: '  Trọng số\u0000\r\n0.00x  ',
      explanationKind: 'seeding',
    }),
    { key: 'weightExplanationSeeding', values: { weight: '0.00' } }
  );
  assert.deepEqual(
    weightExplanationCopy({
      weight: 1,
      explanationVi: '  A=1\u0000\r\nB=1  ',
      explanationKind: 'formula',
    }),
    { text: 'A=1 B=1' }
  );

  const blendCases: Array<
    [string, Parameters<typeof computeCombinedDualScore>[0]]
  > = [
    ['blended', { userScore: 8, expertScore: 9, userConfidence: 0.7 }],
    [
      'separate_low_confidence',
      { userScore: 8, expertScore: 9, userConfidence: 0.3 },
    ],
    ['user_only', { userScore: 8, expertScore: null, userConfidence: 0.3 }],
    ['expert_only', { userScore: null, expertScore: 9, userConfidence: 0 }],
    [
      'insufficient_data',
      { userScore: null, expertScore: null, userConfidence: 0 },
    ],
  ];
  for (const [mode, params] of blendCases) {
    const result = computeCombinedDualScore(params);
    assert.equal(result.blendMode, mode);
    assert.equal(
      vi.reviews[blendNoteKey(result.blendMode)],
      result.blendFormulaNoteVi,
      mode
    );
  }

  // The keys exist in every locale.
  const keys = [
    'ratingWeightBadge',
    'ratingWeightTitle',
    'trustModelBadge',
    'weightWhySummary',
    'weightExplanationShippingOnly',
    'weightExplanationFiller',
    'weightExplanationSabotage',
    'weightExplanationBombing',
    'weightExplanationSeeding',
    'weightExplanationStarsOnly',
    'weightExplanationPlatformLabel',
    'weightExplanationLowEffort',
    'blendNoteBlended',
    'blendNoteSeparateLowConfidence',
    'blendNoteUserOnly',
    'blendNoteExpertOnly',
    'blendNoteInsufficientData',
    'sponsorshipBadgeSponsoredBalanced',
    'sponsorshipBadgeSponsoredPromo',
    'sponsorshipBadgeIncentivized',
    'sponsorshipBadgeAffiliate',
    'starAnomalyWarning',
    'flagPendingLabel',
    'flagPendingDesc',
    'errLoginRequired',
    'errRealAccountRequired',
    'errDuplicateReview',
    'errRateLimited',
    'errInvalidReview',
    'errSubmitFailed',
  ];
  for (const locale of ['vi', 'en', 'cs']) {
    const messages = JSON.parse(
      readFileSync(
        new URL(`../../../locales/${locale}.json`, import.meta.url),
        'utf8'
      )
    ) as Record<string, Record<string, string>>;
    for (const key of keys) {
      assert.ok(messages.reviews?.[key], `${locale}.reviews.${key} is missing`);
    }
    assert.ok(
      messages.homePage?.pendingAnalysisBadge,
      `${locale}.homePage.pendingAnalysisBadge is missing`
    );
    assert.ok(
      messages.merchants?.flagPendingAnalysis,
      `${locale}.merchants.flagPendingAnalysis is missing`
    );
  }

  // Czech pages write the formula's decimals with a comma; vi and en keep
  // the dot, and Vietnamese free text is left alone (DOS/Rate#1411).
  const formula = 'A=1 · B=1 · C=1.2 · D=1 · E=1 · F=1 -> 1.20x';
  assert.deepEqual(
    weightExplanationCopy(
      { weight: 1.2, explanationVi: formula, explanationKind: 'formula' },
      'cs'
    ),
    { text: 'A=1 · B=1 · C=1,2 · D=1 · E=1 · F=1 -> 1,20x' }
  );
  assert.deepEqual(
    weightExplanationCopy({ weight: 1.2, explanationVi: formula }, 'cs'),
    { text: 'A=1 · B=1 · C=1,2 · D=1 · E=1 · F=1 -> 1,20x' },
    'a cached row without a kind'
  );
  assert.deepEqual(
    weightExplanationCopy(
      { weight: 1.2, explanationVi: formula, explanationKind: 'formula' },
      'en'
    ),
    { text: formula }
  );
  assert.deepEqual(weightExplanationCopy(cached, 'cs'), {
    text: cached.explanationVi,
  });
  const cs = JSON.parse(
    readFileSync(new URL('../../../locales/cs.json', import.meta.url), 'utf8')
  );
  // No dot decimal anywhere in the review section's Czech messages.
  for (const [key, text] of Object.entries(cs.reviews)) {
    if (typeof text !== 'string') continue;
    assert.doesNotMatch(text, /\d\.\d/, `cs reviews.${key}`);
  }

  // DOS/Rate#1727 (1): Zero-review products suppress 100% green badge/bar and
  // show neutral muted insufficient-data copy; positive total_analyzed keeps it.
  const localeDicts = {
    vi: viMessages.reviews,
    en: enMessages.reviews,
    cs: csMessages.reviews,
  } as const;
  for (const loc of ['vi', 'en', 'cs'] as const) {
    const dict = localeDicts[loc];
    for (const emptyTotal of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null as unknown as number,
      undefined as unknown as number,
    ]) {
      const zeroHtml = renderReviewsSection(loc, {
        summary: {
          total_analyzed: emptyTotal,
          authentic_pct: 100,
          suspicious_pct: 20,
          fake_pct: 10,
          pros: [],
          cons: [],
          ai_summary: null,
        },
      });
      assert.match(zeroHtml, /data-testid="jreviews-authenticity-empty-badge"/);
      assert.match(zeroHtml, /data-testid="jreviews-authenticity-empty-note"/);
      assert.ok(zeroHtml.includes(dict.notAvailableShort));
      assert.ok(zeroHtml.includes(dict.blendNoteInsufficientData));
      assert.doesNotMatch(
        zeroHtml,
        /<div[^>]*progress-bar bg-(?:success|warning|danger)/
      );
      assert.doesNotMatch(zeroHtml, /(?:Thực chất|Authentic|Skutečné):\s*100/);
      assert.doesNotMatch(zeroHtml, /(?:Nghi vấn|suspicious|Podezřelé):\s*20/i);
      assert.doesNotMatch(
        zeroHtml,
        /(?:Đánh giá ảo|Fake reviews|Falešné recenze):\s*10/
      );
    }

    const positiveHtml = renderReviewsSection(loc, {
      summary: {
        total_analyzed: 6,
        authentic_pct: 90,
        suspicious_pct: 5,
        fake_pct: 5,
        pros: [],
        cons: [],
        ai_summary: null,
      },
    });
    assert.doesNotMatch(
      positiveHtml,
      /data-testid="jreviews-authenticity-empty-badge"/
    );
    assert.doesNotMatch(
      positiveHtml,
      /data-testid="jreviews-authenticity-empty-note"/
    );
    assert.match(positiveHtml, /progress-bar bg-success"[^>]*width:90%/);
    assert.match(positiveHtml, /(?:Thực chất|Authentic|Skutečné):\s*90/);
  }

  // DOS/Rate#1727 (2): Copied Reviews Markdown localizes Deal Radar strings.
  const mdSampleReview = {
    id: 'rev-md-1',
    author_name: 'Buyer One',
    reviewer_type: 'user',
    rating_star: 5,
    helpfulness_weight: 1.25,
    include_in_rating: true,
    flag_category: 'authentic',
    verdict: 'authentic',
    upvotes: 3,
    downvotes: 0,
    report_count: 0,
    comment: 'Solid battery life and clean display.',
    created_at: '2026-11-01T00:00:00Z',
  } as ReviewItem;
  const genuineRadar: RadarSignal = {
    ...EMPTY_RADAR_SIGNAL,
    verdict: 'genuine_deal',
    savingsPct: 12.5,
  };
  const trapRadar: RadarSignal = {
    ...EMPTY_RADAR_SIGNAL,
    verdict: 'fake_sale_trap',
    fakeMarkupPct: 18,
  };
  assert.match(
    buildJReviewsMarkdown({
      productName: 'iPhone 16 Pro',
      reviews: [mdSampleReview],
      radarSignal: genuineRadar,
      locale: 'vi',
    }),
    /- \*\*Price signal:\*\* ✅ Dưới giá trung vị \(-12\.5%\)/
  );
  const enMd = buildJReviewsMarkdown({
    productName: 'iPhone 16 Pro',
    reviews: [mdSampleReview],
    radarSignal: genuineRadar,
    locale: 'en',
  });
  assert.match(enMd, /- \*\*Price signal:\*\* ✅ Below median \(-12\.5%\)/);
  assert.doesNotMatch(enMd, /Dưới giá trung vị|Đáy giá đa sàn|Cảnh báo/);
  const csMd = buildJReviewsMarkdown({
    productName: 'iPhone 16 Pro',
    reviews: [mdSampleReview],
    radarSignal: trapRadar,
    locale: 'cs',
  });
  assert.match(
    csMd,
    /- \*\*Price signal:\*\* 🚨 Upozornění na falešnou slevu \(\+18,0\s*%\)/
  );
  assert.doesNotMatch(csMd, /Dưới giá trung vị|Đáy giá đa sàn|Cảnh báo/);
  const jreviewsSrc = readFileSync(
    new URL('../../components/reviews/JReviewsSection.tsx', import.meta.url),
    'utf8'
  );
  assert.match(jreviewsSrc, /radarMarkdownCell\(radarSignal,\s*locale\)/);
  assert.doesNotMatch(jreviewsSrc, /radarMarkdownCell\(radarSignal\)/);

  // DOS/Rate#1727 (3): Star filter pills, write-review disclosure, and
  // 5x5 criterion star controls expose WCAG states and 2.5.3 names.
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prevV2 = process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2;
  try {
    delete process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2;
    for (const loc of ['vi', 'en', 'cs'] as const) {
      const dict = localeDicts[loc];
      const closedHtml = renderReviewsSection(loc);
      assert.match(
        closedHtml,
        new RegExp(
          `role="group"[^>]*aria-label="${escapeRe(dict.starFilterAll)}"`
        )
      );
      assert.match(
        closedHtml,
        new RegExp(
          `aria-pressed="true"[^>]*>${escapeRe(dict.starFilterAll)}</button>`
        )
      );
      for (const tierLabel of ['5 ★', '4 ★', '3 ★', '2 ★', '1 ★']) {
        assert.match(
          closedHtml,
          new RegExp(
            `aria-pressed="false"[^>]*>${escapeRe(tierLabel)}</button>`
          )
        );
      }
      assert.match(
        closedHtml,
        new RegExp(
          `<button[^>]*aria-expanded="false"(?![^>]*aria-controls)[^>]*>${escapeRe(dict.openWriteFormBtn)}</button>`
        )
      );

      const openHtml = renderReviewsSection(loc, {
        defaultWriteFormOpen: true,
      });
      const toggleMatch = openHtml.match(
        new RegExp(
          `<button[^>]*aria-expanded="true"[^>]*aria-controls="([^"]+)"[^>]*>${escapeRe(dict.closeFormBtn)}</button>`
        )
      );
      assert.ok(toggleMatch?.[1], `${loc}: open toggle exposes aria-controls`);
      assert.match(
        openHtml,
        new RegExp(`<form id="${escapeRe(toggleMatch[1])}"`)
      );

      for (const cKey of [
        'criteriaScreen',
        'criteriaPerformance',
        'criteriaCamera',
        'criteriaBattery',
        'criteriaValue',
      ] as const) {
        const label = dict[cKey].replace(/&/g, '&amp;');
        assert.match(
          openHtml,
          new RegExp(`role="group"[^>]*aria-label="${escapeRe(label)}"`)
        );
        for (const star of [1, 2, 3, 4, 5]) {
          const pressed = star === 5 ? 'true' : 'false';
          assert.match(
            openHtml,
            new RegExp(
              `aria-pressed="${pressed}"[^>]*aria-label="${escapeRe(label)}: ${star}/5 ★"[^>]*>★</button>`
            )
          );
        }
      }
    }

    const ineligibleHtml = renderReviewsSection('en', {
      masterProductId: undefined,
      defaultWriteFormOpen: true,
    });
    assert.doesNotMatch(ineligibleHtml, /<form\b/);
    assert.doesNotMatch(ineligibleHtml, /Write a review|✕ Close form/);

    process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2 = '1';
    const v2OpenHtml = renderReviewsSection('en', {
      defaultWriteFormOpen: true,
    });
    const v2Match = v2OpenHtml.match(
      /<button[^>]*aria-expanded="true"[^>]*aria-controls="([^"]+)"[^>]*>✕ Close form<\/button>/
    );
    assert.ok(v2Match?.[1], 'v2 open toggle exposes aria-controls');
    assert.match(
      v2OpenHtml,
      new RegExp(`<div id="${escapeRe(v2Match[1])}"><form[^>]*review-form-v2`)
    );

    // DOS/Rate#1837: ReviewFormV2 renders Czech criterion labels on /cs across
    // every category instead of falling back to English, and JReviewsSection
    // drives criteriaAverages + review card badges from getRatingCriteria with
    // legacy mapping, zero double-counting, extra valid keys, and cs comma scores.
    const renderFormV2 = (
      loc: 'vi' | 'en' | 'cs',
      categorySlug?: string
    ): string => {
      const full =
        loc === 'en' ? enMessages : loc === 'cs' ? csMessages : viMessages;
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
          { locale: loc, messages, timeZone: 'Asia/Ho_Chi_Minh' },
          React.createElement(ReviewFormV2, {
            masterProductId: '22222222-2222-4222-8222-222222221837',
            productName: 'Test Product',
            categorySlug,
            defaultAuthorName: 'Tester',
            onStored: () => {},
          })
        )
      );
    };

    for (const cat of RATING_CRITERIA_CATEGORIES) {
      const expectedCriteria = getRatingCriteria(cat);
      const csFormHtml = renderFormV2('cs', cat);
      const enFormHtml = renderFormV2('en', cat);
      const viFormHtml = renderFormV2('vi', cat);
      for (const crit of expectedCriteria) {
        assert.ok(
          csFormHtml.includes(crit.label.cs),
          `cs ReviewFormV2 (${cat}) must render ${crit.label.cs}`
        );
        assert.match(
          csFormHtml,
          new RegExp(
            `role="radiogroup"[^>]*aria-label="${escapeRe(crit.label.cs)}"`
          ),
          `cs ReviewFormV2 (${cat}) radiogroup aria-label must be Czech`
        );
        assert.match(
          csFormHtml,
          new RegExp(`aria-label="${escapeRe(crit.label.cs)}: 4,5 hvězdiček"`),
          `cs ReviewFormV2 (${cat}) half-star radio aria-label must use Czech label and comma`
        );
        if (crit.label.cs !== crit.label.en) {
          assert.ok(
            !csFormHtml.includes(`>${crit.label.en}<`),
            `cs ReviewFormV2 (${cat}) must not fall back to English ${crit.label.en}`
          );
        }
        assert.ok(
          enFormHtml.includes(crit.label.en),
          `en ReviewFormV2 (${cat}) must render ${crit.label.en}`
        );
        assert.ok(
          viFormHtml.includes(crit.label.vi),
          `vi ReviewFormV2 (${cat}) must render ${crit.label.vi}`
        );
      }
    }
  } finally {
    if (prevV2 === undefined)
      delete process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2;
    else process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2 = prevV2;
  }

  // DOS/Rate#1837: normalizeReviewCriteriaRatings unit coverage.
  assert.deepEqual(normalizeReviewCriteriaRatings('smartphones', null), {});
  assert.deepEqual(normalizeReviewCriteriaRatings('smartphones', [1, 2]), {});
  assert.deepEqual(
    normalizeReviewCriteriaRatings('smartphones', {
      screen: 4,
      performance: 4.5,
      camera: 5,
      battery: 4,
      value: 5,
    }),
    {
      display: 4,
      performance: 4.5,
      camera: 5,
      battery: 4,
      value: 5,
    }
  );
  // Canonical key wins over legacy key on the same review (no double-counting).
  assert.deepEqual(
    normalizeReviewCriteriaRatings('smartphones', {
      display: 4.5,
      screen: 2,
      value: 5,
    }),
    { display: 4.5, value: 5 }
  );
  assert.deepEqual(
    normalizeReviewCriteriaRatings('earbuds', {
      sound: 4.5,
      screen: 1.5,
      anc: 4,
      camera: 2,
      performance: 5,
      value: 5,
    }),
    { sound: 4.5, anc: 4, value: 5 }
  );
  // Legacy earbud/watch/tablet/laptop mappings drop unmapped legacy keys.
  assert.deepEqual(
    normalizeReviewCriteriaRatings('earbuds', {
      screen: 4.5,
      performance: 5,
      camera: 4,
      battery: 3.5,
      value: 5,
    }),
    { sound: 4.5, anc: 4, battery: 3.5, value: 5 }
  );
  assert.deepEqual(
    normalizeReviewCriteriaRatings('smartwatches', {
      screen: 4,
      performance: 5,
      camera: 5,
      battery: 4.5,
      value: 5,
    }),
    { display: 4, battery: 4.5, value: 5 }
  );
  assert.deepEqual(
    normalizeReviewCriteriaRatings('laptops', {
      screen: 4,
      performance: 4.5,
      camera: 5,
      battery: 4,
      value: 5,
    }),
    { display: 4, performance: 4.5, battery: 4, value: 5 }
  );
  // Extra valid RatingCriterionKeys on a review are retained; bad keys/stars dropped.
  const protoCarrier = Object.assign(Object.create({ display: 5 }), {
    display: 4.5,
    value: 5,
    sound: 4.5,
    anc: 4,
    unknown_key: 5,
    battery: 0,
    camera: 6,
    design: Number.NaN,
  });
  assert.deepEqual(
    normalizeReviewCriteriaRatings('smartphones', protoCarrier),
    { display: 4.5, value: 5, sound: 4.5, anc: 4 }
  );

  // DOS/Rate#1837: JReviewsSection SSR across earbuds, smartwatches, laptops,
  // tablets, and smartphones in vi/en/cs.
  const makeReview = (
    id: string,
    criteria_ratings: Record<string, number>,
    helpfulness_weight = 1
  ): ReviewItem =>
    ({
      id,
      author_name: `Buyer ${id}`,
      reviewer_type: 'user',
      rating_star: 4.5,
      helpfulness_weight,
      include_in_rating: true,
      flag_category: 'authentic',
      verdict: 'authentic',
      upvotes: 1,
      downvotes: 0,
      report_count: 0,
      comment: 'Detailed buyer experience over several weeks of daily usage.',
      created_at: '2026-11-20T00:00:00Z',
      criteria_ratings,
    }) as ReviewItem;

  // 1) Earbuds v2 + legacy v1 review on /cs, /en, /vi: shows sound, anc,
  //    comfort, calls, battery, value; never camera or screen; comma decimals on /cs.
  const earbudReviews = [
    makeReview('eb-v2', {
      sound: 4.5,
      anc: 4,
      comfort: 4.5,
      calls: 3.5,
      value: 5,
    }),
    makeReview('eb-v1', {
      screen: 3.5,
      performance: 5,
      camera: 5,
      battery: 4.5,
      value: 4,
    }),
  ];
  const csEarbudsHtml = renderReviewsSection('cs', {
    categorySlug: 'earbuds',
    reviewCategorySlug: null,
    reviews: earbudReviews,
  });
  for (const key of ['sound', 'anc', 'battery', 'comfort', 'calls', 'value']) {
    assert.match(csEarbudsHtml, new RegExp(`data-criterion-card="${key}"`));
  }
  for (const forbidden of ['camera', 'screen', 'performance']) {
    assert.doesNotMatch(
      csEarbudsHtml,
      new RegExp(`data-criterion-card="${forbidden}"`)
    );
    assert.doesNotMatch(
      csEarbudsHtml,
      new RegExp(`data-testid="review-criterion-badge-${forbidden}"`)
    );
  }
  // sound average = (4.5 + 3.5) / 2 = 4,0/5; anc average = (4 + 5) / 2 = 4,5/5.
  assert.match(
    csEarbudsHtml,
    /data-criterion-card="sound"[\s\S]*?Kvalita zvuku[\s\S]*?4,0\/5/
  );
  assert.match(
    csEarbudsHtml,
    /data-criterion-card="anc"[\s\S]*?Potlačení hluku[\s\S]*?4,5\/5/
  );
  assert.match(
    csEarbudsHtml,
    /data-testid="review-criterion-badge-sound"[^>]*>Kvalita zvuku: 4,5\/5 ★<\/span>/
  );
  assert.match(
    csEarbudsHtml,
    /data-testid="review-criterion-badge-comfort"[^>]*>Pohodlí při nošení: 4,5\/5 ★<\/span>/
  );
  assert.match(
    csEarbudsHtml,
    /data-testid="review-criterion-badge-calls"[^>]*>Mikrofon a hovory: 3,5\/5 ★<\/span>/
  );
  assert.doesNotMatch(csEarbudsHtml, /Fotoaparát/);
  assert.doesNotMatch(csEarbudsHtml, /\d\.\d\/5/);

  const enEarbudsHtml = renderReviewsSection('en', {
    categorySlug: 'earbuds',
    reviewCategorySlug: 'earbuds',
    reviews: earbudReviews,
  });
  assert.match(
    enEarbudsHtml,
    /data-testid="review-criterion-badge-sound"[^>]*>Sound quality: 4\.5\/5 ★<\/span>/
  );
  assert.match(
    enEarbudsHtml,
    /data-testid="review-criterion-badge-anc"[^>]*>Noise cancelling: 4\.0\/5 ★<\/span>/
  );
  assert.doesNotMatch(enEarbudsHtml, /Camera/);

  // 2) Smartwatches, laptops, and tablets render their category v2 criteria and
  //    map legacy { screen: 4 } cleanly without showing camera on watches/tablets/laptops.
  const csWatchHtml = renderReviewsSection('cs', {
    categorySlug: 'smartwatches',
    reviewCategorySlug: null,
    reviews: [
      makeReview('sw-v2', { health: 4.5, apps: 4, display: 5, value: 4.5 }),
      makeReview('sw-v1', {
        screen: 4,
        performance: 5,
        camera: 5,
        battery: 4,
        value: 4.5,
      }),
    ],
  });
  assert.match(
    csWatchHtml,
    /data-criterion-card="health"[\s\S]*?Sledování zdraví[\s\S]*?4,5\/5/
  );
  assert.match(
    csWatchHtml,
    /data-criterion-card="display"[\s\S]*?Displej[\s\S]*?4,5\/5/
  );
  assert.doesNotMatch(csWatchHtml, /data-criterion-card="camera"/);
  assert.doesNotMatch(csWatchHtml, /Fotoaparát/);

  const viLaptopHtml = renderReviewsSection('vi', {
    categorySlug: 'laptops',
    reviews: [
      makeReview('lt-v2', {
        performance: 5,
        keyboard: 4.5,
        thermals: 4,
        design: 4.5,
        value: 4.5,
      }),
      makeReview('lt-v1', { screen: 4, battery: 4.5, value: 4.5 }),
    ],
  });
  assert.match(
    viLaptopHtml,
    /data-testid="review-criterion-badge-keyboard"[^>]*>Bàn phím và touchpad: 4\.5\/5 ★<\/span>/
  );
  assert.match(
    viLaptopHtml,
    /data-testid="review-criterion-badge-thermals"[^>]*>Tản nhiệt và độ ồn: 4\.0\/5 ★<\/span>/
  );
  assert.match(
    viLaptopHtml,
    /data-testid="review-criterion-badge-display"[^>]*>Màn hình: 4\.0\/5 ★<\/span>/
  );
  assert.doesNotMatch(viLaptopHtml, /data-criterion-card="camera"/);

  const csTabletHtml = renderReviewsSection('cs', {
    categorySlug: 'tablets',
    reviews: [
      makeReview('tb-v2', {
        display: 4.5,
        sound: 4.5,
        software: 4,
        value: 5,
      }),
    ],
  });
  assert.match(
    csTabletHtml,
    /data-testid="review-criterion-badge-sound"[^>]*>Reproduktory a multimédia: 4,5\/5 ★<\/span>/
  );
  assert.match(
    csTabletHtml,
    /data-testid="review-criterion-badge-software"[^>]*>Software a příslušenství: 4,0\/5 ★<\/span>/
  );

  // 3) Smartphones: no double-counting when both legacy `screen` and canonical
  //    `display` appear on the same review, plus extra valid RatingCriterionKey
  //    rendered on the individual review card.
  const csPhoneMixedHtml = renderReviewsSection('cs', {
    categorySlug: 'smartphones',
    reviews: [
      makeReview('ph-both', {
        display: 4.5,
        screen: 1.5,
        design: 4,
        value: 5,
        sound: 4.5,
      }),
      makeReview('ph-legacy', {
        screen: 3.5,
        value: 5,
      }),
    ],
  });
  // display average must be (4.5 + 3.5) / 2 = 4,0/5 (never counting screen=1.5).
  assert.match(
    csPhoneMixedHtml,
    /data-criterion-card="display"[\s\S]*?Displej[\s\S]*?4,0\/5/
  );
  assert.equal(
    [
      ...csPhoneMixedHtml.matchAll(
        /data-testid="review-criterion-badge-display"/g
      ),
    ].length,
    2,
    'each review renders at most one display badge even when both display and screen exist'
  );
  assert.match(
    csPhoneMixedHtml,
    /data-testid="review-criterion-badge-sound"[^>]*class="[^"]*\btext-wrap\b[^"]*\bmw-100\b[^"]*"[^>]*>Kvalita zvuku: 4,5\/5 ★<\/span>/
  );

  // 4) Services & non-canonical DB categories (`reviewCategorySlug` precedence
  //    over fallback route `categorySlug="smartphones"`).
  const csServicesViaReviewCatHtml = renderReviewsSection('cs', {
    categorySlug: 'smartphones',
    reviewCategorySlug: '  SERVICES\u0000 ',
    reviews: [
      makeReview('svc-1', {
        service_quality: 4.5,
        price: 4,
        attitude: 5,
        speed: 3.5,
      }),
    ],
  });
  for (const key of ['service_quality', 'price', 'attitude', 'speed']) {
    assert.match(
      csServicesViaReviewCatHtml,
      new RegExp(`data-criterion-card="${key}"`)
    );
  }
  assert.doesNotMatch(
    csServicesViaReviewCatHtml,
    /data-criterion-card="camera"/
  );
  assert.match(
    csServicesViaReviewCatHtml,
    /data-testid="review-criterion-badge-service_quality"[^>]*>Kvalita služeb: 4,5\/5 ★<\/span>/
  );
  assert.match(
    csServicesViaReviewCatHtml,
    /data-testid="review-criterion-badge-attitude"[^>]*>Přístup personálu: 5,0\/5 ★<\/span>/
  );

  const enServicesDirectHtml = renderReviewsSection('en', {
    categorySlug: 'services',
    reviewCategorySlug: null,
    reviews: [
      makeReview('svc-2', {
        service_quality: 4.5,
        price: 5,
      }),
    ],
  });
  assert.match(
    enServicesDirectHtml,
    /data-testid="review-criterion-badge-service_quality"[^>]*>Service quality: 4\.5\/5 ★<\/span>/
  );
  assert.match(
    enServicesDirectHtml,
    /data-testid="review-criterion-badge-price"[^>]*>Price: 5\.0\/5 ★<\/span>/
  );

  try {
    process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2 = '1';
    const printersHtml = renderReviewsSection('en', {
      categorySlug: 'smartphones',
      reviewCategorySlug: 'printers',
      defaultWriteFormOpen: true,
    });
    assert.doesNotMatch(
      printersHtml,
      /review-form-v2/,
      'non-criteria DB category printers must not render v2 review form'
    );
  } finally {
    if (prevV2 === undefined)
      delete process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2;
    else process.env.NEXT_PUBLIC_RATE_REVIEW_FORM_V2 = prevV2;
  }

  console.warn('✅ Review display suite passed');
}

main();
