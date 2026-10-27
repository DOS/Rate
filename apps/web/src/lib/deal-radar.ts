/**
 * Single source of truth for Deal Radar on the client and in shared UI code.
 *
 * Radar is a property of a product. Every surface (catalog, leaderboard,
 * watchlist, inspect, compare, exports) must go through this module instead
 * of re-implementing fetch, slug lookup, labels or export columns.
 */
import type {
  CrossPlatformDealRadarItem,
  CrossPlatformDealRadarResponse,
  CrossPlatformPriceSpreadItem,
} from '@/server/rate/deals';

export type RadarVerdict = 'genuine_deal' | 'fake_sale_trap' | 'none';

export interface RadarSignal {
  verdict: RadarVerdict;
  savingsPct: number;
  fakeMarkupPct: number;
  spreadPct: number;
  genuineDeal: CrossPlatformDealRadarItem | null;
  fakeSaleTrap: CrossPlatformDealRadarItem | null;
  priceSpread: CrossPlatformPriceSpreadItem | null;
}

export type RadarIndex = ReadonlyMap<string, RadarSignal>;

/**
 * True only for a deal deals.ts called the multi-platform floor, which needs
 * 3+ offers. A cheaper-than-median offer among 2 is not "Đáy giá đa sàn"
 * (DOS/Rate#1145).
 */
export function isMultiPlatformFloor(
  deal: Pick<CrossPlatformDealRadarItem, 'verdict'> | null | undefined
): boolean {
  return deal?.verdict === 'genuine_all_time_low';
}

export const EMPTY_RADAR_SIGNAL: RadarSignal = Object.freeze({
  verdict: 'none',
  savingsPct: 0,
  fakeMarkupPct: 0,
  spreadPct: 0,
  genuineDeal: null,
  fakeSaleTrap: null,
  priceSpread: null,
});

/** Unwrap the `/api/v1/rate/deals` envelope (`{ data }` or bare payload). */
export function unwrapRadarPayload(
  json: unknown
): CrossPlatformDealRadarResponse | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const raw = (json as { data?: unknown }).data ?? json;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const payload = raw as Partial<CrossPlatformDealRadarResponse>;
  if (!Array.isArray(payload.genuineDeals)) return null;
  if (
    payload.fakeSaleTraps !== undefined &&
    !Array.isArray(payload.fakeSaleTraps)
  ) {
    return null;
  }
  if (
    payload.priceSpreadLeaders !== undefined &&
    !Array.isArray(payload.priceSpreadLeaders)
  ) {
    return null;
  }
  return payload as CrossPlatformDealRadarResponse;
}

const MAX_RADAR_ITEMS = 1_000;
const MAX_RADAR_SLUG_LEN = 256;
const MAX_RADAR_VND_PRICE = 1_000_000_000;
const CONTROL_CHAR_RE = /\p{Cc}/gu;

function normalizeRadarSlug(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(CONTROL_CHAR_RE, '')
    .trim()
    .slice(0, MAX_RADAR_SLUG_LEN);
  if (
    !cleaned ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(cleaned) ||
    cleaned.endsWith('.') ||
    cleaned.includes('..') ||
    /^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function toSafeRadarPrice(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return Number.POSITIVE_INFINITY;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return Number.POSITIVE_INFINITY;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 && n <= MAX_RADAR_VND_PRICE
      ? n
      : Number.POSITIVE_INFINITY;
  }
  return Number.isFinite(value) && value > 0 && value <= MAX_RADAR_VND_PRICE
    ? value
    : Number.POSITIVE_INFINITY;
}

function toSafeRadarPct(value: unknown, max = 10_000): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return 0;
    }
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
  }
  return Number.isFinite(value) && value > 0 ? Math.min(value, max) : 0;
}

function normalizeRadarVerdict(value: unknown): RadarVerdict {
  return value === 'genuine_deal' || value === 'fake_sale_trap'
    ? value
    : 'none';
}

