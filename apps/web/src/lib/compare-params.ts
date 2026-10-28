/**
 * The compare page's category query parameter. Links across the site write
 * `?cat=` (leaderboard, versus, home, category pages, the extension) while
 * the page read only `?category=`, so those links opened on smartphones
 * (DOS/Rate#1303). Both are read; `category` wins when both are set.
 */
export function compareCategoryParam(params: {
  category?: string | string[];
  cat?: string | string[];
}): string | undefined {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  return first(params.category) ?? first(params.cat);
}
