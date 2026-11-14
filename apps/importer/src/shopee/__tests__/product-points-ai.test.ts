import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateProductPoints, type PointLine } from '@repo/shared-data/rules';
import {
  buildProductPointsAiMessages,
  formatGroundedProductVerdict,
  mergeAndSelectAiProductPoints,
  resolveGroundedClusterLabel,
} from '../product-points-ai-prompt.js';
import {
  isMasterDueForAiPoints,
  runProductPointsAiJob,
  type StoredProductPointRow,
} from '../jobs/product-points-ai.js';
import type { RateSupabaseClient } from '../types.js';
import type { ReviewAiClient } from '../jobs/review-ai-points.js';

const NOW = new Date('2026-11-14T10:00:00.000Z');

test('resolveGroundedClusterLabel keeps valid grounded Vietnamese rewrite', () => {
  const label = resolveGroundedClusterLabel(
    'Pin dùng bền cả ngày, sạc nhanh 67W ổn định',
    'pin dùng cả ngày sạc nhanh 67W',
    ['pin dùng cả ngày sạc nhanh 67W', 'pin rất bền dùng cả ngày'],
    'pro'
  );
  assert.equal(label, 'Pin dùng bền cả ngày, sạc nhanh 67W ổn định');
});

test('resolveGroundedClusterLabel falls back on ungrounded words, negation flip, invented digits, evasive con, or score claim', () => {
  const rawLabel = 'máy nóng khi chơi game';
  const rawLines = ['máy nóng khi chơi game nặng', 'chơi game máy hơi nóng'];

  // Zero word overlap
  assert.equal(
    resolveGroundedClusterLabel('Giao hàng đóng gói cẩn thận', rawLabel, rawLines, 'con'),
    rawLabel
  );

  // Polarity flip: AI negates `nóng` -> `không_nóng`
  assert.equal(
    resolveGroundedClusterLabel('Máy không nóng khi chơi game', rawLabel, rawLines, 'con'),
    rawLabel
  );

  // Reverse polarity flip: raw has `không_trâu` only, AI writes `trâu`
  assert.equal(
    resolveGroundedClusterLabel(
      'Pin trâu dùng tốt',
      'pin không trâu',
      ['pin không trâu lắm', 'pin ko trâu'],
      'con'
    ),
    'pin không trâu'
  );

  // Invented digits (`45` degree not in raw lines)
  assert.equal(
    resolveGroundedClusterLabel('Máy nóng lên 45 độ khi chơi game', rawLabel, rawLines, 'con'),
    rawLabel
  );

  // Evasive con
  assert.equal(
    resolveGroundedClusterLabel('Chưa thấy điểm chê nào', rawLabel, rawLines, 'con'),
    rawLabel
  );

  // Score claim ("đạt 9/10 điểm")
  assert.equal(
    resolveGroundedClusterLabel(
      'Máy nóng khi chơi game đạt 9/10 điểm',
      rawLabel,
      ['máy nóng 9 lần 10'],
      'con'
    ),
    rawLabel
  );

  // Invented secondary claim beyond shared words
  assert.equal(
    resolveGroundedClusterLabel(
      'Pin dùng cả ngày, camera chống nước tuyệt vời',
      'pin dùng cả ngày',
      ['pin dùng cả ngày'],
      'pro'
    ),
    'pin dùng cả ngày'
  );

  // Antonym swap without explicit negation ("mát" instead of "nóng")
  assert.equal(
    resolveGroundedClusterLabel('Máy mát khi chơi game', rawLabel, rawLines, 'con'),
    rawLabel
  );
});

