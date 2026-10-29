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

/**
 * A versus pair in its one canonical order, the two slugs sorted. Each pair
 * has a single URL: the other order 308s to it (DOS/Rate#1367).
 */
export function canonicalVersusOrder(
  slugA: string,
  slugB: string
): [string, string] {
  return slugA <= slugB ? [slugA, slugB] : [slugB, slugA];
}

/**
 * The two compared products in the URL's order. The compare read does not
 * keep the order it was asked in, and the page, its title and its canonical
 * must not flip with it (DOS/Rate#1367).
 */
export function inPairOrder<T extends { slug: string }>(
  compared: readonly T[],
  pair: readonly string[]
): [T | undefined, T | undefined] {
  const bySlug = (slug: string | undefined) =>
    slug === undefined
      ? undefined
      : compared.find((p) => p.slug.toLowerCase() === slug.toLowerCase());
  const a = bySlug(pair[0]) ?? compared[0];
  const b = bySlug(pair[1]) ?? compared.find((p) => p !== a);
  return [a, b];
}

/**
 * Master-product route: the URL of the pair in its canonical order (slugs
 * sorted) when the request named it the other way round, else null
 * (DOS/Rate#1367). The Item route sorts in planVersusRoute.
 */
export function legacyVersusRedirect(
  pair: readonly [string, string]
): string | null {
  const [first, second] = canonicalVersusOrder(pair[0], pair[1]);
  return first === pair[0] ? null : `/compare/${first}-vs-${second}`;
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
  const swapped = urlSlugA > urlSlugB;
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
