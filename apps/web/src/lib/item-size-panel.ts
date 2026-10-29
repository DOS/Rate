/**
 * One size of an Item page as the browser loads it on demand (DOS/Rate#1285).
 * An Item with many sizes renders only its default size on the server; the
 * other sizes come from `/api/v1/rate/item-size/{variant slug}` when picked,
 * so the RSC payload does not grow with every size (#1281 measured about
 * 30 KB per size). Types and the trigger only: no server code.
 */
import type {
  MasterProductPriceHistorySummary,
  MerchantOffer,
} from './rate-api';
import type { RadarSignal } from './deal-radar';
import type { SaleState } from './sale-state';

export interface ItemSizePanelData {
  product: {
    id: string;
    slug: string;
    name: string;
    brand: string;
    model_key: string;
    image: string | null;
  };
  offers: MerchantOffer[];
  priceHistory: MasterProductPriceHistorySummary;
  radarSignal: RadarSignal;
  stats: { minPrice: number; maxPrice: number; sellerCount: number };
  saleState: SaleState;
  /** The `saleState` message key when the size is not on sale, else null. */
  saleStateKey: string | null;
}

/** Item-level facts every size's price strip shows the same. */
export interface ItemSizeStripContext {
  categoryPath: string;
  userScore5: number;
  expertScore10: number | null;
  authenticReviews: number;
  keySpecLine: string;
}

/** More sizes than this load on demand. */
export const LAZY_ITEM_SIZES_ABOVE = 4;
/** Or when the other sizes' panel data would add about this many bytes. */
export const LAZY_ITEM_PANEL_BYTES = 150_000;

/**
 * Whether an Item page loads its other sizes on demand: above 4 sizes, or
 * when the other sizes' offers and history would add about 150 KB.
 */
export function shouldLazyLoadSizes(
  sizeCount: number,
  otherSizesBytes: number
): boolean {
  return (
    sizeCount > LAZY_ITEM_SIZES_ABOVE ||
    (sizeCount > 1 && otherSizesBytes >= LAZY_ITEM_PANEL_BYTES)
  );
}

/** The size panel route of a variant slug. */
export function itemSizePanelPath(variantSlug: string): string {
  return `/api/v1/rate/item-size/${encodeURIComponent(variantSlug)}`;
}
