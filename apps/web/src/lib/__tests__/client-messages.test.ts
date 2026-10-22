import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_MESSAGE_SCOPES, pickClientMessages } from '../client-messages';

const srcDir = fileURLToPath(new URL('../../', import.meta.url));
const en = JSON.parse(
  readFileSync(new URL('../../../locales/en.json', import.meta.url), 'utf8')
) as Record<string, Record<string, unknown>>;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === '__tests__' ? [] : walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function main() {
  console.warn('🧪 Client messages suite');

  // Shared picks: nested keys and prefixed subsets, nothing else.
  const shared = pickClientMessages(en);
  assert.deepEqual(Object.keys(shared).sort(), [
    'compare',
    'deals',
    'errors',
    'rate',
    'watchlist',
  ]);
  assert.deepEqual(Object.keys(shared.rate as object), ['nav']);
  assert.ok(
    Object.keys(shared.compare as object).every(
      (k) => k.startsWith('tray') || k.startsWith('quickToggle')
    )
  );
  assert.ok(Object.keys(shared.compare as object).length > 0);

  // A scope adds whole namespaces on top of the shared subsets.
  const detail = pickClientMessages(en, 'productDetail');
  assert.deepEqual(detail.productDetail, en.productDetail);
  assert.deepEqual(detail.watchlist, en.watchlist);
  assert.ok(
    Object.keys(detail.compare as object).every(
      (k) => k.startsWith('tray') || k.startsWith('quickToggle')
    )
  );
  assert.equal(detail.developers, undefined);
  assert.equal(pickClientMessages(en, 'home').homePage, undefined);

  // Every namespace a Client Component reads is in some scope, so no route
  // can lose its strings by accident (DOS/Rate#736).
  const covered = new Set(
    Object.values(CLIENT_MESSAGE_SCOPES)
      .flat()
      .map((pick) => pick.split('.')[0]!.replace(/\*$/, ''))
  );
  const missing = new Set<string>();
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, 'utf8');
    if (!/^['"]use client['"]/m.test(src)) continue;
    for (const m of src.matchAll(
      /useTranslations(?:<[^>]*>)?\(\s*['"]([\w.]+)['"]/g
    )) {
      const ns = m[1]!.split('.')[0]!;
      if (!covered.has(ns)) missing.add(`${ns} (${file.slice(srcDir.length)})`);
    }
  }
  assert.deepEqual([...missing], [], 'client namespaces without a scope');

  console.warn('✅ Client messages suite passed');
}

main();
