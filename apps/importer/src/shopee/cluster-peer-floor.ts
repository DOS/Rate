import { MAX_VALID_VND_PRICE } from '@repo/shared-data';

export const MAX_CLUSTER_PEER_ROWS = 1000;

export interface ClusterPeerPriceCandidate {
  id?: unknown;
  price_current?: unknown;
  merchants?: { is_official?: boolean | null } | Array<{ is_official?: boolean | null }> | null;
}

/**
 * Computes the self-excluded peer floor price for a cluster (`id !== currentProductId`),
 * preferring Official Mall sibling prices when available, and falling back to
 * `fallbackMasterMinPrice` only when no positive-priced peer listings exist.
 * Ignores unscaled prices `> MAX_VALID_VND_PRICE` (1B VND).
 */
export function resolveClusterPeerFloorPrice(
  peerRows: readonly ClusterPeerPriceCandidate[],
  currentProductId: string,
  fallbackMasterMinPrice?: number | null
): number | undefined {
  let officialMin = Number.POSITIVE_INFINITY;
  let peerMin = Number.POSITIVE_INFINITY;
  const safeCurrentId =
    typeof currentProductId === 'string' ? currentProductId.replace(/\p{Cc}+/gu, '').trim() : '';

  if (Array.isArray(peerRows)) {
    const limit = Math.min(peerRows.length, MAX_CLUSTER_PEER_ROWS);
    for (let i = 0; i < limit; i++) {
      const row = peerRows[i];
      if (!row || typeof row !== 'object') continue;
      const rowId =
        typeof row.id === 'string' || typeof row.id === 'number'
          ? String(row.id)
              .replace(/\p{Cc}+/gu, '')
              .trim()
          : '';
      if (safeCurrentId && rowId === safeCurrentId) continue;
      if (
        typeof row.price_current === 'boolean' ||
        row.price_current === null ||
        row.price_current === undefined
      ) {
        continue;
      }
      const price = Number(row.price_current);
      if (!Number.isFinite(price) || price <= 0 || price > MAX_VALID_VND_PRICE) continue;
      if (price < peerMin) {
        peerMin = price;
      }
      const mObj = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
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
  if (
    typeof fallbackMasterMinPrice === 'boolean' ||
    fallbackMasterMinPrice === null ||
    fallbackMasterMinPrice === undefined
  ) {
    return undefined;
  }
  const fb = Number(fallbackMasterMinPrice);
  return Number.isFinite(fb) && fb > 0 && fb <= MAX_VALID_VND_PRICE ? fb : undefined;
}
