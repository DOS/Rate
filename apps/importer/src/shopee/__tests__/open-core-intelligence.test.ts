/**
 * Verification Suite for Open-Core Intelligence Layer (@repo/crawlers):
 * - Multi-Category Detection (smartphones, tablets, laptops, smartwatches, earbuds)
 * - RAM/ROM Disambiguation & Identity Safety (:unknown + needs_review)
 * - 10-Field-Groups Benchmark Enrichment & Zod Schema Conformance
 */
import assert from 'node:assert/strict';
import { ProductSpecificationsSchema } from '@repo/shared-data';
import { ProductNormalizer, detectCategorySlug } from '../product-normalizer.js';
import { FLAGSHIP_DEVICES_TO_SEED } from '../flagship-seed-data.js';
import type { ShopeeProduct } from '../types.js';

function createDummyShopeeProduct(title: string, priceMin = 25990000): ShopeeProduct {
  return {
    itemId: '10001',
    shopId: '20001',
    title,
    priceMin,
    priceMax: priceMin,
    priceBeforeDiscount: Math.round(priceMin * 1.1),
    currency: 'VND',
    stock: 20,
    historicalSold: 150,
    ratingStar: 4.9,
    ratingCount: 85,
    images: ['https://rate.vn/img/placeholder.png'],
    models: [{ modelId: 'm-1', name: 'Titan Tự Nhiên', price: priceMin, stock: 10 }],
    attributes: [],
    shop: {
      shopId: '20001',
      name: 'Official Flagship Store',
      isMall: true,
      ratingStar: 4.95,
      followerCount: 150000,
      location: 'TP. Hồ Chí Minh',
    },
    reviews: [],
    url: 'https://shopee.vn/product/20001/10001',
  };
}

