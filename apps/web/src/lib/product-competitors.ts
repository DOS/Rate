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

const MAX_COMPETITOR_VND_PRICE = 1_000_000_000;

function toValidCompetitorPrice(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  if (typeof value === 'string' && !value.trim()) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= MAX_COMPETITOR_VND_PRICE ? n : 0;
}

function normalizeCompetitorSlug(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}+/gu, '')
    .trim()
    .slice(0, 256);
}

function sanitizeSpecSegment(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

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
  if (!Array.isArray(peers)) return [];
  const safeCurrentSlug = normalizeCompetitorSlug(currentSlug);
  const safeBasePrice = toValidCompetitorPrice(currentMinPrice);
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 0
      ? Math.min(50, Math.floor(limit))
      : 3;
  return peers
    .filter((p) => {
      if (!p || typeof p !== 'object') return false;
      const peerSlug = normalizeCompetitorSlug(p.slug);
      return Boolean(peerSlug) && peerSlug !== safeCurrentSlug;
    })
    .sort((a, b) => {
      const pa = toValidCompetitorPrice(a.min_price);
      const pb = toValidCompetitorPrice(b.min_price);
      if (pa > 0 !== pb > 0) return pa > 0 ? -1 : 1;
      return Math.abs(pa - safeBasePrice) - Math.abs(pb - safeBasePrice);
    })
    .slice(0, safeLimit);
}

/** Price difference to show on a peer card, or 0 when either side has no price. */
export function peerPriceDelta(
  peerPrice: number,
  currentMinPrice: number
): number {
  const safePeer = toValidCompetitorPrice(peerPrice);
  const safeCurrent = toValidCompetitorPrice(currentMinPrice);
  return safePeer > 0 && safeCurrent > 0 ? safePeer - safeCurrent : 0;
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
  if (!product || typeof product !== 'object') return '';
  const keySpecs = (
    product.key_specs &&
    typeof product.key_specs === 'object' &&
    !Array.isArray(product.key_specs)
      ? product.key_specs
      : {}
  ) as KeySpecs;
  const specs = (
    product.specifications &&
    typeof product.specifications === 'object' &&
    !Array.isArray(product.specifications)
      ? product.specifications
      : {}
  ) as ProductSpecifications;
  const ramGb = resolveCompareRamGb(product);
  const storageGb = resolveCompareStorageGb(product);
  const batteryMah = resolveCompareBatteryMah(product);
  return [
    keySpecs.chip || specs.hardware?.chipset,
    keySpecs.ram || (ramGb ? `${ramGb}GB RAM` : null),
    keySpecs.storage || (storageGb ? `${storageGb}GB` : null),
    keySpecs.battery || (batteryMah ? `${batteryMah} mAh` : null),
  ]
    .map(sanitizeSpecSegment)
    .filter(Boolean)
    .join(' • ');
}
