import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const srcDir = path.join(rootDir, 'src');

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

  // 2. Copy the official Rate star icons (resized from the brand logo) into dist/icons/
  for (const size of [16, 48, 128]) {
    fs.copyFileSync(
      path.join(rootDir, 'assets', 'icons', `icon-${size}.png`),
      path.join(distDir, 'icons', `icon-${size}.png`)
    );
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
