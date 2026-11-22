/**
 * Pure helpers for the product page per Item (DOS/Rate#1154, #1819; design doc
 * `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, section 5.1).
 */
import { catalogRowSlug } from './item-directory';
import {
  canonicalVersusOrder,
  isParseableVersusPair,
  itemSlugFromProductAnswer,
  parseCompareToken,
  versusHref,
} from './item-compare';

/** The `?v=` value shape the redirects write (a literal `variant_key`). */
const VARIANT_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function cleanVariantKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().toLowerCase();
  return VARIANT_KEY_REGEX.test(clean) ? clean : null;
}

/**
 * A variant's display label: its stored name, else its size from storage
 * (1024 GB reads as 1TB), else the key itself. Labels are never keys (4.2).
 */
export function itemVariantLabel(variant: {
  variant_key: string;
  variant_name?: string | null;
  storage_gb?: number | null;
}): string {
  const name = variant.variant_name?.trim();
  if (name) return name;
  const gb = Number(variant.storage_gb);
  if (Number.isFinite(gb) && gb > 0) {
    return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024}TB` : `${gb}GB`;
  }
  const sized = /^(\d+)(gb|tb)$/i.exec(variant.variant_key);
  if (sized) {
    const n = Number(sized[1]);
    return sized[2]!.toLowerCase() === 'gb' && n >= 1024 && n % 1024 === 0
      ? `${n / 1024}TB`
      : `${n}${sized[2]!.toUpperCase()}`;
  }
  return variant.variant_key;
}

/**
 * The Item's "from" stats over its sized variants only: the cheapest priced
 * size, the top of the dearest, and the most sellers any one size has (a
 * floor for distinct sellers). Listings whose size is not stated never count
 * (Q2); the Item row's merchant_count includes them, so it is not used.
 */
export function itemFromStats(
  variants: readonly {
    min_price?: number | null;
    max_price?: number | null;
    merchant_count?: number | null;
  }[]
): { minPrice: number; maxPrice: number; sellerCount: number } {
  const priced = variants.filter((v) => Number(v.min_price) > 0);
  if (priced.length === 0) return { minPrice: 0, maxPrice: 0, sellerCount: 0 };
  const minPrice = Math.min(...priced.map((v) => Number(v.min_price)));
  const maxPrice = Math.max(
    ...priced.map((v) =>
      Math.max(Number(v.max_price) || 0, Number(v.min_price))
    )
  );
  const sellerCount = Math.max(
    1,
    ...priced.map((v) => Math.max(0, Math.floor(Number(v.merchant_count) || 0)))
  );
  return { minPrice, maxPrice, sellerCount };
}

/** Category peers without the Item's own sizes: a sibling is no competitor. */
export function withoutItemSiblings<T extends { slug: string }>(
  peers: readonly T[],
  siblingSlugs: Iterable<string>
): T[] {
  const skip = new Set(siblingSlugs);
  return peers.filter((peer) => !skip.has(peer.slug));
}

export interface ItemPeerCurrentContext {
  productId?: string | null;
  productSlug: string;
  itemSlug?: string | null;
  siblingSlugs?: Iterable<string>;
  siblingIds?: Iterable<string>;
}

const COMPARE_PIN_TOKEN_REGEX =
  /^[a-z0-9][a-z0-9._-]{0,159}@[a-z0-9][a-z0-9-]{0,40}$/i;
const SAFE_CATALOG_SLUG_REGEX = /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9._-]{1,120}$/;
const UNSAFE_CATALOG_SLUG_KEYS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'na',
  'infinity',
  '-infinity',
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

function stripControlAndTrim(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\p{Cc}+/gu, '').trim() : '';
}

function isSafeCatalogSlugToken(slug: string): boolean {
  return (
    Boolean(slug) &&
    SAFE_CATALOG_SLUG_REGEX.test(slug) &&
    !/^0+$/.test(slug) &&
    !slug.startsWith('.') &&
    !slug.endsWith('.') &&
    !slug.includes('..') &&
    !(slug in Object.prototype) &&
    !UNSAFE_CATALOG_SLUG_KEYS.has(slug.toLowerCase())
  );
}

function isValidVersusSlugToken(slug: string): boolean {
  return (
    Boolean(slug) &&
    itemSlugFromProductAnswer({ ok: true, data: { item: { slug } } }, '') ===
      slug
  );
}

// Dotted dynamic page slugs in `proxy.ts` / `next.config.mjs` require a leading
// ASCII alphanumeric character (`DOS/Rate#1807`); undotted detail slugs also
// allow leading `_` or `-` matching `resolveCatalogSlug` (#1834).
function isRoutableDetailSlugToken(slug: string): boolean {
  return (
    isSafeCatalogSlugToken(slug) &&
    (!slug.includes('.') || /^[a-zA-Z0-9]/.test(slug))
  );
}

// `/compare` tokens must satisfy both `SLUG_REGEX` / `PIN_REGEX` (leading
// `[a-zA-Z0-9]`) and `isSafeCatalogSlugToken` sentinel bounds (#1834).
function isValidCompareSlugToken(slug: string): boolean {
  return isSafeCatalogSlugToken(slug) && isValidVersusSlugToken(slug);
}

function setOwnSlugEntry(
  map: Record<string, string>,
  key: string,
  value: string
): void {
  if (key === '__proto__') {
    Object.defineProperty(map, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  } else {
    map[key] = value;
  }
}

function getOwnSlugEntry(
  map: Readonly<Record<string, string>> | null | undefined,
  key: string
): string | undefined {
  if (!map || !key || !Object.prototype.hasOwnProperty.call(map, key)) {
    return undefined;
  }
  const clean = stripControlAndTrim(map[key]);
  return clean.length > 0 ? clean : undefined;
}

/**
 * The canonical slug a catalogue row links to under `/{category}/{slug}`:
 * its Item slug when valid for detail routes (preserving mixed case, dots and
 * leading underscores, matching `resolveCatalogSlug`), falling back to the
 * validated variant slug when unlinked or malformed, or `''` when neither is a
 * safe catalogue slug (DOS/Rate#1819, #1834).
 */
export function resolveCanonicalPeerSlug(row: {
  slug: string;
  item_slug?: string | null;
}): string {
  const rawFallback = stripControlAndTrim(row?.slug);
  const safeFallback = isRoutableDetailSlugToken(rawFallback)
    ? rawFallback
    : '';
  const rawItemSlug = stripControlAndTrim(row?.item_slug);
  const candidate = stripControlAndTrim(
    catalogRowSlug({
      slug: safeFallback,
      ...(rawItemSlug ? { item_slug: rawItemSlug } : {}),
    })
  );
  if (candidate && isRoutableDetailSlugToken(candidate)) {
    return candidate;
  }
  return safeFallback;
}

/**
 * Category peers excluding the current product and every variant of its Item,
 * deduplicated so at most one entry per rival Item remains (DOS/Rate#1819).
 */
export function withoutCurrentItemPeers<
  T extends {
    id?: string;
    slug: string;
    item_slug?: string;
    item_variants?: readonly { id: string }[];
  },
>(peers: readonly T[], current: ItemPeerCurrentContext): T[] {
  if (!Array.isArray(peers)) return [];
  const skipSlugs = new Set<string>();
  const addSlug = (raw: string | null | undefined) => {
    const clean = stripControlAndTrim(raw).toLowerCase();
    if (clean) skipSlugs.add(clean);
  };
  addSlug(current.productSlug);
  addSlug(current.itemSlug);
  if (current.siblingSlugs) {
    for (const s of current.siblingSlugs) addSlug(s);
  }

  const skipIds = new Set<string>();
  const addId = (raw: string | null | undefined) => {
    const clean = stripControlAndTrim(raw);
    if (clean) skipIds.add(clean);
  };
  addId(current.productId);
  if (current.siblingIds) {
    for (const id of current.siblingIds) addId(id);
  }

  const seenRivals = new Set<string>();
  const out: T[] = [];
  for (const peer of peers) {
    if (
      !peer ||
      typeof peer !== 'object' ||
      Array.isArray(peer) ||
      typeof peer.slug !== 'string'
    ) {
      continue;
    }
    const rawSlug = stripControlAndTrim(peer.slug);
    if (!rawSlug) continue;
    const peerId = stripControlAndTrim(peer.id);
    if (peerId && skipIds.has(peerId)) continue;
    if (skipSlugs.has(rawSlug.toLowerCase())) continue;

    const rawItemSlug = stripControlAndTrim(peer.item_slug);
    if (rawItemSlug && skipSlugs.has(rawItemSlug.toLowerCase())) continue;
    const rawVariants = peer.item_variants;
    if (
      Array.isArray(rawVariants) &&
      rawVariants.some((v: { id?: unknown }) => {
        const vid = v ? stripControlAndTrim(v.id) : '';
        return Boolean(vid) && skipIds.has(vid);
      })
    ) {
      continue;
    }

    const dedupeKey = resolveCanonicalPeerSlug(peer).toLowerCase();
    if (!dedupeKey || seenRivals.has(dedupeKey)) continue;
    seenRivals.add(dedupeKey);
    out.push(peer);
  }
  return out;
}

/**
 * Variant-slug to Item-slug map for in-app 1v1 versus links on a product page,
 * or null when neither the current product nor any peer carries an Item slug.
 */
export function buildPeerItemSlugMap(
  current: { slug: string; itemSlug?: string | null },
  peers: readonly { slug: string; item_slug?: string | null }[]
): Record<string, string> | null {
  const map = Object.create(null) as Record<string, string>;
  let count = 0;
  const currentSlug = stripControlAndTrim(current.slug);
  const currentItem = stripControlAndTrim(current.itemSlug);
  if (currentSlug && currentItem) {
    setOwnSlugEntry(map, currentSlug, currentItem);
    count++;
  }
  if (Array.isArray(peers)) {
    for (const peer of peers) {
      if (!peer || typeof peer.slug !== 'string') continue;
      const slug = stripControlAndTrim(peer.slug);
      const itemSlug = stripControlAndTrim(peer.item_slug);
      if (slug && itemSlug && !getOwnSlugEntry(map, slug)) {
        setOwnSlugEntry(map, slug, itemSlug);
        count++;
      }
    }
  }
  return count > 0 ? map : null;
}

export interface ResolvePeerVersusOptions {
  /**
   * True when peer Item link grouping fell back to ungrouped master rows, so a
   * missing entry in `itemSlugBySlug` may hide an unresolvable `-vs-` Item or
   * a same-Item sibling (#1834).
   */
  degraded?: boolean;
}

/**
 * True when peer Item link grouping fell back to ungrouped master rows, or
 * when an Item detail route has no active peer Item grouping, so 1v1 links
 * cannot assume a raw peer row is genuinely unlinked (#1834).
 */
export function isPeerItemGroupingDegraded(input: {
  currentItemSlug?: string | null;
  itemModelActive: boolean;
  degraded: boolean;
}): boolean {
  return (
    Boolean(input.degraded) ||
    (Boolean(stripControlAndTrim(input.currentItemSlug)) &&
      !input.itemModelActive)
  );
}

/**
 * Canonical, guarded `/compare/<a-vs-b>` link for two catalogue rows, or null
 * when peer Item grouping is degraded, the pair names the same Item, either
 * Item slug holds `-vs-`, or the resulting pair would not round-trip
 * `/compare/[versus]` parsing (#1819, #1834).
 */
export function resolvePeerVersusHref(
  slugA: string,
  slugB: string,
  itemSlugBySlug?: Readonly<Record<string, string>> | null,
  options?: ResolvePeerVersusOptions
): string | null {
  if (options?.degraded) {
    return null;
  }
  const cleanA = stripControlAndTrim(slugA);
  const cleanB = stripControlAndTrim(slugB);
  if (!cleanA || !cleanB || cleanA.toLowerCase() === cleanB.toLowerCase()) {
    return null;
  }
  const rawItemA = getOwnSlugEntry(itemSlugBySlug, cleanA);
  const rawItemB = getOwnSlugEntry(itemSlugBySlug, cleanB);
  if (
    rawItemA &&
    rawItemB &&
    rawItemA.toLowerCase() === rawItemB.toLowerCase()
  ) {
    return null;
  }
  // `planVersusRoute` returns `not_found` whenever either side's Item slug
  // contains `-vs-` (#1275), even if `versusHref` fell back to a variant slug.
  if (
    rawItemA?.toLowerCase().includes('-vs-') ||
    rawItemB?.toLowerCase().includes('-vs-')
  ) {
    return null;
  }
  const resolveSide = (slug: string, rawItem: string | undefined): string => {
    if (!rawItem) return slug;
    return isValidVersusSlugToken(rawItem) &&
      !rawItem.toLowerCase().includes('-vs-')
      ? rawItem
      : slug;
  };
  const sideA = resolveSide(cleanA, rawItemA);
  const sideB = resolveSide(cleanB, rawItemB);
  if (
    !isValidVersusSlugToken(sideA) ||
    !isValidVersusSlugToken(sideB) ||
    sideA.toLowerCase().includes('-vs-') ||
    sideB.toLowerCase().includes('-vs-') ||
    sideA.toLowerCase() === sideB.toLowerCase()
  ) {
    return null;
  }
  const [first, second] = canonicalVersusOrder(sideA, sideB);
  if (
    !isParseableVersusPair(first, second) ||
    !isParseableVersusPair(first.toLowerCase(), second.toLowerCase())
  ) {
    return null;
  }
  return itemSlugBySlug
    ? versusHref(cleanA, cleanB, itemSlugBySlug)
    : versusHref(cleanA, cleanB);
}

export interface PeerCompareRowInput {
  id?: string;
  slug: string;
  item_slug?: string | null;
  variant_key?: string | null;
  item_variants?: readonly { id: string; variant_key: string }[];
}

/**
 * Multi-item `/compare?slugs=` token for a product or grouped Item row: pins
 * multi-size Items (including shared-slug Items) as `itemSlug@variantKey` so
 * compare resolves the exact standing size, falling back to the safe variant
 * slug when an Item slug (e.g. leading underscore) is outside `/compare` token
 * syntax (#1819, #1834).
 */
export function resolvePeerCompareToken(row: PeerCompareRowInput): string {
  const rawSlug = stripControlAndTrim(row?.slug);
  const safeCompareSlug = isValidCompareSlugToken(rawSlug) ? rawSlug : '';
  const rawItemSlug = stripControlAndTrim(row?.item_slug);
  const compareItemSlug =
    rawItemSlug && isValidCompareSlugToken(rawItemSlug) ? rawItemSlug : '';
  if (
    compareItemSlug &&
    ((Array.isArray(row.item_variants) && row.item_variants.length > 1) ||
      Boolean(cleanVariantKey(row.variant_key)))
  ) {
    const cleanId = stripControlAndTrim(row.id);
    const matchedKey =
      cleanVariantKey(row.variant_key) ??
      cleanVariantKey(
        cleanId && Array.isArray(row.item_variants)
          ? row.item_variants.find((v) => stripControlAndTrim(v.id) === cleanId)
              ?.variant_key
          : null
      );
    const pinned = matchedKey ? `${compareItemSlug}@${matchedKey}` : '';
    return pinned && COMPARE_PIN_TOKEN_REGEX.test(pinned)
      ? pinned
      : safeCompareSlug;
  }
  return compareItemSlug || safeCompareSlug;
}

export interface PeerCompareLink {
  href: string;
  count: number;
  tokens: readonly string[];
}

/**
 * Multi-item `/compare` link with `cat=<categorySlug>`, `variant.<token>`
 * fallback hints, and the exact filtered token count so button labels never
 * diverge from emitted `slugs=` entries (DOS/Rate#1782, #1819, #1834).
 */
export function buildPeerCompareLink(
  categorySlug: string,
  rows: readonly PeerCompareRowInput[],
  limit = 4
): PeerCompareLink {
  const safeCategory = stripControlAndTrim(categorySlug) || 'smartphones';
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit > 0
      ? Math.min(4, Math.floor(limit))
      : 4;
  const entries: Array<{ token: string; variantSlug: string }> = [];
  const seenTokens = new Set<string>();
  const seenVariants = new Set<string>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row.slug !== 'string') continue;
      const rawVariantSlug = stripControlAndTrim(row.slug);
      if (!isSafeCatalogSlugToken(rawVariantSlug)) continue;
      const token = resolvePeerCompareToken(row);
      if (!token) continue;
      const tokenKey = token.toLowerCase();
      const variantKey = rawVariantSlug.toLowerCase();
      if (seenTokens.has(tokenKey) || seenVariants.has(variantKey)) continue;
      seenTokens.add(tokenKey);
      seenVariants.add(variantKey);
      entries.push({ token, variantSlug: rawVariantSlug });
      if (entries.length >= safeLimit) break;
    }
  }
  const tokens = entries.map(({ token }) => token);
  const slugs = tokens
    .map((token) => encodeURIComponent(token).replace(/%40/gi, '@'))
    .join(',');
  const fallbacks = new URLSearchParams();
  const needsFallback = entries.some(({ token, variantSlug }) => {
    const { slug, variantKey } = parseCompareToken(token);
    const master = variantSlug.toLowerCase();
    if (!variantKey) return master !== slug;
    return (
      variantKey === 'standard' ||
      slug.endsWith(`-${variantKey}`) ||
      `${slug}-${variantKey}` !== master
    );
  });
  if (needsFallback) {
    for (const { token, variantSlug } of entries) {
      if (token !== variantSlug) {
        fallbacks.set(`variant.${token.toLowerCase()}`, variantSlug);
      }
    }
  }
  const baseHref = `/compare?cat=${encodeURIComponent(safeCategory)}&slugs=${slugs}`;
  const href = fallbacks.size > 0 ? `${baseHref}&${fallbacks}` : baseHref;
  return {
    href,
    count: tokens.length,
    tokens,
  };
}

