const SAFE_COMBO_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;

const UNSAFE_COMBO_SLUG_TOKENS = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'n/a',
  'na',
  'false',
  'true',
  'infinity',
  '-infinity',
  '__proto__',
  'constructor',
  'prototype',
  ...Object.getOwnPropertyNames(Object.prototype).map((key) =>
    key.toLowerCase()
  ),
]);

export const COMBO_LINK_MAX_ITEMS = 5;

/**
 * Validates a product or Item slug for safe `/watchlist?items=...` linking.
 */
export function isValidComboSlugToken(token: unknown): token is string {
  if (typeof token !== 'string' || !SAFE_COMBO_SLUG_RE.test(token)) {
    return false;
  }
  const lower = token.toLowerCase();
  if (
    /^0+$/.test(token) ||
    token.endsWith('.') ||
    token.includes('..') ||
    Object.prototype.hasOwnProperty.call(Object.prototype, token) ||
    Object.prototype.hasOwnProperty.call(Object.prototype, lower) ||
    UNSAFE_COMBO_SLUG_TOKENS.has(lower)
  ) {
    return false;
  }
  return true;
}

/**
 * Builds a bounded, deduplicated `/watchlist?items=...` URL for cross-feature
 * combo cart CTAs, or `null` when fewer than `minItems` valid slugs remain.
 */
export function buildWatchlistComboHref(
  slugs: readonly (string | null | undefined)[],
  options?: {
    readonly minItems?: number;
    readonly maxItems?: number;
  }
): string | null {
  if (!Array.isArray(slugs)) return null;
  const minItems =
    typeof options?.minItems === 'number' &&
    Number.isFinite(options.minItems) &&
    options.minItems >= 1
      ? Math.floor(options.minItems)
      : 2;
  const maxItems =
    typeof options?.maxItems === 'number' &&
    Number.isFinite(options.maxItems) &&
    options.maxItems >= 1
      ? Math.min(COMBO_LINK_MAX_ITEMS, Math.floor(options.maxItems))
      : COMBO_LINK_MAX_ITEMS;

  const unique: string[] = [];
  const seenLower = new Set<string>();
  for (const raw of slugs) {
    if (typeof raw !== 'string') continue;
    const cleaned = raw.replace(/\p{Cc}+/gu, '').trim();
    if (!isValidComboSlugToken(cleaned)) continue;
    const lower = cleaned.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    unique.push(cleaned);
    if (unique.length >= maxItems) break;
  }

  if (unique.length < minItems) {
    return null;
  }
  const encoded = unique.map((slug) => encodeURIComponent(slug)).join(',');
  return `/watchlist?items=${encoded}`;
}
