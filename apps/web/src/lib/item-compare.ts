// Compare, versus and watchlist per Item (DOS/Rate#1156; design doc
// `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, 5.1). Pure: the
// server layer resolves slugs and applies these only while
// `RATE_ITEM_MODEL` is on.

/** The Item and variant fields these plans read. */
export interface CompareItem {
  id: string;
  slug: string;
  default_variant_id: string | null;
}
export interface CompareVariant {
  id: string;
  slug: string;
  variant_key: string;
}

/** What a compare slug resolves to (the shape of `resolveCatalogSlug`). */
export type CompareResolution =
  | { kind: 'item'; item: CompareItem; variants: readonly CompareVariant[] }
  | {
      kind: 'variant';
      item: CompareItem;
      variant: CompareVariant;
      variants: readonly CompareVariant[];
      retired: boolean;
    }
  | { kind: 'unlinked' }
  | null;

// `slug@256gb` pins a size (design doc 5.1); the key is the literal segment.
const PIN_REGEX = /^([a-z0-9][a-z0-9._-]{0,159})@([a-z0-9][a-z0-9-]{0,40})$/i;

/** A compare token: an Item or variant slug, optionally pinned to a size. */
export function parseCompareToken(
  raw: string,
  /**
   * Keep the slug's letter case, for the exact catalogue lookup (an Item
   * slug with capitals, DOS/Rate#1383). The size key is always lower case.
   */
  keepCase = false
): {
  slug: string;
  variantKey: string | null;
} {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const clean = keepCase ? trimmed : trimmed.toLowerCase();
  const pinned = PIN_REGEX.exec(clean);
  return pinned
    ? { slug: pinned[1]!, variantKey: pinned[2]!.toLowerCase() }
    : { slug: clean, variantKey: null };
}

/** The size an Item shows: the pinned one, else its default, else its first. */
export function pickItemVariant(
  item: CompareItem,
  variants: readonly CompareVariant[],
  variantKey: string | null
): CompareVariant | null {
  return (
    (variantKey && variants.find((v) => v.variant_key === variantKey)) ||
    variants.find((v) => v.id === item.default_variant_id) ||
    variants[0] ||
    null
  );
}

/**
 * The variant a compare token compares, with its Item: an Item slug gives
 * its pinned or default size, an old variant slug itself (a retired size
 * gives the Item's default), a master with no Item itself.
 */
export function compareTarget(
  resolution: CompareResolution,
  token: { slug: string; variantKey: string | null }
): {
  variantSlug: string;
  itemId: string | null;
  itemSlug: string | null;
} | null {
  if (!resolution) return null;
  if (resolution.kind === 'unlinked') {
    return { variantSlug: token.slug, itemId: null, itemSlug: null };
  }
  const { item, variants } = resolution;
  const own =
    resolution.kind === 'variant' && !resolution.retired && !token.variantKey
      ? resolution.variant
      : null;
  const variant = own ?? pickItemVariant(item, variants, token.variantKey);
  return variant
    ? { variantSlug: variant.slug, itemId: item.id, itemSlug: item.slug }
    : null;
}

/**
 * Compare targets in request order, one per Item: a second token naming the
 * same Item is dropped (a same-Item pair is no comparison).
 */
export function dedupeCompareTargets<
  T extends { variantSlug: string; itemId: string | null },
>(targets: readonly (T | null)[]): T[] {
  const seenItems = new Set<string>();
  const seenSlugs = new Set<string>();
  const out: T[] = [];
  for (const t of targets) {
    if (!t || seenSlugs.has(t.variantSlug)) continue;
    if (t.itemId && seenItems.has(t.itemId)) continue;
    if (t.itemId) seenItems.add(t.itemId);
    seenSlugs.add(t.variantSlug);
    out.push(t);
  }
  return out;
}

/** True when `{a}-vs-{b}` parses back to exactly `a` and `b` (both exact and lower-cased). */
function versusRoundTrips(slugA: string, slugB: string): boolean {
  const joined = `${slugA}-vs-${slugB}`;
  const exact = joined.split('-vs-');
  const lower = joined.toLowerCase().split('-vs-');
  return (
    exact.length === 2 &&
    exact[0] === slugA &&
    exact[1] === slugB &&
    lower.length === 2 &&
    lower[0] === slugA.toLowerCase() &&
    lower[1] === slugB.toLowerCase()
  );
}

/**
 * A versus pair in its one canonical order: the two slugs sorted (without
 * regard to case). Each pair has a single URL; the other order 308s to it
 * (DOS/Rate#1367). When the sorted URL would not parse back to the same two
 * slugs (a slug ending in "-vs"), the other order is used if it does.
 */
