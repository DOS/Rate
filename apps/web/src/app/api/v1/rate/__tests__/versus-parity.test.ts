/**
 * The versus page and `GET /api/v1/rate/versus` name the same final winner,
 * the same tie, the same lead under a preset and the same criterion winners
 * (DOS/Rate#1647, item 5). The final winner is always by the overall stars.
 *
 * The route handler runs for real on stubbed catalogue rows; the page side
 * runs the same steps the page runs: `scoreMasterProductForLeaderboard`,
 * `computeVersusResult` and `versusCriteriaHeadToHead`, in the page's
 * canonical pair order.
 */
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

type Row = Record<string, unknown> & { slug: string };
let masterRows: Row[] = [];

const jsonResponse = (status: number, json: unknown) =>
  new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const parsed = new URL(url);
  if (parsed.pathname === '/rest/v1/master_products') {
    const slugFilter = parsed.searchParams.get('slug');
    const wanted = slugFilter?.startsWith('eq.')
      ? [slugFilter.slice(3)]
      : slugFilter?.startsWith('in.(')
        ? slugFilter
            .slice(4, -1)
            .split(',')
            .map((s) => s.replace(/^"|"$/g, ''))
        : null;
    return jsonResponse(
      200,
      wanted ? masterRows.filter((row) => wanted.includes(row.slug)) : []
    );
  }
  return jsonResponse(200, []);
}) as typeof fetch;

let seq = 0;
/** A published phone; criteria are expert scores on 10. */
const phone = (
  slug: string,
  rating: number,
  criteria10: Partial<Record<string, number>> = {},
  minPrice = 10_000_000
): Row => {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug,
    name: slug,
    brand: 'Brand',
    model: slug,
    status: 'published',
    category_id: null,
    rating_score: rating,
    user_rating_weighted: rating,
    average_rating: rating,
    expert_rating: null,
    total_reviews: rating > 0 ? 40 : 0,
    min_price: minPrice,
    max_price: minPrice,
    merchant_count: minPrice > 0 ? 2 : 0,
    expert_criteria_scores: criteria10,
    criteria_scores: {},
    metadata: { category_slug: 'smartphones' },
    specifications: {},
    key_specs: {},
    thumbnail: null,
    images: [],
  };
};

const ALL8 = {
  screen: 8,
  performance: 8,
  camera: 8,
  battery: 8,
  value: 8,
};

interface ApiSide {
  slug: string;
  custom_weighted_score_5: number;
  custom_weighted_score_10: number;
  rating_score_5: number | null;
  overall_score_5: number | null;
}

interface VersusBody {
  ok: boolean;
  persona: string;
  applied_persona: string;
  custom_weighted_basis: string;
  is_tie: boolean;
  overall_winner: {
    side: 'A' | 'B';
    slug: string;
    margin_10: number | null;
  };
  persona_result: {
    persona: string;
    basis: string;
    is_tie: boolean;
    winner_slug: string;
    score_a_10: number;
    score_b_10: number;
  } | null;
  criteria_head_to_head: Array<{
    criterion: string;
    score_a_10: number | null;
    score_b_10: number | null;
    delta_10: number | null;
    winner_slug: string | null;
  }>;
  product_a: ApiSide;
  product_b: ApiSide;
}