test('mergeAndSelectAiProductPoints deduplicates same writer across merged clusters and preserves always-one-con', () => {
  const mkLine = (
    id: string,
    writerId: string,
    kind: 'pro' | 'con',
    criterionKey: string,
    body: string,
    weight = 1
  ): PointLine => ({
    id,
    reviewId: writerId,
    writerId,
    kind,
    criterionKey,
    body,
    weight,
    isExpert: false,
    writtenAt: NOW,
    method: 'writer',
  });

  // Two distinct battery pro clusters sharing writer w1 (w1+w2 and w1+w3)
  const lines: PointLine[] = [
    mkLine('l1', 'w1', 'pro', 'battery', 'pin trâu dùng lâu', 1),
    mkLine('l2', 'w2', 'pro', 'battery', 'pin trâu dùng lâu', 1),
    mkLine('l3', 'w1', 'pro', 'battery', 'sạc nhanh tiện lợi', 2),
    mkLine('l4', 'w3', 'pro', 'battery', 'sạc nhanh tiện lợi', 1),
    // 5 more pro clusters across criteria so summary pros hit cap 5
    mkLine('p1a', 'w1', 'pro', 'display', 'màn hình sáng rõ', 1),
    mkLine('p1b', 'w2', 'pro', 'display', 'màn hình sáng rõ', 1),
    mkLine('p2a', 'w1', 'pro', 'camera', 'chụp ảnh sắc nét', 1),
    mkLine('p2b', 'w2', 'pro', 'camera', 'chụp ảnh sắc nét', 1),
    mkLine('p3a', 'w1', 'pro', 'performance', 'chơi game mượt mà', 1),
    mkLine('p3b', 'w2', 'pro', 'performance', 'chơi game mượt mà', 1),
    mkLine('p4a', 'w1', 'pro', 'design', 'thiết kế gọn nhẹ', 1),
    mkLine('p4b', 'w2', 'pro', 'design', 'thiết kế gọn nhẹ', 1),
    mkLine('p5a', 'w1', 'pro', 'sound', 'loa nghe rõ ràng', 1),
    mkLine('p5b', 'w2', 'pro', 'sound', 'loa nghe rõ ràng', 1),
    // 1 passing con cluster
    mkLine('c1', 'w4', 'con', 'thermals', 'máy nóng khi quay video', 1),
    mkLine('c2', 'w5', 'con', 'thermals', 'máy nóng khi quay video', 1),
  ];

  const base = aggregateProductPoints('smartphones', lines, NOW);
  const batteryPros = base.clusters.filter(c => c.criterionKey === 'battery' && c.kind === 'pro');
  const conCluster = base.clusters.find(c => c.kind === 'con')!;
  assert.equal(batteryPros.length, 2);

  // Attempt merging battery pros + illegally grouping the con cluster into the same group
  const merged = mergeAndSelectAiProductPoints(
    base.clusters,
    lines,
    [
      {
        clusterKeys: [batteryPros[0]!.key, batteryPros[1]!.key, conCluster.key],
        sentence: 'Pin trâu dùng lâu, sạc nhanh tiện lợi',
      },
    ],
    NOW
  );

  // w1 counted once with max(1, 2)=2; w2=1, w3=1 => reviewerCount=3, support=4
  const mergedBattery = merged.byCriterion.battery!.pros;
  assert.equal(mergedBattery.length, 1);
  assert.equal(mergedBattery[0]!.reviewerCount, 3);
  assert.equal(mergedBattery[0]!.support, 4);
  assert.equal(mergedBattery[0]!.label, 'Pin trâu dùng lâu, sạc nhanh tiện lợi');

  // Always-one-con preserved despite 6 passing pro clusters, and cross-kind merge prevented
  assert.equal(merged.summary.pros.length, 5);
  assert.equal(merged.summary.cons.length, 1);
  assert.equal(merged.summary.cons[0]!.kind, 'con');

  const verdict = formatGroundedProductVerdict({
    aiVerdict: 'Pin trâu sạc nhanh nhưng máy nóng khi quay video',
    summary: merged.summary,
    reviewCount: base.reviewCount,
    updatedAt: NOW,
  });
  assert.ok(verdict);
  assert.match(verdict, /14\/11\/2026/);
  assert.ok(verdict.endsWith(`Tóm tắt từ ${base.reviewCount} review`));

  // Conflicting numeric claims ("1 ngày" vs "2 ngày") must NOT merge into 4 writers
  const numLines: PointLine[] = [
    mkLine('n1', 'u1', 'pro', 'battery', 'pin dùng được 1 ngày', 1),
    mkLine('n2', 'u2', 'pro', 'battery', 'pin dùng được 1 ngày', 1),
    mkLine('n3', 'u3', 'pro', 'battery', 'pin dùng được 2 ngày', 1),
    mkLine('n4', 'u4', 'pro', 'battery', 'pin dùng được 2 ngày', 1),
  ];
  const numBase = aggregateProductPoints('smartphones', numLines, NOW);
  const numClusters = numBase.clusters.filter(c => c.visible);
  assert.equal(numClusters.length, 2);
  const numMerged = mergeAndSelectAiProductPoints(
    numBase.clusters,
    numLines,
    [
      {
        clusterKeys: [numClusters[0]!.key, numClusters[1]!.key],
        sentence: 'Pin dùng được 2 ngày',
      },
    ],
    NOW
  );
  assert.equal(numMerged.byCriterion.battery!.pros.length, 2);
  assert.equal(numMerged.byCriterion.battery!.pros[0]!.reviewerCount, 2);
  assert.equal(numMerged.byCriterion.battery!.pros[1]!.reviewerCount, 2);
});

