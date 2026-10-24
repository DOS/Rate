import assert from 'node:assert/strict';
import { firstImageUrl, isImageUrl } from '../rate-domain-core';

function main() {
  console.warn('🧪 Image URL suite');

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

  console.warn('✅ Image URL suite passed');
}

main();
