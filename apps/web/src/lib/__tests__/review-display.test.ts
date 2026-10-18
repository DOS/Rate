import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isFilteredOutReview,
  isPendingReview,
  reviewBadgeKind,
  submitErrorKey,
} from '../review-display';

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

  // The keys exist in every locale.
  const keys = [
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
