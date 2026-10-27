/**
 * Item / variant key rules (DOS/Rate#1149; design doc
 * `Docs/Proposals/2026-10-27-item-variant-listing-model.md`, section 4).
 *
 * `model_key` = `item_key:variant_key`, the shape the normalizer emits today:
 * - `item_key` = `brand:model`. An Apple screen or case size stays in the
 *   model segment, so `apple:ipad-pro-m5-11` and `apple:ipad-pro-m5-13` are
 *   different Items.
 * - `variant_key` = the literal third segment: `256gb`, `1024gb`, `standard`,
 *   `unknown` (earbuds), and later suffixed forms such as `256gb-cellular`.
 *   Display labels (`1TB`, "Standard") are derived from it, never keys.
 *
 * Segment shapes follow the design doc's inventory check (section 7.3). They
 * allow `_`, which the normalizer's slugify keeps (`x1504_va`). A key outside
 * them (legacy keys without three segments, upper case, empty segments such
 * as `samsung::unknown`) is not parsed: `splitModelKey` returns null for it.
 */

const BRAND_SEGMENT = '[a-z0-9_][a-z0-9_-]*';
const MODEL_SEGMENT = '[a-z0-9_][a-z0-9_.-]*';
const VARIANT_SEGMENT = '[a-z0-9_-]+';

export const ITEM_KEY_PATTERN = new RegExp(
  `^${BRAND_SEGMENT}:${MODEL_SEGMENT}$`
);
export const VARIANT_KEY_PATTERN = new RegExp(`^${VARIANT_SEGMENT}$`);
export const MODEL_KEY_PATTERN = new RegExp(
  `^(${BRAND_SEGMENT}:${MODEL_SEGMENT}):(${VARIANT_SEGMENT})$`
);

/**
 * A variant that states a storage size. An Item with a non-archived sized
 * variant is multi-size, and there `unknown` means "size not stated".
 */
export const SIZED_VARIANT_KEY_PATTERN = /^\d+(gb|tb)$/;

/**
 * Storage not stated (multi-size Item) or not applicable (single-variant
 * Item, e.g. earbuds).
 */
const UNKNOWN = 'unknown';
export const UNKNOWN_VARIANT_KEY = UNKNOWN;

/** Same 200-character cap as `master_products.model_key`. */
export const MAX_MODEL_KEY_LENGTH = 200;

const isString = (value: unknown): value is string => typeof value === 'string';

export interface ModelKeyParts {
  itemKey: string;
  variantKey: string;
}

export function isItemKey(value: unknown): value is string {
  return (
    isString(value) &&
    value.length <= MAX_MODEL_KEY_LENGTH &&
    ITEM_KEY_PATTERN.test(value)
  );
}

export function isVariantKey(value: unknown): value is string {
  return (
    isString(value) &&
    value.length <= MAX_MODEL_KEY_LENGTH &&
    VARIANT_KEY_PATTERN.test(value)
  );
}

export function isModelKey(value: unknown): value is string {
  return (
    isString(value) &&
    value.length <= MAX_MODEL_KEY_LENGTH &&
    MODEL_KEY_PATTERN.test(value)
  );
}

export function isSizedVariantKey(value: unknown): value is string {
  return isString(value) && SIZED_VARIANT_KEY_PATTERN.test(value);
}

/**
 * Splits a `model_key` into its Item and variant keys, or returns null when
 * the key is not in the `brand:model:variant` shape.
 * `composeModelKey(itemKey, variantKey)` gives the same key back.
 */
export function splitModelKey(modelKey: string): ModelKeyParts | null {
  if (!isModelKey(modelKey)) return null;
  const match = MODEL_KEY_PATTERN.exec(modelKey);
  if (!match || match[1] === undefined || match[2] === undefined) return null;
  return { itemKey: match[1], variantKey: match[2] };
}

/**
 * Builds a `model_key` from an Item key and a variant key. Throws a
 * RangeError when either part, or the result, is not a valid key, so a
 * malformed key never reaches a writer.
 */
export function composeModelKey(itemKey: string, variantKey: string): string {
  if (!isItemKey(itemKey)) {
    throw new RangeError(`Invalid item_key: ${JSON.stringify(itemKey)}`);
  }
  if (!isVariantKey(variantKey)) {
    throw new RangeError(`Invalid variant_key: ${JSON.stringify(variantKey)}`);
  }
  const modelKey = `${itemKey}:${variantKey}`;
  if (!isModelKey(modelKey)) {
    throw new RangeError(
      `model_key longer than ${MAX_MODEL_KEY_LENGTH} characters: ${JSON.stringify(modelKey)}`
    );
  }
  return modelKey;
}
