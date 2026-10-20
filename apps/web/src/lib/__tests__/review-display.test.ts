import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.equal(submitErrorKey('REJECTED'), 'errInvalidReview');
  assert.equal(submitErrorKey('INVALID_BODY'), 'errInvalidReview');
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
    assert.equal(text, breakdown.explanationVi, kind);
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

  console.warn('✅ Review display suite passed');
}

main();
