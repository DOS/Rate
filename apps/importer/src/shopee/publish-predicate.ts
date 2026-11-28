/**
 * Publish predicate for sourced electronics drafts (DOS/Rate#1996).
 *
 * JOY approved on 2026-11-28 (DOS/Rate-Services#1386, plan on #1389): a draft master is
 * publishable when its seed is fully sourced AND it has at least {@link MIN_PUBLISH_CHAINS}
 * priced, in-stock listings from distinct chains, each priced above the category floor.
 *
 * Everything here is pure: no database, no network, no clock. DOS/Rate-Services consumes it
 * through `vendor/rate` (`@repo/crawlers` or `@repo/crawlers/shopee/publish-predicate`) from
 * its price-spread auditor and does the read and the `status` write itself.
 *
 * "Fully sourced" means the master's model_key belongs to a `flagship-seed-sourced-*` seed
 * and every spec group that seed fills carries an https source URL (the group, or one of its
 * fields). A model with no sourced seed is never publishable, whatever its listings.
 */
import { MAX_VALID_VND_PRICE } from '@repo/shared-data';
import type { FlagshipDeviceSeed } from './flagship-seed-data.js';
import { SOURCED_SEEDS_2025 } from './flagship-seed-sourced-2025.js';
import { SOURCED_SEEDS_2026 } from './flagship-seed-sourced-2026.js';
import { SOURCED_SEEDS_IPHONE_17E } from './flagship-seed-sourced-iphone-17e.js';

/** Distinct chains a draft needs before it may publish. */
export const MIN_PUBLISH_CHAINS = 2;

/**
 * Every `flagship-seed-sourced-*` seed list. A new sourced seed file must be added here; the
 * tests fail when a file's exported seed list is missing.
 */
export const SOURCED_SEED_SETS: readonly (readonly FlagshipDeviceSeed[])[] = [
  SOURCED_SEEDS_2025,
  SOURCED_SEEDS_2026,
  SOURCED_SEEDS_IPHONE_17E,
];

/** The minimal seed shape the provenance check reads. */
export type SeedProvenance = Pick<FlagshipDeviceSeed, 'model_key' | 'specifications' | 'sources'>;

/** Spec keys that are metadata, not spec groups, so they need no source. */
const NON_GROUP_SPEC_KEYS: ReadonlySet<string> = new Set(['category_slug']);

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

/** The spec groups a seed fills (metadata keys and unset groups excluded). */
function filledSpecGroups(seed: SeedProvenance): string[] {
  return Object.entries(seed.specifications ?? {})
    .filter(
      ([key, value]) => !NON_GROUP_SPEC_KEYS.has(key) && value !== undefined && value !== null
    )
    .map(([key]) => key);
}

/** The filled spec groups of a seed that no https source covers (empty = fully sourced). */
export function unsourcedSpecGroups(seed: SeedProvenance): string[] {
  const urlPaths = Object.entries(seed.sources ?? {})
    .filter(([, url]) => isHttpsUrl(url))
    .map(([path]) => path);
  return filledSpecGroups(seed).filter(
    group => !urlPaths.some(path => path === group || path.startsWith(`${group}.`))
  );
}

/** True when the seed fills at least one spec group and every filled group has a source URL. */
export function isFullySourcedSeed(seed: SeedProvenance): boolean {
  return filledSpecGroups(seed).length > 0 && unsourcedSpecGroups(seed).length === 0;
}

/**
 * True when `modelKey` comes from a fully sourced `flagship-seed-sourced-*` seed. Pass `seeds`
 * to check another list (tests, or seeds not yet registered); the default is
 * {@link SOURCED_SEED_SETS}. The key compares trimmed and case-insensitive.
 */
export function isSourcedSeedModelKey(
  modelKey: string,
  seeds: readonly SeedProvenance[] = SOURCED_SEED_SETS.flat()
): boolean {
  if (typeof modelKey !== 'string') return false;
  const key = modelKey.trim().toLowerCase();
  if (key === '') return false;
  const matches = seeds.filter(seed => seed.model_key.trim().toLowerCase() === key);
  return matches.length > 0 && matches.every(isFullySourcedSeed);
}

/**
 * A listing as `rate.products` stores it; only the fields the predicate reads. The caller's
 * SELECT must include `platform`, `price_current`, `currency`, `availability`, `origin` and
 * `stock`: a missing `availability` counts as not in stock, so nothing would publish.
 */
