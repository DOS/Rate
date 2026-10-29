import { DEVICE_IMAGE_RENDITIONS } from './device-image-renditions';

/**
 * A `srcSet` of the pre-sized WebP renditions for a local device photo
 * (`/img/devices/<slug>.jpg`), or null for any other image. Each candidate is
 * listed under the width it really has (scripts/device-images.mjs builds no
 * width larger than the photo). The JPEG stays the `src` fallback
 * (DOS/Rate#1332).
 */
export function deviceImageSrcSet(
  src: string | null | undefined
): string | null {
  if (typeof src !== 'string') return null;
  const match = /^\/img\/devices\/([a-z0-9-]+)\.jpg$/.exec(src);
  const slug = match?.[1];
  if (!slug) return null;
  const rendition = DEVICE_IMAGE_RENDITIONS[slug];
  if (!rendition || rendition.widths.length === 0) return null;
  // A photo narrower than every target has one rendition at its own width.
  // Listed as `1x` it keeps its natural size; as `160w` with sizes="176px"
  // the browser would stretch it to the card.
  if (rendition.widths.length === 1) {
    return `/img/devices/sized/${slug}-${rendition.widths[0]}.${rendition.hash}.webp 1x`;
  }
  return rendition.widths
    .map((w) => `/img/devices/sized/${slug}-${w}.${rendition.hash}.webp ${w}w`)
    .join(', ');
}
