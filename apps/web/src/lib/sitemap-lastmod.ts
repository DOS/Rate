/**
 * Real last-modified dates for sitemap entries (DOS/Rate#786). Google trusts
 * lastmod only when it is accurate, so a page whose change time is unknown
 * gets none rather than the render time.
 */
export interface SitemapDatedRow {
  slug: string;
  categorySlug: string;
  updatedAt: string | null;
}

export interface SitemapLastModified {
  /**
   * Newest product change in the catalogue, if any. A max over the rows that
   * remain, so removing the newest product does not advance it.
   */
  latest: Date | undefined;
  /** Newest product change per category slug. */
  byCategory: Map<string, Date>;
  /** Each product's own change time, by slug. */
  bySlug: Map<string, Date>;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}

function newer(a: Date | undefined, b: Date | undefined): Date | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function buildSitemapLastModified(
  rows: readonly SitemapDatedRow[]
): SitemapLastModified {
  let latest: Date | undefined;
  const byCategory = new Map<string, Date>();
  const bySlug = new Map<string, Date>();
  for (const row of rows) {
    const date = parseDate(row.updatedAt);
    if (!date) continue;
    bySlug.set(row.slug, date);
    latest = newer(latest, date);
    const current = byCategory.get(row.categorySlug);
    byCategory.set(row.categorySlug, newer(current, date)!);
  }
  return { latest, byCategory, bySlug };
}

/** The newer change time of two products, for a versus page. */
export function versusLastModified(
  dates: SitemapLastModified,
  slugA: string,
  slugB: string
): Date | undefined {
  return newer(dates.bySlug.get(slugA), dates.bySlug.get(slugB));
}

/**
 * The newest change among the given times: the merchant directory changes
 * with its stores (risk rescoring) as well as with the catalogue.
 */
export function newestOf(...dates: Array<Date | undefined>): Date | undefined {
  return dates.reduce<Date | undefined>((acc, d) => newer(acc, d), undefined);
}

/** A row's own change time, or undefined when unknown or unparseable. */
export function rowLastModified(
  updatedAt: string | null | undefined
): Date | undefined {
  return parseDate(updatedAt);
}
