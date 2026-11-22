import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RATING_DEVICE_CATEGORIES,
  getRatingCriteria,
  getRatingUseCasePresets,
} from '@repo/shared-data/rules';
import { compareCategoryParam } from '../compare-params';
import { weightedCriteriaScore5 } from '../leaderboard-engine';
import {
  availableCategoryUseCasePresets,
  computeCustomWeightedScore5,
  defaultCategoryWeights,
  extractCategoryCriteriaScores,
  formatNormalizedWeightSummary,
  isDefaultCategoryWeights,
  mergeUseCaseQueryIntoSearch,
  normalizeCategoryWeights,
  parseUseCaseWeightsFromParams,
  parseWeightsParam,
  resolveCategoryPreset,
  sanitizeSliderWeight,
  scoredCategoryCriteriaForProducts,
  serializeWeightsParam,
  sharedCategoryCriteriaForPair,
  toLegacyCriteriaWeights,
  toLegacyVersusPersona,
} from '../use-case-weights';

// Compare links written with ?cat= open on their category (DOS/Rate#1303).
assert.equal(compareCategoryParam({ cat: 'earbuds' }), 'earbuds');
assert.equal(compareCategoryParam({ category: 'laptops' }), 'laptops');
assert.equal(
  compareCategoryParam({ category: 'laptops', cat: 'earbuds' }),
  'laptops',
  'category wins'
);
assert.equal(compareCategoryParam({ cat: ['tablets', 'x'] }), 'tablets');
assert.equal(compareCategoryParam({}), undefined);
assert.equal(compareCategoryParam({ category: '', cat: 'earbuds' }), 'earbuds');