/** Build a slug -> signal index. A genuine deal wins over a trap. */
export function buildRadarIndex(
  payload: CrossPlatformDealRadarResponse | null | undefined
): RadarIndex {
  const map = new Map<string, RadarSignal>();
  if (!payload) return map;
  const upsert = (slug: string, patch: Partial<RadarSignal>) => {
    const prev = map.get(slug) ?? EMPTY_RADAR_SIGNAL;
    map.set(slug, { ...prev, ...patch });
  };
  const genuineDeals = Array.isArray(payload.genuineDeals)
    ? payload.genuineDeals.slice(0, MAX_RADAR_ITEMS)
    : [];
  const fakeSaleTraps = Array.isArray(payload.fakeSaleTraps)
    ? payload.fakeSaleTraps.slice(0, MAX_RADAR_ITEMS)
    : [];
  const priceSpreadLeaders = Array.isArray(payload.priceSpreadLeaders)
    ? payload.priceSpreadLeaders.slice(0, MAX_RADAR_ITEMS)
    : [];
  for (const g of genuineDeals) {
    const slug = normalizeRadarSlug(g?.productSlug);
    if (!slug) continue;
    const prev = map.get(slug)?.genuineDeal;
    const prevSavings = toSafeRadarPct(prev?.savingsVsMedianPct);
    const nextSavings = toSafeRadarPct(g.savingsVsMedianPct);
    const isStronger =
      !prev ||
      nextSavings > prevSavings ||
      (nextSavings === prevSavings &&
        toSafeRadarPrice(g.priceCurrent) < toSafeRadarPrice(prev.priceCurrent));
    if (isStronger) {
      upsert(slug, {
        genuineDeal: {
          ...g,
          productSlug: slug,
          savingsVsMedianPct: nextSavings,
        },
      });
    }
  }
  for (const t of fakeSaleTraps) {
    const slug = normalizeRadarSlug(t?.productSlug);
    if (!slug) continue;
    const prev = map.get(slug)?.fakeSaleTrap;
    const prevMarkup = toSafeRadarPct(prev?.fakeMarkupPct);
    const nextMarkup = toSafeRadarPct(t.fakeMarkupPct);
    const nextClaimed = toSafeRadarPct(t.claimedDiscountPct, 100);
    const isWorse =
      !prev ||
      nextMarkup > prevMarkup ||
      (nextMarkup === prevMarkup &&
        nextClaimed > toSafeRadarPct(prev.claimedDiscountPct, 100));
    if (isWorse) {
      upsert(slug, {
        fakeSaleTrap: {
          ...t,
          productSlug: slug,
          fakeMarkupPct: nextMarkup,
          claimedDiscountPct: nextClaimed,
        },
      });
    }
  }
  for (const sp of priceSpreadLeaders) {
    const slug = normalizeRadarSlug(sp?.productSlug);
    if (!slug) continue;
    const prev = map.get(slug)?.priceSpread;
    const prevSpread = toSafeRadarPct(prev?.spreadPct);
    const nextSpread = toSafeRadarPct(sp.spreadPct);
    if (!prev || nextSpread > prevSpread) {
      upsert(slug, {
        priceSpread: { ...sp, productSlug: slug, spreadPct: nextSpread },
      });
    }
  }
  for (const [slug, sig] of map) {
    const verdict: RadarVerdict = sig.genuineDeal
      ? 'genuine_deal'
      : sig.fakeSaleTrap
        ? 'fake_sale_trap'
        : 'none';
    map.set(slug, {
      ...sig,
      verdict,
      savingsPct: toSafeRadarPct(sig.genuineDeal?.savingsVsMedianPct),
      fakeMarkupPct: toSafeRadarPct(sig.fakeSaleTrap?.fakeMarkupPct),
      spreadPct: toSafeRadarPct(sig.priceSpread?.spreadPct),
    });
  }
  return map;
}

export function getRadarSignal(
  index: RadarIndex | null | undefined,
  slug: string
): RadarSignal {
  const safeSlug = normalizeRadarSlug(slug);
  if (!safeSlug) return EMPTY_RADAR_SIGNAL;
  return index?.get(safeSlug) ?? EMPTY_RADAR_SIGNAL;
}

/** Short human label shared by every badge and Markdown cell. */
export function radarLabel(
  signal?: RadarSignal | null,
  minSpreadPct = 0,
  locale?: string
): string {
  const sig =
    signal && typeof signal === 'object' ? signal : EMPTY_RADAR_SIGNAL;
  const verdict = normalizeRadarVerdict(sig.verdict);
  const loc = locale === 'en' || locale === 'cs' ? locale : 'vi';
  const safeMinSpreadPct =
    typeof minSpreadPct === 'number' &&
    Number.isFinite(minSpreadPct) &&
    minSpreadPct > 0
      ? minSpreadPct
      : 0;
  const safeSavingsPct = toSafeRadarPct(sig.savingsPct);
  const safeFakeMarkupPct = toSafeRadarPct(sig.fakeMarkupPct);
  const safeSpreadPct = toSafeRadarPct(sig.spreadPct);
  if (verdict === 'genuine_deal') {
    const pct = safeSavingsPct.toFixed(1);
    if (!isMultiPlatformFloor(sig.genuineDeal)) {
      if (loc === 'en') return `✅ Below median (-${pct}%)`;
      if (loc === 'cs') return `✅ Pod mediánem (-${pct}%)`;
      return `✅ Dưới giá trung vị (-${pct}%)`;
    }
    if (loc === 'en') return `🔥 Cross-platform low (-${pct}%)`;
    if (loc === 'cs') return `🔥 Minimum napříč obchody (-${pct}%)`;
    return `🔥 Đáy giá đa sàn (-${pct}%)`;
  }
  if (verdict === 'fake_sale_trap') {
    const pct = safeFakeMarkupPct.toFixed(1);
    if (loc === 'en') return `🚨 Fake sale warning (+${pct}%)`;
    if (loc === 'cs') return `🚨 Upozornění na falešnou slevu (+${pct}%)`;
    return `🚨 Cảnh báo giảm giá ảo (+${pct}%)`;
  }
  if (safeSpreadPct > 0 && safeSpreadPct >= safeMinSpreadPct) {
    const pct = safeSpreadPct.toFixed(1);
    if (loc === 'en') return `📊 +${pct}% cross-platform spread`;
    if (loc === 'cs') return `📊 +${pct}% rozdíl mezi e-shopy`;
    return `📊 Lệch giá +${pct}% đa sàn`;
  }
  return '';
}

