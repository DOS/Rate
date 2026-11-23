/**
 * Zero-DDL Proactive Price-Drop & 90-Day ATL Email Alert Digest Worker (DOS/Rate#1874)
 *
 * Usage:
 *   pnpm --filter @repo/crawlers alerts:digest                     (Read-only --dry-run, default)
 *   pnpm --filter @repo/crawlers alerts:digest -- --dry-run        (Explicit read-only dry-run)
 *   pnpm --filter @repo/crawlers alerts:digest -- --apply          (Send Resend emails + update last_triggered_at)
 *   pnpm --filter @repo/crawlers alerts:digest -- --limit=200      (Cap dispatched alerts per run, 1..500)
 *
 * Safety & Least-Privilege Invariants:
 * - Defaults to `--dry-run` (computes eligible alerts, logs structured JSON summary, sends 0 emails,
 *   writes 0 DB updates).
 * - Passing both `--dry-run` and `--apply` fails closed (`throw` / exit 1), matching `backfill-specs.ts` (#1854).
 * - Signs in via least-privilege `getWorkerRateClient()` (`rate_worker`: `SELECT` on `rate.price_alerts`
 *   and column-scoped `UPDATE (last_triggered_at, updated_at)`), never requiring `SUPABASE_SECRET_KEY`.
 * - Evaluates offers strictly through `plausibleOffers` (`@repo/shared-data/rules`) on published
 *   `master_products` (`in_stock` plausible offers only - never triggers on bait listings, out-of-stock
 *   listings, drafts, archived products, or `price <= 0`).
 * - Updates `last_triggered_at` + `updated_at` for an alert ONLY after Resend returns HTTP 2xx.
 */
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MAX_VALID_VND_PRICE,
  implausiblyLowOfferIds,
  isImplausiblyLowPrice,
  isOfferImplausiblyLowAgainstInStock,
  plausibleOffers,
} from '@repo/shared-data/rules';
import {
  assertValidAlertUnsubscribeSecret,
  normalizeAlertSubscriberEmail,
  signAlertUnsubscribeToken,
} from '../alert-unsubscribe-token.js';
import {
  DEFAULT_RATE_SITE_ORIGIN,
  fetchResendUnsubscribedEmails,
  normalizeAlertLocale,
  sendPriceAlertEmail,
  stripHeaderCrLf,
  validateHttpsSiteOrigin,
  validateHttpsUrl,
  validateResendApiKey,
  validateResendAudienceId,
  validateSenderFromAddress,
  type AlertLocale,
  type SendPriceAlertEmailInput,
  type SendPriceAlertEmailResult,
} from '../alert-mailer.js';
import { createImporterLogger } from '../logger.js';
import {
  fetchByKey,
  resolveBackfillSupabaseTarget,
  STRICT_UUID_REGEX,
  type KeysetFilter,
} from '../paging.js';
import { detectCategorySlug, type CanonicalCategorySlug } from '../product-normalizer.js';
import { scopeSupabaseToRate, type RateSupabaseClient } from '../types.js';

const logger = createImporterLogger('PriceAlertsDigestJob');

export const DEFAULT_ALERT_DIGEST_LIMIT = 100;
export const MAX_ALERT_DIGEST_LIMIT = 500;
export const ALERT_COOLDOWN_DAYS = 7;
export const ALERT_COOLDOWN_MS = ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
export const ALERT_ATL_WINDOW_DAYS = 90;
export const ALERT_ATL_WINDOW_MS = ALERT_ATL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const IN_QUERY_CHUNK_SIZE = 150;

const CANONICAL_CATEGORY_SLUGS = new Set<CanonicalCategorySlug>([
  'smartphones',
  'tablets',
  'laptops',
  'smartwatches',
  'earbuds',
]);

const SAFE_PRODUCT_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/;
const RESERVED_SLUG_RE = /^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i;

export interface PriceAlertsDigestArgs {
  readonly apply: boolean;
  readonly dryRun: boolean;
  readonly limit: number;
}

export interface PriceAlertRow {
  readonly id: string;
  readonly master_product_id: string;
  readonly subscriber_email: string | null;
  readonly target_price: number | string;
  readonly price_when_created?: number | string | null;
  readonly locale?: string | null;
  readonly is_active: boolean;
  readonly last_triggered_at: string | null;
  readonly created_at?: string | null;
  readonly updated_at?: string | null;
}

export interface AlertMasterProductRow {
  readonly id: string;
  readonly slug: string | null;
  readonly name: string | null;
  readonly model?: string | null;
  readonly status: string | null;
  readonly category_id?: string | null;
  readonly metadata?: unknown;
  readonly specifications?: unknown;
}

export interface AlertCategoryRow {
  readonly id: string;
  readonly slug: string;
}

export interface AlertProductOfferRow {
  readonly id: string;
  readonly cluster_id: string | null;
  readonly merchant_id: string | null;
  readonly platform?: string | null;
  readonly title?: string | null;
  readonly price_current: number | string;
  readonly availability: string | null;
  readonly stock?: number | string | null;
  readonly origin?: string | null;
}

