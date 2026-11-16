import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import {
  AiReviewAnalyzer,
  compute6AxisWeightBreakdown,
  computeBayesianProductRating,
  computeReviewWeight,
  computeVoterWeight,
  formatDecimalHalfUp,
  merchantRiskBreakdown,
  roundDecimalHalfUp,
  type AnalyzedReviewResult,
  type ReviewInputItem,
} from '../ai-review-analyzer.js';
import {
  MAX_CLUSTER_PEER_ROWS,
  resolveClusterPeerFloorPrice,
  type ClusterPeerPriceCandidate,
} from '../cluster-peer-floor.js';

function makeAuthenticResult(id: string, weight: number): AnalyzedReviewResult {
  return {
    review_id: id,
    verdict: 'authentic',
    flag_category: 'authentic',
    fake_probability: 0.05,
    include_in_rating: weight > 0,
    helpfulness_weight: weight,
    reason: 'Authentic review',
    signals: {
      burst_pattern_score: 0,
      duplicate_text_ratio: 0,
      account_age_bucket: 'high',
      reviewer_history_score: 0.8,
      language_marker_score: 0.1,
    },
  };
}

export function runAnalyzerRoundingAndPeerFloorTests(): void {
  // 1. Shared decimal-safe half-up rounding helper (DOS/Rate#1679)
  assert.equal(formatDecimalHalfUp(0.175, 2), '0.18');
  assert.equal(roundDecimalHalfUp(0.175, 2), 0.18);
  assert.equal(formatDecimalHalfUp(1.005, 2), '1.01');
  assert.equal(roundDecimalHalfUp(1.005, 2), 1.01);
  assert.equal(formatDecimalHalfUp(4.35, 1), '4.4');
  assert.equal(roundDecimalHalfUp(4.35, 1), 4.4);
  assert.equal(formatDecimalHalfUp(4.345, 2), '4.35');
  assert.equal(roundDecimalHalfUp(4.345, 2), 4.35);
  assert.equal(formatDecimalHalfUp(2.675, 2), '2.68');
  assert.equal(roundDecimalHalfUp(2.675, 2), 2.68);
  assert.equal(formatDecimalHalfUp(5e-3, 2), '0.01');
  assert.equal(formatDecimalHalfUp(1e-9, 2), '0.00');
  assert.equal(formatDecimalHalfUp(5e-9, 8), '0.00000001');
  assert.equal(formatDecimalHalfUp(5.1234567890123455e-9, 8), '0.00000001');
  assert.equal(formatDecimalHalfUp(0, 2), '0.00');
  assert.equal(formatDecimalHalfUp(-0, 2), '0.00');
  assert.equal(roundDecimalHalfUp(Number.NaN, 2), 0);
  assert.equal(roundDecimalHalfUp(Number.POSITIVE_INFINITY, 2), 0);

  for (let thousandths = 1; thousandths <= 5000; thousandths++) {
    assert.equal(
      roundDecimalHalfUp(thousandths / 1000, 2),
      Math.floor((thousandths + 5) / 10) / 100,
      `roundDecimalHalfUp(${thousandths / 1000}, 2)`
    );
  }
  for (let hundredths = 1; hundredths <= 500; hundredths++) {
    assert.equal(
      roundDecimalHalfUp(hundredths / 100, 1),
      Math.floor((hundredths + 5) / 10) / 10,
      `roundDecimalHalfUp(${hundredths / 100}, 1)`
    );
  }

  // 2. 6-axis review weights: exact decimal midpoints & multi-factor products
  const midpointBreakdown = compute6AxisWeightBreakdown({
    authenticity: 'doubtful', // 0.5
    independence: 'affiliate', // 0.7
    depth: 'low_effort', // 0.5 -> 0.5 * 0.7 * 0.5 = 0.175
    reviewerMultiplier: 1.0,
    contextMultiplier: 1.0,
  });
  assert.equal(midpointBreakdown.base_weight, 0.175);
  assert.equal(
    midpointBreakdown.weight,
    0.18,
    '0.5 * 0.7 * 0.5 = 0.175 must round half-up to 0.18'
  );

  const multiFactorBaseTie = compute6AxisWeightBreakdown({
    authenticity: 'doubtful', // 0.5
    independence: 'affiliate', // 0.7
    depth: 'stars_only', // 0.25
    reviewerMultiplier: 1.3, // 0.5 * 0.7 * 0.25 * 1.3 = 0.11375
    contextMultiplier: 1.0,
  });
  assert.equal(
    multiFactorBaseTie.base_weight,
    0.1138,
    '0.5 * 0.7 * 0.25 * 1.3 = 0.11375 must round half-up to 0.1138'
  );

  const multiFactorFinalTie = compute6AxisWeightBreakdown({
    authenticity: 'doubtful', // 0.5
    independence: 'affiliate', // 0.7
    depth: 'low_effort', // 0.5
    reviewerMultiplier: 1.3, // 0.5 * 0.7 * 0.5 * 1.3 = 0.2275
    contextMultiplier: 1.0,
  });
  assert.equal(multiFactorFinalTie.base_weight, 0.2275);
  assert.equal(multiFactorFinalTie.weight, 0.23, '0.2275 * 1.0 must round half-up to 0.23');

  assert.equal(
    computeVoterWeight({
      accountAgeDays: 90,
      verifiedReviewCount: 5,
      trustScore: 0.5005,
    }),
    0.501
  );
  assert.equal(
    computeReviewWeight({
      upvotes: 0,
      downvotes: 0.65,
      reportCount: 0,
      flagCategory: 'authentic',
      verdict: 'authentic',
    }),
    0.81,
    '1 - 0.65 * 0.3 = 0.805 must round half-up to 0.81'
  );

  // 3. Bayesian shrinkage midpoint ties (1.005 -> 1.01, 0.175 -> 0.18, k*mu drift)
  const bayesianMidpoint = computeBayesianProductRating([{ rating_star: 1, weight: 1 }], {
    priorMean: 1.01,
    priorStrength: 1,
  });
  assert.equal(
    bayesianMidpoint.score,
    1.01,
    '(1 * 1.01 + 1 * 1) / 2 = 1.005 must round half-up to 1.01'
  );

  const bayesianRawMidpoint = computeBayesianProductRating(
    [
      { rating_star: 1, weight: 199 },
      { rating_star: 2, weight: 1 },
    ],
    { priorMean: 4.2, priorStrength: 3 }
  );
  assert.equal(
    bayesianRawMidpoint.raw_weighted_average,
    1.01,
    '201 / 200 = 1.005 must round half-up to 1.01'
  );

  const bayesianConfMidpoint = computeBayesianProductRating([{ rating_star: 5, weight: 7 }], {
    priorMean: 4.2,
    priorStrength: 33,
  });
  assert.equal(
    bayesianConfMidpoint.confidence,
    0.18,
    '7 / (7 + 33) = 0.175 must round half-up to 0.18'
  );

  const bayesianPriorDrift = computeBayesianProductRating([{ rating_star: 4, weight: 7 }], {
    priorMean: 4.35,
    priorStrength: 3,
  });
  assert.equal(
    bayesianPriorDrift.score,
    4.11,
    '(3 * 4.35 + 7 * 4) / 10 = 4.105 must round half-up to 4.11'
  );

  const bayesianSubnormalGuard = computeBayesianProductRating(
    [
      { rating_star: 1, weight: 7 },
      { rating_star: 5, weight: 1e-30 },
    ],
    { priorMean: 4.35, priorStrength: 3 }
  );
  assert.equal(
    bayesianSubnormalGuard.score,
    2.01,
    'Negligible sub-1e-24 weight must not revert batch to binary-float rounding'
  );

  // 4. Summary & merchant risk midpoint ties
  const analyzer = new AiReviewAnalyzer({ provider: 'dos-ai', apiKey: '' });
  const reviews200: ReviewInputItem[] = [];
  const results200: AnalyzedReviewResult[] = [];
  for (let i = 0; i < 200; i++) {
    const star = i === 0 ? 2 : 1; // sum = 201 -> 201 / 200 = 1.005
    reviews200.push({ id: `r-${i}`, rating_star: star, comment: 'Pin ổn' });
    results200.push(makeAuthenticResult(`r-${i}`, 1));
  }
  const summary1005 = analyzer.computeJReviewsSummary(reviews200, results200, 1.005);
  assert.equal(summary1005.raw_average_rating, 1.01);
  assert.equal(summary1005.user_rating_weighted, 1.01);
  assert.equal(summary1005.expert_rating, 1.01);
  assert.equal(summary1005.overall_rating, 1.01);

  // Authenticity score: 200 reviews with 3 seeding_fake -> 100 - (3/200)*85 = 98.725 -> 98.73
  const mixedResults = results200.map((r, idx) =>
    idx < 3
      ? {
          ...r,
          verdict: 'fake' as const,
          flag_category: 'seeding_fake' as const,
          include_in_rating: false,
          helpfulness_weight: 0,
        }
      : r
  );
  const summaryAuthTie = analyzer.computeJReviewsSummary(reviews200, mixedResults);
  assert.equal(summaryAuthTie.authenticity_score, 98.73);

  // Merchant risk: 57 / 200 seeding = 0.285 -> 29% in reason (not 28% from 0.285 * 100 float drift)
  const riskResults200: AnalyzedReviewResult[] = Array.from({ length: 200 }, (_, idx) =>
    idx < 57
      ? {
          ...makeAuthenticResult(`m-${idx}`, 0),
          verdict: 'fake',
          flag_category: 'seeding_fake',
          include_in_rating: false,
        }
      : makeAuthenticResult(`m-${idx}`, 1)
  );
  const riskEval = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    reviewResults: riskResults200,
  });
  assert.equal(riskEval.seeding_ratio, 0.285);
  assert.equal(riskEval.suspicious_ratio_pct, 28.5);
  assert.ok(
    riskEval.reasons.some(line => line.includes('29%')),
    `Expected 29% rounded seeding percentage, got: ${riskEval.reasons.join('; ')}`
  );
  assert.equal(merchantRiskBreakdown({ ...riskEval, trust_score: 88.005 }).trust_score, 88.01);

  // 5. resolveClusterPeerFloorPrice beyond index 1000 (MAX_CLUSTER_PEER_ROWS = 50_000)
  assert.equal(MAX_CLUSTER_PEER_ROWS, 50_000);

  const peersWithLateOfficialMall: ClusterPeerPriceCandidate[] = Array.from(
    { length: 1_205 },
    (_, idx) => ({
      id: `peer-${idx + 1}`,
      cluster_id: 'variant-256gb',
      price_current: 28_990_000,
      merchants: { is_official: false },
    })
  );
  peersWithLateOfficialMall[1_005] = {
    id: 'peer-official-1006',
    cluster_id: 'variant-256gb',
    price_current: 24_990_000,
    merchants: { is_official: true },
  };
  assert.equal(
    resolveClusterPeerFloorPrice(
      peersWithLateOfficialMall,
      'self-listing',
      29_990_000,
      'variant-256gb'
    ),
    24_990_000,
    'Official Mall sibling beyond index 1000 must not be silently truncated'
  );

  const peersWithLateLowerNonOfficial: ClusterPeerPriceCandidate[] = Array.from(
    { length: 1_500 },
    (_, idx) => ({
      id: `peer-non-official-${idx + 1}`,
      cluster_id: 'variant-512gb',
      price_current: 31_990_000,
      merchants: { is_official: false },
    })
  );
  peersWithLateLowerNonOfficial[1_350] = {
    id: 'peer-low-1351',
    cluster_id: 'variant-512gb',
    price_current: 26_490_000,
    merchants: { is_official: false },
  };
  assert.equal(
    resolveClusterPeerFloorPrice(
      peersWithLateLowerNonOfficial,
      'self-listing',
      32_990_000,
      'variant-512gb'
    ),
    26_490_000,
    'Lower-priced valid peer offer beyond index 1000 must be discovered'
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runAnalyzerRoundingAndPeerFloorTests();
  console.log('✅ analyzer-rounding-peer-floor.test.ts passed');
}
