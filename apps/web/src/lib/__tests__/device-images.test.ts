import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { DEVICE_IMAGE_RENDITIONS } from '../device-image-renditions';
import { deviceImageSizesForHeight, deviceImageSrcSet } from '../device-images';

const here = dirname(fileURLToPath(import.meta.url));
const devicesDir = join(here, '../../../public/img/devices');
const sizedDir = join(devicesDir, 'sized');
// Mirrors scripts/device-images.mjs.
const TARGET_WIDTHS = [200, 400, 600, 800];
const WEBP_QUALITY = 78;

async function main() {
  console.warn('🧪 Device image renditions suite (DOS/Rate#1332)');

  const big = DEVICE_IMAGE_RENDITIONS['apple-macbook-pro-m4-pro-14-inch-512gb'];
  assert.ok(big);
  assert.equal(
    deviceImageSrcSet(
      '/img/devices/apple-macbook-pro-m4-pro-14-inch-512gb.jpg'
    ),
    [200, 400, 600, 800]
      .map(
        (w) =>
          `/img/devices/sized/apple-macbook-pro-m4-pro-14-inch-512gb-${w}.${big.hash}.webp ${w}w`
      )
      .join(', ')
  );
  // A 160 px photo has one rendition at its own width, listed as 1x so it
  // keeps its natural size (as 200w/600w the browser would shrink it to a
  // third of the card; as 160w it would stretch it to the 176 px slot).
  const small = DEVICE_IMAGE_RENDITIONS['apple-iphone-16-128gb'];
  assert.ok(small);
  assert.deepEqual(small.widths, [160]);
  assert.equal(
    deviceImageSrcSet('/img/devices/apple-iphone-16-128gb.jpg'),
    `/img/devices/sized/apple-iphone-16-128gb-160.${small.hash}.webp 1x`
  );
  for (const other of [
    null,
    undefined,
    '',
    '/img/devices/not-a-known-device.jpg',
    '/img/devices/apple-iphone-16-128gb.png',
    'https://cdn.tgdd.vn/apple-iphone-16-128gb.jpg',
    '/img/devices/../apple-iphone-16-128gb.jpg',
  ]) {
    assert.equal(deviceImageSrcSet(other), null, String(other));
  }

  // Every photo has current renditions, each as wide as its descriptor says:
  // run scripts/device-images.mjs after adding or replacing one.
  const photos = readdirSync(devicesDir).filter((f) => f.endsWith('.jpg'));
  assert.deepEqual(
    photos.map((f) => f.replace(/\.jpg$/, '')).sort(),
    Object.keys(DEVICE_IMAGE_RENDITIONS).sort(),
    'the rendition manifest lists exactly the photos in public/img/devices'
  );
  const expectedFiles = new Set<string>();
  for (const file of photos) {
    const slug = file.replace(/\.jpg$/, '');
    const source = readFileSync(join(devicesDir, file));
    const { width: sourceWidth = 0, height: sourceHeight = 1 } =
      await sharp(source).metadata();
    const aspect = Math.round((sourceWidth / sourceHeight) * 1000) / 1000;
    const widths = TARGET_WIDTHS.filter((w) => w < sourceWidth);
    if (widths.length < TARGET_WIDTHS.length) widths.push(sourceWidth);
    const hash = createHash('sha256')
      .update(source)
      .update(JSON.stringify({ widths, quality: WEBP_QUALITY }))
      .digest('hex')
      .slice(0, 10);
    assert.deepEqual(
      DEVICE_IMAGE_RENDITIONS[slug],
      { hash, widths, aspect },
      `${file} changed since its renditions were built`
    );
    for (const w of widths) {
      const name = `${slug}-${w}.${hash}.webp`;
      assert.ok(existsSync(join(sizedDir, name)), `missing ${name}`);
      const { width, format } = await sharp(join(sizedDir, name)).metadata();
      assert.equal(format, 'webp', name);
      assert.equal(width, w, `${name} is ${width} px wide`);
      expectedFiles.add(name);
    }
  }
  assert.deepEqual(
    readdirSync(sizedDir).sort(),
    [...expectedFiles].sort(),
    'no stale renditions are left in public/img/devices/sized'
  );

  const nextConfig = readFileSync(
    join(here, '../../../next.config.mjs'),
    'utf8'
  );
  const sizedRule = nextConfig.indexOf('"/img/devices/sized/:path*"');
  assert.ok(
    sizedRule > nextConfig.indexOf('"/img/:path*"') &&
      nextConfig
        .slice(sizedRule, sizedRule + 300)
        .includes('public, max-age=31536000, immutable'),
    'renditions are cached as immutable, and that rule comes after /img/:path*'
  );

  // Every <img> that names device renditions sets srcSet (and sizes) before
  // src, so an image React creates never starts the JPEG first; the product
  // hero names them too, because React puts a preload for a non-lazy <img>
  // into the page payload, and a prefetch of the page applies it: with
  // srcSet the preload fetches a WebP rendition, never the full JPEG
  // (DOS/Rate#1413).
  const webSrc = join(here, '../..');
  const imgTags = (rel: string) =>
    [...readFileSync(join(webSrc, rel), 'utf8').matchAll(/<img\b[\s\S]*?\/>/g)]
      .map((m) => m[0])
      .filter(
        (tag) =>
          tag.includes('deviceImageSrcSet(') || tag.includes('heroSrcSet')
      );
  const productPage = imgTags('app/[locale]/smartphones/[slug]/page.tsx');
  const cards = imgTags('components/product/ProductCard.tsx');
  // The hero names the WebP renditions of a device photo, or a store CDN's
  // resized copies (DOS/Rate#1417), each with its own sizes.
  assert.ok(
    productPage.some(
      (tag) =>
        tag.includes('srcSet={heroSrcSet}') && tag.includes('sizes={heroSizes}')
    ),
    'the product hero names its sized copies'
  );
  const productSource = readFileSync(
    join(webSrc, 'app/[locale]/smartphones/[slug]/page.tsx'),
    'utf8'
  );
  assert.match(
    productSource,
    /const heroDeviceSrcSet = deviceImageSrcSet\(mainImage\);\s*const heroStoreSrcSet = heroDeviceSrcSet \? null : storeImageSrcSet\(mainImage\);/
  );
  assert.match(
    productSource,
    /const heroSizes = heroDeviceSrcSet\s*\? deviceImageSizesForHeight\(mainImage, \{ phone: 190, other: 350 \}\)\s*: heroStoreSrcSet\s*\? STORE_HERO_SIZES/
  );
  assert.equal(productPage.length, 2, 'hero and peer cards');
  assert.equal(cards.length, 1);
  for (const tag of [...productPage, ...cards]) {
    const srcAt = tag.search(/\ssrc=\{/);
    assert.ok(srcAt > 0, tag);
    assert.ok(tag.indexOf('srcSet=') < srcAt, `srcSet before src: ${tag}`);
    assert.ok(tag.indexOf('sizes=') < srcAt, `sizes before src: ${tag}`);
  }

  // A hero box capped in height sizes a photo by its width / height: a
  // landscape photo is wider than the cap, a square one as wide (#1413).
  const buds = DEVICE_IMAGE_RENDITIONS['samsung-galaxy-buds3-pro'];
  assert.ok(buds && buds.aspect > 1.4, 'a 600x400 landscape photo');
  assert.equal(
    deviceImageSizesForHeight('/img/devices/samsung-galaxy-buds3-pro.jpg', {
      phone: 190,
      other: 350,
    }),
    `(max-width: 767.98px) ${Math.round(190 * buds.aspect)}px, ${Math.round(350 * buds.aspect)}px`
  );
  assert.equal(
    deviceImageSizesForHeight(
      '/img/devices/apple-macbook-pro-m4-pro-14-inch-512gb.jpg',
      { phone: 190, other: 350 }
    ),
    '(max-width: 767.98px) 190px, 350px'
  );
  assert.equal(
    deviceImageSizesForHeight('/img/devices/apple-iphone-16-128gb.jpg', {
      phone: 190,
      other: 350,
    }),
    undefined,
    'a single 1x rendition keeps its natural size'
  );
  assert.equal(
    deviceImageSizesForHeight('https://cdn.tgdd.vn/a.jpg', {
      phone: 190,
      other: 350,
    }),
    undefined
  );
  // An 800 px source serves a 350 px hero on a 2x screen from an 800 rendition.
  assert.ok(
    DEVICE_IMAGE_RENDITIONS[
      'apple-macbook-pro-m4-pro-14-inch-512gb'
    ]?.widths.includes(800)
  );

  console.warn('✅ Device image renditions suite passed');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
