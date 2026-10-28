/**
 * Whether a published model can be bought in Vietnam now, from data the site
 * already has (DOS/Rate#1188). A model with no in-stock listing used to show
 * "0 ₫" on its card and no reason on its page.
 */
export type SaleState =
  | 'on_sale'
  | 'sold_out'
  | 'discontinued'
  | 'coming_soon'
  | 'not_listed'
  | 'no_stock';

export const SALE_STATES: readonly SaleState[] = [
  'on_sale',
  'sold_out',
  'discontinued',
  'coming_soon',
  'not_listed',
  'no_stock',
];

/** Values JOY can set in `master_products.metadata.vn_sale_state`. */
const CURATED_STATES = new Set<SaleState>(['discontinued', 'coming_soon']);

// GSMArena-style launch status, e.g. "Discontinued" or "Coming soon. Exp.
// release 2026, Q4".
const DISCONTINUED_STATUS_RE = /\b(?:discontinued|cancell?ed)\b/i;
const COMING_STATUS_RE = /\b(?:coming soon|announced|rumou?red|expected)\b/i;

export interface SaleStateInput {
  /** The lowest plausible in-stock price; 0 or less when none. */
  minPrice: number | null | undefined;
  /**
   * Linked listings, in stock or not; undefined when unknown, as for a
   * master row, whose `merchant_count` counts in-stock stores only.
   */
  listingCount?: number;
  metadata?: unknown;
  /** `specifications.availability.status`. */
  availabilityStatus?: unknown;
}

const curatedState = (metadata: unknown): SaleState | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).vn_sale_state;
  return typeof value === 'string' && CURATED_STATES.has(value as SaleState)
    ? (value as SaleState)
    : null;
};

/**
 * In order:
 * - `on_sale`: an in-stock price exists.
 * - the curated `metadata.vn_sale_state` (`discontinued`, `coming_soon`).
 * - `sold_out`: stores list it, none has stock.
 * - the launch status: `discontinued`, `coming_soon`.
 * - `not_listed` when no store lists it, `no_stock` when that is unknown.
 */
export function masterSaleState(input: SaleStateInput): SaleState {
  const minPrice = Number(input.minPrice ?? 0);
  if (Number.isFinite(minPrice) && minPrice > 0) return 'on_sale';
  const curated = curatedState(input.metadata);
  if (curated) return curated;
  if ((input.listingCount ?? 0) > 0) return 'sold_out';
  const status =
    typeof input.availabilityStatus === 'string'
      ? input.availabilityStatus
      : '';
  if (DISCONTINUED_STATUS_RE.test(status)) return 'discontinued';
  if (COMING_STATUS_RE.test(status)) return 'coming_soon';
  return input.listingCount === 0 ? 'not_listed' : 'no_stock';
}

/** The `saleState` locale key for a state other than `on_sale`. */
export function saleStateLabelKey(
  state: Exclude<SaleState, 'on_sale'>
): 'soldOut' | 'discontinued' | 'comingSoon' | 'notListed' | 'noStock' {
  switch (state) {
    case 'sold_out':
      return 'soldOut';
    case 'discontinued':
      return 'discontinued';
    case 'coming_soon':
      return 'comingSoon';
    case 'not_listed':
      return 'notListed';
    default:
      return 'noStock';
  }
}

/**
 * `masterSaleState` read from a master product row, which carries no count of
 * sold-out listings.
 */
export function saleStateOfMaster(master: {
  min_price?: number | null;
  metadata?: unknown;
  specifications?: unknown;
}): SaleState {
  const specs = master.specifications as
    { availability?: { status?: unknown } } | null | undefined;
  return masterSaleState({
    minPrice: master.min_price,
    metadata: master.metadata,
    availabilityStatus: specs?.availability?.status,
  });
}
