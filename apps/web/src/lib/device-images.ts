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
  /** The BCP 47 language of the author's name, so screen readers say it right. */
  readonly authorLang?: string;
  /** The source file page (Wikimedia Commons), which carries the licence. */
  readonly sourceUrl: string;
  readonly license: 'CC BY-SA 4.0';
  readonly licenseUrl: string;
}

// No credited photo yet: the iPhone 17e store photo was dropped in review
// (DOS/Rate#1756). Add a photo together with its entry here and its row in
// public/img/devices/CREDITS.md.
export const DEVICE_IMAGE_CREDITS: Readonly<Record<string, DeviceImageCredit>> =
  {};

/** The licence notice of a local device photo, or null when it needs none. */
export function deviceImageCredit(
  src: string | null | undefined,
  credits: Readonly<Record<string, DeviceImageCredit>> = DEVICE_IMAGE_CREDITS
): DeviceImageCredit | null {
  if (typeof src !== 'string') return null;
  const slug = /^\/img\/devices\/([a-z0-9-]+)\.jpg$/.exec(src)?.[1];
  return slug && Object.hasOwn(credits, slug) ? credits[slug]! : null;
}

/**
 * A schema.org image for a product's JSON-LD: the absolute URL, or for a
 * credited photo an ImageObject with its creator, credit and licence, so the
 * notice travels with the image (DOS/Rate#1756).
 */
export function deviceImageJsonLd(
  src: string,
  absoluteSrc: string,
  credits: Readonly<Record<string, DeviceImageCredit>> = DEVICE_IMAGE_CREDITS
): string | Record<string, unknown> {
  const credit = deviceImageCredit(src, credits);
  if (!credit) return absoluteSrc;
  return {
    '@type': 'ImageObject',
    contentUrl: absoluteSrc,
    creator: { '@type': 'Person', name: credit.author },
    creditText: `${credit.author}, Wikimedia Commons, ${credit.license}`,
    license: credit.licenseUrl,
    acquireLicensePage: credit.sourceUrl,
  };
}
