/**
 * ExtensionObservation v1 (DOS/Rate#1606, milestone M2 of
 * Docs/Proposals/2026-10-28-extension-data-source.md): the minimal price,
 * stock and SKU observation an opted-in browser extension sends. It goes to
 * a quarantine table and never to public prices directly.
 *
 * The rules here are repeated by rate.submit_extension_observation in the
 * DOS-Me migration (Docs/Proposals/2026-11-04-dos-me-extension-observations.sql);
 * a change to one needs the other. Plain functions only, no zod, so the
 * extension and client code can import it.
 */

export const EXTENSION_OBSERVATION_VERSION = 1;

const EXTENSION_MARKETPLACES = [
  'shopee',
  'lazada',
  'tiki',
  'tiktok',
  'cellphones',
  'tgdd',
  'fptshop',
  'hoangha',
  'didongviet',
  'phongvu',
] as const;

export type ExtensionMarketplace = (typeof EXTENSION_MARKETPLACES)[number];

const EXTENSION_STOCK_STATES = [
  'in_stock',
  'low_stock',
  'out_of_stock',
  'unknown',
] as const;

export type ExtensionStockState = (typeof EXTENSION_STOCK_STATES)[number];

const EXTENSION_EXTRACTOR_SOURCES = ['json_ld', 'dom', 'mixed'] as const;

/** The hosts each marketplace's listings live on; `.x` also allows subdomains. */
const EXTENSION_MARKETPLACE_HOSTS: Readonly<
  Record<ExtensionMarketplace, readonly string[]>
> = {
  shopee: ['shopee.vn'],
  lazada: ['lazada.vn', '.lazada.vn'],
  tiki: ['tiki.vn'],
  tiktok: ['www.tiktok.com', 'shop.tiktok.com'],
  cellphones: ['cellphones.com.vn'],
  tgdd: ['thegioididong.com', '.thegioididong.com'],
  fptshop: ['fptshop.com.vn'],
  hoangha: ['hoanghamobile.com'],
  didongviet: ['didongviet.vn'],
  phongvu: ['phongvu.vn'],
};

export const EXTENSION_OBSERVATION_LIMITS = {
  urlMax: 2048,
  idMax: 64,
  variantMax: 120,
  priceMin: 1_000,
  priceMax: 2_000_000_000,
  stockQtyMax: 1_000_000,
  extensionVersionMax: 20,
  /** observed_at may run ahead of the server clock by this much. */
  futureSkewMs: 10 * 60 * 1000,
  /** observed_at may be at most this old. */
  maxAgeMs: 24 * 60 * 60 * 1000,
} as const;

export interface ExtensionObservationV1 {
  schema_version: 1;
  marketplace: ExtensionMarketplace;
  listing_url: string;
  external_item_id: string;
  external_shop_id: string | null;
  sku_id: string | null;
  variant_label: string | null;
  price_vnd: number;
  list_price_vnd: number | null;
  stock_state: ExtensionStockState;
  stock_qty: number | null;
  observed_at: string;
  extractor: {
    source: (typeof EXTENSION_EXTRACTOR_SOURCES)[number];
    extension_version: string;
  };
}

export type ExtensionObservationField =
  | keyof ExtensionObservationV1
  | 'observation'
  | 'extractor.source'
  | 'extractor.extension_version';

export type ExtensionObservationResult =
  | { ok: true; value: ExtensionObservationV1 }
  | { ok: false; field: ExtensionObservationField };

const KEYS: readonly (keyof ExtensionObservationV1)[] = [
  'schema_version',
  'marketplace',
  'listing_url',
  'external_item_id',
  'external_shop_id',
  'sku_id',
  'variant_label',
  'price_vnd',
  'list_price_vnd',
  'stock_state',
  'stock_qty',
  'observed_at',
  'extractor',
];

const ID_RE = /^[A-Za-z0-9_.-]+$/;
const VERSION_RE = /^[0-9A-Za-z.+-]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

function idOk(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length >= 1 &&
    v.length <= EXTENSION_OBSERVATION_LIMITS.idMax &&
    ID_RE.test(v)
  );
}

const nullableId = (v: unknown) => v === null || idOk(v);

const priceOk = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isInteger(v) &&
  v >= EXTENSION_OBSERVATION_LIMITS.priceMin &&
  v <= EXTENSION_OBSERVATION_LIMITS.priceMax;

/** True when `host` is one of the marketplace's listing hosts. */
export function isExtensionMarketplaceHost(
  marketplace: ExtensionMarketplace,
  host: string
): boolean {
  const h = host.toLowerCase();
  return EXTENSION_MARKETPLACE_HOSTS[marketplace].some((allowed) => {
    if (!allowed.startsWith('.')) return h === allowed;
    // A subdomain: non-empty labels of [a-z0-9-] before the base domain,
    // as the RPC's ^([a-z0-9-]+\.)*base$ requires. No pattern is built
    // from data.
    if (h === allowed.slice(1)) return true;
    if (!h.endsWith(allowed)) return false;
    return /^(?:[a-z0-9-]+\.)+$/.test(
      h.slice(0, h.length - allowed.length + 1)
    );
  });
}

/** Code points, as the database's char_length counts them. */
const codePoints = (v: string) => Array.from(v).length;

