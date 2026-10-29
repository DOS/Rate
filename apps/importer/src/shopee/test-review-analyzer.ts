/**
 * Verification suite for AiReviewAnalyzer (JReviews-style scoring + 5-category flags)
 * Usage: pnpm --filter @repo/crawlers exec tsx src/shopee/test-review-analyzer.ts
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import { LLM_REVIEW_SUMMARY_PREFIX } from '@repo/shared-data/rules';
import { readFileSync } from 'node:fs';
import {
  AiReviewAnalyzer,
  BURST_AUDITOR_DETECTOR,
  accountAgeBucket,
  assessReview6Axes,
  compute6AxisWeightBreakdown,
  computeBayesianProductRating,
  computeReviewWeight,
  computeTextShingleSimilarity,
  computeVoterWeight,
  computeWilsonLowerBound,
  deriveFlagCategoryFromAxes,
  hasStarSentimentContradiction,
  isRatingOnlyComment,
  isShippingOnlyComment,
  reviewerHistoryScore,
  type AnalyzedReviewResult,
  type ReviewFlagCategory,
  type ReviewInputItem,
} from './ai-review-analyzer.js';

/** JS port of the Postgres CHECK rate.signals_valid(signals) */
function signalsValid(s: Record<string, unknown>): boolean {
  const allowed = [
    'burst_pattern_score',
    'duplicate_text_ratio',
    'account_age_bucket',
    'reviewer_history_score',
    'language_marker_score',
  ];
  for (const [k, v] of Object.entries(s)) {
    if (!allowed.includes(k)) return false;
    if (typeof v === 'number') {
      if (v < 0 || v > 1) return false;
    } else if (typeof v === 'string') {
      if (!['low', 'medium', 'high', 'unknown'].includes(v)) return false;
    } else {
      return false;
    }
  }
  return true;
}

function heuristicOnly(): AiReviewAnalyzer {
  // Empty apiKey => isConfigured() === false => deterministic Tier 1 only
  return new AiReviewAnalyzer({ provider: 'dos-ai', apiKey: '' });
}