export interface AlertMerchantRow {
  readonly id: string;
  readonly name: string | null;
  readonly platform?: string | null;
  readonly is_official?: boolean | null;
  readonly archived_at?: string | null;
}

export interface AlertPriceHistoryRow {
  readonly id: number | string;
  readonly product_id: string;
  readonly price: number | string;
  readonly recorded_at: string;
}

export interface EligiblePriceAlertCandidate {
  readonly alertId: string;
  readonly masterProductId: string;
  readonly subscriberEmail: string;
  readonly locale: AlertLocale;
  readonly targetPrice: number;
  readonly bestPrice: number;
  readonly bestOfferId: string;
  readonly merchantName: string;
  readonly productName: string;
  readonly productUrl: string;
  readonly isAllTimeLow90d: boolean;
  readonly observed90dFloor: number | null;
}

export interface PriceAlertsDigestOptions {
  readonly apply?: boolean;
  readonly dryRun?: boolean;
  readonly limit?: number;
  readonly now?: Date;
  readonly siteOrigin?: string;
  readonly unsubscribeSecret?: string;
  readonly resendApiKey?: string;
  readonly fromEmail?: string;
  readonly audienceId?: string;
  readonly unsubscribedEmails?: ReadonlySet<string>;
  readonly fetchImpl?: typeof fetch;
  readonly sendEmail?: (input: SendPriceAlertEmailInput) => Promise<SendPriceAlertEmailResult>;
  readonly fetchUnsubscribed?: (opts: {
    readonly resendApiKey: string;
    readonly audienceId: string;
    readonly fetchImpl?: typeof fetch;
  }) => Promise<Set<string>>;
}

export interface PriceAlertsDigestSummary {
  readonly mode: 'dry-run' | 'apply';
  readonly apply: boolean;
  readonly limit: number;
  readonly scannedAlerts: number;
  readonly skippedInactiveOrInvalid: number;
  readonly skippedCooldown: number;
  readonly skippedUnpublishedOrNoOffer: number;
  readonly skippedAboveTarget: number;
  readonly skippedUnsubscribed: number;
  readonly eligibleAlerts: number;
  readonly plannedAlerts: number;
  readonly emailsSent: number;
  readonly emailsFailed: number;
  readonly dbUpdatesSucceeded: number;
  readonly dbUpdatesFailed: number;
  readonly atl90dCount: number;
  readonly candidates: readonly EligiblePriceAlertCandidate[];
}

export type WorkerRateClient = RateSupabaseClient & {
  readonly host: string;
  readonly signOut: () => Promise<void>;
};

export interface WorkerClientDeps {
  readonly createSupabaseClient?: (
    url: string,
    key: string,
    options: {
      auth: {
        persistSession: boolean;
        autoRefreshToken: boolean;
        detectSessionInUrl: boolean;
      };
    }
  ) => SupabaseClient;
}

function validateStrictLimit(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw < 1 || raw > MAX_ALERT_DIGEST_LIMIT) {
      throw new Error(
        `--limit must be an integer between 1 and ${MAX_ALERT_DIGEST_LIMIT} (got ${String(raw)}).`
      );
    }
    return raw;
  }
  if (typeof raw === 'string') {
    if (!/^[1-9]\d*$/.test(raw)) {
      throw new Error(
        `--limit must be an integer between 1 and ${MAX_ALERT_DIGEST_LIMIT} (got ${JSON.stringify(raw)}).`
      );
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_ALERT_DIGEST_LIMIT) {
      throw new Error(
        `--limit must be an integer between 1 and ${MAX_ALERT_DIGEST_LIMIT} (got ${JSON.stringify(raw)}).`
      );
    }
    return parsed;
  }
  throw new Error(`--limit must be an integer between 1 and ${MAX_ALERT_DIGEST_LIMIT}.`);
}

/**
 * Strictly parses CLI arguments for `price-alerts-digest.ts`.
 * Rejects `--dry-run` + `--apply` in either order, repeated flags, unknown flags, and malformed `--limit`.
 */
export function parsePriceAlertsDigestArgs(argv: readonly string[]): PriceAlertsDigestArgs {
  if (!Array.isArray(argv)) {
    throw new Error('CLI argv must be an array.');
  }
  let applySeen = false;
  let dryRunSeen = false;
  let limitRaw: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      if (applySeen) throw new Error('--apply is repeated.');
      applySeen = true;
      continue;
    }
    if (arg === '--dry-run') {
      if (dryRunSeen) throw new Error('--dry-run is repeated.');
      dryRunSeen = true;
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      if (limitRaw !== undefined) throw new Error('--limit is repeated.');
      const val = arg === '--limit' ? argv[++i] : arg.slice('--limit='.length);
      if (val === undefined || val === '' || (arg === '--limit' && val.startsWith('--'))) {
        throw new Error(`--limit requires an integer between 1 and ${MAX_ALERT_DIGEST_LIMIT}.`);
      }
      limitRaw = val;
      continue;
    }
    throw new Error(
      `Unknown CLI argument ${JSON.stringify(arg)}: expected --dry-run, --apply, or --limit=<1..${MAX_ALERT_DIGEST_LIMIT}>.`
    );
  }

  if (applySeen && dryRunSeen) {
    throw new Error('--dry-run does not combine with --apply.');
  }

  const limit = limitRaw === undefined ? DEFAULT_ALERT_DIGEST_LIMIT : validateStrictLimit(limitRaw);

  return {
    apply: applySeen,
    dryRun: !applySeen,
    limit,
  };
}

