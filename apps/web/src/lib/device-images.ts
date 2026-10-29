import { DEVICE_IMAGE_RENDITIONS } from './device-image-renditions';

/** Widths of the committed WebP renditions (scripts/device-images.mjs). */
export const DEVICE_IMAGE_WIDTHS = [200, 400, 600] as const;

/**
 * A `srcSet` of the pre-sized WebP renditions for a local device photo
 * (`/img/devices/<slug>.jpg`), or null for any other image. The 800 px JPEG
 * stays the `src` fallback (DOS/Rate#1332).
 */
export function deviceImageSrcSet(
  src: string | null | undefined
): string | null {
  if (typeof src !== 'string') return null;
  const match = /^\/img\/devices\/([a-z0-9-]+)\.jpg$/.exec(src);
  const slug = match?.[1];
  if (!slug) return null;
  const hash = DEVICE_IMAGE_RENDITIONS[slug];
  if (!hash) return null;
  return DEVICE_IMAGE_WIDTHS.map(
    (w) => `/img/devices/sized/${slug}-${w}.${hash}.webp ${w}w`
  ).join(', ');
}
