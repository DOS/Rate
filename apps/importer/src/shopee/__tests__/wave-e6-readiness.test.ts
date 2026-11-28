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
      ['Máy ảnh Sony Alpha A6700 Body Chính hãng', 'cameras'],
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
      ['Samsung Galaxy S25 Ultra màn hình AMOLED 6.8 inch camera 200MP', 'smartphones'],
      ['Xiaomi 15 Ultra 512GB camera Leica 50MP màn hình 120Hz', 'smartphones'],
      ['Laptop Gaming ASUS TUF Gaming A15 FA507 màn hình 15.6 inch 144Hz', 'laptops'],
      ['Laptop ASUS ROG Strix G16 màn hình 16 inch 165Hz', 'laptops'],
      ['ASUS TUF Gaming F15 FX507ZC4 Core i5 16GB 512GB', 'laptops'],
      ['Smart Tivi LG OLED 55 inch 4K 120Hz', 'tvs'],
      ['Google Tivi Sony Bravia 65 inch 4K', 'tvs'],
      ['Camera hành trình ô tô 70mai A810 4K HDR', 'smartphones'],
      ['Camera an ninh WiFi ngoài trời EZVIZ C8C 2K', 'smartphones'],
      ['Camera giám sát trong nhà Imou Ranger 2 360', 'smartphones'],
      ['Webcam Logitech C922 Pro Stream Full HD', 'smartphones'],
      ['Cổ phiếu Chứng khoán VPS báo cáo phân tích', 'smartphones'],
    ];
    for (const [title, expected] of guardCases) {
      assert.equal(
        detectCategorySlug(title),
        expected,
        `Guard failed for "${title}" (expected ${expected})`
      );
    }

    // Monitor & camera accessories must not classify into monitors/cameras without hint.
    assert.notEqual(
      detectCategorySlug('Giá treo màn hình Human Motion T6 Pro 17-32 inch'),
      'monitors'
    );
    assert.notEqual(detectCategorySlug('Miếng dán màn hình chống chói 27 inch'), 'monitors');
    assert.notEqual(detectCategorySlug('Ống kính Sony FE 50mm f/1.8 Chính hãng'), 'cameras');
    assert.notEqual(detectCategorySlug('Chân máy ảnh Tripod Benro T600EX'), 'cameras');
    assert.notEqual(
      detectCategorySlug('Túi đựng máy ảnh Peak Design Everyday Sling 6L'),
      'cameras'
    );
    assert.notEqual(
      detectCategorySlug('Thẻ nhớ SDXC SanDisk Extreme Pro 128GB cho máy ảnh'),
      'cameras'
    );
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
    assert.equal(isAccessoryTitle('Canon EOS R50 Kit RF-S 18-45mm Chính hãng', 'cameras'), false);

    assert.equal(isAccessoryTitle('Ốp lưng VPS Cloud NVMe', 'vps-hosting'), false);
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
