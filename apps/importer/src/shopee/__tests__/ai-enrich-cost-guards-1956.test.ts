import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { categoryNeedsAiSpecs, specificationsCompleteForCategory } from '../ai-enrich-guards.js';
import { AiSpecEnricher, buildSchemaHint } from '../ai-spec-enricher.js';
import { EntityMatcher } from '../entity-matcher.js';
import type { RateSupabaseClient } from '../types.js';

// DOS/Rate#1956: AI spec enrichment must not pay for calls that cannot add a value.

type PromptBuilder = {
  buildPrompts(...args: unknown[]): { systemPrompt: string; userPrompt: string };
};
const promptFor = (category: string) =>
  (new AiSpecEnricher({ apiKey: 'k' }) as unknown as PromptBuilder).buildPrompts(
    'Brand',
    'Model X',
    128,
    8,
    'Brand Model X',
    undefined,
    category
  );

test('categoryNeedsAiSpecs: only categories with a device spec group', () => {
  for (const slug of ['smartphones', 'laptops', 'earbuds', 'tvs', 'air-purifiers', 'unknown-x']) {
    assert.equal(categoryNeedsAiSpecs(slug), true, slug);
  }
  for (const slug of ['supplements', 'cosmetics', 'bank-savings', 'restaurants', 'hotels']) {
    assert.equal(categoryNeedsAiSpecs(slug), false, slug);
  }
  assert.equal(categoryNeedsAiSpecs(undefined), true, 'no category keeps the phone template');
});

test('specificationsCompleteForCategory: every non-optional group needs a value', () => {
  const earbuds = {
    multimedia: { audio_features: 'ANC' },
    battery: { capacity_mah: 500 },
    connectivity: { bluetooth: '5.3' },
    hardware: { chipset: 'H2' },
    design: { colors: ['White'] },
  };
  // availability and regulatory are optional: the sources rarely state them.
  assert.equal(specificationsCompleteForCategory(earbuds, 'earbuds'), true);
  assert.equal(
    specificationsCompleteForCategory({ ...earbuds, hardware: { chipset: '  ' } }, 'earbuds'),
    false
  );
  assert.equal(specificationsCompleteForCategory({ ...earbuds, battery: {} }, 'earbuds'), false);
  assert.equal(specificationsCompleteForCategory(null, 'earbuds'), false);
  assert.equal(specificationsCompleteForCategory({}, 'smartphones'), false);
});

test('the phone, tablet and laptop prompt is byte-identical to the pre-#1956 prompt', () => {
  // sha256 of the system prompt as built before the schema was narrowed.
  const before = '0d380fb4dde170396c9ca51c67e97d79a371f80c6e7fdc9aead4fa1145185fd4';
  for (const slug of ['smartphones', 'tablets', 'laptops']) {
    const hash = createHash('sha256').update(promptFor(slug).systemPrompt).digest('hex');
    assert.equal(hash, before, slug);
  }
});

test('a phone master with a minor field per group is not complete', () => {
  const phone = {
    availability: {},
    design: { colors: ['Black'] },
    display: { size_inch: 6.1 },
    hardware: { chipset: 'A18' },
    battery: { capacity_mah: 3500 },
    camera: { main_camera: '48 MP', second_camera: '12 MP' },
    connectivity: { nfc: true },
    cellular: { has_5g: true },
    multimedia: { loudspeaker: 'Stereo' },
  };
  assert.equal(specificationsCompleteForCategory(phone, 'smartphones'), true);
  // The audit fails these when the AI never fills them.
  assert.equal(
    specificationsCompleteForCategory(
      { ...phone, camera: { rear_setup: 'Triple Camera' } },
      'smartphones'
    ),
    false
  );
  assert.equal(
    specificationsCompleteForCategory(
      { ...phone, camera: { main_camera: '48 MP' } },
      'smartphones'
    ),
    false
  );
  assert.equal(
    specificationsCompleteForCategory(
      { ...phone, camera: { rear_setup: 'Single Camera', main_camera: '48 MP' } },
      'smartphones'
    ),
    true
  );
  assert.equal(
    specificationsCompleteForCategory({ ...phone, hardware: { os: 'iOS' } }, 'smartphones'),
    false
  );
  assert.equal(
    specificationsCompleteForCategory({ ...phone, design: { colors: [] } }, 'smartphones'),
    false
  );
});