/**
 * Multi-item `/compare` link with `cat=<categorySlug>` and `variant.<token>`
 * fallback hints when `legacyTarget` would not directly infer `variantSlug`
 * (e.g. `1024gb` -> `-1tb`, `standard`, shared-slug multi-size Items, or
 * single-size retail aliases; DOS/Rate#1782, #1819, #1834).
 */
export function buildPeerCompareHref(
  categorySlug: string,
  rows: readonly PeerCompareRowInput[],
  limit = 4
): string {
  return buildPeerCompareLink(categorySlug, rows, limit).href;
}

export type ItemJsonLdImage = string | Record<string, unknown>;

export interface ItemJsonLdVariant {
  variantKey: string;
  label: string;
  minPrice: number;
  maxPrice: number;
  sellerCount: number;
  images?: readonly ItemJsonLdImage[];
}

function normalizeItemJsonLdImage(
  entry: ItemJsonLdImage
): ItemJsonLdImage | null {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const hasContentUrl = Object.prototype.hasOwnProperty.call(
    entry,
    'contentUrl'
  );
  const hasUrl = Object.prototype.hasOwnProperty.call(entry, 'url');
  const rawContentUrl = hasContentUrl ? entry.contentUrl : undefined;
  const rawUrl = hasUrl ? entry.url : undefined;
  const contentUrl =
    typeof rawContentUrl === 'string' ? rawContentUrl.trim() : '';
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!contentUrl && !url) {
    return null;
  }
  const copy: Record<string, unknown> = { ...entry };
  if (hasContentUrl) {
    if (contentUrl) copy.contentUrl = contentUrl;
    else delete copy.contentUrl;
  }
  if (hasUrl) {
    if (url) copy.url = url;
    else delete copy.url;
  }
  if (
    copy.creator &&
    typeof copy.creator === 'object' &&
    !Array.isArray(copy.creator)
  ) {
    copy.creator = { ...(copy.creator as Record<string, unknown>) };
  }
  return copy;
}

