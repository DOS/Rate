/**
 * Real last-modified dates for sitemap entries (DOS/Rate#786). Google trusts
 * lastmod only when it is accurate, so a page whose change time is unknown
 * gets none rather than the render time.
 */
export interface SitemapDatedRow {
  slug: string;
  categorySlug: string;
  updatedAt: string | null;
  /**
   * Optional fallback or alias slugs (such as variant slugs grouped into an
   * Item row) so `versusLastModified` resolves change times cleanly whether a
   * 1v1 URL uses the canonical Item slug or falls back to a variant slug.
   */
  fallbackSlugs?: readonly (string | null | undefined)[];
}

export type SitemapSlugInput =
  string | null | undefined | readonly (string | null | undefined)[];

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

interface SitemapSlugLookupCache {
  fallbackByLower: Map<string, Date>;
  snapshot: Array<[string, Date]>;
  byLowerSlug: Map<string, Date>;
}

const SLUG_LOOKUP_CACHE = new WeakMap<
  SitemapLastModified,
  SitemapSlugLookupCache
>();

const MIN_SITEMAP_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const RESERVED_SITEMAP_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'null',
  'undefined',
  'nan',
  'true',
  'false',
]);

function cleanSitemapSlug(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  if (raw.length > maxLen + 64) return '';
  const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
  if (
    !cleaned ||
    cleaned.length > maxLen ||
    RESERVED_SITEMAP_KEYS.has(cleaned.toLowerCase()) ||
    !/^[a-zA-Z0-9._-]+$/.test(cleaned) ||
    !/[a-zA-Z0-9]/.test(cleaned) ||
    /^(?:0+|\.+|-+|_+)$/.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/\p{Cc}+/gu, '').trim();
  if (!trimmed || trimmed.length > 64) return undefined;
  const ms = Date.parse(trimmed);
  if (
    !Number.isFinite(ms) ||
    ms < MIN_SITEMAP_TIMESTAMP_MS ||
    ms > Date.now() + MAX_FUTURE_SKEW_MS
  ) {
    return undefined;
  }
  return new Date(ms);
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
  const fallbackByLower = new Map<string, Date>();
  const byLowerSlug = new Map<string, Date>();
  if (!Array.isArray(rows)) {
    const empty: SitemapLastModified = { latest, byCategory, bySlug };
    SLUG_LOOKUP_CACHE.set(empty, {
      fallbackByLower,
      snapshot: [],
      byLowerSlug,
    });
    return empty;
  }
  for (const row of rows.slice(0, 10_000)) {
    if (!row || typeof row !== 'object') continue;
    const primarySlug = cleanSitemapSlug(row.slug, 256);
    const fallbackSlugs = Array.isArray(row.fallbackSlugs)
      ? row.fallbackSlugs
          .slice(0, 64)
          .map((candidate: unknown) => cleanSitemapSlug(candidate, 256))
          .filter(Boolean)
      : [];
    const effectiveSlug = primarySlug || fallbackSlugs[0] || '';
    const categorySlug = cleanSitemapSlug(row.categorySlug, 64);
    if (!effectiveSlug || !categorySlug) continue;
    const date = parseDate(row.updatedAt);
    if (!date) continue;
    bySlug.set(effectiveSlug, newer(bySlug.get(effectiveSlug), date)!);
    const lowerEffective = effectiveSlug.toLowerCase();
    byLowerSlug.set(
      lowerEffective,
      newer(byLowerSlug.get(lowerEffective), date)!
    );
    const extraFallbacks = primarySlug ? fallbackSlugs : fallbackSlugs.slice(1);
    for (const fallbackSlug of extraFallbacks) {
      const lowerFallback = fallbackSlug.toLowerCase();
      fallbackByLower.set(
        lowerFallback,
        newer(fallbackByLower.get(lowerFallback), date)!
      );
      byLowerSlug.set(
        lowerFallback,
        newer(byLowerSlug.get(lowerFallback), date)!
      );
    }
    latest = newer(latest, date);
    const current = byCategory.get(categorySlug);
    byCategory.set(categorySlug, newer(current, date)!);
  }
  const result: SitemapLastModified = { latest, byCategory, bySlug };
  SLUG_LOOKUP_CACHE.set(result, {
    fallbackByLower,
    snapshot: [...bySlug.entries()],
    byLowerSlug,
  });
  return result;
}

