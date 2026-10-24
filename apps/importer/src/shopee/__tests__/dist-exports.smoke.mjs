/**
 * Smoke test for the built @repo/crawlers & @repo/shared-data entry points.
 * Imports by package name (Node self-reference via "exports"), the same way
 * DOS/Rate-Services consumes the engine from its vendor/rate checkout.
 * Run after `pnpm --filter @repo/shared-data build && pnpm --filter @repo/crawlers build`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const crawlers = await import('@repo/crawlers');
for (const name of [
  'ProductNormalizer',
  'detectCategorySlug',
  'EntityMatcher',
  'AiSpecEnricher',
  'getAiSpecEnrichmentJsonSchema',
  'sanitizeSpecifications',
  'mergeProductSpecifications',
  'cloneAiEnrichmentResponse',
  'AiReviewAnalyzer',
  'getAiReviewBatchJsonSchema',
  'computeReviewWeight',
  'ShopeeIngestionPipeline',
  'createImporterLogger',
  'sanitizeAiGeneratedText',
  'computeRetryDelayMs',
]) {
  assert.equal(
    typeof crawlers[name],
    'function',
    `@repo/crawlers is missing export ${name}`
  );
}
assert.equal(
  typeof crawlers.MAX_SPEC_CACHE_ENTRIES,
  'number',
  '@repo/crawlers is missing export MAX_SPEC_CACHE_ENTRIES'
);

const { createImporterLogger } =
  await import('@repo/crawlers/shopee/logger');
assert.equal(
  typeof createImporterLogger,
  'function',
  'logger subpath export is broken'
);

const { ArenaSpecSyncer } =
  await import('@repo/crawlers/shopee/arena-spec-syncer');
assert.equal(
  typeof ArenaSpecSyncer,
  'function',
  'ArenaSpecSyncer subpath export is broken'
);

const { FLAGSHIP_DEVICES_TO_SEED } =
  await import('@repo/crawlers/shopee/flagship-seed-data');
assert.ok(
  FLAGSHIP_DEVICES_TO_SEED.length > 0,
  'flagship-seed-data subpath export is empty'
);

const { runMasterSpecsBackfill, auditMasterSpecs } =
  await import('@repo/crawlers/shopee/jobs/backfill-specs');
assert.equal(
  typeof runMasterSpecsBackfill,
  'function',
  'runMasterSpecsBackfill subpath export is broken'
);
assert.equal(
  typeof auditMasterSpecs,
  'function',
  'auditMasterSpecs subpath export is broken'
);

const {
  ProductSpecificationsSchema,
  HttpUrlSchema,
  isValidSupabaseHttpUrl,
  isValidSupabaseApiKey,
  seedingRiskPenalty,
} = await import('@repo/shared-data');
assert.equal(
  typeof ProductSpecificationsSchema?.safeParse,
  'function',
  '@repo/shared-data is broken'
);
assert.equal(
  HttpUrlSchema.safeParse('https://shopee.vn/item-i.1.2').success,
  true
);
assert.equal(
  HttpUrlSchema.safeParse('https://user:pass@shopee.vn/item-i.1.2').success,
  false,
  'HttpUrlSchema must reject embedded URL credentials'
);
assert.equal(
  HttpUrlSchema.safeParse('https://shopee.vn/item\u0000-i.1.2').success,
  false,
  'HttpUrlSchema must reject control characters'
);
assert.equal(
  isValidSupabaseHttpUrl('https://example.supabase.co'),
  true
);
assert.equal(
  isValidSupabaseHttpUrl('https://user:pass@example.supabase.co'),
  false,
  'isValidSupabaseHttpUrl must reject embedded credentials'
);
assert.equal(
  isValidSupabaseHttpUrl('https://example.supabase.co?x=1'),
  false,
  'isValidSupabaseHttpUrl must reject query strings'
);
assert.equal(
  isValidSupabaseApiKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.valid'),
  true
);
assert.equal(
  isValidSupabaseApiKey('bad key with spaces'),
  false,
  'isValidSupabaseApiKey must reject whitespace'
);
assert.equal(
  isValidSupabaseApiKey('short'),
  false,
  'isValidSupabaseApiKey must reject too-short keys'
);
assert.equal(
  seedingRiskPenalty(true, 10),
  0,
  'seedingRiskPenalty must reject non-number arguments'
);

// Scripts that execute on import (test-ai-enricher, test-review-analyzer,
// run-ingestion-test) must stay private. Resolve only, never import them.
for (const script of [
  'test-ai-enricher',
  'test-review-analyzer',
  'run-ingestion-test',
]) {
  assert.throws(
    () => import.meta.resolve(`@repo/crawlers/shopee/${script}`),
    { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
    `@repo/crawlers/shopee/${script} must not be exported`
  );
}

// Type declarations must ship with the entry points.
const require = createRequire(import.meta.url);
const pkgDir = require
  .resolve('@repo/crawlers/package.json')
  .replace(/package\.json$/, '');
for (const dts of [
  'dist/index.d.ts',
  'dist/shopee/types.d.ts',
  'dist/shopee/logger.d.ts',
  'dist/shopee/arena-spec-syncer.d.ts',
  'dist/shopee/flagship-seed-data.d.ts',
  'dist/shopee/jobs/backfill-specs.d.ts',
]) {
  assert.ok(fs.existsSync(pkgDir + dts), `Missing type declarations: ${dts}`);
}

console.log(
  '✅ @repo/crawlers & @repo/shared-data dist entry points resolve by package name.'
);