function cloneItemJsonLdImage(entry: ItemJsonLdImage): ItemJsonLdImage {
  if (typeof entry === 'string') return entry;
  const copy: Record<string, unknown> = { ...entry };
  if (
    copy.creator &&
    typeof copy.creator === 'object' &&
    !Array.isArray(copy.creator)
  ) {
    copy.creator = { ...(copy.creator as Record<string, unknown>) };
  }
  return copy;
}

function normalizeItemJsonLdImages(
  entries: readonly ItemJsonLdImage[] | undefined
): ItemJsonLdImage[] {
  if (!Array.isArray(entries)) return [];
  const out: ItemJsonLdImage[] = [];
  for (const entry of entries) {
    const normalized = normalizeItemJsonLdImage(entry);
    if (normalized !== null) out.push(normalized);
  }
  return out;
}

/**
 * The schema.org `ProductGroup` node of an Item page: one Product per priced
 * size, each with its own sku and AggregateOffer, and one Item-level rating
 * (Q4). A size with no price is left out: a variant Product needs an offer.
 * The variant URLs carry `?v=`, and the group URL is the canonical (Q1).
 * Credited `ImageObject` entries from `deviceImageJsonLd` keep their CC BY-SA
 * licence and creator fields on both `ProductGroup` and `hasVariant` (#1819).
 */
