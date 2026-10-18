/**
 * @repo/importer — Open-Core Normalization, 3-Tier Deduplication & AI Spec Enricher Engine
 * Note: Proprietary anti-detect scrapers, proxy rotators, and queue workers live in private repo DOS/Rate-Services.
 */

export * from './shopee/types.js';
export * from './shopee/logger.js';
export * from './shopee/product-normalizer.js';
export * from './shopee/entity-matcher.js';
export * from './shopee/ai-spec-enricher.js';
export * from './shopee/ai-review-analyzer.js';
export * from './shopee/shopee-to-supabase.js';
export * from './shopee/jobs/backfill-specs.js';
export * from './shopee/paging.js';