export interface PublishListing {
  /** Retail platform, e.g. "fptshop", "hoanghamobile" or "shopee". */
  readonly platform?: string | null;
  /** Explicit chain key; wins over `platform` when the caller maps merchants to chains. */
  readonly chain?: string | null;
  readonly price_current: number | string | null;
  readonly currency?: string | null;
  readonly availability?: string | null;
  /** Units in stock; null/undefined when the page does not show it. */
  readonly stock?: number | string | null;
  /** `rate.products.origin`; null/undefined counts as a crawl, any other value is excluded. */
  readonly origin?: string | null;
}

export type PublishBlocker = 'seed_not_sourced' | 'invalid_price_floor' | 'insufficient_chains';

export interface PublishDecision {
  readonly publishable: boolean;
  /** Empty when publishable; otherwise every rule that failed. */
  readonly blockers: readonly PublishBlocker[];
  /** Sorted, distinct chain keys with a qualifying listing. */
  readonly chains: readonly string[];
  readonly seedSourced: boolean;
  readonly qualifyingListingCount: number;
  /** One short English sentence for logs and audit reports. */
  readonly reason: string;
}

export interface PublishPredicateInput {
  readonly master: { readonly model_key: string };
  readonly listings: readonly PublishListing[];
  /** Category price floor in VND: a listing counts only when priced strictly above it. */
  readonly categoryPriceFloor: number;
  /** Override the seed lookup (default {@link SOURCED_SEED_SETS}). */
  readonly seeds?: readonly SeedProvenance[];
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function chainKey(listing: PublishListing): string | null {
  for (const raw of [listing.chain, listing.platform]) {
    if (typeof raw === 'string' && raw.trim() !== '') return raw.trim().toLowerCase();
  }
  return null;
}

/** Priced above the floor (and below the VND sanity cap), in stock, a crawl, VND. */
function qualifies(listing: PublishListing, floor: number): boolean {
  if (listing.origin !== undefined && listing.origin !== null && listing.origin !== 'crawl') {
    return false;
  }
  if (listing.currency !== undefined && listing.currency !== null && listing.currency !== 'VND') {
    return false;
  }
  if (listing.availability !== 'in_stock') return false;
  if (listing.stock !== undefined && listing.stock !== null) {
    const stock = toFiniteNumber(listing.stock);
    if (stock === null || stock <= 0) return false;
  }
  const price = toFiniteNumber(listing.price_current);
  return price !== null && price > 0 && price > floor && price <= MAX_VALID_VND_PRICE;
}

/** Sorted distinct chain keys that have at least one qualifying listing. */
export function qualifyingChains(
  listings: readonly PublishListing[],
  categoryPriceFloor: number
): string[] {
  if (!Number.isFinite(categoryPriceFloor) || categoryPriceFloor < 0) return [];
  const chains = new Set<string>();
  for (const listing of listings) {
    if (!qualifies(listing, categoryPriceFloor)) continue;
    const chain = chainKey(listing);
    if (chain !== null) chains.add(chain);
  }
  return [...chains].sort();
}

/**
 * Whether a draft electronics master may publish: a fully sourced seed AND at least
 * {@link MIN_PUBLISH_CHAINS} distinct chains with a priced, in-stock listing above the
 * category floor. Two listings of one chain count once.
 */
export function evaluateElectronicsDraftPublish(input: PublishPredicateInput): PublishDecision {
  const floor = input.categoryPriceFloor;
  const floorValid = Number.isFinite(floor) && floor >= 0;
  const seedSourced = isSourcedSeedModelKey(input.master.model_key, input.seeds);
  const chains = qualifyingChains(input.listings, floor);
  const qualifyingListingCount = floorValid
    ? input.listings.filter(l => qualifies(l, floor) && chainKey(l) !== null).length
    : 0;

  const blockers: PublishBlocker[] = [];
  if (!seedSourced) blockers.push('seed_not_sourced');
  if (!floorValid) blockers.push('invalid_price_floor');
  else if (chains.length < MIN_PUBLISH_CHAINS) blockers.push('insufficient_chains');

  const messages: Record<PublishBlocker, string> = {
    seed_not_sourced: 'model_key is not from a fully sourced seed',
    invalid_price_floor: 'category price floor is not a finite number >= 0',
    insufficient_chains: `${chains.length} of ${MIN_PUBLISH_CHAINS} required chains have a priced, in-stock listing above the floor`,
  };
  return {
    publishable: blockers.length === 0,
    blockers,
    chains,
    seedSourced,
    qualifyingListingCount,
    reason:
      blockers.length === 0
        ? `sourced seed and ${chains.length} chains with priced, in-stock listings`
        : blockers.map(b => messages[b]).join('; '),
  };
}

/** Boolean shorthand for {@link evaluateElectronicsDraftPublish}. */
export function isDraftPublishable(input: PublishPredicateInput): boolean {
  return evaluateElectronicsDraftPublish(input).publishable;
}
