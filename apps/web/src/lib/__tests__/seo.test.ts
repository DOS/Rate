import assert from 'node:assert/strict';
import { MAX_TITLE_LENGTH, absoluteUrl, fitTitle, siteJsonLd } from '../seo';

function main() {
  console.warn('🧪 SEO helpers suite');

  // Relative paths resolve on rate.vn; absolute URLs pass through (#738).
  assert.equal(
    absoluteUrl('/img/devices/apple-iphone-16-128gb.jpg'),
    'https://rate.vn/img/devices/apple-iphone-16-128gb.jpg'
  );
  assert.equal(absoluteUrl('img/x.png'), 'https://rate.vn/img/x.png');
  assert.equal(
    absoluteUrl('https://cdn.example.com/a.jpg'),
    'https://cdn.example.com/a.jpg'
  );

  const site = siteJsonLd('en', 'Real prices and filtered reviews');
  const [org, web] = site['@graph'];
  assert.equal(org!['@type'], 'Organization');
  assert.equal(org!.logo, 'https://rate.vn/icon.png');
  assert.equal(web!['@type'], 'WebSite');
  assert.equal(web!.inLanguage, 'en');
  assert.deepEqual(web!.publisher, { '@id': org!['@id'] });

  // The first title that fits wins; otherwise the last is cut at a word (#777).
  assert.equal(fitTitle(['short', 'shorter']), 'short');
  const long = `So sánh ${'A'.repeat(30)} và ${'B'.repeat(30)}: 10 nhóm | Rate.vn`;
  assert.equal(
    fitTitle([long, 'Apple Watch Series 11 vs Apple Watch Ultra 2 | Rate.vn']),
    'Apple Watch Series 11 vs Apple Watch Ultra 2 | Rate.vn'
  );
  const cut = fitTitle([
    long,
    'Apple Watch Series 11 46mm GPS 64GB vs Apple Watch Ultra 2 49mm 64GB',
  ]);
  assert.equal(
    cut,
    'Apple Watch Series 11 46mm GPS 64GB vs Apple Watch Ultra 2 49mm…'
  );
  assert.ok(cut.length <= MAX_TITLE_LENGTH);
  // A single word longer than the limit is cut inside it.
  const word = fitTitle(['x'.repeat(80)]);
  assert.equal(word.length, MAX_TITLE_LENGTH);
  assert.ok(word.endsWith('…'));

  console.warn('✅ SEO helpers suite passed');
}

main();
