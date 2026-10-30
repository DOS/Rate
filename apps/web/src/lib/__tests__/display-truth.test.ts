import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCrossPlatformDealRadarFromData } from '../../server/rate/deals';
import { merchantRiskTone } from '../merchant-risk-tone';
import { radarExplanation } from '../product-detail-copy';
import { buildRadarIndex } from '../deal-radar';
import { computeJReviewsUserScores } from '../jreviews-user-score';
import {
  computeBayesianRatingSummary,
  computeCombinedDualScore,
} from '../rate-domain-core';

// Display defects from the live audit #1131: numbers and warnings the site
// showed that were not true.

type Messages = Record<string, Record<string, string>>;
const readLocale = (locale: string): Messages =>
  JSON.parse(
    readFileSync(
      join(__dirname, '..', '..', '..', 'locales', `${locale}.json`),
      'utf8'
    )
  );
const LOCALES = ['vi', 'en', 'cs'] as const;

// DOS/Rate#1140: one risk cut-off for the home cards and the merchant page.
// Every merchant scored 4, 11 or 14 and the detail page called them all scams.
for (const score of [0, 4, 11, 14, 19]) {
  assert.equal(merchantRiskTone(score), 'good', `DOSafe ${score} is clean`);
}
for (const score of [20, 35, 49]) {
  assert.equal(merchantRiskTone(score), 'warn', `DOSafe ${score} is caution`);
}
for (const score of [50, 60, 100]) {
  assert.equal(merchantRiskTone(score), 'bad', `DOSafe ${score} is an alert`);
}
for (const unknown of [null, undefined, Number.NaN, 'abc']) {
  assert.equal(
    merchantRiskTone(unknown),
    'warn',
    'an unknown score is neither clean nor an alert'
  );
}
for (const locale of LOCALES) {
  const merchants = readLocale(locale).merchants!;
  for (const key of [
    'scamStatusClean',
    'scamStatusCaution',
    'scamStatusAlert',
    'layer2NoReviews',
  ]) {
    assert.ok(merchants[key], `${locale}: missing merchants.${key}`);
  }
  assert.ok(
    !/\d+\s*%/.test(merchants.layer2NoReviews!),
    `${locale}: the no-reviews text must not show a percentage`
  );
}
const merchantPage = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'app',
    '[locale]',
    'merchants',
    '[id]',
    'page.tsx'
  ),
  'utf8'
);
assert.ok(
  // A known DOSafe score only: an unknown one has no tone (DOS/Rate#1479).
  merchantPage.includes('merchantRiskTone(dosafeScore)') &&
    merchantPage.includes('knownDosafeRiskScore(merchant)') &&
    !merchantPage.includes('dosafe_risk_score === 0'),
  'the merchant page must use the shared risk cut-off, not "any non-zero score"'
);

// DOS/Rate#1145: the median sentence names the real number of offers, and the
// home radar calls offers listings and merchants merchants.
const master = {
  id: 'mp-aw-ultra-2',
  slug: 'apple-watch-ultra-2-64gb',
  name: 'Apple Watch Ultra 2 64GB',
  brand: 'Apple',
  category_id: 'smartwatches',
  metadata: { category_slug: 'smartwatches' },
};
const offer = (i: number, merchantId: string, price: number) => ({
  id: `offer-${i}`,
  platform: i === 0 ? 'cellphones' : 'shopee',
  price_current: price,
  price_original: null,
  url: `https://example.com/${i}`,
  merchant: {
    id: merchantId,
    name: `Store ${merchantId}`,
    platform: i === 0 ? 'cellphones' : 'shopee',
    risk_score: 4,
    is_official: true,
  },
});
const radar = computeCrossPlatformDealRadarFromData(
  [
    {
      master: master as never,
      offers: [
        offer(0, 'm-a', 16_490_000),
        offer(1, 'm-b', 23_490_000),
      ] as never,
    },
  ],
  { categorySlug: 'all', limit: 10 }
);
assert.equal(radar.totalOffersAnalyzed, 2);
assert.equal(radar.totalMerchantsAnalyzed, 2);
const deal = radar.genuineDeals[0];
assert.ok(deal, 'the cheaper of two offers is still below their median');
assert.equal(deal.marketOfferCount, 2);
assert.ok(
  !/10 sàn/i.test(deal.explanationVi) && !/10 Sàn/.test(deal.verdictBadgeVi),
  `no "10 sàn" claim from 2 offers: ${deal.explanationVi} / ${deal.verdictBadgeVi}`
);
assert.match(deal.explanationVi, /trung vị của 2 tin bán/);

