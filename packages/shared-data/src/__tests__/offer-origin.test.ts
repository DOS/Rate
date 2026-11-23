import assert from 'node:assert/strict';
import {
  classifySellerChannel,
  detectProductOrigin,
  type ProductOrigin,
  type SellerChannel,
} from '../rules/index.js';

function testDetectProductOrigin(): void {
  const cases: ReadonlyArray<
    readonly [title: string, expected: ProductOrigin, description?: string]
  > = [
    [
      'Điện thoại Apple iPhone 16 Pro Max 256GB Chính hãng VN/A',
      'official_vna',
    ],
    ['Apple iPhone 16 Pro Max 256/512GB-VN/A', 'official_vna'],
    ['MacBook Air M4 16GB/256GB VNA nguyên seal', 'official_vna'],
    ['Samsung Galaxy S25 Ultra 256GB Chính hãng', 'official_vna'],
    ['iPhone 16 Pro 256GB chinh hang Apple Viet Nam', 'official_vna'],
    ['iPad Air M3 WiFi 128GB Phân phối chính hãng', 'official_vna'],
    ['Tai nghe Sony WH-1000XM5 Đại lý ủy quyền chính hãng', 'official_vna'],
    [
      'Điện thoại Apple iPhone 16 Pro Max 256GB Bản Mỹ LL/A Xách tay',
      'imported',
    ],
    ['iPhone 16 Pro 256GB ZP/A nguyên seal', 'imported'],
    ['iPhone 16 Pro Max ZA/A 2 sim vật lý', 'imported'],
    ['iPhone 15 Pro CH/A bản Trung', 'imported'],
    ['iPhone 15 Pro Max KH/A Bản Hàn', 'imported'],
    ['iPhone 16 J/A Bản Nhật', 'imported'],
    ['iPhone 16 Pro HK/A xach tay', 'imported'],
    ['Điện thoại Xiaomi 15 Pro 256GB Nội địa Trung nguyên seal', 'imported'],
    ['iPhone 16 Pro Quốc tế Mỹ 256GB', 'imported'],
    // Mixing official wording with imported markers must still classify as imported
    [
      'iPhone 16 Pro Max 256GB Chính hãng Apple',
      'imported',
      'Hàng xách tay Mỹ LL/A nguyên seal chưa active',
    ],
    // Decomposed NFD Vietnamese input normalizes cleanly to NFC
    [
      'iPhone 16 Pro 256GB Chi\u0301nh ha\u0303ng VN/A'.normalize('NFD'),
      'official_vna',
    ],
    [
      'iPhone 16 Pro 256GB Xa\u0301ch tay My\u0303'.normalize('NFD'),
      'imported',
    ],
    ['Điện thoại Samsung Galaxy S24 Ultra 256GB', 'unknown'],
    ['', 'unknown'],
  ];

  for (const [title, expected, description] of cases) {
    assert.equal(
      detectProductOrigin(title, description),
      expected,
      `detectProductOrigin(${JSON.stringify(title)}, ${JSON.stringify(description)})`
    );
  }

  // Non-string runtime inputs and adversarial long strings return cleanly without hang
  assert.equal(detectProductOrigin(null as unknown as string), 'unknown');
  assert.equal(detectProductOrigin(undefined as unknown as string), 'unknown');
  const start = Date.now();
  const longUnknown = detectProductOrigin('Phone '.repeat(20_000));
  assert.equal(longUnknown, 'unknown');
  assert.ok(Date.now() - start < 500, 'origin detection must stay linear');
}