function isBySlugSnapshotFresh(
  bySlug: Map<string, Date>,
  snapshot: ReadonlyArray<[string, Date]>
): boolean {
  if (bySlug.size !== snapshot.length) return false;
  for (const [key, date] of snapshot) {
    if (bySlug.get(key) !== date) return false;
  }
  return true;
}

function getLowerSlugIndex(dates: SitemapLastModified): Map<string, Date> {
  const cached = SLUG_LOOKUP_CACHE.get(dates);
  if (cached && isBySlugSnapshotFresh(dates.bySlug, cached.snapshot)) {
    return cached.byLowerSlug;
  }
  const fallbackByLower = cached?.fallbackByLower ?? new Map<string, Date>();
  const rebuilt = new Map<string, Date>(fallbackByLower);
  for (const [rawSlug, date] of dates.bySlug) {
    const clean = cleanSitemapSlug(rawSlug, 256);
    if (!clean || !(date instanceof Date) || !Number.isFinite(date.getTime())) {
      continue;
    }
    const lower = clean.toLowerCase();
    rebuilt.set(lower, newer(rebuilt.get(lower), date)!);
  }
  SLUG_LOOKUP_CACHE.set(dates, {
    fallbackByLower,
    snapshot: [...dates.bySlug.entries()],
    byLowerSlug: rebuilt,
  });
  return rebuilt;
}

function collectCandidateSlugs(
  primary: SitemapSlugInput,
  fallback?: SitemapSlugInput
): string[] {
  const out: string[] = [];
  const push = (input: SitemapSlugInput) => {
    if (typeof input === 'string') {
      const cleaned = cleanSitemapSlug(input, 256);
      if (cleaned) out.push(cleaned);
      return;
    }
    if (Array.isArray(input)) {
      for (const candidate of input.slice(0, 16)) {
        const cleaned = cleanSitemapSlug(candidate, 256);
        if (cleaned) out.push(cleaned);
      }
    }
  };
  push(primary);
  push(fallback);
  return out;
}

function resolveSideLastModified(
  dates: SitemapLastModified,
  primary: SitemapSlugInput,
  fallback?: SitemapSlugInput
): Date | undefined {
  const candidates = collectCandidateSlugs(primary, fallback);
  if (candidates.length === 0) return undefined;
  const byLower = getLowerSlugIndex(dates);
  let resolved: Date | undefined;
  for (const slug of candidates) {
    const exact = dates.bySlug.get(slug);
    if (exact instanceof Date && Number.isFinite(exact.getTime())) {
      resolved = newer(resolved, exact);
    }
    const lowerMatch = byLower.get(slug.toLowerCase());
    if (lowerMatch instanceof Date && Number.isFinite(lowerMatch.getTime())) {
      resolved = newer(resolved, lowerMatch);
    }
  }
  return resolved;
}

/**
 * The newer change time of two products, for a versus page. Each side accepts
 * a single slug or candidate slugs (canonical Item slug and fallback variant
 * slug) and matches `bySlug` both exact and case-insensitively.
 */
export function versusLastModified(
  dates: SitemapLastModified,
  slugA: SitemapSlugInput,
  slugB: SitemapSlugInput,
  fallbackSlugA?: SitemapSlugInput,
  fallbackSlugB?: SitemapSlugInput
): Date | undefined {
  if (!dates || !(dates.bySlug instanceof Map)) return undefined;
  return newer(
    resolveSideLastModified(dates, slugA, fallbackSlugA),
    resolveSideLastModified(dates, slugB, fallbackSlugB)
  );
}

/**
 * The newest change among the given times: the merchant directory changes
 * with its stores (risk rescoring) as well as with the catalogue.
 */
export function newestOf(...dates: Array<Date | undefined>): Date | undefined {
  return dates
    .slice(0, 1000)
    .reduce<Date | undefined>(
      (acc, d) =>
        d instanceof Date && Number.isFinite(d.getTime()) ? newer(acc, d) : acc,
      undefined
    );
}

/** A row's own change time, or undefined when unknown or unparseable. */
export function rowLastModified(
  updatedAt: string | null | undefined
): Date | undefined {
  return parseDate(updatedAt);
}
