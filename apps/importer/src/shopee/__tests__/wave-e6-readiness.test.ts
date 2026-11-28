/**
 * Wave E6 Open-Core Importer Readiness Suite (DOS/Rate#1976):
 * monitors, cameras, and vps-hosting (24 -> 27 canonical categories).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPPORTED_SERVICE_PLATFORMS,
  SupportedEcommercePlatformSchema,
  SupportedServicePlatformSchema,
} from '@repo/shared-data';
import {
  MINIMUM_DEVICE_PRICE_FLOOR_VND,
  RATING_CRITERIA_ALL_CATEGORIES,
  RATING_CRITERIA_V6_VERSION,
  V6_RATING_CRITERIA_CATEGORIES,
  getCategorySpecTemplate,
  getRatingCriteria,
  getRatingCriteriaVersion,
  minimumListingPriceVnd,
} from '@repo/shared-data/rules';
import {
  CANONICAL_CATEGORY_SLUGS,
  ProductNormalizer,
  SERVICE_CATEGORY_SLUGS,
  SIZELESS_CATEGORY_SLUGS,
  WAVE_E6_PRODUCT_CATEGORY_SLUGS,
  WAVE_E6_SERVICE_CATEGORY_SLUGS,
  detectCategorySlug,
  isAccessoryTitle,
} from '../product-normalizer.js';
import { categoryNeedsAiSpecs, specificationsCompleteForCategory } from '../ai-enrich-guards.js';
import { aiCategoryOpen, reviewAiInstructions } from '../review-ai-prompt.js';
import { isShippingOnlyComment } from '../ai-review-analyzer.js';
import {
  WAVE_E_ALL_CATEGORY_SLUGS,
  WAVE_E_CATEGORY_SLUGS,
  crawledPublishBlockers,
  parsePublishMastersArgs,
} from '../jobs/publish-masters.js';
import type { ShopeeProduct } from '../types.js';

const normalizer = new ProductNormalizer();

function makeListing(overrides: Partial<ShopeeProduct> & { title: string }): ShopeeProduct {
  return {
    platform: 'tiki',
    itemId: 'e6-item-1',
    shopId: 'e6-shop-1',
    url: 'https://tiki.vn/item-p12345.html',
    priceMin: 8_990_000,
    priceMax: 8_990_000,
    currency: 'VND',
    images: ['https://cdn.example.com/e6.jpg'],
    models: [],
    shop: { name: 'Official Store', isMall: true },
    ...overrides,
  } as ShopeeProduct;
}

describe('Wave E6 shared-data, category sets, and AI guard contracts', () => {
  it('registers monitors, cameras, and vps-hosting across 27 canonical categories', () => {
    assert.equal(CANONICAL_CATEGORY_SLUGS.size, 27);
    assert.deepEqual([...WAVE_E6_PRODUCT_CATEGORY_SLUGS].sort(), ['cameras', 'monitors']);
    assert.deepEqual([...WAVE_E6_SERVICE_CATEGORY_SLUGS], ['vps-hosting']);
    assert.equal(RATING_CRITERIA_V6_VERSION, 6);
    assert.equal(RATING_CRITERIA_ALL_CATEGORIES.length, 28);
    assert.deepEqual([...V6_RATING_CRITERIA_CATEGORIES].sort(), [
      'cameras',
      'monitors',
      'vps-hosting',
    ]);

    for (const slug of ['monitors', 'cameras', 'vps-hosting'] as const) {
      assert.equal(CANONICAL_CATEGORY_SLUGS.has(slug), true);
      assert.equal(SIZELESS_CATEGORY_SLUGS.has(slug), true);
      assert.equal(WAVE_E_CATEGORY_SLUGS.has(slug), true);
      assert.ok(WAVE_E_ALL_CATEGORY_SLUGS.includes(slug));
      assert.equal(getRatingCriteriaVersion(slug), 6);
      assert.equal(getRatingCriteria(slug).length, 5);
    }

    assert.equal(SERVICE_CATEGORY_SLUGS.has('vps-hosting'), true);
    assert.equal(SERVICE_CATEGORY_SLUGS.has('monitors'), false);
    assert.equal(SERVICE_CATEGORY_SLUGS.has('cameras'), false);

    assert.equal(SupportedEcommercePlatformSchema.options.length, 22);
    for (const host of ['nhanhoa', 'pavietnam', 'hostvn', 'bkns', 'longvan'] as const) {
      assert.ok((SUPPORTED_SERVICE_PLATFORMS as readonly string[]).includes(host));
      assert.equal(SupportedServicePlatformSchema.safeParse(host).success, true);
    }
  });

  it('opens AI review extraction for monitors/cameras and excludes vps-hosting', () => {
    assert.equal(aiCategoryOpen('monitors'), true);
    assert.equal(aiCategoryOpen('cameras'), true);
    assert.equal(aiCategoryOpen('vps-hosting'), false);

    assert.match(reviewAiInstructions('monitors'), /display:/);
    assert.match(reviewAiInstructions('monitors'), /tần số quét/);
    assert.match(reviewAiInstructions('cameras'), /camera:/);
    assert.match(reviewAiInstructions('cameras'), /autofocus/);
  });

  it('keeps camera spec template free of phone-shaped camera group', () => {
    assert.equal(categoryNeedsAiSpecs('monitors'), true);
    assert.equal(categoryNeedsAiSpecs('cameras'), true);
    assert.equal(categoryNeedsAiSpecs('vps-hosting'), false);

    const camTemplate = getCategorySpecTemplate('cameras');
    assert.equal(camTemplate.groups.includes('camera'), false);

    const completeCameraSpecs = {
      category_slug: 'cameras',
      design: { weight_g: 493 },
      display: { size_inch: 3.0 },
      battery: { capacity_mah: 2280 },
      connectivity: { wlan: 'Wi-Fi 5' },
      availability: { status: 'Available' },
    };
    assert.equal(specificationsCompleteForCategory(completeCameraSpecs, 'cameras'), true);
  });

  it('enforces listing price floors across Wave E6 categories', () => {
    assert.equal(
      minimumListingPriceVnd(['Dell UltraSharp U2724D'], { categorySlug: 'monitors' }),
      MINIMUM_DEVICE_PRICE_FLOOR_VND
    );
    assert.equal(
      minimumListingPriceVnd(['Sony Alpha A6700'], { categorySlug: 'cameras' }),
      MINIMUM_DEVICE_PRICE_FLOOR_VND
    );
    assert.equal(minimumListingPriceVnd(['Cloud VPS NVMe'], { categorySlug: 'vps-hosting' }), 0);
  });
});

describe('Wave E6 category detection precision and anti-hijacking guards', () => {
  it('classifies monitors, cameras, and vps-hosting accurately without hint', () => {
    const positiveCases: Array<[string, string]> = [
      ['Màn hình máy tính Dell UltraSharp U2724D 27 inch 2K IPS 120Hz', 'monitors'],
      ['Màn hình gaming ASUS TUF Gaming VG27AQ3A 27 inch QHD 180Hz', 'monitors'],
      ['ASUS ROG Strix XG27ACS 27 inch 2K 180Hz', 'monitors'],
      ['Màn hình cong Samsung Odyssey G5 32 inch 165Hz', 'monitors'],
      ['Màn hình đồ họa ASUS ProArt PA278QV 27 inch WQHD', 'monitors'],
      ['Màn hình LG UltraGear 27GR75Q-B 27 inch IPS 165Hz', 'monitors'],
      ['BenQ MOBIUZ EX2710Q 27 inch 165Hz IPS', 'monitors'],
      ['Màn hình văn phòng ViewSonic VA2432-H 24 inch 100Hz', 'monitors'],
      ['Ultrawide monitor AOC CU34G2X 34 inch', 'monitors'],
      ['Màn hình LG 24MR400-B 24 inch FHD IPS 100Hz', 'monitors'],
      ['Apple Studio Display 27 inch 5K', 'monitors'],
      ['Màn hình Apple Studio Display 27 inch', 'monitors'],
      ['ASUS ProArt Display PA279CRV 27 inch 4K', 'monitors'],
      ['Lenovo Legion R27q-30 27 inch QHD 165Hz', 'monitors'],
      ['HP OMEN 27q 27 inch QHD 165Hz', 'monitors'],
      ['MSI MAG 274QRF QD E2 27 inch 180Hz', 'monitors'],
      ['MSI MPG 321URX QD-OLED 32 inch 4K', 'monitors'],
      ['Acer Nitro VG271U 27 inch QHD 180Hz', 'monitors'],
      ['LG 27UP850N-W 27 inch 4K USB-C', 'monitors'],
      ['Màn hình cong Samsung 27 inch 144Hz', 'monitors'],
      ['Máy ảnh Sony Alpha A6700 Body Chính hãng', 'cameras'],
      ['Máy ảnh Sony A7 IV + Lens 28-70mm Chính hãng', 'cameras'],
      ['Máy ảnh Mirrorless Canon EOS R50 Kit RF-S 18-45mm', 'cameras'],
      ['Máy ảnh Fujifilm X-T5 Body Chính hãng', 'cameras'],
      ['Nikon Z6 III Mirrorless Body', 'cameras'],
      ['Panasonic Lumix S5 II Kit 20-60mm', 'cameras'],
      ['Camera hành động GoPro Hero 13 Black Chính hãng', 'cameras'],
      ['DJI Osmo Action 5 Pro Standard Combo', 'cameras'],
      ['DJI Pocket 3 Creator Combo', 'cameras'],
      ['Action cam Insta360 X4 8K 360', 'cameras'],
      ['Sony ZV-E10 Mark II Kit 16-50mm', 'cameras'],
      ['Cloud VPS NVMe Nhân Hòa 2 vCPU 4GB RAM', 'vps-hosting'],
      ['Gói Web Hosting SSD P.A Việt Nam Pro 10GB', 'vps-hosting'],
      ['Thuê VPS Việt Nam HOSTVN KVM 4GB', 'vps-hosting'],
      ['Máy chủ ảo Cloud Server BKNS gói Standard', 'vps-hosting'],
      ['WordPress Hosting Long Vân NVMe tốc độ cao', 'vps-hosting'],
    ];
    for (const [title, expected] of positiveCases) {
      assert.equal(detectCategorySlug(title), expected, `Expected "${title}" -> ${expected}`);
    }
  });

  it('blocks smartphones, laptops, TVs, dashcams, security cams, and accessories from hijacking Wave E6', () => {
    const guardCases: Array<[string, string]> = [
      ['iPhone 16 Pro Max 256GB màn hình OLED 6.9 inch camera 48MP', 'smartphones'],
      ['Samsung Galaxy S24 Ultra màn hình OLED 120Hz', 'smartphones'],
      ['Samsung Galaxy S25 Ultra màn hình AMOLED 6.8 inch camera 200MP', 'smartphones'],
      ['Samsung Galaxy A55 5G camera 50MP màn hình 120Hz', 'smartphones'],
      ['Xiaomi 15 Ultra 512GB camera Leica 50MP màn hình 120Hz', 'smartphones'],
      ['Laptop Gaming ASUS TUF Gaming A15 FA507 màn hình 15.6 inch 144Hz', 'laptops'],
      ['ASUS TUF Gaming A15 FA507 màn hình 15.6 inch 144Hz', 'laptops'],
      ['Laptop ASUS ROG Strix G16 màn hình 16 inch 165Hz', 'laptops'],
      ['ASUS ROG Strix G16 màn hình 16 inch 165Hz RTX 4060', 'laptops'],
      ['ASUS TUF Gaming F15 FX507ZC4 Core i5 16GB 512GB', 'laptops'],
      ['Lenovo Legion R7000P màn hình 16 inch 2.5K 165Hz', 'laptops'],
      ['Lenovo Legion Y7000P Core i7 RTX 4060', 'laptops'],
      ['Lenovo Legion Y9000P màn hình 16 inch', 'laptops'],
      ['HP OMEN 16b màn hình 16.1 inch QHD 165Hz', 'laptops'],
      ['Acer Nitro V 15 ANV15 RTX 4050', 'laptops'],
      ['iPad Pro M4 màn hình OLED 13 inch', 'tablets'],
      ['Garmin Fenix 8 màn hình AMOLED 47mm', 'smartwatches'],
      ['Apple Watch Ultra 2 màn hình OLED 49mm', 'smartwatches'],
      ['JBL Tour Pro 3 tai nghe màn hình cảm ứng', 'earbuds'],
      ['Máy lọc không khí Xiaomi Smart Air Purifier 4 màn hình OLED', 'air-purifiers'],
      ['Smart Tivi LG OLED 55 inch 4K 120Hz', 'tvs'],
      ['Google Tivi Sony Bravia 65 inch 4K', 'tvs'],
      ['Camera hành trình ô tô 70mai A810 4K HDR', 'smartphones'],
      ['Camera an ninh WiFi ngoài trời EZVIZ C8C 2K', 'smartphones'],
      ['Camera giám sát trong nhà Imou Ranger 2 360', 'smartphones'],
      ['Webcam Logitech C922 Pro Stream Full HD', 'smartphones'],
      ['Cổ phiếu Chứng khoán VPS báo cáo phân tích', 'smartphones'],
      ['VPS SmartOne - Tài khoản giao dịch', 'smartphones'],
      ['VPS SmartPro', 'smartphones'],
    ];
    for (const [title, expected] of guardCases) {
      assert.equal(
        detectCategorySlug(title),
        expected,
        `Guard failed for "${title}" (expected ${expected})`
      );
    }

    // Non-monitor items (ProArt laptops, non-monitor SKUs, car Android displays, power banks, generic LED)
    for (const nonMonitor of [
      'ASUS ProArt P16 H7606 màn hình 4K OLED Ryzen AI RTX 4070',
      'ASUS ProArt PX13 OLED Touch',
      'ASUS ProArt StudioBook 16 OLED',
      'Dell E7470 Core i5 8GB 256GB',
      'Dell G5515 Ryzen 5 RTX 3050',
      'LG 55UQ7550PSF 55 inch 4K',
      'MSI MAG B760M Mortar WiFi',
      'MSI MPG A850G PCIE5 850W',
      'Pin dự phòng Anker 25000mAh màn hình LCD',
      'Sạc dự phòng Cuktech 15 Ultra màn hình TFT',
      'Màn hình Android Zestech Z800+ cho ô tô',
      'Màn hình OLEDPro X5S 9 inch',
      'Cân điện tử màn hình LED',
      'Giá treo màn hình Human Motion T6 Pro 17-32 inch',
      'Miếng dán màn hình chống chói 27 inch',
    ]) {
      assert.notEqual(
        detectCategorySlug(nonMonitor),
        'monitors',
        `Should not match monitors: ${nonMonitor}`
      );
    }

    // Non-camera items (standalone lenses/flashes/gimbals/cages, Nikon Z lenses, Sony Bravia OLED TVs)
    for (const nonCamera of [
      'Ống kính Sony FE 50mm f/1.8 Chính hãng',
      'Sigma 30mm f/1.4 DC DN Lens cho máy ảnh Mirrorless Sony',
      'Tamron 28-75mm f/2.8 Lens Mirrorless Sony E',
      'Godox TT685II Đèn flash cho máy ảnh Canon',
      'DJI RS 4 Mini Gimbal chống rung cho máy ảnh Mirrorless',
      'SmallRig Cage khung bảo vệ cho Sony A7 IV',
      'Nikon Z 24-70mm f/2.8 S',
      'Nikon Z 50mm f/1.8 S',
      'Sony A95L 65 inch QD-OLED',
      'Sony Bravia XR A95L',
      'Sony A80L 55 inch 4K',
      'Chân máy ảnh Tripod Benro T600EX',
      'Túi đựng máy ảnh Peak Design Everyday Sling 6L',
      'Thẻ nhớ SDXC SanDisk Extreme Pro 128GB cho máy ảnh',
    ]) {
      assert.notEqual(
        detectCategorySlug(nonCamera),
        'cameras',
        `Should not match cameras: ${nonCamera}`
      );
    }
  });

  it('keeps isAccessoryTitle active for monitors and cameras while exempting vps-hosting', () => {
    const monitorAccessories = [
      'Giá treo màn hình Human Motion T6 Pro',
      'Tay đỡ màn hình North Bayou F80',
      'Arm màn hình HyperWork VisionX',
      'Chân đế rời màn hình Dell UltraSharp',
      'Dán màn hình chống nhìn trộm 27 inch',
      'Kính cường lực màn hình 24 inch',
      'North Bayou F80 arm màn hình 17-30 inch',
    ];
    for (const title of monitorAccessories) {
      assert.equal(isAccessoryTitle(title, 'monitors'), true, title);
    }
    assert.equal(
      isAccessoryTitle('Màn hình Dell UltraSharp U2724D 27 inch 2K IPS 120Hz', 'monitors'),
      false
    );

    const cameraAccessories = [
      'Ống kính Sony FE 50mm f/1.8',
      'Lens Canon RF 50mm f/1.8 STM',
      'Sony FE 35mm f/1.8 Lens',
      'Sigma 30mm f/1.4 DC DN Lens cho máy ảnh Mirrorless Sony',
      'Tamron 28-75mm f/2.8 Lens Mirrorless Sony E',
      'Godox TT685II Đèn flash cho máy ảnh Canon',
      'DJI RS 4 Mini Gimbal chống rung cho máy ảnh Mirrorless',
      'SmallRig Cage khung bảo vệ cho Sony A7 IV',
      'Chân máy ảnh Tripod Benro T600EX',
      'Tripod Ulanzi MT-44 cho máy ảnh',
      'Túi đựng máy ảnh Peak Design Sling 6L',
      'Thẻ nhớ SDXC SanDisk 128GB',
      'Kính lọc Filter UV Hoya 67mm',
      'Filter ND64 77mm cho ống kính',
      'Hood che nắng EW-63C cho Canon',
      'Ngàm chuyển Canon EF-EOS R',
      'Pin rời Sony NP-FZ100',
      'Sạc rời pin máy ảnh Canon LC-E17',
    ];
    for (const title of cameraAccessories) {
      assert.equal(isAccessoryTitle(title, 'cameras'), true, title);
    }
    assert.equal(
      isAccessoryTitle('Máy ảnh Sony Alpha A6700 + Lens Kit 18-135mm Chính hãng', 'cameras'),
      false
    );
    assert.equal(
      isAccessoryTitle('Máy ảnh Sony A7 IV + Lens 28-70mm Chính hãng', 'cameras'),
      false
    );
    assert.equal(isAccessoryTitle('Canon EOS R50 Kit RF-S 18-45mm Chính hãng', 'cameras'), false);

    assert.equal(isAccessoryTitle('Ốp lưng VPS Cloud NVMe', 'vps-hosting'), false);
  });

  it('guards Wave E6 regexes against polynomial ReDoS on adversarial inputs', () => {
    const payloads = [
      '0'.repeat(5000),
      '-'.repeat(5000),
      `dell u${'0'.repeat(5000)}!`,
      `sony a${'0'.repeat(5000)}!`,
      `msi mag ${'-'.repeat(5000)}!`,
      `nikon z ${'0'.repeat(5000)}mm`,
      `lens ${'a '.repeat(2500)}`,
    ];
    const start = performance.now();
    for (const payload of payloads) {
      detectCategorySlug(payload);
      isAccessoryTitle(payload, 'monitors');
      isAccessoryTitle(payload, 'cameras');
    }
    const elapsedMs = performance.now() - start;
    assert.ok(
      elapsedMs < 50,
      `Expected linear regex runtime (<50ms), got ${elapsedMs.toFixed(2)}ms`
    );
  });
});

describe('Wave E6 normalization, publish gates, and shipping review guards', () => {
  it('normalizes monitors with screen axis, cameras without camera spec group, and vps-hosting as service', () => {
    const monitor = normalizer.normalize(
      makeListing({
        platform: 'phongvu',
        title: 'Màn hình Dell UltraSharp U2724D 27 inch 2K IPS 120Hz',
        priceMin: 9_490_000,
      })
    );
    assert.equal(monitor.category_slug, 'monitors');
    assert.equal(monitor.entity_type, 'product');
    assert.equal(monitor.brand, 'Dell');
    assert.equal(monitor.variant_key, 'unknown');
    assert.equal(monitor.storage_gb, null);
    assert.equal(monitor.ram_gb, null);
    assert.equal(monitor.has_5g, false);
    assert.equal(monitor.screen_size_inch, 27);
    assert.equal(monitor.key_specs.screen, '27"');
    assert.equal(monitor.specifications.display?.size_inch, 27);
    assert.equal(monitor.keyable, true);

    const camera = normalizer.normalize(
      makeListing({
        platform: 'cellphones',
        title: 'Máy ảnh Sony Alpha A6700 Body Chính hãng',
        priceMin: 34_990_000,
      })
    );
    assert.equal(camera.category_slug, 'cameras');
    assert.equal(camera.entity_type, 'product');
    assert.equal(camera.brand, 'Sony');
    assert.equal(camera.variant_key, 'unknown');
    assert.equal(camera.screen_size_inch, null);
    assert.deepEqual(camera.key_specs, {});
    assert.equal(camera.specifications.camera, undefined);
    assert.equal(camera.keyable, true);

    const vps = normalizer.normalize(
      makeListing({
        platform: 'nhanhoa',
        title: 'Cloud VPS NVMe Gói A 2 vCPU 4GB RAM',
        priceMin: 180_000,
      })
    );
    assert.equal(vps.category_slug, 'vps-hosting');
    assert.equal(vps.entity_type, 'service');
    assert.equal(vps.brand, 'Nhân Hòa');
    assert.equal(vps.variant_key, 'unknown');
    assert.equal(vps.keyable, true);

    // Check remaining VPS service platforms infer brand & vps-hosting cleanly without hint.
    const hostPairs: Array<[NonNullable<ShopeeProduct['platform']>, string]> = [
      ['pavietnam', 'P.A Việt Nam'],
      ['hostvn', 'HOSTVN'],
      ['bkns', 'BKNS'],
      ['longvan', 'Long Vân'],
    ];
    for (const [platform, expectedBrand] of hostPairs) {
      const normalized = normalizer.normalize(
        makeListing({
          platform,
          title: 'Gói Cloud Starter 2 Core 4GB',
          priceMin: 220_000,
        })
      );
      assert.equal(normalized.category_slug, 'vps-hosting', platform);
      assert.equal(normalized.entity_type, 'service', platform);
      assert.equal(normalized.brand, expectedBrand, platform);
    }
  });

  it("preserves OLED/Mini-LED monitor model codes, strips 27inch/27'', routes Apple Studio Display, uses ownProductPart for brand, and strips Fuji alias", () => {
    const g6 = normalizer.normalize(
      makeListing({ title: 'Màn hình Samsung Odyssey OLED G6 27 inch 360Hz', priceMin: 18_990_000 })
    );
    const g8 = normalizer.normalize(
      makeListing({ title: 'Màn hình Samsung Odyssey OLED G8 32 inch 240Hz', priceMin: 28_990_000 })
    );
    const g9 = normalizer.normalize(
      makeListing({ title: 'Màn hình Samsung Odyssey OLED G9 49 inch 240Hz', priceMin: 36_990_000 })
    );
    assert.equal(g6.model_key, 'samsung:odyssey-oled-g6:unknown');
    assert.equal(g8.model_key, 'samsung:odyssey-oled-g8:unknown');
    assert.equal(g9.model_key, 'samsung:odyssey-oled-g9:unknown');

    const pg27 = normalizer.normalize(
      makeListing({
        title: 'Màn hình ASUS ROG Swift OLED PG27AQDM 27 inch 240Hz',
        priceMin: 22_990_000,
      })
    );
    const pg32 = normalizer.normalize(
      makeListing({
        title: 'Màn hình ASUS ROG Swift OLED PG32UCDM 32 inch 4K 240Hz',
        priceMin: 34_990_000,
      })
    );
    assert.equal(pg27.model_key, 'asus:rog-swift-oled-pg27aqdm:unknown');
    assert.equal(pg32.model_key, 'asus:rog-swift-oled-pg32ucdm:unknown');

    const lg27 = normalizer.normalize(
      makeListing({
        title: 'Màn hình LG UltraGear OLED 27GR95QE 27 inch 240Hz',
        priceMin: 19_990_000,
      })
    );
    const lg32 = normalizer.normalize(
      makeListing({
        title: 'Màn hình LG UltraGear OLED 32GS95UE 32 inch 4K 240Hz',
        priceMin: 31_990_000,
      })
    );
    assert.equal(lg27.model_key, 'lg:ultragear-oled-27gr95qe:unknown');
    assert.equal(lg32.model_key, 'lg:ultragear-oled-32gs95ue:unknown');

    const dellInch = normalizer.normalize(
      makeListing({ title: 'Màn hình Dell 27inch U2724D 2K IPS', priceMin: 9_490_000 })
    );
    const dellQuotes = normalizer.normalize(
      makeListing({ title: "Màn hình Dell 27'' U2724D 2K IPS", priceMin: 9_490_000 })
    );
    assert.equal(dellInch.model_key, 'dell:u2724d:unknown');
    assert.equal(dellQuotes.model_key, 'dell:u2724d:unknown');

    const studioDisplay = normalizer.normalize(
      makeListing({ title: 'Màn hình Apple Studio Display 27 inch', priceMin: 39_990_000 })
    );
    assert.equal(studioDisplay.category_slug, 'monitors');
    assert.equal(studioDisplay.brand, 'Apple');
    assert.equal(studioDisplay.model_key, 'apple:studio-display:unknown');

    const lgWithDellGift = normalizer.normalize(
      makeListing({ title: 'Màn hình LG 27GR75Q-B tặng cáp Dell', priceMin: 6_990_000 })
    );
    assert.equal(lgWithDellGift.category_slug, 'monitors');
    assert.equal(lgWithDellGift.brand, 'LG');

    const sonyWithCanonGift = normalizer.normalize(
      makeListing({ title: 'Máy ảnh Sony Alpha A6700 tặng dây đeo Canon', priceMin: 34_990_000 })
    );
    assert.equal(sonyWithCanonGift.category_slug, 'cameras');
    assert.equal(sonyWithCanonGift.brand, 'Sony');

    const fuji = normalizer.normalize(
      makeListing({ title: 'Máy ảnh Fuji X-T5 Body Chính hãng', priceMin: 41_990_000 })
    );
    assert.equal(fuji.category_slug, 'cameras');
    assert.equal(fuji.brand, 'Fujifilm');
    assert.equal(fuji.model_key, 'fujifilm:x-t5-body:unknown');
  });

  it('supports Wave E6 categories in publish-masters --crawled mode', () => {
    const parsed = parsePublishMastersArgs([
      '--crawled',
      '--category',
      'monitors,cameras,vps-hosting',
    ]);
    assert.ok('crawled' in parsed && parsed.crawled);
    assert.deepEqual(parsed.categories, ['monitors', 'cameras', 'vps-hosting']);

    const monitorBlockers = crawledPublishBlockers(
      {
        model_key: 'dell:ultrasharp-u2724d:unknown',
        slug: 'dell-ultrasharp-u2724d',
        name: 'Dell UltraSharp U2724D',
        brand: 'Dell',
        status: 'draft',
        category_id: 'cat-monitors',
        entity_type: 'product',
        thumbnail: 'https://cdn.example.com/u2724d.jpg',
        images: ['https://cdn.example.com/u2724d.jpg'],
        specifications: {
          category_slug: 'monitors',
          availability: { status: 'Available' },
        },
      },
      {
        categorySlug: 'monitors',
        listings: [{ price_current: 9_490_000, currency: 'VND', origin: 'crawl' }],
      }
    );
    assert.deepEqual(monitorBlockers, []);

    const vpsBlockers = crawledPublishBlockers(
      {
        model_key: 'nhan-hoa:cloud-vps-a:unknown',
        slug: 'nhan-hoa-cloud-vps-a',
        name: 'Nhân Hòa Cloud VPS A',
        brand: 'Nhân Hòa',
        status: 'draft',
        category_id: 'cat-vps',
        entity_type: 'service',
        thumbnail: null,
        images: [],
        specifications: {
          category_slug: 'vps-hosting',
          availability: { status: 'Available' },
        },
      },
      {
        categorySlug: 'vps-hosting',
        listings: [{ price_current: 180_000, currency: 'VND', origin: 'crawl' }],
      }
    );
    assert.deepEqual(vpsBlockers, []);
  });

  it('detects monitor and camera domain substance in shipping comment filter', () => {
    assert.equal(
      isShippingOnlyComment('Giao hàng nhanh, tấm nền IPS không hở sáng, 165Hz mượt', {
        categorySlug: 'monitors',
      }),
      false
    );
    assert.equal(
      isShippingOnlyComment('Shop giao nhanh, cảm biến full-frame lấy nét nhanh', {
        categorySlug: 'cameras',
      }),
      false
    );
    assert.equal(
      isShippingOnlyComment('Shop đóng gói kỹ, giao hàng siêu nhanh 1 ngày nhận được', {
        categorySlug: 'monitors',
      }),
      true
    );
  });
});