const signal = buildRadarIndex(radar).get(master.slug)!;
const note = radarExplanation(signal);
assert.equal(note?.key, 'radarExplanationGenuineDeal');
assert.equal(note!.values.count, '2');
// Without a known offer count there is no median sentence at all.
assert.equal(
  radarExplanation({
    ...signal,
    genuineDeal: {
      ...signal.genuineDeal!,
      marketOfferCount: undefined as never,
    },
  }),
  null
);
for (const locale of LOCALES) {
  const merchants = readLocale(locale).merchants!;
  for (const key of ['radarGenuineBadge', 'profileRadarGenuineCount']) {
    assert.ok(
      !/giá đáy|cross-store low|minim napříč/i.test(merchants[key]!),
      `${locale}: merchants.${key} counts every genuine deal, not floors`
    );
  }
}
for (const locale of LOCALES) {
  const messages = readLocale(locale);
  const sentence = messages.productDetail!.radarExplanationGenuineDeal!;
  assert.ok(
    sentence.includes('{count}'),
    `${locale}: median sentence needs {count}`
  );
  assert.ok(
    !/10[ -](sàn|platform|platforem)/i.test(sentence),
    `${locale}: median sentence must not claim 10 platforms`
  );
  const home = messages.homePage!.radarHomeAnalyzed!;
  assert.ok(
    // A plain or a plural argument (DOS/Rate#1398).
    /\{offers[},]/.test(home) && /\{merchants[},]/.test(home),
    `${locale}: the home radar line needs both offers and merchants`
  );
}
assert.match(
  readLocale('vi').homePage!.radarHomeAnalyzed!,
  /\{offers\} tin bán của \{merchants\} gian hàng/
);

// One merchant listing twice counts once.
const sameMerchant = computeCrossPlatformDealRadarFromData(
  [
    {
      master: master as never,
      offers: [
        offer(0, 'm-a', 16_490_000),
        offer(1, 'm-a', 23_490_000),
        offer(2, 'm-b', 20_000_000),
      ] as never,
    },
  ],
  { categorySlug: 'all', limit: 10 }
);
assert.equal(sameMerchant.totalOffersAnalyzed, 3);
assert.equal(sameMerchant.totalMerchantsAnalyzed, 2);

// DOS/Rate#1144: with no expert score, the composite equals the buyer score
// the header shows. 9 rating-only 5-star reviews (weight 0.25 each) are 4.54
// in the header and were 5.0 in the composite.
const ratingOnly = Array.from({ length: 9 }, () => ({
  reviewer_type: 'user',
  include_in_rating: true,
  helpfulness_weight: 0.25,
  rating_star: 5,
}));
const header = computeBayesianRatingSummary(ratingOnly, 5).bayesianRating;
const live = computeJReviewsUserScores(ratingOnly, 5, 5);
assert.equal(header, 4.54);
assert.equal(live.bayesianUser, header);
assert.equal(
  live.user,
  5,
  'the plain weighted mean stays shown as TB trọng số'
);
const composite = computeCombinedDualScore({
  userScore: live.bayesianUser,
  expertScore: null,
  userConfidence: live.bayesianConfidence,
  fallbackAverage: 5,
});
assert.equal(composite.blendMode, 'user_only');
assert.equal(composite.overall, header);
assert.equal(composite.overall.toFixed(1), header.toFixed(1));
const reviewsSection = readFileSync(
  join(__dirname, '..', '..', 'components', 'reviews', 'JReviewsSection.tsx'),
  'utf8'
);
assert.match(
  reviewsSection,
  /computeCombinedDualScore\(\{\s*userScore: bayesianUserScore,/,
  'the reviews section composite must read the Bayesian buyer score'
);

console.log('display-truth: ok');