export function canonicalVersusOrder(
  slugA: string,
  slugB: string
): [string, string] {
  const sorted: [string, string] =
    slugA.toLowerCase() <= slugB.toLowerCase()
      ? [slugA, slugB]
      : [slugB, slugA];
  if (versusRoundTrips(sorted[0], sorted[1])) return sorted;
  const reversed: [string, string] = [sorted[1], sorted[0]];
  return versusRoundTrips(reversed[0], reversed[1]) ? reversed : sorted;
}

/** True when the pair, in this order, makes a versus URL that parses back. */
export function isParseableVersusPair(slugA: string, slugB: string): boolean {
  return versusRoundTrips(slugA, slugB);
}

/**
 * The two compared products in the URL's order. The compare read does not
 * keep the order it was asked in, and the page, its title and its canonical
 * must not flip with it (DOS/Rate#1367). A side the read did not return
 * stays undefined, so the page 404s instead of comparing a product with
 * itself.
 */
export function inPairOrder<T extends { slug: string }>(
  compared: readonly T[],
  pair: readonly string[]
): [T | undefined, T | undefined] {
  const bySlug = (slug: string | undefined) =>
    slug === undefined
      ? undefined
      : compared.find((p) => p.slug.toLowerCase() === slug.toLowerCase());
  return [bySlug(pair[0]), bySlug(pair[1])];
}

// A catalogue slug as it may appear in a versus URL.
// Capitals allowed: an Item slug may carry them, and the requested URL is
// compared exactly with the canonical, so the canonical never redirects to
// itself (DOS/Rate#1383).
const VERSUS_URL_SLUG = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * The canonical versus URL when the request named the pair any other way
 * (the other order, other letter case), else null (DOS/Rate#1367).
 * `requested` is the `[versus]` param, which Next has already decoded, so a
 * percent-encoded alias renders with the canonical tag instead of a 308. A pair whose
 * canonical slugs are not plain catalogue slugs is not redirected: the page
 * 404s as before.
 */
export function versusAliasRedirect(
  requested: string,
  canonicalPath: string
): string | null {
  const slugs = canonicalPath.replace(/^\/compare\//, '').split('-vs-');
  if (
    slugs.length !== 2 ||
    !slugs.every(
      (slug) =>
        VERSUS_URL_SLUG.test(slug) &&
        !slug.includes('..') &&
        !slug.endsWith('.')
    )
  ) {
    return null;
  }
  return `/compare/${requested}` === canonicalPath ? null : canonicalPath;
}

/**
 * A catalogue lookup without regard to letter case, given an exact one: the
 * slug as typed first (an Item slug with capitals), then lower-cased (a
 * capitalised alias of a lower-case slug). Returns the slug it was found
 * under (DOS/Rate#1383).
 */
export async function lookupSlugAnyCase<T>(
  slug: string,
  lookupExact: (slug: string) => Promise<T | null>
): Promise<{ slug: string; found: T | null }> {
  const asTyped = await lookupExact(slug);
  const lower = slug.toLowerCase();
  if (asTyped || lower === slug) return { slug, found: asTyped };
  return { slug: lower, found: await lookupExact(lower) };
}

// Matches resolveCatalogSlug's 120-char and sentinel bounds in rate-api.ts
// plus api-handler's prototype-key denylist so every Item slug emitted into a
// versus URL can be resolved back by slug.
const ITEM_ANSWER_SLUG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;
const UNSAFE_ITEM_SLUG_KEYS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'na',
  'false',
  'true',
  '__proto__',
  'constructor',
  'prototype',
  'tostring',
  'tolocalestring',
  'valueof',
  'hasownproperty',
  'isprototypeof',
  'propertyisenumerable',
  ...Object.getOwnPropertyNames(Object.prototype).map((key) =>
    key.toLowerCase()
  ),
]);

function getOwnRecordField(record: unknown, key: string): unknown {
  return record &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    Object.prototype.hasOwnProperty.call(record, key)
    ? (record as Record<string, unknown>)[key]
    : undefined;
}

function isSafeVersusItemSlug(slug: unknown): slug is string {
  return (
    typeof slug === 'string' &&
    ITEM_ANSWER_SLUG_REGEX.test(slug) &&
    !slug.includes('..') &&
    !slug.endsWith('.') &&
    !(slug in Object.prototype) &&
    !UNSAFE_ITEM_SLUG_KEYS.has(slug.toLowerCase())
  );
}

export type VersusPlan =
  /** Neither side has an Item: today's versus page. */
  | { kind: 'legacy' }
  | { kind: 'not_found' }
  /** An old variant pair: 308 to the Item pair. */
  | { kind: 'redirect'; to: string }
  | { kind: 'render'; slugA: string; slugB: string; canonical: string };

/**
 * A versus URL under Items (design doc 5.1): `{itemA}-vs-{itemB}`. An old
 * variant pair 308s to its Item pair; a same-Item pair is no versus.
 */
