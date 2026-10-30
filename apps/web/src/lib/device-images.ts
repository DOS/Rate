import { DEVICE_IMAGE_RENDITIONS } from './device-image-renditions';

/**
 * A `srcSet` of the pre-sized WebP renditions for a local device photo
 * (`/img/devices/<slug>.jpg`), or null for any other image. Each candidate is
 * listed under the width it really has (scripts/device-images.mjs builds no
 * width larger than the photo). The JPEG stays the `src` fallback
 * (DOS/Rate#1332).
 */
function deviceRendition(src: string | null | undefined) {
  if (typeof src !== 'string') return null;
  const slug = /^\/img\/devices\/([a-z0-9-]+)\.jpg$/.exec(src)?.[1];
  const rendition = slug ? DEVICE_IMAGE_RENDITIONS[slug] : undefined;
  return slug && rendition && rendition.widths.length > 0
    ? { slug, rendition }
    : null;
}

export function deviceImageSrcSet(
  src: string | null | undefined
): string | null {
  const found = deviceRendition(src);
  if (!found) return null;
  const { slug, rendition } = found;
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

/**
 * The `sizes` of a device photo shown in a box capped in height (the product
 * hero: 350 px, 190 px on phones): the width the photo takes there, its
 * height cap times its width / height, so a landscape photo keeps its size
 * (DOS/Rate#1413). Undefined for any other image, or a single `1x`
 * rendition, which keeps its natural size anyway.
 */
export function deviceImageSizesForHeight(
  src: string | null | undefined,
  heights: { readonly phone: number; readonly other: number }
): string | undefined {
  const found = deviceRendition(src);
  if (!found || found.rendition.widths.length === 1) return undefined;
  const width = (h: number) => Math.round(h * found.rendition.aspect);
  return `(max-width: 767.98px) ${width(heights.phone)}px, ${width(heights.other)}px`;
}