// ============================================================================
// RTINGS-Style Category Use-Case Presets & Custom Weight Math (DOS/Rate#1864)
// ============================================================================
{
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const webSrcDir = path.resolve(testDir, '../..');

  // 1. Pure client-safe boundary & zero em/en-dash guard
  for (const relPath of [
    'lib/use-case-weights.ts',
    'components/compare/UseCaseWeightBar.tsx',
  ]) {
    const src = fs.readFileSync(path.join(webSrcDir, relPath), 'utf8');
    assert.doesNotMatch(
      src,
      /\bfrom\s+['"][^'"]*server\/rate/,
      `${relPath} must stay client-safe with zero @/server/rate imports`
    );
    assert.doesNotMatch(
      src,
      /[\u2013\u2014]|&mdash;|&ndash;/,
      `${relPath} must contain zero em-dashes or en-dashes`
    );
  }

  // 2. Category preset coverage & sum=100 across all 5 categories
  for (const cat of RATING_DEVICE_CATEGORIES) {
    const defaults = defaultCategoryWeights(cat);
    const defaultSum = Object.values(defaults).reduce(
      (acc, v) => acc + (v ?? 0),
      0
    );
    assert.equal(defaultSum, 100, `${cat} default weights sum to 100`);

    const presets = getRatingUseCasePresets(cat);
    assert.ok(presets.length >= 4, `${cat} offers curated use-case presets`);
    assert.equal(presets[0]?.id, 'default');
    for (const preset of presets) {
      const resolved = resolveCategoryPreset(cat, preset.id);
      assert.equal(resolved.id, preset.id);
      const norm = normalizeCategoryWeights(cat, preset.weights);
      assert.equal(norm.wasAllZeroReset, false);
      const pctSum = Object.values(norm.normalizedPercent).reduce(
        (acc, v) => acc + (v ?? 0),
        0
      );
      assert.equal(
        pctSum,
        100,
        `${cat}:${preset.id} normalized percent sums to 100`
      );
    }
  }

  // Friendly URL preset aliases & category-aware aliases
  assert.equal(
    resolveCategoryPreset('smartphones', 'photography').id,
    'camera'
  );
  assert.equal(resolveCategoryPreset('smartphones', 'VLOG').id, 'camera');
  assert.equal(resolveCategoryPreset('earbuds', 'anc').id, 'commute_anc');
  assert.equal(resolveCategoryPreset('earbuds', 'music').id, 'audiophile');
  assert.equal(resolveCategoryPreset('laptops', 'business').id, 'office');
  assert.equal(resolveCategoryPreset('tablets', 'business').id, 'study_work');
  assert.equal(
    resolveCategoryPreset('smartwatches', 'business').id,
    'smart_daily'
  );

  // Prototype-key & malformed preset guards
  for (const badPreset of [
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'unknown_preset',
    'gaming;drop',
    '',
    '   ',
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(
      resolveCategoryPreset('smartphones', badPreset).id,
      'default',
      `Unsafe preset ${String(badPreset)} falls back to default`
    );
  }

  // 3. Slider clamping, Hare-Niemeyer exact 100% normalization & all-zero reset
  assert.equal(sanitizeSliderWeight(-25, 10), 0);
  assert.equal(sanitizeSliderWeight(180, 10), 100);
  assert.equal(sanitizeSliderWeight('35.6', 0), 36);
  assert.equal(sanitizeSliderWeight(Number.NaN, 15), 15);
  assert.equal(sanitizeSliderWeight(Number.POSITIVE_INFINITY, 20), 20);
  assert.equal(sanitizeSliderWeight('0x20', 12), 12);
  assert.equal(sanitizeSliderWeight('25\u0000', 12), 12);
  assert.equal(sanitizeSliderWeight({ valueOf: () => 50 }, 12), 12);

  const threeEqual = normalizeCategoryWeights('smartphones', {
    performance: 10,
    camera: 10,
    battery: 10,
    display: 0,
    design: 0,
    value: 0,
  });
  assert.equal(threeEqual.wasAllZeroReset, false);
  assert.equal(threeEqual.normalizedPercent.performance, 34);
  assert.equal(threeEqual.normalizedPercent.camera, 33);
  assert.equal(threeEqual.normalizedPercent.battery, 33);
  assert.equal(
    Object.values(threeEqual.normalizedPercent).reduce((a, b) => a + b, 0),
    100
  );

  const allZero = normalizeCategoryWeights('laptops', {
    performance: 0,
    display: 0,
    battery: 0,
    keyboard: 0,
    thermals: 0,
    design: 0,
    value: 0,
  });
  assert.equal(allZero.wasAllZeroReset, true);
  assert.deepEqual(allZero.sliderWeights, defaultCategoryWeights('laptops'));
  assert.equal(
    Object.values(allZero.normalizedPercent).reduce((a, b) => a + b, 0),
    100
  );

  const protoPayload = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":80,"toString":50,"valueOf":50}'
  ) as Record<string, unknown>;
  const protoNormalized = normalizeCategoryWeights('smartphones', protoPayload);
  assert.equal(
    protoNormalized.wasAllZeroReset,
    true,
    'Prototype keys alone do not count as active weights and reset to default'
  );
  assert.equal(
    ({} as Record<string, unknown>).polluted,
    undefined,
    'Object.prototype was never polluted'
  );

  // 4. URL query serialization, strict parsing & canonical-safe query merging
  const customQuery = serializeWeightsParam('smartphones', {
    camera: 60,
    battery: 40,
  });
  assert.equal(customQuery, 'camera:60,battery:40');
  const reparsed = parseWeightsParam('smartphones', customQuery);
  assert.ok(reparsed);
  assert.equal(reparsed.camera, 60);
  assert.equal(reparsed.battery, 40);
  assert.equal(reparsed.performance, 0);

  // Legacy screen key maps cleanly per category
  assert.equal(
    parseWeightsParam('smartphones', 'screen:50,battery:50')?.display,
    50
  );
  assert.equal(parseWeightsParam('earbuds', 'screen:50,battery:50')?.sound, 50);

  for (const invalidWeights of [
    '',
    '   ',
    'camera:-20,battery:50',
    'camera:NaN,battery:50',
    'camera:Infinity,battery:50',
    'camera:999999,battery:10',
    'camera:101,battery:10',
    'camera:0x10,battery:20',
    'camera:0,battery:0',
    '__proto__:50,camera:50',
    'constructor:50,camera:50',
    'toString:50,camera:50',
    'anc:50,battery:50', // anc is invalid on smartphones
    'camera:50:10',
    'camera:50,\u0000battery:50',
    `camera:50,${'a'.repeat(300)}:50`,
  ]) {
    assert.equal(
      parseWeightsParam('smartphones', invalidWeights),
      null,
      `Invalid weights param "${invalidWeights.slice(0, 40)}" must be rejected`
    );
    const fallbackState = parseUseCaseWeightsFromParams('smartphones', {
      weights: invalidWeights,
    });
    assert.equal(fallbackState.mode, 'default');
    assert.deepEqual(
      fallbackState.weights,
      defaultCategoryWeights('smartphones')
    );
  }

  const mergedPreset = mergeUseCaseQueryIntoSearch(
    '?slugs=iphone-16,galaxy-s24',
    'smartphones',
    'gaming',
    resolveCategoryPreset('smartphones', 'gaming').weights
  );
  assert.equal(mergedPreset, '?slugs=iphone-16%2Cgalaxy-s24&preset=gaming');

  const mergedCustom = mergeUseCaseQueryIntoSearch(
    mergedPreset,
    'smartphones',
    'custom',
    { camera: 70, battery: 30 }
  );
  assert.equal(
    mergedCustom,
    '?slugs=iphone-16%2Cgalaxy-s24&weights=camera%3A70%2Cbattery%3A30'
  );

  const mergedReset = mergeUseCaseQueryIntoSearch(
    mergedCustom,
    'smartphones',
    'default',
    defaultCategoryWeights('smartphones')
  );
  assert.equal(
    mergedReset,
    '?slugs=iphone-16%2Cgalaxy-s24',
    'Resetting to Balanced Default strips both preset and weights from URL'
  );
  assert.equal(
    isDefaultCategoryWeights(
      'smartphones',
      'custom',
      defaultCategoryWeights('smartphones')
    ),
    true
  );

  // 5. Decimal rounding parity with weightedCriteriaScore5 & Design Rule #1531 D3/D9
  const parityScores = {
    display: 4.15,
    performance: 4.25,
    camera: 4.35,
    battery: 4.05,
    value: 4.45,
    design: null,
  };
  const legacyParity = weightedCriteriaScore5(
    {
      screen: 4.15,
      performance: 4.25,
      camera: 4.35,
      battery: 4.05,
      value: 4.45,
    },
    {
      screen: 15,
      performance: 40,
      camera: 10,
      battery: 25,
      value: 10,
    },
    ['screen', 'performance', 'camera', 'battery', 'value']
  );
  const customParity = computeCustomWeightedScore5(
    'smartphones',
    parityScores,
    {
      display: 15,
      performance: 40,
      camera: 10,
      battery: 25,
      value: 10,
      design: 0,
    },
    { officialScore5: 4.6 }
  );
  assert.equal(customParity.customScore5, legacyParity);
  assert.equal(customParity.officialScore5, 4.6);
  assert.equal(customParity.displayedOfficialScore5, 4.6);
  assert.equal(customParity.ratedCriteriaCount, 5);

  // Partial criteria renormalize over rated criteria without inventing 0s
  const partialRes = computeCustomWeightedScore5(
    'earbuds',
    {
      sound: 4.8,
      anc: 4.2,
      battery: null,
      comfort: null,
      calls: null,
      value: null,
    },
    resolveCategoryPreset('earbuds', 'audiophile').weights,
    { officialScore5: 4.3 }
  );
  // Audiophile puts sound:50, anc:10 among rated criteria => (4.8*50 + 4.2*10)/60 = 4.70
  assert.equal(partialRes.customScore5, 4.7);
  assert.equal(partialRes.displayedCustomScore5, 4.7);
  assert.equal(partialRes.ratedCriteriaCount, 2);
  assert.equal(partialRes.officialScore5, 4.3);

  // Unrated product returns null customScore5 instead of fabricating a score
  const unratedRes = computeCustomWeightedScore5(
    'earbuds',
    {
      sound: null,
      anc: null,
      battery: null,
      comfort: null,
      calls: null,
      value: null,
    },
    resolveCategoryPreset('earbuds', 'commute_anc').weights,
    { officialScore5: 4.1 }
  );
  assert.equal(unratedRes.customScore5, null);
  assert.equal(unratedRes.displayedCustomScore5, null);
  assert.equal(unratedRes.officialScore5, 4.1);

  // Winner flip between Camera preset and Gaming preset while official scores stay intact
  const phoneCameraPro = {
    slug: 'camera-pro',
    category_slug: 'smartphones',
    rating_score: 4.4,
    authentic_review_count: 18,
    criteria_scores: {
      camera: { score: 4.9, writers: 12 },
      display: { score: 4.7, writers: 12 },
      performance: { score: 3.6, writers: 12 },
      battery: { score: 3.9, writers: 12 },
      design: { score: 4.5, writers: 12 },
      value: { score: 3.8, writers: 12 },
    },
  };
  const phoneGamingBeast = {
    slug: 'gaming-beast',
    category_slug: 'smartphones',
    rating_score: 4.2,
    authentic_review_count: 15,
    criteria_scores: {
      camera: { score: 3.6, writers: 10 },
      display: { score: 4.4, writers: 10 },
      performance: { score: 4.9, writers: 10 },
      battery: { score: 4.8, writers: 10 },
      design: { score: 4.0, writers: 10 },
      value: { score: 4.6, writers: 10 },
    },
  };
  const scoresCamPro = extractCategoryCriteriaScores(
    phoneCameraPro as never,
    'smartphones'
  );
  const scoresGameBeast = extractCategoryCriteriaScores(
    phoneGamingBeast as never,
    'smartphones'
  );
  const shared = sharedCategoryCriteriaForPair(
    'smartphones',
    scoresCamPro,
    scoresGameBeast
  );
  assert.equal(shared.length, getRatingCriteria('smartphones').length);
  assert.equal(
    scoredCategoryCriteriaForProducts('smartphones', [
      { product: phoneCameraPro as never },
    ]).length,
    6
  );
  assert.equal(
    availableCategoryUseCasePresets('smartphones', []).length,
    0,
    'No presets offered when zero criteria have scores (#1553/#1556)'
  );

  const camPresetWeights = resolveCategoryPreset(
    'smartphones',
    'camera'
  ).weights;
  const gamePresetWeights = resolveCategoryPreset(
    'smartphones',
    'gaming'
  ).weights;
  const camProOnCam = computeCustomWeightedScore5(
    'smartphones',
    scoresCamPro,
    camPresetWeights,
    { product: phoneCameraPro as never }
  );
  const gameBeastOnCam = computeCustomWeightedScore5(
    'smartphones',
    scoresGameBeast,
    camPresetWeights,
    { product: phoneGamingBeast as never }
  );
  assert.ok(
    (camProOnCam.customScore5 ?? 0) > (gameBeastOnCam.customScore5 ?? 0)
  );

  const camProOnGame = computeCustomWeightedScore5(
    'smartphones',
    scoresCamPro,
    gamePresetWeights,
    { product: phoneCameraPro as never }
  );
  const gameBeastOnGame = computeCustomWeightedScore5(
    'smartphones',
    scoresGameBeast,
    gamePresetWeights,
    { product: phoneGamingBeast as never }
  );
  assert.ok(
    (gameBeastOnGame.customScore5 ?? 0) > (camProOnGame.customScore5 ?? 0),
    'Switching to Gaming preset flips custom winner to gaming-beast'
  );
  assert.equal(camProOnGame.officialScore5, 4.4);
  assert.equal(gameBeastOnGame.officialScore5, 4.2);

  // Summary formatting & legacy bridges across locales
  for (const locale of ['vi', 'en', 'cs'] as const) {
    const summary = formatNormalizedWeightSummary(
      'earbuds',
      normalizeCategoryWeights(
        'earbuds',
        resolveCategoryPreset('earbuds', 'commute_anc').weights
      ).normalizedPercent,
      locale
    );
    assert.ok(summary.length > 10);
    assert.doesNotMatch(summary, /[\u2013\u2014]/);
  }
  const legacyEarbuds = toLegacyCriteriaWeights(
    'earbuds',
    resolveCategoryPreset('earbuds', 'commute_anc').weights
  );
  assert.equal(
    legacyEarbuds.screen +
      legacyEarbuds.performance +
      legacyEarbuds.camera +
      legacyEarbuds.battery +
      legacyEarbuds.value,
    100
  );
  assert.equal(toLegacyVersusPersona('gaming'), 'gaming');
  assert.equal(toLegacyVersusPersona('commute_anc'), 'photography');
  assert.equal(toLegacyVersusPersona('custom'), 'custom');

  // 6. Round-1 review regressions: duplicate query keys, foreign availableCriteria,
  // explicit empty / outside-onlyCriteria null score, and URL round-trip parity
  assert.equal(parseWeightsParam('smartphones', 'camera:50,camera:0'), null);
  assert.equal(parseWeightsParam('smartphones', 'screen:50,display:0'), null);
  assert.deepEqual(
    defaultCategoryWeights('  LAPTOPS\u0000 '),
    defaultCategoryWeights('laptops')
  );
  assert.equal(
    availableCategoryUseCasePresets('smartphones', ['anc']).length,
    0,
    'Foreign-only availableCriteria returns zero presets'
  );
  assert.equal(
    computeCustomWeightedScore5(
      'smartphones',
      scoresCamPro,
      { camera: 80, display: 20 },
      { onlyCriteria: [] }
    ).customScore5,
    null,
    'Explicit empty onlyCriteria returns null instead of scoring all criteria'
  );
  assert.equal(
    computeCustomWeightedScore5(
      'smartphones',
      scoresCamPro,
      { camera: 80, display: 20, performance: 0, battery: 0 },
      { onlyCriteria: ['performance', 'battery'] }
    ).customScore5,
    null,
    'Weights placed solely outside onlyCriteria return null instead of Balanced Default'
  );

  // Live vs serialized ?weights= round-trip parity (10/10/10 -> 34%/33%/33%)
  const rawEqualThree = {
    performance: 10,
    camera: 10,
    battery: 10,
    display: 0,
    design: 0,
    value: 0,
  };
  const roundTripScores = {
    performance: 5.0,
    camera: 4.0,
    battery: 4.0,
    display: 4.0,
    design: 4.0,
    value: 4.0,
  };
  const liveThreeRes = computeCustomWeightedScore5(
    'smartphones',
    roundTripScores,
    rawEqualThree
  );
  const encodedThree = serializeWeightsParam('smartphones', rawEqualThree);
  assert.equal(encodedThree, 'performance:10,camera:10,battery:10');
  assert.equal(liveThreeRes.customScore5, 4.33);
  const reloadedThreeRes = computeCustomWeightedScore5(
    'smartphones',
    roundTripScores,
    parseWeightsParam('smartphones', encodedThree)
  );
  assert.equal(
    liveThreeRes.customScore5,
    reloadedThreeRes.customScore5,
    'Live custom score matches shared/reloaded ?weights= URL score exactly'
  );

  // Small positive slider weight (camera:1 alongside five 100s) is preserved in URL
  const tinyCameraEncoded = serializeWeightsParam('smartphones', {
    performance: 100,
    camera: 1,
    battery: 100,
    display: 100,
    design: 100,
    value: 100,
  });
  assert.match(tinyCameraEncoded, /\bcamera:1\b/);

  // Exact proportion comparison in isDefaultCategoryWeights
  assert.equal(
    isDefaultCategoryWeights('smartphones', 'custom', {
      performance: 40,
      camera: 40,
      battery: 40,
      display: 30,
      design: 20,
      value: 30,
    }),
    true,
    'Exact 2x multiple of smartphone default weights collapses cleanly to default'
  );
  assert.equal(
    isDefaultCategoryWeights('smartphones', 'custom', {
      performance: 100,
      camera: 99,
      battery: 100,
      display: 75,
      design: 50,
      value: 75,
    }),
    false,
    'Near-default weights with distinct exact proportions retain custom URL state'
  );
}

console.log('✅ compare params & RTINGS use-case weights');