function testClassifySellerChannel(): void {
  const cases: ReadonlyArray<
    readonly [
      Parameters<typeof classifySellerChannel>[0],
      SellerChannel,
      string,
    ]
  > = [
    // Direct Vietnamese authorized retail chains -> authorized_vat
    [
      {
        platform: 'topzone',
        isOfficial: true,
        merchantName: 'TopZone',
        title: 'iPhone 16 Pro Max 256GB VN/A',
      },
      'authorized_vat',
      'TopZone retail chain',
    ],
    [
      {
        platform: 'cellphones',
        isOfficial: false,
        merchantName: 'CellphoneS',
        title: 'Samsung Galaxy S25 Ultra 256GB',
      },
      'authorized_vat',
      'CellphoneS direct chain even when isOfficial flag is unset/false',
    ],
    [
      {
        platform: 'fptshop',
        isOfficial: true,
        merchantName: 'FPT Shop',
        title: 'MacBook Air M4 13 inch',
      },
      'authorized_vat',
      'FPT Shop direct chain',
    ],
    [
      {
        platform: 'tgdd',
        isOfficial: true,
        merchantName: 'Thế Giới Di Động',
        title: 'iPhone 16 128GB',
      },
      'authorized_vat',
      'TGDD direct chain',
    ],
    [
      {
        platform: 'shopdunk',
        isOfficial: true,
        merchantName: 'ShopDunk',
        title: 'iPad Pro M4',
      },
      'authorized_vat',
      'ShopDunk Apple AAR chain',
    ],
    [
      {
        platform: 'tiki',
        isOfficial: true,
        merchantName: 'Tiki Trading',
        title: 'iPhone 16 Pro Max 256GB VN/A',
      },
      'authorized_vat',
      'Tiki Trading 1P VAT distributor',
    ],
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'FPT Shop Official',
        title: 'iPhone 16 Pro Max 256GB VN/A',
      },
      'authorized_vat',
      'Authorized chain official storefront on Shopee Mall',
    ],
    // Marketplace official Mall storefronts -> official_mall
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'Apple Flagship Store',
        title: 'iPhone 16 Pro Max 256GB VN/A',
      },
      'official_mall',
      'Shopee Mall brand flagship store',
    ],
    [
      {
        platform: 'tiki',
        isOfficial: true,
        merchantName: 'Cửa Hàng Điện Thoại Hà Nội',
        title: 'iPhone 16 Pro Max 256GB chính hãng',
      },
      'official_mall',
      'Official marketplace merchant on Tiki',
    ],
    [
      {
        platform: 'lazada',
        isOfficial: true,
        merchantName: 'Samsung Official Store',
        title: 'Galaxy S25 Ultra 256GB',
      },
      'official_mall',
      'LazMall official store',
    ],
    // Third-party / unverified / spoofed / imported listings -> independent_shop
    [
      {
        platform: 'shopee',
        isOfficial: false,
        merchantName: 'FPT Shop Gia Re',
        title: 'iPhone 16 Pro Max 256GB',
      },
      'independent_shop',
      'Non-official Shopee shop spoofing chain name must stay independent_shop',
    ],
    [
      {
        platform: 'lazada',
        isOfficial: false,
        merchantName: 'Minh Tuan Mobile',
        title: 'iPhone 16 Pro Max 256GB Chính hãng VN/A',
      },
      'independent_shop',
      'Independent non-mall shop selling VN/A',
    ],
    [
      {
        platform: 'clickbuy',
        isOfficial: false,
        merchantName: 'Clickbuy',
        title: 'iPhone 15 Pro Max 256GB Bản Mỹ LL/A Xách tay',
      },
      'independent_shop',
      'Imported LL/A listing never classifies as authorized_vat',
    ],
    [
      {
        platform: 'tiktok',
        isOfficial: true,
        merchantName: 'Demo Mall',
        title: 'iPhone 16 Bản Nhật J/A Xách tay',
      },
      'independent_shop',
      'Imported listing on TikTok Mall falls back to independent_shop',
    ],
    [null, 'independent_shop', 'null input'],
    [undefined, 'independent_shop', 'undefined input'],
    [{}, 'independent_shop', 'empty object input'],
    // Substring boundary guards against unrelated Official Mall storefronts
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'Toàn Phát Official',
        title: 'Tai nghe Bluetooth',
      },
      'official_mall',
      'Substring an phat inside Toan Phat Official must not misclassify as authorized_vat',
    ],
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'Lan Phát Official',
        title: 'Loa Bluetooth',
      },
      'official_mall',
      'Substring an phat inside Lan Phat Official stays official_mall',
    ],
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'Hoàng Hào Official',
        title: 'Phụ kiện điện thoại',
      },
      'official_mall',
      'Substring hoang ha inside Hoang Hao Official stays official_mall',
    ],
    [
      {
        platform: 'lazada',
        isOfficial: true,
        merchantName: 'Laptopzone Official',
        title: 'Laptop Gaming',
      },
      'official_mall',
      'Substring topzone inside Laptopzone Official stays official_mall',
    ],
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'SelfStudio Official',
        title: 'Đèn studio',
      },
      'official_mall',
      'Substring fstudio inside SelfStudio Official stays official_mall',
    ],
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'An Phát PC Official',
        title: 'Laptop ASUS',
      },
      'authorized_vat',
      'Whole-word An Phat PC Official keeps authorized_vat',
    ],
    // Tiki Trading 1P handling across isOfficial values
    [
      {
        platform: 'tiki',
        isOfficial: null,
        merchantName: 'Tiki Trading',
        title: 'iPhone 16 Pro Max 256GB VN/A',
      },
      'authorized_vat',
      'Tiki Trading on Tiki with isOfficial null classifies as authorized_vat',
    ],
    [
      {
        platform: 'tiki',
        isOfficial: false,
        merchantName: 'Tiki Trading',
        title: 'iPhone 16 Pro Max 256GB VN/A',
      },
      'independent_shop',
      'Tiki Trading on Tiki with isOfficial explicitly false falls back to independent_shop',
    ],
    // Explicit authorized VAT cues
    [
      {
        platform: 'shopee',
        isOfficial: true,
        merchantName: 'Apple Shop',
        title: 'MacBook Air M4 Xuất hóa đơn VAT',
      },
      'authorized_vat',
      'Official store explicitly promising VAT invoice classifies as authorized_vat',
    ],
    [
      {
        platform: 'shopee',
        isOfficial: false,
        merchantName: 'Shop ABC',
        title: 'iPhone 16 Xuất hóa đơn VAT',
      },
      'independent_shop',
      'Non-official shop title alone cannot claim authorized_vat',
    ],
  ];

  for (const [input, expected, label] of cases) {
    assert.equal(classifySellerChannel(input), expected, label);
  }

  // Adversarial long inputs remain bounded and fast
  const startMs = Date.now();
  const longNoise = `${'xách tay chính hãng vn/a '.repeat(250)} LL/A`;
  assert.equal(
    detectProductOrigin(longNoise, `${'official mall '.repeat(300)}`),
    'imported'
  );
  assert.equal(
    classifySellerChannel({
      platform: 'shopee',
      isOfficial: true,
      merchantName: 'Toan Phat '.repeat(120),
      title: 'a '.repeat(800),
    }),
    'official_mall'
  );
  assert.ok(
    Date.now() - startMs < 200,
    'Adversarial long origin/channel inputs must complete quickly without backtracking'
  );
}

function main(): void {
  console.log('🧪 Running offer-origin & seller-channel tests...');
  testDetectProductOrigin();
  testClassifySellerChannel();
  console.log('✅ All offer-origin & seller-channel tests passed!');
}

main();
