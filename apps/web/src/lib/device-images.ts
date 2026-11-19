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

/**
 * The licence notice of a device photo Rate did not take itself and may show
 * only with attribution (DOS/Rate#1756). Every photo in public/img/devices
 * that is under such a licence has an entry here, keyed by its file name, and
 * the product page prints it under the photo: the author, the source file
 * page, the licence and the changes Rate made. A photo with no entry is shown
 * without a notice, so a licensed photo is added together with its entry.
 */
export interface DeviceImageCredit {
  /** The author as the source page names them. */
  readonly author: string;
  /** The source file page (Wikimedia Commons), which carries the licence. */
  readonly sourceUrl: string;
  readonly license: 'CC BY-SA 4.0';
  readonly licenseUrl: string;
}

export const DEVICE_IMAGE_CREDITS: Readonly<Record<string, DeviceImageCredit>> =
  {
    // https://commons.wikimedia.org/wiki/File:IPhone_17e_backside.jpg
    // (Own work, 2026-03-12; original 4284x5712, SHA-1
    // 6b01bfb190ee7319595a6d26d41f4c48dfadfe22). Rate's copy is cropped to
    // the phone and resized to 600x800, so it is shared under the same
    // licence (CC BY-SA 4.0, ShareAlike).
    'apple-iphone-17e': {
      author: '茅野ふたば',
      sourceUrl:
        'https://commons.wikimedia.org/wiki/File:IPhone_17e_backside.jpg',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
  };

/** The licence notice of a local device photo, or null when it needs none. */
export function deviceImageCredit(
  src: string | null | undefined
): DeviceImageCredit | null {
  if (typeof src !== 'string') return null;
  const slug = /^\/img\/devices\/([a-z0-9-]+)\.jpg$/.exec(src)?.[1];
  return slug && Object.hasOwn(DEVICE_IMAGE_CREDITS, slug)
    ? DEVICE_IMAGE_CREDITS[slug]!
    : null;
}
