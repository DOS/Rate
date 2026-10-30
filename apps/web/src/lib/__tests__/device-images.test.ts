import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { DEVICE_IMAGE_RENDITIONS } from '../device-image-renditions';
import { deviceImageSrcSet } from '../device-images';

const here = dirname(fileURLToPath(import.meta.url));
const devicesDir = join(here, '../../../public/img/devices');
const sizedDir = join(devicesDir, 'sized');
// Mirrors scripts/device-images.mjs.
const TARGET_WIDTHS = [200, 400, 600];
const WEBP_QUALITY = 78;

async function main() {
  console.warn('🧪 Device image renditions suite (DOS/Rate#1332)');

  const big = DEVICE_IMAGE_RENDITIONS['apple-macbook-pro-m4-pro-14-inch-512gb'];
  assert.ok(big);
  assert.equal(
    deviceImageSrcSet(
      '/img/devices/apple-macbook-pro-m4-pro-14-inch-512gb.jpg'
    ),
    [200, 400, 600]
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
    const { width: sourceWidth = 0 } = await sharp(source).metadata();
    const widths = TARGET_WIDTHS.filter((w) => w < sourceWidth);
    if (widths.length < TARGET_WIDTHS.length) widths.push(sourceWidth);
    const hash = createHash('sha256')
      .update(source)
      .update(JSON.stringify({ widths, quality: WEBP_QUALITY }))
      .digest('hex')
      .slice(0, 10);
    assert.deepEqual(
      DEVICE_IMAGE_RENDITIONS[slug],
      { hash, widths },
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
      .filter((tag) => tag.includes('deviceImageSrcSet('));
  const productPage = imgTags('app/[locale]/smartphones/[slug]/page.tsx');
  const cards = imgTags('components/product/ProductCard.tsx');
  assert.ok(
    productPage.some((tag) => tag.includes('deviceImageSrcSet(mainImage)')),
    'the product hero names the WebP renditions'
  );
  assert.equal(productPage.length, 2, 'hero and peer cards');
  assert.equal(cards.length, 1);
  for (const tag of [...productPage, ...cards]) {
    const srcAt = tag.search(/\ssrc=\{/);
    assert.ok(srcAt > 0, tag);
    assert.ok(tag.indexOf('srcSet=') < srcAt, `srcSet before src: ${tag}`);
    assert.ok(tag.indexOf('sizes=') < srcAt, `sizes before src: ${tag}`);
  }

  console.warn('✅ Device image renditions suite passed');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
