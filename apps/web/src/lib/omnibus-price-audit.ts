/**
 * EU Omnibus 30-Day Prior Price-Floor Audit & 90-Day Cycle Buy-vs-Wait Engine
 * (Package 8A Feature F1, DOS/Rate#1863).
 *
 * Inspired by Hlidac shopu (EU Directive 2019/2161 Article 6a) and Keepa/Prisjakt
 * 90-day price-cycle percentiles. Pure, deterministic, client-safe TypeScript:
 * zero database DDL, zero server-only imports, and strict window honesty.
 */
import {
  IMPLAUSIBLY_LOW_RATIO,
  MAX_VALID_VND_PRICE,
  MINIMUM_EARBUDS_PRICE_FLOOR_VND,
  implausiblyLowIndexes,
  implausiblyLowOfferIds,
  isImplausiblyLowPrice,
  isOfferImplausiblyLowAgainstInStock,
  normalizeOfferId,
  plausibleOffers,
} from '@repo/shared-data/rules';
import type { RadarSignal } from '@/lib/deal-radar';
import { formatPlainNumber, formatPriceVnd } from '@/lib/locale-format';
import {
  isOfferUnavailable,
  type OfferAvailability,
} from '@/lib/product-market-stats';

const DAY_MS = 86_400_000;
const CONTROL_CHAR_RE = /\p{Cc}+/gu;

/** Full days required before certifying EU Omnibus Article 6a 30-day prior floor. */
export const OMNIBUS_WINDOW_DAYS = 30;
/** Minimum distinct observed day buckets required to certify a 30-day floor. */
export const MIN_OMNIBUS_OBSERVATION_DAYS = 3;
/** Maximum allowed gap (in days) inside the 30-day window before withholding certification. */
export const MAX_OMNIBUS_BLACKOUT_GAP_DAYS = 18;
/** Maximum duration (in days) of a new trailing price change treated as the current sale event. */
export const MAX_CURRENT_EVENT_TAIL_DAYS = 7;

/** Reference lookback window for Buy-Now vs Wait percentile analysis. */
export const CYCLE_90D_WINDOW_DAYS = 90;
/** Minimum distinct observed days required to emit a 90-day percentile call. */
export const MIN_CYCLE_90D_POINTS = 5;
/** Minimum observed span (in days) required to emit a 90-day percentile call. */
export const MIN_CYCLE_90D_SPAN_DAYS = 14;
/** <= P15 marks the 90-day floor zone ("Buy now"). */
export const CYCLE_BUY_NOW_MAX_PERCENTILE = 15;
/** P16..P70 marks stable fair-market pricing; > P70 marks elevated ("Wait for sale"). */
export const CYCLE_FAIR_MARKET_MAX_PERCENTILE = 70;
/** Minimum relative 90d price spread (1%) required before calling Buy-Now or Wait. */
export const MIN_CYCLE_90D_RELATIVE_SPREAD = 0.01;

export type OmnibusWindowStatus =
  | 'omnibus_30d_certified'
  | 'partial_window'
  | 'blackout_gap'
  | 'insufficient_history';

export type OmnibusAuditVerdict =
  | 'fake_strikethrough_above_floor'
  | 'exaggerated_strikethrough'
  | 'verified_omnibus_reduction'
  | 'below_30d_floor'
  | 'at_or_above_30d_floor'
  | 'unverified_window';

export type Cycle90dSignalKind =
  'buy_now_floor' | 'fair_market' | 'above_recent_floor' | 'insufficient_data';

export type SeasonalSaleFilterMode =
  'all' | 'genuine_sale_drops' | 'inflated_presale_warnings';

export interface OmnibusAuditPointInput {
  readonly product_id?: string | null;
  readonly price: unknown;
  readonly price_original?: unknown;
  readonly recorded_at: unknown;
  readonly source?: string | null;
  readonly availability?: OfferAvailability | null;
  readonly implausiblyLow?: boolean | null;
}

export interface OmnibusReferenceOfferInput {
  readonly id?: string | null;
  readonly price_current: number;
  readonly availability?: OfferAvailability | null;
  readonly implausiblyLow?: boolean | null;
}

export interface EvaluateOmnibusPriceAuditParams {
  readonly points: readonly OmnibusAuditPointInput[] | null | undefined;
  /** Current selling price of the listing or best verified offer. */
  readonly currentPriceVnd: unknown;
  /** Seller-claimed strikethrough original/list price, if any. */
  readonly claimedOriginalPriceVnd?: unknown;
  /**
   * Verified in-stock non-bait price used for the 90-day Buy-Now vs Wait call.
   * Defaults to `currentPriceVnd` unless `currentOfferUnavailable` is true;
   * pass `null` explicitly when no verified in-stock offer exists.
   */
  readonly currentInStockPriceVnd?: unknown;
  /** `'offer'` evaluates a single listing series; `'market'` computes daily floor across offers. */
  readonly mode?: 'offer' | 'market';
  readonly currentOfferUnavailable?: boolean;
  readonly currentOfferImplausiblyLow?: boolean;
  readonly referenceOffers?: readonly OmnibusReferenceOfferInput[] | null;
  readonly unavailableOfferIds?: ReadonlySet<string> | null;
  readonly implausibleOfferIds?: ReadonlySet<string> | null;
  readonly minValidPriceVnd?: number;
  /** Optional deterministic anchor timestamp in ms; defaults to latest valid point timestamp. */
  readonly referenceTimestampMs?: number | null;
}

