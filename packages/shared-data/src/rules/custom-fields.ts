/**
 * Per-category `custom_fields` stored in `specifications.custom_fields` (DOS/Rate#1923).
 *
 * Crawlers extract deterministic, category-specific facts that the 10 spec groups do not
 * model (an air conditioner's `capacity_btu`, a supplement's `dosage_form`, a cosmetic's
 * `skin_type`). They travel as a flat record of snake_case keys whose values are a string,
 * a finite number, a boolean or a list of strings.
 *
 * Plain functions and constants only (no zod), so `@repo/shared-data/rules` stays free of
 * zod; `CustomFieldsSchema` in `specs.schema.ts` validates the same bounds.
 */

export type CustomFieldValue = string | number | boolean | string[];
export type CustomFields = Record<string, CustomFieldValue>;

/** Lower snake_case: starts with a letter, single underscores between letter/digit runs. */
const CUSTOM_FIELD_KEY_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const MAX_CUSTOM_FIELD_KEY_LENGTH = 64;
const MAX_CUSTOM_FIELDS = 64;
const MAX_CUSTOM_FIELD_STRING_LENGTH = 500;
const MAX_CUSTOM_FIELD_LIST_ITEMS = 50;
const MAX_CUSTOM_FIELD_LIST_ITEM_LENGTH = 200;
/** Bound for numeric values: wide enough for prices in VND, narrow enough to stay exact. */
const MAX_CUSTOM_FIELD_ABS_NUMBER = 1e15;

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// C0 and C1 control characters plus the zero-width and bidi format characters.
const CONTROL_CHARS_RE =
  /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/gu;
// Unpaired UTF-16 surrogate halves (rejected by PostgreSQL JSONB).
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

function clipCodePoints(value: string, maxUnits: number): string {
  let out = '';
  for (const ch of value) {
    if (out.length + ch.length > maxUnits) break;
    out += ch;
  }
  return out;
}

function cleanText(value: string, maxLength: number): string | undefined {
  const normalized = clipCodePoints(value, maxLength * 4)
    .replace(LONE_SURROGATE_RE, '')
    .replace(CONTROL_CHARS_RE, ' ')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  const cleaned = clipCodePoints(normalized, maxLength).trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * The snake_case key a raw key stands for, or null when none can be derived.
 * `skinType`, `Skin Type` and `skin-type` all become `skin_type`.
 */
function sanitizeCustomFieldKey(rawKey: unknown): string | null {
  if (typeof rawKey !== 'string') return null;
  if (RESERVED_KEYS.has(rawKey)) return null;
  if (
    rawKey.length <= MAX_CUSTOM_FIELD_KEY_LENGTH &&
    CUSTOM_FIELD_KEY_RE.test(rawKey)
  ) {
    return rawKey;
  }
  const key = rawKey
    .slice(0, MAX_CUSTOM_FIELD_KEY_LENGTH * 2)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_CUSTOM_FIELD_KEY_LENGTH)
    .replace(/_+$/g, '');
  if (RESERVED_KEYS.has(key)) return null;
  return CUSTOM_FIELD_KEY_RE.test(key) ? key : null;
}

/** A bounded custom field value, or undefined when the value is empty or unsupported. */
function sanitizeCustomFieldValue(
  value: unknown
): CustomFieldValue | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) &&
      Math.abs(value) <= MAX_CUSTOM_FIELD_ABS_NUMBER
      ? value === 0
        ? 0
        : value
      : undefined;
  }
  if (typeof value === 'string') {
    return cleanText(value, MAX_CUSTOM_FIELD_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (const item of value.slice(0, MAX_CUSTOM_FIELD_LIST_ITEMS * 4)) {
      if (items.length >= MAX_CUSTOM_FIELD_LIST_ITEMS) break;
      let text: string | undefined;
      if (typeof item === 'string') {
        text = cleanText(item, MAX_CUSTOM_FIELD_LIST_ITEM_LENGTH);
      } else if (typeof item === 'number' && Number.isFinite(item)) {
        text = String(item);
      }
      if (text && !items.includes(text)) items.push(text);
    }
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

/**
 * The bounded `custom_fields` record of a raw value, or undefined when nothing valid is
 * left. Keys are coerced to snake_case; when two raw keys map to one key, the first wins.
 * At most `MAX_CUSTOM_FIELDS` entries are kept, in input order.
 */
function sanitizeCustomFields(raw: unknown): CustomFields | undefined {
  if (!isPlainRecord(raw)) return undefined;
  const out: CustomFields = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    if (count >= MAX_CUSTOM_FIELDS) break;
    const key = sanitizeCustomFieldKey(rawKey);
    if (!key || Object.hasOwn(out, key)) continue;
    const value = sanitizeCustomFieldValue(rawValue);
    if (value === undefined) continue;
    out[key] = value;
    count += 1;
  }
  return count > 0 ? out : undefined;
}

/**
 * Deterministic merge of two `custom_fields` records: every valid base key is kept, an
 * incoming non-empty value replaces the base value of the same key, and new incoming keys
 * are appended while fewer than `MAX_CUSTOM_FIELDS` entries exist.
 */
function mergeCustomFields(
  base: unknown,
  incoming: unknown
): CustomFields | undefined {
  const safeBase = sanitizeCustomFields(base) ?? {};
  const safeIncoming = sanitizeCustomFields(incoming) ?? {};
  const merged: CustomFields = { ...safeBase };
  let count = Object.keys(merged).length;
  for (const [key, value] of Object.entries(safeIncoming)) {
    if (Object.hasOwn(merged, key)) {
      merged[key] = Array.isArray(value) ? [...value] : value;
      continue;
    }
    if (count >= MAX_CUSTOM_FIELDS) continue;
    merged[key] = Array.isArray(value) ? [...value] : value;
    count += 1;
  }
  return count > 0 ? merged : undefined;
}

// One export list: the rules test reads quoted text in export statements as import paths.
export {
  CUSTOM_FIELD_KEY_RE,
  LONE_SURROGATE_RE,
  MAX_CUSTOM_FIELD_KEY_LENGTH,
  MAX_CUSTOM_FIELDS,
  MAX_CUSTOM_FIELD_STRING_LENGTH,
  MAX_CUSTOM_FIELD_LIST_ITEMS,
  MAX_CUSTOM_FIELD_LIST_ITEM_LENGTH,
  MAX_CUSTOM_FIELD_ABS_NUMBER,
  sanitizeCustomFieldKey,
  sanitizeCustomFieldValue,
  sanitizeCustomFields,
  mergeCustomFields,
};
