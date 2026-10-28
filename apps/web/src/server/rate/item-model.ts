import 'server-only';
import type {
  CatalogSlugResolution,
  RateItemVariant,
} from '../../lib/rate-api';

/**
 * Web rollout flag for the Item / variant / listing model (DOS/Rate#1153;
 * design doc `Docs/Proposals/2026-10-27-item-variant-listing-model.md`,
 * sections 5.1 and 7). Same env and values as the importer's
 * `item-model-flag.ts`:
 * - `off` (default, and any unknown value): today's pages. Nothing reads
 *   `rate.items` or the item columns, so the site runs on a database without
 *   the DOS-Me M1+M2 migration (#1150).
 * - `item` / `nullable_variant`: catalogue slugs resolve to Items, old
 *   variant URLs 308 to the Item URL with `?v=`. Needs M1+M2.
 */
export const ITEM_MODEL_ENV = 'RATE_ITEM_MODEL';

const ITEM_MODEL_MODES = ['off', 'item', 'nullable_variant'] as const;
export type WebItemModelMode = (typeof ITEM_MODEL_MODES)[number];

export function resolveWebItemModelMode(
  raw: unknown = process.env[ITEM_MODEL_ENV]
): WebItemModelMode {
  if (typeof raw !== 'string') return 'off';
  const value = raw.trim().toLowerCase().replace(/-/g, '_');
  return (ITEM_MODEL_MODES as readonly string[]).includes(value)
    ? (value as WebItemModelMode)
    : 'off';
}

/** Whether pages read Items. Read per request, so a flag flip needs no build. */
export function isItemModelOn(): boolean {
  return resolveWebItemModelMode() !== 'off';
}

// A variant key in `?v=`: the literal third key segment, e.g. 256gb, 1024gb,
// standard, unknown, 256gb-cellular (design doc 4.2).
const VARIANT_PARAM_REGEX = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function sanitizeVariantParam(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  return VARIANT_PARAM_REGEX.test(clean) ? clean : null;
}

export type ItemRoutePlan =
  | { kind: 'not_found' }
  | { kind: 'redirect'; to: string }
  | {
      kind: 'render';
      /** The variant whose page renders until the Item page ships (#1154). */
      variantSlug: string;
      itemSlug: string;
      variantKey: string;
    };

/**
 * What a product URL does under the Item model (Q1):
 * - an old variant slug 308s to `/{category}/{item-slug}?v={variant_key}`,
 *   unless the Item shares that slug (a single-variant Item);
 * - an Item slug renders the variant `?v=` names, else the Item's default
 *   variant, else its first.
 */
export function planItemRoute(input: {
  resolution: CatalogSlugResolution | null;
  requestedSlug: string;
  requestedVariant: string | null;
  categoryBasePath: string;
  variants: readonly RateItemVariant[];
}): ItemRoutePlan {
  const { resolution, requestedSlug, requestedVariant, categoryBasePath } =
    input;
  if (!resolution) return { kind: 'not_found' };
  const { item } = resolution;
  if (resolution.kind === 'variant' && item.slug !== requestedSlug) {
    const base = categoryBasePath.replace(/\/+$/, '');
    const itemUrl = `${base}/${encodeURIComponent(item.slug)}`;
    // A retired size (an archived `unknown`) is no size to preselect.
    return {
      kind: 'redirect',
      to: resolution.retired
        ? itemUrl
        : `${itemUrl}?v=${encodeURIComponent(resolution.variant.variant_key)}`,
    };
  }
  const variants = input.variants;
  const chosen =
    (resolution.kind === 'variant' && !resolution.retired
      ? resolution.variant
      : null) ??
    (requestedVariant
      ? variants.find((v) => v.variant_key === requestedVariant)
      : undefined) ??
    variants.find((v) => v.id === item.default_variant_id) ??
    variants[0];
  if (!chosen) return { kind: 'not_found' };
  return {
    kind: 'render',
    variantSlug: chosen.slug,
    itemSlug: item.slug,
    variantKey: chosen.variant_key,
  };
}

/**
 * The Item slug an old variant slug most likely belongs to, by the rule M1
 * uses to create Items (`rate.item_slug_from_master`): the trailing size or
 * `-standard` / `-unknown` segment dropped. Used to bust the Item page's cache
 * when a variant changes; a collision-suffixed Item slug is busted by its own
 * revalidation.
 */
export function itemSlugFromVariantSlug(slug: string): string {
  const clean = String(slug ?? '').trim();
  const stripped = clean.replace(/-([0-9]+(gb|tb)|standard|unknown)$/i, '');
  return stripped || clean;
}
