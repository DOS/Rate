/**
 * Surrogate-safe Unicode helpers for product titles, variant labels, and URL
 * query/path components (DOS/Rate#1812).
 *
 * JavaScript `.slice()` cuts by UTF-16 code units, which can split an astral
 * character (emoji, mathematical bold text, supplementary ideographs) into an
 * unpaired high surrogate (`0xD800..0xDBFF`) at the boundary and cause
 * `encodeURIComponent` to throw `URIError`.
 */

const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Removes unpaired UTF-16 high or low surrogates while preserving valid BMP
 * characters and complete astral surrogate pairs.
 */
export function stripLoneSurrogates(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  return value.replace(LONE_SURROGATE_RE, '');
}

/**
 * Truncates `value` to at most `maxCodePoints` Unicode scalar values (code
 * points) without splitting surrogate pairs, stripping any unpaired surrogates
 * encountered along the way. Runs in O(maxCodePoints) time and space.
 */
export function sliceCodePoints(value: unknown, maxCodePoints: number): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (!Number.isFinite(maxCodePoints) || maxCodePoints <= 0) return '';
  const limit = Math.floor(maxCodePoints);
  let out = '';
  let count = 0;
  for (let i = 0; i < value.length && count < limit; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value.slice(i, i + 2);
        i += 1;
        count += 1;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }
    out += value[i]!;
    count += 1;
  }
  return out;
}

/**
 * Encodes a URI component after stripping lone surrogates (and optionally
 * truncating by Unicode code points), guaranteeing `encodeURIComponent` never
 * throws `URIError`.
 */
export function encodeSurrogateSafeUriComponent(
  value: unknown,
  maxCodePoints?: number
): string {
  const safe =
    typeof maxCodePoints === 'number'
      ? sliceCodePoints(value, maxCodePoints)
      : stripLoneSurrogates(value);
  return encodeURIComponent(safe);
}
