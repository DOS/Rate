import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEVICE_IMAGE_RENDITIONS } from '../device-image-renditions';
import { DEVICE_IMAGE_WIDTHS, deviceImageSrcSet } from '../device-images';

const here = dirname(fileURLToPath(import.meta.url));
const devicesDir = join(here, '../../../public/img/devices');
const sizedDir = join(devicesDir, 'sized');

function main() {
  console.warn('🧪 Device image renditions suite (DOS/Rate#1332)');

  const hash = DEVICE_IMAGE_RENDITIONS['apple-iphone-16-128gb'];
  assert.ok(hash);
  assert.equal(
    deviceImageSrcSet('/img/devices/apple-iphone-16-128gb.jpg'),
    `/img/devices/sized/apple-iphone-16-128gb-200.${hash}.webp 200w, ` +
      `/img/devices/sized/apple-iphone-16-128gb-400.${hash}.webp 400w, ` +
      `/img/devices/sized/apple-iphone-16-128gb-600.${hash}.webp 600w`
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

  // Every photo has current renditions: run scripts/device-images.mjs after
  // adding or replacing one.
  const photos = readdirSync(devicesDir).filter((f) => f.endsWith('.jpg'));
  assert.deepEqual(
    photos.map((f) => f.replace(/\.jpg$/, '')).sort(),
    Object.keys(DEVICE_IMAGE_RENDITIONS).sort(),
    'the rendition manifest lists exactly the photos in public/img/devices'
  );
  const expectedFiles = new Set<string>();
  for (const file of photos) {
    const slug = file.replace(/\.jpg$/, '');
    const sourceHash = createHash('sha256')
      .update(readFileSync(join(devicesDir, file)))
      .digest('hex')
      .slice(0, 10);
    assert.equal(
      DEVICE_IMAGE_RENDITIONS[slug],
      sourceHash,
      `${file} changed since its renditions were built`
    );
    for (const w of DEVICE_IMAGE_WIDTHS) {
      const name = `${slug}-${w}.${sourceHash}.webp`;
      assert.ok(existsSync(join(sizedDir, name)), `missing ${name}`);
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

  console.warn('✅ Device image renditions suite passed');
}

main();
