/**
 * Rollout mode for the Item / variant / listing model (DOS/Rate#1151, #1984; design doc
 * `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, sections 4.5 and 10).
 *
 * `RATE_ITEM_MODEL` selects how the importer resolves and writes a listing:
 * - `item` (default, and any unknown or unset value): item-first matching (`match_item`)
 *   and `item_id`/`variant_source` writes. Every listing still gets a variant: a listing
 *   with no stated size on a multi-size Item goes to that Item's `unknown` variant.
 * - `nullable_variant`: as `item`, and such a listing is written with
 *   `cluster_id = NULL`. Turn on only after DOS/Rate-Services#670 part 1 has
 *   merged, so every consumer treats a NULL variant as "no variant".
 */
export const ITEM_MODEL_ENV = 'RATE_ITEM_MODEL';

export const ITEM_MODEL_MODES = ['item', 'nullable_variant'] as const;
export type ItemModelMode = (typeof ITEM_MODEL_MODES)[number];

export function resolveItemModelMode(raw: unknown = process.env[ITEM_MODEL_ENV]): ItemModelMode {
  if (typeof raw !== 'string') return 'item';
  const value = raw.trim().toLowerCase().replace(/-/g, '_');
  return value === 'nullable_variant' ? 'nullable_variant' : 'item';
}
