import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');

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

async function main() {
  fs.rmSync(distDir, { recursive: true, force: true });
  ensureDir(path.join(distDir, 'icons'));
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

  // 3. Bundle each entry with esbuild so every output is self-contained.
  //    The service worker and side panel load as ES modules (manifest
  //    "type": "module", <script type="module">); content scripts cannot use
  //    import, so that entry is an IIFE.
  const common = {
    bundle: true,
    platform: 'browser',
    target: ['chrome116'],
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
  };
  await build({
    ...common,
    format: 'esm',
    entryPoints: {
      'background/service-worker': path.join(srcDir, 'background', 'service-worker.ts'),
      'sidepanel/sidepanel': path.join(srcDir, 'sidepanel', 'sidepanel.ts'),
    },
    outdir: distDir,
  });
  await build({
    ...common,
    format: 'iife',
    entryPoints: {
      'content/content-script': path.join(srcDir, 'content', 'content-script.ts'),
    },
    outdir: distDir,
  });
  fs.copyFileSync(
    path.join(srcDir, 'sidepanel', 'sidepanel.html'),
    path.join(distDir, 'sidepanel', 'sidepanel.html')
  );

  console.log(
    '✅ Built Rate Browser Extension (Manifest V3) into apps/extension/dist'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