/**
 * Authenticates as the least-privilege `rate_worker` Supabase Auth account using the
 * publishable/anon key (never requiring `SUPABASE_SECRET_KEY`), verifies role === 'rate_worker',
 * and returns a client scoped to schema `rate`.
 */
export async function getWorkerRateClient(
  env: NodeJS.ProcessEnv = process.env,
  deps: WorkerClientDeps = {}
): Promise<WorkerRateClient> {
  const safeEnv = env && typeof env === 'object' ? env : {};
  const rawUrl = safeEnv.SUPABASE_URL || safeEnv.NEXT_PUBLIC_SUPABASE_URL || '';
  const publishableKey = (
    safeEnv.SUPABASE_PUBLISHABLE_KEY ||
    safeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    safeEnv.SUPABASE_ANON_KEY ||
    ''
  ).trim();
  const email = (safeEnv.RATE_WORKER_EMAIL || '').trim();
  const password = safeEnv.RATE_WORKER_PASSWORD || '';

  if (!rawUrl.trim() || !publishableKey || !email || !password) {
    throw new Error(
      'Missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, RATE_WORKER_EMAIL, or RATE_WORKER_PASSWORD in environment.'
    );
  }

  const { url, host } = resolveBackfillSupabaseTarget(rawUrl);
  const factory = deps.createSupabaseClient ?? (await import('@supabase/supabase-js')).createClient;

  const client = factory(url, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !auth?.session) {
    throw new Error(
      `Sign-in as rate_worker failed: ${authError?.message ?? 'no session returned'}`
    );
  }

  const signOut = async (): Promise<void> => {
    await client.auth.signOut().catch(() => undefined);
  };

  try {
    const role = typeof auth.user?.role === 'string' ? auth.user.role.trim() : '';
    if (role !== 'rate_worker') {
      throw new Error(
        `Signed-in user has role '${role || 'unknown'}', expected 'rate_worker'; refusing to run.`
      );
    }

    const scoped = scopeSupabaseToRate(client);
    Object.defineProperties(scoped, {
      host: { value: host, enumerable: false, configurable: true },
      signOut: { value: signOut, enumerable: false, configurable: true },
    });
    return scoped as WorkerRateClient;
  } catch (err) {
    await signOut();
    throw err;
  }
}

function parseSafeVndNumber(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw > MAX_VALID_VND_PRICE) return NaN;
    const rounded = Math.round(raw);
    return rounded >= 1 && rounded <= MAX_VALID_VND_PRICE ? parsedToSafe(raw) : NaN;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return NaN;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed) || parsed > MAX_VALID_VND_PRICE) return NaN;
    const rounded = Math.round(parsed);
    return rounded >= 1 && rounded <= MAX_VALID_VND_PRICE ? parsed : NaN;
  }
  return NaN;
}

function parsedToSafe(value: number): number {
  return value;
}

/**
 * Enforces the 7-day alert cooldown (`last_triggered_at IS NULL OR last_triggered_at <= now - 7d`).
 * Malformed `now` or `last_triggered_at` timestamps fail closed (`false`).
 */
export function isAlertPastCooldown(
  lastTriggeredAt: string | null | undefined,
  now: Date
): boolean {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  if (lastTriggeredAt === null || lastTriggeredAt === undefined) return true;
  if (typeof lastTriggeredAt !== 'string' || !lastTriggeredAt.trim()) return false;
  const triggeredMs = Date.parse(lastTriggeredAt);
  if (!Number.isFinite(triggeredMs)) return false;
  return triggeredMs <= now.getTime() - ALERT_COOLDOWN_MS;
}

function extractCategoryHint(value: unknown): CanonicalCategorySlug | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = (value as { category_slug?: unknown }).category_slug;
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .toLowerCase() as CanonicalCategorySlug;
  return CANONICAL_CATEGORY_SLUGS.has(cleaned) ? cleaned : null;
}

function resolveMasterCategorySlug(
  master: AlertMasterProductRow,
  categorySlugById: ReadonlyMap<string, string>
): CanonicalCategorySlug {
  const fromCategoryTable = master.category_id
    ? categorySlugById.get(master.category_id)?.trim().toLowerCase()
    : undefined;
  if (
    fromCategoryTable &&
    CANONICAL_CATEGORY_SLUGS.has(fromCategoryTable as CanonicalCategorySlug)
  ) {
    return fromCategoryTable as CanonicalCategorySlug;
  }
  const fromMeta = extractCategoryHint(master.metadata);
  if (fromMeta) return fromMeta;
  const fromSpecs = extractCategoryHint(master.specifications);
  if (fromSpecs) return fromSpecs;
  return detectCategorySlug(`${master.name ?? ''} ${master.model ?? ''} ${master.slug ?? ''}`);
}

function stripLeadingAndTrailingSlashesLinear(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 47) {
    start += 1;
  }
  while (end > start && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return start === 0 && end === value.length ? value : value.slice(start, end);
}

