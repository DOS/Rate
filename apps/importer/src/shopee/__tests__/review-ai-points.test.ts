import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { comparablePoint, storedPoint } from '@repo/shared-data/rules';
import {
  batchCostUsd,
  checkReviewPoints,
  evidenceMatch,
  reserveUsd,
  reviewAiInstructions,
  reviewAiOutputSchema,
  reviewLanguage,
  reviewTextHash,
  REVIEW_AI_PROMPT_VERSION,
  textQualifies,
} from '../review-ai-prompt.js';
import {
  aiCandidates,
  buildRequests,
  BatchGoneError,
  collectBatch,
  dosAiReviewAiClient,
  fromDosAiOutputLine,
  qualityStop,
  runReviewAiPointsJob,
  type AiMarkerRow,
  type AiReviewRow,
  type AiStoreRow,
  type BatchRequest,
  type BatchResult,
  type ReviewAiClient,
} from '../jobs/review-ai-points.js';
import type { RateSupabaseClient } from '../types.js';

const PHONES = 'c0000000-0000-4000-8000-000000000001';
const SERVICES = 'c0000000-0000-4000-8000-000000000002';
const M1 = 'a0000000-0000-4000-8000-000000000001';
const M2 = 'a0000000-0000-4000-8000-000000000002';
const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const LONG =
  'Pin xài cả ngày vẫn còn 30%, ra nắng hơi khó nhìn. Camera chụp đêm ổn, shop giao nhanh.';
const review = (n: number, extra: Partial<AiReviewRow> = {}): AiReviewRow => ({
  id: id(n),
  product_id: 'l1',
  origin: 'crawl',
  reviewer_type: 'user',
  helpfulness_weight: 1,
  comment: LONG,
  review_flags: { include_in_rating: true, verdict: 'authentic', flag_category: null },
  ...extra,
});
const categories = [
  { id: PHONES, slug: 'smartphones' },
  { id: SERVICES, slug: 'services' },
];
const masters = [
  { id: M1, category_id: PHONES },
  { id: M2, category_id: SERVICES },
];
const listings = [
  { id: 'l1', cluster_id: M1, origin: 'crawl' },
  { id: 'l2', cluster_id: M2, origin: 'crawl' },
  { id: 'lseed', cluster_id: M1, origin: 'seed' },
];

