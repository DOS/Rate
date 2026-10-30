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
const PIN_REGEX = /^([a-z0-9][a-z0-9._-]{0,159})@([a-z0-9][a-z0-9-]{0,40})$/;

/** A compare token: an Item or variant slug, optionally pinned to a size. */
export function parseCompareToken(raw: string): {
  slug: string;
  variantKey: string | null;
} {
  const clean = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  const pinned = PIN_REGEX.exec(clean);
  return pinned
    ? { slug: pinned[1]!, variantKey: pinned[2]! }
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

/** True when `{a}-vs-{b}` parses back to exactly `a` and `b`. */
function versusRoundTrips(slugA: string, slugB: string): boolean {
  const parts = `${slugA}-vs-${slugB}`.split('-vs-');
  return parts.length === 2 && parts[0] === slugA && parts[1] === slugB;
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
const VERSUS_URL_SLUG = /^[a-z0-9][a-z0-9._-]*$/;

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
    !slugs.every((slug) => VERSUS_URL_SLUG.test(slug) && !slug.includes('..'))
  ) {
    return null;
  }
  return `/compare/${requested}` === canonicalPath ? null : canonicalPath;
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
  const urlSlugA = a.itemSlug ?? a.variantSlug;
  const urlSlugB = b.itemSlug ?? b.variantSlug;
  // A slug holding "-vs-" cannot be one side of a versus URL (it would not
  // parse back), so there is no versus page for it (#1275).
  if (urlSlugA.includes('-vs-') || urlSlugB.includes('-vs-')) {
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
 * side whose Item slug holds "-vs-" keeps its own slug.
 */
export function versusHref(
  slugA: string,
  slugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null
): string {
  const side = (slug: string) => {
    const itemSlug = itemSlugBySlug?.[slug];
    return itemSlug && !itemSlug.includes('-vs-') ? itemSlug : slug;
  };
  const [first, second] = canonicalVersusOrder(side(slugA), side(slugB));
  return `/compare/${first}-vs-${second}`;
}

/**
 * The Item slug a `/api/v1/rate/products/{slug}` answer names (its `item`,
 * RATE_ITEM_MODEL on), else the slug itself (DOS/Rate#1294).
 */
export function itemSlugFromProductAnswer(json: unknown, slug: string): string {
  const itemSlug =
    json && typeof json === 'object' && (json as { ok?: unknown }).ok === true
      ? (json as { data?: { item?: { slug?: unknown } } }).data?.item?.slug
      : undefined;
  return typeof itemSlug === 'string' &&
    /^[a-z0-9][a-z0-9._-]{0,159}$/.test(itemSlug)
    ? itemSlug
    : slug;
}
