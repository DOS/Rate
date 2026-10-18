export const DEFAULT_FETCH_ALL_MAX_PAGES = 500;

/**
 * Reads every row of a query in pages. One PostgREST response stops at the
 * project's max-rows (1000 on Supabase) without an error, so full-table reads
 * in jobs must page. Pages advance by the rows actually returned, which also
 * works if max-rows is lowered; the query must have a deterministic order.
 *
 * Enforces a `maxPages` ceiling on non-empty pages so a server or mock that
 * ignores `.range(from, to)` cannot loop indefinitely.
 */
export async function fetchAllPages<T>(
  label: string,
  buildPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxPages = DEFAULT_FETCH_ALL_MAX_PAGES
): Promise<T[]> {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1000;
  const safeMaxPages =
    Number.isFinite(maxPages) && maxPages > 0 ? Math.floor(maxPages) : DEFAULT_FETCH_ALL_MAX_PAGES;
  const rows: T[] = [];
  let nonEmptyPages = 0;
  for (let from = 0; ;) {
    const { data, error } = await buildPage(from, from + safePageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    if (page.length === 0) return rows;
    nonEmptyPages += 1;
    if (nonEmptyPages > safeMaxPages) {
      throw new Error(`${label}: exceeded maxPages (${safeMaxPages}) at offset ${from}`);
    }
    rows.push(...page);
    from += page.length;
  }
}

/**
 * Validates and extracts `{ shopId, itemId, normalizedUrl }` from a Shopee Vietnam
 * product URL (`https://shopee.vn/...-i.<shopId>.<itemId>`, `/product/<shopId>/<itemId>`,
 * or `/opaanlp/<shopId>/<itemId>`). Rejects non-HTTP(S) schemes and non-Shopee hosts.
 */
export function parseShopeeEnqueueUrl(
  rawUrl: string
): { shopId: string; itemId: string; normalizedUrl: string } | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'shopee.vn' && !host.endsWith('.shopee.vn')) {
    return null;
  }
  const match =
    parsed.pathname.match(/(?:a-)?i\.(\d+)\.(\d+)/i) ||
    parsed.pathname.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/i);
  if (!match || !match[1] || !match[2]) {
    return null;
  }
  return {
    shopId: match[1],
    itemId: match[2],
    normalizedUrl: parsed.toString(),
  };
}
