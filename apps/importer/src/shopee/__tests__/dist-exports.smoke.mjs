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
  'sanitizeSpecifications',
  'AiReviewAnalyzer',
  'computeReviewWeight',
  'ShopeeIngestionPipeline',
]) {
  assert.equal(
    typeof crawlers[name],
    'function',
    `@repo/crawlers is missing export ${name}`
  );
}

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

const { ProductSpecificationsSchema } = await import('@repo/shared-data');
assert.equal(
  typeof ProductSpecificationsSchema?.safeParse,
  'function',
  '@repo/shared-data is broken'
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
  'dist/shopee/arena-spec-syncer.d.ts',
]) {
  assert.ok(fs.existsSync(pkgDir + dts), `Missing type declarations: ${dts}`);
}

console.log(
  '✅ @repo/crawlers & @repo/shared-data dist entry points resolve by package name.'
);
