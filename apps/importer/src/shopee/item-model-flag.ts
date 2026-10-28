/**
 * Rollout flag for the Item / variant / listing model (DOS/Rate#1151; design doc
 * `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, sections 4.5 and 10).
 *
 * `RATE_ITEM_MODEL` selects how the importer resolves and writes a listing:
 * - `off` (default): today's behaviour. Master-level matching only, nothing
 *   reads or writes `rate.items`, `item_id` or `variant_source`. Safe on a
 *   database without the DOS-Me M1+M2 migration (#1150).
 * - `item`: item-first matching (`match_item`) and `item_id`/`variant_source`
 *   writes. Needs M1+M2. Every listing still gets a variant: a listing with
 *   no stated size on a multi-size Item goes to that Item's `unknown` variant.
 * - `nullable_variant`: as `item`, and such a listing is written with
 *   `cluster_id = NULL`. Turn on only after DOS/Rate-Services#670 part 1 has
 *   merged, so every consumer treats a NULL variant as "no variant".
 *
 * Any other value reads as `off`, so a typo never starts writing new columns.
 */
export const ITEM_MODEL_ENV = 'RATE_ITEM_MODEL';

export const ITEM_MODEL_MODES = ['off', 'item', 'nullable_variant'] as const;
export type ItemModelMode = (typeof ITEM_MODEL_MODES)[number];

export function resolveItemModelMode(raw: unknown = process.env[ITEM_MODEL_ENV]): ItemModelMode {
  if (typeof raw !== 'string') return 'off';
  const value = raw.trim().toLowerCase().replace(/-/g, '_');
  return (ITEM_MODEL_MODES as readonly string[]).includes(value) ? (value as ItemModelMode) : 'off';
}