export function planVersusRoute(
  sideA: { slug: string; resolution: CompareResolution },
  sideB: { slug: string; resolution: CompareResolution }
): VersusPlan {
  const a = compareTarget(sideA.resolution, parseCompareToken(sideA.slug));
  const b = compareTarget(sideB.resolution, parseCompareToken(sideB.slug));
  if (!a || !b) return { kind: 'not_found' };
  if (!a.itemId && !b.itemId) return { kind: 'legacy' };
  if (a.itemId && a.itemId === b.itemId) return { kind: 'not_found' };
  // A slug holding "-vs-" cannot be one side of a versus URL (it would not
  // parse back), so there is no versus page for that Item (#1275).
  if (
    a.itemSlug?.toLowerCase().includes('-vs-') ||
    b.itemSlug?.toLowerCase().includes('-vs-')
  ) {
    return { kind: 'not_found' };
  }
  // When an Item's stored slug fails versus slug validation (malformed, over
  // 120 chars, dot traversal or sentinel), fall back to the variant slug just
  // like versusHref so fallback 1v1 links render instead of 404ing (#1768).
  const urlSlugA =
    a.itemSlug && isSafeVersusItemSlug(a.itemSlug) ? a.itemSlug : a.variantSlug;
  const urlSlugB =
    b.itemSlug && isSafeVersusItemSlug(b.itemSlug) ? b.itemSlug : b.variantSlug;
  if (
    !isSafeVersusItemSlug(urlSlugA) ||
    !isSafeVersusItemSlug(urlSlugB) ||
    urlSlugA.toLowerCase().includes('-vs-') ||
    urlSlugB.toLowerCase().includes('-vs-')
  ) {
    return { kind: 'not_found' };
  }
  // One URL per pair, the slugs sorted; the other order 308s there (#1367).
  const swapped = canonicalVersusOrder(urlSlugA, urlSlugB)[0] !== urlSlugA;
  // Neither order makes a URL that parses back (a slug ending in "-vs"):
  // no versus page for it, as for a slug holding "-vs-" (#1275).
  if (
    !isParseableVersusPair(
      swapped ? urlSlugB : urlSlugA,
      swapped ? urlSlugA : urlSlugB
    )
  ) {
    return { kind: 'not_found' };
  }
  const [first, second] = swapped ? [b, a] : [a, b];
  const [firstSlug, secondSlug] = swapped
    ? [urlSlugB, urlSlugA]
    : [urlSlugA, urlSlugB];
  const canonical = `/compare/${firstSlug}-vs-${secondSlug}`;
  // Each side comes looked up as typed (then lower-cased) under the slug it
  // was found under, so the Item URL this redirects to resolves to itself
  // and renders: no loop for an Item slug with capitals (DOS/Rate#1383).
  if (firstSlug !== sideA.slug || secondSlug !== sideB.slug) {
    return { kind: 'redirect', to: canonical };
  }
  return {
    kind: 'render',
    slugA: first.variantSlug,
    slugB: second.variantSlug,
    canonical,
  };
}

/**
 * The canonical versus URL for two catalogue slugs: the sides in sorted
 * order (#1367), each named by its Item when `itemSlugBySlug` maps it
 * (RATE_ITEM_MODEL on), so in-app links need no 308 hop (DOS/Rate#1290). A
 * side whose Item slug is unsafe or holds "-vs-" keeps its own slug.
 */
export function versusHref(
  slugA: string,
  slugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): string {
  const side = (slug: string) => {
    const itemSlug = getOwnRecordField(itemSlugBySlug, slug);
    return isSafeVersusItemSlug(itemSlug) &&
      !itemSlug.toLowerCase().includes('-vs-')
      ? itemSlug
      : slug;
  };
  const [first, second] = canonicalVersusOrder(side(slugA), side(slugB));
  return `/compare/${first}-vs-${second}`;
}

/**
 * The Item slug a `/api/v1/rate/products/{slug}` answer names (its `item`,
 * RATE_ITEM_MODEL on), else the slug itself (DOS/Rate#1294, DOS/Rate#1768).
 */
export function itemSlugFromProductAnswer(json: unknown, slug: string): string {
  const item =
    getOwnRecordField(json, 'ok') === true
      ? getOwnRecordField(getOwnRecordField(json, 'data'), 'item')
      : undefined;
  const itemSlug = getOwnRecordField(item, 'slug');
  return isSafeVersusItemSlug(itemSlug) ? itemSlug : slug;
}

/**
 * The product a `/api/v1/rate/products/{slug}` answer carries, with its full
 * spec sheet, or null when the answer is not that product's (DOS/Rate#1515).
 */
export function productFromProductAnswer<T extends { slug: string }>(
  json: unknown,
  slug: string
): T | null {
  const product =
    json && typeof json === 'object' && (json as { ok?: unknown }).ok === true
      ? (json as { data?: { product?: unknown } }).data?.product
      : undefined;
  return product &&
    typeof product === 'object' &&
    !Array.isArray(product) &&
    (product as { slug?: unknown }).slug === slug
    ? (product as T)
    : null;
}