export interface Cycle90dEvaluation {
  readonly signal: Cycle90dSignalKind;
  readonly percentile: number | null;
  readonly topPercentileDisplay: number | null;
  readonly low90dVnd: number | null;
  readonly high90dVnd: number | null;
  readonly median90dVnd: number | null;
  readonly aboveFloorVnd: number | null;
  readonly aboveFloorPct: number | null;
  readonly observedPointDays: number;
  readonly observedSpanDays90d: number;
}

export interface OmnibusPriceAuditResult {
  readonly currentPriceVnd: number | null;
  readonly claimedOriginalPriceVnd: number | null;
  readonly claimedDiscountVnd: number | null;
  readonly claimedDiscountPct: number | null;
  readonly priorFloorPriceVnd: number | null;
  readonly observedSpanDays: number;
  readonly windowDaysUsed: number;
  readonly isOmnibusCertified: boolean;
  readonly hasBlackoutGap: boolean;
  readonly windowStatus: OmnibusWindowStatus;
  readonly verdict: OmnibusAuditVerdict;
  readonly deltaVsPriorFloorVnd: number | null;
  readonly deltaVsPriorFloorPct: number | null;
  readonly claimedVsPriorFloorMarkupVnd: number | null;
  readonly claimedVsPriorFloorMarkupPct: number | null;
  readonly validObservationCount: number;
  readonly cycle90d: Cycle90dEvaluation;
}

export type OmnibusVerdictMessageKey =
  | 'oTitle'
  | 'oOk'
  | 'oPart'
  | 'oGap'
  | 'oPend'
  | 'oFlr'
  | 'oCur'
  | 'oClaim'
  | 'oNoOrig'
  | 'oMarkup'
  | 'oAlign'
  | 'oDrop'
  | 'oFake'
  | 'oUp'
  | 'oFlat'
  | 'oNeed'
  | 'oNoteP'
  | 'oNoteG'
  | 'oCyc'
  | 'oBuy'
  | 'oFair'
  | 'oWait'
  | 'oRng'
  | 'oCycP'
  | 'oCycN';

export type OmnibusVerdictTranslator = (
  key: OmnibusVerdictMessageKey,
  values?: Record<string, string | number>
) => string;

export interface FormattedOmnibusAuditCopy {
  readonly cardTitle: string;
  readonly statusBadgeText: string;
  readonly statusBadgeTone: 'good' | 'warn' | 'bad' | 'neutral';
  readonly colCurrentTitle: string;
  readonly currentPriceText: string;
  readonly claimedBadgeText: string | null;
  readonly currentSubText: string;
  readonly currentSubTone: 'bad' | 'good' | 'neutral';
  readonly colFloorTitle: string;
  readonly floorPriceText: string;
  readonly floorDeltaText: string;
  readonly floorDeltaTone: 'good' | 'bad' | 'neutral';
  readonly floorDisclaimerText: string | null;
  readonly colCycleTitle: string;
  readonly cycleValueText: string;
  readonly cycleValueTone: 'good' | 'bad' | 'neutral';
  readonly cycleSubText: string;
}

function parseStrictFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return null;
    }
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function sanitizeOmnibusPriceVnd(
  raw: unknown,
  minFloorVnd = MINIMUM_EARBUDS_PRICE_FLOOR_VND
): number | null {
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed == null || parsed <= 0 || parsed > MAX_VALID_VND_PRICE) {
    return null;
  }
  const rounded = Math.round(parsed);
  const safeFloor =
    Number.isFinite(minFloorVnd) && minFloorVnd > 0
      ? Math.round(minFloorVnd)
      : MINIMUM_EARBUDS_PRICE_FLOOR_VND;
  if (rounded < safeFloor || rounded > MAX_VALID_VND_PRICE) {
    return null;
  }
  return rounded;
}

function parseRecordedAtMs(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
  }
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.replace(CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 64) return null;
    const ms = Date.parse(cleaned);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  return null;
}

function roundDisplayPct(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  const abs = Math.abs(value);
  if (abs < 0.1) {
    const rounded2 = Math.round(abs * 100) / 100;
    const nonZero = Math.max(0.01, rounded2);
    return value < 0 ? -nonZero : nonZero;
  }
  const rounded1 = Math.round(value * 10) / 10;
  return Object.is(rounded1, -0) ? 0 : rounded1;
}

function computeSortedMedian(sortedAsc: readonly number[]): number | null {
  if (sortedAsc.length === 0) return null;
  const mid = Math.floor(sortedAsc.length / 2);
  if (sortedAsc.length % 2 === 1) {
    return sortedAsc[mid] ?? null;
  }
  return Math.round(((sortedAsc[mid - 1] ?? 0) + (sortedAsc[mid] ?? 0)) / 2);
}

interface CleanHistoryPoint {
  readonly offerKey: string;
  readonly priceVnd: number;
  readonly recordedMs: number;
}

interface SeriesPoint {
  readonly priceVnd: number;
  readonly recordedMs: number;
}