/** Flat fields used by every Markdown/CSV/JSON export. */
export function radarExportFields(signal?: RadarSignal | null) {
  const sig =
    signal && typeof signal === 'object' ? signal : EMPTY_RADAR_SIGNAL;
  return {
    verdict: normalizeRadarVerdict(sig.verdict),
    savingsPct: toSafeRadarPct(sig.savingsPct),
    fakeMarkupPct: toSafeRadarPct(sig.fakeMarkupPct),
    spreadPct: toSafeRadarPct(sig.spreadPct),
  };
}

export const RADAR_CSV_HEADERS = [
  'RadarVerdict',
  'RadarSavingsPct',
  'RadarFakeMarkupPct',
  'PriceSpreadPct',
] as const;

export function radarCsvCells(signal?: RadarSignal | null): string[] {
  const sig =
    signal && typeof signal === 'object' ? signal : EMPTY_RADAR_SIGNAL;
  return [
    normalizeRadarVerdict(sig.verdict),
    toSafeRadarPct(sig.savingsPct).toFixed(1),
    toSafeRadarPct(sig.fakeMarkupPct).toFixed(1),
    toSafeRadarPct(sig.spreadPct).toFixed(1),
  ];
}

/** Markdown cell content ('-' when there is no signal). */
export function radarMarkdownCell(
  signal?: RadarSignal | null,
  locale?: string
): string {
  return radarLabel(signal, 0, locale) || '-';
}

/** Radar entries that belong to one merchant (matched by id or non-empty name). */
export function selectMerchantRadar(
  payload: CrossPlatformDealRadarResponse | null | undefined,
  merchant: { id: string; name: string }
) {
  const rawTargetId = String(merchant?.id || '')
    .replace(CONTROL_CHAR_RE, '')
    .trim()
    .slice(0, 256);
  const targetId =
    /^[a-zA-Z0-9._-]{1,256}$/.test(rawTargetId) &&
    /[a-zA-Z0-9]/.test(rawTargetId) &&
    !rawTargetId.startsWith('.') &&
    !rawTargetId.endsWith('.') &&
    !rawTargetId.includes('..') &&
    !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(
      rawTargetId
    )
      ? rawTargetId
      : '';
  const rawNameLower = String(merchant?.name || '')
    .replace(CONTROL_CHAR_RE, '')
    .trim()
    .slice(0, 256)
    .toLowerCase();
  const nameLower =
    rawNameLower &&
    !/^(?:0+|null|undefined|nan|infinity|-infinity|true|false)$/i.test(
      rawNameLower
    )
      ? rawNameLower
      : '';
  const belongs = (i: CrossPlatformDealRadarItem) =>
    (Boolean(targetId) &&
      String(i?.merchantId || '')
        .replace(CONTROL_CHAR_RE, '')
        .trim() === targetId) ||
    (Boolean(nameLower) &&
      String(i?.merchantName || '')
        .replace(CONTROL_CHAR_RE, '')
        .trim()
        .toLowerCase() === nameLower);
  const rawDeals = Array.isArray(payload?.genuineDeals)
    ? payload.genuineDeals
    : [];
  const rawTraps = Array.isArray(payload?.fakeSaleTraps)
    ? payload.fakeSaleTraps
    : [];
  const genuineDeals = rawDeals.slice(0, MAX_RADAR_ITEMS).filter(belongs);
  const fakeSaleTraps = rawTraps.slice(0, MAX_RADAR_ITEMS).filter(belongs);
  return {
    genuineDeals,
    fakeSaleTraps,
    genuineDealCount: genuineDeals.length,
    fakeTrapCount: fakeSaleTraps.length,
    bestSavingsPct: genuineDeals.reduce(
      (max, g) => Math.max(max, toSafeRadarPct(g.savingsVsMedianPct)),
      0
    ),
  };
}

export type {
  CrossPlatformDealRadarItem,
  CrossPlatformDealRadarResponse,
  CrossPlatformPriceSpreadItem,
};
