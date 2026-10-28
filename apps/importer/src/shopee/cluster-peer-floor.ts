import { MAX_VALID_VND_PRICE } from '@repo/shared-data';

export const MAX_CLUSTER_PEER_ROWS = 1000;

const DISALLOWED_CLUSTER_PEER_ID_REGEX =
  /^(?:null|undefined|nan|none|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i;

function sanitizeClusterPeerId(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : '';
  }
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, 128);
  if (
    !cleaned ||
    /\s/.test(cleaned) ||
    /^0+$/.test(cleaned) ||
    /^[-_.]+$/.test(cleaned) ||
    DISALLOWED_CLUSTER_PEER_ID_REGEX.test(cleaned)
  ) {
    return '';
  }
  return cleaned;
}

function parseFiniteVndPrice(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/\p{Cc}+/gu, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return Number.NaN;
    }
    return Number(cleaned);
  }
  return Number.NaN;
}

export interface ClusterPeerPriceCandidate {
  id?: unknown;
  /** The peer's variant. When given, only peers of `variantId` count (DOS/Rate#1213). */
  cluster_id?: unknown;
  price_current?: unknown;
  merchants?: { is_official?: boolean | null } | Array<{ is_official?: boolean | null }> | null;
}

/**
 * Computes the self-excluded peer floor price for a cluster (`id !== currentProductId`),
 * preferring Official Mall sibling prices when available, and falling back to
 * `fallbackMasterMinPrice` only when no positive-priced peer listings exist.
 * Ignores unscaled prices `> MAX_VALID_VND_PRICE` (1B VND).
 *
 * Peer floors are per variant (design doc 4.4). With `variantId` given:
 * - `null` (a listing with no variant): no floor at all, not even the fallback;
 * - an id: a row whose `cluster_id` is set and is not that id, including a
 *   NULL-variant row (`cluster_id: null`), never enters the floor.
 * Omitted, rows are taken as already filtered to one variant (unchanged behaviour).
 */
export function resolveClusterPeerFloorPrice(
  peerRows: readonly ClusterPeerPriceCandidate[],
  currentProductId: string,
  fallbackMasterMinPrice?: number | null,
  variantId?: string | null
): number | undefined {
  if (variantId === null) return undefined;
  let officialMin = Number.POSITIVE_INFINITY;
  let peerMin = Number.POSITIVE_INFINITY;
  const safeCurrentId = sanitizeClusterPeerId(currentProductId);
  const safeVariantId = variantId === undefined ? undefined : sanitizeClusterPeerId(variantId);
  // A variant id that does not sanitize names no variant: no floor.
  if (safeVariantId === '') return undefined;

  if (Array.isArray(peerRows)) {
    const limit = Math.min(peerRows.length, MAX_CLUSTER_PEER_ROWS);
    for (let i = 0; i < limit; i++) {
      const row = peerRows[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const rowId = sanitizeClusterPeerId(row.id);
      if (safeCurrentId && rowId === safeCurrentId) continue;
      if (
        safeVariantId !== undefined &&
        row.cluster_id !== undefined &&
        sanitizeClusterPeerId(row.cluster_id) !== safeVariantId
      ) {
        continue;
      }
      const rawPrice = parseFiniteVndPrice(row.price_current);
      if (!Number.isFinite(rawPrice) || rawPrice <= 0 || rawPrice > MAX_VALID_VND_PRICE) continue;
      const price = Math.round(rawPrice);
      if (price <= 0 || price > MAX_VALID_VND_PRICE) continue;
      if (price < peerMin) {
        peerMin = price;
      }
      const mObj = Array.isArray(row.merchants)
        ? row.merchants.find((m: { is_official?: boolean | null } | null | undefined) =>
            Boolean(m && typeof m === 'object' && !Array.isArray(m))
          )
        : row.merchants && typeof row.merchants === 'object'
          ? row.merchants
          : null;
      if (mObj?.is_official && price < officialMin) {
        officialMin = price;
      }
    }
  }

  if (Number.isFinite(officialMin)) {
    return officialMin;
  }
  if (Number.isFinite(peerMin)) {
    return peerMin;
  }
  const rawFallback = parseFiniteVndPrice(fallbackMasterMinPrice);
  if (!Number.isFinite(rawFallback)) {
    return undefined;
  }
  const fb = Math.round(rawFallback);
  return Number.isFinite(fb) && fb > 0 && fb <= MAX_VALID_VND_PRICE ? fb : undefined;
}