function testPrompt() {
  // The hash is the database's: sha256 of the NFC text, decomposed or not.
  assert.equal(reviewTextHash(LONG.normalize('NFD')), reviewTextHash(LONG));
  assert.equal(
    reviewTextHash(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.equal(
    reviewTextHash(LONG),
    createHash('sha256').update(LONG.normalize('NFC'), 'utf8').digest('hex')
  );

  // D3: length, words and language.
  assert.equal(textQualifies(LONG), true);
  assert.equal(textQualifies('Hàng đẹp, giao nhanh'), false, 'too short');
  assert.equal(
    textQualifies('😍😍😍😍😍😍😍😍😍😍😍😍😍😍😍😍😍😍😍😍 tốt tốt tốt'),
    false,
    'emoji do not count'
  );
  assert.equal(
    textQualifies('đẹppppppppppppppppppppppppppppppppppppppppppp lắm'),
    false,
    'repeats do not count'
  );
  assert.equal(
    textQualifies('pin xai ca ngay van con, may chay muot khong lag, man hinh dep'),
    true,
    'Vietnamese without diacritics'
  );
  assert.equal(
    textQualifies('good phone for the price, the battery works all day but the screen is dim'),
    true
  );
  assert.equal(reviewLanguage('这个手机很好用电池也很耐用屏幕很漂亮'), null);
  assert.equal(reviewLanguage('Pin trâu'), 'vi');

  // The schema limits keys to the category's list; services are not open.
  const schema = JSON.stringify(reviewAiOutputSchema('smartphones'));
  assert.ok(schema.includes('"battery"') && !schema.includes('"keyboard"'));
  assert.ok(reviewAiInstructions('laptops').includes('keyboard: Bàn phím và touchpad'));

  // Evidence: in its own review, exact or only without diacritics; two words at least.
  assert.equal(evidenceMatch(LONG, 'Pin XÀI cả  ngày'), 'exact');
  assert.equal(evidenceMatch('pin xai ca ngay van con', 'pin xài cả ngày'), 'unaccented');
  assert.equal(evidenceMatch('Đẹp lắm, dùng ổn', 'dep lam'), 'unaccented');
  assert.equal(evidenceMatch(LONG, 'pin trâu lắm'), null);
  assert.equal(evidenceMatch(LONG, 'pin'), null, 'one word');
  // Words as the writer counts them: punctuation is not a word, and is not a mismatch.
  assert.equal(evidenceMatch('Máy đẹp :) dùng ổn', 'đẹp :)'), null);
  assert.equal(evidenceMatch(LONG, 'ra nắng, hơi khó nhìn!'), 'exact');

  const checked = checkReviewPoints(LONG, 'smartphones', [
    {
      kind: 'pro',
      criterion_key: 'battery',
      body: 'Pin dùng hết ngày',
      evidence: 'pin xài cả ngày vẫn còn',
    },
    {
      kind: 'pro',
      criterion_key: 'battery',
      body: 'Pin  dùng hết ngày',
      evidence: 'pin xài cả ngày',
    },
    {
      kind: 'con',
      criterion_key: 'display',
      body: 'Màn khó nhìn ngoài nắng',
      evidence: 'ra nắng hơi khó nhìn',
    },
    {
      kind: 'con',
      criterion_key: 'keyboard',
      body: 'Bàn phím cứng',
      evidence: 'ra nắng hơi khó nhìn',
    },
    { kind: 'con', criterion_key: null, body: 'Không có gì để chê', evidence: 'ra nắng hơi' },
    {
      kind: 'pro',
      criterion_key: 'camera',
      body: 'Chụp đêm rất đẹp',
      evidence: 'chụp đêm cực đẹp',
    },
    { kind: 'pro', criterion_key: 'camera', body: 'Tốt', evidence: 'chụp đêm ổn' },
    { kind: 'neutral', criterion_key: null, body: 'Giao nhanh', evidence: 'giao nhanh' },
    { kind: 'pro', criterion_key: 'camera', body: 'Chụp đêm ổn', evidence: 'Camera chụp đêm ổn' },
    { kind: 'pro', criterion_key: null, body: 'Dùng ổn định', evidence: 'chụp đêm ổn' },
    { kind: 'pro', criterion_key: null, body: 'Máy đẹp sang', evidence: 'Camera chụp' },
  ]);
  assert.deepEqual(
    checked.points.map(p => `${p.kind}:${p.criterion_key}:${p.body}`),
    [
      'pro:battery:Pin dùng hết ngày',
      'con:display:Màn khó nhìn ngoài nắng',
      'pro:camera:Chụp đêm ổn',
      'pro:null:Dùng ổn định',
    ]
  );
  assert.deepEqual(checked.rejected, {
    shape: 1,
    evidence: 1,
    length: 1,
    criterion: 1,
    evasive: 1,
    duplicate: 1,
    too_many: 1,
  });

  // Prices: dos.ai list prices at the Batch API's half, cached tokens at the full input
  // price (an upper bound).
  assert.equal(
    batchCostUsd('dos', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    }).toFixed(4),
    ((0.25 + 1.5 + 0.25 + 0.25) * 0.5).toFixed(4)
  );
  assert.equal(
    batchCostUsd('qwen3.8-max', { output_tokens: 1_000_000 }),
    4 * batchCostUsd('dos', { output_tokens: 1_000_000 })
  );
  const ceiling = reserveUsd('dos', [
    { instructions: 'x'.repeat(3000), message: 'y'.repeat(8000) },
  ]);
  assert.ok(ceiling > 0.004 && ceiling < 0.007, `one request's ceiling ${ceiling}`);
  console.log('  ✅ hash, qualifying text, schema, evidence, line checks and prices verified');
}

function testCandidates() {
  const reviews = [
    review(1),
    review(2, { origin: 'community' }),
    review(3, { reviewer_type: 'expert' }),
    review(4, { review_flags: null }),
    review(5, {
      review_flags: { include_in_rating: false, verdict: 'suspicious', flag_category: null },
    }),
    review(6, { helpfulness_weight: 0 }),
    review(7, { comment: 'Hàng đẹp, giao nhanh' }),
    review(8, { product_id: 'l2' }),
    review(9, { product_id: 'lseed' }),
    review(10),
    review(11),
    review(12),
    review(13),
    review(14),
    review(15),
    review(16, { comment: LONG.normalize('NFD') }),
  ];
  const hash = reviewTextHash(LONG);
  const marker = (n: number, extra: Partial<AiMarkerRow> = {}): AiMarkerRow => ({
    review_id: id(n),
    text_hash: hash,
    prompt_version: REVIEW_AI_PROMPT_VERSION,
    criteria_version: 1,
    category_slug: 'smartphones',
    outcome: 'stored',
    attempts: 1,
    batch_id: null,
    ...extra,
  });
  const due = aiCandidates({
    reviews,
    writerReviewIds: new Set([id(10)]),
    markers: [
      marker(11),
      marker(12, { outcome: 'failed', attempts: 2 }),
      marker(13, { outcome: 'failed', attempts: 3 }),
      marker(14, { prompt_version: 'v0' }),
      marker(15, { category_slug: 'tablets' }),
      marker(16, { outcome: 'empty' }),
    ],
    listings,
    masters,
    categories,
    pending: new Set([id(1)]),
  });
  assert.deepEqual(
    due.map(c => c.id),
    [12, 14, 15].map(id),
    'failed with retries left, a new prompt version, a moved master'
  );
  assert.equal(due[0]!.text, LONG);

  const many = Array.from({ length: 45 }, (_, i) => ({
    id: id(100 + i),
    text: LONG,
    textHash: hash,
    category: i < 41 ? 'smartphones' : 'laptops',
  }));
  const built = buildRequests(many, 'dos');
  assert.deepEqual(
    built.manifest.map(r => `${r.custom_id}:${r.reviews.length}`),
    ['laptops-0:4', 'smartphones-1:20', 'smartphones-2:20', 'smartphones-3:1']
  );
  // One line of an OpenAI-format batch file, as dos.ai's Batch API takes it.
  const request = built.requests[1]!;
  assert.deepEqual([request.method, request.url], ['POST', '/v1/chat/completions']);
  assert.equal(request.body.model, 'dos');
  assert.equal(request.body.stream, false);
  assert.equal(request.body.messages[0].role, 'system');
  assert.equal(request.body.messages[0].content, reviewAiInstructions('smartphones'));
  assert.deepEqual(
    [request.body.response_format.type, request.body.response_format.json_schema.strict],
    ['json_schema', true]
  );
  const sent = JSON.parse(request.body.messages[1].content.split('\n').slice(1).join('\n')) as {
    ref: number;
    text: string;
  }[];
  assert.deepEqual(
    sent.map(r => r.ref),
    Array.from({ length: 20 }, (_, i) => i + 1)
  );
  assert.ok(!JSON.stringify(request).includes(id(100)), 'no review id is sent');
  console.log('  ✅ the gate, the process-once rule and the requests verified');
}

const answer = (
  reviews: unknown,
  stop = 'end_turn',
  usage = { input_tokens: 4000, output_tokens: 900 }
) => ({
  result: {
    type: 'succeeded' as const,
    message: {
      stop_reason: stop,
      content: [{ type: 'text', text: JSON.stringify({ reviews }) }],
      usage,
    },
  },
});
const GOOD_POINTS = [
  {
    kind: 'pro',
    criterion_key: 'battery',
    body: 'Pin dùng hết ngày',
    evidence: 'pin xài cả ngày vẫn còn',
  },
  {
    kind: 'con',
    criterion_key: 'display',
    body: 'Màn khó nhìn ngoài nắng',
    evidence: 'ra nắng hơi khó nhìn',
  },
];

function testCollect() {
  const manifest = [
    {
      custom_id: 'smartphones-0',
      category: 'smartphones',
      criteria_version: 1,
      reviews: [1, 2, 3].map(n => ({ ref: n, id: id(n), text_hash: 'h' + n })),
    },
    {
      custom_id: 'smartphones-1',
      category: 'smartphones',
      criteria_version: 1,
      reviews: [{ ref: 1, id: id(4), text_hash: 'h4' }],
    },
    {
      custom_id: 'smartphones-2',
      category: 'smartphones',
      criteria_version: 1,
      reviews: [{ ref: 1, id: id(5), text_hash: 'h5' }],
    },
    {
      custom_id: 'smartphones-3',
      category: 'smartphones',
      criteria_version: 1,
      reviews: [{ ref: 1, id: id(6), text_hash: 'h6' }],
    },
    {
      custom_id: 'smartphones-4',
      category: 'smartphones',
      criteria_version: 1,
      reviews: [{ ref: 1, id: id(7), text_hash: 'h7' }],
    },
  ];
  const results: BatchResult[] = [
    // Review 3 left out by the model: failed, never empty.
    {
      custom_id: 'smartphones-0',
      ...answer([
        { ref: 1, points: GOOD_POINTS },
        { ref: 2, points: [] },
      ]),
    },
    { custom_id: 'smartphones-1', ...answer([{ ref: 1, points: [] }], 'max_tokens') },
    { custom_id: 'smartphones-2', ...answer([{ ref: 1, points: [] }], 'refusal') },
    { custom_id: 'smartphones-3', ...answer([{ ref: 1, points: 'none' }]) },
    // smartphones-4 has no result at all.
  ];
  const texts = new Map([1, 2, 3, 4, 5, 6, 7].map(n => [id(n), LONG]));
  const collected = collectBatch(
    { id: 'batch_test0001', model: 'dos', prompt_version: 'v1', manifest },
    results,
    texts
  );
  const rows = new Map(collected.rows.map(r => [r.id, r]));
  assert.equal(rows.get(id(1))!.points.length, 2);
  assert.equal(rows.get(id(1))!.failed, false);
  assert.deepEqual(
    [rows.get(id(2))!.failed, rows.get(id(2))!.points.length],
    [false, 0],
    'an empty answer'
  );
  for (const n of [3, 4, 5, 6, 7])
    assert.equal(rows.get(id(n))!.failed, true, `review ${n} failed`);
  assert.equal(collected.failedReviews, 5);
  assert.equal(rows.get(id(1))!.batch_id, 'batch_test0001');
  assert.equal(collected.usage.input_tokens, 16000, 'cut-off and refused requests are paid for');
  assert.equal(
    collected.costUsd,
    batchCostUsd('dos', { input_tokens: 16000, output_tokens: 3600 })
  );
  const errored = collectBatch(
    {
      id: 'batch_test0002',
      model: 'dos',
      prompt_version: 'v1',
      manifest: manifest.slice(1, 2),
    },
    [{ custom_id: 'smartphones-1', result: { type: 'errored' } }],
    texts
  );
  assert.deepEqual(
    [errored.failedReviews, errored.costUsd],
    [1, 0],
    'an errored request is failed and free'
  );

  // Quality stops.
  const lines = (evidence: number, total: number) => ({
    ...collected,
    lines: total,
    rejects: { ...collected.rejects, evidence },
  });
  assert.equal(qualityStop(lines(2, 20), null), null);
  assert.match(qualityStop(lines(3, 20), null) ?? '', /3 of 20 lines failed the evidence check/);
  assert.equal(qualityStop(lines(3, 19), null), null, 'too few lines to judge');
  const share = (withLines: number, answered: number) => ({
    ...collected,
    reviewsWithLines: withLines,
    reviewsAnswered: answered,
  });
  assert.match(
    qualityStop(share(10, 100), { share: 0.6, reviews: 80 }) ?? '',
    /moved from 0.60 to 0.10/
  );
  assert.equal(qualityStop(share(50, 100), { share: 0.6, reviews: 80 }), null);
  assert.equal(qualityStop(share(10, 100), { share: 0.6, reviews: 20 }), null);
  console.log('  ✅ results read, failures kept apart, cost and quality stops verified');
}

async function testJob() {
  const reviews = [1, 2, 3].map(n => review(n));
  const seed = () => ({
    reviews: reviews.map(r => ({ ...r })),
    review_points: [] as Row[],
    review_ai_extractions: [] as Row[],
    review_ai_batches: [] as Row[],
    products: listings,
    master_products: masters,
    categories,
  });
  const now = new Date('2026-11-20T00:00:00Z');

  // Dry run: plans, never calls the model, writes nothing.
  const dry = fakeSupabase(seed());
  const ai = fakeAi(requests =>
    requests.map(r => ({
      custom_id: r.custom_id,
      ...answer(refsOf(r).map(ref => ({ ref, points: GOOD_POINTS }))),
    }))
  );
  const planned = await runReviewAiPointsJob(dry.client, { enabled: true, ai: ai.client, now });
  assert.equal(planned.candidates, 3);
  assert.equal(planned.requests, 1);
  assert.equal(ai.calls.length, 0, 'a dry run calls no model');
  assert.equal(dry.writes.length, 0);
  const noKey = await runReviewAiPointsJob(dry.client, { enabled: true, now });
  assert.equal(noKey.candidates, 3, 'a dry run needs no key');

  // Disabled: no model call, even with --apply.
  const off = await runReviewAiPointsJob(dry.client, {
    apply: true,
    enabled: false,
    ai: ai.client,
    now,
  });
  assert.equal(off.candidates, 0);
  assert.equal(ai.calls.length, 0);

  // Apply: one batch, recorded before its results are read, then stored.
  const db = fakeSupabase(seed());
  ai.onCreate = () =>
    assert.equal(db.tables.review_ai_batches!.length, 0, 'created before the row');
  ai.onResults = () =>
    assert.equal(
      db.tables.review_ai_batches![0]!.status,
      'submitted',
      'the row exists before the results are read'
    );
  const applied = await runReviewAiPointsJob(db.client, {
    apply: true,
    enabled: true,
    ai: ai.client,
    now,
    wait: async () => {},
  });
  ai.onCreate = null;
  ai.onResults = null;
  assert.equal(applied.sent, 3);
  assert.deepEqual(ai.calls, ['create', 'status', 'results']);
  assert.equal(applied.stored.stored, 3);
  const batch = db.tables.review_ai_batches![0]!;
  assert.equal(batch.status, 'stored');
  assert.equal(
    Number(batch.cost_usd),
    Number(batchCostUsd('dos', { input_tokens: 4000, output_tokens: 900 }).toFixed(4))
  );
  assert.equal(db.stores.flat().length, 3);
  assert.ok(
    db.stores
      .flat()
      .every(r => r.batch_id === batch.id && r.prompt_version === REVIEW_AI_PROMPT_VERSION)
  );

  // The next run: nothing is due.
  ai.calls.length = 0;
  const again = await runReviewAiPointsJob(db.client, {
    apply: true,
    enabled: true,
    ai: ai.client,
    now,
  });
  assert.equal(again.candidates, 0);
  assert.equal(ai.calls.length, 0);

  // A crash after the batch was created: the next run collects it without sending again.
  const crashed = fakeSupabase(seed());
  crashed.tables.review_ai_batches!.push({
    id: 'batch_crashed01',
    model: 'dos',
    prompt_version: REVIEW_AI_PROMPT_VERSION,
    status: 'submitted',
    manifest: [
      {
        custom_id: 'smartphones-0',
        category: 'smartphones',
        criteria_version: 1,
        reviews: reviews.map((r, i) => ({ ref: i + 1, id: r.id, text_hash: reviewTextHash(LONG) })),
      },
    ],
    reserved_usd: 0.01,
    cost_usd: null,
    submitted_at: now.toISOString(),
    stored_at: null,
  });
  ai.calls.length = 0;
  ai.batches.set('batch_crashed01', [
    { custom_id: 'smartphones-0', ...answer([1, 2, 3].map(ref => ({ ref, points: GOOD_POINTS }))) },
  ]);
  // A dry run while it is open does not count its reviews as due.
  const dryOpen = await runReviewAiPointsJob(crashed.client, { enabled: true, now });
  assert.equal(dryOpen.candidates, 0);
  // The crash came after review 1 was stored from this batch: it is not stored twice.
  crashed.tables.review_ai_extractions!.push({
    review_id: id(1),
    text_hash: reviewTextHash(LONG),
    prompt_version: REVIEW_AI_PROMPT_VERSION,
    criteria_version: 1,
    category_slug: 'smartphones',
    outcome: 'stored',
    attempts: 1,
    batch_id: 'batch_crashed01',
  });
  const resumed = await runReviewAiPointsJob(crashed.client, {
    apply: true,
    enabled: true,
    ai: ai.client,
    now,
  });
  assert.deepEqual(resumed.collected, ['batch_crashed01']);
  assert.equal(resumed.sent, 0, 'nothing sent twice');
  assert.ok(!ai.calls.includes('create'));
  assert.deepEqual(
    crashed.stores.flat().map(r => r.id),
    [id(2), id(3)],
    'rows already stored from this batch are skipped'
  );

  // A batch still running is left for the next run, and its reviews are not sent again.
  const running = fakeSupabase(seed());
  running.tables.review_ai_batches!.push({
    ...crashed.tables.review_ai_batches![0]!,
    id: 'batch_running01',
    status: 'submitted',
    cost_usd: null,
  });
  ai.calls.length = 0;
  ai.status = 'in_progress';
  const waited = await runReviewAiPointsJob(running.client, {
    apply: true,
    enabled: true,
    ai: ai.client,
    now,
    waitMs: 0,
    wait: async () => {},
  });
  assert.deepEqual(waited.waiting, ['batch_running01']);
  assert.equal(waited.candidates, 0);
  assert.ok(!ai.calls.includes('create'));
  // ...and the kill switch cancels it.
  const stopped = await runReviewAiPointsJob(running.client, {
    apply: true,
    enabled: false,
    ai: ai.client,
    now,
  });
  assert.deepEqual(stopped.canceled, ['batch_running01']);
  assert.ok(ai.calls.includes('cancel'));
  assert.equal(
    running.tables.review_ai_batches![0]!.status,
    'submitted',
    'the row stays open: what finished before the cancel is paid for and collected later'
  );
  // Switched on again: the canceled batch ends; its finished request is stored, the
  // canceled one comes back as failed rows, and nothing is sent twice.
  ai.status = 'ended';
  ai.batches.set('batch_running01', [{ custom_id: 'smartphones-0', result: { type: 'canceled' } }]);
  ai.calls.length = 0;
  const back = await runReviewAiPointsJob(running.client, {
    apply: true,
    enabled: true,
    ai: ai.client,
    now,
  });
  assert.equal(back.collected[0], 'batch_running01', 'the old batch first, then the new one');
  assert.equal(back.stored.failed, 3);
  // The fake writer has no attempts; the failed reviews are due again, in a new batch.
  assert.equal(back.sent, 3);

  // The monthly cap: this month's spend plus the ceiling over $5 sends nothing.
  const capped = fakeSupabase(seed());
  capped.tables.review_ai_batches!.push({
    id: 'batch_spent0001',
    model: 'dos',
    prompt_version: 'v0',
    status: 'stored',
    manifest: [],
    reserved_usd: 9,
    cost_usd: 4.999,
    submitted_at: '2026-11-02T00:00:00Z',
    stored_at: '2026-11-02T01:00:00Z',
  });
  capped.tables.review_ai_batches!.push({
    id: 'batch_lastmonth',
    model: 'dos',
    prompt_version: 'v0',
    status: 'stored',
    manifest: [],
    reserved_usd: 9,
    cost_usd: 50,
    submitted_at: '2026-10-31T23:00:00Z',
    stored_at: '2026-11-01T01:00:00Z',
  });
  ai.calls.length = 0;
  const over = await runReviewAiPointsJob(capped.client, {
    apply: true,
    enabled: true,
    ai: ai.client,
    now,
  });
  assert.equal(over.capped, true);
  assert.equal(over.monthSpendUsd, 4.999, 'last month does not count');
  assert.equal(ai.calls.length, 0);
  const qwenMax = await runReviewAiPointsJob(capped.client, {
    enabled: true,
    model: 'qwen3.8-max',
    now,
  });
  assert.equal(qwenMax.capped, false, 'each model has its own cap');

  // A quality stop: most quotes made up; nothing stored, the batch left ended.
  const bad = fakeSupabase(seed());
  bad.tables.reviews = Array.from({ length: 10 }, (_, i) => ({ ...review(200 + i) }) as Row);
  const madeUp = Array.from({ length: 3 }, (_, i) => ({
    kind: 'pro',
    criterion_key: null,
    body: `Ý bịa số ${i + 1}`,
    evidence: `không có trong review ${i}`,
  }));
  const liar = fakeAi(requests =>
    requests.map(r => ({
      custom_id: r.custom_id,
      ...answer(refsOf(r).map(ref => ({ ref, points: madeUp }))),
    }))
  );
  await assert.rejects(
    runReviewAiPointsJob(bad.client, { apply: true, enabled: true, ai: liar.client, now }),
    /not stored: 30 of 30 lines failed the evidence check/
  );
  assert.equal(bad.stores.length, 0);
  assert.equal(bad.tables.review_ai_batches![0]!.status, 'ended');

  // The batch row cannot be written: the batch is canceled at once, not left running unrecorded.
  const lost = fakeSupabase(seed());
  lost.state.failInsert = true;
  ai.calls.length = 0;
  await assert.rejects(
    runReviewAiPointsJob(lost.client, { apply: true, enabled: true, ai: ai.client, now }),
    /insert refused\. The batch was canceled\./
  );
  assert.deepEqual(ai.calls, ['create', 'cancel']);
  await assert.rejects(
    runReviewAiPointsJob(dry.client, { enabled: true, now, waitMs: Number.NaN }),
    /--wait-minutes/
  );

  // A batch the gateway failed as a whole: the row is closed, nothing is stored, and the
  // reviews are due again with no attempt spent.
  const goneDb = fakeSupabase(seed());
  goneDb.tables.review_ai_batches!.push({
    ...crashed.tables.review_ai_batches![0]!,
    id: 'batch_failed01',
    status: 'submitted',
    cost_usd: null,
    stored_at: null,
  });
  const goneAi: ReviewAiClient = {
    ...ai.client,
    async createBatch() {
      throw new Error('not in this test');
    },
    // eslint-disable-next-line require-yield
    async *results() {
      throw new BatchGoneError('dos.ai batch ended failed with no output', 'canceled');
    },
  };
  const afterGone = await runReviewAiPointsJob(goneDb.client, {
    enabled: true,
    ai: goneAi,
    now,
    apply: true,
    maxReviews: 1,
  }).catch((err: unknown) => err);
  assert.match(String(afterGone), /not in this test/, 'its reviews were due again and sent');
  assert.equal(goneDb.tables.review_ai_batches![0]!.status, 'canceled');
  assert.equal(goneDb.stores.length, 0);

  // The purge: a dry run says so; --apply calls the writer; a bad version is refused.
  const purge = fakeSupabase(seed());
  const purgeDry = await runReviewAiPointsJob(purge.client, { purge: 'v1' });
  assert.equal(purgeDry.purged, null);
  assert.equal(purge.rpcs.length, 0);
  const purged = await runReviewAiPointsJob(purge.client, { apply: true, purge: 'all' });
  assert.deepEqual(purged.purged, { lines: 0, markers: 0 });
  assert.deepEqual(purge.rpcs, [['purge_review_ai_points', { p_prompt_version: 'all' }]]);
  await assert.rejects(
    runReviewAiPointsJob(purge.client, { apply: true, purge: 'V 1' }),
    /'all' or a prompt version/
  );
  await assert.rejects(runReviewAiPointsJob(dry.client, { maxReviews: 0 }), /--max/);
  console.log(
    '  ✅ dry run, kill switch, apply, resume, waiting, cap, quality stop and purge verified'
  );
}

async function testDosAiClient() {
  // Output lines: a normal answer, a cut-off one, a filtered one, an error, a 400.
  const ok = (finish: string) => ({
    status_code: 200,
    body: {
      choices: [{ message: { content: '{"reviews":[]}' }, finish_reason: finish }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 50,
        prompt_tokens_details: { cached_tokens: 600 },
      },
    },
  });
  const read = (line: object) => fromDosAiOutputLine(line);
  const stopped = read({ custom_id: 'a', response: ok('stop') });
  assert.equal(stopped?.result.type, 'succeeded');
  if (stopped?.result.type === 'succeeded') {
    assert.equal(stopped.result.message.stop_reason, 'end_turn');
    assert.deepEqual(stopped.result.message.usage, {
      input_tokens: 400,
      output_tokens: 50,
      cache_read_input_tokens: 600,
      cache_creation_input_tokens: 0,
    });
  }
  const reason = (line: object) => {
    const r = read(line);
    return r?.result.type === 'succeeded' ? r.result.message.stop_reason : r?.result.type;
  };
  assert.equal(reason({ custom_id: 'b', response: ok('length') }), 'max_tokens');
  assert.equal(reason({ custom_id: 'c', response: ok('content_filter') }), 'refusal');
  assert.equal(
    reason({ custom_id: 'd', error: { code: 'model_sunset', message: 'x' } }),
    'errored'
  );
  assert.equal(reason({ custom_id: 'e', response: { status_code: 400, body: {} } }), 'errored');
  assert.equal(read({ response: ok('stop') }), null, 'a line with no custom_id is skipped');

  // The client against a fake gateway: upload, create, status, results, cancel, auth, retry, 402.
  const calls: string[] = [];
  let busy = 1;
  const gateway = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('https://beta-api.dos.ai/v1', '');
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      'Bearer dos_sk_test',
      'the key as a Bearer token'
    );
    const reply = (status: number, body: unknown) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    if (path === '/files' && method === 'POST') {
      const form = init!.body as FormData;
      assert.equal(form.get('purpose'), 'batch');
      const lines = (await (form.get('file') as Blob).text()).trim().split('\n');
      assert.equal(JSON.parse(lines[0]!).url, '/v1/chat/completions');
      return reply(200, { id: 'file_in' });
    }
    if (path === '/batches' && method === 'POST') {
      const body = JSON.parse(String(init!.body)) as Record<string, string>;
      assert.deepEqual(body, {
        input_file_id: 'file_in',
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
      });
      return reply(200, { id: 'batch_abc123' });
    }
    if (path === '/batches/batch_abc123') {
      if (busy-- > 0) return reply(503, 'busy');
      return reply(200, { status: 'completed', output_file_id: 'file_out' });
    }
    if (path === '/files/file_out/content') {
      return reply(
        200,
        [
          JSON.stringify({ custom_id: 'smartphones-0', response: ok('stop') }),
          'not json',
          JSON.stringify({ custom_id: 'smartphones-1', error: { message: 'x' } }),
        ].join('\n')
      );
    }
    if (path === '/batches/batch_abc123/cancel') return reply(200, { status: 'cancelling' });
    if (path === '/batches/batch_broke') return reply(402, { error: 'insufficient credits' });
    if (path === '/batches/batch_failed') {
      return reply(200, { status: 'failed', output_file_id: null, errmsg: 'zdr org' });
    }
    if (path === '/batches/batch_purged') {
      return reply(200, { status: 'completed', output_file_id: 'file_gone' });
    }
    return reply(404, 'no route');
  }) as typeof fetch;
  const noWait = async () => {};
  const client = dosAiReviewAiClient('dos_sk_test', 'https://beta-api.dos.ai/v1/', gateway, noWait);
  const built = buildRequests(
    [{ id: id(1), text: LONG, textHash: reviewTextHash(LONG), category: 'smartphones' }],
    'dos'
  );
  assert.deepEqual(await client.createBatch(built.requests), { id: 'batch_abc123' });
  assert.equal(await client.batchStatus('batch_abc123'), 'ended', 'a 503 is retried');
  const out: BatchResult[] = [];
  for await (const r of client.results('batch_abc123')) out.push(r);
  assert.deepEqual(
    out.map(r => `${r.custom_id}:${r.result.type}`),
    ['smartphones-0:succeeded', 'smartphones-1:errored']
  );
  await client.cancelBatch('batch_abc123');
  await assert.rejects(client.batchStatus('batch_broke'), /no credits left/);
  await assert.rejects(client.batchStatus('batch_missing'), /404/);
  assert.deepEqual(calls.slice(0, 3), [
    'POST /files',
    'POST /batches',
    'GET /batches/batch_abc123',
  ]);
  // A batch failed as a whole, or one whose output file is gone: no results, ever.
  const drain = async (batchId: string) => {
    for await (const r of client.results(batchId)) void r;
  };
  await assert.rejects(drain('batch_failed'), (err: unknown) => {
    assert.ok(err instanceof BatchGoneError);
    assert.equal(err.status, 'canceled');
    assert.match(err.message, /ended failed with no output: zdr org/);
    return true;
  });
  await assert.rejects(drain('batch_purged'), (err: unknown) => {
    assert.ok(err instanceof BatchGoneError);
    assert.equal(err.status, 'expired');
    return true;
  });
  // A line the gateway did not run for want of credits is unbilled, not failed.
  assert.equal(reason({ custom_id: 'f', response: { status_code: 402, body: {} } }), 'unbilled');
  assert.equal(
    reason({ custom_id: 'g', error: { code: 'insufficient_credits', message: 'x' } }),
    'unbilled'
  );

  // POST /batches is never retried on an answer that may hide a created batch.
  for (const lost of ['network', '502'] as const) {
    let creates = 0;
    const flaky = (async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace('https://api.dos.me/v1', '');
      if (path === '/files') return new Response(JSON.stringify({ id: 'file_in' }));
      creates += 1;
      if (init?.method === 'POST' && lost === 'network') throw new Error('socket hang up');
      return new Response('bad gateway', { status: 502 });
    }) as typeof fetch;
    const once = dosAiReviewAiClient('dos_sk_test', undefined, flaky, noWait);
    await assert.rejects(
      once.createBatch(built.requests),
      lost === 'network' ? /A batch may have been created/ : /502/
    );
    assert.equal(creates, 1, `POST /batches sent once (${lost})`);
  }
  // ...but a 429, refused before anything exists, is retried.
  let throttled = 0;
  const busyGateway = (async (url: string | URL | Request) => {
    const path = String(url).replace('https://api.dos.me/v1', '');
    if (path === '/files') return new Response(JSON.stringify({ id: 'file_in' }));
    throttled += 1;
    return throttled === 1
      ? new Response('slow down', { status: 429 })
      : new Response(JSON.stringify({ id: 'batch_after_429' }));
  }) as typeof fetch;
  assert.deepEqual(
    await dosAiReviewAiClient('dos_sk_test', undefined, busyGateway, noWait).createBatch(
      built.requests
    ),
    { id: 'batch_after_429' }
  );
  // The request body: deterministic and bounded.
  assert.deepEqual(
    [built.requests[0]!.body.temperature, built.requests[0]!.body.max_tokens],
    [0, 6000]
  );
  console.log(
    '  ✅ dos.ai batch client: upload, create once, status, results, gone batches, cancel, retry and 402'
  );
}

