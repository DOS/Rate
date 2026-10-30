import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The /developers API table and spec group cards read their access, cache
// and title text from the messages, so the Czech and Vietnamese pages are
// not left with English cells (DOS/Rate#1372).

const root = path.join(__dirname, '../../..');
const page = fs.readFileSync(
  path.join(root, 'src/app/[locale]/developers/page.tsx'),
  'utf8'
);
const messages = Object.fromEntries(
  ['vi', 'en', 'cs'].map((locale) => [
    locale,
    JSON.parse(
      fs.readFileSync(path.join(root, `locales/${locale}.json`), 'utf8')
    ).developers as Record<string, unknown>,
  ])
);

// No access label, no-store note or group title is written in the page.
for (const english of [
  'Public (CORS)',
  'Opt-in consent required',
  'Bearer token (Supabase Auth)',
  '(queues rate.crawl_jobs)',
  '(database trigger)',
  'Cameras (PhoneArena split)',
  'Launch & availability',
]) {
  assert.ok(!page.includes(`'${english}`), `page still writes "${english}"`);
}
assert.doesNotMatch(page, /\btitle: '/, 'group titles come from messages');

const keys = [
  'authPublic',
  'authOptIn',
  'authBearer',
  'cacheNoStoreQueue',
  'cacheNoStoreRpc',
  'cacheNoStoreTrigger',
];
const groups = [
  'launch',
  'body',
  'display',
  'platform',
  'memory',
  'cameras',
  'audio',
  'connectivity',
  'battery',
  'misc',
];
for (const locale of ['vi', 'en', 'cs']) {
  const dev = messages[locale]!;
  const titles = dev.groupTitles as Record<string, string>;
  for (const key of keys) {
    assert.equal(typeof dev[key], 'string', `${locale}.${key}`);
  }
  assert.deepEqual(Object.keys(titles).sort(), [...groups].sort(), locale);
  for (const group of groups) {
    assert.ok(page.includes(`key: '${group}'`), `${group} card exists`);
  }
}
// The Czech and Vietnamese text differs from the English wherever words,
// not identifiers, carry the meaning.
for (const locale of ['vi', 'cs']) {
  const dev = messages[locale]!;
  for (const key of ['authPublic', 'authOptIn', 'cacheNoStoreQueue']) {
    assert.notEqual(dev[key], messages.en![key], `${locale}.${key}`);
  }
  for (const group of groups) {
    assert.notEqual(
      (dev.groupTitles as Record<string, string>)[group],
      (messages.en!.groupTitles as Record<string, string>)[group],
      `${locale} group ${group}`
    );
  }
}

console.warn('  ✅ /developers table and group titles are localized (#1372)');