async function runSuite() {
  console.log('🧪 Running @repo/crawlers Open-Core Multi-Category Normalizer Suite...');
  const normalizer = new ProductNormalizer();

  // 1. Canonical 5-Category Detection
  assert.equal(
    detectCategorySlug('Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng'),
    'smartphones'
  );
  assert.equal(detectCategorySlug('Máy tính bảng Apple iPad Pro M4 11 inch WiFi 256GB'), 'tablets');
  assert.equal(detectCategorySlug('Laptop Apple MacBook Air M3 13 inch 16GB RAM 512GB'), 'laptops');
  assert.equal(
    detectCategorySlug('Đồng hồ thông minh Apple Watch Ultra 2 49mm GPS + Cellular'),
    'smartwatches'
  );
  assert.equal(
    detectCategorySlug('Tai nghe Bluetooth Apple AirPods Pro 2 MagSafe USB-C'),
    'earbuds'
  );
  assert.equal(detectCategorySlug('Tai nghe chống ồn Sony WF-1000XM5 Chính hãng'), 'earbuds');
  console.log('  ✅ [1/5] 5-Category Canonical Detection passed');

  // 2. RAM/ROM Disambiguation & Ambiguity Safety
  const s24 = normalizer.normalize(
    createDummyShopeeProduct('Điện thoại Samsung Galaxy S24 Ultra 12GB RAM 512GB')
  );
  assert.equal(s24.category_slug, 'smartphones');
  assert.equal(s24.brand, 'Samsung');
  assert.equal(s24.storage_gb, 512);
  assert.equal(s24.ram_gb, 12);
  assert.equal(s24.model_key, 'samsung:galaxy-s24-ultra:512gb');
  assert.equal(s24.needs_review, false);
  assert.equal(s24.is_benchmark_enriched, true);

  const a55ExplicitRom = normalizer.normalize(
    createDummyShopeeProduct('Samsung Galaxy A55 ROM 256GB RAM 8GB Chính hãng')
  );
  assert.equal(a55ExplicitRom.storage_gb, 256);
  assert.equal(a55ExplicitRom.model_key, 'samsung:galaxy-a55:256gb');
  assert.equal(a55ExplicitRom.needs_review, false);

  const ambiguous = normalizer.normalize(
    createDummyShopeeProduct('Điện thoại Samsung Galaxy S24 Ultra 256GB / 512GB')
  );
  assert.equal(ambiguous.storage_gb, null);
  assert.equal(ambiguous.model_key, 'samsung:galaxy-s24-ultra:unknown');
  assert.equal(ambiguous.needs_review, true);

  // Laptop spec lists separate RAM and storage with commas (DOS/Rate#588).
  const zenbookSpecList = normalizer.normalize(
    createDummyShopeeProduct(
      'Laptop Asus Zenbook S 14 UX5406SA - PV140WS (Ultra 7 258V, 32GB, 1TB, 2.8K OLED Touch, Win11)'
    )
  );
  assert.equal(zenbookSpecList.storage_gb, 1024);
  assert.equal(zenbookSpecList.model_key, 'asus:zenbook-s-14:1024gb');
  assert.equal(
    normalizer.normalize(
      createDummyShopeeProduct('Asus Zenbook S 14 UX5406SA Ultra 7 258V 32GB 1TB')
    ).model_key,
    zenbookSpecList.model_key,
    'comma and space separated spec lists key the same'
  );
  assert.equal(
    normalizer.normalize(
      createDummyShopeeProduct('Điện thoại Samsung Galaxy S24 Ultra 256GB, 512GB')
    ).storage_gb,
    null,
    'two storage sizes separated by a comma stay ambiguous'
  );
  // Accepted trade-off: a small size before a large one reads as RAM + storage
  // whatever the separator, exactly as "32GB 64GB" already did.
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('Điện thoại Samsung Galaxy A15 4GB, 128GB'))
      .storage_gb,
    128
  );
  // Brand and model keys of the generic model fallback (DOS/Rate#761, #762).
  const keyOf = (title: string) => normalizer.normalize(createDummyShopeeProduct(title)).model_key;
  const brandOf = (title: string) => normalizer.normalize(createDummyShopeeProduct(title)).brand;
  // "Vivobook" / "Vivo Book" are Asus and Garmin's Vivo lines are Garmin; vivo phones stay vivo.
  assert.equal(
    keyOf('Laptop Asus Vivobook 14 X1407AA-LY360W (Ultra 5-325/ 16GB/ 512GB/ Windows 11 Home)'),
    'asus:vivobook-14-x1407aa-ly360w:512gb'
  );
  assert.equal(keyOf('ASUS Vivobook S 14 OLED S5406SA 512GB'), 'asus:vivobook-s-14:512gb');
  assert.equal(brandOf('Laptop ASUS Vivo Book 15 X1504 512GB'), 'Asus');
  assert.equal(brandOf('Laptop Vivo Book 15 X1504 512GB'), 'Asus');
  assert.equal(keyOf('Điện thoại vivo V40 5G 12GB/256GB'), 'vivo:v40:256gb');
  assert.equal(keyOf('Đồng hồ Vivoactive 5 GPS'), 'garmin:vivoactive-5:unknown');
  assert.equal(brandOf('Vòng đeo tay Vivosmart 5'), 'Garmin');
  // Every Garmin Vivo line is Garmin, and the "Vòng đeo tay" prefix is dropped (DOS/Rate#774).
  assert.equal(keyOf('Vòng đeo tay Vivosmart 5'), 'garmin:vivosmart-5:unknown');
  assert.equal(keyOf('Vòng đeo tay thông minh Garmin Vivosmart 5'), 'garmin:vivosmart-5:unknown');
  assert.equal(keyOf('Vòng đeo tay Vivofit 4'), 'garmin:vivofit-4:unknown');
  assert.equal(keyOf('Đồng hồ Vivosport'), 'garmin:vivosport:unknown');
  assert.equal(brandOf('Vivolife'), 'Garmin');
  // They are smartwatches, as smart bands are; "Vòng tay thông minh" is dropped too.
  const categoryOf = (title: string) =>
    normalizer.normalize(createDummyShopeeProduct(title)).category_slug;
  assert.equal(categoryOf('Vòng đeo tay Vivofit 4'), 'smartwatches');
  assert.equal(categoryOf('Đồng hồ Vivoactive 5 GPS'), 'smartwatches');
  assert.equal(categoryOf('Vòng tay thông minh Xiaomi Mi Band 8'), 'smartwatches');
  assert.equal(keyOf('Vòng tay thông minh Xiaomi Mi Band 8'), 'xiaomi:mi-band-8:unknown');
  assert.equal(categoryOf('Điện thoại vivo V40 5G 12GB/256GB'), 'smartphones');
  // "Vivo Book" with a space is a laptop like "Vivobook", "Laptop" in the title or not.
  assert.equal(categoryOf('ASUS Vivo Book 15 X1504 512GB'), 'laptops');
  assert.equal(categoryOf('ASUS Vivobook 15 X1504 512GB'), 'laptops');
  // "Vivo Book 15" keys like "Vivobook 15".
  assert.equal(keyOf('Laptop ASUS Vivo Book 15 X1504 512GB'), 'asus:vivobook-15-x1504:512gb');
  assert.equal(
    keyOf('Laptop ASUS Vivo Book 15 X1504 512GB'),
    keyOf('Laptop ASUS Vivobook 15 X1504 512GB')
  );
  // Xiaomi's "Mipad" and "Mi Pad" are no Apple iPad, and they are tablets (DOS/Rate#826).
  const mipad5 = 'Xiaomi Mipad 5 Pro 12.4 Tablet, 8G/256G Ram, Mi Pad 5 Pro 12.4 - Imported Goods';
  assert.equal(brandOf(mipad5), 'Xiaomi');
  assert.match(keyOf(mipad5), /^xiaomi:/);
  assert.equal(
    brandOf('Máy tính bảng Xiaomi Mi Pad 5 Mipad 5 Ram 6G /128Gb likenew Hàng Nhập khẩu'),
    'Xiaomi'
  );
  assert.equal(brandOf('Mipad 5 Pro 128GB'), 'Xiaomi');
  assert.equal(keyOf('Mi pad 6 8GB 256GB'), 'xiaomi:mi-pad-6:256gb');
  assert.equal(categoryOf('Mi pad 6 8GB 256GB'), 'tablets');
  assert.equal(categoryOf('Mipad 5 Pro 128GB'), 'tablets');
  // An iPad after a space or punctuation is still Apple; "Kami Pad" is no Xiaomi.
  assert.equal(keyOf('Apple iPad A16 11 inch 2025 Wifi 128GB'), 'apple:ipad-a16:128gb');
  assert.equal(brandOf('(iPad Air M4) 256GB'), 'Apple');
  assert.equal(brandOf('Ốp lưng cho iPad/Mipad 5'), 'Apple');
  assert.equal(brandOf('Kami Pad 5 128GB'), 'Khác');
  // A size written apart ends the model like one written together (DOS/Rate#815).
  assert.equal(
    keyOf('Samsung Galaxy S24 Ultra 256 GB Chính hãng'),
    keyOf('Samsung Galaxy S24 Ultra 256GB Chính hãng')
  );
  assert.equal(
    keyOf('Samsung Galaxy S24 Ultra 256 GB Chính hãng'),
    'samsung:galaxy-s24-ultra:256gb'
  );
  assert.equal(keyOf('Xiaomi 14 Ultra 1 TB'), 'xiaomi:14-ultra:1024gb');
  // Only the number right before the unit ends the model.
  assert.equal(keyOf('Xiaomi 14 Ultra 512 GB'), 'xiaomi:14-ultra:512gb');
  // "ProMax" written together is "Pro Max", for iPhones and the generic fallback.
  assert.equal(keyOf('iPhone 16 ProMax 256GB'), 'apple:iphone-16-pro-max:256gb');
  assert.equal(keyOf('iphone 16 promax 256gb'), 'apple:iphone-16-pro-max:256gb');
  assert.equal(keyOf('iPhone 16ProMax 256GB'), 'apple:iphone-16-pro-max:256gb');
  assert.equal(keyOf('iPhone 16Plus 128GB'), 'apple:iphone-16-plus:128gb');
  assert.equal(keyOf('iPhone 16e 128GB'), 'apple:iphone-16e:128gb');
  assert.equal(keyOf('Xiaomi 17 ProMax 512GB'), keyOf('Xiaomi 17 Pro Max 512GB'));
  // "Max" after "Pro" stays past the 4-token cap: the Pro Max is not the Pro.
  assert.equal(keyOf('Xiaomi Redmi Note 17 Pro Max 512GB'), 'xiaomi:redmi-note-17-pro-max:512gb');
  assert.equal(keyOf('Xiaomi Redmi Note 17 ProMax 512GB'), 'xiaomi:redmi-note-17-pro-max:512gb');
  assert.equal(keyOf('Xiaomi Redmi Note 17 Pro 512GB'), 'xiaomi:redmi-note-17-pro:512gb');
  // A tier word written apart from the model number, or behind a separator, stays part of
  // the model (DOS/Rate#1090). Labeled fixtures: title -> correct key.
  const tierWordSpellings: Array<[string, string]> = [
    ['Apple iPhone 15+ 128GB', 'apple:iphone-15-plus:128gb'],
    ['iPhone 15 + 128GB', 'apple:iphone-15-plus:128gb'],
    ['Samsung Galaxy S24 + 256GB', 'samsung:galaxy-s24-plus:256gb'],
    ['Samsung Galaxy S24 +', 'samsung:galaxy-s24-plus:unknown'],
    ['Samsung Galaxy Tab S 9 Ultra 256GB', 'samsung:galaxy-tab-s9-ultra:256gb'],
    ['Samsung Galaxy S 24 Ultra 512GB', 'samsung:galaxy-s24-ultra:512gb'],
    ['iPhone 15 - ProMax', 'apple:iphone-15-pro-max:unknown'],
    ['iPhone 15 (ProMax) 256GB', 'apple:iphone-15-pro-max:256gb'],
    ['iPhone 15 - Pro Max 256GB', 'apple:iphone-15-pro-max:256gb'],
    ['Samsung Galaxy S24 - Ultra 256GB', 'samsung:galaxy-s24-ultra:256gb'],
    ['Xiaomi Redmi Note 13 (Pro) 256GB', 'xiaomi:redmi-note-13-pro:256gb'],
    // Spellings that already keyed right keep their keys.
    ['Samsung Galaxy S24+ 256GB', 'samsung:galaxy-s24-plus:256gb'],
    ['Samsung Galaxy S24 Plus 256GB', 'samsung:galaxy-s24-plus:256gb'],
    ['iPhone 15 ProMax 256GB', 'apple:iphone-15-pro-max:256gb'],
    ['iPhone 15 Plus 128GB', 'apple:iphone-15-plus:128gb'],
    ['Samsung Galaxy Tab S9 Ultra 256GB', 'samsung:galaxy-tab-s9-ultra:256gb'],
    ['Samsung Galaxy S24 256GB', 'samsung:galaxy-s24:256gb'],
    ['iPhone 15 128GB', 'apple:iphone-15:128gb'],
    // A "+" before a gift or a word is not a Plus model (DOS/Rate#597).
    ['Samsung Galaxy A55 + Tặng ốp', 'samsung:galaxy-a55-tang:unknown'],
    ['iPhone 15 128GB + Ốp lưng', 'apple:iphone-15:128gb'],
    ['iPhone 15 + Tặng sạc', 'apple:iphone-15:unknown'],
    ['Combo iPhone 15 + AirPods', 'apple:iphone-15:unknown'],
    ['Combo iPhone 15+AirPods', 'apple:iphone-15:unknown'],
    ['Samsung Galaxy Tab S9 - Ultra 2-in-1 case 256GB', 'samsung:galaxy-tab-s9:256gb'],
    ['iPhone 15 - Pro Max 8/256GB', 'apple:iphone-15-pro-max:256gb'],
    ['iPhone 15 + Ốp lưng 128GB', 'apple:iphone-15:128gb'],
    // A network after the "+" still ends the name; so does a "+" after "Pro".
    ['Samsung Galaxy S24 + 5G', 'samsung:galaxy-s24-plus:unknown'],
    ['Xiaomi Redmi Note 13 Pro + 5G 256GB', 'xiaomi:redmi-note-13-pro-plus:256gb'],
    ['Samsung Galaxy S24 + 5G 256GB', 'samsung:galaxy-s24-plus:256gb'],
    ['Samsung Galaxy S24 +256GB', 'samsung:galaxy-s24-plus:256gb'],
    ['Samsung Galaxy S24 (Ultra)256GB', 'samsung:galaxy-s24-ultra:256gb'],
    // A tier word that starts an accessory or gift phrase is not the model's.
    ['iPhone 15 + Free case 128GB', 'apple:iphone-15:128gb'],
    ['Samsung Galaxy S24 + (Free case) 256GB', 'samsung:galaxy-s24:256gb'],
    ['Samsung Galaxy Tab S9 - Ultra slim case 256GB', 'samsung:galaxy-tab-s9:256gb'],
  ];
  for (const [title, expectedKey] of tierWordSpellings) {
    assert.equal(keyOf(title), expectedKey, title);
  }
  // A RAM/ROM pair written "8 + 256GB" is not a Plus model.
  assert.doesNotMatch(keyOf('Samsung Galaxy A55 8 + 256GB'), /plus/);
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('Apple iPhone 15+ 128GB')).model,
    'iPhone 15 Plus'
  );
  // Sony's WF/WH-1000XM line with or without the hyphen.
  assert.equal(keyOf('Tai nghe TWS Sony WF1000XM5'), keyOf('Tai nghe TWS Sony WF-1000XM5'));
  assert.equal(keyOf('Tai nghe TWS Sony WF1000XM5'), 'sony:wf-1000xm5:unknown');
  assert.equal(keyOf('Sony WH1000XM6 Bluetooth'), 'sony:wh-1000xm6:unknown');
  assert.equal(brandOf('Tai nghe WF1000XM5'), 'Sony');
  assert.equal(categoryOf('Sony WF1000XM5'), 'earbuds');
  // Without the hyphen it needs the "XM": other "Wh1000" strings are not Sony.
  assert.equal(brandOf('Laptop Lenovo ThinkPad 50Wh1000 16 GB'), 'Lenovo');
  assert.equal(brandOf('Huawei FreeBuds WH1000'), 'Huawei');
  // Apple lines no pattern knew are not iPhones (DOS/Rate#817).
  assert.equal(
    keyOf('iPad A16 Wifi 128GB 2025 | Chính hãng Apple Việt Nam'),
    'apple:ipad-a16:128gb'
  );
  assert.equal(keyOf('Apple iPad (A16) Wi-Fi 128GB'), 'apple:ipad-a16:128gb');
  assert.equal(keyOf('Apple iPad Gen 10 64GB'), keyOf('Apple iPad 10 64GB'));
  assert.equal(
    keyOf('MacBook Neo 13 inch A18 Pro 2026 6CPU 5GPU 8GB 256GB'),
    'apple:macbook-neo:256gb'
  );
  assert.equal(categoryOf('MacBook Neo 13 inch A18 Pro 2026 6CPU 5GPU 8GB 256GB'), 'laptops');
  assert.equal(keyOf('iPhone Air 256GB'), 'apple:iphone-air:256gb');
  assert.equal(keyOf('iPhone Duo 512GB'), 'apple:iphone-duo:512gb');
  // An A16 or later chip after the screen size or generation names the base iPad; an
  // earlier chip leaves the generation.
  assert.equal(keyOf('Apple iPad 11 inch (A16) 128GB'), 'apple:ipad-a16:128gb');
  assert.equal(keyOf('iPad 11 (A16) WiFi 128GB - Hàng Chính Hãng'), 'apple:ipad-a16:128gb');
  assert.equal(keyOf('Apple iPad Gen 11 A16 128GB'), 'apple:ipad-a16:128gb');
  assert.equal(keyOf('iPad 11-inch (A16) 128GB'), 'apple:ipad-a16:128gb');
  assert.equal(keyOf('iPad Gen 10 (A14 Bionic) 64GB'), keyOf('Apple iPad 10 64GB'));
  assert.equal(keyOf('Apple iPad 10.9 inch (A14) 64GB'), keyOf('Apple iPad 10 64GB'));
  assert.equal(keyOf('MacBook Neoprene Sleeve 13 inch'), 'apple:macbook:unknown');
  // Apple keys still merged or split wrongly (DOS/Rate#819). Labeled fixtures: title -> key.
  const appleKeys819: Array<[string, string]> = [
    // iPad Air generations without a chip are separate models; the 6th and 7th are the
    // M2 and M3 Airs, keyed like the titles that name the chip.
    ['iPad Air 4 64GB', 'apple:ipad-air-4:64gb'],
    ['iPad Air 5 64GB', 'apple:ipad-air-5:64gb'],
    ['Apple iPad Air (5th generation) Wi-Fi 64GB', 'apple:ipad-air-5:64gb'],
    ['Apple iPad Air 6 128GB', 'apple:ipad-air-m2:128gb'],
    ['iPad Air 11 inch M2 128GB', 'apple:ipad-air-m2-11:128gb'],
    ['iPad Air 13 M3 256GB', 'apple:ipad-air-m3-13:256gb'],
    ['iPad Air 128GB', 'apple:ipad-air:128gb'],
    ['iPad Air 5 M1 64GB', 'apple:ipad-air-m1:64gb'],
    ['iPad Air M1 64GB', 'apple:ipad-air-m1:64gb'],
    ['iPad 10 64GB - Tặng bao da dùng chung iPad A16', 'apple:ipad-10:64gb'],
    ['Tai nghe Sony WH-1000XM5 cho Mac mini M4', 'sony:wh-1000xm5:unknown'],
    ['Mac mini 2018 256GB', 'apple:mac-mini-2018:256gb'],
    ['iPad Air 4G 64GB', 'apple:ipad-air:64gb'],
    // An A16 or later chip anywhere after the size or generation names the base iPad, and
    // the 11th generation is the iPad (A16).
    ['iPad 11 2025 A16 128GB', 'apple:ipad-a16:128gb'],
    ['iPad 11 inch Wifi A16 128GB', 'apple:ipad-a16:128gb'],
    ['iPad Gen 11 128GB', 'apple:ipad-a16:128gb'],
    ['iPad (11th generation) 128GB', 'apple:ipad-a16:128gb'],
    ['Apple iPad 10 64GB', 'apple:ipad-10:64gb'],
    // Only the first A-chip counts, and not past another iPad or a comparison.
    ['iPad 10 64GB so sánh với iPad A16', 'apple:ipad-10:64gb'],
    ['iPad 9 64GB chip A13 - A16 sắp về', 'apple:ipad-9:64gb'],
    // "iPad 11 Pro" is the 11-inch Pro, not the 11th generation.
    ['iPad 11 Pro M4 256GB', 'apple:ipad-pro-m4-11:256gb'],
    // Apple lines with no pattern of their own are not iPhones.
    ['Apple TV 4K (3rd generation) 128GB', 'apple:tv-4k-3:128gb'],
    ['Apple Vision Pro 256GB', 'apple:vision-pro:256gb'],
    ['Mac mini M4 256GB', 'apple:mac-mini-m4:256gb'],
    ['Apple iMac M4 24 inch 256GB', 'apple:imac-m4:256gb'],
    ['Mac Studio M4 Max 512GB', 'apple:mac-studio-m4-max:512gb'],
    ['Loa Apple HomePod mini', 'apple:homepod-mini:unknown'],
    // A generation or year after the line keeps generations apart.
    ['Apple HomePod 2', 'apple:homepod-2:unknown'],
    ['Apple HomePod (2nd generation)', 'apple:homepod-2:unknown'],
    ['Apple TV 4K 2022 128GB', 'apple:tv-4k-3:128gb'],
    ['Apple TV 4K (2022) 128GB', 'apple:tv-4k-3:128gb'],
    ['Vision Pro 256GB', 'apple:vision-pro:256gb'],
    // A chip named for a bundled accessory is not the Air's.
    ['iPad Air 5 64GB + ốp lưng cho iPad Pro M4', 'apple:ipad-air-5:64gb'],
    // Another brand, or a title that only names what it fits, is not an Apple desktop.
    ['Ốp Samsung Galaxy S24 imac', 'samsung:op-samsung-galaxy-s24:unknown'],
    // An accessory naming its own family before "cho" keeps the model it fits.
    ['Ốp lưng iPhone cho iPhone 15 Pro Max', 'apple:iphone-15-pro-max:unknown'],
    ['Bao da iPad cho iPad Air 5', 'apple:ipad-air-5:unknown'],
    // An iPhone named only as what an accessory fits is not the product.
    ['Tai nghe AirPods Pro 2 cho iPhone Air', 'apple:airpods-pro-2:unknown'],
    ['Tai nghe AirPods Pro 2 cho iPhone 17', 'apple:airpods-pro-2:unknown'],
    ['iPhone 17 256GB', 'apple:iphone-17:256gb'],
    // A case size is no Watch Ultra generation.
    ['Apple Watch Ultra 49mm', 'apple:watch-ultra:unknown'],
    ['Apple Watch Ultra 49mm Titan', 'apple:watch-ultra:unknown'],
    ['Apple Watch Ultra', 'apple:watch-ultra:unknown'],
    ['Apple Watch Ultra 2 49mm', 'apple:watch-ultra-2:64gb'],
    ['Apple Watch Ultra 3 49mm', 'apple:watch-ultra-3:64gb'],
    // The 2020 and 2022 iPhone SE are the 2nd and 3rd generation.
    ['iPhone SE (2022) 64GB', 'apple:iphone-se-3:64gb'],
    ['iPhone SE 2022 64GB', 'apple:iphone-se-3:64gb'],
    ['iPhone SE 3 64GB', 'apple:iphone-se-3:64gb'],
    ['iPhone SE (3rd generation) 64GB', 'apple:iphone-se-3:64gb'],
    ['iPhone SE 2020 64GB', 'apple:iphone-se-2:64gb'],
    ['iPhone SE 2 64GB', 'apple:iphone-se-2:64gb'],
  ];
  for (const [title, expectedKey] of appleKeys819) {
    assert.equal(keyOf(title), expectedKey, title);
  }
  // An Apple line sold in more than one size keys each size apart (DOS/Rate#1113).
  // Labeled fixtures: title -> key.
  const appleSizeKeys1113: Array<[string, string]> = [
    // The names of the published masters key to their stored keys.
    ['Apple iPad Pro M5 11 inch 256GB', 'apple:ipad-pro-m5-11:256gb'],
    ['Apple MacBook Pro M4 Pro 14 inch 512GB', 'apple:macbook-pro-m4-pro-14:512gb'],
    ['Apple Watch Series 11 46mm GPS 64GB', 'apple:watch-series-11-46mm:64gb'],
    // The other size is another product.
    ['iPad Pro M4 13 inch 512GB', 'apple:ipad-pro-m4-13:512gb'],
    ['iPad Pro 13" M5 1TB', 'apple:ipad-pro-m5-13:1024gb'],
    ['iPad Pro 11 2024 M4 256GB', 'apple:ipad-pro-m4-11:256gb'],
    ['iPad Pro 12.9 inch M2 128GB', 'apple:ipad-pro-m2-129:128gb'],
    ['iPad Pro 12,9 M2 128GB', 'apple:ipad-pro-m2-129:128gb'],
    ['MacBook Air 15 M3 16GB 512GB', 'apple:macbook-air-m3-15:512gb'],
    ['MacBook Air M2 8GB/256GB 13.6 inch', 'apple:macbook-air-m2-13:256gb'],
    ['MacBook Pro M4 Max 16 inch 48GB 1TB', keyOf('MacBook Pro M4 Max 16" 48GB 1TB')],
    ['Apple Watch Series 10 42mm GPS 64GB', 'apple:watch-series-10-42mm:64gb'],
    ['Apple Watch Series 11 GPS + Cellular 42mm', 'apple:watch-series-11-42mm:64gb'],
    // A RAM size, a RAM/ROM pair or a core count is not a screen size, and a size with
    // "inch" wins over a bare number.
    ['MacBook Air M3 16GB 256GB', 'apple:macbook-air-m3:256gb'],
    ['MacBook Air M4 16/256', 'apple:macbook-air-m4:unknown'],
    ['MacBook Pro M4 16-core GPU 14 inch 512GB', 'apple:macbook-pro-m4-14:512gb'],
    ['iPad Pro M4 11-core 256GB', 'apple:ipad-pro-m4:256gb'],
    ['MacBook Pro M4 Max 16 nhân CPU 40 nhân GPU 48GB 1TB', keyOf('MacBook Pro M4 Max 48GB 1TB')],
    ['MacBook Pro M3 Pro 18GB 512GB - 14 lõi GPU', 'apple:macbook-pro-m3-pro:512gb'],
    ['MacBook Air M3 16G 512G', keyOf('MacBook Air M3 512G')],
    ['MacBook Air M3 RAM 16 SSD 512GB', keyOf('MacBook Air M3 RAM SSD 512GB')],
    // An Air comes in 13 and 15 inch; an OS version or a part code is no size.
    ['MacBook Air M2 8GB 256GB macOS 14 Sonoma', 'apple:macbook-air-m2:256gb'],
    ['MacBook Air M2 Z15S 8GB 256GB', 'apple:macbook-air-m2:256gb'],
    ['MacBook Air M3 256GB macOS 14', 'apple:macbook-air-m3:256gb'],
    ['HN Macbook Air M4 16 256 macbook', keyOf('Macbook Air M4 256')],
    [
      'MacBook Pro M4 Pro CPU 14 nhân GPU 20 nhân RAM 24GB SSD 512GB',
      'apple:macbook-pro-m4-pro:512gb',
    ],
    ['iPad Pro M4 13.0 inch 256GB', 'apple:ipad-pro-m4-13:256gb'],
    // A bundled accessory's size is not the product's; "GPS + Cellular" is the watch.
    ['iPad Pro M4 256GB + bàn phím 11 inch', 'apple:ipad-pro-m4:256gb'],
    ['iPad Pro 11 inch M4 + Magic Keyboard 256GB', 'apple:ipad-pro-m4-11:256gb'],
    ['MacBook Pro M4 Pro 16″ 24GB 512GB', 'apple:macbook-pro-m4-pro-16:512gb'],
    // A title without its size keeps the size-less key and goes to Tier 2.
    ['Máy tính bảng Apple iPad Pro M4 256GB WiFi', 'apple:ipad-pro-m4:256gb'],
    ['Apple Watch Series 11 64GB', 'apple:watch-series-11:64gb'],
    // One-size lines never carry a size.
    ['Apple Watch Ultra 3 49mm 64GB', 'apple:watch-ultra-3:64gb'],
    ['Apple Watch Ultra 2 49mm 64GB', 'apple:watch-ultra-2:64gb'],
    ['iPad Air 5 10.9 inch 64GB', 'apple:ipad-air-5:64gb'],
    ['iPad mini 7 8.3 inch 128GB', 'apple:ipad-mini-7:128gb'],
    ['MacBook Neo 13 inch 256GB', 'apple:macbook-neo:256gb'],
    // A size after "cho" belongs to the product the accessory fits.
    ['Ốp lưng iPad Pro M4 13 inch cho iPad Pro 11', 'apple:ipad-pro-m4-13:unknown'],
  ];
  for (const [title, expectedKey] of appleSizeKeys1113) {
    assert.equal(keyOf(title), expectedKey, title);
  }
  // DOS/Rate#1124: retailers name the case size before the band, so a size after
  // "dây"/"band"/"strap" is the band's and never keys the watch.
  const watchBandSizeKeys1124: Array<[string, string]> = [
    // Retailer titles: case size first, then the band.
    [
      'Apple Watch Series 11 - GPS, 46mm - Viền Nhôm Dây Cao Su S/M',
      'apple:watch-series-11-46mm:64gb',
    ],
    ['Apple Watch Series 11 GPS 46mm viền nhôm dây thể thao', 'apple:watch-series-11-46mm:64gb'],
    ['Apple Watch Series 10 42mm (GPS) Viền Nhôm - Dây Vải', 'apple:watch-series-10-42mm:unknown'],
    ['Apple Watch Series 11 42mm viền thép dây Link Bracelet', 'apple:watch-series-11-42mm:64gb'],
    // A band size alone leaves the size-less key (Tier 2), never the band's size.
    ['Apple Watch Series 10 dây Sport Band 45mm cho mặt 42mm', 'apple:watch-series-10:unknown'],
    ['Apple Watch Series 10 Sport Band 45mm', 'apple:watch-series-10:unknown'],
    ['Apple Watch SE 3 GPS Strap 44mm', 'apple:watch-se-3:unknown'],
    ['Apple Watch Series 10 Sport Loop 46mm', 'apple:watch-series-10:unknown'],
    // The band phrase ends at ")", ",", "|" or " - ": a case size after it still counts.
    ['Apple Watch Series 11 GPS (Viền nhôm, dây cao su) 46mm', 'apple:watch-series-11-46mm:64gb'],
    ['Apple Watch Series 10 dây Sport Band 45mm, mặt 42mm', 'apple:watch-series-10-42mm:unknown'],
    ['Apple Watch Series 10 Dây Vải - 46mm GPS', 'apple:watch-series-10-46mm:unknown'],
    // A decomposed or upper-case "dây" is the same word; "Bandit" is no band.
    ['Apple Watch Series 10 da\u0302y vải 45mm', 'apple:watch-series-10:unknown'],
    ['APPLE WATCH SERIES 10 DÂY VẢI 45MM', 'apple:watch-series-10:unknown'],
    ['Apple Watch Series 10 Bandit 46mm', 'apple:watch-series-10-46mm:unknown'],
  ];
  for (const [title, expectedKey] of watchBandSizeKeys1124) {
    assert.equal(keyOf(title), expectedKey, title);
  }
  // The registry has one entry per line: a sized title keeps the line's benchmark, but
  // the entry's screen and battery describe only the size it was written for.
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('Apple Watch Series 11 GPS 42mm'))
      .is_benchmark_enriched,
    true
  );
  const ipadPro13 = normalizer.normalize(
    createDummyShopeeProduct('iPad Pro M4 13 inch WiFi 256GB')
  );
  assert.equal(ipadPro13.screen_size_inch, 13);
  assert.equal(ipadPro13.battery_mah, null);
  const ipadPro11 = normalizer.normalize(createDummyShopeeProduct('iPad Pro M4 11 inch 256GB'));
  assert.equal(ipadPro11.screen_size_inch, 11);
  assert.equal(ipadPro11.battery_mah, 8160);
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('MacBook Air M3 15 inch 256GB')).screen_size_inch,
    15
  );
  // iPad mini 6 and 7 are two models (DOS/Rate#819): "(A17 Pro)" is the 7th, "8.3 inch" is
  // its screen, and a size or a year after "mini" is no generation.
  assert.equal(keyOf('Apple iPad mini 6 Wi-Fi 64GB'), 'apple:ipad-mini-6:64gb');
  assert.equal(keyOf('Apple iPad mini 7 64GB'), 'apple:ipad-mini-7:64gb');
  assert.equal(keyOf('Apple iPad mini 8.3 inch (A17 Pro) Wi-Fi 128GB'), 'apple:ipad-mini-7:128gb');
  assert.equal(keyOf('Apple iPad mini 6, Wi-Fi 64GB'), 'apple:ipad-mini-6:64gb');
  assert.equal(keyOf('Apple iPad mini 8,3 inch Wi-Fi 64GB'), 'apple:ipad-mini:64gb');
  assert.equal(keyOf('iPad mini 7 (A17 Pro) Wifi 128GB'), 'apple:ipad-mini-7:128gb');
  assert.equal(keyOf('iPad mini (6th generation) 64GB'), 'apple:ipad-mini-6:64gb');
  assert.equal(keyOf('iPad mini 64GB'), 'apple:ipad-mini:64gb');
  assert.equal(keyOf('iPad mini 2024 128GB'), 'apple:ipad-mini:128gb');
  // A "5G" or "4G" network or a storage after "mini" is no generation: "mini 5G" is not the
  // 2019 iPad mini 5, and "mini 64 Wifi" is no "mini 64".
  assert.equal(keyOf('Apple iPad mini 5G 64GB'), 'apple:ipad-mini:64gb');
  assert.equal(keyOf('Apple iPad mini 4G 64GB'), 'apple:ipad-mini:64gb');
  assert.equal(keyOf('Apple iPad mini 64 Wifi'), 'apple:ipad-mini:unknown');
  assert.equal(keyOf('Apple iPad mini 64/256GB'), 'apple:ipad-mini:256gb');
  assert.equal(keyOf('Apple iPad mini 6 5G 64GB'), 'apple:ipad-mini-6:64gb');
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('iPad Mini 7 Wifi 128GB')).model,
    'iPad mini 7'
  );
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('MACBOOK NEO 13 INCH 256GB')).model,
    'MacBook Neo'
  );
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('iPhone Air 256GB')).model,
    'iPhone Air'
  );
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('iPhone Duo 512GB')).model,
    'iPhone Duo'
  );
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('iPad (a16) 128GB')).model,
    'iPad A16'
  );
  // "(2nd generation)" is the generation number, one or two digits, any ordinal.
  assert.equal(keyOf('Apple Watch Ultra (2nd generation) 49mm'), keyOf('Apple Watch Ultra 2 49mm'));
  assert.equal(keyOf('AirPods Pro (2nd generation)'), keyOf('AirPods Pro 2'));
  assert.equal(keyOf('AirPods Pro (2nd gen) USB-C'), keyOf('AirPods Pro 2 USB-C'));
  assert.equal(keyOf('AirPods (3rd generation)'), keyOf('AirPods 3'));
  assert.equal(keyOf('iPhone SE (3rd generation) 64GB'), keyOf('iPhone SE 3 64GB'));
  assert.equal(keyOf('iPad (10th generation) 64GB'), keyOf('Apple iPad 10 64GB'));
  assert.equal(
    keyOf('Apple Watch Series (10th generation) 46mm'),
    keyOf('Apple Watch Series 10 46mm')
  );
  // The persisted name keeps one space, and "Series" alone is not the SE.
  const ultra2 = normalizer.normalize(
    createDummyShopeeProduct('Apple Watch Ultra (2nd generation) 49mm')
  );
  assert.equal(ultra2.model, 'Watch Ultra 2');
  assert.ok(!/\s{2}/.test(ultra2.name), ultra2.name);
  assert.equal(keyOf('Apple Watch Series'), 'apple:watch:unknown');
  // A case size or storage after "SE" is not its generation: one SE, not "SE 40"; an
  // ordinal one is ("SE 2nd Gen"). The case size keys apart (DOS/Rate#1113).
  assert.equal(keyOf('Apple Watch SE 40mm'), 'apple:watch-se-40mm:unknown');
  assert.equal(keyOf('Apple Watch SE 44mm GPS'), 'apple:watch-se-44mm:unknown');
  assert.equal(keyOf('Apple Watch SE 44 mm GPS'), 'apple:watch-se-44mm:unknown');
  assert.equal(keyOf('Apple Watch SE 2nd Gen GPS 44mm'), 'apple:watch-se-2-44mm:unknown');
  assert.equal(keyOf('Apple Watch SE 3rd Gen 44mm'), 'apple:watch-se-3-44mm:unknown');
  assert.equal(keyOf('Apple Watch SE 2022 40mm'), 'apple:watch-se-2022-40mm:unknown');
  assert.equal(keyOf('Apple Watch SE 32GB'), 'apple:watch-se:32gb');
  assert.equal(keyOf('Apple Watch SE2 40mm'), 'apple:watch-se2-40mm:unknown');
  // With no line matched, the family the title names first, else iPhone.
  assert.equal(keyOf('MacBook M4'), 'apple:macbook:unknown');
  assert.equal(keyOf('Apple "iPad" 256GB'), 'apple:ipad:256gb');
  assert.equal(keyOf('Đặt trước iPhone mới, ưu đãi MacBook'), 'apple:iphone:unknown');
  assert.equal(keyOf('Túi MacBook, iPhone mới'), 'apple:macbook:unknown');
  assert.equal(keyOf('Apple Watch Band 45mm'), 'apple:watch:unknown');
  assert.equal(keyOf('Apple AirPods Case'), 'apple:airpods:unknown');
  assert.equal(keyOf('Apple Swatch band'), 'apple:iphone:unknown');
  assert.equal(keyOf('Apple watchOS 11 hướng dẫn'), 'apple:iphone:unknown');
  // Long whitespace stays linear in the Apple patterns (CodeQL js/polynomial-redos).
  const appleRunStart = Date.now();
  const spaces = ' '.repeat(50_000);
  for (const title of [
    `Apple iPad${spaces}x`,
    `Apple iPad 11${spaces}x`,
    `Apple iPad 11 (${spaces}x`,
    `Apple Watch${spaces}(2nd generation)`,
    `Apple Watch SE${spaces}2`,
    `Apple iPad mini 7${spaces}inch`,
    `Apple Watch SE 2${spaces}mm`,
  ]) {
    keyOf(title);
  }
  assert.ok(Date.now() - appleRunStart < 1_000, 'a 50k-space Apple title must not hang');
  // "Omen" only as a word: Sennheiser "Momentum" is not HP.
  assert.equal(brandOf('Tai nghe Sennheiser Momentum 4 Wireless'), 'Sennheiser');
  assert.equal(brandOf('Laptop HP Omen 16 512GB'), 'HP');
  // A generation past the 4-token cap stays in the model, so generations key apart...
  assert.equal(
    keyOf(
      'Laptop Lenovo ThinkPad X1 Carbon Gen 13 - 21NS010BVN (Ultra 7-258V/ 32GB/ 512GB/ Win 11 Pro)'
    ),
    'lenovo:thinkpad-x1-carbon-gen-13:512gb'
  );
  assert.equal(
    keyOf('Lenovo ThinkPad X1 Carbon Gen 11 512GB'),
    'lenovo:thinkpad-x1-carbon-gen-11:512gb'
  );
  assert.equal(
    keyOf('Lenovo ThinkPad X1 Carbon Gen 12 512GB'),
    'lenovo:thinkpad-x1-carbon-gen-12:512gb'
  );
  assert.equal(keyOf('Lenovo IdeaPad Slim 5 Gen 9 512GB'), 'lenovo:ideapad-slim-5-gen-9:512gb');
  assert.equal(keyOf('Lenovo Legion 5 Gen 9 512GB'), 'lenovo:legion-5-gen-9:512gb');
  // ...unless a product code in the model already names it: both titles are one laptop.
  for (const [withGen, plain] of [
    [
      'Laptop Lenovo IdeaPad Slim 3 15IAH8 Gen 8 i5 16GB 512GB',
      'Laptop Lenovo IdeaPad Slim 3 15IAH8 512GB',
    ],
    ['Laptop Lenovo Yoga 7 2-in-1 14AHP9 Gen 9 512GB', 'Laptop Lenovo Yoga 7 2-in-1 14AHP9 512GB'],
  ]) {
    assert.equal(keyOf(withGen), keyOf(plain), withGen);
  }
  assert.equal(
    keyOf('Laptop Lenovo IdeaPad Slim 3 15IAH8 512GB'),
    'lenovo:ideapad-slim-3-15iah8:512gb'
  );
  // A code before the 4-token cap names it too, with no "-gen" left over.
  assert.equal(keyOf('Laptop Lenovo Legion 5 15IRX9 Gen 9 512GB'), 'lenovo:legion-5-15irx9:512gb');
  assert.equal(
    keyOf('Laptop Lenovo IdeaPad 5 15IAH8 Gen 8 512GB'),
    keyOf('Laptop Lenovo IdeaPad 5 15IAH8 512GB')
  );
  // "2-in-1" and short model names ("T14s") are no product codes: generations key apart.
  assert.notEqual(
    keyOf('Laptop Lenovo Yoga 9i 2-in-1 Gen 8 1TB'),
    keyOf('Laptop Lenovo Yoga 9i 2-in-1 Gen 9 1TB')
  );
  assert.equal(
    keyOf('Laptop Lenovo ThinkPad X1 2-in-1 Gen 10 1TB'),
    'lenovo:thinkpad-x1-2-in-1-gen-10:1024gb'
  );
  assert.notEqual(
    keyOf('Lenovo ThinkPad T14s Gen 4 512GB'),
    keyOf('Lenovo ThinkPad T14s Gen 5 512GB')
  );
  // A bare "Đồng hồ" prefix is dropped like "Đồng hồ thông minh", and a comma ends the model.
  assert.equal(
    keyOf('Đồng hồ Garmin Epix Gen 2, Back,Gray Carbon DLC Titanium'),
    'garmin:epix-gen-2:unknown'
  );
  assert.equal(keyOf('Đồng hồ Garmin Fenix 8 47mm'), 'garmin:fenix-8:unknown');
  assert.equal(keyOf('Đồng hồ thông minh Garmin Venu 3'), 'garmin:venu-3:unknown');
  assert.equal(
    keyOf('Đồng hồ đeo tay thông minh Samsung Galaxy Watch FE 2024'),
    'samsung:galaxy-watch-fe-2024:unknown'
  );
  assert.equal(keyOf('Đồng hồ Garmin Forerunner 265'), 'garmin:forerunner-265:8gb');
  assert.equal(
    keyOf('Điện thoại Samsung Galaxy S25 Ultra, Điện thoại AI, Tìm kiếm thông minh'),
    'samsung:galaxy-s25-ultra:unknown'
  );
  // A comma right after the brand is not the end of the model; "Plus," still counts.
  assert.equal(keyOf('Samsung, Galaxy S25 Ultra 256GB'), keyOf('Samsung Galaxy S25 Ultra 256GB'));
  assert.equal(keyOf('Samsung, Galaxy A55 5G 256GB'), 'samsung:galaxy-a55:256gb');
  assert.equal(
    keyOf('Xiaomi Redmi Note 14 Pro Plus, 12GB/256GB'),
    'xiaomi:redmi-note-14-pro-plus:256gb'
  );
  assert.equal(
    keyOf('Xiaomi Redmi Note 14 Pro Plus 5G 256GB'),
    'xiaomi:redmi-note-14-pro-plus:256gb'
  );
  // A semicolon ends the model like a comma, and "Plus;" still counts.
  assert.equal(
    keyOf('Xiaomi Redmi Note 14 Pro Plus; 12GB/256GB'),
    'xiaomi:redmi-note-14-pro-plus:256gb'
  );
  assert.equal(keyOf('Đồng hồ Garmin Epix Gen 2; Titanium'), 'garmin:epix-gen-2:unknown');
  console.log('  ✅ [2/5] RAM/ROM Disambiguation & Identity Safety passed');

  // 3. Multi-Category Benchmark Enrichment (Tablets, Laptops, Smartwatches, Earbuds)
  const ipad = normalizer.normalize(
    createDummyShopeeProduct('Máy tính bảng Apple iPad Pro M4 256GB WiFi')
  );
  assert.equal(ipad.category_slug, 'tablets');
  assert.equal(ipad.model_key, 'apple:ipad-pro-m4:256gb');
  assert.equal(ipad.is_benchmark_enriched, true);
  assert.equal(ipad.specifications.hardware?.chipset, 'Apple M4 (3 nm)');
  // Retail titles put the chip after the screen size; it must still reach the key, and
  // the screen size keys the 11 and 13 inch models apart (DOS/Rate#1113).
  for (const title of [
    'Máy tính bảng Apple iPad Pro 11 inch M4 Wi-Fi 256GB',
    'Apple iPad Pro 11 inch M4 WiFi 256GB - Chính hãng',
  ]) {
    const sized = normalizer.normalize(createDummyShopeeProduct(title));
    assert.equal(sized.model_key, 'apple:ipad-pro-m4-11:256gb', title);
    // The registry has one entry per line, so a sized title is still enriched.
    assert.equal(sized.is_benchmark_enriched, true, title);
  }
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('MacBook Air 13 inch M3 8GB 256GB')).model_key,
    'apple:macbook-air-m3-13:256gb'
  );
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('Tai nghe Apple AirPods Pro 2 USB-C MTJV3'))
      .model_key,
    normalizer.normalize(createDummyShopeeProduct('Apple AirPods Pro 2 USB-C')).model_key,
    'part numbers such as MTJV3 must not read as a chip'
  );

  const tabS10Ultra = normalizer.normalize(
    createDummyShopeeProduct('Máy tính bảng Samsung Galaxy Tab S10 Ultra 5G 12GB RAM 256GB')
  );
  assert.equal(tabS10Ultra.category_slug, 'tablets');
  assert.equal(tabS10Ultra.model_key, 'samsung:galaxy-tab-s10-ultra:256gb');
  assert.equal(tabS10Ultra.is_benchmark_enriched, true);

  const xiaomiPad = normalizer.normalize(
    createDummyShopeeProduct('Máy tính bảng Xiaomi Pad 6S Pro 12.4 8GB RAM 256GB')
  );
  assert.equal(xiaomiPad.category_slug, 'tablets');
  assert.equal(xiaomiPad.model_key, 'xiaomi:pad-6s-pro:256gb');
  assert.equal(xiaomiPad.is_benchmark_enriched, true);

  const macbook = normalizer.normalize(
    createDummyShopeeProduct('Laptop Apple MacBook Air M3 16GB RAM 512GB SSD')
  );
  assert.equal(macbook.category_slug, 'laptops');
  assert.equal(macbook.model_key, 'apple:macbook-air-m3:512gb');
  assert.equal(macbook.is_benchmark_enriched, true);
  assert.equal(macbook.specifications.hardware?.chipset, 'Apple M3 (3 nm)');

  const zenbook = normalizer.normalize(
    createDummyShopeeProduct('Laptop ASUS Zenbook S 14 OLED UX5406 32GB RAM 1TB SSD')
  );
  assert.equal(zenbook.category_slug, 'laptops');
  assert.equal(zenbook.model_key, 'asus:zenbook-s-14:1024gb');
  assert.equal(zenbook.is_benchmark_enriched, true);

  const thinkpad = normalizer.normalize(
    createDummyShopeeProduct('Laptop Lenovo ThinkPad X1 Carbon Gen 12 32GB RAM 512GB')
  );
  assert.equal(thinkpad.category_slug, 'laptops');
  assert.equal(thinkpad.model_key, 'lenovo:thinkpad-x1-carbon-gen-12:512gb');
  assert.equal(thinkpad.is_benchmark_enriched, true);

  const watchUltra = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Apple Watch Ultra 2 49mm')
  );
  assert.equal(watchUltra.category_slug, 'smartwatches');
  assert.equal(watchUltra.model_key, 'apple:watch-ultra-2:64gb');
  assert.equal(watchUltra.needs_review, false);
  assert.equal(watchUltra.is_benchmark_enriched, true);

  const galaxyWatchUltra = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Samsung Galaxy Watch Ultra 47mm LTE')
  );
  assert.equal(galaxyWatchUltra.category_slug, 'smartwatches');
  assert.equal(galaxyWatchUltra.model_key, 'samsung:galaxy-watch-ultra:32gb');
  assert.equal(galaxyWatchUltra.is_benchmark_enriched, true);

  const garminFr265 = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Garmin Forerunner 265 Music')
  );
  assert.equal(garminFr265.category_slug, 'smartwatches');
  assert.equal(garminFr265.model_key, 'garmin:forerunner-265:8gb');
  assert.equal(garminFr265.is_benchmark_enriched, true);

  // A storage-less title of a registry model sold in several storage sizes keys as
  // ':unknown', never at a guessed default size (DOS/Rate#1094). Labeled fixtures from
  // the Rate-Services audit run 40252379212.
  const storagelessRegistryTitles: Array<[string, string]> = [
    // A 16GB/512GB CellphoneS listing that used to key under the 1TB master.
    ['Laptop ASUS Zenbook S 14 UX5406AA-SU348W', 'asus:zenbook-s-14:unknown'],
    // "12GB" is RAM: the title names no storage.
    ['Samsung Galaxy S26 Ultra 5G 12GB', 'samsung:galaxy-s26-ultra:unknown'],
    ['Apple iPhone 18 Pro Max', 'apple:iphone-18-pro-max:unknown'],
    ['Apple iPhone 18 Pro', 'apple:iphone-18-pro:unknown'],
    ['Lenovo ThinkPad X1 Carbon Gen 12 Ultra 7 155U', 'lenovo:thinkpad-x1-carbon-gen-12:unknown'],
    ['Máy tính bảng iPad Pro M5 11 inch WiFi', 'apple:ipad-pro-m5-11:unknown'],
    ['Máy tính bảng Xiaomi Pad 7 Pro', 'xiaomi:pad-7-pro:unknown'],
  ];
  for (const [title, expectedKey] of storagelessRegistryTitles) {
    const storageless = normalizer.normalize(createDummyShopeeProduct(title));
    assert.equal(storageless.model_key, expectedKey, title);
    assert.equal(storageless.storage_gb, null, title);
    assert.equal(storageless.needs_review, true, title);
    assert.equal(storageless.is_benchmark_enriched, true, title);
    assert.equal(storageless.specifications.hardware?.storage_gb, undefined, title);
  }
  const storagelessZenbook = normalizer.normalize(
    createDummyShopeeProduct('Laptop ASUS Zenbook S 14 UX5406AA-SU348W')
  );
  assert.equal(storagelessZenbook.name, 'Asus Zenbook S 14');
  assert.equal(storagelessZenbook.slug, 'asus-zenbook-s-14');
  // A title that names its storage still keys at it.
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('Apple iPhone 18 Pro Max 512GB')).model_key,
    'apple:iphone-18-pro-max:512gb'
  );
  // A watch generation ships in one storage size, so its storage is known without the
  // title naming it (the single-storage watches above keep their keys).
  assert.equal(
    normalizer.normalize(createDummyShopeeProduct('Apple Watch Series 11 GPS 46mm')).model_key,
    'apple:watch-series-11-46mm:64gb'
  );

  const sonyBuds = normalizer.normalize(
    createDummyShopeeProduct('Tai nghe chống ồn Sony WF-1000XM5 Chính hãng')
  );
  assert.equal(sonyBuds.category_slug, 'earbuds');
  assert.equal(sonyBuds.brand, 'Sony');
  assert.equal(sonyBuds.model, 'WF-1000XM5');
  assert.equal(sonyBuds.needs_review, false);
  assert.equal(sonyBuds.is_benchmark_enriched, true);

  const galaxyBuds3Pro = normalizer.normalize(
    createDummyShopeeProduct('Tai nghe Bluetooth Samsung Galaxy Buds3 Pro Chính hãng')
  );
  assert.equal(galaxyBuds3Pro.category_slug, 'earbuds');
  assert.equal(galaxyBuds3Pro.model_key, 'samsung:galaxy-buds3-pro:unknown');
  assert.equal(galaxyBuds3Pro.is_benchmark_enriched, true);
  console.log('  ✅ [3/5] Multi-Category Benchmark Enrichment (5 Categories, 12 Flagships) passed');

  // 4. 10-Field-Groups Zod Schema Conformance
  for (const item of [
    s24,
    ipad,
    tabS10Ultra,
    xiaomiPad,
    macbook,
    zenbook,
    thinkpad,
    watchUltra,
    galaxyWatchUltra,
    garminFr265,
    sonyBuds,
    galaxyBuds3Pro,
  ]) {
    const parsed = ProductSpecificationsSchema.safeParse(item.specifications);
    assert.equal(parsed.success, true, `10-Group Zod validation failed for ${item.model_key}`);
  }
  console.log('  ✅ [4/5] 10-Field-Groups Zod Schema Conformance passed');

  // 5. Flagship Seed Dataset Multi-Category Coverage
  const countsByCat = new Map<string, number>();
  for (const dev of FLAGSHIP_DEVICES_TO_SEED) {
    countsByCat.set(dev.categorySlug, (countsByCat.get(dev.categorySlug) || 0) + 1);
    const parsed = ProductSpecificationsSchema.safeParse(dev.specifications);
    assert.equal(parsed.success, true, `Seed spec validation failed for ${dev.model_key}`);
  }
  for (const cat of ['smartphones', 'tablets', 'laptops', 'smartwatches', 'earbuds']) {
    assert.ok(
      (countsByCat.get(cat) || 0) >= 3,
      `Expected at least 3 flagship seed devices in category "${cat}", got ${countsByCat.get(cat) || 0}`
    );
  }
  console.log('  ✅ [5/6] Flagship Seed Dataset Multi-Brand Coverage (>=3 per Category) passed');

  // 6. Spec-only catalog: no fabricated listings, reviews, prices or expert scores
  for (const dev of FLAGSHIP_DEVICES_TO_SEED) {
    for (const field of [
      'listings',
      'expert_rating',
      'expert_review_summary',
      'expert_criteria_scores',
    ]) {
      assert.ok(
        !(field in dev),
        `Seed catalog entry ${dev.model_key} must not carry synthetic field "${field}"`
      );
    }
  }
  console.log('  ✅ [6/7] Spec-Only Catalog (no synthetic listings or expert scores) passed');

  // 7. ArenaSpecSyncer (GSMArena [data-spec] + PhoneArena Split Camera) & 14 2026 Multi-Category Flagships (36 Total Catalog)
  const {
    parseGsmArenaHtmlToSpecs,
    parseGsmArenaBrandCatalogHtml,
    parsePhoneArenaCatalogHtml,
    countPopulatedFieldGroups,
    UPSTREAM_2026_ARENA_REFERENCE_URLS,
  } = await import('../arena-spec-syncer.js');

  const sampleGsmHtml = `
    <h1 data-spec="modelname">Xiaomi 18 Pro Max</h1>
    <td data-spec="announced">2026, September 23</td>
    <td data-spec="status">Available. Released 2026, September</td>
    <td data-spec="dimensions">162.8 x 77.6 x 8.5 mm</td>
    <td data-spec="weight">228 g (8.04 oz)</td>
    <td data-spec="bodyother">IP69 dust tight and water resistant (high pressure water jets; immersible up to 2m for 30 min)</td>
    <td data-spec="displaytype">LTPO AMOLED, 68B colors, 120Hz, Dolby Vision, 3500 nits (peak)</td>
    <td data-spec="displaysize">6.9 inches, 114.5 cm2 (~91.2% screen-to-body ratio)</td>
    <td data-spec="displayresolution">1440 x 3200 pixels, 20:9 ratio (~510 ppi density)</td>
    <td data-spec="displayprotection">Xiaomi Dragon Crystal Glass 2</td>
    <td data-spec="os">Android 17, HyperOS 4</td>
    <td data-spec="chipset">Qualcomm Snapdragon 8 Elite Extreme Gen 6 (2 nm)</td>
    <td data-spec="cpu">Octa-core (2x4.75 GHz Oryon V3 + 6x3.80 GHz)</td>
    <td data-spec="gpu">Adreno 850</td>
    <td data-spec="internalmemory">256GB 12GB RAM, 512GB 16GB RAM, 1TB 16GB RAM</td>
    <td data-spec="memoryother">UFS 4.1</td>
    <td data-spec="cam1modules">200 MP, f/1.6, 23mm (wide), 1/1.28", OIS<br>50 MP, f/2.0, 14mm, 115˚ (ultrawide)<br>200 MP, f/2.5, 75mm (periscope telephoto), 3.2x optical zoom, OIS</td>
    <td data-spec="cam1video">8K@30fps, 4K@24/30/60/120fps, Dolby Vision HDR</td>
    <td data-spec="cam2modules">32 MP, f/2.0, 22mm (wide)</td>
    <td data-spec="batdescription1">Si/C Li-Ion 8500 mAh, non-removable</td>
    <td data-spec="batcharging">100W wired, PD3.0, 50W wireless, 27W reverse wireless</td>
    <td data-spec="wlan">Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band</td>
    <td data-spec="bluetooth">6.0, A2DP, LE, aptX HD, LHDC 5.0</td>
    <td data-spec="usb">USB Type-C 3.2 Gen 2, DisplayPort, OTG</td>
    <td data-spec="nfc">Yes</td>
    <td data-spec="gps">GPS (L1+L5), GLONASS, BDS, GALILEO</td>
    <td data-spec="sensors">Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass</td>
  `;
  const synced = parseGsmArenaHtmlToSpecs(sampleGsmHtml, {
    gsmarenaUrl: 'https://www.gsmarena.com/xiaomi_18_pro_max-14288.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Xiaomi-18-Pro-Max_id12894',
  });
  assert.equal(synced.brand, 'Xiaomi');
  assert.equal(synced.model, '18 Pro Max');
  assert.equal(synced.ramGb, 16);
  assert.equal(synced.storageGb, 1024);
  assert.equal(synced.screenSizeInch, 6.9);
  assert.equal(synced.batteryMah, 8500);
  assert.ok(synced.specifications.camera?.main_camera?.startsWith('200 MP'));
  assert.ok(synced.specifications.camera?.second_camera?.startsWith('50 MP'));
  assert.ok(synced.specifications.camera?.third_camera?.startsWith('200 MP'));
  assert.equal(synced.specifications.battery?.fast_charging_w, 100);
  assert.equal(synced.specifications.battery?.reverse_charging, true);
  assert.equal(
    countPopulatedFieldGroups(synced.specifications as unknown as Record<string, unknown>),
    10
  );

  const gsmBrandItems = parseGsmArenaBrandCatalogHtml(
    `<div class="makers"><ul><li><a href="xiaomi_18_pro_max-14288.php"><strong><span>18 Pro Max</span></strong></a></li></ul></div>`,
    'Xiaomi'
  );
  assert.equal(gsmBrandItems.length, 1);
  assert.equal(gsmBrandItems[0]?.name, 'Xiaomi 18 Pro Max');

  const paCatalogItems = parsePhoneArenaCatalogHtml(
    `<a href="/phones/Samsung-Galaxy-S26-Ultra_id12621">Samsung Galaxy S26 Ultra</a>`
  );
  assert.equal(paCatalogItems.length, 1);
  assert.equal(paCatalogItems[0]?.name, 'Samsung Galaxy S26 Ultra');

  // Ensure all 14 canonical 2026 upstream devices across 5 categories are present in FLAGSHIP_DEVICES_TO_SEED (33 seed entries -> 36 total master products)
  assert.equal(UPSTREAM_2026_ARENA_REFERENCE_URLS.length, 14);
  assert.equal(FLAGSHIP_DEVICES_TO_SEED.length, 33);
  const seededModelKeys = new Set(FLAGSHIP_DEVICES_TO_SEED.map(d => d.model_key));
  for (const ref of UPSTREAM_2026_ARENA_REFERENCE_URLS) {
    assert.ok(
      seededModelKeys.has(ref.model_key),
      `Missing 2026 flagship ${ref.model_key} (${ref.name}) in FLAGSHIP_DEVICES_TO_SEED`
    );
  }

  // Verify ProductNormalizer recognizes 2026 multi-category flagships
  const normPad7 = normalizer.normalize(
    createDummyShopeeProduct(
      'Máy tính bảng Xiaomi Pad 7 Pro (12GB/256GB) Màn hình 3.2K 144Hz Chính Hãng',
      12490000
    )
  );
  assert.equal(normPad7.model_key, 'xiaomi:pad-7-pro:256gb');
  assert.equal(normPad7.category_slug, 'tablets');
  assert.equal(normPad7.is_benchmark_enriched, true);

  console.log(
    '  ✅ [7/8] ArenaSpecSyncer (GSMArena/PhoneArena 10-Group Parser), 14 2026 Multi-Category Flagships & 36 Seeded Devices passed'
  );

  // 8. AiSpecEnricher Fail-Closed Validation & Provenance (K4, C8) (#164)
  const { AiSpecEnricher, sanitizeSpecifications } = await import('../ai-spec-enricher.js');
  const sanitizedValid = sanitizeSpecifications({
    display: { size_inch: '6.8 inches', refresh_rate_hz: '120Hz' },
    hardware: { ram_gb: '12GB', storage_gb: '256GB' },
  });
  assert.equal(sanitizedValid.display?.size_inch, 6.8);
  assert.equal(sanitizedValid.hardware?.ram_gb, 12);

  const enricher = new AiSpecEnricher({ apiKey: '' });
  const benchmarkCandidate = await enricher.enrichCandidate(s24);
  assert.equal(benchmarkCandidate.spec_source, 'benchmark_registry');
  console.log(
    '  ✅ [8/9] AiSpecEnricher Fail-Closed Validation, Provenance & Batch Retry Hardening (K4, C8) (#164) passed'
  );

  // 9. Data Contract Hardening: Numeric Bounds, MasterProduct Defaults & ScrapedProductSchema (Audit T15) (#171)
  const { MasterProductSchema, ScrapedProductSchema } = await import('@repo/shared-data');
  assert.equal(
    ProductSpecificationsSchema.safeParse({
      hardware: { ram_gb: -8 },
    }).success,
    false,
    'Negative ram_gb must fail ProductSpecificationsSchema'
  );
  assert.equal(
    ProductSpecificationsSchema.safeParse({
      battery: { capacity_mah: 9999999 },
    }).success,
    false,
    'Out-of-bounds capacity_mah must fail ProductSpecificationsSchema'
  );

  const defaultMaster = MasterProductSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    brand: 'Apple',
    model: 'iPhone 18 Pro Max',
    model_key: 'apple:iphone-18-pro-max:256gb',
    name: 'Apple iPhone 18 Pro Max 256GB',
    slug: 'apple-iphone-18-pro-max-256gb',
  });
  assert.equal(defaultMaster.status, 'draft', 'MasterProductSchema must default to draft');
  assert.equal(
    defaultMaster.user_rating_weighted,
    undefined,
    'MasterProductSchema must not fabricate 0 for user_rating_weighted when omitted'
  );

  const validScraped = ScrapedProductSchema.safeParse(
    createDummyShopeeProduct('Điện thoại Apple iPhone 16 Pro Max 256GB')
  );
  assert.equal(
    validScraped.success,
    true,
    'Valid ShopeeProduct fixture must pass ScrapedProductSchema'
  );
  const invalidScraped = ScrapedProductSchema.safeParse({
    ...createDummyShopeeProduct('Invalid Product'),
    priceMin: -100,
  });
  assert.equal(invalidScraped.success, false, 'Negative priceMin must fail ScrapedProductSchema');
  console.log(
    '  ✅ [9/10] Data Contract Hardening: Numeric Bounds, Draft/Null Defaults & ScrapedProductSchema (Audit T15) (#171) passed'
  );

  // 10. Deep-Merge 10-Field-Group Specifications, Defensive Cache Cloning & Bounded Memory Cache (#496)
  const { MAX_SPEC_CACHE_ENTRIES, cloneAiEnrichmentResponse, mergeProductSpecifications } =
    await import('../ai-spec-enricher.js');
  const { EntityMatcher } = await import('../entity-matcher.js');

  assert.equal(MAX_SPEC_CACHE_ENTRIES, 250);

  const deepMergedSpecs = mergeProductSpecifications(
    {
      hardware: {
        ram_gb: 16,
        storage_gb: 512,
        os: 'Android 15',
      },
      display: {
        size_inch: 6.8,
        refresh_rate_hz: 120,
      },
      regulatory: {
        certifications: 'CE, RoHS',
      },
    },
    {
      hardware: {
        chipset: 'Qualcomm Snapdragon 8 Elite (3 nm)',
        cpu: 'Octa-core',
        os: '   ', // Empty string must not clobber existing 'Android 15'
      },
      camera: {
        main_camera: '200 MP, f/1.7, OIS',
      },
    },
    ['Titan Đen', '  Titan Trắng  ']
  );

  assert.equal(
    deepMergedSpecs.hardware?.ram_gb,
    16,
    'mergeProductSpecifications must preserve base hardware.ram_gb when incoming omits it (#496)'
  );
  assert.equal(
    deepMergedSpecs.hardware?.chipset,
    'Qualcomm Snapdragon 8 Elite (3 nm)',
    'mergeProductSpecifications must merge incoming hardware.chipset (#496)'
  );
  assert.equal(
    deepMergedSpecs.hardware?.os,
    'Android 15',
    'mergeProductSpecifications must not overwrite base string with whitespace-only incoming string (#496)'
  );
  assert.equal(
    deepMergedSpecs.display?.size_inch,
    6.8,
    'mergeProductSpecifications must preserve untouched base field groups (#496)'
  );
  assert.equal(
    deepMergedSpecs.regulatory?.certifications,
    'CE, RoHS',
    'mergeProductSpecifications must preserve base regulatory group (#496)'
  );
  assert.deepEqual(
    deepMergedSpecs.design?.colors,
    ['Titan Đen', 'Titan Trắng'],
    'mergeProductSpecifications must populate design.colors even when design group was absent (#496)'
  );

  const originalAiRes = {
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.7,
    battery_mah: 5000,
    has_5g: true,
    specifications: {
      hardware: { chipset: 'Apple A18 Pro', ram_gb: 12 },
      design: { colors: ['Black'] },
    },
    key_specs: { chip: 'Apple A18 Pro', ram: '12GB' },
  };
  const clonedAiRes = cloneAiEnrichmentResponse(originalAiRes);
  clonedAiRes.specifications.hardware!.chipset = 'Mutated Chip';
  clonedAiRes.specifications.design!.colors!.push('Gold');
  clonedAiRes.key_specs.chip = 'Mutated';
  assert.equal(
    originalAiRes.specifications.hardware?.chipset,
    'Apple A18 Pro',
    'cloneAiEnrichmentResponse must isolate nested specification objects (#496)'
  );
  assert.deepEqual(
    originalAiRes.specifications.design?.colors,
    ['Black'],
    'cloneAiEnrichmentResponse must isolate nested arrays (#496)'
  );
  assert.equal(
    originalAiRes.key_specs.chip,
    'Apple A18 Pro',
    'cloneAiEnrichmentResponse must isolate key_specs (#496)'
  );

  // Verify enrichMasterProductById selects existing specifications and deep-merges them
  let capturedSelectCols = '';
  let capturedUpdatePayload: Record<string, unknown> | null = null;
  const mockEnrichClient = {
    from(table: string) {
      assert.equal(table, 'master_products');
      return {
        select(cols: string) {
          capturedSelectCols = cols;
          return {
            eq(_col: string, _val: string) {
              return {
                async maybeSingle() {
                  return {
                    data: {
                      id: 'master-496',
                      brand: 'ASUS',
                      model: 'Zenbook S 14',
                      storage_gb: 1024,
                      ram_gb: 32,
                      screen_size_inch: 14,
                      battery_mah: null,
                      has_5g: false,
                      name: 'Laptop ASUS Zenbook S 14 OLED',
                      description: 'Intel Core Ultra 7',
                      colors: ['Zumaia Gray'],
                      specifications: {
                        display: { size_inch: 14, refresh_rate_hz: 120 },
                      },
                      key_specs: { screen: '14" 3K OLED 120Hz' },
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          capturedUpdatePayload = payload;
          return {
            async eq(_col: string, _val: string) {
              return { data: null, error: null };
            },
          };
        },
      };
    },
  } as unknown as import('../types.js').RateSupabaseClient;

  const stubEnricher = new AiSpecEnricher({ apiKey: '' });
  let capturedCategorySlug: string | undefined;
  stubEnricher.fetchSpecsFromAi = async params => {
    capturedCategorySlug = params.categorySlug;
    return {
      ram_gb: 32,
      storage_gb: 1024,
      screen_size_inch: 14,
      battery_mah: 7200,
      has_5g: false,
      specifications: {
        hardware: { chipset: 'Intel Core Ultra 7 258V' },
      },
      key_specs: { chip: 'Core Ultra 7 258V', storage: '1TB' },
    };
  };

  const enrichMatcher = new EntityMatcher(mockEnrichClient, stubEnricher);
  const enrichedOk = await enrichMatcher.enrichMasterProductById('master-496');
  assert.equal(enrichedOk, true);
  assert.ok(
    capturedSelectCols.includes('specifications'),
    'enrichMasterProductById must select existing specifications from master_products (#496)'
  );
  assert.equal(
    capturedCategorySlug,
    'laptops',
    'enrichMasterProductById must pass inferred categorySlug to fetchSpecsFromAi (#496)'
  );
  const updatedSpecs = (
    capturedUpdatePayload as { specifications?: Record<string, unknown> } | null
  )?.specifications as {
    display?: { size_inch?: number; refresh_rate_hz?: number };
    hardware?: { chipset?: string };
    design?: { colors?: string[] };
  };
  assert.equal(updatedSpecs?.display?.refresh_rate_hz, 120);
  assert.equal(updatedSpecs?.hardware?.chipset, 'Intel Core Ultra 7 258V');
  assert.deepEqual(updatedSpecs?.design?.colors, ['Zumaia Gray']);
  console.log(
    '  ✅ [10/11] Deep-Merge 10-Field-Group Specifications, Defensive Cache Cloning & Bounded Memory Cache (#496) passed'
  );

  // =========================================================================
  // 11. Backfill KeySpecs Merge, Whitespace Field Group Audit & Arena PhoneArena Fallbacks (#503)
  // =========================================================================
  const { mergeKeySpecs, auditMasterSpecs } = await import('../jobs/backfill-specs.js');

  const mergedKeys = mergeKeySpecs(
    { screen: '6.9" LTPO OLED 120Hz', chip: 'Apple A18 Pro', camera: '48MP + 48MP + 12MP' },
    {
      screen: '6.9" Super Retina XDR 120Hz',
      chip: undefined,
      camera: '   ',
      battery: '4685mAh 45W',
    }
  );
  assert.deepEqual(mergedKeys, {
    screen: '6.9" Super Retina XDR 120Hz',
    chip: 'Apple A18 Pro',
    camera: '48MP + 48MP + 12MP',
    battery: '4685mAh 45W',
  });

  assert.equal(
    countPopulatedFieldGroups({
      display: { type: '   ' },
      design: { colors: ['   ', ''] },
      hardware: { chipset: 'Snapdragon 8 Elite' },
    }),
    1,
    'countPopulatedFieldGroups must ignore whitespace-only strings and empty-element arrays (#503)'
  );

  const phoneArenaFallbackSpec = parseGsmArenaHtmlToSpecs('<html></html>', {
    phonearenaHtml: `
      <table>
        <tr><th>Device name</th><td>Google Pixel 10 Pro XL</td></tr>
        <tr><th>Screen size</th><td>6.8"</td></tr>
        <tr><th>Refresh rate</th><td>120 Hz</td></tr>
        <tr><th>System chip</th><td>Google Tensor G5</td></tr>
        <tr><th>RAM</th><td>16 GB RAM</td></tr>
        <tr><th>Internal storage</th><td>256 GB</td></tr>
        <tr><th>Main camera</th><td>50 MP, f/1.7, OIS</td></tr>
        <tr><th>Ultra-wide camera</th><td>48 MP, f/1.9, 123-degree</td></tr>
        <tr><th>Capacity</th><td>5200 mAh</td></tr>
        <tr><th>Charging</th><td>45W USB-C PD 3.1, reverse wireless</td></tr>
        <tr><th>NFC</th><td>No</td></tr>
        <tr><th>Colors</th><td>Obsidian, Porcelain, Hazel</td></tr>
      </table>
    `,
  });
  assert.equal(phoneArenaFallbackSpec.screenSizeInch, 6.8);
  assert.equal(phoneArenaFallbackSpec.specifications.battery?.fast_charging_w, 45);
  assert.equal(phoneArenaFallbackSpec.specifications.connectivity?.nfc, false);
  assert.deepEqual(phoneArenaFallbackSpec.specifications.design?.colors, [
    'Obsidian',
    'Porcelain',
    'Hazel',
  ]);

  await assert.rejects(
    () =>
      auditMasterSpecs({
        from: () => ({
          select: () => ({
            order: () => ({
              range: async (from: number) => ({
                data:
                  from === 0
                    ? [
                        {
                          id: 'm-ws',
                          name: 'Whitespace Cam Device',
                          model_key: 'test:ws:128gb',
                          specifications: {
                            ...phoneArenaFallbackSpec.specifications,
                            camera: {
                              main_camera: '50 MP',
                              second_camera: '   ',
                            },
                          },
                        },
                      ]
                    : [],
                error: null,
              }),
            }),
          }),
        }),
      } as never),
    /missing camera\.second_camera/,
    'auditMasterSpecs must reject whitespace-only camera.second_camera (#503)'
  );

  console.log(
    '  ✅ [11/12] Backfill KeySpecs Merge, Whitespace Field Group Audit & Arena PhoneArena Fallbacks (#503) passed'
  );

  // =========================================================================
  // 12. ProductNormalizer Category-Aware Fallbacks, Earbud Storage & Title Screen Size (#505)
  // =========================================================================
  const unbenchmarkedEarbuds = normalizer.normalize(
    createDummyShopeeProduct(
      'Tai nghe Bluetooth Bose QuietComfort Ultra Earbuds Chính hãng',
      6990000
    )
  );
  assert.equal(unbenchmarkedEarbuds.category_slug, 'earbuds');
  assert.equal(unbenchmarkedEarbuds.specifications.category_slug, 'earbuds');
  assert.equal(unbenchmarkedEarbuds.storage_gb, null);
  assert.equal(unbenchmarkedEarbuds.variant_name, 'Standard');
  assert.equal(unbenchmarkedEarbuds.needs_review, false);
  assert.ok(unbenchmarkedEarbuds.model_key.endsWith(':unknown'));
  assert.equal(unbenchmarkedEarbuds.specifications.hardware?.os, 'Bluetooth 5.3 Audio DSP');
  assert.equal(unbenchmarkedEarbuds.specifications.cellular?.has_5g, false);
  assert.equal(unbenchmarkedEarbuds.specifications.cellular?.sim_type, 'No SIM');
  assert.equal(unbenchmarkedEarbuds.key_specs.camera, 'Active Noise Cancellation (ANC)');

  const unbenchmarkedLaptop = normalizer.normalize(
    createDummyShopeeProduct(
      'Laptop Dell XPS 14 14.5 inch OLED 16GB RAM 1TB SSD Chính hãng',
      48990000
    )
  );
  assert.equal(unbenchmarkedLaptop.category_slug, 'laptops');
  assert.equal(unbenchmarkedLaptop.specifications.category_slug, 'laptops');
  assert.equal(unbenchmarkedLaptop.screen_size_inch, 14.5);
  assert.equal(unbenchmarkedLaptop.specifications.display?.size_inch, 14.5);
  assert.equal(unbenchmarkedLaptop.specifications.hardware?.os, 'Windows 11 Home');
  assert.equal(unbenchmarkedLaptop.specifications.cellular?.has_5g, false);
  assert.equal(unbenchmarkedLaptop.specifications.cellular?.sim_type, 'No SIM');
  assert.equal(unbenchmarkedLaptop.key_specs.chip, 'Intel Core / AMD Ryzen');
  assert.equal(unbenchmarkedLaptop.key_specs.camera, '1080p FHD Webcam');

  const unbenchmarkedWatch = normalizer.normalize(
    createDummyShopeeProduct('Đồng hồ thông minh Huawei Watch GT 5 Pro 1,4 inch 32GB', 7490000)
  );
  assert.equal(unbenchmarkedWatch.category_slug, 'smartwatches');
  assert.equal(unbenchmarkedWatch.specifications.category_slug, 'smartwatches');
  assert.equal(unbenchmarkedWatch.screen_size_inch, 1.4);
  assert.equal(unbenchmarkedWatch.specifications.hardware?.os, 'Wear OS 5');
  assert.equal(unbenchmarkedWatch.key_specs.camera, 'Optical HR + SpO2 Sensor');

  const mergedWithCategorySlug = mergeProductSpecifications(unbenchmarkedLaptop.specifications, {
    hardware: { chipset: 'Intel Core Ultra 7 155H' },
  });
  assert.equal(
    mergedWithCategorySlug.category_slug,
    'laptops',
    'mergeProductSpecifications must preserve category_slug after ProductSpecificationsSchema.safeParse (#505)'
  );

  console.log(
    '  ✅ [12/13] ProductNormalizer Category-Aware Fallbacks, Earbud Storage & Title Screen Size (#505) passed'
  );

  // =========================================================================
  // 13. AiReviewAnalyzer MerchantRiskBreakdown Schema Alignment (#521)
  // =========================================================================
  {
    const { AiReviewAnalyzer } = await import('../ai-review-analyzer.js');
    const analyzer521 = new AiReviewAnalyzer({ apiKey: '' });
    const sampleResults521 = [
      {
        review_id: 'r-1',
        verdict: 'authentic' as const,
        flag_category: 'authentic' as const,
        fake_probability: 0.05,
        include_in_rating: true,
        helpfulness_weight: 1.2,
        reason: 'Authentic review',
        signals: {
          burst_pattern_score: 0,
          duplicate_text_ratio: 0,
          account_age_bucket: 'high' as const,
          reviewer_history_score: 0.9,
          language_marker_score: 0.1,
        },
      },
      {
        review_id: 'r-2',
        verdict: 'suspicious' as const,
        flag_category: 'low_value_coin_spam' as const,
        fake_probability: 0.45,
        include_in_rating: false,
        helpfulness_weight: 0,
        reason: 'Coin spam',
        signals: {
          burst_pattern_score: 0.2,
          duplicate_text_ratio: 0.5,
          account_age_bucket: 'medium' as const,
          reviewer_history_score: 0.4,
          language_marker_score: 0.6,
        },
      },
      {
        review_id: 'r-3',
        verdict: 'fake' as const,
        flag_category: 'seeding_fake' as const,
        fake_probability: 0.9,
        include_in_rating: false,
        helpfulness_weight: 0,
        reason: 'Seeding fake',
        signals: {
          burst_pattern_score: 0.85,
          duplicate_text_ratio: 0.8,
          account_age_bucket: 'low' as const,
          reviewer_history_score: 0.1,
          language_marker_score: 0.85,
        },
      },
      {
        review_id: 'r-4',
        verdict: 'suspicious' as const,
        flag_category: 'competitor_sabotage' as const,
        fake_probability: 0.8,
        include_in_rating: false,
        helpfulness_weight: 0,
        reason: 'Sabotage',
        signals: {
          burst_pattern_score: 0.7,
          duplicate_text_ratio: 0.6,
          account_age_bucket: 'low' as const,
          reviewer_history_score: 0.2,
          language_marker_score: 0.7,
        },
      },
    ];

    const eval521 = analyzer521.evaluateMerchantRisk({
      merchantId: 'merch-521',
      platform: 'shopee',
      isOfficial: false,
      reviewResults: sampleResults521,
    });
    assert.equal(eval521.total_reviews, 4);
    assert.equal(eval521.authentic_count, 1);
    assert.equal(eval521.coin_spam_count, 1);
    assert.equal(eval521.seeding_fake_count, 1);
    assert.equal(eval521.sabotage_or_bombing_count, 1);
    assert.equal(eval521.suspicious_ratio_pct, 75);

    let capturedMerchPayload: Record<string, unknown> | null = null;
    const stub521 = {
      from: (table: string) => ({
        select: () => ({
          in: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        }),
        upsert: async () => ({ error: null }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            if (table === 'merchants') {
              capturedMerchPayload = payload;
            }
            return { error: null };
          },
        }),
      }),
      rpc: async () => ({ error: null }),
    };

    await analyzer521.persistAnalysisToSupabase(stub521 as never, {
      productId: 'prod-521',
      masterId: 'master-521',
      merchantId: 'merch-521',
      platform: 'shopee',
      isOfficial: false,
      reviews: [
        {
          id: 'r-1',
          rating_star: 5,
          comment:
            'Máy dùng rất mượt, màn hình 120Hz sáng rõ ngoài trời, pin dùng trọn 1 ngày làm việc.',
        },
        {
          id: 'r-2',
          rating_star: 5,
          comment: 'Hình ảnh mang tính chất nhận xu',
        },
      ],
    });
    assert.ok(capturedMerchPayload, 'merchants.update must be invoked (#521)');
    const brk521 = (capturedMerchPayload as Record<string, unknown>)
      .review_risk_breakdown as Record<string, unknown>;
    assert.equal(brk521.total_reviews, 2);
    assert.equal(brk521.authentic_count, 1);
    assert.equal(brk521.coin_spam_count, 1);
    assert.equal(brk521.seeding_fake_count, 0);
    assert.equal(brk521.sabotage_or_bombing_count, 0);
    assert.equal(brk521.suspicious_ratio_pct, 50);
  }

  console.log('  ✅ [13/14] AiReviewAnalyzer MerchantRiskBreakdown Schema Alignment (#521) passed');

  // =========================================================================
  // 14. Earbud :unknown Keys, AirPods Pro Years, iPad RAM & Non-Phone Spec Hygiene (#643, #657)
  // =========================================================================
  {
    // #643: Earbuds have no storage variant and must normalize to :unknown
    assert.equal(keyOf('Tai nghe Samsung Galaxy Buds3 Pro'), 'samsung:galaxy-buds3-pro:unknown');
    assert.equal(keyOf('AirPods Pro 2'), 'apple:airpods-pro-2:unknown');
    assert.equal(keyOf('Apple AirPods 4'), 'apple:airpods-4:unknown');

    // #643: FPT Shop AirPods Pro 2022 / 2023 map to AirPods Pro 2 (:unknown)
    assert.equal(keyOf('Tai nghe AirPods Pro 2022'), 'apple:airpods-pro-2:unknown');
    assert.equal(keyOf('Tai nghe AirPods Pro 2023'), 'apple:airpods-pro-2:unknown');
    assert.equal(keyOf('Tai nghe AirPods Pro (2023) USB-C'), 'apple:airpods-pro-2:unknown');

    // #643: FPT Shop names the iPad Pro M5 by its 12GB RAM, which the 256GB and 512GB
    // models share, so the storage stays unknown (#1094).
    const ipadProM5Ram = normalizer.normalize(
      createDummyShopeeProduct('iPad Pro 11 M5 2025 WiFi 12GB')
    );
    assert.equal(ipadProM5Ram.model_key, 'apple:ipad-pro-m5-11:unknown');
    assert.equal(ipadProM5Ram.ram_gb, 12);
    assert.equal(ipadProM5Ram.storage_gb, null);

    const ipadAirRamOnly = normalizer.normalize(
      createDummyShopeeProduct('iPad Air 11 M3 2025 WiFi 8GB')
    );
    assert.equal(ipadAirRamOnly.model_key, 'apple:ipad-air-m3-11:unknown');
    assert.equal(ipadAirRamOnly.ram_gb, 8);
    assert.equal(ipadAirRamOnly.storage_gb, null);

    // #643: Vietnamese diacritic translocation in slugify & Cloudflare challenge brand safety
    assert.equal(brandOf('Just a moment...'), 'Khác');
    assert.equal(brandOf('Please wait a moment'), 'Khác');
    assert.equal(keyOf('Just a moment...'), 'khac:just-a-moment:unknown');
    assert.equal(
      keyOf('Bàn phím dành cho Laptop Lenovo ThinkPad X1'),
      'lenovo:ban-phim-danh-cho:unknown'
    );
    assert.equal(keyOf('Đồng hồ Samsung Galaxy Watch7 44mm'), 'samsung:galaxy-watch7:unknown');

    // #657 Case 1: Title-stated RAM beats benchmark RAM
    const s26Ultra12Gb = normalizer.normalize(
      createDummyShopeeProduct('Samsung Galaxy S26 Ultra - 12GB/256GB')
    );
    assert.equal(s26Ultra12Gb.model_key, 'samsung:galaxy-s26-ultra:256gb');
    assert.equal(s26Ultra12Gb.ram_gb, 12);
    assert.equal(s26Ultra12Gb.specifications.hardware?.ram_gb, 12);
    assert.equal(s26Ultra12Gb.key_specs.ram, '12GB');

    const s26UltraBenchmarkRam = normalizer.normalize(
      createDummyShopeeProduct('Samsung Galaxy S26 Ultra 256GB')
    );
    assert.equal(s26UltraBenchmarkRam.ram_gb, 16);
    assert.equal(s26UltraBenchmarkRam.specifications.hardware?.ram_gb, 16);

    // #657 Case 2 & 3: Earbuds, watches, tablets, laptops get no phone-shaped storage/RAM/screen/SAR/Face ID
    const wf1000xm6 = normalizer.normalize(createDummyShopeeProduct('Tai nghe Sony WF-1000XM6'));
    assert.equal(wf1000xm6.model_key, 'sony:wf-1000xm6:unknown');
    assert.equal(wf1000xm6.ram_gb, null);
    assert.equal(wf1000xm6.storage_gb, null);
    assert.equal(wf1000xm6.screen_size_inch, null);
    assert.equal(wf1000xm6.specifications.hardware?.ram_gb, undefined);
    assert.equal(wf1000xm6.specifications.hardware?.storage_gb, undefined);
    assert.equal(wf1000xm6.specifications.display?.size_inch, undefined);
    assert.equal(wf1000xm6.specifications.display?.refresh_rate_hz, undefined);
    assert.equal(wf1000xm6.specifications.display?.ppi, undefined);
    assert.equal(wf1000xm6.specifications.regulatory?.sar_head, undefined);
    assert.equal(wf1000xm6.specifications.regulatory?.sar_body, undefined);
    assert.equal(wf1000xm6.specifications.design?.biometrics, undefined);

    const airpodsPro2 = normalizer.normalize(createDummyShopeeProduct('Tai nghe AirPods Pro 2'));
    assert.equal(airpodsPro2.model_key, 'apple:airpods-pro-2:unknown');
    assert.equal(airpodsPro2.ram_gb, null);
    assert.equal(airpodsPro2.storage_gb, null);
    assert.equal(airpodsPro2.screen_size_inch, null);
    assert.equal(airpodsPro2.specifications.design?.biometrics, undefined);
    assert.equal(airpodsPro2.specifications.regulatory?.sar_head, undefined);

    assert.equal(ipad.specifications.design?.biometrics, undefined);
    assert.equal(ipad.specifications.regulatory?.sar_head, undefined);
    assert.equal(macbook.specifications.design?.biometrics, undefined);
    assert.equal(macbook.specifications.regulatory?.sar_head, undefined);
    assert.equal(watchUltra.ram_gb, null);
    assert.equal(watchUltra.specifications.design?.biometrics, undefined);
    assert.equal(watchUltra.specifications.regulatory?.sar_head, undefined);

    // Smartphones retain their template SAR and biometrics
    assert.equal(s24.specifications.regulatory?.sar_head, '1.10 W/kg');
    assert.equal(s24.specifications.regulatory?.sar_body, '1.15 W/kg');
    assert.equal(s24.specifications.design?.biometrics, 'Fingerprint (under display), Face unlock');
    const iphone16 = normalizer.normalize(createDummyShopeeProduct('iPhone 16 Pro Max 256GB'));
    assert.equal(iphone16.specifications.design?.biometrics, 'Face ID');
    assert.equal(iphone16.specifications.regulatory?.sar_head, '1.10 W/kg');
  }
  console.log(
    '  ✅ [14/14] Earbud :unknown Keys, AirPods Pro Years, iPad RAM & Non-Phone Spec Hygiene (#643, #657) passed'
  );

  // =========================================================================
  // 15. ClusterPeerFloor, MerchantReviewRisk & ImporterLogger Numeric & ID Bounds (#1040)
  // =========================================================================
  {
    const { resolveClusterPeerFloorPrice } = await import('../cluster-peer-floor.js');
    const { normalizeSafeId, toValidPrice, mapStoredReview, scoreMerchants } =
      await import('../merchant-review-risk.js');
    const { AiReviewAnalyzer } = await import('../ai-review-analyzer.js');
    const { sanitizeImporterIdentifier, sanitizeLogMeta, ImporterStructuredLogger } =
      await import('../logger.js');

    assert.equal(
      resolveClusterPeerFloorPrice(
        [
          { id: '0', price_current: '0x100000' },
          { id: 'null', price_current: '\u000025000000 ' },
        ],
        'null',
        '0x200000' as unknown as number
      ),
      25_000_000,
      'resolveClusterPeerFloorPrice must not self-exclude sentinel IDs and must reject hex prices while stripping control chars (#1040)'
    );
    assert.equal(
      resolveClusterPeerFloorPrice([], 'prod-1', '\u000018500000 ' as unknown as number),
      18_500_000
    );
    assert.equal(
      resolveClusterPeerFloorPrice([], 'prod-1', '0x100000' as unknown as number),
      undefined
    );

    assert.equal(normalizeSafeId('0'), null);
    assert.equal(normalizeSafeId('0000'), null);
    assert.equal(normalizeSafeId('---'), null);
    assert.equal(normalizeSafeId('null'), null);
    assert.equal(normalizeSafeId('undefined'), null);
    assert.equal(normalizeSafeId('__proto__'), null);
    assert.equal(normalizeSafeId('constructor'), null);
    assert.equal(normalizeSafeId('prototype'), null);
    assert.equal(normalizeSafeId('m-1\u0000bad'), null);
    assert.equal(normalizeSafeId('  m-1040 '), 'm-1040');

    assert.equal(toValidPrice('0x100000'), 0);
    assert.equal(toValidPrice('\u000019990000 '), 19_990_000);

    const mappedRev1040 = mapStoredReview({
      id: '  rev-1040 ',
      product_id: 'p-1',
      rating_star: '0x4',
      comment: 'Good phone',
      review_flags: { verdict: 'authentic', flag_category: 'authentic', include_in_rating: true },
    });
    assert.equal(mappedRev1040?.raw.rating_star, 5);

    const analyzer1040 = new AiReviewAnalyzer({ apiKey: '' });
    const scored1040 = scoreMerchants(
      analyzer1040,
      [
        {
          id: '  merch-1040 ',
          platform: '__proto__',
          is_official: false,
          follower_count: '0x100',
          review_risk_score: '\u000042 ',
        },
      ],
      [
        {
          id: 'prod-1040',
          merchant_id: 'merch-1040',
          cluster_id: '0000',
          price_current: 20_000_000,
        },
      ],
      [
        {
          id: 'rev-1040',
          product_id: 'prod-1040',
          rating_star: '\u00004 ',
          comment: 'Tot',
          review_flags: {
            verdict: 'authentic',
            flag_category: 'authentic',
            include_in_rating: true,
          },
        },
      ],
      new Map()
    );
    assert.equal(scored1040.length, 1);
    assert.equal(scored1040[0]?.merchantId, 'merch-1040');
    assert.equal(scored1040[0]?.previousScore, 42);

    assert.equal(sanitizeImporterIdentifier('0000', 64), '');
    assert.equal(sanitizeImporterIdentifier('---', 64), '');
    assert.equal(sanitizeImporterIdentifier('__proto__', 64), '');
    assert.equal(sanitizeImporterIdentifier('\u0000algo-1 ', 64), 'algo-1');

    const meta1040 = sanitizeLogMeta({
      '__proto__\u0000': 'bad',
      '\u0000api_key ': 'secret',
      err: Object.assign(new Error('failed'), { name: '__proto__' }),
    }) as Record<string, unknown>;
    assert.equal(Object.hasOwn(meta1040, '__proto__'), false);
    assert.equal(meta1040.api_key, '[REDACTED]');
    assert.equal((meta1040.err as { name?: string })?.name, 'Error');

    const impLogger1040 = new ImporterStructuredLogger({
      component: '__proto__',
      runId: '0000',
      jobId: '---',
      platform: 'null',
    });
    const impEntry1040 = impLogger1040.formatEntry('info', 'constructor', 'ok');
    assert.equal(impEntry1040.component, 'Importer');
    assert.equal(impEntry1040.run_id, null);
    assert.equal(impEntry1040.job_id, null);
    assert.equal(impEntry1040.platform, null);
    assert.equal(impEntry1040.event, 'importer.event');

    console.log(
      '  ✅ [15/15] ClusterPeerFloor, MerchantReviewRisk & ImporterLogger Numeric & ID Bounds (#1040) passed'
    );
  }

  // =========================================================================
  // 16. Paging & ShopeeToSupabase URL, Review ID & Entity ID Bounds (#1046)
  // =========================================================================
  {
    const { fetchAllPages, parseShopeeEnqueueUrl, resolveBackfillSupabaseTarget } =
      await import('../paging.js');
    const { platformReviewIdFor, sanitizeIngestionEntityId } =
      await import('../shopee-to-supabase.js');

    // 1. fetchAllPages rejects hex/octal string pageSize/maxPages and clamps positive integers
    const ranges1046: Array<[number, number]> = [];
    await fetchAllPages(
      'hex_page',
      (from, to) => {
        ranges1046.push([from, to]);
        return Promise.resolve({ data: [], error: null });
      },
      '0x10' as unknown as number,
      '0x5' as unknown as number
    );
    assert.deepEqual(ranges1046, [[0, 999]]);

    // 2. parseShopeeEnqueueUrl rejects /verify, /buyer/login, and /search interstitial paths
    assert.equal(
      parseShopeeEnqueueUrl('https://shopee.vn/verify/captcha-i.88201679.27110898667'),
      null
    );
    assert.equal(
      parseShopeeEnqueueUrl('https://shopee.vn/buyer/login/i.88201679.27110898667'),
      null
    );
    assert.equal(parseShopeeEnqueueUrl('https://shopee.vn/search/i.88201679.27110898667'), null);

    // 3. resolveBackfillSupabaseTarget rejects 0.0.0.0 and single-label non-localhost hosts
    assert.throws(() => resolveBackfillSupabaseTarget('https://0.0.0.0:54321'), /invalid hostname/);
    assert.throws(
      () => resolveBackfillSupabaseTarget('https://internal-db:54321'),
      /invalid hostname/
    );
    assert.equal(resolveBackfillSupabaseTarget('http://localhost:54321').host, 'localhost:54321');

    // 4. sanitizeIngestionEntityId and platformReviewIdFor reject sentinels, multi-zero, and whitespace
    assert.equal(sanitizeIngestionEntityId('0000'), null);
    assert.equal(sanitizeIngestionEntityId('---'), null);
    assert.equal(sanitizeIngestionEntityId('__proto__'), null);
    assert.equal(sanitizeIngestionEntityId('rev id'), null);
    assert.equal(sanitizeIngestionEntityId('\u0000rev-1046 '), 'rev-1046');

    const baseRev1046 = {
      reviewId: '0000',
      author: 'User 1046',
      ratingStar: 5,
      comment: 'Solid phone',
      images: [],
    };
    const hashed1046 = platformReviewIdFor(baseRev1046);
    assert.ok(hashed1046.startsWith('rv-'));
    assert.equal(platformReviewIdFor({ ...baseRev1046, reviewId: '__proto__' }), hashed1046);
    assert.equal(platformReviewIdFor({ ...baseRev1046, reviewId: '---' }), hashed1046);
    assert.equal(platformReviewIdFor({ ...baseRev1046, reviewId: 'bad space' }), hashed1046);

    console.log(
      '  ✅ [16/16] Paging & ShopeeToSupabase URL, Review ID & Entity ID Bounds (#1046) passed'
    );
  }

  // =========================================================================
  // 17. EntityMatcher & ArenaSpecSyncer Numeric, Key & ID Bounds (#1053)
  // =========================================================================
  {
    const {
      EntityMatcher,
      sanitizeMatcherEntityId,
      toBoundedPositiveInt,
      toBoundedPositiveNumber,
    } = await import('../entity-matcher.js');
    const { ArenaSpecSyncer, extractGsmArenaDataSpecs } = await import('../arena-spec-syncer.js');

    // 1. toBoundedPositiveInt and toBoundedPositiveNumber strip control chars and reject hex/octal/binary prefixes
    assert.equal(toBoundedPositiveInt('0x10', 2048), null);
    assert.equal(toBoundedPositiveInt('0o20', 2048), null);
    assert.equal(toBoundedPositiveInt('0b1000', 2048), null);
    assert.equal(toBoundedPositiveInt('\u0000 16 \r\n', 2048), 16);
    assert.equal(toBoundedPositiveNumber('0x10', 120), null);
    assert.equal(toBoundedPositiveNumber('\u0000 6.8 \n', 120), 6.8);

    // 2. sanitizeMatcherEntityId and enrichMasterProductById reject multi-zero, pure-punctuation, internal whitespace, and prototype keys
    assert.equal(sanitizeMatcherEntityId('0000'), '');
    assert.equal(sanitizeMatcherEntityId('---'), '');
    assert.equal(sanitizeMatcherEntityId('__proto__'), '');
    assert.equal(sanitizeMatcherEntityId('constructor'), '');
    assert.equal(sanitizeMatcherEntityId('prototype'), '');
    assert.equal(sanitizeMatcherEntityId('id with space'), '');
    assert.equal(sanitizeMatcherEntityId('  master-1053  '), 'master-1053');

    const matcher1053 = new EntityMatcher({} as never);
    await assert.rejects(
      () => matcher1053.enrichMasterProductById('0000'),
      /masterId must be a non-empty string/
    );
    await assert.rejects(
      () => matcher1053.enrichMasterProductById('__proto__'),
      /masterId must be a non-empty string/
    );

    // 3. extractGsmArenaDataSpecs rejects prototype-pollution and pure-punctuation keys
    const specs1053 = extractGsmArenaDataSpecs(
      `<td data-spec="__proto__">polluted</td>
       <td data-spec="constructor">bad</td>
       <td data-spec="---">dash</td>
       <td data-spec="modelname">Samsung Galaxy S26 Ultra</td>`
    );
    assert.equal(Object.hasOwn(specs1053, '__proto__'), false);
    assert.equal(Object.hasOwn(specs1053, 'constructor'), false);
    assert.equal(Object.hasOwn(specs1053, '---'), false);
    assert.equal(specs1053.modelname, 'Samsung Galaxy S26 Ultra');

    // 4. auditCatalogAgainstArenaRegistry sanitizes id, model_key, and slug
    const syncer1053 = new ArenaSpecSyncer();
    const audit1053 = await syncer1053.auditCatalogAgainstArenaRegistry({
      from: () => ({
        select: () => ({
          order: () => ({
            range: async (from: number) => ({
              data:
                from === 0
                  ? [
                      {
                        id: '0000',
                        name: 'Bad Sentinel Master',
                        model_key: '__proto__',
                        slug: '---',
                        specifications: {},
                      },
                    ]
                  : [],
              error: null,
            }),
          }),
        }),
      }),
    } as never);
    assert.equal(audit1053.incompleteSpecMasters.length, 1);
    assert.equal(audit1053.incompleteSpecMasters[0]?.id, '');
    assert.equal(audit1053.incompleteSpecMasters[0]?.model_key, '');

    console.log(
      '  ✅ [17/17] EntityMatcher & ArenaSpecSyncer Numeric, Key & ID Bounds (#1053) passed'
    );
  }

  console.log('🎉 All @repo/crawlers Open-Core Intelligence tests passed!');
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