/** An unpaired UTF-16 surrogate, which Postgres jsonb cannot store. */
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// The same checks as the RPC: no query, fragment, path parameters, space or
// control character anywhere; https; a lowercase host with no user or port.
// eslint-disable-next-line no-control-regex
const URL_FORBIDDEN_RE = /[?#;\s\u0000-\u001f\u007f-\u009f]/;

function listingUrlOk(v: unknown, marketplace: ExtensionMarketplace): boolean {
  if (
    typeof v !== 'string' ||
    codePoints(v) > EXTENSION_OBSERVATION_LIMITS.urlMax ||
    URL_FORBIDDEN_RE.test(v) ||
    LONE_SURROGATE_RE.test(v)
  ) {
    return false;
  }
  const host = /^https:\/\/([^/]*)/.exec(v)?.[1];
  return (
    typeof host === 'string' &&
    /^[a-z0-9.-]+$/.test(host) &&
    isExtensionMarketplaceHost(marketplace, host)
  );
}

/** ISO 8601 with a zone, as the RPC requires it. */
// Seconds stop at 59 and offsets at ±15:59, the range Postgres accepts.
const OBSERVED_AT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:0\d|1[0-5])(?::?[0-5]\d)?)$/;

function observedAtMs(v: unknown): number {
  if (typeof v !== 'string' || !OBSERVED_AT_RE.test(v)) return Number.NaN;
  // Date.parse wants the offset as ±hh:mm.
  const normalized = v
    .replace(/([+-]\d{2})$/, '$1:00')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Date.parse(normalized);
}

/**
 * Checks an observation against v1 at server time `nowMs`. It refuses what
 * the RPC refuses; the field it names is the first rule broken in this order,
 * which can differ from the RPC's when several rules break (an unknown key is
 * `observation` here and its own name there).
 */
export function parseExtensionObservationV1(
  raw: unknown,
  nowMs: number = Date.now()
): ExtensionObservationResult {
  const fail = (field: ExtensionObservationField) =>
    ({ ok: false, field }) as const;
  if (!isRecord(raw)) return fail('observation');
  for (const key of Object.keys(raw)) {
    if (!(KEYS as readonly string[]).includes(key)) return fail('observation');
  }
  if (raw.schema_version !== EXTENSION_OBSERVATION_VERSION) {
    return fail('schema_version');
  }
  const marketplace = raw.marketplace;
  if (!has(EXTENSION_MARKETPLACES, marketplace)) return fail('marketplace');
  if (!listingUrlOk(raw.listing_url, marketplace)) return fail('listing_url');
  if (!idOk(raw.external_item_id)) return fail('external_item_id');
  if (!nullableId(raw.external_shop_id)) return fail('external_shop_id');
  if (!nullableId(raw.sku_id)) return fail('sku_id');
  const variant = raw.variant_label;
  if (
    variant !== null &&
    (typeof variant !== 'string' ||
      codePoints(variant) < 1 ||
      LONE_SURROGATE_RE.test(variant) ||
      codePoints(variant) > EXTENSION_OBSERVATION_LIMITS.variantMax ||
      CONTROL_RE.test(variant))
  ) {
    return fail('variant_label');
  }
  if (!priceOk(raw.price_vnd)) return fail('price_vnd');
  const listPrice = raw.list_price_vnd;
  if (
    listPrice !== null &&
    (!priceOk(listPrice) || listPrice < raw.price_vnd)
  ) {
    return fail('list_price_vnd');
  }
  if (!has(EXTENSION_STOCK_STATES, raw.stock_state)) return fail('stock_state');
  const qty = raw.stock_qty;
  if (
    qty !== null &&
    (typeof qty !== 'number' ||
      !Number.isInteger(qty) ||
      qty < 0 ||
      qty > EXTENSION_OBSERVATION_LIMITS.stockQtyMax)
  ) {
    return fail('stock_qty');
  }
  const observedMs = observedAtMs(raw.observed_at);
  if (
    !Number.isFinite(observedMs) ||
    observedMs > nowMs + EXTENSION_OBSERVATION_LIMITS.futureSkewMs ||
    observedMs < nowMs - EXTENSION_OBSERVATION_LIMITS.maxAgeMs
  ) {
    return fail('observed_at');
  }
  const extractor = raw.extractor;
  if (!isRecord(extractor)) return fail('extractor');
  for (const key of Object.keys(extractor)) {
    if (key !== 'source' && key !== 'extension_version')
      return fail('extractor');
  }
  if (!has(EXTENSION_EXTRACTOR_SOURCES, extractor.source)) {
    return fail('extractor.source');
  }
  const version = extractor.extension_version;
  if (
    typeof version !== 'string' ||
    version.length < 1 ||
    version.length > EXTENSION_OBSERVATION_LIMITS.extensionVersionMax ||
    !VERSION_RE.test(version)
  ) {
    return fail('extractor.extension_version');
  }
  return {
    ok: true,
    value: {
      schema_version: 1,
      marketplace,
      listing_url: raw.listing_url as string,
      external_item_id: raw.external_item_id as string,
      external_shop_id: raw.external_shop_id as string | null,
      sku_id: raw.sku_id as string | null,
      variant_label: variant as string | null,
      price_vnd: raw.price_vnd as number,
      list_price_vnd: listPrice as number | null,
      stock_state: raw.stock_state as ExtensionStockState,
      stock_qty: qty as number | null,
      observed_at: raw.observed_at as string,
      extractor: {
        source: extractor.source,
        extension_version: version,
      },
    },
  };
}

// Exported here: an `export const` holding strings would read as an import
// to the rules bundle check in shared-data.test.ts.
export {
  EXTENSION_MARKETPLACES,
  EXTENSION_STOCK_STATES,
  EXTENSION_EXTRACTOR_SOURCES,
  EXTENSION_MARKETPLACE_HOSTS,
};
