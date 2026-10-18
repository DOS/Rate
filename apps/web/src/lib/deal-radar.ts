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
  const raw = (json as { data?: unknown } | null)?.data ?? json;
  const payload = raw as Partial<CrossPlatformDealRadarResponse> | null;
  if (!payload || !Array.isArray(payload.genuineDeals)) return null;
  return payload as CrossPlatformDealRadarResponse;
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
  for (const g of payload.genuineDeals ?? []) {
    if (!g?.productSlug) continue;
    upsert(g.productSlug, {
      genuineDeal: map.get(g.productSlug)?.genuineDeal ?? g,
    });
  }
  for (const t of payload.fakeSaleTraps ?? []) {
    if (!t?.productSlug) continue;
    upsert(t.productSlug, {
      fakeSaleTrap: map.get(t.productSlug)?.fakeSaleTrap ?? t,
    });
  }
  for (const sp of payload.priceSpreadLeaders ?? []) {
    if (!sp?.productSlug) continue;
    upsert(sp.productSlug, {
      priceSpread: map.get(sp.productSlug)?.priceSpread ?? sp,
    });
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
      savingsPct: Math.abs(sig.genuineDeal?.savingsVsMedianPct ?? 0),
      fakeMarkupPct: Math.abs(sig.fakeSaleTrap?.fakeMarkupPct ?? 0),
      spreadPct: sig.priceSpread?.spreadPct ?? 0,
    });
  }
  return map;
}

export function getRadarSignal(
  index: RadarIndex | null | undefined,
  slug: string
): RadarSignal {
  return index?.get(slug) ?? EMPTY_RADAR_SIGNAL;
}

/** Short human label shared by every badge and Markdown cell. */
export function radarLabel(
  signal?: RadarSignal | null,
  minSpreadPct = 0,
  locale?: string
): string {
  const sig = signal ?? EMPTY_RADAR_SIGNAL;
  const loc = locale === 'en' || locale === 'cs' ? locale : 'vi';
  if (sig.verdict === 'genuine_deal') {
    const pct = sig.savingsPct.toFixed(1);
    if (loc === 'en') return `🔥 60D Low (-${pct}%)`;
    if (loc === 'cs') return `🔥 60D minimum (-${pct}%)`;
    return `🔥 Đáy giá 60N (-${pct}%)`;
  }
  if (sig.verdict === 'fake_sale_trap') {
    const pct = sig.fakeMarkupPct.toFixed(1);
    if (loc === 'en') return `🚨 Fake Sale Alert (+${pct}%)`;
    if (loc === 'cs') return `🚨 Falešná sleva (+${pct}%)`;
    return `🚨 Cảnh báo Sale Ảo (+${pct}%)`;
  }
  if (sig.spreadPct > 0 && sig.spreadPct >= minSpreadPct) {
    const pct = sig.spreadPct.toFixed(1);
    if (loc === 'en') return `📊 +${pct}% cross-platform spread`;
    if (loc === 'cs') return `📊 +${pct}% rozdíl mezi e-shopy`;
    return `📊 Lệch giá +${pct}% đa sàn`;
  }
  return '';
}

/** Flat fields used by every Markdown/CSV/JSON export. */
export function radarExportFields(signal?: RadarSignal | null) {
  const sig = signal ?? EMPTY_RADAR_SIGNAL;
  return {
    verdict: sig.verdict,
    savingsPct: sig.savingsPct,
    fakeMarkupPct: sig.fakeMarkupPct,
    spreadPct: sig.spreadPct,
  };
}

export const RADAR_CSV_HEADERS = [
  'RadarVerdict',
  'RadarSavingsPct',
  'RadarFakeMarkupPct',
  'PriceSpreadPct',
] as const;

export function radarCsvCells(signal?: RadarSignal | null): string[] {
  const sig = signal ?? EMPTY_RADAR_SIGNAL;
  return [
    sig.verdict,
    sig.savingsPct.toFixed(1),
    sig.fakeMarkupPct.toFixed(1),
    sig.spreadPct.toFixed(1),
  ];
}

/** Markdown cell content ('-' when there is no signal). */
export function radarMarkdownCell(
  signal?: RadarSignal | null,
  locale?: string
): string {
  return radarLabel(signal, 0, locale) || '-';
}

/** Radar entries that belong to one merchant (matched by id or name). */
export function selectMerchantRadar(
  payload: CrossPlatformDealRadarResponse | null | undefined,
  merchant: { id: string; name: string }
) {
  const nameLower = merchant.name.toLowerCase();
  const belongs = (i: CrossPlatformDealRadarItem) =>
    i.merchantId === merchant.id || i.merchantName.toLowerCase() === nameLower;
  const genuineDeals = (payload?.genuineDeals ?? []).filter(belongs);
  const fakeSaleTraps = (payload?.fakeSaleTraps ?? []).filter(belongs);
  return {
    genuineDeals,
    fakeSaleTraps,
    genuineDealCount: genuineDeals.length,
    fakeTrapCount: fakeSaleTraps.length,
    bestSavingsPct: genuineDeals.reduce(
      (max, g) => Math.max(max, Number(g.savingsVsMedianPct || 0)),
      0
    ),
  };
}

export type {
  CrossPlatformDealRadarItem,
  CrossPlatformDealRadarResponse,
  CrossPlatformPriceSpreadItem,
};