/**
 * Builds the canonical `https://<siteOrigin>/<category>/<slug>` product URL,
 * returning `null` if the product slug is missing, overlong (> 256 chars), or unsafe.
 */
export function buildCanonicalAlertProductUrl(
  master: AlertMasterProductRow,
  categorySlugById: ReadonlyMap<string, string>,
  siteOrigin = DEFAULT_RATE_SITE_ORIGIN
): string | null {
  const validatedOrigin = validateHttpsSiteOrigin(siteOrigin);
  if (typeof master.slug !== 'string' || master.slug.length > 300) {
    return null;
  }
  const rawSlug = stripLeadingAndTrailingSlashesLinear(master.slug.replace(/\p{Cc}+/gu, '').trim());
  if (
    !rawSlug ||
    rawSlug.length > 256 ||
    !SAFE_PRODUCT_SLUG_RE.test(rawSlug) ||
    rawSlug.endsWith('.') ||
    rawSlug.includes('..') ||
    RESERVED_SLUG_RE.test(rawSlug)
  ) {
    return null;
  }
  const categorySlug = resolveMasterCategorySlug(master, categorySlugById);
  return validateHttpsUrl(
    `${validatedOrigin}/${categorySlug}/${encodeURIComponent(rawSlug)}`,
    'productUrl'
  );
}

function chunkArray<T>(items: readonly T[], size = IN_QUERY_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function selectInByKey<T>(
  supabase: RateSupabaseClient,
  table: string,
  columns: string,
  filterColumn: string,
  values: readonly string[],
  keyColumn = 'id',
  extraFilter: KeysetFilter = q => q
): Promise<T[]> {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) return [];
  const out: T[] = [];
  for (const part of chunkArray(unique)) {
    const pageRows = await fetchByKey<T>(supabase, table, columns, keyColumn, query =>
      extraFilter(query.in(filterColumn, part))
    );
    out.push(...pageRows);
  }
  return out;
}

function isInStockOfferRow(offer: AlertProductOfferRow): boolean {
  if (offer.availability !== 'in_stock') return false;
  if ((offer.origin ?? 'crawl') !== 'crawl') return false;
  if (offer.stock !== null && offer.stock !== undefined) {
    const stockNum =
      typeof offer.stock === 'number'
        ? offer.stock
        : typeof offer.stock === 'string' && offer.stock.trim() !== ''
          ? Number(offer.stock.trim())
          : NaN;
    if (!Number.isFinite(stockNum) || stockNum <= 0) return false;
  }
  return true;
}

interface MasterBestOfferEvaluation {
  readonly bestPrice: number;
  readonly bestOfferId: string;
  readonly merchantName: string;
  readonly isAllTimeLow90d: boolean;
  readonly observed90dFloor: number | null;
  readonly productName: string;
  readonly productUrl: string;
}

function formatPlatformFallbackName(platform: unknown): string {
  const clean = stripHeaderCrLf(platform, 64);
  return clean ? `${clean} Store` : 'Verified Store';
}