function buildOfferExclusionSets(params: {
  readonly referenceOffers?: readonly OmnibusReferenceOfferInput[] | null;
  readonly unavailableOfferIds?: ReadonlySet<string> | null;
  readonly implausibleOfferIds?: ReadonlySet<string> | null;
  readonly minFloorVnd: number;
}): {
  excludedIds: Set<string>;
  inStockPlausibleOffers: { id: string; price_current: number }[];
} {
  const excludedIds = new Set<string>();
  const markExcluded = (raw: string | null | undefined) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (trimmed) excludedIds.add(trimmed);
    const clean = normalizeOfferId(trimmed);
    if (clean) excludedIds.add(clean);
  };
  for (const set of [params.unavailableOfferIds, params.implausibleOfferIds]) {
    if (!set) continue;
    for (const id of set) markExcluded(id);
  }

  const safeRefOffers = Array.isArray(params.referenceOffers)
    ? params.referenceOffers.filter((o): o is OmnibusReferenceOfferInput =>
        Boolean(o && typeof o === 'object' && !Array.isArray(o))
      )
    : [];

  const inStockSized: { id: string; price_current: number }[] = [];
  const pricedAll: { rawId: string; id: string; price_current: number }[] = [];
  for (const off of safeRefOffers) {
    const rawId = typeof off.id === 'string' ? off.id.trim() : '';
    const id = normalizeOfferId(rawId) || rawId;
    const price = sanitizeOmnibusPriceVnd(
      off.price_current,
      params.minFloorVnd
    );
    if (price != null) pricedAll.push({ rawId, id, price_current: price });
    if (
      isOfferUnavailable(off) ||
      off.implausiblyLow === true ||
      price == null
    ) {
      markExcluded(rawId);
      continue;
    }
    inStockSized.push({ id, price_current: price });
  }

  const baitIdsFromInStock = implausiblyLowOfferIds(inStockSized);
  for (const bId of baitIdsFromInStock) excludedIds.add(bId);
  if (inStockSized.length > 0) {
    for (const off of pricedAll) {
      if (
        isOfferImplausiblyLowAgainstInStock(
          off,
          inStockSized,
          baitIdsFromInStock
        )
      ) {
        markExcluded(off.rawId);
      }
    }
  }

  return { excludedIds, inStockPlausibleOffers: plausibleOffers(inStockSized) };
}

/**
 * Builds an ascending time series of verified prices:
 * - In `'offer'` mode, collapses identical timestamps to the lowest valid price.
 * - In `'market'` mode, computes the step-function market floor across active
 *   plausible offers at each observation timestamp (carrying each offer forward
 *   up to `MAX_OMNIBUS_BLACKOUT_GAP_DAYS` so staggered store crawls never create
 *   artificial spikes).
 */
function buildEffectiveSeries(
  points: readonly CleanHistoryPoint[],
  mode: 'offer' | 'market'
): SeriesPoint[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort(
    (a, b) => a.recordedMs - b.recordedMs || a.priceVnd - b.priceVnd
  );

  // When multiple offers are present without explicit referenceOffers, run
  // cross-offer outlier detection on each offer's latest observed price so a
  // bait listing inside raw points cannot set the 30d or 90d floor.
  const latestByOffer = new Map<string, number>();
  for (const pt of sorted) {
    latestByOffer.set(pt.offerKey, pt.priceVnd);
  }
  const offerEntries = Array.from(latestByOffer.entries());
  const autoBaitKeys = new Set<string>();
  if (offerEntries.length >= 3) {
    const flagged = implausiblyLowIndexes(offerEntries.map(([, p]) => p));
    for (const idx of flagged) {
      const key = offerEntries[idx]?.[0];
      if (key) autoBaitKeys.add(key);
    }
  }

  const filtered =
    autoBaitKeys.size > 0
      ? sorted.filter((pt) => !autoBaitKeys.has(pt.offerKey))
      : sorted;
  if (filtered.length === 0) return [];

  if (mode === 'offer' || latestByOffer.size <= 1) {
    const out: SeriesPoint[] = [];
    for (const pt of filtered) {
      const prev = out[out.length - 1];
      if (prev && prev.recordedMs === pt.recordedMs) {
        if (pt.priceVnd < prev.priceVnd) {
          out[out.length - 1] = {
            recordedMs: pt.recordedMs,
            priceVnd: pt.priceVnd,
          };
        }
      } else {
        out.push({ recordedMs: pt.recordedMs, priceVnd: pt.priceVnd });
      }
    }
    return out;
  }

  const carryLimitMs = MAX_OMNIBUS_BLACKOUT_GAP_DAYS * DAY_MS;
  const activeOffers = new Map<
    string,
    { priceVnd: number; recordedMs: number }
  >();
  const out: SeriesPoint[] = [];

  let i = 0;
  while (i < filtered.length) {
    const tMs = filtered[i]!.recordedMs;
    while (i < filtered.length && filtered[i]!.recordedMs === tMs) {
      const pt = filtered[i]!;
      const existing = activeOffers.get(pt.offerKey);
      if (
        !existing ||
        existing.recordedMs < tMs ||
        pt.priceVnd < existing.priceVnd
      ) {
        activeOffers.set(pt.offerKey, {
          priceVnd: pt.priceVnd,
          recordedMs: tMs,
        });
      }
      i++;
    }
    let minActive = Number.POSITIVE_INFINITY;
    for (const [key, state] of activeOffers.entries()) {
      if (tMs - state.recordedMs > carryLimitMs) {
        activeOffers.delete(key);
        continue;
      }
      if (state.priceVnd < minActive) {
        minActive = state.priceVnd;
      }
    }
    if (Number.isFinite(minActive)) {
      out.push({ recordedMs: tMs, priceVnd: minActive });
    }
  }
  return out;
}

