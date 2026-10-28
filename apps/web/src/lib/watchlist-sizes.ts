// The size picker of a watchlist entry that names a whole Item (DOS/Rate#1278).
// Price alerts stay per size (design doc Q5): while `RATE_ITEM_MODEL` is on,
// the watchlist API answers such an entry with `size_required`, and a save
// with 422 `SIZE_REQUIRED`, until a size is chosen. Pure, for the client.

/** A size as `/api/v1/rate/products/{slug}` lists it under `variants`. */
export interface WatchlistSizeVariant {
  slug: string;
  name: string;
  variant_key: string;
  storage_gb: number | null;
  min_price: number;
}

export interface WatchlistSizeChoice {
  slug: string;
  name: string;
  label: string;
  minPrice: number;
}

/** The sizes to choose from, in the API's order, one per label. */
export function watchlistSizeChoices(
  rawVariants: unknown,
  formatStorage: (gb: number) => string
): WatchlistSizeChoice[] {
  if (!Array.isArray(rawVariants)) return [];
  const out: WatchlistSizeChoice[] = [];
  const labels = new Set<string>();
  for (const raw of rawVariants as Partial<WatchlistSizeVariant>[]) {
    const slug = typeof raw?.slug === 'string' ? raw.slug : '';
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(slug)) continue;
    const gb = Number(raw.storage_gb);
    const label =
      Number.isFinite(gb) && gb > 0
        ? formatStorage(gb)
        : typeof raw.variant_key === 'string'
          ? raw.variant_key
          : '';
    if (!label || labels.has(label)) continue;
    labels.add(label);
    const price = Number(raw.min_price);
    out.push({
      slug,
      name: typeof raw.name === 'string' && raw.name ? raw.name : slug,
      label,
      minPrice: Number.isFinite(price) && price > 0 ? price : 0,
    });
  }
  return out;
}

/** Whether a save answer means "choose a size first". */
export function isSizeRequiredAnswer(
  status: number,
  payload: unknown
): boolean {
  return (
    status === 422 &&
    !!payload &&
    typeof payload === 'object' &&
    (payload as { code?: unknown }).code === 'SIZE_REQUIRED'
  );
}
