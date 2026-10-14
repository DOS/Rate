import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const esmDir = path.join(distDir, 'esm');

/**
 * Generate a valid RGBA PNG buffer at exact pixel dimensions (size x size)
 * featuring Rate.vn's dark badge (#12151a) and signature red dot (#FF2E29).
 */
function createRateIconPng(size) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4 + 1;
  const rawPixels = Buffer.alloc(stride * size);
  const center = (size - 1) / 2;
  const outerRadius = size * 0.46;
  const innerRadius = size * 0.24;

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    rawPixels[rowStart] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= innerRadius) {
        // Rate Red (#FF2E29)
        rawPixels[px] = 0xff;
        rawPixels[px + 1] = 0x2e;
        rawPixels[px + 2] = 0x29;
        rawPixels[px + 3] = 0xff;
      } else if (dist <= outerRadius) {
        // Dark Charcoal (#12151a)
        rawPixels[px] = 0x12;
        rawPixels[px + 1] = 0x15;
        rawPixels[px + 2] = 0x1a;
        rawPixels[px + 3] = 0xff;
      } else {
        // Transparent outside circle
        rawPixels[px] = 0;
        rawPixels[px + 1] = 0;
        rawPixels[px + 2] = 0;
        rawPixels[px + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(rawPixels);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(path.join(distDir, 'icons'));
  ensureDir(path.join(distDir, 'background'));
  ensureDir(path.join(distDir, 'content'));
  ensureDir(path.join(distDir, 'sidepanel'));

  // 1. Copy manifest.json
  fs.copyFileSync(
    path.join(rootDir, 'manifest.json'),
    path.join(distDir, 'manifest.json')
  );

  // 2. Generate 16x16, 48x48, 128x128 PNG icons into dist/icons/
  for (const size of [16, 48, 128]) {
    const png = createRateIconPng(size);
    fs.writeFileSync(path.join(distDir, 'icons', `icon-${size}.png`), png);
  }

  // 3. Copy service-worker.js & sidepanel.js + sidepanel.html
  fs.copyFileSync(
    path.join(esmDir, 'background', 'service-worker.js'),
    path.join(distDir, 'background', 'service-worker.js')
  );
  fs.copyFileSync(
    path.join(esmDir, 'sidepanel', 'sidepanel.js'),
    path.join(distDir, 'sidepanel', 'sidepanel.js')
  );
  fs.copyFileSync(
    path.join(rootDir, 'src', 'sidepanel', 'sidepanel.html'),
    path.join(distDir, 'sidepanel', 'sidepanel.html')
  );

  // 4. Bundle content-script.js as a self-contained IIFE (MV3 content scripts cannot use top-level import)
  const detectorCode = fs
    .readFileSync(
      path.join(esmDir, 'extractors', 'ecommerce-detector.js'),
      'utf8'
    )
    .replace(/^export\s+/gm, '');

  const contentCode = fs
    .readFileSync(path.join(esmDir, 'content', 'content-script.js'), 'utf8')
    .replace(/^import\s+.*from\s+['"].*['"];?\s*$/gm, '');

  const bundledContentScript = `(() => {\n"use strict";\n${detectorCode}\n${contentCode}\n})();\n`;
  fs.writeFileSync(
    path.join(distDir, 'content', 'content-script.js'),
    bundledContentScript,
    'utf8'
  );

  // Remove intermediate dist/esm directory so dist/ is a clean unpacked MV3 extension folder
  fs.rmSync(esmDir, { recursive: true, force: true });

  console.log(
    '✅ Built Rate Browser Extension (Manifest V3) into apps/extension/dist'
  );
}

main();
