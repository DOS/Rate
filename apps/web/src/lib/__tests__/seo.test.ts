import assert from 'node:assert/strict';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  SITE_URL,
  absoluteUrl,
  fitDescription,
  fitTitle,
  siteJsonLd,
} from '../seo';
import { buildSafeCsvContent, escapeCsvCell } from '../csv-safe';
import {
  pageMerchantDirectory,
  parseMerchantDirectoryFilters,
} from '../merchant-directory';

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
  // No dangling "vs" before the ellipsis.
  assert.equal(
    fitTitle([
      'ABCDE Galaxy S25 Ultra 256GB vs Galaxy S25 Ultra 512GB Gold vs X Y',
    ]),
    'ABCDE Galaxy S25 Ultra 256GB vs Galaxy S25 Ultra 512GB Gold…'
  );
  // Degenerate input stays sane.
  assert.equal(fitTitle([]), '');
  assert.ok(fitTitle(['abc def ghi jkl'], 0).length <= 1);
  // An emoji is never split into a lone surrogate.
  const emoji = fitTitle(['😀'.repeat(70)]);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji));
  assert.ok(emoji.length <= MAX_TITLE_LENGTH);
  assert.ok(
    fitTitle([
      'iPhone 16 Pro Max 256GB vs Galaxy S25 Ultra 256GB 😀😀😀😀😀😀😀😀😀😀 extra words',
    ]).length <= MAX_TITLE_LENGTH
  );

  // Descriptions built from long names are cut at a word under 160 (#793).
  const longDesc = `So sánh giá ${'Galaxy Z Fold7 Ultra '.repeat(8)}từ 5 gian hàng trên Rate.vn.`;
  const fittedDesc = fitDescription(longDesc);
  assert.ok(fittedDesc.length <= MAX_DESCRIPTION_LENGTH);
  assert.ok(fittedDesc.endsWith('…'));
  assert.equal(fitDescription('Ngắn gọn.'), 'Ngắn gọn.');

  // DOS/Rate#848: absoluteUrl protocol-relative/credential/invalid guards, fitTitle NaN/control chars, CSV & merchant-directory bounds
  assert.equal(absoluteUrl('//evil.example.com/phish'), SITE_URL);
  assert.equal(absoluteUrl('/\\evil.example.com/phish'), SITE_URL);
  assert.equal(
    absoluteUrl('https://user:pass@cdn.example.com/a.jpg'),
    SITE_URL
  );
  assert.equal(absoluteUrl('javascript:alert(1)'), SITE_URL);
  assert.equal(absoluteUrl('http://[invalid-url'), SITE_URL);
  assert.equal(
    fitTitle(['  iPhone 16\u0000\r\nPro   Max  '], Number.NaN),
    'iPhone 16 Pro Max'
  );

  assert.equal(
    escapeCsvCell('\u0000=cmd|"/c calc"!A0'),
    `"'=cmd|""/c calc""!A0"`
  );
  assert.equal(escapeCsvCell('\u000b+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(escapeCsvCell('-15.4%'), '-15.4%');
  assert.equal(escapeCsvCell('x'.repeat(12_000)).length, 10_000);
  const csvOut = buildSafeCsvContent(['col1', 'col2'], [['\u0000=1+1', 42]]);
  assert.ok(csvOut.includes("'=1+1,42"));

  const params848 = new URLSearchParams(
    'q=  Apple\u0000\r\nStore  &platform=bad<script>plat'
  );
  const parsedFilters848 = parseMerchantDirectoryFilters((k) =>
    params848.get(k)
  );
  assert.equal(parsedFilters848.query, 'Apple Store');
  assert.equal(parsedFilters848.platform, 'all');
  const paged848 = pageMerchantDirectory([], parsedFilters848, -10, 999_999);
  assert.equal(paged848.offset, 0);

  console.warn('✅ SEO helpers suite passed');
}

main();
