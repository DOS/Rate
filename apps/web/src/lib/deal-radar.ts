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
  return payload as CrossPlatformDealRadarResponse;
}

const MAX_RADAR_ITEMS = 1_000;
const MAX_RADAR_SLUG_LEN = 256;
const MAX_RADAR_VND_PRICE = 1_000_000_000;
const CONTROL_CHAR_RE = /\p{Cc}/gu;

function normalizeRadarSlug(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL_CHAR_RE, '').trim().slice(0, MAX_RADAR_SLUG_LEN);
}

function toSafeRadarPrice(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return Number.POSITIVE_INFINITY;
  }
  if (typeof value === 'string' && !value.trim()) {
    return Number.POSITIVE_INFINITY;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_RADAR_VND_PRICE
    ? n
    : Number.POSITIVE_INFINITY;
}

function toSafeRadarPct(value: unknown, max = 10_000): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  if (typeof value === 'string' && !value.trim()) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
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
  for (const g of (payload.genuineDeals ?? []).slice(0, MAX_RADAR_ITEMS)) {
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
      upsert(slug, { genuineDeal: { ...g, productSlug: slug } });
    }
  }
  for (const t of (payload.fakeSaleTraps ?? []).slice(0, MAX_RADAR_ITEMS)) {
    const slug = normalizeRadarSlug(t?.productSlug);
    if (!slug) continue;
    const prev = map.get(slug)?.fakeSaleTrap;
    const prevMarkup = toSafeRadarPct(prev?.fakeMarkupPct);
    const nextMarkup = toSafeRadarPct(t.fakeMarkupPct);
    const isWorse =
      !prev ||
      nextMarkup > prevMarkup ||
      (nextMarkup === prevMarkup &&
        toSafeRadarPct(t.claimedDiscountPct) >
          toSafeRadarPct(prev.claimedDiscountPct));
    if (isWorse) {
      upsert(slug, { fakeSaleTrap: { ...t, productSlug: slug } });
    }
  }
  for (const sp of (payload.priceSpreadLeaders ?? []).slice(
    0,
    MAX_RADAR_ITEMS
  )) {
    const slug = normalizeRadarSlug(sp?.productSlug);
    if (!slug) continue;
    const prev = map.get(slug)?.priceSpread;
    const prevSpread = toSafeRadarPct(prev?.spreadPct);
    const nextSpread = toSafeRadarPct(sp.spreadPct);
    if (!prev || nextSpread > prevSpread) {
      upsert(slug, { priceSpread: { ...sp, productSlug: slug } });
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
  const targetId = String(merchant?.id || '')
    .replace(CONTROL_CHAR_RE, '')
    .trim()
    .slice(0, 256);
  const nameLower = String(merchant?.name || '')
    .replace(CONTROL_CHAR_RE, '')
    .trim()
    .slice(0, 256)
    .toLowerCase();
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
  const genuineDeals = (payload?.genuineDeals ?? [])
    .slice(0, MAX_RADAR_ITEMS)
    .filter(belongs);
  const fakeSaleTraps = (payload?.fakeSaleTraps ?? [])
    .slice(0, MAX_RADAR_ITEMS)
    .filter(belongs);
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