const EMPTY_CYCLE_90D: Cycle90dEvaluation = {
  signal: 'insufficient_data',
  percentile: null,
  topPercentileDisplay: null,
  low90dVnd: null,
  high90dVnd: null,
  median90dVnd: null,
  aboveFloorVnd: null,
  aboveFloorPct: null,
  observedPointDays: 0,
  observedSpanDays90d: 0,
};

function evaluate90dCycleFromSeries(params: {
  readonly series: readonly SeriesPoint[];
  readonly anchorMs: number;
  readonly currentInStockPriceVnd: number | null;
}): Cycle90dEvaluation {
  const { series, anchorMs, currentInStockPriceVnd } = params;
  const cutoff90dMs = anchorMs - CYCLE_90D_WINDOW_DAYS * DAY_MS;
  const in90d = series.filter(
    (pt) => pt.recordedMs >= cutoff90dMs && pt.recordedMs <= anchorMs
  );
  if (in90d.length === 0) return EMPTY_CYCLE_90D;

  const earliest90dMs = in90d[0]!.recordedMs;
  const latest90dMs = in90d[in90d.length - 1]!.recordedMs;
  const observedSpanDays90d = Math.max(
    0,
    Math.floor((latest90dMs - earliest90dMs) / DAY_MS)
  );

  // Bucket into 24-hour day slots anchored at `anchorMs` so burst crawls on a
  // single day never overweight one day in the 90-day empirical distribution.
  const dailyMinByBucket = new Map<number, number>();
  for (const pt of in90d) {
    const dayBucket = Math.max(
      0,
      Math.floor((anchorMs - pt.recordedMs) / DAY_MS)
    );
    const prev = dailyMinByBucket.get(dayBucket);
    if (prev == null || pt.priceVnd < prev) {
      dailyMinByBucket.set(dayBucket, pt.priceVnd);
    }
  }

  const observedPointDays = dailyMinByBucket.size;
  const sortedDailyPrices = Array.from(dailyMinByBucket.values()).sort(
    (a, b) => a - b
  );
  const rawLow90d = sortedDailyPrices[0] ?? null;
  const rawHigh90d = sortedDailyPrices[sortedDailyPrices.length - 1] ?? null;
  const low90dVnd =
    rawLow90d != null && currentInStockPriceVnd != null
      ? Math.min(rawLow90d, currentInStockPriceVnd)
      : rawLow90d;
  const high90dVnd =
    rawHigh90d != null && currentInStockPriceVnd != null
      ? Math.max(rawHigh90d, currentInStockPriceVnd)
      : rawHigh90d;
  const median90dVnd = computeSortedMedian(sortedDailyPrices);

  if (
    currentInStockPriceVnd == null ||
    observedPointDays < MIN_CYCLE_90D_POINTS ||
    observedSpanDays90d < MIN_CYCLE_90D_SPAN_DAYS ||
    low90dVnd == null ||
    high90dVnd == null
  ) {
    return {
      signal: 'insufficient_data',
      percentile: null,
      topPercentileDisplay: null,
      low90dVnd,
      high90dVnd,
      median90dVnd,
      aboveFloorVnd: null,
      aboveFloorPct: null,
      observedPointDays,
      observedSpanDays90d,
    };
  }

  let belowCount = 0;
  let equalCount = 0;
  for (const p of sortedDailyPrices) {
    if (p < currentInStockPriceVnd) belowCount++;
    else if (p === currentInStockPriceVnd) equalCount++;
  }

  const rawPercentile =
    ((belowCount + 0.5 * equalCount) / sortedDailyPrices.length) * 100;
  const percentile = Math.min(100, Math.max(0, Math.round(rawPercentile)));
  const topPercentileDisplay = Math.max(1, percentile);
  const aboveFloorVnd = Math.max(0, currentInStockPriceVnd - low90dVnd);
  const aboveFloorPct =
    low90dVnd > 0 && aboveFloorVnd > 0
      ? roundDisplayPct((aboveFloorVnd / low90dVnd) * 100)
      : 0;
  const relativeSpread =
    low90dVnd > 0 ? (high90dVnd - low90dVnd) / low90dVnd : 0;

  let signal: Cycle90dSignalKind;
  if (relativeSpread < MIN_CYCLE_90D_RELATIVE_SPREAD) {
    signal = 'fair_market';
  } else if (percentile <= CYCLE_BUY_NOW_MAX_PERCENTILE) {
    signal = 'buy_now_floor';
  } else if (
    percentile <= CYCLE_FAIR_MARKET_MAX_PERCENTILE ||
    aboveFloorPct < 1
  ) {
    signal = 'fair_market';
  } else {
    signal = 'above_recent_floor';
  }

  return {
    signal,
    percentile,
    topPercentileDisplay,
    low90dVnd,
    high90dVnd,
    median90dVnd,
    aboveFloorVnd,
    aboveFloorPct,
    observedPointDays,
    observedSpanDays90d,
  };
}

/**
 * Evaluates both the 30-day EU Omnibus prior price-floor audit and the 90-day
 * price-cycle Buy-Now vs Wait percentile indicator with strict window honesty.
 */