async function run() {
  console.log('================================================================');
  console.log('1. computeReviewWeight (JReviews up/down vote weighting)');
  console.log('================================================================');

  assert.equal(computeReviewWeight({ flagCategory: 'authentic', verdict: 'authentic' }), 1);
  assert.ok(
    computeReviewWeight({ upvotes: 10, flagCategory: 'authentic', verdict: 'authentic' }) > 1.5,
    'many upvotes must boost weight above 1.5'
  );
  assert.equal(
    computeReviewWeight({ upvotes: 1000, flagCategory: 'authentic', verdict: 'authentic' }),
    3,
    'weight is capped at 3.0'
  );
  assert.equal(
    computeReviewWeight({ downvotes: 4, flagCategory: 'authentic', verdict: 'authentic' }),
    0,
    'net-negative votes must drive weight to 0'
  );
  assert.equal(
    computeReviewWeight({ reportCount: 3, flagCategory: 'authentic', verdict: 'authentic' }),
    0,
    'abuse reports must drive weight to 0'
  );
  for (const cat of [
    'low_value_coin_spam',
    'seeding_fake',
    'competitor_sabotage',
    'review_bombing',
  ] as const) {
    assert.equal(
      computeReviewWeight({ upvotes: 50, flagCategory: cat, verdict: 'authentic' }),
      0,
      `${cat} must be ignored regardless of upvotes`
    );
  }
  console.log('✅ [Weight] boost / cap / downvote / report / ignored-categories all correct');

  console.log('\n================================================================');
  console.log('2. Tier 1 heuristics: 5 flag categories');
  console.log('================================================================');

  const reviews: ReviewInputItem[] = [
    { id: 'coin', author_name: 'a1', rating_star: 5, comment: 'Nhận xu nhé shop ơi' },
    {
      id: 'seed1',
      author_name: 'u_seed_1',
      rating_star: 5,
      comment: 'Shop uy tín giao hàng nhanh đóng gói cẩn thận',
    },
    {
      id: 'seed2',
      author_name: 'u_seed_2',
      rating_star: 5,
      comment: 'Shop uy tín giao hàng nhanh đóng gói cẩn thận',
    },
    {
      id: 'sabo',
      author_name: 'rival',
      rating_star: 1,
      comment: 'Hàng tệ, ib mình bán rẻ hơn nhé',
    },
    {
      id: 'bomb',
      author_name: 'b1',
      rating_star: 1,
      comment: 'Mới đặt đã hủy đơn rồi, vào đánh 1 sao cho bõ ghét',
    },
    {
      id: 'good',
      author_name: 'g1',
      rating_star: 5,
      comment: 'Máy chạy mượt, pin trâu dùng cả ngày, màn hình rất đẹp',
      upvotes: 10,
    },
    {
      id: 'down',
      author_name: 'g2',
      rating_star: 4,
      comment: 'Camera tạm ổn nhưng loa hơi nhỏ so với tầm giá',
      downvotes: 4,
    },
  ];

  const analyzer = heuristicOnly();
  const res = analyzer.analyzeWithHeuristics(reviews);
  const byId = new Map(res.map(r => [r.review_id, r]));

  assert.equal(byId.get('coin')!.flag_category, 'low_value_coin_spam');
  assert.equal(byId.get('coin')!.include_in_rating, false);
  assert.equal(byId.get('seed1')!.flag_category, 'seeding_fake');
  assert.equal(byId.get('seed2')!.flag_category, 'seeding_fake');
  assert.equal(byId.get('sabo')!.flag_category, 'competitor_sabotage');
  assert.equal(byId.get('bomb')!.flag_category, 'review_bombing');
  assert.equal(byId.get('good')!.flag_category, 'authentic');
  assert.ok(byId.get('good')!.helpfulness_weight > 1.5);
  assert.equal(byId.get('down')!.flag_category, 'authentic');
  assert.equal(
    byId.get('down')!.include_in_rating,
    false,
    'heavily down-voted authentic review is zeroed'
  );

  for (const r of res) {
    assert.ok(
      signalsValid(r.signals as unknown as Record<string, unknown>),
      `signals for ${r.review_id} must satisfy rate.signals_valid`
    );
    assert.ok(r.fake_probability >= 0 && r.fake_probability <= 1);
  }
  console.log(
    '✅ [Heuristics] coin_spam / seeding / sabotage / bombing / authentic + vote weights OK'
  );
  console.log('✅ [Heuristics] every signals payload satisfies the DB CHECK rate.signals_valid');

  // Tiki writes the star label ("Cực kì hài lòng") as the title of every star-only review; the
  // same label from many buyers is the platform talking, not a seeding template.
  for (const label of [
    'Cực kì hài lòng',
    'Cực kỳ hài lòng.',
    'Hài lòng',
    'Bình thường',
    'Không hài lòng',
    'Rất không hài lòng',
    '',
    '  ',
  ]) {
    assert.equal(isRatingOnlyComment(label), true, `"${label}" is a star-only rating`);
  }
  assert.equal(isRatingOnlyComment('Rất hài lòng về pin và camera'), false);
  const starOnly: ReviewInputItem[] = [
    { id: 't1', author_name: 'k1', rating_star: 5, comment: 'Cực kì hài lòng' },
    { id: 't2', author_name: 'k2', rating_star: 5, comment: 'Cực kì hài lòng' },
    { id: 't3', author_name: 'k3', rating_star: 5, comment: 'Cực kì hài lòng' },
    { id: 't4', author_name: 'k4', rating_star: 4, comment: '' },
  ];
  for (const r of analyzer.analyzeWithHeuristics(starOnly)) {
    assert.notEqual(
      r.flag_category,
      'seeding_fake',
      `${r.review_id}: a rating label is not seeding`
    );
    assert.equal(r.flag_category, 'authentic', 'a star-only rating is a real rating');
    assert.equal(r.verdict, 'suspicious');
    assert.equal(r.include_in_rating, true, 'stars without text count in the weighted rating');
    assert.equal(r.helpfulness_weight, 0.25, 'at a quarter of a text review (same as SQL)');
    assert.ok(r.fake_probability < 0.65, 'not counted as seeding by the burst auditor (>= 0.65)');
    assert.equal(r.signals.duplicate_text_ratio, 0);
    assert.match(r.reason, /Chỉ chấm sao/);
  }
  const starMix: ReviewInputItem[] = [
    {
      id: 'm1',
      author_name: 'w1',
      rating_star: 5,
      comment: 'Pin dùng được cả ngày, màn hình rất đẹp',
    },
    { id: 'm2', author_name: 'w2', rating_star: 1, comment: '' },
  ];
  const mixSummary = analyzer.computeJReviewsSummary(
    starMix,
    analyzer.analyzeWithHeuristics(starMix)
  );
  assert.equal(mixSummary.authentic_review_count, 2);
  assert.equal(
    mixSummary.user_rating_weighted,
    4.2,
    '(5 x 1 + 1 x 0.25) / 1.25: the star-only 1 star weighs less'
  );
  console.log('✅ [Heuristics] star-only ratings are not seeding and count at 0.25 weight');

  // Reviewer-derived signals come from scraped reviewer metadata, not constants.
  const base: ReviewInputItem = {
    id: 'rv',
    rating_star: 5,
    comment: 'ok',
    platform_created_at: '2026-10-01T00:00:00.000Z',
  };
  assert.equal(accountAgeBucket(base), 'unknown', 'no join date => unknown, not a guess');
  assert.equal(
    accountAgeBucket({ ...base, reviewer: { joinedAt: '2026-09-25T00:00:00.000Z' } }),
    'low'
  );
  assert.equal(
    accountAgeBucket({ ...base, reviewer: { joinedAt: '2026-03-01T00:00:00.000Z' } }),
    'medium'
  );
  assert.equal(
    accountAgeBucket({ ...base, reviewer: { joinedAt: '2021-01-01T00:00:00.000Z' } }),
    'high'
  );
  assert.equal(
    accountAgeBucket({ ...base, reviewer: { joinedAt: '2027-01-01T00:00:00.000Z' } }),
    'unknown',
    'join date after the review is bad data, not a new account'
  );
  assert.equal(
    accountAgeBucket({
      id: 'rv',
      rating_star: 5,
      reviewer: { joinedAt: '2021-01-01T00:00:00.000Z' },
    }),
    'unknown',
    'no review date => cannot tell the account age at writing time'
  );
  assert.equal(reviewerHistoryScore(base), 0.7, 'unknown history keeps the neutral prior');
  assert.equal(reviewerHistoryScore({ ...base, reviewer: { totalReviews: 0 } }), 0);
  assert.equal(reviewerHistoryScore({ ...base, reviewer: { totalReviews: 9 } }), 0.5);
  assert.equal(reviewerHistoryScore({ ...base, reviewer: { totalReviews: 5000 } }), 1);
  assert.equal(reviewerHistoryScore({ ...base, reviewer_type: 'expert' }), 1);
  const [withReviewer] = heuristicOnly().analyzeWithHeuristics([
    { ...base, reviewer: { joinedAt: '2026-09-28T00:00:00.000Z', totalReviews: 1 } },
  ]);
  assert.equal(withReviewer!.signals.account_age_bucket, 'low');
  assert.equal(withReviewer!.signals.reviewer_history_score, 0.151);
  assert.ok(signalsValid(withReviewer!.signals as unknown as Record<string, unknown>));
  console.log(
    '✅ [Reviewer] account age bucket & history score derived from scraped reviewer metadata'
  );

  console.log('\n================================================================');
  console.log('3. JReviews dual rating (Expert vs weighted authentic User)');
  console.log('================================================================');

  const jr: ReviewInputItem[] = [
    {
      id: 'u1',
      author_name: 'x1',
      rating_star: 5,
      comment: 'Dùng được hai tuần rất hài lòng về hiệu năng',
    },
    {
      id: 'u2',
      author_name: 'x2',
      rating_star: 5,
      comment: 'Pin bền hơn máy cũ của mình rất nhiều thật sự',
    },
    { id: 'spam', author_name: 'x3', rating_star: 1, comment: 'nhận xu' },
    {
      id: 'exp',
      author_name: 'Tech Reviewer',
      rating_star: 4,
      comment: 'Đánh giá chuyên sâu sau một tháng sử dụng máy',
      reviewer_type: 'expert',
    },
  ];
  const jrRes = heuristicOnly().analyzeWithHeuristics(jr);
  const summary = heuristicOnly().computeJReviewsSummary(jr, jrRes);

  assert.equal(summary.total_reviews_analyzed, 4);
  assert.equal(summary.authentic_review_count, 3);
  assert.equal(summary.ignored_review_count, 1);
  assert.equal(
    summary.user_rating_weighted,
    5,
    'ignored spam must not drag the weighted user rating'
  );
  assert.equal(summary.expert_rating, 4);
  assert.equal(summary.overall_rating, 4.6, 'overall = 40% expert + 60% weighted user');
  assert.equal(summary.breakdown_by_category.low_value_coin_spam, 1);
  console.log(
    `✅ [JReviews] user=${summary.user_rating_weighted} expert=${summary.expert_rating} overall=${summary.overall_rating}`
  );

  const allIgnored: ReviewInputItem[] = [
    { id: 'i1', author_name: 'y1', rating_star: 5, comment: 'nhận xu' },
    { id: 'i2', author_name: 'y2', rating_star: 5, comment: 'ok' },
  ];
  const ignoredSummary = heuristicOnly().computeJReviewsSummary(
    allIgnored,
    heuristicOnly().analyzeWithHeuristics(allIgnored)
  );
  assert.equal(ignoredSummary.authentic_review_count, 0);
  assert.equal(ignoredSummary.raw_average_rating, 5);
  assert.equal(
    ignoredSummary.user_rating_weighted,
    0,
    'no counted review means no weighted rating, not the raw average of excluded ones'
  );
  assert.equal(ignoredSummary.overall_rating, 0);
  console.log('✅ [JReviews] every review excluded -> weighted rating 0 (matches the SQL refresh)');

  // LLM summary text (DOS/Rate#1244): stored once with the one-listing scope; a
  // summary quoting a score or count falls back to the templated sentence.
  const llmScoped = heuristicOnly().computeJReviewsSummary(
    jr,
    jrRes,
    null,
    [],
    [],
    'Pin trâu, camera chụp đêm tốt nhưng máy hơi nóng.'
  );
  assert.equal(
    llmScoped.ai_summary,
    `${LLM_REVIEW_SUMMARY_PREFIX}Pin trâu, camera chụp đêm tốt nhưng máy hơi nóng.`
  );
  const llmScore = heuristicOnly().computeJReviewsSummary(
    jr,
    jrRes,
    null,
    [],
    [],
    'Sản phẩm đạt 4.9/5 sao, được người mua đánh giá rất cao.'
  );
  assert.ok(
    llmScore.ai_summary.startsWith('Lần phân tích gần nhất (một nơi bán) đã xét 4 đánh giá'),
    'a score quoted by the LLM is never stored'
  );
  console.log('✅ [JReviews] LLM summary scoped to one listing; quoted scores fall back');

  console.log('\n================================================================');
  console.log('4. Merchant risk: fair to sellers, harsh on seeding & dump pricing');
  console.log('================================================================');

  const mk = (flag: ReviewFlagCategory): AnalyzedReviewResult => ({
    review_id: 'x',
    verdict: flag === 'authentic' ? 'authentic' : 'fake',
    flag_category: flag,
    fake_probability: 0.5,
    include_in_rating: flag === 'authentic',
    helpfulness_weight: flag === 'authentic' ? 1 : 0,
    reason: '',
    signals: {
      burst_pattern_score: 0,
      duplicate_text_ratio: 0,
      account_age_bucket: 'medium',
      reviewer_history_score: 0.5,
      language_marker_score: 0,
    },
  });

  const clean = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    reviewResults: [mk('authentic'), mk('authentic'), mk('authentic'), mk('authentic')],
  });
  assert.equal(clean.risk_score, 15);
  assert.equal(clean.risk_level, 'low');

  const seeded = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    reviewResults: [mk('seeding_fake'), mk('seeding_fake'), mk('authentic'), mk('authentic')],
  });
  assert.ok(seeded.risk_score > clean.risk_score + 30, 'seeding must be penalised heavily');
  assert.equal(seeded.risk_level, 'high');

  const sabotaged = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    reviewResults: [
      mk('competitor_sabotage'),
      mk('review_bombing'),
      mk('low_value_coin_spam'),
      mk('authentic'),
    ],
  });
  assert.equal(
    sabotaged.risk_score,
    15,
    'sabotage / bombing / coin spam must NOT penalise the seller'
  );
  assert.ok(sabotaged.reasons.some(r => r.includes('bảo vệ')));

  // A one-star rating with no text is a weak signal, not a defect report.
  const lowStars: ReviewInputItem[] = [
    { id: 'l1', author_name: 'z1', rating_star: 1, comment: '' },
    {
      id: 'l2',
      author_name: 'z2',
      rating_star: 5,
      comment: 'Máy chạy ổn định, pin dùng được hai ngày',
    },
    {
      id: 'l3',
      author_name: 'z3',
      rating_star: 5,
      comment: 'Giao hàng nhanh, đóng gói kỹ, máy mới nguyên seal',
    },
  ];
  const starOnlyLow = analyzer.evaluateMerchantRisk({
    platform: 'tiki',
    isOfficial: false,
    reviewResults: analyzer.analyzeWithHeuristics(lowStars),
    rawReviews: lowStars,
  });
  assert.equal(
    starOnlyLow.risk_score,
    15,
    'a text-less 1 star (0.25 of 3 < 20%) adds no defect penalty'
  );
  const textLow = [
    { ...lowStars[0]!, comment: 'Máy lỗi màn hình sau hai ngày, shop không bảo hành' },
    ...lowStars.slice(1),
  ];
  const describedLow = analyzer.evaluateMerchantRisk({
    platform: 'tiki',
    isOfficial: false,
    reviewResults: analyzer.analyzeWithHeuristics(textLow),
    rawReviews: textLow,
  });
  assert.ok(describedLow.risk_score > 15, 'a described defect still counts in full');
  const buriedLow = [{ ...textLow[0]!, downvotes: 4 }, ...textLow.slice(1)];
  const buriedResults = analyzer.analyzeWithHeuristics(buriedLow);
  assert.equal(buriedResults[0]!.include_in_rating, false);
  const buried = analyzer.evaluateMerchantRisk({
    platform: 'tiki',
    isOfficial: false,
    reviewResults: buriedResults,
    rawReviews: buriedLow,
  });
  assert.equal(
    buried.risk_score,
    15,
    'a complaint voted down out of the rating adds no defect penalty'
  );

  const dump = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    listingPrice: 8_000_000,
    canonicalMinPrice: 28_500_000,
    reviewResults: [mk('authentic')],
  });
  assert.equal(dump.price_anomaly_detected, true);
  assert.ok(dump.risk_score >= 60);

  const mall = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: true,
    listingPrice: 8_000_000,
    canonicalMinPrice: 28_500_000,
    reviewResults: [mk('authentic')],
  });
  assert.equal(
    mall.price_anomaly_detected,
    false,
    'official stores are exempt from price-anomaly scoring'
  );
  console.log(
    `✅ [Risk] clean=${clean.risk_score} seeded=${seeded.risk_score} sabotaged=${sabotaged.risk_score} dump=${dump.risk_score} mall=${mall.risk_score}`
  );

  console.log('\n================================================================');
  console.log('5. Tier 2: LLM batch refinement via mock OpenAI-compatible server');
  console.log('================================================================');

  let llmCalls = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        llmCalls++;
        const payload = JSON.parse(body) as { messages: Array<{ content: string }> };
        const user = JSON.parse(payload.messages[1]!.content) as {
          reviews: Array<{ review_id: string }>;
        };
        const out = {
          reviews: user.reviews.map(r => ({
            review_id: r.review_id,
            flag_category: r.review_id === 'llm-seed' ? 'seeding_fake' : 'authentic',
            verdict: r.review_id === 'llm-seed' ? 'fake' : 'authentic',
            fake_probability: r.review_id === 'llm-seed' ? 0.93 : 0.04,
            reason:
              r.review_id === 'llm-seed' ? 'Văn phong quảng cáo, kịch bản lặp' : 'Trải nghiệm thật',
          })),
          pros: ['Pin trâu'],
          cons: ['Loa nhỏ'],
          ai_summary: 'Người dùng thật khen pin, chê loa.',
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;

  try {
    const llm = new AiReviewAnalyzer({
      provider: 'dos-ai',
      apiKey: 'mock-key',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'qwen-3.6-27b',
    });

    const input: ReviewInputItem[] = [
      {
        id: 'llm-seed',
        author_name: 'n1',
        rating_star: 5,
        comment: 'Sản phẩm xuất sắc hoàn hảo mọi mặt nên mua ngay hôm nay',
      },
      {
        id: 'llm-real',
        author_name: 'n2',
        rating_star: 4,
        comment: 'Pin dùng được cả ngày nhưng loa hơi nhỏ thôi',
      },
      { id: 'llm-coin', author_name: 'n3', rating_star: 5, comment: 'nhận xu' },
      { id: 'llm-stars', author_name: 'n4', rating_star: 5, comment: '' },
    ];
    const { results, summary: s } = await llm.analyzeReviews(input, { entityName: 'Test Phone' });
    const m = new Map(results.map(r => [r.review_id, r]));

    assert.equal(llmCalls, 1, 'one batch => one LLM call');
    assert.equal(
      m.get('llm-seed')!.flag_category,
      'seeding_fake',
      'LLM may upgrade an authentic-by-heuristic review'
    );
    assert.equal(m.get('llm-seed')!.include_in_rating, false);
    assert.equal(m.get('llm-real')!.flag_category, 'authentic');
    assert.equal(
      m.get('llm-coin')!.flag_category,
      'low_value_coin_spam',
      'high-confidence heuristic must not be overridden by LLM'
    );
    assert.equal(
      m.get('llm-stars')!.fake_probability,
      0.3,
      'a star-only rating keeps the heuristic probability'
    );
    assert.match(m.get('llm-stars')!.reason, /Chỉ chấm sao/, "not the model's guess");
    assert.deepEqual(s.pros, ['Pin trâu']);
    assert.deepEqual(s.cons, ['Loa nhỏ']);
    assert.equal(s.authentic_review_count, 2, 'the real review and the star-only rating');
    console.log('✅ [LLM] batch refinement merged correctly; heuristic precedence preserved');

    console.log('\n================================================================');
    console.log('6. persistAnalysisToSupabase payload shape (stubbed client)');
    console.log('================================================================');

    const calls: Array<{
      table: string;
      op: string;
      payload: unknown;
      col?: string;
      val?: string;
    }> = [];
    // review_flags rows the stub reports as already written by another detector.
    let existingFlagRows: Array<{
      review_id: string;
      verdict?: string;
      flag_category?: string;
      include_in_rating?: boolean;
      fake_probability?: number;
    }> = [];
    let existingFlagsError: { message: string } | null = null;
    const flagReads: Array<{ ids: string[]; detectors: string[] }> = [];
    const stub = {
      from: (table: string) => ({
        select: () => ({
          in: (_idCol: string, ids: string[]) => ({
            in: async (_detCol: string, detectors: string[]) => {
              flagReads.push({ ids, detectors });
              return existingFlagsError
                ? { data: null, error: existingFlagsError }
                : { data: existingFlagRows.filter(r => ids.includes(r.review_id)), error: null };
            },
          }),
        }),
        upsert: async (payload: unknown) => {
          calls.push({ table, op: 'upsert', payload });
          return { error: null };
        },
        update: (payload: unknown) => ({
          eq: async (col: string, val: string) => {
            calls.push({ table, op: 'update', payload, col, val });
            return { error: null };
          },
        }),
      }),
    } as unknown as Parameters<typeof llm.persistAnalysisToSupabase>[0];

    const out = await llm.persistAnalysisToSupabase(stub, {
      productId: 'prod-1',
      masterId: 'master-1',
      merchantId: 'merch-1',
      reviews: input,
      platform: 'shopee',
      listingPrice: 25_000_000,
      canonicalMinPrice: 28_500_000,
      isOfficial: false,
    });

    const flagUpsert = calls.find(c => c.table === 'review_flags' && c.op === 'upsert')!;
    const flagRowsPayload = flagUpsert.payload as Array<{
      flag_category: ReviewFlagCategory;
      verdict: string;
      signals: Record<string, unknown>;
      input_hash: string;
    }>;
    assert.equal(flagRowsPayload.length, input.length);
    for (const row of flagRowsPayload) {
      assert.ok(
        [
          'authentic',
          'low_value_coin_spam',
          'seeding_fake',
          'competitor_sabotage',
          'review_bombing',
        ].includes(row.flag_category)
      );
      assert.ok(['authentic', 'suspicious', 'fake', 'unanalyzed'].includes(row.verdict));
      assert.ok(signalsValid(row.signals));
      assert.match(row.input_hash, /^0x[0-9a-f]{64}$/);
    }
    assert.ok(
      calls.some(
        c =>
          c.table === 'review_analysis' &&
          c.op === 'upsert' &&
          (c.payload as Record<string, unknown>).product_id === 'prod-1'
      )
    );
    assert.ok(
      calls.some(
        c =>
          c.table === 'master_products' &&
          c.op === 'update' &&
          c.val === 'master-1' &&
          'user_rating_weighted' in (c.payload as Record<string, unknown>)
      )
    );
    // The merchant's review risk is evaluated but never written: Rate Services'
    // MerchantRiskAuditor owns it (DOS/Rate#1341).
    assert.equal(
      calls.filter(c => c.table === 'merchants').length,
      0,
      'persistAnalysisToSupabase writes nothing on merchants'
    );
    assert.equal(
      calls.filter(c => c.table === 'reviews' && c.op === 'update').length,
      input.length,
      'helpfulness_weight written per review'
    );
    assert.ok(out.merchantRisk);

    // 6b. When .rpc() is available on the Supabase client, persistAnalysisToSupabase delegates
    // master rating refresh to canonical SQL RPC `refresh_master_product_rating` (Audit C5)
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const rpcStub = {
      ...stub,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return { error: null };
      },
    } as unknown as Parameters<typeof llm.persistAnalysisToSupabase>[0];
    await llm.persistAnalysisToSupabase(rpcStub, {
      productId: 'prod-rpc-1',
      masterId: 'master-rpc-1',
      merchantId: 'merch-1',
      reviews: input,
      platform: 'shopee',
    });
    assert.deepEqual(rpcCalls, [
      { fn: 'refresh_master_product_rating', args: { p_master_id: 'master-rpc-1' } },
    ]);
    assert.equal(
      calls.some(
        c => c.table === 'master_products' && c.op === 'update' && c.val === 'master-rpc-1'
      ),
      false,
      'When .rpc() is provided, master_products rating is updated exclusively by SQL RPC'
    );
    // 6c. Flags written by the burst auditor (DOS/Rate#322) and by the community
    // review RPC survive re-analysis.
    assert.deepEqual(flagReads[0]!.detectors, [
      BURST_AUDITOR_DETECTOR,
      'rate-community-guard',
      'rate-jreviews-guard',
    ]);
    assert.deepEqual(
      flagReads[0]!.ids,
      input.map(r => r.id)
    );
    const baseline = await llm.persistAnalysisToSupabase(stub, {
      productId: 'prod-baseline',
      reviews: input,
      platform: 'shopee',
      merchantId: 'merch-1',
    });
    // The real review is the one a burst auditor relabels as seeding.
    const burstTarget = input.find(r => r.id === 'llm-real')!;
    existingFlagRows = [
      {
        review_id: burstTarget.id,
        verdict: 'fake',
        flag_category: 'seeding_fake',
        include_in_rating: false,
        fake_probability: 0.85,
      },
    ];
    calls.length = 0;
    const withBurst = await llm.persistAnalysisToSupabase(stub, {
      productId: 'prod-burst',
      reviews: input,
      platform: 'shopee',
      merchantId: 'merch-1',
    });
    assert.equal(
      withBurst.summary.authentic_review_count,
      baseline.summary.authentic_review_count - 1,
      'summary must count the burst-flagged review as the stored flag says, not as authentic'
    );
    assert.equal(
      withBurst.summary.breakdown_by_category.seeding_fake,
      baseline.summary.breakdown_by_category.seeding_fake + 1
    );
    // The heuristic fallback summary text must reflect the overlaid counts, not the analyzer's own.
    const heuristicPersist = heuristicOnly();
    existingFlagRows = [];
    const heuristicBaseline = await heuristicPersist.persistAnalysisToSupabase(stub, {
      productId: 'prod-h-baseline',
      reviews: input,
    });
    existingFlagRows = [
      {
        review_id: burstTarget.id,
        verdict: 'fake',
        flag_category: 'seeding_fake',
        include_in_rating: false,
        fake_probability: 0.85,
      },
    ];
    const heuristicBurst = await heuristicPersist.persistAnalysisToSupabase(stub, {
      productId: 'prod-h-burst',
      reviews: input,
    });
    assert.ok(
      heuristicBurst.summary.ai_summary.includes(
        `giữ lại ${heuristicBurst.summary.authentic_review_count} đánh giá`
      ),
      'fallback summary text must be built from the overlaid counts'
    );
    assert.notEqual(heuristicBurst.summary.ai_summary, heuristicBaseline.summary.ai_summary);
    calls.length = 0;
    await llm.persistAnalysisToSupabase(stub, {
      productId: 'prod-burst',
      reviews: input,
      platform: 'shopee',
      merchantId: 'merch-1',
    });
    const analysisUpsert = calls.find(c => c.table === 'review_analysis' && c.op === 'upsert')!;
    assert.equal(
      (analysisUpsert.payload as { authenticity_score: number }).authenticity_score,
      withBurst.summary.authenticity_score
    );
    const burstUpsert = calls.find(c => c.table === 'review_flags' && c.op === 'upsert')!;
    const burstRowIds = (burstUpsert.payload as Array<{ review_id: string }>).map(r => r.review_id);
    assert.equal(
      burstRowIds.includes(burstTarget.id),
      false,
      'burst auditor flag must not be overwritten'
    );
    assert.equal(burstRowIds.length, input.length - 1);
    assert.equal(
      calls.filter(c => c.table === 'reviews' && c.op === 'update').length,
      input.length,
      'helpfulness_weight is still written for every review'
    );
    const burstWeightUpdate = calls.find(
      c => c.table === 'reviews' && c.op === 'update' && c.val === burstTarget.id
    );
    assert.deepEqual(
      burstWeightUpdate?.payload,
      { helpfulness_weight: 0 },
      'preserved burst-audited review with include_in_rating=false must write helpfulness_weight=0'
    );

    existingFlagRows = input.map(r => ({ review_id: r.id }));
    calls.length = 0;
    await llm.persistAnalysisToSupabase(stub, { productId: 'prod-all-burst', reviews: input });
    assert.equal(
      calls.some(c => c.table === 'review_flags' && c.op === 'upsert'),
      false,
      'no upsert when every row is preserved'
    );

    existingFlagRows = [];
    existingFlagsError = { message: 'read timeout' };
    await assert.rejects(
      llm.persistAnalysisToSupabase(stub, { productId: 'prod-read-fail', reviews: input }),
      /Failed to read existing review_flags: read timeout/,
      'a failed read must not fall through to an overwrite'
    );
    existingFlagsError = null;

    console.log(
      '✅ [Persist] review_flags / review_analysis / master_products (RPC & stub) / no merchants write (RS auditor owns review risk, #1341) / reviews payloads valid; burst auditor flags preserved'
    );

    console.log('\n================================================================');
    console.log('7. castReviewVote (rate.review_votes per-user vote & report)');
    console.log('================================================================');

    let lastVoteUpsert: {
      payload: Record<string, unknown>;
      opts: { onConflict?: string };
    } | null = null;
    const deletedPair: { reviewId?: string; voterId?: string } = {};
    const voteStub = {
      from: (table: string) => {
        assert.equal(table, 'review_votes');
        return {
          upsert: async (payload: Record<string, unknown>, opts: { onConflict?: string }) => {
            lastVoteUpsert = { payload, opts };
            return { error: null };
          },
          delete: () => ({
            eq: (col1: string, val1: string) => {
              if (col1 === 'review_id') deletedPair.reviewId = val1;
              return {
                eq: async (col2: string, val2: string) => {
                  if (col2 === 'voter_id') deletedPair.voterId = val2;
                  return { error: null };
                },
              };
            },
          }),
        };
      },
    } as unknown as Parameters<typeof llm.castReviewVote>[0];

    const r1 = await llm.castReviewVote(voteStub, {
      reviewId: 'rev-1',
      voterId: 'user-1',
      vote: 'up',
      reported: false,
    });
    assert.equal(r1.action, 'upserted');
    assert.deepEqual(lastVoteUpsert!.payload, {
      review_id: 'rev-1',
      voter_id: 'user-1',
      vote: 'up',
      reported: false,
      report_reason: null,
    });
    assert.equal(lastVoteUpsert!.opts.onConflict, 'review_id,voter_id');

    const r2 = await llm.castReviewVote(voteStub, {
      reviewId: 'rev-1',
      voterId: 'user-1',
      vote: null,
      reported: false,
    });
    assert.equal(r2.action, 'deleted');
    assert.deepEqual(deletedPair, { reviewId: 'rev-1', voterId: 'user-1' });
    console.log('✅ [Vote] castReviewVote upsert & delete verified');
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log('8. Review Trust Model P1 (6-axis scoring, shipping routing, Bayesian rating)');
  console.log('================================================================');

  // Section 6 worked examples from Docs/Platform/review-trust-model.html
  const ex1 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'organic',
    depth: 'detailed',
    hasRealMedia: true,
    reviewerMultiplier: 1.1,
    contextMultiplier: 1.0,
    upvotes: 12,
  });
  assert.equal(ex1.depth, 1.1);
  assert.equal(ex1.community, 2.0, '12 upvotes reaches F cap of 2.0');
  assert.equal(ex1.weight, 2.42, '1 * 1 * 1.1 * 1.1 * 1 * 2 = 2.42');

  const ex2 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'organic',
    depth: 'expert_depth',
    reviewerMultiplier: 1.3,
    contextMultiplier: 1.0,
    upvotes: 3,
  });
  assert.equal(ex2.weight, 2.53, '1.2 * 1.3 * (1 + 0.45 * ln(4)) ≈ 2.53');

  const ex3 = compute6AxisWeightBreakdown({
    authenticity: 'doubtful',
    independence: 'organic',
    depth: 'detailed',
    reviewerMultiplier: 0.8,
    contextMultiplier: 1.0,
  });
  assert.equal(ex3.weight, 0.4, '0.5 * 1 * 1 * 0.8 * 1 * 1 = 0.40');

  const ex4 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'sponsored_balanced',
    depth: 'detailed',
    reviewerMultiplier: 1.1,
    contextMultiplier: 1.0,
  });
  assert.equal(ex4.weight, 0.55, '1 * 0.5 * 1 * 1.1 * 1 * 1 = 0.55');

  const ex5 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'organic',
    depth: 'low_effort',
    reviewerMultiplier: 1.0,
    contextMultiplier: 1.0,
  });
  assert.equal(ex5.weight, 0.5, 'low_effort -> 0.50');

  const ex7 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'sponsored_promo',
    depth: 'detailed',
    reviewerMultiplier: 1.1,
    contextMultiplier: 1.0,
  });
  assert.equal(ex7.weight, 0.11, '1 * 0.1 * 1 * 1.1 = 0.11');

  const ex8 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'organic',
    depth: 'filler',
  });
  assert.equal(ex8.gate, 0);
  assert.equal(ex8.weight, 0);

  const ex9 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'conflict_of_interest',
    depth: 'detailed',
  });
  assert.equal(ex9.gate, 0);
  assert.equal(ex9.weight, 0);

  // Section 12 flag_category derivation
  assert.equal(deriveFlagCategoryFromAxes('fabricated', 'organic', 'detailed'), 'seeding_fake');
  assert.equal(
    deriveFlagCategoryFromAxes('genuine', 'undisclosed_paid', 'detailed'),
    'seeding_fake'
  );
  assert.equal(
    deriveFlagCategoryFromAxes('sabotage', 'organic', 'detailed'),
    'competitor_sabotage'
  );
  assert.equal(
    deriveFlagCategoryFromAxes('genuine', 'conflict_of_interest', 'detailed'),
    'competitor_sabotage'
  );
  assert.equal(deriveFlagCategoryFromAxes('bombing', 'organic', 'low_effort'), 'review_bombing');
  assert.equal(deriveFlagCategoryFromAxes('genuine', 'organic', 'filler'), 'low_value_coin_spam');
  assert.equal(deriveFlagCategoryFromAxes('doubtful', 'organic', 'low_effort'), 'authentic');

  // Shipping-only routing & Star-vs-sentiment contradiction
  assert.equal(
    isShippingOnlyComment('Giao hàng chậm, đóng gói sơ sài làm hộp bị móp'),
    true,
    'pure shipping/packaging comment is shipping-only'
  );
  assert.equal(
    isShippingOnlyComment('Giao hàng nhanh, đóng gói kỹ, máy mới nguyên seal'),
    false,
    'comment mentioning product condition is NOT shipping-only'
  );
  // Product words count only as whole words, and delivery wording is not a
  // product mention (DOS/Rate#601, parity with the web trust model).
  for (const comment of [
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
    assert.equal(isShippingOnlyComment(comment), true, `shipping-only: ${comment}`);
  }
  for (const comment of [
    'Sản phẩm rất tốt, giao hàng nhanh',
    'Sản phẩm tuyệt vời, giao hàng nhanh',
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
    'Giao hàng nhanh, máy đẹp, đóng gói kỹ',
    'Chất lượng sản phẩm:tốt\nĐúng với mô tả:đúng mô tả\n\nĐóng gói cẩn thận. Giao hàng nhanh chóng.',
    'GIAO HÀNG NHANH, ĐIỆN THOẠI DÙNG TỐT',
  ]) {
    assert.equal(isShippingOnlyComment(comment), false, `product: ${comment}`);
  }
  // The web trust model must use the same list, or the stored weight and the
  // web estimate disagree again.
  const regexLiteral = (file: string, name: string) => {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const match = new RegExp(`const ${name} =\\s*(/.*?/iu);`).exec(src);
    assert.ok(match, `${name} literal in ${file}`);
    return match[1];
  };
  assert.equal(
    regexLiteral('./ai-review-analyzer.ts', 'PRODUCT_MENTION_RE'),
    regexLiteral('../../../web/src/lib/rate-domain-core.ts', 'WEB_PRODUCT_MENTION_RE'),
    'importer and web product mention lists are identical'
  );
  assert.equal(
    hasStarSentimentContradiction(5, 'Máy bị lỗi sập nguồn liên tục, hàng giả không dùng được'),
    true
  );
  assert.equal(hasStarSentimentContradiction(1, 'Máy dùng rất tốt mượt mà hoàn hảo 10 điểm'), true);
  assert.equal(hasStarSentimentContradiction(5, 'Máy dùng rất tốt, pin trâu mượt mà'), false);

  const p1Reviews: ReviewInputItem[] = [
    {
      id: 'ship-only',
      rating_star: 2,
      comment: 'Giao hàng quá chậm, shipper thái độ, đóng gói móp hộp',
    },
    {
      id: 'contradict',
      rating_star: 5,
      comment: 'Máy bị lỗi hỏng hoàn toàn không lên nguồn được, chấm 5 sao để nổi',
    },
    {
      id: 'expert-tech',
      rating_star: 5,
      comment:
        'Sau 4 tháng sử dụng thực tế: pin 5000 mAh trụ được 8.5 giờ on screen, màn hình 120Hz sáng 1800 nit rất đẹp nhưng camera chụp đêm hơi bệt.',
      images: ['https://example.com/photo1.jpg'],
      reviewer: { totalReviews: 25, verifiedPurchase: true },
    },
  ];
  const p1Analyzed = analyzer.analyzeWithHeuristics(p1Reviews);
  const shipRes = p1Analyzed.find(r => r.review_id === 'ship-only')!;
  assert.equal(shipRes.include_in_rating, false, 'shipping-only excluded from product rating');
  assert.equal(shipRes.helpfulness_weight, 0);
  assert.equal(shipRes.assessment?.breakdown.context, 0);
  assert.equal(shipRes.assessment?.aspects.shipping?.routesTo, 'merchant');

  const contraRes = p1Analyzed.find(r => r.review_id === 'contradict')!;
  assert.equal(contraRes.verdict, 'suspicious');
  assert.equal(contraRes.assessment?.authenticity, 'doubtful');
  assert.equal(contraRes.assessment?.breakdown.authenticity, 0.5);

  const techRes = p1Analyzed.find(r => r.review_id === 'expert-tech')!;
  assert.equal(techRes.assessment?.depth, 'expert_depth');
  assert.equal(
    techRes.assessment?.breakdown.depth,
    1.5,
    'expert_depth (1.2) + real photo (0.1) + long-term usage >= 3 months (0.2) = 1.5'
  );
  assert.equal(techRes.assessment?.breakdown.reviewer, 1.1, 'totalReviews >= 10 -> D = 1.1');

  // Section 7 Bayesian worked examples
  // Example 1: CellphoneS listing with 5 star-only 5-star reviews (w = 0.25 each, sum(w) = 1.25)
  const cellphonesBayes = computeBayesianProductRating([
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
  ]);
  assert.equal(cellphonesBayes.effective_weight_sum, 1.25);
  assert.equal(Number(cellphonesBayes.score.toFixed(1)), 4.4);
  assert.equal(cellphonesBayes.confidence, 0.29);
  assert.equal(cellphonesBayes.confidence_tier, 'insufficient_data');
  assert.equal(cellphonesBayes.confidence_label_vi, 'Chưa đủ dữ liệu');

  // Example 2: Tiki AirPods Pro 3: 5 text reviews (1, 4, 5, 5, 5 stars, w = 1) + 6 star-only 5-star reviews (w = 0.25)
  const tikiBayes = computeBayesianProductRating([
    { rating_star: 1, weight: 1 },
    { rating_star: 4, weight: 1 },
    { rating_star: 5, weight: 1 },
    { rating_star: 5, weight: 1 },
    { rating_star: 5, weight: 1 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
    { rating_star: 5, weight: 0.25 },
  ]);
  assert.equal(tikiBayes.effective_weight_sum, 6.5);
  assert.equal(Number(tikiBayes.score.toFixed(1)), 4.2);
  assert.equal(tikiBayes.confidence, 0.68);
  assert.equal(tikiBayes.confidence_tier, 'medium');
  assert.equal(tikiBayes.confidence_label_vi, 'Trung bình');

  console.log(
    `✅ [P1 Trust Model] 6-axis weights, shipping-only routing, contradiction & Bayesian rating (CellphoneS=${cellphonesBayes.score}/${cellphonesBayes.confidence_tier}, Tiki=${tikiBayes.score}/${tikiBayes.confidence_tier}) verified`
  );

  console.log('\n================================================================');
  console.log(
    '9. Review Trust Model P2 & P3 (Voter weight, Wilson bound, Shingle copy, Affiliate)'
  );
  console.log('================================================================');

  // 9.1 Voter Weight (Section 9)
  assert.equal(
    computeVoterWeight({ accountAgeDays: 3, verifiedReviewCount: 5, isVerifiedContact: true }),
    0,
    'Account < 7 days old cannot vote (weight = 0)'
  );
  assert.equal(
    computeVoterWeight({ accountAgeDays: 90, verifiedReviewCount: 5, isVerifiedContact: false }),
    0,
    'Unverified email/phone cannot vote (weight = 0)'
  );
  assert.equal(
    computeVoterWeight({ accountAgeDays: 15, verifiedReviewCount: 5, trustScore: 0.8 }),
    0.1,
    'Account < 30 days old is capped at 0.1 regardless of prior'
  );
  assert.equal(
    computeVoterWeight({ accountAgeDays: 180, verifiedReviewCount: 0, trustScore: 0.5 }),
    0.1,
    'Account with 0 verified reviews is capped at 0.1 (never uses 0.5 starting prior)'
  );
  assert.equal(
    computeVoterWeight({ accountAgeDays: 180, verifiedReviewCount: 4, trustScore: 0.85 }),
    0.85,
    'Established voter uses trust score T'
  );

  // 9.2 Wilson Score Lower Bound (Section 9)
  const wilson1of1 = computeWilsonLowerBound(1, 0);
  const wilson50of52 = computeWilsonLowerBound(50, 2);
  assert.ok(
    wilson50of52 > wilson1of1,
    `50/52 helpful (${wilson50of52}) must rank higher than 1/1 helpful (${wilson1of1})`
  );
  assert.equal(computeWilsonLowerBound(0, 0), 0);

  // 9.3 Near-Duplicate 3-Shingle Copy Seeding Detection (Section 10 L2)
  const tplA =
    'Máy nguyên seal chính hãng dùng cực kỳ mượt mà, pin trâu dùng cả ngày không nóng máy';
  const tplB = 'Máy nguyên seal chính hãng dùng cực kỳ mượt mà, pin trâu dùng cả ngày rất mát máy';
  const shingleSim = computeTextShingleSimilarity(tplA, tplB, 3);
  assert.ok(shingleSim >= 0.65, `Expected shingle similarity >= 0.65, got ${shingleSim}`);

  const copiedBatch = analyzer.analyzeWithHeuristics([
    { id: 'copy-1', author_name: 'seeder_a', rating_star: 5, comment: tplA },
    { id: 'copy-2', author_name: 'seeder_b', rating_star: 5, comment: tplB },
  ]);
  assert.equal(copiedBatch[0].flag_category, 'seeding_fake');
  assert.equal(copiedBatch[0].assessment?.authenticity, 'copied');
  assert.equal(copiedBatch[0].include_in_rating, false);
  assert.equal(copiedBatch[1].flag_category, 'seeding_fake');
  assert.equal(copiedBatch[1].assessment?.authenticity, 'copied');

  // 9.4 Affiliate Shortlink Detection (Section 3 Axis B / P2)
  const affAssess = assessReview6Axes({
    id: 'aff-shortlink',
    rating_star: 5,
    comment: 'Máy dùng rất mượt, mình săn sale tại https://s.shopee.vn/4f8abc giá rẻ hơn 2 triệu',
  });
  assert.equal(affAssess.independence, 'affiliate');
  assert.equal(affAssess.breakdown.independence, 0.7);

  // 9.5 Self-Excluded Peer Floor Price in ShopeeIngestionPipeline (#292)
  const { resolveClusterPeerFloorPrice } = await import('./shopee-to-supabase.js');
  const peerFloor = resolveClusterPeerFloorPrice(
    [
      { id: 'listing-bait', price_current: 5_000_000, merchants: { is_official: false } },
      { id: 'listing-peer-1', price_current: 26_500_000, merchants: { is_official: false } },
      { id: 'listing-mall-1', price_current: 28_490_000, merchants: [{ is_official: true }] },
    ],
    'listing-bait',
    5_000_000
  );
  assert.equal(
    peerFloor,
    28_490_000,
    'resolveClusterPeerFloorPrice must exclude currentProductId and prefer Official Mall sibling floor'
  );
  assert.equal(
    resolveClusterPeerFloorPrice(
      [{ id: 'listing-only', price_current: 27_990_000, merchants: { is_official: true } }],
      'listing-only',
      27_990_000
    ),
    27_990_000,
    'resolveClusterPeerFloorPrice must fall back to fallbackMasterMinPrice when no peer siblings exist'
  );

  // 9.6 ArenaSpecSyncer Non-5G & Hybrid PhoneArena Table Merging (#292)
  const { parseGsmArenaHtmlToSpecs } = await import('./arena-spec-syncer.js');
  const wifiTabletHtml = `
    <h1 data-spec="modelname">Xiaomi Pad 7 Pro</h1>
    <td data-spec="displaysize">11.2 inches</td>
    <td data-spec="displaytype">IPS LCD, 144Hz</td>
    <td data-spec="internalmemory">256GB 12GB RAM</td>
    <td data-spec="nettech">No cellular connectivity</td>
    <td data-spec="jack">Yes, 3.5mm jack</td>
  `;
  const paTableHtml = `
    <table>
      <tr><th>Main camera</th><td>50 MP, f/1.8, PDAF</td></tr>
      <tr><th>Second camera</th><td>2 MP, f/2.4, depth</td></tr>
      <tr><th>Front camera</th><td>32 MP, f/2.2</td></tr>
    </table>
  `;
  const parsedTablet = parseGsmArenaHtmlToSpecs(wifiTabletHtml, {
    phonearenaHtml: paTableHtml,
  });
  assert.equal(parsedTablet.source, 'hybrid');
  assert.equal(parsedTablet.has5g, false);
  assert.equal(parsedTablet.specifications.cellular?.has_5g, false);
  assert.equal(parsedTablet.specifications.cellular?.bands_5g, undefined);
  assert.equal(parsedTablet.specifications.multimedia?.headphone_jack_35mm, true);
  assert.equal(parsedTablet.specifications.camera?.main_camera, '50 MP, f/1.8, PDAF');
  assert.equal(parsedTablet.specifications.camera?.second_camera, '2 MP, f/2.4, depth');
  assert.equal(parsedTablet.specifications.camera?.front_camera, '32 MP, f/2.2');

  // 9.7 ProductNormalizer iPhone 16e/SE & Promo-Prefix Model Extraction + EntityMatcher Spec Preservation (#352)
  const { ProductNormalizer } = await import('./product-normalizer.js');
  const { EntityMatcher } = await import('./entity-matcher.js');
  const normalizer = new ProductNormalizer();
  const baseRaw = {
    platform: 'shopee' as const,
    itemId: 'sp-test',
    shopId: 'shop-1',
    url: 'https://shopee.vn/product/1/2',
    priceMin: 16_990_000,
    priceMax: 16_990_000,
    priceBeforeDiscount: 17_990_000,
    currency: 'VND',
    historicalSold: 50,
    ratingStar: 4.9,
    ratingCount: 10,
    images: [],
    models: [],
    attributes: [],
    shop: {
      shopId: 'shop-1',
      name: 'Shopee Mall',
      isMall: true,
    },
    reviews: [],
  };

  const iphone16e = normalizer.normalize({
    ...baseRaw,
    title: 'Điện thoại Apple iPhone 16E 128GB Chính hãng VN/A',
  });
  assert.equal(iphone16e.model, 'iPhone 16e');
  assert.equal(iphone16e.model_key, 'apple:iphone-16e:128gb');
  assert.equal(iphone16e.battery_mah, 4005);

  const iphoneSe2022 = normalizer.normalize({
    ...baseRaw,
    title: 'Apple iPhone SE (2022) 64GB Chính hãng VN/A',
  });
  // The 2022 iPhone SE is the 3rd generation (DOS/Rate#819).
  assert.equal(iphoneSe2022.model, 'iPhone SE 3');
  assert.equal(iphoneSe2022.model_key, 'apple:iphone-se-3:64gb');

  const promoSamsung = normalizer.normalize({
    ...baseRaw,
    title: '[Mã BMLT300 giảm 5%] Điện thoại thông minh Samsung Galaxy S24 Ultra 5G 256GB',
  });
  assert.equal(promoSamsung.brand, 'Samsung');
  assert.equal(promoSamsung.model, 'Galaxy S24 Ultra');
  assert.equal(promoSamsung.model_key, 'samsung:galaxy-s24-ultra:256gb');

  let updatedMasterPayload: Record<string, unknown> | null = null;
  const matcherStub = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'master-352',
              brand: 'Samsung',
              model: 'Galaxy S24 Ultra',
              storage_gb: 256,
              ram_gb: 12,
              screen_size_inch: 6.8,
              battery_mah: 5000,
              has_5g: true,
              name: 'Samsung Galaxy S24 Ultra 256GB',
              description: '',
              colors: ['Titanium Gray'],
            },
            error: null,
          }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updatedMasterPayload = payload;
          return { error: null };
        },
      }),
    }),
  } as unknown as ConstructorParameters<typeof EntityMatcher>[0];

  const matcher = new EntityMatcher(matcherStub);
  const sharedAiSpec = {
    ram_gb: null,
    storage_gb: 512,
    screen_size_inch: null,
    battery_mah: null,
    has_5g: undefined,
    specifications: { design: { colors: ['Original AI Color'] } },
    key_specs: ['6.8" AMOLED'],
  };
  (matcher as unknown as { enricher: { fetchSpecsFromAi: () => Promise<unknown> } }).enricher = {
    fetchSpecsFromAi: async () => sharedAiSpec,
  };
  const enrichOk = await matcher.enrichMasterProductById('master-352');
  assert.equal(enrichOk, true);
  assert.equal(updatedMasterPayload?.['ram_gb'], 12);
  assert.equal(updatedMasterPayload?.['storage_gb'], 256);
  assert.equal(updatedMasterPayload?.['screen_size_inch'], 6.8);
  assert.equal(updatedMasterPayload?.['battery_mah'], 5000);
  assert.equal(updatedMasterPayload?.['has_5g'], true);
  assert.deepEqual(
    (updatedMasterPayload?.['specifications'] as { design?: { colors?: string[] } })?.design
      ?.colors,
    ['Titanium Gray']
  );
  assert.deepEqual(
    sharedAiSpec.specifications.design.colors,
    ['Original AI Color'],
    'enrichMasterProductById must clone specifications instead of mutating cached AI object'
  );

  // 9.8 ShopeeIngestionPipeline masterIdHint enrichment & deduplicated review verification chunks (#356)
  const { ShopeeIngestionPipeline } = await import('./shopee-to-supabase.js');
  const verifiedInBatches: string[][] = [];
  let hintedMasterEnriched = false;
  const ingestStub = {
    from: (table: string) => {
      if (table === 'categories') {
        return {
          select: async () => ({
            data: [{ id: 'cat-smartphones', slug: 'smartphones' }],
            error: null,
          }),
        };
      }
      if (table === 'merchants') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'merch-356' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'master_products') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'master-hint-356', specifications: {} },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'products') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'prod-356' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'reviews') {
        return {
          select: () => ({
            eq: () => ({
              not: async () => ({ data: [{ platform_review_id: 'rev-dup-1' }], error: null }),
              // The pipeline asks only about the ids it is about to insert.
              in: async (_col: string, ids: string[]) => ({
                data: ids.filter(id => id === 'rev-dup-1').map(id => ({ platform_review_id: id })),
                error: null,
              }),
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({
              in: async (_col: string, ids: string[]) => {
                verifiedInBatches.push(ids);
                return { error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async (fn: string) => {
      if (fn === 'record_price_observation') {
        return { data: 'unchanged_delta', error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as NonNullable<
    ConstructorParameters<typeof ShopeeIngestionPipeline>[0]
  >['supabaseClient'];

  const pipeline356 = new ShopeeIngestionPipeline({ supabaseClient: ingestStub });
  (
    pipeline356 as unknown as {
      matcher: { enrichMasterProductById: (id: string) => Promise<boolean> };
    }
  ).matcher = {
    enrichMasterProductById: async (id: string) => {
      if (id === 'master-hint-356') hintedMasterEnriched = true;
      return true;
    },
  };

  await pipeline356.ingestProduct(
    {
      platform: 'shopee',
      itemId: 'item-356',
      shopId: 'shop-356',
      url: 'https://shopee.vn/product/356/356',
      title: 'Điện thoại Apple iPhone 16e 128GB Chính hãng VN/A',
      priceMin: 16_990_000,
      priceMax: 16_990_000,
      currency: 'VND',
      historicalSold: 10,
      ratingStar: 5,
      ratingCount: 2,
      images: ['https://cf.shopee.vn/file/ip16e.jpg'],
      models: [],
      attributes: [],
      shop: { shopId: 'shop-356', name: 'Apple Flagship Store', isMall: true },
      reviews: [
        {
          reviewId: 'rev-dup-1',
          author: 'User A',
          ratingStar: 5,
          comment: 'Máy dùng rất mượt',
          images: [],
          reviewer: { verifiedPurchase: true },
        },
        {
          reviewId: 'rev-dup-1',
          author: 'User A',
          ratingStar: 5,
          comment: 'Máy dùng rất mượt',
          images: [],
          reviewer: { verifiedPurchase: true },
        },
      ],
    },
    undefined,
    { masterIdHint: 'master-hint-356' }
  );
  assert.equal(
    hintedMasterEnriched,
    true,
    'ShopeeIngestionPipeline must enrich hinted master when its specifications object is empty'
  );
  assert.deepEqual(
    verifiedInBatches,
    [['rev-dup-1']],
    'ShopeeIngestionPipeline must deduplicate platform_review_id entries when refreshing is_verified_buyer'
  );

  // 16c. DOS/Rate#359: computeReviewWeight returns 0 for unanalyzed verdict & sabotage regex matches Vietnamese diacritics without backtracking
  assert.equal(
    computeReviewWeight({
      upvotes: 10,
      downvotes: 0,
      reportCount: 0,
      flagCategory: 'authentic',
      verdict: 'unanalyzed',
    }),
    0,
    'computeReviewWeight must return 0 when verdict is unanalyzed'
  );
  const sabotageCheck = heuristicOnly().analyzeWithHeuristics([
    {
      id: 'sab-vn-1',
      rating_star: 1,
      comment: 'Hàng chán lắm mọi người qua shop Thế Giới Phụ Kiện mua nhé',
    },
    {
      id: 'non-sab-long',
      rating_star: 1,
      comment: 'qua shop ' + 'rất xa '.repeat(600) + 'không ưng ý',
    },
  ]);
  assert.equal(
    sabotageCheck[0]!.flag_category,
    'competitor_sabotage',
    'Competitor sabotage regex must match Vietnamese diacritic shop names'
  );
  assert.notEqual(
    sabotageCheck[1]!.flag_category,
    'competitor_sabotage',
    'Long non-sabotage comment must not match competitor_sabotage or backtrack quadratically'
  );

  // 16d. DOS/Rate#379: ScrapedProductSchema MAX_VALID_VND_PRICE, normalizeScrapedProductPrices, resolveClusterPeerFloorPrice bounds, and EntityMatcher key_specs preservation
  const { MAX_VALID_VND_PRICE, ScrapedProductSchema } = await import('./types.js');
  const { normalizeScrapedProductPrices } = await import('./shopee-to-supabase.js');
  assert.equal(MAX_VALID_VND_PRICE, 1_000_000_000);
  const unscaledSchemaCheck = ScrapedProductSchema.safeParse({
    itemId: 'i-379',
    shopId: 's-379',
    url: 'https://shopee.vn/product/379/379',
    title: 'iPhone 16 Pro Max 256GB',
    priceMin: 2_899_000_000_000,
    priceMax: 2_899_000_000_000,
    shop: { shopId: 's-379', name: 'Shop 379', isMall: true },
  });
  assert.equal(
    unscaledSchemaCheck.success,
    false,
    'ScrapedProductSchema must reject unscaled priceMin/priceMax > MAX_VALID_VND_PRICE'
  );

  const normalized379 = normalizeScrapedProductPrices(
    ScrapedProductSchema.parse({
      itemId: 'i-379',
      shopId: 's-379',
      url: 'https://shopee.vn/product/379/379',
      title: 'iPhone 16 Pro Max 256GB',
      priceMin: 28_990_000,
      priceMax: 30_990_000,
      priceBeforeDiscount: 2_899_000_000_000,
      models: [
        { modelId: 'm1', name: '256GB', price: 28_990_000 },
        { modelId: 'm2', name: 'Out of stock', price: 0 },
        { modelId: 'm3', name: 'Unscaled', price: 2_899_000_000_000 },
      ],
      shop: { shopId: 's-379', name: 'Shop 379', isMall: true },
    })
  );
  assert.equal(
    normalized379.priceBeforeDiscount,
    undefined,
    'normalizeScrapedProductPrices must strip priceBeforeDiscount > MAX_VALID_VND_PRICE'
  );
  assert.equal(
    normalized379.models.length,
    1,
    'normalizeScrapedProductPrices must filter out models with price <= 0 or > MAX_VALID_VND_PRICE'
  );

  assert.equal(
    resolveClusterPeerFloorPrice(
      [
        { id: 'peer-unscaled', price_current: 2_899_000_000_000, merchants: { is_official: true } },
        { id: 'peer-valid', price_current: 28_990_000, merchants: { is_official: false } },
      ],
      'self-prod',
      2_899_000_000_000
    ),
    28_990_000,
    'resolveClusterPeerFloorPrice must ignore peer prices > MAX_VALID_VND_PRICE'
  );
  assert.equal(
    resolveClusterPeerFloorPrice(
      [{ id: 'peer-unscaled', price_current: 2_899_000_000_000, merchants: { is_official: true } }],
      'self-prod',
      2_899_000_000_000
    ),
    undefined,
    'resolveClusterPeerFloorPrice must ignore fallbackMasterMinPrice > MAX_VALID_VND_PRICE'
  );

  // EntityMatcher.enrichMasterProductById must preserve existing key_specs (e.g. price_spread_audit)
  let updatedKeySpecs379: Record<string, unknown> | null = null;
  const matcher379 = new EntityMatcher(
    {
      from: (table: string) => {
        assert.equal(table, 'master_products');
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'master-379',
                  brand: 'Apple',
                  model: 'iPhone 16 Pro Max',
                  storage_gb: 256,
                  ram_gb: 8,
                  screen_size_inch: 6.9,
                  battery_mah: 4685,
                  has_5g: true,
                  name: 'Apple iPhone 16 Pro Max 256GB',
                  description: '',
                  colors: ['Natural Titanium'],
                  key_specs: {
                    price_spread_audit: { verdict: 'normal_spread', maxSpreadRatio: 1.05 },
                    custom_tag: 'flagship',
                  },
                },
                error: null,
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            updatedKeySpecs379 = (patch.key_specs as Record<string, unknown>) ?? null;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      },
    } as unknown as import('./types.js').RateSupabaseClient,
    {
      fetchSpecsFromAi: async () => ({
        ram_gb: 8,
        storage_gb: 256,
        screen_size_inch: 6.9,
        battery_mah: 4685,
        has_5g: true,
        specifications: {
          hardware: { chipset: 'Apple A18 Pro', ram_gb: 8, storage_gb: 256 },
        },
        key_specs: {
          chip: 'Apple A18 Pro',
          screen: '6.9" LTPO Super Retina XDR OLED',
        },
      }),
    } as unknown as import('./ai-spec-enricher.js').AiSpecEnricher
  );
  const enriched379 = await matcher379.enrichMasterProductById('master-379');
  assert.equal(enriched379, true);
  assert.deepEqual(
    updatedKeySpecs379,
    {
      price_spread_audit: { verdict: 'normal_spread', maxSpreadRatio: 1.05 },
      custom_tag: 'flagship',
      chip: 'Apple A18 Pro',
      screen: '6.9" LTPO Super Retina XDR OLED',
    },
    'EntityMatcher.enrichMasterProductById must preserve existing key_specs (such as price_spread_audit) when merging AI key_specs'
  );

  // 16e. DOS/Rate#382: ArenaSpecSyncer numeric bounds, entity decoding, regex escaping, gsmarena host check, countPopulatedFieldGroups, and backfill-specs mergeKeySpecs
  const { parseGsmArenaBrandCatalogHtml, countPopulatedFieldGroups } =
    await import('./arena-spec-syncer.js');
  const { mergeKeySpecs } = await import('./jobs/backfill-specs.js');

  const edgeArenaSpecs = parseGsmArenaHtmlToSpecs(`
    <h1 data-spec="modelname">Nothing+(Phone) 3a &ndash; Edition</h1>
    <td data-spec="displaysize">0 inches</td>
    <td data-spec="displaytype">OLED, 0Hz</td>
    <td data-spec="displayresolution">1080 &#215; 2400 pixels (~5 ppi)</td>
    <td data-spec="internalmemory">0GB 0GB RAM, 256GB 12GB RAM</td>
    <td data-spec="batdescription1">Li-Ion 05 mAh</td>
    <td data-spec="batcharging">0W wired</td>
    <td data-spec="weight">0 g</td>
  `);
  assert.equal(edgeArenaSpecs.brand, 'Nothing+(Phone)');
  assert.equal(edgeArenaSpecs.model, '3a - Edition');
  assert.equal(
    edgeArenaSpecs.specifications.display?.resolution,
    '1080 × 2400 pixels (~5 ppi)',
    'Numeric HTML entity &#215; must decode to ×'
  );
  assert.equal(edgeArenaSpecs.screenSizeInch, null, '0 inches must be dropped');
  assert.equal(
    edgeArenaSpecs.specifications.display?.refresh_rate_hz,
    undefined,
    '0Hz must be dropped'
  );
  assert.equal(
    edgeArenaSpecs.specifications.display?.ppi,
    undefined,
    '5 ppi (<10) must be dropped'
  );
  assert.equal(edgeArenaSpecs.ramGb, 12);
  assert.equal(edgeArenaSpecs.storageGb, 256);
  assert.equal(edgeArenaSpecs.batteryMah, null, '5 mAh (<10) must be dropped');
  assert.equal(
    edgeArenaSpecs.specifications.battery?.fast_charging_w,
    undefined,
    '0W wired must be dropped'
  );
  assert.equal(edgeArenaSpecs.specifications.design?.weight_g, undefined, '0g must be dropped');

  const catalog382 = parseGsmArenaBrandCatalogHtml(
    `<ul>
      <li><a href="nothing_phone_3a-123.php"><span>Phone 3a &#215; Pro</span></a></li>
      <li><a href="https://evil.com/phish.php"><span>Phish Device</span></a></li>
    </ul>`,
    'Nothing+(Phone)'
  );
  assert.equal(catalog382.length, 1, 'Untrusted non-gsmarena host must be rejected');
  assert.equal(catalog382[0]?.name, 'Nothing+(Phone) Phone 3a × Pro');

  assert.equal(
    countPopulatedFieldGroups({
      display: { colors: [] },
      hardware: { extra: {} },
      camera: { main_camera: '50 MP' },
    }),
    1,
    'Empty arrays and empty objects must not count as populated specification groups'
  );

  assert.deepEqual(
    mergeKeySpecs(
      {
        price_spread_audit: { verdict: 'high_arbitrage_opportunity', spreadPct: 14 },
        screen: 'Old Screen',
      },
      {
        screen: '6.9" LTPO AMOLED 120Hz',
        chip: 'Snapdragon 8 Elite',
      }
    ),
    {
      price_spread_audit: { verdict: 'high_arbitrage_opportunity', spreadPct: 14 },
      screen: '6.9" LTPO AMOLED 120Hz',
      chip: 'Snapdragon 8 Elite',
    },
    'mergeKeySpecs in backfill-specs.ts must preserve price_spread_audit while updating canonical key_specs'
  );

  // 16f. DOS/Rate#401: Recursive computeImporterAlgorithmMetadata paramsHash and sanitizeLogMeta Error & header redaction
  const { computeImporterAlgorithmMetadata, sanitizeLogMeta } = await import('./logger.js');
  const algoMetaOrderA = computeImporterAlgorithmMetadata('review-trust-6axis', '2.1.0', {
    thresholds: { fake: 0.75, suspicious: 0.45 },
    weights: [{ axis: 'A', cap: 1.0, bonus: 0.2 }],
  });
  const algoMetaOrderB = computeImporterAlgorithmMetadata('review-trust-6axis', '2.1.0', {
    weights: [{ bonus: 0.2, cap: 1.0, axis: 'A' }],
    thresholds: { suspicious: 0.45, fake: 0.75 },
  });
  assert.equal(
    algoMetaOrderA.paramsHash,
    algoMetaOrderB.paramsHash,
    'computeImporterAlgorithmMetadata must produce identical paramsHash regardless of nested object key order'
  );

  const sanitizedMeta401 = sanitizeLogMeta({
    err: new Error('Request failed with Bearer secret-jwt-token-1234567890'),
    authorization: 'Bearer raw-auth-header',
    sessionCookie: 'SPC_EC=super-secret-cookie',
    clientCredential: 'cred-xyz',
    userJwt: 'eyJhbGciOiJIUzI1NiJ9',
    nested: {
      cause: new TypeError('Invalid token sk-abcdef1234567890abcdef'),
    },
  });
  assert.deepEqual(sanitizedMeta401, {
    err: {
      name: 'Error',
      message: 'Request failed with Bearer [REDACTED]',
    },
    authorization: '[REDACTED]',
    sessionCookie: '[REDACTED]',
    clientCredential: '[REDACTED]',
    userJwt: '[REDACTED]',
    nested: {
      cause: {
        name: 'TypeError',
        message: 'Invalid token [REDACTED_KEY]',
      },
    },
  });

  // 16g. DOS/Rate#497: extractCrawlProductsArray validation and non-executing import of run-ingestion-test.ts
  const { extractCrawlProductsArray } = await import('./run-ingestion-test.js');
  const validCrawlItems = extractCrawlProductsArray({
    results: [
      { title: 'Apple iPhone 16 Pro Max 256GB', priceMin: 28_990_000 },
      { title: '   ' },
      null,
    ],
  });
  assert.equal(
    validCrawlItems.length,
    1,
    'extractCrawlProductsArray must extract valid product entries from { results } and filter out blank/null items'
  );
  assert.equal(
    extractCrawlProductsArray([{ title: 'Samsung Galaxy S25 Ultra 256GB', priceMin: 27_990_000 }])
      .length,
    1,
    'extractCrawlProductsArray must accept a top-level array of products'
  );
  assert.throws(
    () => extractCrawlProductsArray({ invalidKey: 123 }),
    /Invalid crawl dataset/,
    'extractCrawlProductsArray must throw a descriptive error when given an invalid structure'
  );

  // 16h. DOS/Rate#514: hasPopulatedSpecificationGroups, priceMax >= priceMin clamping, and enrichMasterProductById category_slug
  const { hasPopulatedSpecificationGroups } = await import('./shopee-to-supabase.js');
  assert.equal(hasPopulatedSpecificationGroups(null), false);
  assert.equal(hasPopulatedSpecificationGroups({}), false);
  assert.equal(
    hasPopulatedSpecificationGroups({ category_slug: 'smartphones' }),
    false,
    'Stub specifications with only category_slug and 0 populated field groups must return false'
  );
  assert.equal(
    hasPopulatedSpecificationGroups({ category_slug: 'tablets', display: {} }),
    false,
    'Empty field group objects must return false'
  );
  assert.equal(
    hasPopulatedSpecificationGroups({
      category_slug: 'tablets',
      display: { size_inch: 11.0 },
    }),
    true,
    'Populated 10-field-group value must return true'
  );

  const clampedMaxProduct = normalizeScrapedProductPrices({
    itemId: 'item-514',
    shopId: 'shop-514',
    url: 'https://shopee.vn/product/514/514',
    title: 'Apple iPhone 16 Pro Max 256GB',
    priceMin: 28_990_000,
    priceMax: 0,
    currency: 'VND',
    historicalSold: 10,
    ratingStar: 4.9,
    ratingCount: 5,
    images: [],
    models: [],
    attributes: [],
    shop: {
      shopId: 'shop-514',
      name: 'Official Store',
      isMall: true,
    },
    reviews: [],
  });
  assert.equal(
    clampedMaxProduct.priceMax,
    28_990_000,
    'normalizeScrapedProductPrices must clamp priceMax < priceMin up to priceMin'
  );

  let capturedCategorySlug: string | undefined;
  let updatedSpecs514: Record<string, unknown> | undefined;
  const stubSupabase514 = {
    from(table: string) {
      assert.equal(table, 'master_products');
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      id: 'master-514',
                      brand: 'Lenovo',
                      model: 'Tab P12',
                      storage_gb: 256,
                      ram_gb: 8,
                      screen_size_inch: null,
                      battery_mah: null,
                      has_5g: false,
                      name: 'Lenovo Tab P12 256GB',
                      description: '',
                      colors: ['Storm Grey'],
                      specifications: { category_slug: 'tablets' },
                      key_specs: { storage: '256GB' },
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updatedSpecs514 = payload.specifications as Record<string, unknown>;
          return {
            async eq() {
              return { error: null };
            },
          };
        },
      };
    },
  } as unknown as ConstructorParameters<typeof EntityMatcher>[0];

  const stubEnricher514 = {
    async fetchSpecsFromAi(params: { categorySlug?: string }) {
      capturedCategorySlug = params.categorySlug;
      return {
        ram_gb: 8,
        storage_gb: 256,
        screen_size_inch: 12.7,
        battery_mah: 10200,
        has_5g: false,
        specifications: {
          display: { size_inch: 12.7, type: 'LTPS LCD, 60Hz' },
        },
        key_specs: { screen: '12.7" LTPS LCD' },
      };
    },
  } as unknown as ConstructorParameters<typeof EntityMatcher>[1];

  const matcher514 = new EntityMatcher(stubSupabase514, stubEnricher514);
  const enriched514 = await matcher514.enrichMasterProductById('master-514');
  assert.equal(enriched514, true);
  assert.equal(
    capturedCategorySlug,
    'tablets',
    'enrichMasterProductById must forward existing specifications.category_slug to fetchSpecsFromAi'
  );
  assert.equal(
    updatedSpecs514?.category_slug,
    'tablets',
    'enrichMasterProductById must preserve category_slug on mergedSpecifications'
  );

  // DOS/Rate#522: ArenaSpecSyncer weightG <= 25000 bound, TB storage formatting, color deduplication, NaN group check, and mergeKeySpecs existing cleanup
  const gsm522 = parseGsmArenaHtmlToSpecs(`
    <h1 data-spec="modelname">Apple MacBook Pro 16</h1>
    <span data-spec="weight">30000 g</span>
    <span data-spec="internalmemory">1TB 32GB RAM</span>
    <span data-spec="colors">Space Black, Silver, Space Black,  , </span>
  `);
  assert.equal(
    gsm522.specifications.design?.weight_g,
    undefined,
    'parseGsmArenaHtmlToSpecs must drop weight > 25000g so DesignSchema.parse never throws'
  );
  assert.equal(gsm522.keySpecs.storage, '1TB', '1024GB storage must format as 1TB in keySpecs');
  assert.deepEqual(gsm522.specifications.design?.colors, ['Space Black', 'Silver']);
  assert.equal(
    countPopulatedFieldGroups({ display: { size_inch: Number.NaN } }),
    0,
    'countPopulatedFieldGroups must not count NaN numeric fields as populated'
  );
  assert.deepEqual(
    mergeKeySpecs(
      { screen: '  6.8" OLED  ', empty: '   ', nil: null, badNum: Number.NaN },
      { chip: ' A18 Pro ' }
    ),
    { screen: '6.8" OLED', chip: 'A18 Pro' }
  );

  // DOS/Rate#528: AiReviewAnalyzer numeric bounds, Bayesian inputs, and review_flags chunking
  const axes528 = compute6AxisWeightBreakdown({
    authenticity: 'genuine',
    independence: 'organic',
    depth: 'detailed',
    reviewerMultiplier: Number.NaN,
    contextMultiplier: Number.NaN,
    upvotes: Number.NaN,
    downvotes: -5,
    reportCount: -10,
  });
  assert.equal(axes528.reviewer, 1.0, 'NaN reviewerMultiplier must fall back to 1.0');
  assert.equal(axes528.context, 1.0, 'NaN contextMultiplier must fall back to 1.0');
  assert.equal(axes528.community, 1.0, 'Negative/NaN votes and reportCount must be ignored');
  assert.equal(axes528.weight, 1.0);

  const bayesian528 = computeBayesianProductRating(
    [
      { rating_star: Number.NaN, weight: 2 },
      { rating_star: 0, weight: 3 },
      { rating_star: 6, weight: 3 },
      { rating_star: 5, weight: 2 },
    ],
    { priorMean: Number.NaN, priorStrength: -5 }
  );
  assert.equal(bayesian528.prior_mean, 4.2, 'Invalid priorMean must fall back to 4.2');
  assert.equal(bayesian528.prior_strength, 3, 'Non-positive priorStrength must fall back to 3');
  assert.equal(
    bayesian528.effective_weight_sum,
    2,
    'Out-of-range rating_star items must be ignored'
  );
  assert.equal(bayesian528.raw_weighted_average, 5);

  const weight528 = computeReviewWeight({
    upvotes: Number.NaN,
    downvotes: -3,
    reportCount: -10,
    flagCategory: 'authentic',
    verdict: 'authentic',
  });
  assert.equal(weight528, 1.0, 'Negative reportCount must not inflate review weight');

  const summary528 = analyzer.computeJReviewsSummary(
    [
      {
        id: 'rev-528-1',
        rating_star: 5,
        comment: 'Máy dùng rất mượt, pin trâu dùng cả ngày.',
        reviewer_type: 'user',
      },
      {
        id: 'rev-528-nan',
        rating_star: Number.NaN,
        comment: 'Lỗi điểm sao',
        reviewer_type: 'user',
      },
    ],
    [
      {
        review_id: 'rev-528-1',
        fake_probability: 0.05,
        verdict: 'authentic',
        flag_category: 'authentic',
        reason: 'ok',
        include_in_rating: true,
        helpfulness_weight: 1.0,
        signals: {
          burst_pattern_score: 0,
          duplicate_text_ratio: 0,
          account_age_bucket: 'high',
          reviewer_history_score: 0,
          language_marker_score: 0,
        },
      },
      {
        review_id: 'rev-528-nan',
        fake_probability: 0.05,
        verdict: 'authentic',
        flag_category: 'authentic',
        reason: 'ok',
        include_in_rating: true,
        helpfulness_weight: 1.0,
        signals: {
          burst_pattern_score: 0,
          duplicate_text_ratio: 0,
          account_age_bucket: 'high',
          reviewer_history_score: 0,
          language_marker_score: 0,
        },
      },
    ],
    Number.NaN
  );
  assert.equal(summary528.user_rating_weighted, 5);
  assert.equal(summary528.expert_rating, null, 'NaN expertRatingInput must be ignored');
  assert.equal(summary528.overall_rating, 5);

  const riskCorrupted528 = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    listingPrice: 20_000_000,
    canonicalMinPrice: 5_000_000_000,
    reviewResults: [],
  });
  assert.equal(
    riskCorrupted528.price_anomaly_detected,
    false,
    'canonicalMinPrice > MAX_VALID_VND_PRICE must not trigger false-positive price_anomaly_detected'
  );

  const upsertedFlagChunks528: number[] = [];
  const stubSupabase528 = {
    from(table: string) {
      if (table === 'review_flags') {
        return {
          select() {
            return {
              in() {
                return {
                  async in() {
                    return { data: [], error: null };
                  },
                };
              },
            };
          },
          async upsert(rows: unknown[]) {
            upsertedFlagChunks528.push(rows.length);
            return { error: null };
          },
        };
      }
      if (table === 'reviews') {
        return {
          update() {
            return {
              async eq() {
                return { error: null };
              },
            };
          },
        };
      }
      if (table === 'review_analysis') {
        return {
          async upsert() {
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as Parameters<typeof analyzer.persistAnalysisToSupabase>[0];

  const batchReviews528 = Array.from({ length: 205 }, (_, idx) => ({
    id: `rev-chunk-528-${idx}`,
    rating_star: 5,
    comment: `Đánh giá thực tế chi tiết số ${idx} sau khi sử dụng máy 2 tuần, màn hình sáng đẹp.`,
  }));
  await analyzer.persistAnalysisToSupabase(stubSupabase528, {
    productId: 'prod-528',
    reviews: batchReviews528,
  });
  assert.deepEqual(
    upsertedFlagChunks528,
    [200, 5],
    'persistAnalysisToSupabase must chunk review_flags upserts into batches of 200'
  );

  // 16j. skipReviewAnalysis / pricesOnly skips Step 6 review re-analysis on price-only ingests (Rate-Services#158)
  let reviewsQueriedOnPricesOnly = false;
  const pricesOnlyStub = {
    from: (table: string) => {
      if (table === 'categories') {
        return {
          select: async () => ({
            data: [{ id: 'cat-smartphones', slug: 'smartphones' }],
            error: null,
          }),
        };
      }
      if (table === 'merchants') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'merch-158' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'master_products') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'master-158',
                  specifications: { display: { panel_type: 'OLED' } },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'products') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'prod-158' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'reviews') {
        reviewsQueriedOnPricesOnly = true;
        throw new Error(
          'reviews table must not be queried when skipReviewAnalysis/pricesOnly is set'
        );
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async (fn: string) => {
      if (fn === 'record_price_observation') {
        return { data: 'unchanged_delta', error: null };
      }
      return { data: null, error: null };
    },
  } as unknown as NonNullable<
    ConstructorParameters<typeof ShopeeIngestionPipeline>[0]
  >['supabaseClient'];

  const pipeline158 = new ShopeeIngestionPipeline({ supabaseClient: pricesOnlyStub });
  await pipeline158.ingestProduct(
    {
      platform: 'shopee',
      itemId: 'item-158',
      shopId: 'shop-158',
      url: 'https://shopee.vn/product/158/158',
      title: 'Điện thoại Apple iPhone 16 Pro Max 256GB',
      priceMin: 28_990_000,
      priceMax: 28_990_000,
      currency: 'VND',
      historicalSold: 100,
      ratingStar: 4.9,
      ratingCount: 50,
      images: ['https://cf.shopee.vn/file/ip16pm.jpg'],
      models: [],
      attributes: [],
      shop: { shopId: 'shop-158', name: 'Apple Flagship Store', isMall: true },
      reviews: [],
      pricesOnly: true,
    },
    undefined,
    { masterIdHint: 'master-158' }
  );
  assert.equal(
    reviewsQueriedOnPricesOnly,
    false,
    'ingestProduct must skip Step 6 review re-analysis when pricesOnly/skipReviewAnalysis is set'
  );

  // 16k. DOS/Rate#834: AiReviewAnalyzer config bounds, computeJReviewsSummary sanitization, and castReviewVote validation
  const analyzer834 = new AiReviewAnalyzer({
    provider: 'openai',
    baseUrl: 'javascript:alert(1)',
    timeoutMs: -500,
  });
  const analyzer834Internal = analyzer834 as unknown as { baseUrl: string; timeoutMs: number };
  assert.equal(
    analyzer834Internal.baseUrl,
    'https://api.openai.com/v1',
    'AiReviewAnalyzer must fall back to provider default baseUrl when baseUrl is non-HTTP(S)'
  );
  assert.equal(
    analyzer834Internal.timeoutMs,
    25000,
    'AiReviewAnalyzer must fall back to 25000ms when timeoutMs is negative or non-finite'
  );

  const summary834 = analyzer834.computeJReviewsSummary(
    [{ id: 'r-834', rating_star: 5, comment: 'Máy rất tốt' }],
    analyzer834.analyzeWithHeuristics([{ id: 'r-834', rating_star: 5, comment: 'Máy rất tốt' }]),
    null,
    ['<b>Pin trâu</b>', 'Pin trâu', '   '],
    ['<script>Nóng máy</script>'],
    '  <p>Tổng kết đánh giá</p>  '
  );
  assert.deepEqual(
    summary834.pros,
    ['Pin trâu'],
    'computeJReviewsSummary must strip HTML tags and deduplicate pros'
  );
  assert.deepEqual(summary834.cons, ['Nóng máy']);
  assert.equal(summary834.ai_summary, `${LLM_REVIEW_SUMMARY_PREFIX}Tổng kết đánh giá`);

  await assert.rejects(
    () =>
      analyzer834.castReviewVote(pricesOnlyStub!, {
        reviewId: '   ',
        voterId: 'voter-1',
        vote: 'up',
      }),
    /reviewId and voterId must be non-empty strings/,
    'castReviewVote must reject blank reviewId or voterId'
  );

  // 16l. DOS/Rate#836: ProductNormalizer integer RAM/storage bounds, TB formatting, and asset/color sanitization
  const normalizer836 = new ProductNormalizer();
  const baseRaw836 = {
    platform: 'shopee' as const,
    itemId: 'item-836',
    shopId: 'shop-836',
    url: 'https://shopee.vn/product/836/836',
    priceMin: 12_990_000,
    priceMax: 12_990_000,
    currency: 'VND',
    historicalSold: 10,
    ratingStar: 4.8,
    ratingCount: 5,
    attributes: [],
    shop: { shopId: 'shop-836', name: 'Shop 836', isMall: false },
    reviews: [],
  };
  const fractionalRom836 = normalizer836.normalize({
    ...baseRaw836,
    title: 'Điện thoại Samsung Galaxy S24 FE 8.5GB RAM ROM 12.5GB',
    images: [
      'https://cf.shopee.vn/file/valid.jpg',
      'javascript:alert(1)',
      'ftp://files.example.com/img.jpg',
      '   ',
    ],
    models: [
      { modelId: 'm-1', name: '  Xanh   Mint\u0007  ', price: 12_990_000, stock: 5 },
      { modelId: 'm-2', name: 'Xanh Mint', price: 12_990_000, stock: 3 },
      { modelId: 'm-3', name: 'Đ'.repeat(120), price: 12_990_000, stock: 2 },
    ],
    description: '  Máy chính hãng\u0000 bảo hành 12 tháng  ',
  });
  assert.equal(
    fractionalRom836.storage_gb,
    null,
    'ProductNormalizer must reject non-integer GB storage values like 12.5GB'
  );
  assert.equal(
    fractionalRom836.ram_gb,
    null,
    'ProductNormalizer must reject non-integer GB RAM values like 8.5GB'
  );
  assert.deepEqual(
    fractionalRom836.images,
    ['https://cf.shopee.vn/file/valid.jpg'],
    'ProductNormalizer must keep only valid http/https asset URLs in images'
  );
  assert.equal(
    fractionalRom836.colors[0],
    'Xanh Mint',
    'ProductNormalizer must strip control chars, collapse whitespace, and deduplicate colors'
  );
  assert.equal(
    fractionalRom836.colors.length,
    2,
    'ProductNormalizer must deduplicate collapsed color names'
  );
  assert.equal(
    fractionalRom836.colors[1]?.length,
    80,
    'ProductNormalizer must cap color name length at 80 characters'
  );
  assert.equal(
    fractionalRom836.description,
    'Máy chính hãng  bảo hành 12 tháng',
    'ProductNormalizer must strip control characters and trim description'
  );

  const nonMultipleTb836 = normalizer836.normalize({
    ...baseRaw836,
    title: 'Laptop Asus Vivobook 15 16GB RAM ROM 1280GB',
    images: [],
    models: [],
  });
  assert.equal(nonMultipleTb836.storage_gb, 1280);
  assert.equal(
    nonMultipleTb836.variant_name,
    '1280GB',
    'ProductNormalizer must format non-512-multiple storage >= 1024 as GB rather than fractional TB'
  );
  assert.equal(nonMultipleTb836.key_specs.storage, '1280GB');

  const binaryTb836 = normalizer836.normalize({
    ...baseRaw836,
    title: 'Laptop Asus Vivobook 15 16GB RAM 1.5TB SSD',
    images: [],
    models: [],
  });
  assert.equal(binaryTb836.storage_gb, 1536);
  assert.equal(
    binaryTb836.variant_name,
    '1.5TB',
    'ProductNormalizer must preserve 1.5TB (1536GB) as 1.5TB'
  );

  // DOS/Rate#882: computeVoterWeight NaN guards, computeTextShingleSimilarity k bounds, and control-char stripping in review heuristics
  assert.equal(
    computeVoterWeight({
      accountAgeDays: Number.NaN,
      verifiedReviewCount: Number.NaN,
      trustScore: 0.9,
      isVerifiedContact: true,
    }),
    0.1,
    'computeVoterWeight must cap unproven/NaN verifiedReviewCount voters at 0.1'
  );
  assert.equal(
    computeVoterWeight({
      accountAgeDays: -5,
      verifiedReviewCount: 0,
      trustScore: 0.9,
      isVerifiedContact: true,
    }),
    0.1,
    'computeVoterWeight must treat negative accountAgeDays as unknown and cap 0-review voters at 0.1'
  );
  assert.equal(
    computeTextShingleSimilarity(
      'Máy dùng rất mượt pin trâu màn hình đẹp tuyệt vời',
      'Máy dùng rất mượt pin trâu màn hình sáng rõ nét',
      0
    ),
    computeTextShingleSimilarity(
      'Máy dùng rất mượt pin trâu màn hình đẹp tuyệt vời',
      'Máy dùng rất mượt pin trâu màn hình sáng rõ nét',
      3
    ),
    'computeTextShingleSimilarity must fall back to k=3 when k <= 0'
  );
  assert.equal(
    isRatingOnlyComment('Cực\u0000 kì hài lòng!'),
    true,
    'isRatingOnlyComment must strip control characters before matching platform rating labels'
  );
  assert.equal(
    isShippingOnlyComment('Giao\u0000 hàng nhanh đóng gói cẩn thận'),
    true,
    'isShippingOnlyComment must strip control characters before checking shipping/product regexes'
  );
  assert.equal(
    hasStarSentimentContradiction(5, 'Hàng\u0000 giả lừa đảo không dùng được'),
    true,
    'hasStarSentimentContradiction must strip control characters before matching contradiction regex'
  );
  const ctrlHeuristicRes = analyzer.analyzeWithHeuristics([
    {
      id: 'rev-882-coin',
      author_name: 'u1',
      rating_star: 5,
      comment: 'Đánh giá mang\u0000 tính chất minh họa để nhận\u0000 xu thôi ạ',
    },
    {
      id: 'rev-882-nulls',
      author_name: 'u2',
      rating_star: 5,
      comment: 'ok\u0000\u0000\u0000\u0000\u0000\u0000',
    },
  ]);
  assert.equal(
    ctrlHeuristicRes[0]?.flag_category,
    'low_value_coin_spam',
    'analyzeWithHeuristics must strip control characters so coin-farming spam cannot evade detection'
  );
  assert.equal(
    ctrlHeuristicRes[1]?.flag_category,
    'low_value_coin_spam',
    'analyzeWithHeuristics must strip control characters before checking minimum comment length'
  );

  // DOS/Rate#908: compute6AxisWeightBreakdown, computeBayesianProductRating, computeReviewWeight, computeWilsonLowerBound, computeTextShingleSimilarity, assessReview6Axes, analyzeWithHeuristics, computeJReviewsSummary & evaluateMerchantRisk bounds
  const unknownAxisBreakdown = compute6AxisWeightBreakdown({
    authenticity: 'unknown_axis' as unknown as import('./ai-review-analyzer.js').Authenticity,
    independence: 'organic',
    depth: 'detailed',
    gateOverrideReason: '  policy\u0000_override\r\n ',
  });
  assert.equal(unknownAxisBreakdown.gate, 0);
  assert.equal(unknownAxisBreakdown.weight, 0);
  assert.equal(unknownAxisBreakdown.gateReason, 'policy _override');

  const bayesianMalformed = computeBayesianProductRating(null as unknown as []);
  assert.equal(bayesianMalformed.score, 4.2);
  assert.equal(bayesianMalformed.confidence, 0);

  assert.equal(
    computeReviewWeight({
      flagCategory:
        'unknown_cat' as unknown as import('./ai-review-analyzer.js').ReviewFlagCategory,
      verdict: 'authentic',
    }),
    0,
    'computeReviewWeight must return 0 for unrecognized flagCategory'
  );
  assert.equal(
    computeReviewWeight({
      flagCategory: 'authentic',
      verdict: 'unknown_verdict' as unknown as import('./ai-review-analyzer.js').ReviewVerdict,
    }),
    0,
    'computeReviewWeight must return 0 for unrecognized verdict'
  );
  assert.equal(
    computeWilsonLowerBound(10, 2, Number.NaN),
    computeWilsonLowerBound(10, 2, 1.96),
    'computeWilsonLowerBound must fall back to z=1.96 when z is NaN'
  );
  assert.equal(
    computeTextShingleSimilarity(null as unknown as string, 'test a b c'),
    0,
    'computeTextShingleSimilarity must return 0 on non-string input'
  );
  const emptyMediaAssess = assessReview6Axes({
    id: 'rev-908',
    rating_star: 5,
    comment: 'Máy dùng rất mượt, pin trâu cả ngày, màn hình sáng đẹp rõ nét',
    images: ['   ', '' as string],
  });
  const noMediaAssess = assessReview6Axes({
    id: 'rev-908',
    rating_star: 5,
    comment: 'Máy dùng rất mượt, pin trâu cả ngày, màn hình sáng đẹp rõ nét',
    images: [],
  });
  assert.equal(
    emptyMediaAssess.breakdown.depth,
    noMediaAssess.breakdown.depth,
    'assessReview6Axes must ignore whitespace-only image strings when computing hasRealMedia'
  );
  assert.deepEqual(analyzer.analyzeWithHeuristics(null as unknown as []), []);
  const emptySummary908 = analyzer.computeJReviewsSummary(
    null as unknown as [],
    null as unknown as []
  );
  assert.equal(emptySummary908.total_reviews_analyzed, 0);
  const emptyMerchantRisk908 = analyzer.evaluateMerchantRisk(
    null as unknown as import('./ai-review-analyzer.js').MerchantRiskInput
  );
  assert.equal(emptyMerchantRisk908.total_reviews, 0);

  // DOS/Rate#954: computeVoterWeight null/array guard, numeric review_id shingle lookup, evaluateMerchantRisk finite followerCount & price rounding, and EntityMatcher array guard
  assert.equal(
    computeVoterWeight(null as unknown as Parameters<typeof computeVoterWeight>[0]),
    0.1,
    'computeVoterWeight must not throw when params is null'
  );
  assert.equal(
    computeVoterWeight([] as unknown as Parameters<typeof computeVoterWeight>[0]),
    0.1,
    'computeVoterWeight must not throw when params is an array'
  );
  const numericIdShingleRes = analyzer.analyzeWithHeuristics([
    {
      id: 1001 as unknown as string,
      author_name: 'user_a',
      rating_star: 5,
      comment: 'Điện thoại dùng rất mượt pin trâu màn hình sáng đẹp cực kỳ',
    },
    {
      id: 1002 as unknown as string,
      author_name: 'user_b',
      rating_star: 5,
      comment: 'Điện thoại dùng rất mượt pin trâu màn hình sáng đẹp tuyệt vời',
    },
  ]);
  assert.equal(numericIdShingleRes[0]?.review_id, '1001');
  assert.equal(
    numericIdShingleRes[0]?.flag_category,
    'seeding_fake',
    'analyzeWithHeuristics must detect shingle similarity when runtime review.id is a number'
  );
  const infFollowersRisk = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    followerCount: Number.POSITIVE_INFINITY,
    listingPrice: 10_000_000.4,
    canonicalMinPrice: 25_000_000.6,
    reviewResults: [],
  });
  const zeroFollowersRisk = analyzer.evaluateMerchantRisk({
    platform: 'shopee',
    isOfficial: false,
    followerCount: 0,
    listingPrice: 10_000_000.4,
    canonicalMinPrice: 25_000_000.6,
    reviewResults: [],
  });
  assert.equal(
    infFollowersRisk.risk_score,
    zeroFollowersRisk.risk_score,
    'evaluateMerchantRisk must not grant follower trust bonus when followerCount is Infinity'
  );
  assert.equal(infFollowersRisk.price_anomaly_detected, true);
  await assert.rejects(
    async () => {
      const { EntityMatcher } = await import('./entity-matcher.js');
      const matcher = new EntityMatcher({} as never);
      await matcher.resolveOrCreateMasterProduct([] as never);
    },
    /candidate must be a non-null object/,
    'EntityMatcher.resolveOrCreateMasterProduct must reject array candidates'
  );

  // DOS/Rate#961: ArenaSpecSyncer URL port/hostname guards, control-char countPopulatedFieldGroups, auditCatalogAgainstArenaRegistry row guard, and shopee-to-supabase array guards
  const { ArenaSpecSyncer } = await import('./arena-spec-syncer.js');
  const { platformReviewIdFor: platformReviewIdFor961 } = await import('./shopee-to-supabase.js');

  const arenaParsed961 = parseGsmArenaHtmlToSpecs(
    '<h1 data-spec="modelname">Apple iPhone 18 Pro</h1>',
    {
      gsmarenaUrl: 'https://www.gsmarena.com:8443/apple_iphone_18_pro-14209.php',
      phonearenaUrl: 'https://www.phonearena.com./phones/Apple-iPhone-18-Pro_id12539',
    }
  );
  assert.equal(
    arenaParsed961.gsmarenaUrl,
    undefined,
    'normalizeArenaUrl must reject non-standard ports'
  );
  assert.equal(
    arenaParsed961.phonearenaUrl,
    undefined,
    'normalizeArenaUrl must reject trailing-dot hostnames'
  );
  assert.equal(
    countPopulatedFieldGroups({
      display: { type: ' ' },
    }),
    0,
    'countPopulatedFieldGroups must treat control-character-only strings as unpopulated'
  );
  const syncer961 = new ArenaSpecSyncer();
  const auditReport961 = await syncer961.auditCatalogAgainstArenaRegistry({
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number) => ({
            data:
              from === 0
                ? ([
                    null,
                    ['array-row'],
                    {
                      id: 'm-961',
                      name: 'Xiaomi 18 Pro Max 512GB',
                      slug: 'xiaomi-18-pro-max-512gb',
                      model_key: 'xiaomi:18-pro-max:512gb',
                      specifications: {},
                    },
                  ] as never)
                : [],
            error: null,
          }),
        }),
      }),
    }),
  });
  assert.equal(auditReport961.incompleteSpecMasters.length, 1);
  assert.equal(auditReport961.incompleteSpecMasters[0]?.id, 'm-961');

  assert.match(
    platformReviewIdFor961([] as never),
    /^rv-[0-9a-f]{64}$/,
    'platformReviewIdFor must safely hash fallback when passed an array'
  );
  const normalizedPrices961 = normalizeScrapedProductPrices({
    itemId: '123456',
    title: 'iPhone 16 Pro Max 256GB',
    priceMin: 28_990_000,
    priceMax: 28_990_000,
    currency: 'VND',
    historicalSold: 10,
    ratingStar: 4.9,
    ratingCount: 5,
    images: [],
    models: [['invalid-array-model'] as never, { name: '256GB', price: 28_990_000 }],
    attributes: [],
    shop: [] as never,
    reviews: [
      ['invalid-array-review'] as never,
      {
        author: 'u1',
        ratingStar: 5,
        comment: 'good',
        images: [],
        reviewer: [] as never,
      },
    ],
    url: 'https://shopee.vn/product-i.1.123456',
  } as never);
  assert.equal(normalizedPrices961.models.length, 1);
  assert.equal(normalizedPrices961.reviews.length, 1);
  assert.equal(normalizedPrices961.reviews[0]?.reviewer, undefined);

  // DOS/Rate#964: ProductNormalizer port guard, resolveBackfillSupabaseTarget dot hostname guard, resolveClusterPeerFloorPrice & merchant-review-risk array guards
  const { ProductNormalizer: ProductNormalizer964 } = await import('./product-normalizer.js');
  const { resolveBackfillSupabaseTarget } = await import('./paging.js');
  const { mapStoredReview, strongestPriceAnomaly } = await import('./merchant-review-risk.js');

  const normalizer964 = new ProductNormalizer964();
  const normProd964 = normalizer964.normalize({
    itemId: '964',
    shopId: '1',
    title: 'iPhone 16 Pro Max 256GB',
    priceMin: 28_990_000,
    priceMax: 28_990_000,
    currency: 'VND',
    historicalSold: 1,
    ratingStar: 5,
    ratingCount: 1,
    images: ['https://cdn.example.com:8443/img.jpg', 'https://cdn.example.com/valid.jpg'],
    models: [],
    attributes: [],
    shop: { shopId: '1', name: 'Shop', isMall: true },
    reviews: [],
    url: 'https://shopee.vn/product-i.1.964',
  });
  assert.deepEqual(
    normProd964.images,
    ['https://cdn.example.com/valid.jpg'],
    'ProductNormalizer must reject image URLs with non-standard ports'
  );
  assert.throws(
    () => resolveBackfillSupabaseTarget('https://example.supabase.co./'),
    /invalid hostname/,
    'resolveBackfillSupabaseTarget must reject trailing-dot hostnames'
  );
  const peerFloor964 = resolveClusterPeerFloorPrice(
    [
      ['invalid-array-peer'] as never,
      {
        id: 'peer-1',
        price_current: 25_000_000,
        merchants: [null as never, { is_official: true }],
      },
    ],
    'self-id'
  );
  assert.equal(peerFloor964, 25_000_000);
  assert.equal(mapStoredReview([] as never), null, 'mapStoredReview must reject array inputs');
  assert.equal(
    strongestPriceAnomaly([] as never, [], new Map(), new Map(), new Map()),
    null,
    'strongestPriceAnomaly must reject array merchant input'
  );
  assert.equal(normalizedPrices961.shop.url, undefined);

  // #968: Backfill job option/row guards & ImporterStructuredLogger meta bounds
  const { createImporterLogger, ImporterStructuredLogger } = await import('./logger.js');
  const logger968 = createImporterLogger('TestComponent', ['bad-override'] as never);
  const entry968 = logger968.formatEntry('info', 'test.event', 'hello', ['array-meta'] as never);
  assert.equal(entry968.component, 'TestComponent');
  assert.equal(entry968.meta, undefined, 'formatEntry must ignore array meta payloads');
  const nullLogger968 = new ImporterStructuredLogger(null as never).child(['bad-child'] as never);
  assert.equal(nullLogger968.formatEntry('info', 'e', 'm').component, 'Importer');

  const { runReviewRiskBackfill } = await import('./jobs/backfill-review-risk.js');
  const fakeBackfillClient = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
  const backfillRes968 = await runReviewRiskBackfill(fakeBackfillClient as never, {
    apply: 'false' as unknown as boolean,
  });
  assert.equal(
    backfillRes968.apply,
    false,
    'runReviewRiskBackfill must require strict boolean apply === true'
  );

  console.log(
    `✅ [P2/P3 Trust Model & #292/#352/#356/#359/#379/#382/#401/#497/#514/#522/#528/#557/#834/#836/#882/#908/#954] Voter weight, Wilson lower bound (50/52=${wilson50of52} > 1/1=${wilson1of1}), shingle copy seeding (sim=${shingleSim}), affiliate shortlinks, peer floor, ArenaSpecSyncer, Importer & ReviewAnalyzer hardening (#352, #356, #359, #379, #382, #401, #497, #514, #522, #528, #557, #834, #836, #882, #908, #954) verified`
  );

  // -------------------------------------------------------------------------
  // Issue #998: EntityMatcher, MerchantRiskBreakdown & platformReviewIdFor Bounds
  // -------------------------------------------------------------------------
  console.log(
    '\nTesting EntityMatcher, MerchantRiskBreakdown & platformReviewIdFor Bounds (#998)...'
  );
  {
    const { sanitizeHttpUrl, EntityMatcher } = await import('./entity-matcher.js');
    const { platformReviewIdFor } = await import('./shopee-to-supabase.js');
    const { merchantRiskBreakdown } = await import('./ai-review-analyzer.js');

    assert.equal(sanitizeHttpUrl('https://.shopee.vn/img.jpg'), null);
    assert.equal(sanitizeHttpUrl('https://shopee..vn/img.jpg'), null);
    assert.equal(sanitizeHttpUrl('https://shopee.vn./img.jpg'), null);
    assert.equal(sanitizeHttpUrl('https://cf.shopee.vn/file/abc'), 'https://cf.shopee.vn/file/abc');

    const riskFromArr = merchantRiskBreakdown(['bad-array'] as never);
    assert.equal(riskFromArr.risk_level, 'low');
    assert.equal(riskFromArr.price_anomaly_detected, false);

    const riskFalseStr = merchantRiskBreakdown({
      risk_score: 20,
      trust_score: '91.5' as never,
      risk_level: 'low',
      seeding_ratio: '0.15' as never,
      coin_spam_ratio: false as never,
      sabotage_ratio: '' as never,
      total_reviews: '42' as never,
      authentic_count: '36' as never,
      coin_spam_count: 2,
      seeding_fake_count: 4,
      sabotage_or_bombing_count: 0,
      suspicious_ratio_pct: '14.28' as never,
      price_anomaly_detected: 'false' as never,
      reasons: ['Valid reason'],
    });
    assert.equal(riskFalseStr.price_anomaly_detected, false);
    assert.equal(riskFalseStr.trust_score, 91.5);
    assert.equal(riskFalseStr.total_reviews, 42);
    assert.equal(riskFalseStr.authentic_count, 36);
    assert.equal(riskFalseStr.suspicious_ratio_pct, 14.28);
    assert.equal(riskFalseStr.coin_spam_ratio, 0);
    assert.equal(riskFalseStr.sabotage_ratio, 0);

    const rvSentinelZero = platformReviewIdFor({
      reviewId: '0',
      author: 'alice',
      ratingStar: 5,
      comment: 'First review',
      images: [],
    });
    const rvSentinelNull = platformReviewIdFor({
      reviewId: 'null',
      author: 'bob',
      ratingStar: 4,
      comment: 'Second review',
      images: [],
    });
    assert.ok(rvSentinelZero.startsWith('rv-'));
    assert.ok(rvSentinelNull.startsWith('rv-'));
    assert.notEqual(rvSentinelZero, rvSentinelNull);

    let insertedMasterPayload: Record<string, unknown> | null = null;
    const mockMatcherDb = {
      from(table: string) {
        assert.equal(table, 'master_products');
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
          upsert(row: Record<string, unknown>) {
            insertedMasterPayload = row;
            return {
              select() {
                return Promise.resolve({ data: [{ id: 'mp-created-998' }], error: null });
              },
            };
          },
        };
      },
      async rpc() {
        return {
          data: [
            null,
            ['array-entry'],
            { master_id: '0', similarity: 0.95, name: 'Sentinel Zero' },
            { master_id: 'null', similarity: 0.92, name: 'Sentinel Null' },
          ],
          error: null,
        };
      },
    };
    const matcher = new EntityMatcher(
      mockMatcherDb as never,
      {
        async enrichCandidate(c: unknown) {
          return c;
        },
      } as never
    );
    const resolved = await matcher.resolveOrCreateMasterProduct({
      model_key: 'apple-iphone-16-128gb',
      name: 'Apple iPhone 16 128GB',
      slug: 'apple-iphone-16-128gb',
      brand: 'Apple',
      model: 'iPhone 16',
      storage_gb: 128,
      ram_gb: 8,
      has_5g: 'false' as never,
      is_benchmark_enriched: true,
    } as never);
    assert.equal(resolved.masterId, 'mp-created-998');
    assert.equal(resolved.isNew, true);
    assert.equal(insertedMasterPayload?.['has_5g'], false);
    console.log(
      '\u2705 [EntityMatcher, MerchantRiskBreakdown & platformReviewIdFor Bounds (#998)] Verified!'
    );
  }

  console.log('\n🎉 ALL AI REVIEW ANALYZER TESTS PASSED!');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