test('the prompt schema keeps the phone schema and narrows the other categories', () => {
  for (const slug of ['smartphones', 'tablets', 'laptops']) {
    const hint = buildSchemaHint(slug);
    for (const key of ['"ram_gb"', '"has_5g"', '"camera": {', '"cellular": {', '"key_specs"']) {
      assert.ok(hint.includes(key), `${slug}: ${key}`);
    }
    JSON.parse(hint.replace(/: (number|boolean)/g, ': 0').replace(/\[("string")\]/g, '[]'));
  }
  const earbuds = buildSchemaHint('earbuds');
  for (const gone of ['"display": {', '"camera": {', '"cellular": {', '"ram_gb"', '"has_5g"']) {
    assert.ok(!earbuds.includes(gone), `earbuds: ${gone}`);
  }
  assert.ok(earbuds.includes('"multimedia": {') && earbuds.includes('"hardware": {'));
  for (const gone of ['"cpu"', '"gpu"', '"storage_expansion"', '"os"', '"biometrics"']) {
    assert.ok(!earbuds.includes(gone), `earbuds hidden field ${gone}`);
  }
  assert.ok(earbuds.includes('"chipset"'), 'the audio chip stays');
  // Whatever is narrowed still parses as JSON once the hints are values.
  for (const slug of ['earbuds', 'tvs', 'smartwatches', 'air-conditioners', 'cosmetics']) {
    const json = buildSchemaHint(slug)
      .replace(/: number|: boolean/g, ': 0')
      .replace(/: "string[^\n]*?"(,?)$/gm, ': "s"$1')
      .replace(/\["string"\]/g, '[]');
    JSON.parse(json);
  }
  assert.ok(!earbuds.includes('"screen":'), 'earbuds have no screen key spec');
  const ac = buildSchemaHint('air-conditioners');
  assert.ok(!ac.includes('"key_specs"'), 'a category without key specs asks for none');
  assert.ok(!ac.includes('"display": {') && !ac.includes('"battery_mah"'));

  const phone = promptFor('smartphones');
  const watch = promptFor('smartwatches');
  assert.ok(watch.systemPrompt.length < phone.systemPrompt.length);
  assert.ok(!watch.systemPrompt.includes('"camera": {'));
  assert.ok(promptFor('air-purifiers').systemPrompt.length < phone.systemPrompt.length * 0.6);
});

/** A fetch stand-in that counts provider calls and reports token usage. */
function stubFetch(counter: { calls: number }): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    counter.calls += 1;
    await new Promise(r => setTimeout(r, 5));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                specifications: { hardware: { chipset: 'Apple A18' } },
                key_specs: { chip: 'A18' },
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1600, completion_tokens: 300 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test('fetchSpecsFromAi makes no call for a category with no device spec groups', async () => {
  const counter = { calls: 0 };
  const restore = stubFetch(counter);
  try {
    const enricher = new AiSpecEnricher({ apiKey: 'k' });
    for (const categorySlug of ['supplements', 'cosmetics', 'bank-savings']) {
      const res = await enricher.fetchSpecsFromAi({
        brand: 'Brand',
        model: 'Thing',
        storageGb: null,
        ramGb: null,
        categorySlug,
      });
      assert.equal(res, null, categorySlug);
    }
    assert.equal(counter.calls, 0);
    assert.equal(enricher.getUsage().skippedNotApplicable, 3);
    assert.equal(enricher.getUsage().calls, 0);
  } finally {
    restore();
  }
});

test('identical concurrent and repeated requests share one provider call', async () => {
  const counter = { calls: 0 };
  const restore = stubFetch(counter);
  try {
    const enricher = new AiSpecEnricher({ apiKey: 'k' });
    const params = {
      brand: 'Apple',
      model: 'iPhone 16',
      storageGb: 128,
      ramGb: 8,
      categorySlug: 'smartphones',
    };
    const [a, b, c] = await Promise.all([
      enricher.fetchSpecsFromAi(params),
      enricher.fetchSpecsFromAi(params),
      enricher.fetchSpecsFromAi(params),
    ]);
    assert.equal(counter.calls, 1, 'three concurrent requests, one call');
    assert.ok(a && b && c);
    assert.notEqual(a, b, 'each caller gets its own copy');
    a.specifications.hardware = { chipset: 'mutated' };
    assert.equal(b.specifications.hardware?.chipset, 'Apple A18');
    await enricher.fetchSpecsFromAi(params);
    assert.equal(counter.calls, 1, 'a later request is a cache hit');
    // A different variant is a different question.
    await enricher.fetchSpecsFromAi({ ...params, storageGb: 256 });
    assert.equal(counter.calls, 2);
    const usage = enricher.getUsage();
    assert.equal(usage.calls, 2);
    assert.equal(usage.sharedInflight, 2);
    assert.equal(usage.cacheHits, 1);
    assert.equal(usage.promptTokens, 3200);
    assert.equal(usage.completionTokens, 600);
  } finally {
    restore();
  }
});

/** A client whose master row is `row`; counts reads and updates. */
function masterClient(row: Record<string, unknown>, state: { updates: number }) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: row, error: null }) };
            },
          };
        },
        update() {
          state.updates += 1;
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  } as unknown as RateSupabaseClient;
}