export function evaluateOmnibusPriceAudit(
  params: EvaluateOmnibusPriceAuditParams
): OmnibusPriceAuditResult {
  const safeParams =
    params && typeof params === 'object'
      ? params
      : ({
          points: [],
          currentPriceVnd: null,
        } as EvaluateOmnibusPriceAuditParams);

  const minFloorVnd =
    typeof safeParams.minValidPriceVnd === 'number' &&
    Number.isFinite(safeParams.minValidPriceVnd) &&
    safeParams.minValidPriceVnd > 0
      ? Math.round(safeParams.minValidPriceVnd)
      : MINIMUM_EARBUDS_PRICE_FLOOR_VND;

  const { excludedIds, inStockPlausibleOffers } = buildOfferExclusionSets({
    referenceOffers: safeParams.referenceOffers,
    unavailableOfferIds: safeParams.unavailableOfferIds,
    implausibleOfferIds: safeParams.implausibleOfferIds,
    minFloorVnd,
  });

  const rawCurrent = sanitizeOmnibusPriceVnd(
    safeParams.currentPriceVnd,
    minFloorVnd
  );
  const currentIsBaitAgainstPeers =
    rawCurrent != null &&
    inStockPlausibleOffers.length >= 2 &&
    isImplausiblyLowPrice(rawCurrent, inStockPlausibleOffers);

  const currentPriceVnd =
    safeParams.currentOfferUnavailable === true ||
    safeParams.currentOfferImplausiblyLow === true ||
    currentIsBaitAgainstPeers
      ? null
      : rawCurrent;

  const rawClaimedOrig = sanitizeOmnibusPriceVnd(
    safeParams.claimedOriginalPriceVnd,
    minFloorVnd
  );
  const claimedOriginalPriceVnd =
    currentPriceVnd != null &&
    rawClaimedOrig != null &&
    rawClaimedOrig > currentPriceVnd
      ? rawClaimedOrig
      : null;

  const claimedDiscountVnd =
    currentPriceVnd != null && claimedOriginalPriceVnd != null
      ? claimedOriginalPriceVnd - currentPriceVnd
      : null;
  const claimedDiscountPct =
    claimedDiscountVnd != null && claimedOriginalPriceVnd != null
      ? roundDisplayPct((claimedDiscountVnd / claimedOriginalPriceVnd) * 100)
      : null;

  const resolvedInStockPrice = (() => {
    if (safeParams.currentInStockPriceVnd !== undefined) {
      if (safeParams.currentInStockPriceVnd === null) return null;
      const candidate = sanitizeOmnibusPriceVnd(
        safeParams.currentInStockPriceVnd,
        minFloorVnd
      );
      if (
        candidate != null &&
        inStockPlausibleOffers.length >= 2 &&
        isImplausiblyLowPrice(candidate, inStockPlausibleOffers)
      ) {
        return null;
      }
      return candidate;
    }
    return currentPriceVnd;
  })();

  const explicitAnchorMs =
    safeParams.referenceTimestampMs != null &&
    Number.isFinite(safeParams.referenceTimestampMs) &&
    safeParams.referenceTimestampMs > 0
      ? Math.round(safeParams.referenceTimestampMs)
      : null;

  const rawPoints = Array.isArray(safeParams.points) ? safeParams.points : [];
  const cleanPoints: CleanHistoryPoint[] = [];

  for (const pt of rawPoints) {
    if (!pt || typeof pt !== 'object' || Array.isArray(pt)) continue;
    // Synthetic fallback rows (`live_listing`) mirror current listing prices and
    // are never historical observation evidence.
    if (pt.source === 'live_listing') continue;
    if (isOfferUnavailable(pt) || pt.implausiblyLow === true) continue;

    const rawOfferId =
      typeof pt.product_id === 'string' ? pt.product_id.trim() : '';
    const canonOfferId = normalizeOfferId(rawOfferId);
    if (
      (canonOfferId && excludedIds.has(canonOfferId)) ||
      (rawOfferId && excludedIds.has(rawOfferId))
    ) {
      continue;
    }

    const priceVnd = sanitizeOmnibusPriceVnd(pt.price, minFloorVnd);
    if (priceVnd == null) continue;
    if (
      inStockPlausibleOffers.length >= 2 &&
      priceVnd <
        inStockPlausibleOffers[
          Math.floor((inStockPlausibleOffers.length - 1) / 2)
        ]!.price_current *
          IMPLAUSIBLY_LOW_RATIO
    ) {
      continue;
    }

    const recordedMs = parseRecordedAtMs(pt.recorded_at);
    if (recordedMs == null) continue;
    if (explicitAnchorMs != null && recordedMs > explicitAnchorMs) continue;

    cleanPoints.push({
      offerKey: canonOfferId || rawOfferId || '__default__',
      priceVnd,
      recordedMs,
    });
  }

  const mode = safeParams.mode === 'market' ? 'market' : 'offer';
  const series = buildEffectiveSeries(cleanPoints, mode);

  const unverified = (
    observedSpanDays: number,
    validObservationCount: number,
    cycle90d: Cycle90dEvaluation
  ): OmnibusPriceAuditResult => ({
    currentPriceVnd,
    claimedOriginalPriceVnd,
    claimedDiscountVnd,
    claimedDiscountPct,
    priorFloorPriceVnd: null,
    observedSpanDays,
    windowDaysUsed: 0,
    isOmnibusCertified: false,
    hasBlackoutGap: false,
    windowStatus: 'insufficient_history',
    verdict: 'unverified_window',
    deltaVsPriorFloorVnd: null,
    deltaVsPriorFloorPct: null,
    claimedVsPriorFloorMarkupVnd: null,
    claimedVsPriorFloorMarkupPct: null,
    validObservationCount,
    cycle90d,
  });

  if (series.length === 0) {
    return unverified(0, 0, EMPTY_CYCLE_90D);
  }

  const seriesLatestMs = series[series.length - 1]!.recordedMs;
  const anchorMs = explicitAnchorMs ?? seriesLatestMs;
  const earliestMs = series[0]!.recordedMs;
  const seriesSpanMs = Math.max(0, seriesLatestMs - earliestMs);
  const anchorSpanMs = Math.max(0, anchorMs - earliestMs);
  const observedSpanDays =
    series.length >= 2 ? Math.floor(seriesSpanMs / DAY_MS) : 0;

  const cycle90d = evaluate90dCycleFromSeries({
    series,
    anchorMs,
    currentInStockPriceVnd: resolvedInStockPrice,
  });

  // Require multi-day actual observations (>= 1 full day between real points
  // and >= 2 timestamps) before reporting any prior floor at all.
  if (series.length < 2 || seriesSpanMs < DAY_MS || currentPriceVnd == null) {
    return unverified(observedSpanDays, series.length, cycle90d);
  }

  const windowStartMs = anchorMs - OMNIBUS_WINDOW_DAYS * DAY_MS;
  const spansFull30d =
    seriesSpanMs >= OMNIBUS_WINDOW_DAYS * DAY_MS &&
    anchorSpanMs >= OMNIBUS_WINDOW_DAYS * DAY_MS;

  let carryInPoint: SeriesPoint | null = null;
  const inWindowPoints: SeriesPoint[] = [];
  for (const pt of series) {
    if (pt.recordedMs <= windowStartMs) {
      carryInPoint = pt;
    } else if (pt.recordedMs <= anchorMs) {
      inWindowPoints.push(pt);
    }
  }

  const maxGapMs = MAX_OMNIBUS_BLACKOUT_GAP_DAYS * DAY_MS;
  let hasBlackoutGap = false;
  if (spansFull30d) {
    const checkTimes: number[] = [];
    if (carryInPoint) {
      checkTimes.push(carryInPoint.recordedMs);
    } else {
      checkTimes.push(windowStartMs);
    }
    for (const pt of inWindowPoints) {
      checkTimes.push(pt.recordedMs);
    }
    checkTimes.push(anchorMs);

    for (let i = 1; i < checkTimes.length; i++) {
      if (checkTimes[i]! - checkTimes[i - 1]! > maxGapMs) {
        hasBlackoutGap = true;
        break;
      }
    }
  }

  const windowCandidates: SeriesPoint[] = spansFull30d
    ? [
        ...(carryInPoint && windowStartMs - carryInPoint.recordedMs <= maxGapMs
          ? [carryInPoint]
          : []),
        ...inWindowPoints,
      ]
    : [...series];

  const distinctWindowDays = new Set(
    windowCandidates.map((pt) =>
      Math.floor((anchorMs - pt.recordedMs) / DAY_MS)
    )
  ).size;

  // Separate the current price event tail from prior observations when the price
  // changed within the recent campaign window (`<= 7` days), so a genuine sale
  // starting today compares against the prior floor rather than against itself.
  const hasPriceVariationInWindow = windowCandidates.some(
    (pt) => pt.priceVnd !== currentPriceVnd
  );
  const tailCutoffMs = hasPriceVariationInWindow
    ? anchorMs - MAX_CURRENT_EVENT_TAIL_DAYS * DAY_MS
    : anchorMs - 12 * 3_600_000;

  let trimEnd = windowCandidates.length;
  while (trimEnd > 1) {
    const tail = windowCandidates[trimEnd - 1]!;
    if (tail.priceVnd === currentPriceVnd && tail.recordedMs > tailCutoffMs) {
      trimEnd--;
    } else {
      break;
    }
  }
  const priorCandidates = windowCandidates.slice(0, trimEnd);

  let priorFloorPriceVnd: number | null = null;
  for (const pt of priorCandidates) {
    if (priorFloorPriceVnd == null || pt.priceVnd < priorFloorPriceVnd) {
      priorFloorPriceVnd = pt.priceVnd;
    }
  }

  const isOmnibusCertified =
    spansFull30d &&
    !hasBlackoutGap &&
    distinctWindowDays >= MIN_OMNIBUS_OBSERVATION_DAYS &&
    priorFloorPriceVnd != null;

  const windowStatus: OmnibusWindowStatus =
    priorFloorPriceVnd == null
      ? 'insufficient_history'
      : isOmnibusCertified
        ? 'omnibus_30d_certified'
        : spansFull30d &&
            (hasBlackoutGap ||
              distinctWindowDays < MIN_OMNIBUS_OBSERVATION_DAYS)
          ? 'blackout_gap'
          : 'partial_window';

  const windowDaysUsed =
    priorFloorPriceVnd == null || windowStatus === 'blackout_gap'
      ? 0
      : isOmnibusCertified
        ? OMNIBUS_WINDOW_DAYS
        : Math.min(OMNIBUS_WINDOW_DAYS - 1, Math.max(1, observedSpanDays));

  const deltaVsPriorFloorVnd =
    priorFloorPriceVnd != null ? currentPriceVnd - priorFloorPriceVnd : null;
  const deltaVsPriorFloorPct =
    deltaVsPriorFloorVnd != null && priorFloorPriceVnd != null
      ? roundDisplayPct((deltaVsPriorFloorVnd / priorFloorPriceVnd) * 100)
      : null;

  const claimedVsPriorFloorMarkupVnd =
    claimedOriginalPriceVnd != null && priorFloorPriceVnd != null
      ? claimedOriginalPriceVnd - priorFloorPriceVnd
      : null;
  const claimedVsPriorFloorMarkupPct =
    claimedVsPriorFloorMarkupVnd != null && priorFloorPriceVnd != null
      ? roundDisplayPct(
          (claimedVsPriorFloorMarkupVnd / priorFloorPriceVnd) * 100
        )
      : null;

  let verdict: OmnibusAuditVerdict = 'unverified_window';
  if (isOmnibusCertified && priorFloorPriceVnd != null) {
    if (claimedOriginalPriceVnd != null) {
      if (
        claimedOriginalPriceVnd > priorFloorPriceVnd &&
        currentPriceVnd >= priorFloorPriceVnd
      ) {
        verdict = 'fake_strikethrough_above_floor';
      } else if (
        claimedOriginalPriceVnd > Math.round(priorFloorPriceVnd * 1.02) &&
        currentPriceVnd < priorFloorPriceVnd
      ) {
        verdict = 'exaggerated_strikethrough';
      } else if (currentPriceVnd < priorFloorPriceVnd) {
        verdict = 'verified_omnibus_reduction';
      } else {
        verdict = 'at_or_above_30d_floor';
      }
    } else if (currentPriceVnd < priorFloorPriceVnd) {
      verdict = 'below_30d_floor';
    } else {
      verdict = 'at_or_above_30d_floor';
    }
  }

  return {
    currentPriceVnd,
    claimedOriginalPriceVnd,
    claimedDiscountVnd,
    claimedDiscountPct,
    priorFloorPriceVnd,
    observedSpanDays,
    windowDaysUsed,
    isOmnibusCertified,
    hasBlackoutGap,
    windowStatus,
    verdict,
    deltaVsPriorFloorVnd,
    deltaVsPriorFloorPct,
    claimedVsPriorFloorMarkupVnd,
    claimedVsPriorFloorMarkupPct,
    validObservationCount: series.length,
    cycle90d,
  };
}