export function buildItemProductGroupNode(input: {
  itemKey: string;
  name: string;
  brand: string;
  canonicalUrl: string;
  description: string;
  images: readonly ItemJsonLdImage[];
  variants: readonly ItemJsonLdVariant[];
  aggregateRating?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const images = normalizeItemJsonLdImages(input.images);
  const pricedVariants = input.variants
    .filter((v) => Number.isFinite(v.minPrice) && v.minPrice > 0)
    .map((v) => ({
      variant: v,
      variantImages: normalizeItemJsonLdImages(v.images),
    }));
  const fallbackGroupImages =
    pricedVariants.find((entry) => entry.variantImages.length > 0)
      ?.variantImages ?? [];
  const groupImages = images.length > 0 ? images : fallbackGroupImages;
  const hasVariant = pricedVariants.map(({ variant: v, variantImages }) => {
    const rawSellers = Number(v.sellerCount);
    const offerCount = Number.isFinite(rawSellers)
      ? Math.max(1, Math.floor(rawSellers))
      : 1;
    const highPrice =
      Number.isFinite(v.maxPrice) && v.maxPrice > v.minPrice
        ? v.maxPrice
        : v.minPrice;
    const effectiveImages =
      variantImages.length > 0 ? variantImages : groupImages;
    return {
      '@type': 'Product',
      name: `${input.name} ${v.label}`,
      sku: `${input.itemKey}:${v.variantKey}`,
      inProductGroupWithID: input.itemKey,
      size: v.label,
      url: `${input.canonicalUrl}?v=${encodeURIComponent(v.variantKey)}`,
      ...(effectiveImages.length > 0
        ? { image: effectiveImages.map(cloneItemJsonLdImage) }
        : {}),
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'VND',
        lowPrice: v.minPrice,
        highPrice,
        offerCount,
      },
    };
  });
  return {
    '@type': 'ProductGroup',
    name: input.name,
    brand: { '@type': 'Brand', name: input.brand },
    productGroupID: input.itemKey,
    url: input.canonicalUrl,
    description: input.description,
    ...(groupImages.length > 0
      ? { image: groupImages.map(cloneItemJsonLdImage) }
      : {}),
    variesBy: ['https://schema.org/size'],
    ...(hasVariant.length > 0 ? { hasVariant } : {}),
    ...(input.aggregateRating
      ? { aggregateRating: input.aggregateRating }
      : {}),
  };
}