function evaluatePublishedMasterOffers(input: {
  readonly master: AlertMasterProductRow;
  readonly offers: readonly AlertProductOfferRow[];
  readonly merchantById: ReadonlyMap<string, AlertMerchantRow>;
  readonly historyByProductId: ReadonlyMap<string, readonly AlertPriceHistoryRow[]>;
  readonly categorySlugById: ReadonlyMap<string, string>;
  readonly siteOrigin: string;
  readonly nowMs: number;
}): MasterBestOfferEvaluation | null {
  const { master } = input;
  if (master.status !== 'published') return null;

  const productUrl = buildCanonicalAlertProductUrl(
    master,
    input.categorySlugById,
    input.siteOrigin
  );
  if (!productUrl) return null;

  const productName = stripHeaderCrLf(master.name, 180);
  if (!productName) return null;

  interface PricedOfferCandidate {
    readonly id: string;
    readonly price_current: number;
    readonly merchantName: string;
    readonly isOfficial: boolean;
  }

  const allClusterOffers: Array<{
    readonly id: string;
    readonly price_current: number;
    readonly availability: string | null;
  }> = [];
  const inStockCandidates: PricedOfferCandidate[] = [];

  for (const row of input.offers) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    if (typeof row.id !== 'string' || !row.id.trim()) continue;
    if ((row.origin ?? 'crawl') !== 'crawl') continue;
    const price = parseSafeVndNumber(row.price_current);
    if (!Number.isFinite(price)) continue;

    const merchant = row.merchant_id ? input.merchantById.get(row.merchant_id) : undefined;
    if (merchant && merchant.archived_at !== null && merchant.archived_at !== undefined) {
      continue;
    }

    allClusterOffers.push({
      id: row.id,
      price_current: price,
      availability: row.availability,
    });

    if (!isInStockOfferRow(row)) continue;

    const merchantName =
      stripHeaderCrLf(merchant?.name, 140) ||
      formatPlatformFallbackName(merchant?.platform ?? row.platform);
    inStockCandidates.push({
      id: row.id,
      price_current: price,
      merchantName,
      isOfficial: merchant?.is_official === true,
    });
  }

  if (inStockCandidates.length === 0) return null;

  const plausibleInStock = plausibleOffers(inStockCandidates);
  if (plausibleInStock.length === 0) return null;

  const sortedBest = [...plausibleInStock].sort((a, b) => {
    if (a.price_current !== b.price_current) return a.price_current - b.price_current;
    if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const best = sortedBest[0]!;

  // Compute 90-day observed floor across crawled, non-bait listings of this master product.
  const inStockBaitIds = implausiblyLowOfferIds(inStockCandidates);
  const nonBaitListingIds = new Set<string>();
  for (const listing of allClusterOffers) {
    if (!isOfferImplausiblyLowAgainstInStock(listing, inStockCandidates, inStockBaitIds)) {
      nonBaitListingIds.add(listing.id);
    }
  }

  const windowStartMs = input.nowMs - ALERT_ATL_WINDOW_MS;
  const windowEndMs = input.nowMs + FUTURE_CLOCK_SKEW_MS;
  let observed90dFloor: number | null = null;

  for (const productId of nonBaitListingIds) {
    const historyRows = input.historyByProductId.get(productId);
    if (!historyRows) continue;
    for (const obs of historyRows) {
      if (!obs || typeof obs !== 'object') continue;
      const obsPrice = parseSafeVndNumber(obs.price);
      if (!Number.isFinite(obsPrice)) continue;
      const recordedMs = typeof obs.recorded_at === 'string' ? Date.parse(obs.recorded_at) : NaN;
      if (!Number.isFinite(recordedMs) || recordedMs < windowStartMs || recordedMs > windowEndMs) {
        continue;
      }
      if (isImplausiblyLowPrice(obsPrice, plausibleInStock)) {
        continue;
      }
      if (observed90dFloor === null || obsPrice < observed90dFloor) {
        observed90dFloor = obsPrice;
      }
    }
  }

  const roundedBestPrice = Math.round(best.price_current);
  const roundedFloor = observed90dFloor !== null ? Math.round(observed90dFloor) : null;
  const isAllTimeLow90d = roundedFloor !== null && roundedBestPrice <= roundedFloor;

  return {
    bestPrice: roundedBestPrice,
    bestOfferId: best.id,
    merchantName: best.merchantName,
    isAllTimeLow90d,
    observed90dFloor: roundedFloor,
    productName,
    productUrl,
  };
}

/**
 * Evaluates active price alerts past the 7-day cooldown and dispatches localized emails
 * when `apply === true` (`--apply`), or logs a read-only structured summary in `--dry-run` mode.
 */
export async function runPriceAlertsDigest(
  supabase: RateSupabaseClient,
  options: PriceAlertsDigestOptions = {}
): Promise<PriceAlertsDigestSummary> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Digest options must be an object.');
  }
  if (options.apply === true && options.dryRun === true) {
    throw new Error('--dry-run does not combine with --apply.');
  }

  const apply = options.apply === true;
  const mode: 'dry-run' | 'apply' = apply ? 'apply' : 'dry-run';
  const limit =
    options.limit === undefined ? DEFAULT_ALERT_DIGEST_LIMIT : validateStrictLimit(options.limit);

  const now = options.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('options.now must be a valid Date.');
  }
  const nowMs = now.getTime();
  const siteOrigin = validateHttpsSiteOrigin(options.siteOrigin ?? DEFAULT_RATE_SITE_ORIGIN);

  let unsubscribeSecret = '';
  let resendApiKey = '';
  let fromEmail = '';
  const rawAudienceId = typeof options.audienceId === 'string' ? options.audienceId.trim() : '';
  const audienceId = rawAudienceId ? validateResendAudienceId(options.audienceId) : '';

  if (apply) {
    assertValidAlertUnsubscribeSecret(options.unsubscribeSecret);
    unsubscribeSecret = options.unsubscribeSecret!.trim();
    resendApiKey = validateResendApiKey(options.resendApiKey);
    fromEmail = validateSenderFromAddress(options.fromEmail);
  }

  // Build lowercase suppression Set<string> before sending any email.
  const unsubscribedSet = new Set<string>();
  if (options.unsubscribedEmails) {
    for (const addr of options.unsubscribedEmails) {
      const normalized = normalizeAlertSubscriberEmail(addr);
      if (normalized) unsubscribedSet.add(normalized);
    }
  }
  if (audienceId) {
    const fetchUnsubFn = options.fetchUnsubscribed ?? fetchResendUnsubscribedEmails;
    if (apply) {
      const remoteUnsub = await fetchUnsubFn({
        resendApiKey,
        audienceId,
        fetchImpl: options.fetchImpl,
      });
      for (const addr of remoteUnsub) {
        const normalized = normalizeAlertSubscriberEmail(addr);
        if (normalized) unsubscribedSet.add(normalized);
      }
    } else if (typeof options.resendApiKey === 'string' && options.resendApiKey.trim()) {
      try {
        const remoteUnsub = await fetchUnsubFn({
          resendApiKey: validateResendApiKey(options.resendApiKey),
          audienceId,
          fetchImpl: options.fetchImpl,
        });
        for (const addr of remoteUnsub) {
          const normalized = normalizeAlertSubscriberEmail(addr);
          if (normalized) unsubscribedSet.add(normalized);
        }
      } catch (err) {
        logger.warn(
          'alerts_digest.suppression_dry_run_warn',
          `Dry-run could not fetch Resend suppression list: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  const cooldownCutoffIso = new Date(nowMs - ALERT_COOLDOWN_MS).toISOString();
  const rawAlerts = await fetchByKey<PriceAlertRow>(
    supabase,
    'price_alerts',
    'id, master_product_id, subscriber_email, target_price, price_when_created, locale, is_active, last_triggered_at, created_at, updated_at',
    'id',
    query =>
      query
        .eq('is_active', true)
        .not('subscriber_email', 'is', null)
        .or(`last_triggered_at.is.null,last_triggered_at.lte.${cooldownCutoffIso}`)
  );

  let skippedInactiveOrInvalid = 0;
  let skippedCooldown = 0;

  interface ValidAlertRow {
    readonly id: string;
    readonly masterProductId: string;
    readonly email: string;
    readonly locale: AlertLocale;
    readonly targetPrice: number;
    readonly createdAtMs: number;
  }

  const readyAlerts: ValidAlertRow[] = [];
  for (const row of rawAlerts) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      skippedInactiveOrInvalid += 1;
      continue;
    }
    if (row.is_active !== true) {
      skippedInactiveOrInvalid += 1;
      continue;
    }
    if (
      typeof row.id !== 'string' ||
      !STRICT_UUID_REGEX.test(row.id) ||
      typeof row.master_product_id !== 'string' ||
      !STRICT_UUID_REGEX.test(row.master_product_id)
    ) {
      skippedInactiveOrInvalid += 1;
      continue;
    }
    const email = normalizeAlertSubscriberEmail(row.subscriber_email);
    const targetPrice = parseSafeVndNumber(row.target_price);
    if (!email || !Number.isFinite(targetPrice)) {
      skippedInactiveOrInvalid += 1;
      continue;
    }
    if (!isAlertPastCooldown(row.last_triggered_at, now)) {
      skippedCooldown += 1;
      continue;
    }
    const parsedCreatedAt =
      typeof row.created_at === 'string' && row.created_at.trim()
        ? Date.parse(row.created_at)
        : NaN;
    readyAlerts.push({
      id: row.id.toLowerCase(),
      masterProductId: row.master_product_id.toLowerCase(),
      email,
      locale: normalizeAlertLocale(row.locale),
      targetPrice: Math.round(targetPrice),
      createdAtMs: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : Number.POSITIVE_INFINITY,
    });
  }

  // Deterministic epoch-ms FIFO order so mixed ISO formats (+00:00 vs Z vs .sssZ) never misorder.
  readyAlerts.sort((a, b) => {
    if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs < b.createdAtMs ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const candidateMasterIds = [...new Set(readyAlerts.map(a => a.masterProductId))];

  const [masters, categories, rawOffers] =
    candidateMasterIds.length > 0
      ? await Promise.all([
          selectInByKey<AlertMasterProductRow>(
            supabase,
            'master_products',
            'id, slug, name, model, status, category_id, metadata, specifications',
            'id',
            candidateMasterIds,
            'id',
            query => query.eq('status', 'published')
          ),
          fetchByKey<AlertCategoryRow>(supabase, 'categories', 'id, slug', 'id'),
          selectInByKey<AlertProductOfferRow>(
            supabase,
            'products',
            'id, cluster_id, merchant_id, platform, title, price_current, availability, stock, origin',
            'cluster_id',
            candidateMasterIds,
            'id',
            query => query.eq('origin', 'crawl')
          ),
        ])
      : [[], [], []];

  const publishedMasterIds = new Set(
    masters
      .filter(m => m && typeof m.id === 'string' && m.status === 'published')
      .map(m => m.id.toLowerCase())
  );

  const relevantOffers = rawOffers.filter(
    o => o && typeof o.cluster_id === 'string' && publishedMasterIds.has(o.cluster_id.toLowerCase())
  );

  const merchantIds = [
    ...new Set(
      relevantOffers
        .map(o => (typeof o.merchant_id === 'string' ? o.merchant_id : ''))
        .filter(Boolean)
    ),
  ];
  const offerProductIds = [
    ...new Set(relevantOffers.map(o => (typeof o.id === 'string' ? o.id : '')).filter(Boolean)),
  ];

  const ninetyDaysAgoIso = new Date(nowMs - ALERT_ATL_WINDOW_MS).toISOString();
  const [merchants, historyRows] = await Promise.all([
    merchantIds.length > 0
      ? selectInByKey<AlertMerchantRow>(
          supabase,
          'merchants',
          'id, name, platform, is_official, archived_at',
          'id',
          merchantIds
        )
      : Promise.resolve([]),
    offerProductIds.length > 0
      ? selectInByKey<AlertPriceHistoryRow>(
          supabase,
          'price_history',
          'id, product_id, price, recorded_at',
          'product_id',
          offerProductIds,
          'id',
          query =>
            query
              .gte('recorded_at', ninetyDaysAgoIso)
              .gt('price', 0)
              .lte('price', MAX_VALID_VND_PRICE)
        )
      : Promise.resolve([]),
  ]);

  const categorySlugById = new Map<string, string>();
  for (const cat of categories) {
    if (cat && typeof cat.id === 'string' && typeof cat.slug === 'string') {
      categorySlugById.set(cat.id, cat.slug);
    }
  }

  const merchantById = new Map<string, AlertMerchantRow>();
  for (const m of merchants) {
    if (m && typeof m.id === 'string') {
      merchantById.set(m.id, m);
    }
  }

  const offersByMasterId = new Map<string, AlertProductOfferRow[]>();
  for (const offer of relevantOffers) {
    const key = offer.cluster_id!.toLowerCase();
    const list = offersByMasterId.get(key) ?? [];
    list.push(offer);
    offersByMasterId.set(key, list);
  }

  const historyByProductId = new Map<string, AlertPriceHistoryRow[]>();
  for (const obs of historyRows) {
    if (!obs || typeof obs.product_id !== 'string') continue;
    const list = historyByProductId.get(obs.product_id) ?? [];
    list.push(obs);
    historyByProductId.set(obs.product_id, list);
  }

  const evaluationByMasterId = new Map<string, MasterBestOfferEvaluation | null>();
  for (const master of masters) {
    if (!master || typeof master.id !== 'string') continue;
    const masterKey = master.id.toLowerCase();
    evaluationByMasterId.set(
      masterKey,
      evaluatePublishedMasterOffers({
        master,
        offers: offersByMasterId.get(masterKey) ?? [],
        merchantById,
        historyByProductId,
        categorySlugById,
        siteOrigin,
        nowMs,
      })
    );
  }

  let skippedUnpublishedOrNoOffer = 0;
  let skippedAboveTarget = 0;
  let skippedUnsubscribed = 0;
  const triggerableSubscribed: EligiblePriceAlertCandidate[] = [];

  for (const alert of readyAlerts) {
    const evalResult = evaluationByMasterId.get(alert.masterProductId) ?? null;
    if (!evalResult) {
      skippedUnpublishedOrNoOffer += 1;
      continue;
    }
    if (evalResult.bestPrice > alert.targetPrice) {
      skippedAboveTarget += 1;
      continue;
    }
    if (unsubscribedSet.has(alert.email)) {
      skippedUnsubscribed += 1;
      continue;
    }
    triggerableSubscribed.push({
      alertId: alert.id,
      masterProductId: alert.masterProductId,
      subscriberEmail: alert.email,
      locale: alert.locale,
      targetPrice: alert.targetPrice,
      bestPrice: evalResult.bestPrice,
      bestOfferId: evalResult.bestOfferId,
      merchantName: evalResult.merchantName,
      productName: evalResult.productName,
      productUrl: evalResult.productUrl,
      isAllTimeLow90d: evalResult.isAllTimeLow90d,
      observed90dFloor: evalResult.observed90dFloor,
    });
  }

  const planned = triggerableSubscribed.slice(0, limit);
  const atl90dCount = planned.filter(c => c.isAllTimeLow90d).length;

  let emailsSent = 0;
  let emailsFailed = 0;
  let dbUpdatesSucceeded = 0;
  let dbUpdatesFailed = 0;

  if (apply) {
    const sendFn = options.sendEmail ?? sendPriceAlertEmail;
    const issuedAtUnixSec = Math.floor(nowMs / 1000);
    const triggeredIso = now.toISOString();

    for (const candidate of planned) {
      const token = signAlertUnsubscribeToken(
        {
          alertId: candidate.alertId,
          email: candidate.subscriberEmail,
          masterProductId: candidate.masterProductId,
          issuedAtUnixSec,
        },
        unsubscribeSecret
      );

      let sentOk = false;
      try {
        await sendFn({
          toEmail: candidate.subscriberEmail,
          fromEmail,
          resendApiKey,
          locale: candidate.locale,
          productName: candidate.productName,
          targetPrice: candidate.targetPrice,
          bestPrice: candidate.bestPrice,
          merchantName: candidate.merchantName,
          productUrl: candidate.productUrl,
          unsubscribeToken: token,
          siteOrigin,
          isAllTimeLow90d: candidate.isAllTimeLow90d,
          fetchImpl: options.fetchImpl,
        });
        sentOk = true;
        emailsSent += 1;
      } catch (err) {
        emailsFailed += 1;
        logger.error(
          'alerts_digest.send_failed',
          `Failed to send price-alert email for alert ${candidate.alertId}: ${err instanceof Error ? err.message : String(err)}`,
          {
            alertId: candidate.alertId,
            masterProductId: candidate.masterProductId,
          }
        );
      }

      // Update last_triggered_at + updated_at ONLY after Resend confirms 2xx delivery.
      if (!sentOk) continue;

      const { error: updateErr } = await supabase
        .from('price_alerts')
        .update({
          last_triggered_at: triggeredIso,
          updated_at: triggeredIso,
        })
        .eq('id', candidate.alertId);

      if (updateErr) {
        dbUpdatesFailed += 1;
        logger.error(
          'alerts_digest.db_update_failed',
          `Resend accepted email for alert ${candidate.alertId}, but updating last_triggered_at failed: ${updateErr.message}`,
          {
            alertId: candidate.alertId,
            masterProductId: candidate.masterProductId,
          }
        );
      } else {
        dbUpdatesSucceeded += 1;
      }
    }
  }

  const summary: PriceAlertsDigestSummary = {
    mode,
    apply,
    limit,
    scannedAlerts: rawAlerts.length,
    skippedInactiveOrInvalid,
    skippedCooldown,
    skippedUnpublishedOrNoOffer,
    skippedAboveTarget,
    skippedUnsubscribed,
    eligibleAlerts: triggerableSubscribed.length,
    plannedAlerts: planned.length,
    emailsSent,
    emailsFailed,
    dbUpdatesSucceeded,
    dbUpdatesFailed,
    atl90dCount,
    candidates: planned,
  };

  logger.info(
    'alerts_digest.summary',
    `Price alerts digest [${mode.toUpperCase()}]: ${planned.length} planned (${triggerableSubscribed.length} eligible, ${atl90dCount} at 90d ATL), ${emailsSent} sent, ${dbUpdatesSucceeded} DB updates.`,
    {
      mode,
      apply,
      limit,
      scannedAlerts: summary.scannedAlerts,
      skippedInactiveOrInvalid,
      skippedCooldown,
      skippedUnpublishedOrNoOffer,
      skippedAboveTarget,
      skippedUnsubscribed,
      eligibleAlerts: summary.eligibleAlerts,
      plannedAlerts: summary.plannedAlerts,
      emailsSent,
      emailsFailed,
      dbUpdatesSucceeded,
      dbUpdatesFailed,
      atl90dCount,
    }
  );

  return summary;
}

export interface PriceAlertsDigestCliRunners {
  readonly env?: NodeJS.ProcessEnv;
  readonly getClient?: (env: NodeJS.ProcessEnv) => Promise<WorkerRateClient>;
  readonly runDigest?: (
    supabase: RateSupabaseClient,
    options: PriceAlertsDigestOptions
  ) => Promise<PriceAlertsDigestSummary>;
}

/**
 * CLI entrypoint runner. Validates flags and `--apply` secrets BEFORE opening a `rate_worker`
 * Auth session, signs out in `finally`, and throws if any delivery or DB update failed.
 */
export async function runPriceAlertsDigestCli(
  argv: readonly string[],
  runners: PriceAlertsDigestCliRunners = {}
): Promise<PriceAlertsDigestSummary> {
  const args = parsePriceAlertsDigestArgs(argv);
  const env = runners.env ?? process.env;

  const rawSiteOrigin =
    env.RATE_SITE_ORIGIN ||
    env.APP_PUBLIC_URL ||
    env.NEXT_PUBLIC_SITE_URL ||
    DEFAULT_RATE_SITE_ORIGIN;
  const siteOrigin = validateHttpsSiteOrigin(rawSiteOrigin);

  const rawSecret = (env.RATE_ALERT_UNSUBSCRIBE_SECRET || '').trim();
  const rawResendKey = (env.RESEND_API_KEY || '').trim();
  const rawFrom = (env.ALERT_EMAIL_FROM || '').trim();
  const rawAudienceId = (env.RESEND_AUDIENCE_ID || '').trim();
  const audienceId = rawAudienceId ? validateResendAudienceId(env.RESEND_AUDIENCE_ID) : '';

  if (args.apply) {
    assertValidAlertUnsubscribeSecret(rawSecret);
    validateResendApiKey(rawResendKey);
    validateSenderFromAddress(rawFrom);
  }

  const getClient = runners.getClient ?? getWorkerRateClient;
  const runDigest = runners.runDigest ?? runPriceAlertsDigest;

  const workerClient = await getClient(env);
  try {
    logger.info(
      'alerts_digest.target',
      `Target: ${workerClient.host} [mode=${args.apply ? 'APPLY' : 'DRY-RUN'}, limit=${args.limit}]`,
      {
        host: workerClient.host,
        apply: args.apply,
        limit: args.limit,
        suppressionConfigured: Boolean(audienceId),
      }
    );
    const summary = await runDigest(workerClient, {
      apply: args.apply,
      limit: args.limit,
      siteOrigin,
      ...(args.apply
        ? {
            unsubscribeSecret: rawSecret,
            resendApiKey: rawResendKey,
            fromEmail: rawFrom,
          }
        : rawResendKey
          ? { resendApiKey: rawResendKey }
          : {}),
      ...(audienceId ? { audienceId } : {}),
    });

    if (summary.emailsFailed > 0 || summary.dbUpdatesFailed > 0) {
      throw new Error(
        `Price alerts digest finished with ${summary.emailsFailed} failed email(s) and ${summary.dbUpdatesFailed} failed DB update(s).`
      );
    }
    return summary;
  } finally {
    await workerClient.signOut();
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]!).href;

if (isDirectExecution) {
  dotenv.config({ quiet: true });
  dotenv.config({ path: '../../.env', quiet: true });
  runPriceAlertsDigestCli(process.argv.slice(2)).catch((err: unknown) => {
    logger.error(
      'alerts_digest.fatal',
      `Price alerts digest failed: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  });
}