const baseRow = {
  id: 'm1',
  brand: 'Sony',
  model: 'WF-1000XM6',
  storage_gb: null,
  ram_gb: null,
  screen_size_inch: null,
  battery_mah: null,
  has_5g: null,
  name: 'Sony WF-1000XM6',
  description: null,
  colors: [],
  key_specs: {},
};

async function enrichWith(row: Record<string, unknown>) {
  let aiCalls = 0;
  const enricher = new AiSpecEnricher({ apiKey: '' });
  enricher.fetchSpecsFromAi = async () => {
    aiCalls += 1;
    return {
      ram_gb: null,
      storage_gb: null,
      screen_size_inch: null,
      battery_mah: null,
      specifications: { hardware: { chipset: 'QN3' } },
      key_specs: {},
    };
  };
  const state = { updates: 0 };
  const ok = await new EntityMatcher(masterClient(row, state), enricher, {
    itemModel: 'off',
  }).enrichMasterProductById('m1');
  return { ok, aiCalls, updates: state.updates };
}

test('enrichMasterProductById skips a master that cannot gain anything', async () => {
  // Not applicable: a supplement has no device groups.
  const supplement = await enrichWith({
    ...baseRow,
    specifications: { category_slug: 'supplements' },
  });
  assert.deepEqual(supplement, { ok: false, aiCalls: 0, updates: 0 });

  // Unchanged input: every group an earbuds master has already holds a value.
  const complete = await enrichWith({
    ...baseRow,
    specifications: {
      category_slug: 'earbuds',
      multimedia: { audio_features: 'ANC' },
      battery: { capacity_mah: 500 },
      connectivity: { bluetooth: '5.3' },
      hardware: { chipset: 'QN2' },
      design: { colors: ['Black'] },
    },
  });
  assert.deepEqual(complete, { ok: false, aiCalls: 0, updates: 0 });

  // A real gap (no hardware group) still gets its call and its write.
  const gap = await enrichWith({
    ...baseRow,
    specifications: {
      category_slug: 'earbuds',
      multimedia: { audio_features: 'ANC' },
      battery: { capacity_mah: 500 },
      connectivity: { bluetooth: '5.3' },
      design: { colors: ['Black'] },
    },
  });
  assert.deepEqual(gap, { ok: true, aiCalls: 1, updates: 1 });
});

test('a failed shared call returns null to every waiter and is retried later', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    await new Promise(r => setTimeout(r, 5));
    return new Response('boom', { status: 400 });
  }) as typeof fetch;
  try {
    const enricher = new AiSpecEnricher({ apiKey: 'k' });
    const params = {
      brand: 'Apple',
      model: 'iPhone 16',
      storageGb: 128,
      ramGb: 8,
      categorySlug: 'smartphones',
    };
    const results = await Promise.all([
      enricher.fetchSpecsFromAi(params),
      enricher.fetchSpecsFromAi(params),
    ]);
    assert.deepEqual(results, [null, null]);
    assert.equal(calls, 1);
    await enricher.fetchSpecsFromAi(params);
    assert.equal(calls, 2, 'a failure is not cached');
  } finally {
    globalThis.fetch = original;
  }
});

test('a category guessed from the title never skips the call', async () => {
  const counter = { calls: 0 };
  const restore = stubFetch(counter);
  try {
    const enricher = new AiSpecEnricher({ apiKey: 'k' });
    const params = {
      brand: 'Viettel',
      model: 'Goi cuoc 5G',
      storageGb: null,
      ramGb: null,
      categorySlug: 'internet-telecom',
    };
    assert.equal(
      (await enricher.fetchSpecsFromAi({ ...params, categoryGuessed: true })) !== null,
      true
    );
    assert.equal(counter.calls, 1);
    assert.equal(await enricher.fetchSpecsFromAi({ ...params, model: 'Other' }), null);
    assert.equal(counter.calls, 1, 'a stored category still skips');
  } finally {
    restore();
  }
});

test('enrichMasterProductById trusts only a stored category to skip', async () => {
  // No stored category_slug and a title that reads as a bank product: no skip.
  const guessed = await enrichWith({
    ...baseRow,
    brand: 'Techcombank',
    model: 'Tiet kiem',
    name: 'Techcombank gui tiet kiem',
    specifications: {},
  });
  assert.equal(guessed.aiCalls, 1);
  // A phone master with a partial camera group still gets its call.
  const partial = await enrichWith({
    ...baseRow,
    brand: 'Apple',
    model: 'iPhone 16',
    name: 'Apple iPhone 16',
    specifications: {
      category_slug: 'smartphones',
      design: { colors: ['Black'] },
      display: { size_inch: 6.1 },
      hardware: { chipset: 'A18' },
      battery: { capacity_mah: 3500 },
      camera: { rear_setup: 'Dual Camera' },
      connectivity: { nfc: true },
      cellular: { has_5g: true },
      multimedia: { loudspeaker: 'Stereo' },
    },
  });
  assert.equal(partial.aiCalls, 1);
});
