/**
 * Verification suite for AiReviewAnalyzer (JReviews-style scoring + 5-category flags)
 * Usage: pnpm --filter @repo/crawlers exec tsx src/shopee/test-review-analyzer.ts
 */
import http from 'node:http';
import assert from 'node:assert/strict';
import {
  AiReviewAnalyzer,
  accountAgeBucket,
  computeReviewWeight,
  isRatingOnlyComment,
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
        const payload = JSON.parse(body);
        const user = JSON.parse(payload.messages[1].content);
        const out = {
          reviews: user.reviews.map((r: any) => ({
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

    const calls: Array<{ table: string; op: string; payload: any; col?: string; val?: string }> =
      [];
    const stub = {
      from: (table: string) => ({
        upsert: async (payload: any) => {
          calls.push({ table, op: 'upsert', payload });
          return { error: null };
        },
        update: (payload: any) => ({
          eq: async (col: string, val: string) => {
            calls.push({ table, op: 'update', payload, col, val });
            return { error: null };
          },
        }),
      }),
    } as any;

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
    assert.equal(flagUpsert.payload.length, input.length);
    for (const row of flagUpsert.payload) {
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
        c => c.table === 'review_analysis' && c.op === 'upsert' && c.payload.product_id === 'prod-1'
      )
    );
    assert.ok(
      calls.some(
        c =>
          c.table === 'master_products' &&
          c.op === 'update' &&
          c.val === 'master-1' &&
          'user_rating_weighted' in c.payload
      )
    );
    const merchUpdate = calls.find(
      c => c.table === 'merchants' && c.op === 'update' && c.val === 'merch-1'
    );
    assert.ok(merchUpdate, 'merchants update called');
    assert.equal(typeof merchUpdate.payload.review_risk_score, 'number');
    assert.equal(typeof merchUpdate.payload.review_risk_breakdown, 'object');
    assert.equal(typeof merchUpdate.payload.review_risk_updated_at, 'string');
    assert.equal(
      'risk_score' in merchUpdate.payload,
      false,
      'must NOT overwrite DOSafe risk_score'
    );
    assert.equal(
      calls.filter(c => c.table === 'reviews' && c.op === 'update').length,
      input.length,
      'helpfulness_weight written per review'
    );
    assert.ok(out.merchantRisk);
    console.log(
      '✅ [Persist] review_flags / review_analysis / master_products / merchants (review_risk_score isolated) / reviews payloads valid'
    );

    console.log('\n================================================================');
    console.log('7. castReviewVote (rate.review_votes per-user vote & report)');
    console.log('================================================================');

    let lastVoteUpsert: any = null;
    const deletedPair: { reviewId?: string; voterId?: string } = {};
    const voteStub = {
      from: (table: string) => {
        assert.equal(table, 'review_votes');
        return {
          upsert: async (payload: any, opts: any) => {
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
    } as any;

    const r1 = await llm.castReviewVote(voteStub, {
      reviewId: 'rev-1',
      voterId: 'user-1',
      vote: 'up',
      reported: false,
    });
    assert.equal(r1.action, 'upserted');
    assert.deepEqual(lastVoteUpsert.payload, {
      review_id: 'rev-1',
      voter_id: 'user-1',
      vote: 'up',
      reported: false,
      report_reason: null,
    });
    assert.equal(lastVoteUpsert.opts.onConflict, 'review_id,voter_id');

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

  console.log('\n🎉 ALL AI REVIEW ANALYZER TESTS PASSED!');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