async function main() {
  const { NextRequest } = await import('next/server');
  const { GET } = await import('../versus/route');
  const { scoreMasterProductForLeaderboard } =
    await import('@/lib/leaderboard-engine');
  const { canonicalVersusOrder } = await import('@/lib/item-compare');
  const { displayedScore5 } = await import('@/lib/rating-display');
  const { PERSONA_WEIGHTS, computeVersusResult, versusCriteriaHeadToHead } =
    await import('@/lib/versus-score');
  type PersonaPresetKey = Parameters<typeof computeVersusResult>[2];
  type CriteriaWeights = Parameters<typeof computeVersusResult>[3];
  type MasterRow = Parameters<typeof scoreMasterProductForLeaderboard>[0];

  /** What the versus page shows for a pair, preset and weights. */
  const pageResult = (
    a: Row,
    b: Row,
    persona: PersonaPresetKey,
    weights: CriteriaWeights
  ) => {
    // The page renders the pair in its canonical (sorted) order.
    const [first, second] = canonicalVersusOrder(a.slug, b.slug);
    const rowFor = (slug: string) => (slug === a.slug ? a : b);
    const scoreA = scoreMasterProductForLeaderboard(
      rowFor(first!) as unknown as MasterRow,
      'combined'
    );
    const scoreB = scoreMasterProductForLeaderboard(
      rowFor(second!) as unknown as MasterRow,
      'combined'
    );
    const versus = computeVersusResult(scoreA, scoreB, persona, weights);
    const slugOf = (side: 'A' | 'B' | 'tie' | null) =>
      side === 'A' ? scoreA.slug : side === 'B' ? scoreB.slug : side;
    /** A side's score in a result, by slug. */
    const finalOf = (
      result: { finalA: number; finalB: number },
      slug: string
    ) => (slug === scoreA.slug ? result.finalA : result.finalB);
    return {
      versus,
      finalOf,
      // The page's criterion table: each row's winner as a slug.
      criterionWinners: Object.fromEntries(
        versusCriteriaHeadToHead(scoreA, scoreB).map((row) => [
          row.key,
          slugOf(row.winner),
        ])
      ),
    };
  };

  const apiResult = async (a: Row, b: Row, query = ''): Promise<VersusBody> => {
    masterRows = [a, b];
    const res = await GET(
      new NextRequest(
        `https://rate.vn/api/v1/rate/versus?pair=${a.slug}-vs-${b.slug}${query}`
      )
    );
    assert.equal(res.status, 200, `${a.slug} vs ${b.slug}${query}`);
    return (await res.json()) as VersusBody;
  };

  /** Runs both, checks they agree, and returns the API body. */
  const agree = async (
    label: string,
    a: Row,
    b: Row,
    page: { persona: PersonaPresetKey; weights: CriteriaWeights },
    query = ''
  ) => {
    const api = await apiResult(a, b, query);
    const { versus, finalOf, criterionWinners } = pageResult(
      a,
      b,
      page.persona,
      page.weights
    );
    const { overall } = versus;
    assert.equal(api.ok, true, label);
    // The final winner and tie: the overall stars, on both.
    assert.equal(api.is_tie, overall.tie, `${label}: is_tie`);
    assert.equal(
      api.overall_winner.slug,
      overall.winner.slug,
      `${label}: final winner`
    );
    assert.equal(
      api.applied_persona,
      versus.appliedPersona,
      `${label}: applied preset`
    );
    // The lead under the picked weights, shown apart, on both.
    if (versus.persona == null) {
      assert.equal(api.persona_result, null, `${label}: no persona lead`);
    } else {
      assert.ok(api.persona_result, `${label}: persona lead`);
      assert.equal(api.persona_result.is_tie, versus.persona.tie);
      assert.equal(
        api.persona_result.winner_slug,
        versus.persona.winner.slug,
        `${label}: persona winner`
      );
      assert.equal(api.persona_result.basis, versus.persona.basis);
    }
    const byWeights = versus.persona ?? overall;
    assert.equal(api.custom_weighted_basis, byWeights.basis, `${label}: basis`);
    for (const side of [api.product_a, api.product_b]) {
      assert.equal(
        side.overall_score_5,
        displayedScore5(finalOf(overall, side.slug)) || null,
        `${label}: ${side.slug} overall score`
      );
      assert.equal(
        side.custom_weighted_score_5,
        finalOf(byWeights, side.slug),
        `${label}: ${side.slug} weighted score`
      );
      assert.equal(
        side.custom_weighted_score_10,
        displayedScore5(finalOf(byWeights, side.slug)) * 2,
        `${label}: ${side.slug} weighted score on 10`
      );
    }
    // Every criterion row names the page's criterion winner.
    assert.deepEqual(
      Object.fromEntries(
        api.criteria_head_to_head.map((row) => [row.criterion, row.winner_slug])
      ),
      criterionWinners,
      `${label}: criterion winners`
    );
    return api;
  };

  const byDefault = {
    persona: 'default' as const,
    weights: PERSONA_WEIGHTS.default,
  };
  const photography = {
    persona: 'photography' as const,
    weights: PERSONA_WEIGHTS.photography,
  };

  // 1. The overall stars as shown decide: 4.35 shows 4.4 and leads 4.3.
  {
    const api = await agree(
      'lead',
      phone('vp-lead-a', 4.35),
      phone('vp-lead-b', 4.3),
      byDefault
    );
    assert.equal(api.is_tie, false);
    assert.equal(api.overall_winner.slug, 'vp-lead-a');
    assert.equal(api.product_a.overall_score_5, 4.4);
    assert.equal(api.product_b.overall_score_5, 4.3);
    assert.equal(api.overall_winner.margin_10, 0.2);
    assert.equal(api.persona_result, null);
    // No `persona` is `balanced`, the default weights.
    assert.equal(api.persona, 'balanced');
    assert.equal(api.applied_persona, 'default');
  }

  // 2. A tie at the shown precision (4.35 and 4.4 both show 4.4): both say
  //    tie and pick the higher unrounded score, in either order.
  {
    const a = phone('vp-tie-a', 4.35);
    const b = phone('vp-tie-b', 4.4);
    for (const [label, x, y] of [
      ['tie', a, b],
      ['tie swapped', b, a],
    ] as const) {
      const api = await agree(label, x, y, byDefault);
      assert.equal(api.is_tie, true);
      assert.equal(api.overall_winner.slug, 'vp-tie-b');
      assert.equal(api.overall_winner.margin_10, 0);
    }
  }

  // 3. Level scores: the lower price breaks the tie; with the same price the
  //    canonical first slug does, so the pick never depends on the order.
  {
    const cheap = await agree(
      'price tie-break',
      phone('vp-price-a', 4.5, {}, 12_000_000),
      phone('vp-price-b', 4.5, {}, 9_000_000),
      byDefault
    );
    assert.equal(cheap.is_tie, true);
    assert.equal(cheap.overall_winner.slug, 'vp-price-b');
    const x = phone('vp-eq-zz', 4.5);
    const y = phone('vp-eq-aa', 4.5);
    for (const [label, p, q] of [
      ['exact tie', x, y],
      ['exact tie swapped', y, x],
    ] as const) {
      const api = await agree(label, p, q, byDefault);
      assert.equal(api.is_tie, true);
      assert.equal(api.overall_winner.slug, 'vp-eq-aa');
    }
  }

  // 4. One unrated side: the rated side wins, no tie and no gap, on both.
  {
    const api = await agree(
      'one unrated',
      phone('vp-unrated-a', 4.2),
      phone('vp-unrated-b', 0),
      byDefault
    );
    assert.equal(api.is_tie, false);
    assert.equal(api.overall_winner.slug, 'vp-unrated-a');
    assert.equal(api.overall_winner.margin_10, null);
    assert.equal(api.product_b.rating_score_5, null);
    assert.equal(api.product_b.overall_score_5, null);
    // With criteria, an unrated side keeps its composite (here the criteria
    // average, 4.2) as its overall score, as the page shows it; a preset's
    // lead can go to it, the final result does not.
    const withCriteria = await agree(
      'one unrated, photography',
      phone('vp-unrated-c', 4.2, ALL8),
      phone('vp-unrated-d', 0, { ...ALL8, camera: 10 }),
      photography,
      '&persona=photography'
    );
    assert.equal(withCriteria.product_b.rating_score_5, null);
    assert.equal(withCriteria.product_b.overall_score_5, 4.2);
    assert.equal(withCriteria.is_tie, true);
    assert.equal(withCriteria.persona_result?.winner_slug, 'vp-unrated-d');
    assert.equal(withCriteria.persona_result?.is_tie, false);
  }

  // 5. Both unrated: a tie on both.
  {
    const api = await agree(
      'both unrated',
      phone('vp-none-a', 0),
      phone('vp-none-b', 0),
      byDefault
    );
    assert.equal(api.is_tie, true);
    assert.equal(api.overall_winner.margin_10, 0);
  }

  // 6. A preset never turns the final winner: the stars favour A, the camera
  //    favours B, so B only leads under the photography weights.
  {
    const a = phone('vp-cam-a', 4.6, { ...ALL8, camera: 7 });
    const b = phone('vp-cam-b', 4.3, { ...ALL8, camera: 10 });
    const photo = await agree(
      'camera pair, photography',
      a,
      b,
      photography,
      '&persona=photography'
    );
    assert.equal(photo.overall_winner.slug, 'vp-cam-a');
    assert.equal(photo.is_tie, false);
    assert.equal(photo.applied_persona, 'photography');
    assert.equal(photo.custom_weighted_basis, 'rating_and_criteria');
    assert.equal(photo.persona_result?.winner_slug, 'vp-cam-b');
    // A: 0.35 * 4.6 + 0.65 * 3.78; B: 0.35 * 4.3 + 0.65 * 4.45.
    assert.equal(photo.product_a.custom_weighted_score_5, 4.067);
    assert.equal(photo.product_b.custom_weighted_score_5, 4.3975);
    assert.equal(photo.persona_result?.score_a_10, 8.2);
    assert.equal(photo.persona_result?.score_b_10, 8.8);

    // A weight in the query is the page's custom sliders: the preset's
    // weights with that one changed. Camera at 0 gives A the lead back.
    const custom = await agree(
      'camera pair, custom',
      a,
      b,
      {
        persona: 'custom',
        weights: { ...PERSONA_WEIGHTS.photography, camera: 0 },
      },
      '&persona=photography&w_camera=0'
    );
    assert.equal(custom.applied_persona, 'custom');
    assert.equal(custom.overall_winner.slug, 'vp-cam-a');
    assert.equal(custom.persona_result?.winner_slug, 'vp-cam-a');

    // `budget` is the page's value preset; `gamer` scores as custom weights.
    const budget = await agree(
      'camera pair, budget',
      a,
      b,
      { persona: 'value_hunter', weights: PERSONA_WEIGHTS.value_hunter },
      '&persona=budget'
    );
    assert.equal(budget.applied_persona, 'value_hunter');
    const gamer = await apiResult(a, b, '&persona=gamer');
    assert.equal(gamer.applied_persona, 'custom');
    assert.equal(gamer.overall_winner.slug, 'vp-cam-a');
  }

  // 7. A preset whose heaviest criterion is not scored on both sides falls
  //    back to the default weights, as the page offers no such preset.
  {
    const a = phone('vp-fallback-a', 4.6, { performance: 6, camera: 9 });
    const b = phone('vp-fallback-b', 4.3, { performance: 10 });
    const api = await agree(
      'fallback',
      a,
      b,
      photography,
      '&persona=photography'
    );
    assert.equal(api.persona, 'photography');
    assert.equal(api.applied_persona, 'default');
    assert.equal(api.custom_weighted_basis, 'rating');
    assert.equal(api.persona_result, null);
    assert.equal(api.overall_winner.slug, 'vp-fallback-a');
    // Gaming leads with performance, which both have: B leads under it, A
    // still wins.
    const gaming = await agree(
      'fallback pair, gaming',
      a,
      b,
      { persona: 'gaming', weights: PERSONA_WEIGHTS.gaming },
      '&persona=gaming'
    );
    assert.equal(gaming.applied_persona, 'gaming');
    assert.equal(gaming.persona_result?.winner_slug, 'vp-fallback-b');
    assert.equal(gaming.overall_winner.slug, 'vp-fallback-a');
  }

  // 8. Custom weights with no criterion shared fall back to the default.
  {
    const api = await agree(
      'custom, nothing shared',
      phone('vp-noshare-a', 4.1, { camera: 9 }),
      phone('vp-noshare-b', 4.4, { battery: 9 }),
      byDefault,
      '&w_camera=100'
    );
    assert.equal(api.applied_persona, 'default');
    assert.equal(api.persona_result, null);
    assert.equal(api.overall_winner.slug, 'vp-noshare-b');
  }

  // 9. Each criterion has its own winner, on the criterion stars as shown at
  //    one decimal: 4.34 and 4.26 both show 4.3 (a tie), 4.35 shows 4.4 and
  //    beats 4.3, and a criterion scored on one side only has no winner.
  //    Criteria won do not change the final winner: the overall stars do.
  {
    const a = phone('vp-crit-a', 4.0, {
      screen: 8.68, // 4.34 -> 4.3
      performance: 8.7, // 4.35 -> 4.4
      camera: 6,
      battery: 9,
    });
    const b = phone('vp-crit-b', 4.5, {
      screen: 8.52, // 4.26 -> 4.3
      performance: 8.6, // 4.3
      camera: 9,
      value: 8,
    });
    const api = await agree('criteria', a, b, byDefault);
    const row = (key: string) =>
      api.criteria_head_to_head.find((r) => r.criterion === key)!;
    assert.equal(row('screen').winner_slug, 'tie');
    assert.equal(row('screen').delta_10, 0);
    assert.equal(row('screen').score_a_10, 8.6);
    assert.equal(row('screen').score_b_10, 8.6);
    assert.equal(row('performance').winner_slug, 'vp-crit-a');
    assert.equal(row('performance').delta_10, 0.2);
    assert.equal(row('camera').winner_slug, 'vp-crit-b');
    assert.equal(row('camera').delta_10, -3);
    assert.equal(row('battery').winner_slug, null);
    assert.equal(row('battery').delta_10, null);
    assert.equal(row('value').winner_slug, null);
    assert.equal(api.overall_winner.slug, 'vp-crit-b');
    // In the other order the rows mirror.
    const swapped = await agree('criteria swapped', b, a, byDefault);
    const swappedCamera = swapped.criteria_head_to_head.find(
      (r) => r.criterion === 'camera'
    )!;
    assert.equal(swappedCamera.winner_slug, 'vp-crit-b');
    assert.equal(swappedCamera.delta_10, 3);
  }

  // 10. The 0.35 / 0.65 blend rounds on the decimal value: 0.35 * 4.5 +
  //     0.65 * 3.5 is 3.85 (not 3.8499999999999996) and shows 3.9, level
  //     with 0.35 * 3.9 + 0.65 * 3.9.
  {
    const api = await agree(
      'blend float',
      phone('vp-float-a', 4.5, { camera: 7 }),
      phone('vp-float-b', 3.9, { camera: 7.8 }),
      photography,
      '&persona=photography'
    );
    assert.equal(api.product_a.custom_weighted_score_5, 3.85);
    assert.equal(api.persona_result?.score_a_10, 7.8);
    assert.equal(api.persona_result?.score_b_10, 7.8);
    assert.equal(api.persona_result?.is_tie, true);
  }

  // The page itself runs these steps: the final result, the verdict and the
  // banner come from the overall stars, and the criterion table from the
  // shared rows (so this test's page side is the page's).
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const pageSrc = readFileSync(
    join(
      __dirname,
      '../../../../../components/compare/VersusInteractiveScoreboard.tsx'
    ),
    'utf8'
  );
  for (const wired of [
    'computeVersusResult(scoreA, scoreB, persona, weights)',
    'const overallResult = versus.overall;',
    'versusCriteriaHeadToHead(scoreA, scoreB)',
  ]) {
    assert.ok(pageSrc.includes(wired), `the versus page runs ${wired}`);
  }
  assert.ok(
    /versusVerdictFor\(\s*overallResult,\s*scoreA\.slug,\s*'default'/.test(
      pageSrc
    ),
    'the verdict names the final winner by the overall stars, no weights'
  );
  assert.ok(!pageSrc.includes('weightedResult.'));

  console.log('versus-parity: page and API agree on every case');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