/**
 * Formats an `OmnibusPriceAuditResult` into locale-ready strings and semantic
 * WCAG contrast tones (`good` / `warn` / `bad` / `neutral`) for `vi`, `en`, `cs`.
 */
export function formatOmnibusAuditCopy(
  audit: OmnibusPriceAuditResult,
  t: OmnibusVerdictTranslator,
  locale?: string | null
): FormattedOmnibusAuditCopy {
  const {
    windowStatus: ws,
    verdict: vd,
    currentPriceVnd: curVnd,
    claimedOriginalPriceVnd: origVnd,
    claimedDiscountPct: claimPct,
    priorFloorPriceVnd: flrVnd,
    windowDaysUsed: days,
    isOmnibusCertified: cert,
    deltaVsPriorFloorVnd: dVnd,
    deltaVsPriorFloorPct: dPct,
    claimedVsPriorFloorMarkupVnd: mkVnd,
    claimedVsPriorFloorMarkupPct: mkPct,
    cycle90d: c,
  } = audit;
  const priceOrDash = (vnd: number | null) =>
    vnd != null && vnd > 0 ? formatPriceVnd(vnd, locale) : '-';
  const fmtVnd = (vnd: number) => formatPriceVnd(vnd, locale);
  const fmtNum = (num: number) => formatPlainNumber(num, locale);

  const isFake = vd === 'fake_strikethrough_above_floor';
  const isExag = vd === 'exaggerated_strikethrough';

  const statusBadgeText =
    ws === 'omnibus_30d_certified'
      ? t('oOk')
      : ws === 'partial_window'
        ? t('oPart', { days })
        : ws === 'blackout_gap'
          ? t('oGap')
          : t('oPend');
  const statusBadgeTone: 'good' | 'warn' | 'bad' | 'neutral' =
    ws === 'omnibus_30d_certified'
      ? isFake
        ? 'bad'
        : 'good'
      : ws === 'partial_window' || ws === 'blackout_gap'
        ? 'warn'
        : 'neutral';

  const claimedBadgeText =
    origVnd != null && claimPct != null
      ? t('oClaim', { pct: fmtNum(claimPct), original: fmtVnd(origVnd) })
      : null;

  let currentSubText: string;
  let currentSubTone: 'bad' | 'good' | 'neutral' = 'neutral';
  if (origVnd == null) {
    currentSubText = t('oNoOrig');
  } else if (flrVnd == null) {
    currentSubText = t('oNeed');
  } else if (
    (isFake || isExag || origVnd > Math.round(flrVnd * 1.02)) &&
    mkVnd != null &&
    mkVnd > 0 &&
    mkPct != null
  ) {
    currentSubText = t('oMarkup', {
      markup: fmtVnd(mkVnd),
      pct: fmtNum(mkPct),
    });
    currentSubTone = isFake || isExag ? 'bad' : 'neutral';
  } else {
    currentSubText = t('oAlign');
    currentSubTone = cert ? 'good' : 'neutral';
  }

  const colFloorTitle =
    ws === 'omnibus_30d_certified'
      ? t('oOk')
      : ws === 'partial_window'
        ? t('oPart', { days })
        : t('oFlr');

  let floorDeltaText: string;
  let floorDeltaTone: 'good' | 'bad' | 'neutral' = 'neutral';
  if (flrVnd == null || dVnd == null || dPct == null) {
    floorDeltaText = t('oNeed');
  } else if (dVnd < 0) {
    floorDeltaText = t('oDrop', {
      pct: fmtNum(Math.abs(dPct)),
      amount: fmtVnd(Math.abs(dVnd)),
    });
    floorDeltaTone = 'good';
  } else if (dVnd > 0) {
    floorDeltaText = t(isFake ? 'oFake' : 'oUp', {
      pct: fmtNum(dPct),
      amount: fmtVnd(dVnd),
    });
    floorDeltaTone = 'bad';
  } else if (isFake) {
    floorDeltaText = t('oFake', { pct: fmtNum(0), amount: fmtVnd(0) });
    floorDeltaTone = 'bad';
  } else {
    floorDeltaText = t('oFlat');
  }

  const floorDisclaimerText =
    ws === 'partial_window'
      ? t('oNoteP', { days })
      : ws === 'blackout_gap'
        ? t('oNoteG')
        : null;

  let cycleValueText: string;
  let cycleValueTone: 'good' | 'bad' | 'neutral' = 'neutral';
  const rngSub =
    c.low90dVnd != null && c.high90dVnd != null
      ? t('oRng', { low: fmtVnd(c.low90dVnd), high: fmtVnd(c.high90dVnd) })
      : null;
  let cycleSubText: string;

  if (
    c.signal === 'buy_now_floor' &&
    c.topPercentileDisplay != null &&
    rngSub != null
  ) {
    cycleValueText = t('oBuy', { pct: fmtNum(c.topPercentileDisplay) });
    cycleValueTone = 'good';
    cycleSubText = rngSub;
  } else if (
    c.signal === 'fair_market' &&
    c.percentile != null &&
    rngSub != null
  ) {
    cycleValueText = t('oFair', { pct: fmtNum(c.percentile) });
    cycleSubText = rngSub;
  } else if (
    c.signal === 'above_recent_floor' &&
    c.aboveFloorVnd != null &&
    rngSub != null
  ) {
    cycleValueText = t('oWait', { gap: fmtVnd(c.aboveFloorVnd) });
    cycleValueTone = 'bad';
    cycleSubText = rngSub;
  } else {
    cycleValueText = t('oCycP');
    cycleSubText = t('oCycN', {
      points: c.observedPointDays,
      days: c.observedSpanDays90d,
    });
  }

  return {
    cardTitle: t('oTitle'),
    statusBadgeText,
    statusBadgeTone,
    colCurrentTitle: t('oCur'),
    currentPriceText: priceOrDash(curVnd),
    claimedBadgeText,
    currentSubText,
    currentSubTone,
    colFloorTitle,
    floorPriceText: priceOrDash(flrVnd),
    floorDeltaText,
    floorDeltaTone,
    floorDisclaimerText,
    colCycleTitle: t('oCyc'),
    cycleValueText,
    cycleValueTone,
    cycleSubText,
  };
}

