/**
 * Business rules about prices (DOS/Rate#1089) and catalog keys
 * (DOS/Rate#1149), shared by rate.vn, the importer and the crawlers.
 * Plain functions and constants only: no zod and
 * no Supabase client, so client components can import
 * `@repo/shared-data/rules` without pulling either into the bundle.
 */
export { MAX_VALID_VND_PRICE } from './price-limits.js';
export * from './offer-plausibility.js';
export * from './listing-price-floor.js';
export * from './spec-template.js';
export * from './model-key.js';
