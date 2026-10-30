import assert from 'node:assert/strict';
import {
  firstImageUrl,
  isImageUrl,
  productImageUrl,
  resolveProductImageUrl,
  sizedStoreImageUrl,
  storeImageSrcSet,
  usableImageUrls,
} from '../rate-domain-core';

function main() {
  console.warn('🧪 Image URL suite');

  // Store CDN thumbnails at the shown size (DOS/Rate#1328).
  assert.equal(
    sizedStoreImageUrl('https://cdn2.fptshop.com.vn/unsafe/a_b_1.png', 128),
    'https://cdn2.fptshop.com.vn/unsafe/128x0/filters:format(webp)/a_b_1.png'
  );
  assert.equal(
    sizedStoreImageUrl(
      'https://cdn2.fptshop.com.vn/unsafe/800x0/filters:quality(90)/a.png',
      128
    ),
    'https://cdn2.fptshop.com.vn/unsafe/128x0/filters:format(webp)/a.png',
    'an existing size and filter are replaced, not stacked'
  );
  assert.equal(
    sizedStoreImageUrl(
      'https://cdn2.fptshop.com.vn/unsafe/800x/uploads/a.png',
      128
    ),
    'https://cdn2.fptshop.com.vn/unsafe/128x0/filters:format(webp)/uploads/a.png',
    'a width-only size is replaced and a folder path is kept'
  );
  assert.equal(
    sizedStoreImageUrl(
      'https://cdn2.cellphones.com.vn/200x/media/catalog/product/i/p/x.png',
      128
    ),
    'https://cdn2.cellphones.com.vn/128x/media/catalog/product/i/p/x.png'
  );
  assert.equal(
    sizedStoreImageUrl(
      'https://cdn2.cellphones.com.vn/media/catalog/product/x.png',
      128
    ),
    'https://cdn2.cellphones.com.vn/128x/media/catalog/product/x.png'
  );
  for (const other of [
    'https://cdn.tgdd.vn/a.jpg',
    '/img/devices/apple-iphone-16-128gb.jpg',
    'http://cdn2.fptshop.com.vn/unsafe/a.png',
    'https://cdn2.fptshop.com.vn/other/a.png',
    // Thumbor options this rewrite does not model stay untouched.
    'https://cdn2.fptshop.com.vn/unsafe/fit-in/800x800/a.png',
    'https://cdn2.fptshop.com.vn/unsafe/full-fit-in/800x800/a.png',
    'https://cdn2.fptshop.com.vn/unsafe/smart/a.png',
    'https://cdn2.fptshop.com.vn/unsafe/trim/800x0/a.png',
    'https://cdn2.fptshop.com.vn/unsafe/10x10:300x300/800x0/a.png',
    'https://cdn2.fptshop.com.vn/unsafe/800x800/smart/a.png',
    'https://cdn2.fptshop.com.vn/unsafe/800x0/left/top/a.png',
  ]) {
    assert.equal(sizedStoreImageUrl(other, 128), other, other);
  }
  assert.equal(sizedStoreImageUrl(null, 128), null);
  assert.equal(
    sizedStoreImageUrl('https://cdn2.fptshop.com.vn/unsafe/a.png', 5),
    'https://cdn2.fptshop.com.vn/unsafe/32x0/filters:format(webp)/a.png',
    'the width is kept within 32-1024'
  );

  // The product hero's srcSet of a store CDN image (DOS/Rate#1417).
  assert.equal(
    storeImageSrcSet('https://cdn2.fptshop.com.vn/unsafe/a.png'),
    [200, 400, 600, 800]
      .map(
        (w) =>
          `https://cdn2.fptshop.com.vn/unsafe/${w}x0/filters:format(webp)/a.png ${w}w`
      )
      .join(', ')
  );
  assert.equal(
    storeImageSrcSet(
      'https://cdn2.cellphones.com.vn/200x/media/catalog/product/x.png'
    ),
    [200, 400, 600]
      .map(
        (w) =>
          `https://cdn2.cellphones.com.vn/${w}x/media/catalog/product/x.png ${w}w`
      )
      .join(', '),
    'CellphoneS stops at 600 (it never enlarges); a sized URL gets every width'
  );
  assert.equal(
    storeImageSrcSet(
      'https://cdn2.fptshop.com.vn/unsafe/800x0/filters:format(webp)/a.png'
    ),
    [200, 400, 600, 800]
      .map(
        (w) =>
          `https://cdn2.fptshop.com.vn/unsafe/${w}x0/filters:format(webp)/a.png ${w}w`
      )
      .join(', ')
  );
  for (const other of [
    'https://cdn.tgdd.vn/a.jpg',
    '/img/devices/apple-iphone-16-128gb.jpg',
    'https://cdn2.fptshop.com.vn/unsafe/fit-in/800x800/a.png',
    'http://cdn2.fptshop.com.vn/unsafe/a.png',
    'https://cdn2.cellphones.com.vn/catalog/x.png',
    // A filter that changes the picture would be lost in the resize.
    'https://cdn2.fptshop.com.vn/unsafe/800x800/filters:rotate(90)/a.png',
    'https://cdn2.fptshop.com.vn/unsafe/filters:quality(90):fill(white)/a.png',
    'not a url',
    '',
    null,
    undefined,
  ]) {
    assert.equal(storeImageSrcSet(other), null, String(other));
  }

  assert.equal(isImageUrl('https://cdn.tgdd.vn/a.jpg'), true);
  assert.equal(isImageUrl('http://example.com/a.png'), true);
  assert.equal(isImageUrl('//cf.shopee.vn/file/abc'), true);
  assert.equal(isImageUrl('/img/devices/iphone.jpg'), true);
  assert.equal(isImageUrl('[object Object]'), false);
  assert.equal(isImageUrl(''), false);
  assert.equal(isImageUrl('abc.jpg'), false);
  assert.equal(isImageUrl({ url: 'https://x/a.jpg' }), false);
  assert.equal(isImageUrl(null), false);

  // TGDD rows store "[object Object]" before their real URLs.
  assert.equal(
    firstImageUrl([
      '[object Object]',
      '[object Object]',
      'https://cdn.tgdd.vn/a.jpg',
    ]),
    'https://cdn.tgdd.vn/a.jpg'
  );
  assert.equal(
    firstImageUrl(['https://a/1.jpg', 'https://a/2.jpg']),
    'https://a/1.jpg'
  );
  assert.equal(firstImageUrl(['[object Object]']), null);
  assert.equal(firstImageUrl([]), null);
  assert.equal(firstImageUrl(null), null);
  assert.equal(firstImageUrl(undefined), null);

  // A protocol-relative or absolute URL needs a host.
  assert.equal(isImageUrl('//'), false);
  assert.equal(isImageUrl('/'), false);
  assert.equal(isImageUrl('https://'), false);
  assert.equal(firstImageUrl(['//', '/img/good.jpg']), '/img/good.jpg');

  // A junk thumbnail gives way to the first usable stored image.
  assert.equal(
    productImageUrl({
      thumbnail: '[object Object]',
      images: ['[object Object]', 'https://a/1.jpg'],
    }),
    'https://a/1.jpg'
  );
  assert.equal(
    productImageUrl({ thumbnail: '/t.jpg', images: ['https://a/1.jpg'] }),
    '/t.jpg'
  );
  assert.equal(productImageUrl({ thumbnail: null, images: null }), null);

  // Surrounding whitespace is trimmed rather than rejected.
  assert.equal(isImageUrl('  https://a/1.jpg\n'), true);
  assert.equal(firstImageUrl([' https://a/1.jpg ']), 'https://a/1.jpg');
  assert.deepEqual(
    usableImageUrls(['[object Object]', 'https://a/1.jpg', '', '/b.png']),
    ['https://a/1.jpg', '/b.png']
  );

  // A junk thumbnail or fallback gives way to the stored images.
  assert.equal(
    resolveProductImageUrl({
      slug: 'e2e-not-local',
      thumbnail: '[object Object]',
      images: ['[object Object]', 'https://a/1.jpg'],
    }),
    'https://a/1.jpg'
  );
  assert.equal(
    resolveProductImageUrl('e2e-not-local', '[object Object]'),
    null
  );

  console.warn('✅ Image URL suite passed');
}

main();