test('runProductPointsAiJob dry-run writes nothing, --apply writes ai rows, skips unchanged, and clears stale ai rows', async () => {
  const M_DUE = '11111111-1111-4111-8111-111111111111';
  const M_SKIP = '22222222-2222-4222-8222-222222222222';
  const M_STALE = '33333333-3333-4333-8333-333333333333';

  const productPoints: StoredProductPointRow[] = [
    {
      id: 'code-1',
      master_id: M_DUE,
      criterion_key: 'battery',
      kind: 'pro',
      label: 'pin trâu dùng lâu',
      support: 2,
      reviewer_count: 2,
      has_expert: false,
      first_seen: '2026-11-10T00:00:00Z',
      last_seen: '2026-11-12T00:00:00Z',
      method: 'code',
      updated_at: '2026-11-14T09:00:00Z',
    },
    {
      id: 'ai-old-due',
      master_id: M_DUE,
      criterion_key: 'battery',
      kind: 'pro',
      label: 'Pin cũ',
      support: 2,
      reviewer_count: 2,
      has_expert: false,
      first_seen: '2026-11-10T00:00:00Z',
      last_seen: '2026-11-12T00:00:00Z',
      method: 'ai',
      updated_at: '2026-11-13T09:00:00Z',
    },
    {
      id: 'code-skip',
      master_id: M_SKIP,
      criterion_key: 'battery',
      kind: 'pro',
      label: 'pin ổn',
      support: 2,
      reviewer_count: 2,
      has_expert: false,
      first_seen: '2026-11-10T00:00:00Z',
      last_seen: '2026-11-12T00:00:00Z',
      method: 'code',
      updated_at: '2026-11-12T09:00:00Z',
    },
    {
      id: 'ai-skip',
      master_id: M_SKIP,
      criterion_key: 'battery',
      kind: 'pro',
      label: 'Pin ổn định',
      support: 2,
      reviewer_count: 2,
      has_expert: false,
      first_seen: '2026-11-10T00:00:00Z',
      last_seen: '2026-11-12T00:00:00Z',
      method: 'ai',
      updated_at: '2026-11-13T09:00:00Z',
    },
    {
      id: 'ai-stale',
      master_id: M_STALE,
      criterion_key: 'battery',
      kind: 'pro',
      label: 'Pin từng tốt',
      support: 2,
      reviewer_count: 2,
      has_expert: false,
      first_seen: '2026-11-01T00:00:00Z',
      last_seen: '2026-11-02T00:00:00Z',
      method: 'ai',
      updated_at: '2026-11-03T09:00:00Z',
    },
  ];

  const inserts: unknown[][] = [];
  const deletes: string[][] = [];
  const tables: Record<string, unknown[]> = {
    product_points: productPoints,
    master_products: [{ id: M_DUE, category_id: 'cat-1' }],
    categories: [{ id: 'cat-1', slug: 'smartphones' }],
    products: [{ id: 'prod-1', cluster_id: M_DUE, origin: 'crawl' }],
    reviews: [
      {
        id: 'rev-1',
        product_id: 'prod-1',
        origin: 'crawl',
        reviewer_type: 'buyer',
        helpfulness_weight: 1,
        created_at: '2026-11-11T00:00:00Z',
        platform_created_at: '2026-11-11T00:00:00Z',
        review_flags: { include_in_rating: true, verdict: 'clean' },
      },
      {
        id: 'rev-2',
        product_id: 'prod-1',
        origin: 'crawl',
        reviewer_type: 'buyer',
        helpfulness_weight: 1,
        created_at: '2026-11-12T00:00:00Z',
        platform_created_at: '2026-11-12T00:00:00Z',
        review_flags: { include_in_rating: true, verdict: 'clean' },
      },
    ],
    review_points: [
      {
        id: 'rp-1',
        review_id: 'rev-1',
        criterion_key: 'battery',
        kind: 'pro',
        body: 'pin trâu dùng lâu',
        method: 'writer',
      },
      {
        id: 'rp-2',
        review_id: 'rev-2',
        criterion_key: 'battery',
        kind: 'pro',
        body: 'pin trâu dùng lâu',
        method: 'writer',
      },
    ],
  };

  const fakeSupabase = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])] as Record<string, unknown>[];
      const builder = {
        select: () => builder,
        in: (col: string, vals: readonly unknown[]) => {
          rows = rows.filter(r => vals.includes(r[col]));
          return builder;
        },
        gt: (col: string, val: string) => {
          rows = rows.filter(r => String(r[col] ?? '') > val);
          return builder;
        },
        order: (col: string) => {
          rows = [...rows].sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')));
          return builder;
        },
        limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
        range: (from: number, to: number) =>
          Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        insert: (payload: unknown[]) => {
          inserts.push(payload);
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          in: (_col: string, vals: string[]) => {
            deletes.push(vals);
            return Promise.resolve({ error: null });
          },
        }),
      };
      return builder;
    },
  } as unknown as RateSupabaseClient;

  assert.equal(isMasterDueForAiPoints([productPoints[2]!], [productPoints[3]!], false), false);
  assert.equal(isMasterDueForAiPoints([productPoints[2]!], [productPoints[3]!], true), true);

  // 1) Dry run writes nothing and needs no AI client
  const dry = await runProductPointsAiJob(fakeSupabase, { apply: false, now: NOW });
  assert.equal(dry.dueMasters, 1);
  assert.equal(dry.skippedUnchanged, 1);
  assert.equal(dry.staleClearedMasters, 1);
  assert.equal(dry.inserted, 0);
  assert.equal(dry.deleted, 0);
  assert.equal(inserts.length, 0);
  assert.equal(deletes.length, 0);

  // 2) Apply writes `method = 'ai'`, deletes old AI + stale AI rows, leaves `code` untouched
  const fakeAi: ReviewAiClient = {
    async createBatch() {
      return { id: 'batch-1' };
    },
    async batchStatus() {
      return 'ended';
    },
    async *results() {
      yield {
        custom_id: M_DUE,
        result: {
          type: 'succeeded',
          message: {
            stop_reason: 'end_turn',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  groups: [
                    { cluster_keys: ['battery:pro:rp-1'], sentence: 'Pin trâu dùng bền lâu' },
                  ],
                  verdict: 'Pin trâu dùng bền lâu',
                }),
              },
            ],
            usage: {},
          },
        },
      };
    },
    async cancelBatch() {},
  };

  const applied = await runProductPointsAiJob(fakeSupabase, {
    apply: true,
    now: NOW,
    aiClient: fakeAi,
  });
  assert.equal(applied.inserted, 1);
  assert.equal(applied.deleted, 2); // ai-stale + ai-old-due
  assert.deepEqual(deletes.flat().sort(), ['ai-old-due', 'ai-stale']);
  const written = inserts[0]![0] as { method: string; label: string };
  assert.equal(written.method, 'ai');
  assert.equal(written.label, 'Pin trâu dùng bền lâu');
  assert.match(applied.verdicts[M_DUE]!, /Tóm tắt từ 2 review$/);

  // 3) Errored/truncated AI batch item leaves existing AI rows intact so master stays due
  inserts.length = 0;
  deletes.length = 0;
  const erroredAi: ReviewAiClient = {
    async createBatch() {
      return { id: 'batch-err' };
    },
    async batchStatus() {
      return 'ended';
    },
    async *results() {
      yield { custom_id: M_DUE, result: { type: 'errored' } };
    },
    async cancelBatch() {},
  };
  const deferred = await runProductPointsAiJob(fakeSupabase, {
    apply: true,
    now: NOW,
    aiClient: erroredAi,
  });
  assert.equal(deferred.inserted, 0);
  assert.deepEqual(deletes.flat(), ['ai-stale']);

  const msgs = buildProductPointsAiMessages('smartphones', [], new Map());
  assert.ok(!msgs[1].content.includes('[object Object]'));
});