function refsOf(request: BatchRequest): number[] {
  const content = request.body.messages[1].content;
  return (JSON.parse(content.slice(content.indexOf('\n') + 1)) as { ref: number }[]).map(
    r => r.ref
  );
}

function fakeAi(answerFor: (requests: BatchRequest[]) => BatchResult[]) {
  const state = {
    calls: [] as string[],
    batches: new Map<string, BatchResult[]>(),
    status: 'ended' as 'in_progress' | 'ended',
    onCreate: null as (() => void) | null,
    onResults: null as (() => void) | null,
  };
  let n = 0;
  const client: ReviewAiClient = {
    async createBatch(requests) {
      state.calls.push('create');
      state.onCreate?.();
      const batchId = `batch_fake${String((n += 1)).padStart(4, '0')}`;
      state.batches.set(batchId, answerFor(requests));
      return { id: batchId };
    },
    async batchStatus() {
      state.calls.push('status');
      return state.status;
    },
    async *results(batchId) {
      state.calls.push('results');
      state.onResults?.();
      for (const entry of state.batches.get(batchId) ?? []) yield entry;
    },
    async cancelBatch() {
      state.calls.push('cancel');
    },
  };
  return Object.assign(state, { client });
}

type Row = Record<string, unknown>;

/** The query builder calls the job makes, the batch writes, and the two RPCs. */
function fakeSupabase(seed: Record<string, readonly object[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, rows.map(r => ({ ...(r as Row) }))])
  );
  const stores: AiStoreRow[][] = [];
  const writes: string[] = [];
  const rpcs: [string, unknown][] = [];
  const state = { failInsert: false };
  const query = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter(r => r[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter(r => values.includes(r[column]));
        return builder;
      },
      gt: (column: string, value: string) => {
        rows = rows.filter(r => String(r[column]) > value);
        return builder;
      },
      order: (key: string) => {
        rows.sort((a, b) => (String(a[key]) < String(b[key]) ? -1 : 1));
        return builder;
      },
      limit: (n: number) =>
        Promise.resolve({
          data: rows.slice(0, Math.min(n, 1000)).map(r => ({ ...r })),
          error: null,
        }),
      insert: (row: Row) => {
        writes.push(`insert ${table}`);
        if (state.failInsert) return Promise.resolve({ error: { message: 'insert refused' } });
        tables[table]!.push(JSON.parse(JSON.stringify(row)) as Row);
        return Promise.resolve({ error: null });
      },
      // RLS: rate_worker updates a batch only while it is not stored (no error, no row).
      update: (patch: Row) => ({
        eq: (column: string, value: unknown) => {
          writes.push(`update ${table}`);
          for (const r of tables[table]!)
            if (r[column] === value && !(table === 'review_ai_batches' && r.status === 'stored'))
              Object.assign(r, patch);
          return Promise.resolve({ error: null });
        },
      }),
    };
    return builder;
  };
  const client = {
    from: (table: string) => query(table),
    rpc: (name: string, args: { p_rows?: AiStoreRow[]; p_prompt_version?: string }) => {
      rpcs.push([name, args]);
      if (name === 'purge_review_ai_points')
        return Promise.resolve({ data: { lines: 0, markers: 0 }, error: null });
      assert.equal(name, 'store_review_ai_points');
      const rows = args.p_rows!;
      // The writer's own checks (rate.store_review_ai_points): a boolean failed flag, and per
      // line 5 to 150 characters and two words of evidence in the compared form. One bad row
      // refuses the call.
      const bad = rows.findIndex(
        row =>
          typeof row.failed !== 'boolean' ||
          row.points.some(p => {
            const body = [...storedPoint(p.body)].length;
            return (
              body < 5 || body > 150 || !comparablePoint(storedPoint(p.evidence)).includes(' ')
            );
          })
      );
      if (bad >= 0)
        return Promise.resolve({
          data: null,
          error: { code: '22023', message: `row ${bad} refused` },
        });
      stores.push(rows);
      const counts: Record<string, number> = { stored: 0, empty: 0, rejected: 0, failed: 0 };
      for (const row of rows) {
        const outcome = row.failed
          ? 'failed'
          : row.points.length > 0
            ? 'stored'
            : row.rejected > 0
              ? 'rejected'
              : 'empty';
        counts[outcome] = (counts[outcome] ?? 0) + 1;
        const markers = tables.review_ai_extractions!;
        const old = markers.findIndex(m => m.review_id === row.id);
        if (old >= 0) markers.splice(old, 1);
        markers.push({
          review_id: row.id,
          text_hash: row.text_hash,
          prompt_version: row.prompt_version,
          criteria_version: row.criteria_version,
          category_slug: row.category,
          outcome,
          attempts: 1,
          batch_id: row.batch_id,
        });
      }
      return Promise.resolve({ data: counts, error: null });
    },
  };
  return { client: client as unknown as RateSupabaseClient, tables, stores, writes, rpcs, state };
}

async function run() {
  console.log('Review AI points job');
  testPrompt();
  testCandidates();
  testCollect();
  await testJob();
  await testDosAiClient();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
