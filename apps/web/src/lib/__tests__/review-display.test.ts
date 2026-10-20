import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isFilteredOutReview,
  isPendingReview,
  reviewBadgeKind,
  sponsorshipBadgeKey,
  submitErrorKey,
} from '../review-display';
import {
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

  // The keys exist in every locale.
  const keys = [
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
