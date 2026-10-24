import assert from 'node:assert/strict';
import { contentLang, isVietnamese } from '../content-lang';

function main() {
  console.warn('🧪 Content language suite');

  assert.equal(isVietnamese('Sạc nhanh 35W PD3.1'), true);
  assert.equal(isVietnamese('Xanh Lưu Ly'), true);
  assert.equal(isVietnamese('Đen'), true);
  // Grave and tilde vowels without other Vietnamese letters.
  assert.equal(isVietnamese('iPhone 16 chính hãng'), true);
  assert.equal(isVietnamese('Màu đen'), true);
  assert.equal(isVietnamese('Tai nghe kĩ'), true);
  assert.equal(isVietnamese('Titanium Black'), false);
  assert.equal(isVietnamese('A18 Bionic, 6GB'), false);
  // Decomposed input (NFD) is still recognised.
  assert.equal(isVietnamese('Trắng'.normalize('NFD')), true);

  const speaker = 'Loa kép hỗ trợ Dolby Atmos';
  assert.equal(contentLang(speaker, 'en'), 'vi');
  assert.equal(contentLang(speaker, 'cs'), 'vi');
  assert.equal(contentLang(speaker, 'vi'), undefined);
  assert.equal(contentLang('Dual stereo speakers', 'en'), undefined);
  // Czech letters shared with Vietnamese (á, é, í, ó, ú, ý) do not count, so
  // Vietnamese with acute marks only stays unmarked.
  assert.equal(contentLang('Displej a výkon', 'cs'), undefined);
  assert.equal(isVietnamese('Loa kép'), false);
  assert.equal(contentLang(null, 'en'), undefined);
  assert.equal(contentLang(5000, 'en'), undefined);
  assert.equal(contentLang(true, 'en'), undefined);
  assert.equal(isVietnamese(''), false);
  assert.equal(isVietnamese(null as unknown as string), false);
  // Oversized input (> 4_000 chars) slices before NFC normalization (#852)
  assert.equal(isVietnamese('a'.repeat(5_000) + 'đ'), false);
  assert.equal(isVietnamese('Đ' + 'a'.repeat(5_000)), true);

  console.warn('✅ Content language suite passed');
}

main();