const validPosVnd = (v: unknown): number | null => {
  const n = parseStrictFiniteNumber(v);
  if (n == null) return null;
  const r = Math.round(n);
  return r > 0 && r <= MAX_VALID_VND_PRICE ? r : null;
};

/**
 * Seasonal sale campaign filter predicate for `/deals` (`DealFinderWorkspace`).
 */
export function matchesSeasonalSaleFilter(
  signal: RadarSignal | null | undefined,
  mode: SeasonalSaleFilterMode
): boolean {
  if (mode === 'all') return true;
  if (!signal || typeof signal !== 'object') return false;
  if (mode === 'genuine_sale_drops') {
    const g = signal.genuineDeal;
    return Boolean(
      g &&
      typeof g === 'object' &&
      typeof signal.savingsPct === 'number' &&
      Number.isFinite(signal.savingsPct) &&
      signal.savingsPct > 0 &&
      validPosVnd(g.priceCurrent) != null &&
      validPosVnd(g.savingsVsMedianVnd) != null
    );
  }
  if (mode === 'inflated_presale_warnings') {
    const trap = signal.fakeSaleTrap;
    const cur =
      trap && typeof trap === 'object' ? validPosVnd(trap.priceCurrent) : null;
    const orig =
      trap && typeof trap === 'object' ? validPosVnd(trap.priceOriginal) : null;
    return Boolean(
      typeof signal.fakeMarkupPct === 'number' &&
      Number.isFinite(signal.fakeMarkupPct) &&
      signal.fakeMarkupPct > 0 &&
      cur != null &&
      orig != null &&
      orig > cur
    );
  }
  return true;
}

export function countSeasonalSaleCampaignDeals<T extends { slug: string }>(
  deals: readonly T[],
  getSignal: (slug: string) => RadarSignal | null | undefined
): {
  genuineSaleCount: number;
  inflatedWarningCount: number;
} {
  if (!Array.isArray(deals)) {
    return { genuineSaleCount: 0, inflatedWarningCount: 0 };
  }
  let genuineSaleCount = 0;
  let inflatedWarningCount = 0;
  for (const d of deals) {
    if (!d || typeof d.slug !== 'string') continue;
    const sig = getSignal(d.slug);
    if (matchesSeasonalSaleFilter(sig, 'genuine_sale_drops')) {
      genuineSaleCount++;
    }
    if (matchesSeasonalSaleFilter(sig, 'inflated_presale_warnings')) {
      inflatedWarningCount++;
    }
  }
  return { genuineSaleCount, inflatedWarningCount };
}
