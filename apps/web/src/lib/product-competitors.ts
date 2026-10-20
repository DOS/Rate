import type {
  KeySpecs,
  MasterProduct,
  ProductSpecifications,
} from '@repo/shared-data';
import {
  resolveCompareBatteryMah,
  resolveCompareRamGb,
  resolveCompareStorageGb,
} from '@/lib/rate-domain';

/**
 * Category peers for the "direct competitors" strip on a product page: priced
 * peers first (closest price first), unpriced peers last (DOS/Rate#558).
 */
export function rankRelatedCompetitors<
  T extends Pick<MasterProduct, 'slug' | 'min_price'>,
>(
  peers: readonly T[],
  currentSlug: string,
  currentMinPrice: number,
  limit = 3
): T[] {
  return peers
    .filter((p) => p.slug !== currentSlug)
    .sort((a, b) => {
      const pa = Number(a.min_price || 0);
      const pb = Number(b.min_price || 0);
      if (pa > 0 !== pb > 0) return pa > 0 ? -1 : 1;
      return Math.abs(pa - currentMinPrice) - Math.abs(pb - currentMinPrice);
    })
    .slice(0, limit);
}

/** Price difference to show on a peer card, or 0 when either side has no price. */
export function peerPriceDelta(
  peerPrice: number,
  currentMinPrice: number
): number {
  return peerPrice > 0 && currentMinPrice > 0 ? peerPrice - currentMinPrice : 0;
}

/**
 * "Chip • RAM • storage • battery" for the share card, from key_specs with a
 * fallback to the 10-group specifications and top-level columns.
 */
export function buildKeySpecLine(
  product: Pick<
    MasterProduct,
    'key_specs' | 'specifications' | 'ram_gb' | 'storage_gb' | 'battery_mah'
  >
): string {
  const keySpecs = (product.key_specs || {}) as KeySpecs;
  const specs = (product.specifications || {}) as ProductSpecifications;
  const ramGb = resolveCompareRamGb(product);
  const storageGb = resolveCompareStorageGb(product);
  const batteryMah = resolveCompareBatteryMah(product);
  return [
    keySpecs.chip || specs.hardware?.chipset,
    keySpecs.ram || (ramGb ? `${ramGb}GB RAM` : null),
    keySpecs.storage || (storageGb ? `${storageGb}GB` : null),
    keySpecs.battery || (batteryMah ? `${batteryMah} mAh` : null),
  ]
    .filter(Boolean)
    .join(' • ');
}
