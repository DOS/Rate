import type { ProductSpecifications, KeySpecs } from '@repo/shared-data';
import type { ShopeeProduct } from './types.js';

export type CanonicalCategorySlug =
  'smartphones' | 'tablets' | 'laptops' | 'smartwatches' | 'earbuds';

export type ProductCondition = 'new' | 'like_new_99' | 'used' | 'refurbished';
export type ProductOrigin = 'official_vna' | 'imported' | 'unknown';

export interface NormalizedProductCandidate {
  category_slug: CanonicalCategorySlug;
  brand: string;
  model: string;
  variant_name: string;
  model_key: string;
  name: string;
  slug: string;
  storage_gb: number | null; // null = unparseable from the title; identity carries ':unknown'
  needs_review: boolean; // true when identity could not be confidently derived or listing is non-new (plan v7 §5.2, Audit C6)
  condition?: ProductCondition;
  origin?: ProductOrigin;
  ram_gb: number | null;
  screen_size_inch: number | null;
  battery_mah: number | null;
  has_5g: boolean;
  colors: string[];
  images: string[];
  specifications: ProductSpecifications;
  key_specs: KeySpecs;
  description?: string;
  is_benchmark_enriched?: boolean;
  spec_source?: 'benchmark_registry' | 'ai_unverified' | 'crawled_title';
  spec_enrichment_meta?: {
    provider: string;
    model: string;
    enriched_at: string;
  };
}

/**
 * Detect listing physical condition from product title and optional description (Audit C6).
 * Strips promotional trade-in phrases ("thu cũ đổi mới") before matching so new retail listings
 * offering trade-in programs are not misclassified as used devices.
 */
export function detectProductCondition(title: string, description?: string): ProductCondition {
  const cleanTitle = title.replace(/thu\s*cũ\s*đổi\s*mới/gi, ' ');
  const cleanDesc = (description || '').replace(/thu\s*cũ\s*đổi\s*mới/gi, ' ');

  const checkSource = (text: string): ProductCondition | null => {
    if (
      /(?:\brefurbished\b|tân\s*trang|hàng\s*đổi\s*bảo\s*hành|trả\s*bảo\s*hành|\bcpo\b|certified\s*pre-?owned)/i.test(
        text
      )
    ) {
      return 'refurbished';
    }
    if (
      /(?:\blike\s*new\b|\blikenew\b|mới\s*9[5-9]%|đẹp\s*9[5-9]%|zin\s*9[5-9]%|\b9[89]%|siêu\s*lướt|hàng\s*lướt|máy\s*lướt|hàng\s*trưng\s*bày|máy\s*trưng\s*bày|\bopen\s*box\b|đã\s*kích\s*hoạt\s*bảo\s*hành)/i.test(
        text
      )
    ) {
      return 'like_new_99';
    }
    if (
      /(?:máy\s*cũ|hàng\s*cũ|điện\s*thoại\s*cũ|đã\s*qua\s*sử\s*dụng|\bsecond\s*hand\b|\b2nd\b|thanh\s*lý\s*máy\s*cũ|máy\s*trần\s*cũ)/i.test(
        text
      )
    ) {
      return 'used';
    }
    return null;
  };

  const fromTitle = checkSource(cleanTitle);
  if (fromTitle) return fromTitle;

  const explicitlyNewInTitle =
    /(?:mới\s*100%|nguyên\s*seal|fullbox\s*nguyên\s*seal|chưa\s*active|chưa\s*kích\s*hoạt)/i.test(
      cleanTitle
    );
  if (!explicitlyNewInTitle && cleanDesc) {
    const fromDesc = checkSource(cleanDesc);
    if (fromDesc) return fromDesc;
  }

  return 'new';
}

/**
 * Detect product distribution origin (official VN/A vs parallel import vs unknown) (Audit C6).
 */
export function detectProductOrigin(title: string, description?: string): ProductOrigin {
  const combined = `${title} ${description || ''}`;
  if (
    /(?:xách\s*tay|bản\s*mỹ|\bll\/a\b|\bzp\/a\b|\bza\/a\b|\bch\/a\b|\bkh\/a\b|\bj\/a\b|bản\s*hàn|bản\s*nhật|bản\s*trung|nội\s*địa(?:\s*trung|\s*nhật|\s*hàn)?|quốc\s*tế\s*mỹ)/i.test(
      combined
    )
  ) {
    return 'imported';
  }
  if (
    /(?:\bvn\/a\b|\bvna\b|chính\s*hãng|phân\s*phối\s*chính\s*hãng|apple\s*việt\s*nam)/i.test(
      combined
    )
  ) {
    return 'official_vna';
  }
  return 'unknown';
}

/**
 * Detect canonical category slug from product title across all 5 tech categories.
 */
export function detectCategorySlug(title: string): CanonicalCategorySlug {
  const t = title.toLowerCase();
  if (
    /airpods|galaxy\s*buds|wf-\d+|wh-\d+|tai\s*nghe|earbuds?|freebuds|soundcore|quietcomfort|momentum\s*true/i.test(
      t
    )
  ) {
    return 'earbuds';
  }
  if (
    /apple\s*watch|galaxy\s*watch|\bgarmin\b|forerunner|fenix|venu|watch\s*(?:ultra|series|gt|fit|se)|đồng\s*hồ\s*thông\s*minh|smartwatch|amazfit|coros/i.test(
      t
    )
  ) {
    return 'smartwatches';
  }
  if (
    /macbook|thinkpad|ideapad|legion|vivobook|zenbook|rog\s*(?:strix|zephyrus|flow)|tuf\s*gaming|inspiron|\bxps\b|latitude|pavilion|envy|victus|omen|nitro\s*\d|swift|predator|surface\s*laptop|\blaptop\b|máy\s*tính\s*xách\s*tay|ultrabook/i.test(
      t
    )
  ) {
    return 'laptops';
  }
  if (
    /\bipad\b|galaxy\s*tab|xiaomi\s*pad|redmi\s*pad|matepad|lenovo\s*tab|surface\s*pro|máy\s*tính\s*bảng|\btablet\b/i.test(
      t
    )
  ) {
    return 'tablets';
  }
  return 'smartphones';
}

/**
 * Standard device specification registry for benchmark/flagship devices across 5 categories
 * Structured per PhoneArena 10-Field-Group taxonomy + GSMArena technical accuracy
 */
const CANONICAL_PHONE_REGISTRY: Record<
  string,
  {
    screen_size_inch: number;
    battery_mah: number;
    ram_gb: number;
    chipset: string;
    cpu: string;
    gpu: string;
    os: string;
    weight_g: number;
    dimensions: string;
    resolution: string;
    screen_type: string;
    refresh_rate_hz: number;
    rear_camera: string;
    second_camera?: string;
    third_camera?: string;
    fourth_camera?: string;
    front_camera: string;
    charging_w: number;
    has_5g: boolean;
    release_date: string;
    ip_rating: string;
    default_storage_gb?: number;
  }
> = {
  'apple:iphone-16-pro-max': {
    screen_size_inch: 6.9,
    battery_mah: 4685,
    ram_gb: 8,
    chipset: 'Apple A18 Pro (3 nm)',
    cpu: 'Hexa-core (2x4.05 GHz + 4x2.42 GHz)',
    gpu: 'Apple GPU (6-core graphics)',
    os: 'iOS 18 (upgradable)',
    weight_g: 227,
    dimensions: '163 x 77.6 x 8.3 mm',
    resolution: '1320 x 2868 pixels (~460 ppi)',
    screen_type: 'LTPO Super Retina XDR OLED, 120Hz, HDR10, Dolby Vision, 2000 nits (HBM)',
    refresh_rate_hz: 120,
    rear_camera: '48 MP, f/1.8, 24mm (wide), dual pixel PDAF, sensor-shift OIS',
    second_camera:
      '12 MP, f/2.8, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
    third_camera: '48 MP, f/2.2, 13mm (ultrawide), PDAF + TOF 3D LiDAR scanner',
    front_camera: '12 MP, f/1.9, 23mm (wide), PDAF, OIS + SL 3D',
    charging_w: 30,
    has_5g: true,
    release_date: 'September 2024',
    ip_rating: 'IP68 (6m up to 30 mins)',
  },
  'apple:iphone-16-pro': {
    screen_size_inch: 6.3,
    battery_mah: 3582,
    ram_gb: 8,
    chipset: 'Apple A18 Pro (3 nm)',
    cpu: 'Hexa-core (2x4.05 GHz + 4x2.42 GHz)',
    gpu: 'Apple GPU (6-core graphics)',
    os: 'iOS 18 (upgradable)',
    weight_g: 199,
    dimensions: '149.6 x 71.5 x 8.3 mm',
    resolution: '1206 x 2622 pixels (~460 ppi)',
    screen_type: 'LTPO Super Retina XDR OLED, 120Hz, HDR10, Dolby Vision, 2000 nits (HBM)',
    refresh_rate_hz: 120,
    rear_camera: '48 MP, f/1.8, 24mm (wide), dual pixel PDAF, sensor-shift OIS',
    second_camera:
      '12 MP, f/2.8, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
    third_camera: '48 MP, f/2.2, 13mm (ultrawide), PDAF + TOF 3D LiDAR scanner',
    front_camera: '12 MP, f/1.9, 23mm (wide), PDAF, OIS + SL 3D',
    charging_w: 30,
    has_5g: true,
    release_date: 'September 2024',
    ip_rating: 'IP68 (6m up to 30 mins)',
  },
  'apple:iphone-16': {
    screen_size_inch: 6.1,
    battery_mah: 3561,
    ram_gb: 8,
    chipset: 'Apple A18 (3 nm)',
    cpu: 'Hexa-core (2x4.04 GHz + 4x2.20 GHz)',
    gpu: 'Apple GPU (5-core graphics)',
    os: 'iOS 18 (upgradable)',
    weight_g: 170,
    dimensions: '147.6 x 71.6 x 7.8 mm',
    resolution: '1179 x 2556 pixels (~460 ppi)',
    screen_type: 'Super Retina XDR OLED, HDR10, Dolby Vision, 2000 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera: '48 MP, f/1.6 (wide, sensor-shift OIS)',
    second_camera: '12 MP, f/2.2 (ultrawide, PDAF)',
    front_camera: '12 MP, f/1.9 (wide, PDAF) + SL 3D',
    charging_w: 25,
    has_5g: true,
    release_date: 'September 2024',
    ip_rating: 'IP68 (6m up to 30 mins)',
  },
  'apple:iphone-16e': {
    screen_size_inch: 6.1,
    battery_mah: 4005,
    ram_gb: 8,
    chipset: 'Apple A18 (3 nm)',
    cpu: 'Hexa-core (2x4.04 GHz + 4x2.20 GHz)',
    gpu: 'Apple GPU (4-core graphics)',
    os: 'iOS 18.3 (upgradable)',
    weight_g: 167,
    dimensions: '146.7 x 71.5 x 7.8 mm',
    resolution: '1170 x 2532 pixels (~460 ppi)',
    screen_type: 'Super Retina XDR OLED, HDR10, Dolby Vision, 1200 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera: '48 MP, f/1.6, 26mm (wide), PDAF, OIS',
    front_camera: '12 MP, f/1.9, 23mm (wide), PDAF + SL 3D',
    charging_w: 20,
    has_5g: true,
    release_date: 'February 2025',
    ip_rating: 'IP68 (6m up to 30 mins)',
  },
  'apple:iphone-16-plus': {
    screen_size_inch: 6.7,
    battery_mah: 4674,
    ram_gb: 8,
    chipset: 'Apple A18 (3 nm)',
    cpu: 'Hexa-core (2x4.04 GHz + 4x2.20 GHz)',
    gpu: 'Apple GPU (5-core graphics)',
    os: 'iOS 18 (upgradable)',
    weight_g: 199,
    dimensions: '160.9 x 77.8 x 7.8 mm',
    resolution: '1290 x 2796 pixels (~460 ppi)',
    screen_type: 'Super Retina XDR OLED, HDR10, Dolby Vision, 2000 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera: '48 MP, f/1.6 (wide, sensor-shift OIS)',
    second_camera: '12 MP, f/2.2 (ultrawide, PDAF)',
    front_camera: '12 MP, f/1.9 (wide, PDAF) + SL 3D',
    charging_w: 25,
    has_5g: true,
    release_date: 'September 2024',
    ip_rating: 'IP68 (6m up to 30 mins)',
  },
  'apple:iphone-15-pro-max': {
    screen_size_inch: 6.7,
    battery_mah: 4441,
    ram_gb: 8,
    chipset: 'Apple A17 Pro (3 nm)',
    cpu: 'Hexa-core (2x3.78 GHz + 4x2.11 GHz)',
    gpu: 'Apple GPU (6-core graphics)',
    os: 'iOS 17 (upgradable to iOS 18)',
    weight_g: 221,
    dimensions: '159.9 x 76.7 x 8.3 mm',
    resolution: '1290 x 2796 pixels (~460 ppi)',
    screen_type: 'LTPO Super Retina XDR OLED, 120Hz, HDR10, Dolby Vision, 2000 nits (HBM)',
    refresh_rate_hz: 120,
    rear_camera: '48 MP, f/1.8, 24mm (wide), dual pixel PDAF, sensor-shift OIS',
    second_camera:
      '12 MP, f/2.8, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
    third_camera: '12 MP, f/2.2, 13mm, 120˚ (ultrawide), dual pixel PDAF + TOF 3D LiDAR',
    front_camera: '12 MP, f/1.9, 23mm (wide), PDAF, OIS + SL 3D',
    charging_w: 27,
    has_5g: true,
    release_date: 'September 2023',
    ip_rating: 'IP68 (6m up to 30 mins)',
  },
  'apple:iphone-15': {
    screen_size_inch: 6.1,
    battery_mah: 3349,
    ram_gb: 6,
    chipset: 'Apple A16 Bionic (4 nm)',
    cpu: 'Hexa-core (2x3.46 GHz + 4x2.02 GHz)',
    gpu: 'Apple GPU (5-core graphics)',
    os: 'iOS 17 (upgradable to iOS 18)',
    weight_g: 171,
    dimensions: '147.6 x 71.6 x 7.8 mm',
    resolution: '1179 x 2556 pixels (~460 ppi)',
    screen_type: 'Super Retina XDR OLED, HDR10, 2000 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera: '48 MP, f/1.6 (wide, sensor-shift OIS)',
    second_camera: '12 MP, f/2.4 (ultrawide)',
    front_camera: '12 MP, f/1.9 (wide, PDAF) + SL 3D',
    charging_w: 20,
    has_5g: true,
    release_date: 'September 2023',
    ip_rating: 'IP68 (6m up to 30 mins)',
  },
  'samsung:galaxy-s24-ultra': {
    screen_size_inch: 6.8,
    battery_mah: 5000,
    ram_gb: 12,
    chipset: 'Qualcomm Snapdragon 8 Gen 3 for Galaxy (4 nm)',
    cpu: 'Octa-core (1x3.39GHz Cortex-X4 & 3x3.1GHz Cortex-A720 & 2x2.9GHz Cortex-A720 & 2x2.2GHz Cortex-A520)',
    gpu: 'Adreno 750 (1 GHz)',
    os: 'Android 14, One UI 6.1',
    weight_g: 232,
    dimensions: '162.3 x 79 x 8.6 mm',
    resolution: '1440 x 3120 pixels (~505 ppi)',
    screen_type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '200 MP, f/1.7, 24mm (wide), multi-directional PDAF, OIS',
    second_camera: '50 MP, f/3.4, 111mm (periscope telephoto), PDAF, OIS, 5x optical zoom',
    third_camera: '10 MP, f/2.4, 67mm (telephoto), Dual Pixel PDAF, OIS, 3x optical zoom',
    fourth_camera: '12 MP, f/2.2, 13mm, 120˚ (ultrawide), Dual Pixel PDAF',
    front_camera: '12 MP, f/2.2, 26mm (wide), Dual Pixel PDAF',
    charging_w: 45,
    has_5g: true,
    release_date: 'January 2024',
    ip_rating: 'IP68 (1.5m up to 30 mins)',
  },
  'samsung:galaxy-s25-ultra': {
    screen_size_inch: 6.9,
    battery_mah: 5000,
    ram_gb: 12,
    chipset: 'Qualcomm Snapdragon 8 Elite for Galaxy (3 nm)',
    cpu: 'Octa-core (2x4.47 GHz Oryon V2 Phoenix L + 6x3.53 GHz Oryon V2 Phoenix M)',
    gpu: 'Adreno 830',
    os: 'Android 15, One UI 7',
    weight_g: 218,
    dimensions: '162.8 x 77.6 x 8.2 mm',
    resolution: '1440 x 3120 pixels (~498 ppi)',
    screen_type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '200 MP, f/1.7, 24mm (wide), multi-directional PDAF, OIS',
    second_camera: '50 MP, f/3.4, 111mm (periscope telephoto), PDAF, OIS, 5x optical zoom',
    third_camera: '10 MP, f/2.4, 67mm (telephoto), Dual Pixel PDAF, OIS, 3x optical zoom',
    fourth_camera: '50 MP, f/1.9, 120˚ (ultrawide), Dual Pixel PDAF',
    front_camera: '12 MP, f/2.2, 26mm (wide), Dual Pixel PDAF',
    charging_w: 45,
    has_5g: true,
    release_date: 'January 2025',
    ip_rating: 'IP68 (1.5m up to 30 mins)',
  },
  'samsung:galaxy-a55': {
    screen_size_inch: 6.6,
    battery_mah: 5000,
    ram_gb: 8,
    chipset: 'Exynos 1480 (4 nm)',
    cpu: 'Octa-core (4x2.75 GHz Cortex-A78 & 4x2.0 GHz Cortex-A55)',
    gpu: 'Xclipse 530',
    os: 'Android 14, One UI 6.1',
    weight_g: 213,
    dimensions: '161.1 x 77.4 x 8.2 mm',
    resolution: '1080 x 2340 pixels (~390 ppi)',
    screen_type: 'Super AMOLED, 120Hz, HDR10+, 1000 nits (HBM)',
    refresh_rate_hz: 120,
    rear_camera: '50 MP, f/1.8 (wide), PDAF, OIS',
    second_camera: '12 MP, f/2.2, 123˚ (ultrawide)',
    third_camera: '5 MP, f/2.4 (macro)',
    front_camera: '32 MP, f/2.2, 26mm (wide)',
    charging_w: 25,
    has_5g: true,
    release_date: 'March 2024',
    ip_rating: 'IP67 (1m up to 30 mins)',
  },
  'xiaomi:14-ultra': {
    screen_size_inch: 6.73,
    battery_mah: 5000,
    ram_gb: 16,
    chipset: 'Qualcomm Snapdragon 8 Gen 3 (4 nm)',
    cpu: 'Octa-core (1x3.3 GHz Cortex-X4 & 3x3.2 GHz Cortex-A720 & 2x3.0 GHz Cortex-A720 & 2x2.3 GHz Cortex-A520)',
    gpu: 'Adreno 750',
    os: 'Android 14, HyperOS',
    weight_g: 219,
    dimensions: '161.4 x 75.3 x 9.2 mm',
    resolution: '1440 x 3200 pixels (~522 ppi)',
    screen_type: 'LTPO AMOLED, 68B colors, 120Hz, Dolby Vision, HDR10+, 3000 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '50 MP, f/1.6-f/4.0, 23mm (wide), 1.0"-type sensor, multi-directional PDAF, OIS',
    second_camera: '50 MP, f/1.8, 75mm (telephoto), PDAF, OIS, 3.2x optical zoom',
    third_camera: '50 MP, f/2.5, 120mm (periscope telephoto), PDAF, OIS, 5x optical zoom',
    fourth_camera: '50 MP, f/1.8, 12mm, 122˚ (ultrawide), Dual-Pixel PDAF',
    front_camera: '32 MP, f/2.0, 22mm (wide)',
    charging_w: 90,
    has_5g: true,
    release_date: 'February 2024',
    ip_rating: 'IP68 (1.5m up to 30 mins)',
  },
  'google:pixel-9-pro-xl': {
    screen_size_inch: 6.8,
    battery_mah: 5060,
    ram_gb: 16,
    chipset: 'Google Tensor G4 (4 nm)',
    cpu: 'Octa-core (1x3.1 GHz Cortex-X4 & 3x2.6 GHz Cortex-A720 & 4x1.92 GHz Cortex-A520)',
    gpu: 'Mali-G715 MC7',
    os: 'Android 14 (7 major upgrades)',
    weight_g: 221,
    dimensions: '162.8 x 76.6 x 8.5 mm',
    resolution: '1344 x 2992 pixels (~486 ppi)',
    screen_type: 'LTPO OLED, 120Hz, HDR10+, 3000 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '50 MP, f/1.7, 25mm (wide), multi-directional PDAF, OIS',
    second_camera:
      '48 MP, f/2.8, 113mm (periscope telephoto), Dual-Pixel PDAF, OIS, 5x optical zoom',
    third_camera: '48 MP, f/1.7, 123˚ (ultrawide), Dual-Pixel PDAF',
    front_camera: '42 MP, f/2.2, 17mm (ultrawide), PDAF',
    charging_w: 37,
    has_5g: true,
    release_date: 'August 2024',
    ip_rating: 'IP68 (1.5m up to 30 mins)',
  },
  'apple:ipad-pro-m4': {
    screen_size_inch: 11.0,
    battery_mah: 8160,
    ram_gb: 8,
    chipset: 'Apple M4 (3 nm)',
    cpu: '9-core / 10-core Apple Silicon M4',
    gpu: 'Apple 10-core GPU with hardware ray tracing',
    os: 'iPadOS 17.5 (upgradable to iPadOS 18)',
    weight_g: 444,
    dimensions: '249.7 x 177.5 x 5.3 mm',
    resolution: '1668 x 2420 pixels (~264 ppi)',
    screen_type: 'Ultra Retina XDR Tandem OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1600 nits',
    refresh_rate_hz: 120,
    rear_camera: '12 MP, f/1.8 (wide), dual pixel PDAF + TOF 3D LiDAR scanner',
    front_camera: '12 MP, f/2.4, 122˚ (ultrawide, Center Stage) + Face ID',
    charging_w: 30,
    has_5g: false,
    release_date: 'May 2024',
    ip_rating: 'Aluminum unibody',
  },
  'apple:macbook-air-m3': {
    screen_size_inch: 13.6,
    battery_mah: 4580,
    ram_gb: 16,
    chipset: 'Apple M3 (3 nm)',
    cpu: '8-core CPU (4 performance + 4 efficiency cores)',
    gpu: '10-core Apple M3 GPU',
    os: 'macOS Sequoia',
    weight_g: 1240,
    dimensions: '304.1 x 215 x 11.3 mm',
    resolution: '2560 x 1664 pixels (~224 ppi)',
    screen_type: 'Liquid Retina IPS, 500 nits, Wide color (P3), True Tone',
    refresh_rate_hz: 60,
    rear_camera: 'N/A',
    front_camera: '1080p FaceTime HD camera',
    charging_w: 70,
    has_5g: false,
    release_date: 'March 2024',
    ip_rating: 'Recycled aluminum enclosure',
  },
  'apple:watch-ultra-2': {
    screen_size_inch: 1.92,
    battery_mah: 564,
    ram_gb: 2,
    chipset: 'Apple S9 SiP (Dual-core 64-bit)',
    cpu: 'Dual-core + 4-core Neural Engine',
    gpu: 'PowerVR',
    os: 'watchOS 11',
    weight_g: 61.4,
    dimensions: '49 x 44 x 14.4 mm',
    resolution: '502 x 410 pixels (~338 ppi)',
    screen_type: 'Retina LTPO2 OLED, Sapphire crystal, 3000 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera: 'Optical Heart Sensor, ECG, Blood Oxygen, Depth Gauge',
    front_camera: 'N/A',
    charging_w: 15,
    has_5g: true,
    release_date: 'September 2023',
    ip_rating: 'IP6X + 100m water resistant (EN13319, MIL-STD 810H)',
    default_storage_gb: 64,
  },
  'apple:airpods-pro-2': {
    screen_size_inch: 1.0,
    battery_mah: 523,
    ram_gb: 1,
    chipset: 'Apple H2 headphone chip + Apple U1 chip (MagSafe Case)',
    cpu: 'Apple H2 custom acoustic DSP',
    gpu: 'N/A',
    os: 'iOS / macOS / Spatial Audio firmware',
    weight_g: 50.8,
    dimensions: '45.2 x 60.6 x 21.7 mm (Case)',
    resolution: 'Custom high-excursion Apple driver',
    screen_type: 'Active Noise Cancellation (2x ANC) + Adaptive Transparency',
    refresh_rate_hz: 60,
    rear_camera: 'Inward-facing microphone + skin-detect sensor',
    front_camera: 'Beamforming dual microphones',
    charging_w: 5,
    has_5g: false,
    release_date: 'September 2023',
    ip_rating: 'IP54 dust, sweat, and water resistant',
    default_storage_gb: 1,
  },
  'sony:wf-1000xm5': {
    screen_size_inch: 1.0,
    battery_mah: 500,
    ram_gb: 1,
    chipset: 'Sony Integrated Processor V2 + HD Noise Cancelling Processor QN2e',
    cpu: 'Dual-processor 24-bit Audio DSP',
    gpu: 'N/A',
    os: 'Sony Sound Connect (LDAC / Multipoint)',
    weight_g: 49,
    dimensions: '64.6 x 40.0 x 26.5 mm (Case)',
    resolution: '8.4 mm Dynamic Driver X (20Hz-40,000Hz LDAC)',
    screen_type: 'Industry-leading Dual-Processor ANC + Bone Conduction Sensor',
    refresh_rate_hz: 60,
    rear_camera: 'Dual feedback microphones per earbud',
    second_camera: 'Feed-forward & feedback 6-mic array',
    front_camera: 'Bone conduction sensor + Wind noise reduction',
    charging_w: 5,
    has_5g: false,
    release_date: 'July 2023',
    ip_rating: 'IPX4 water resistant',
    default_storage_gb: 1,
  },
  'samsung:galaxy-tab-s10-ultra': {
    screen_size_inch: 14.6,
    battery_mah: 11200,
    ram_gb: 12,
    chipset: 'MediaTek Dimensity 9300+ (4 nm)',
    cpu: 'Octa-core (1x3.4 GHz Cortex-X4 & 3x2.8 GHz Cortex-X4 & 4x2.0 GHz Cortex-A720)',
    gpu: 'Immortalis-G720 MC12',
    os: 'Android 14, One UI 6.1.1 (Galaxy AI)',
    weight_g: 718,
    dimensions: '326.4 x 208.6 x 5.4 mm',
    resolution: '1848 x 2960 pixels (~239 ppi)',
    screen_type: 'Dynamic AMOLED 2X, 120Hz, HDR10+, Anti-Reflection coating',
    refresh_rate_hz: 120,
    rear_camera: '13 MP, f/2.0, 26mm (wide), AF',
    second_camera: '8 MP, f/2.2 (ultrawide)',
    front_camera: '12 MP, f/2.2 (wide) + 12 MP, f/2.4, 120˚ (ultrawide)',
    charging_w: 45,
    has_5g: true,
    release_date: 'September 2024',
    ip_rating: 'IP68 dust/water resistant (1.5m for 30 min) + Enhanced Armor Aluminum',
    default_storage_gb: 256,
  },
  'xiaomi:pad-6s-pro': {
    screen_size_inch: 12.4,
    battery_mah: 10000,
    ram_gb: 8,
    chipset: 'Qualcomm SM8550-AB Snapdragon 8 Gen 2 (4 nm)',
    cpu: 'Octa-core (1x3.2 GHz Cortex-X3 & 4x2.8 GHz & 3x2.0 GHz)',
    gpu: 'Adreno 740',
    os: 'Android 14, HyperOS',
    weight_g: 590,
    dimensions: '278.7 x 191.6 x 6.3 mm',
    resolution: '2032 x 3048 pixels, 3:2 ratio (~295 ppi)',
    screen_type: 'IPS LCD, 68B colors, 144Hz, HDR10, Dolby Vision, 900 nits',
    refresh_rate_hz: 144,
    rear_camera: '50 MP, f/1.8 (wide), PDAF',
    second_camera: '2 MP, f/2.4 (depth)',
    front_camera: '32 MP, f/2.2 (wide, FocusFrame)',
    charging_w: 120,
    has_5g: false,
    release_date: 'February 2024',
    ip_rating: 'All-metal unibody, Corning Gorilla Glass 5',
    default_storage_gb: 256,
  },
  'asus:zenbook-s-14': {
    screen_size_inch: 14.0,
    battery_mah: 6200,
    ram_gb: 32,
    chipset: 'Intel Core Ultra 7 258V (Lunar Lake, 47 TOPS NPU)',
    cpu: '8-core (4 P-cores + 4 LPE-cores, up to 4.8 GHz)',
    gpu: 'Intel Arc 140V GPU',
    os: 'Windows 11 Home Copilot+ PC',
    weight_g: 1200,
    dimensions: '310.3 x 214.7 x 11.9 mm',
    resolution: '2880 x 1800 pixels, 16:10 (3K Lumina OLED)',
    screen_type: 'ASUS Lumina OLED, 120Hz, 100% DCI-P3, DisplayHDR True Black 500',
    refresh_rate_hz: 120,
    rear_camera: 'Ambient light & color sensor + Dual-fan vapor chamber thermal array',
    second_camera: 'IR depth camera for Windows Hello facial recognition',
    front_camera: '1080p FHD AiSense IR Webcam with privacy shutter',
    charging_w: 65,
    has_5g: false,
    release_date: 'September 2024',
    ip_rating: 'Ceraluminum chassis, MIL-STD 810H military-grade standard',
    default_storage_gb: 1024,
  },
  'lenovo:thinkpad-x1-carbon-gen-12': {
    screen_size_inch: 14.0,
    battery_mah: 4900,
    ram_gb: 32,
    chipset: 'Intel Core Ultra 7 155U / 165U (Intel AI Boost NPU)',
    cpu: '12-core (2 P-cores + 8 E-cores + 2 LPE-cores, up to 4.8 GHz)',
    gpu: 'Intel Graphics (Integrated)',
    os: 'Windows 11 Pro 64-bit',
    weight_g: 1090,
    dimensions: '312.8 x 214.75 x 14.96 mm',
    resolution: '2880 x 1800 pixels, 16:10 (2.8K OLED Anti-Glare)',
    screen_type: '2.8K OLED, 120Hz, 400 nits, 100% DCI-P3, Dolby Vision, Eyesafe',
    refresh_rate_hz: 120,
    rear_camera: 'Ultrasonic human presence detection & PrivacyGuard sensor',
    second_camera: 'Discrete IR camera for Windows Hello + ThinkShutter',
    front_camera: 'FHD 1080p MIPI + IR discrete camera with physical shutter',
    charging_w: 65,
    has_5g: false,
    release_date: 'March 2024',
    ip_rating: 'Carbon fiber weave top + recycled magnesium chassis, MIL-STD-810H',
    default_storage_gb: 512,
  },
  'samsung:galaxy-watch-ultra': {
    screen_size_inch: 1.5,
    battery_mah: 590,
    ram_gb: 2,
    chipset: 'Samsung Exynos W1000 (3 nm GAA)',
    cpu: 'Penta-core (1x1.6 GHz Cortex-A78 & 4x1.5 GHz Cortex-A55)',
    gpu: 'Mali-G68 MP2',
    os: 'Wear OS 5, One UI Watch 6',
    weight_g: 60.5,
    dimensions: '47.4 x 47.4 x 12.1 mm',
    resolution: '480 x 480 pixels (~327 ppi)',
    screen_type: 'Super AMOLED, Sapphire crystal glass, 3000 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera: 'Samsung BioActive Sensor (Optical Bio-signal + Electrical Heart Signal + BIA)',
    second_camera: 'Infrared Temperature Sensor + Barometer + Altimeter',
    front_camera: 'Ambient Light Sensor + Quick Button + 86dB Emergency Siren',
    charging_w: 10,
    has_5g: false,
    release_date: 'July 2024',
    ip_rating: 'IP68 + 10ATM water resistant (100m, MIL-STD-810H, Titanium Grade 4)',
    default_storage_gb: 32,
  },
  'garmin:forerunner-265': {
    screen_size_inch: 1.3,
    battery_mah: 410,
    ram_gb: 1,
    chipset: 'Garmin Ultra-Low-Power Sports SoC + Multi-Band SatIQ GNSS',
    cpu: 'Garmin Dual-Core RTOS + Firstbeat Analytics Engine',
    gpu: 'AMOLED Display Controller',
    os: 'Garmin OS (Connect IQ)',
    weight_g: 47,
    dimensions: '46.1 x 46.1 x 12.9 mm',
    resolution: '416 x 416 pixels',
    screen_type: 'AMOLED Touchscreen, Corning Gorilla Glass 3, Always-On Option',
    refresh_rate_hz: 60,
    rear_camera: 'Garmin Elevate Gen 4 Optical Heart Rate + Pulse Ox Blood Oxygen Sensor',
    second_camera: 'Barometric Altimeter + Compass + Gyroscope + Thermometer',
    front_camera: '5-Button Physical Lap/Start Control + AMOLED Touch',
    charging_w: 5,
    has_5g: false,
    release_date: 'March 2023',
    ip_rating: '5 ATM water resistant (50m swim-ready, fiber-reinforced polymer)',
    default_storage_gb: 8,
  },
  'samsung:galaxy-buds3-pro': {
    screen_size_inch: 1.0,
    battery_mah: 515,
    ram_gb: 1,
    chipset: 'Samsung Proprietary Bluetooth 5.4 SoC + Dual Amplifier',
    cpu: 'Galaxy AI Adaptive ANC & Real-Time Interpreter DSP',
    gpu: 'Blade Lights LED Controller',
    os: 'Galaxy Wearable (SSC UHQ 24-bit/96kHz)',
    weight_g: 57.4,
    dimensions: '48.7 x 58.9 x 24.4 mm (Case)',
    resolution: 'Enhanced 2-Way Speaker (10.5mm Dynamic + 6.1mm Planar Tweeter)',
    screen_type: 'Blade Lights LED Indicator + Transparent Cradle Lid',
    refresh_rate_hz: 60,
    rear_camera: '3 High-SNR Microphones + VPU (Voice Pickup Unit)',
    second_camera: 'In-canal feedback mic + Siren/Voice Detect AI sensor',
    front_camera: 'Pinch & Swipe Blade Touch Controls',
    charging_w: 5,
    has_5g: false,
    release_date: 'July 2024',
    ip_rating: 'IP57 dust and water resistant (1m up to 30 mins)',
    default_storage_gb: 1,
  },
  // === 2026 Flagship Lineup (Smartphones, Tablets, Laptops, Smartwatches, Earbuds) ===
  'xiaomi:18-pro-max': {
    screen_size_inch: 6.9,
    battery_mah: 6500,
    ram_gb: 16,
    chipset: 'Qualcomm Snapdragon 8 Elite Gen 2 (2 nm)',
    cpu: 'Octa-core (2x4.60 GHz Oryon V2 Phoenix L + 6x3.80 GHz Oryon V2 Phoenix M)',
    gpu: 'Adreno 840',
    os: 'Android 16, HyperOS 3',
    weight_g: 226,
    dimensions: '162.8 x 77.2 x 8.4 mm',
    resolution: '1440 x 3200 pixels (~510 ppi) + 2.1" Rear LTPO AMOLED',
    screen_type: 'LTPO AMOLED, 68B colors, 120Hz, Dolby Vision, HDR10+, 3500 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '50 MP, f/1.4-4.0, 23mm (wide), 1.0"-type LYT-900, variable aperture, OIS',
    second_camera:
      '200 MP, f/2.6, 100mm (periscope telephoto), multi-directional PDAF, OIS, 4.3x optical zoom',
    third_camera: '50 MP, f/1.8, 14mm, 115˚ (ultrawide), dual pixel PDAF',
    front_camera: '32 MP, f/2.0, 22mm (wide), HDR, 4K@60fps',
    charging_w: 120,
    has_5g: true,
    release_date: 'September 2026',
    ip_rating: 'IP68/IP69 dust/water resistant (high-pressure water jets; immersible up to 2m)',
    default_storage_gb: 512,
  },
  'xiaomi:17-pro-max': {
    screen_size_inch: 6.85,
    battery_mah: 6200,
    ram_gb: 16,
    chipset: 'Qualcomm Snapdragon 8 Elite (3 nm)',
    cpu: 'Octa-core (2x4.32 GHz Oryon V2 + 6x3.53 GHz Oryon V2)',
    gpu: 'Adreno 830',
    os: 'Android 16, HyperOS 3',
    weight_g: 222,
    dimensions: '162.5 x 76.8 x 8.3 mm',
    resolution: '1440 x 3200 pixels (~512 ppi) + Rear Secondary Display',
    screen_type: 'LTPO AMOLED, 120Hz, Dolby Vision, HDR10+, 3200 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '50 MP, f/1.6, 23mm (wide), Light Fusion 900, dual pixel PDAF, OIS',
    second_camera: '50 MP, f/2.6, 115mm (periscope telephoto), PDAF, OIS, 5x optical zoom',
    third_camera: '50 MP, f/2.2, 14mm (ultrawide), PDAF',
    front_camera: '32 MP, f/2.0, 22mm (wide), 4K@60fps',
    charging_w: 100,
    has_5g: true,
    release_date: 'September 2025',
    ip_rating: 'IP68 dust/water resistant (up to 1.5m for 30 min)',
    default_storage_gb: 512,
  },
  'apple:iphone-18-pro-max': {
    screen_size_inch: 6.9,
    battery_mah: 4950,
    ram_gb: 12,
    chipset: 'Apple A20 Pro (2 nm TSMC N2)',
    cpu: 'Hexa-core (2x4.40 GHz + 4x2.85 GHz)',
    gpu: 'Apple GPU (6-core graphics with hardware ray tracing)',
    os: 'iOS 20',
    weight_g: 225,
    dimensions: '163.0 x 77.6 x 8.2 mm',
    resolution: '1320 x 2868 pixels (~460 ppi)',
    screen_type:
      'LTPO Super Retina XDR OLED, 120Hz ProMotion, Under-Display Face ID, 3000 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '48 MP, f/1.4-2.8, 24mm (wide), variable aperture, sensor-shift OIS',
    second_camera:
      '48 MP, f/2.6, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
    third_camera: '48 MP, f/2.0, 13mm (ultrawide), PDAF + TOF 3D LiDAR scanner',
    front_camera: '24 MP, f/1.9, 23mm (wide), PDAF, OIS + Under-Display SL 3D',
    charging_w: 45,
    has_5g: true,
    release_date: 'September 2026',
    ip_rating: 'IP68 dust/water resistant (up to 6m for 30 min)',
    default_storage_gb: 256,
  },
  'apple:iphone-18-pro': {
    screen_size_inch: 6.3,
    battery_mah: 3850,
    ram_gb: 12,
    chipset: 'Apple A20 Pro (2 nm TSMC N2)',
    cpu: 'Hexa-core (2x4.40 GHz + 4x2.85 GHz)',
    gpu: 'Apple GPU (6-core graphics with hardware ray tracing)',
    os: 'iOS 20',
    weight_g: 198,
    dimensions: '149.6 x 71.5 x 8.2 mm',
    resolution: '1206 x 2622 pixels (~460 ppi)',
    screen_type:
      'LTPO Super Retina XDR OLED, 120Hz ProMotion, Under-Display Face ID, 3000 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '48 MP, f/1.4-2.8, 24mm (wide), variable aperture, sensor-shift OIS',
    second_camera:
      '48 MP, f/2.6, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
    third_camera: '48 MP, f/2.0, 13mm (ultrawide), PDAF + TOF 3D LiDAR scanner',
    front_camera: '24 MP, f/1.9, 23mm (wide), PDAF, OIS + Under-Display SL 3D',
    charging_w: 40,
    has_5g: true,
    release_date: 'September 2026',
    ip_rating: 'IP68 dust/water resistant (up to 6m for 30 min)',
    default_storage_gb: 256,
  },
  'samsung:galaxy-s26-ultra': {
    screen_size_inch: 6.9,
    battery_mah: 5500,
    ram_gb: 16,
    chipset: 'Qualcomm Snapdragon 8 Elite Gen 2 for Galaxy (2 nm)',
    cpu: 'Octa-core (2x4.74 GHz Oryon V2 + 6x3.85 GHz Oryon V2)',
    gpu: 'Adreno 840 (for Galaxy)',
    os: 'Android 16, One UI 8.1',
    weight_g: 218,
    dimensions: '162.6 x 77.6 x 8.1 mm',
    resolution: '1440 x 3120 pixels (~505 ppi)',
    screen_type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, Gorilla Armor 2, 3200 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '200 MP, f/1.6, 23mm (wide), ISOCELL HP9, multi-directional PDAF, OIS',
    second_camera: '50 MP, f/3.2, 115mm (periscope telephoto), PDAF, OIS, 5x optical zoom',
    third_camera: '50 MP, f/2.4, 67mm (telephoto), PDAF, OIS, 3x optical zoom',
    fourth_camera: '50 MP, f/1.9, 13mm, 120˚ (ultrawide), Dual Pixel PDAF, Super Steady video',
    front_camera: '12 MP, f/2.2, 26mm (wide), Dual Pixel PDAF',
    charging_w: 65,
    has_5g: true,
    release_date: 'February 2026',
    ip_rating: 'IP68 dust/water resistant (up to 1.5m for 30 min, Titanium Grade 5 + S Pen)',
    default_storage_gb: 256,
  },
  'oppo:find-x9-pro': {
    screen_size_inch: 6.82,
    battery_mah: 6100,
    ram_gb: 16,
    chipset: 'MediaTek Dimensity 9500 (3 nm)',
    cpu: 'Octa-core (1x4.10 GHz Cortex-X930 + 3x3.50 GHz Cortex-X4 + 4x2.40 GHz Cortex-A725)',
    gpu: 'Immortalis-G935 MC12',
    os: 'Android 16, ColorOS 16',
    weight_g: 215,
    dimensions: '162.2 x 75.8 x 8.2 mm',
    resolution: '1264 x 2780 pixels (~450 ppi)',
    screen_type: 'LTPO AMOLED, 1B colors, 120Hz, Dolby Vision, HDR10+, 4500 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '50 MP, f/1.6, 23mm (wide), Sony LYT-900, multi-directional PDAF, OIS',
    second_camera:
      '200 MP, f/2.6, 85mm (periscope telephoto), Hasselblad Portrait, OIS, 3.7x optical zoom',
    third_camera: '50 MP, f/2.0, 15mm, 120˚ (ultrawide), PDAF',
    front_camera: '32 MP, f/2.4, 21mm (wide), PDAF, 4K@60fps',
    charging_w: 100,
    has_5g: true,
    release_date: 'October 2025',
    ip_rating: 'IP68/IP69 dust/water resistant (high-pressure water jets; immersible up to 1.5m)',
    default_storage_gb: 512,
  },
  'apple:ipad-pro-m5': {
    screen_size_inch: 11.1,
    battery_mah: 8300,
    ram_gb: 16,
    chipset: 'Apple M5 (3 nm TSMC N3P)',
    cpu: '10-core CPU (4 performance + 6 efficiency cores) + 16-core Neural Engine',
    gpu: 'Apple M5 10-core GPU with Hardware Ray Tracing',
    os: 'iPadOS 19',
    weight_g: 442,
    dimensions: '249.7 x 177.5 x 5.3 mm',
    resolution: '2420 x 1668 pixels (~264 ppi)',
    screen_type:
      'Ultra Retina XDR Tandem OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1600 nits (peak)',
    refresh_rate_hz: 120,
    rear_camera: '12 MP, f/1.8, (wide), dual pixel PDAF + TOF 3D LiDAR scanner',
    second_camera: 'Adaptive True Tone Flash for document scanning',
    front_camera: '12 MP, f/2.0, 122˚ (Landscape Center Stage Ultra-Wide) + Face ID',
    charging_w: 35,
    has_5g: true,
    release_date: 'October 2025',
    ip_rating: '5.3mm Ultra-thin 100% recycled aluminum enclosure',
    default_storage_gb: 256,
  },
  'xiaomi:pad-7-pro': {
    screen_size_inch: 11.2,
    battery_mah: 8850,
    ram_gb: 12,
    chipset: 'Qualcomm Snapdragon 8s Gen 3 (4 nm)',
    cpu: 'Octa-core (1x3.0 GHz Cortex-X4 + 4x2.8 GHz Cortex-A720 + 3x2.0 GHz Cortex-A520)',
    gpu: 'Adreno 735',
    os: 'Android 15, HyperOS 2',
    weight_g: 500,
    dimensions: '251.2 x 173.4 x 6.2 mm',
    resolution: '3200 x 2136 pixels, 3:2 ratio (~345 ppi)',
    screen_type: '3.2K IPS LCD, 68B colors, 144Hz, HDR10, Dolby Vision, 800 nits (peak)',
    refresh_rate_hz: 144,
    rear_camera: '50 MP, f/1.8, (wide), 1/2.76", PDAF, 4K@60fps',
    second_camera: '2 MP, f/2.4, (depth)',
    front_camera: '32 MP, f/2.2, 19mm (ultrawide FocusFrame)',
    charging_w: 67,
    has_5g: false,
    release_date: 'October 2024',
    ip_rating: 'Unibody aluminum alloy frame, 6.18mm slim profile',
    default_storage_gb: 256,
  },
  'apple:macbook-air-m4': {
    screen_size_inch: 13.6,
    battery_mah: 5260,
    ram_gb: 16,
    chipset: 'Apple M4 (3 nm)',
    cpu: '10-core CPU (4 performance + 6 efficiency cores) + 16-core Neural Engine',
    gpu: 'Apple M4 10-core GPU with Hardware Ray Tracing',
    os: 'macOS Sequoia',
    weight_g: 1240,
    dimensions: '304.1 x 215.0 x 11.3 mm',
    resolution: '2560 x 1664 pixels (~224 ppi)',
    screen_type: 'Liquid Retina IPS, 500 nits, Wide color (P3), True Tone',
    refresh_rate_hz: 60,
    rear_camera: 'Dual external 6K display support with lid open + MagSafe 3',
    second_camera: '3-mic array with directional beamforming & Voice Isolation',
    front_camera: '12MP Center Stage camera with Desk View (1080p HD)',
    charging_w: 70,
    has_5g: false,
    release_date: 'March 2025',
    ip_rating: 'Fanless silent 100% recycled aluminum unibody enclosure',
    default_storage_gb: 256,
  },
  'apple:macbook-pro-m4-pro': {
    screen_size_inch: 14.2,
    battery_mah: 7240,
    ram_gb: 24,
    chipset: 'Apple M4 Pro (3 nm)',
    cpu: '12-core CPU (8 performance + 4 efficiency cores) + 16-core Neural Engine',
    gpu: 'Apple M4 Pro 16-core GPU (273GB/s unified memory bandwidth)',
    os: 'macOS Sequoia',
    weight_g: 1600,
    dimensions: '312.6 x 221.2 x 15.5 mm',
    resolution: '3024 x 1964 pixels (~254 ppi)',
    screen_type:
      'Liquid Retina XDR mini-LED, 120Hz ProMotion, 1600 nits (HDR peak), 1000 nits (SDR outdoor)',
    refresh_rate_hz: 120,
    rear_camera: '3x Thunderbolt 5 (120Gb/s) + HDMI 2.1 + SDXC + MagSafe 3',
    second_camera:
      'Studio-quality 3-mic array + 6-speaker sound system with force-cancelling woofers',
    front_camera: '12MP Center Stage camera with Desk View (1080p HD)',
    charging_w: 96,
    has_5g: false,
    release_date: 'November 2024',
    ip_rating: 'Precision-machined aluminum enclosure (Space Black anodized seal)',
    default_storage_gb: 512,
  },
  'apple:watch-series-11': {
    screen_size_inch: 1.96,
    battery_mah: 345,
    ram_gb: 2,
    chipset: 'Apple S11 SiP (64-bit dual-core + 4-core Neural Engine)',
    cpu: 'Dual-core S11 SiP + 2nd-gen Ultra Wideband (UWB) chip',
    gpu: 'Apple Watch GPU',
    os: 'watchOS 12',
    weight_g: 35.8,
    dimensions: '46 x 39 x 9.5 mm',
    resolution: '496 x 416 pixels (~326 ppi)',
    screen_type: 'Wide-angle LTPO3 OLED Always-On Retina, 2200 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera:
      '3rd-gen Optical Heart Sensor + Electrical Heart Sensor (ECG) + Sleep Apnea Detection',
    second_camera: 'Depth gauge (6m) + Water temperature sensor + Wrist temperature sensor',
    front_camera: 'Double Tap gesture + Digital Crown with haptic feedback',
    charging_w: 15,
    has_5g: false,
    release_date: 'September 2025',
    ip_rating: 'IP6X dust resistant + WR50 water resistant (50m swimproof)',
    default_storage_gb: 64,
  },
  'apple:watch-ultra-3': {
    screen_size_inch: 1.98,
    battery_mah: 580,
    ram_gb: 2,
    chipset: 'Apple S11 SiP + Satellite Emergency SOS & 5G RedCap Modem',
    cpu: 'Dual-core S11 SiP + 4-core Neural Engine + Precision Dual-Frequency GPS (L1 + L5)',
    gpu: 'Apple Watch GPU',
    os: 'watchOS 12',
    weight_g: 61.2,
    dimensions: '49 x 44 x 14.2 mm',
    resolution: '502 x 410 pixels (~338 ppi)',
    screen_type: 'LTPO3 OLED Always-On Retina, Flat Sapphire Crystal, 3200 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera:
      '3rd-gen Optical Heart + ECG + Blood Pressure Trend Alert + Oceanic+ Dive Computer',
    second_camera: 'Depth gauge (40m EN13319 certified) + 86dB Emergency Siren',
    front_camera: 'Customizable Action Button + Titanium Crown Guard',
    charging_w: 18,
    has_5g: true,
    release_date: 'September 2025',
    ip_rating: 'IP6X + WR100 (100m water resistant, MIL-STD 810H, Aerospace Grade 5 Titanium)',
    default_storage_gb: 64,
  },
  'apple:airpods-pro-3': {
    screen_size_inch: 1.0,
    battery_mah: 540,
    ram_gb: 1,
    chipset: 'Apple H3 Headphone Chip + U2 Ultra Wideband (MagSafe Case)',
    cpu: 'Apple H3 Ultra-Low-Latency Audio DSP (96kHz/24-bit Lossless)',
    gpu: 'Acoustic & Heart-Rate Biosensor Co-Processor',
    os: 'Apple AudioOS (Hearing Health & Live Translation AI)',
    weight_g: 50.2,
    dimensions: '45.2 x 60.6 x 21.7 mm (USB-C MagSafe Case)',
    resolution: 'Custom High-Excursion Apple Driver + High Dynamic Range Amplifier',
    screen_type: 'Status LED + Built-in Find My Precision Speaker',
    refresh_rate_hz: 60,
    rear_camera: 'In-Ear Optical Heart-Rate & Body Temperature Sensor + 3x ANC Pro vs Gen 1',
    second_camera: 'Clinical-Grade Hearing Aid Mode + Conversation Awareness + Voice Isolation',
    front_camera: 'Capacitive Touch Stem (Swipe Volume + Press Control)',
    charging_w: 5,
    has_5g: false,
    release_date: 'September 2025',
    ip_rating: 'IP54 dust, sweat, and water resistant (earbuds and MagSafe charging case)',
    default_storage_gb: 1,
  },
  'sony:wf-1000xm6': {
    screen_size_inch: 1.0,
    battery_mah: 550,
    ram_gb: 1,
    chipset: 'Sony Integrated Processor V3 + QN3e HD Noise Cancelling Processor',
    cpu: 'Dual-Processor 24-bit Audio Signal Processing + DSEE Ultimate AI',
    gpu: 'LE Audio LC3 & LDAC High-Bitrate Controller',
    os: 'Sony Sound Connect (LDAC 990kbps / 360 Reality Audio)',
    weight_g: 46.8,
    dimensions: '64.0 x 40.0 x 25.8 mm (Qi Wireless Case)',
    resolution: '8.4mm Dynamic Driver X (Dual-layer dome-edge diaphragm)',
    screen_type: 'Recessed Matte Acoustic Chassis + Multi-Point Status LED',
    refresh_rate_hz: 60,
    rear_camera: 'Dual Feedback + Feedforward 6-Mic Array + Bone Conduction Sensor',
    second_camera: 'AI Beamforming Wind Noise Reduction + Speak-to-Chat + Head Gesture Control',
    front_camera: 'Customizable Capacitive Touch Panels (L/R)',
    charging_w: 5,
    has_5g: false,
    release_date: 'June 2025',
    ip_rating: 'IPX4 splash and sweat resistant + Polyurethane Noise Isolation Tips',
    default_storage_gb: 1,
  },
};

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

export class ProductNormalizer {
  /**
   * Normalizes raw Shopee product into canonical master product candidate across all 5 categories
   */
  public normalize(raw: ShopeeProduct): NormalizedProductCandidate {
    const title = raw.title;
    const categorySlug = detectCategorySlug(title);

    // 1. Extract Brand
    let brand = 'Khác';
    if (/apple|iphone|ipad|macbook|airpods/i.test(title)) brand = 'Apple';
    else if (/samsung|galaxy/i.test(title)) brand = 'Samsung';
    else if (/xiaomi|redmi|poco/i.test(title)) brand = 'Xiaomi';
    else if (/\bsony\b|wf-1000|wh-1000|xperia/i.test(title)) brand = 'Sony';
    else if (/\bgarmin\b|forerunner|fenix|venu/i.test(title)) brand = 'Garmin';
    else if (/\blenovo\b|thinkpad|ideapad|legion/i.test(title)) brand = 'Lenovo';
    else if (/oppo/i.test(title)) brand = 'OPPO';
    else if (/vivo/i.test(title)) brand = 'Vivo';
    else if (/realme/i.test(title)) brand = 'Realme';
    else if (/google|pixel/i.test(title)) brand = 'Google';
    else if (/\basus\b|\brog\b|zenbook|vivobook|tuf\s*gaming/i.test(title)) brand = 'Asus';
    else if (/\bdell\b|inspiron|\bxps\b|alienware|latitude/i.test(title)) brand = 'Dell';
    else if (/\bhp\b|pavilion|victus|omen|elitebook|envy/i.test(title)) brand = 'HP';
    else if (/\bacer\b|nitro\s*\d|swift|predator|aspire/i.test(title)) brand = 'Acer';
    else if (/\bmsi\b|katana|cyborg|stealth|prestige/i.test(title)) brand = 'MSI';
    else if (/\bhuawei\b|matepad|freebuds|watch\s*gt/i.test(title)) brand = 'Huawei';
    else if (/\bbose\b|quietcomfort/i.test(title)) brand = 'Bose';
    else if (/\bjbl\b|tour\s*pro|tune\s*\d+/i.test(title)) brand = 'JBL';
    else if (/sennheiser|momentum/i.test(title)) brand = 'Sennheiser';
    else if (/oneplus/i.test(title)) brand = 'OnePlus';
    else if (/\bhonor\b|magicbook/i.test(title)) brand = 'Honor';

    // 2. Extract Model
    let model = '';
    if (brand === 'Apple') {
      const iphoneMatch = title.match(
        /iphone\s*(\d+e\b|\d+(?:\s*(?:pro\s*max|pro|plus|mini|air))?|se(?:\s*(?:\(?\s*(?:2020|2022|2025)\s*\)?|(?:gen\s*)?[234]\b))?)/i
      );
      const ipadMatch = title.match(/ipad\s*(pro\s*m\d+|air\s*m\d+|pro|air|mini|\d+)/i);
      const macbookMatch = title.match(
        /macbook\s*(pro\s*m\d+(?:\s*(?:pro|max))?|air\s*m\d+|air|pro)/i
      );
      const watchMatch = title.match(
        /(?:apple\s*)?watch\s*(ultra\s*\d+|series\s*\d+|se(?:\s*\d+)?)/i
      );
      const airpodsMatch = title.match(
        // Each run of spaces has exactly one `\s*` that can match it, so long
        // whitespace cannot backtrack polynomially (CodeQL js/polynomial-redos).
        /airpods\s*(?:(pro)(?:\s*(?:(?:gen|thế\s*hệ)\s*)?(\d+))?|(max)|(?:(?:gen|thế\s*hệ)\s*)?(\d+))/i
      );

      // Retail titles often put the chip after the screen size ("iPad Pro 11 inch M4",
      // "MacBook Air 13 inch M3"); pick it up wherever it sits.
      const chipMatch = title.match(/\b(M\d)(?:\s+(Pro|Max))?\b/i);
      const chip = chipMatch ? chipMatch[1].toUpperCase() : '';

      if (iphoneMatch && iphoneMatch[1]) {
        const normalizedIphoneSuffix = iphoneMatch[1]
          .replace(/[()]/g, ' ')
          .replace(/\bgen\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/^se\b/i, 'SE');
        model = `iPhone ${normalizedIphoneSuffix}`;
      } else if (ipadMatch && ipadMatch[1]) {
        const line = ipadMatch[1].trim();
        model = /^(pro|air)$/i.test(line) && chip ? `iPad ${line} ${chip}` : `iPad ${line}`;
      } else if (macbookMatch && macbookMatch[1]) {
        const line = macbookMatch[1].trim();
        model =
          /^(pro|air)$/i.test(line) && chip
            ? `MacBook ${line} ${chip}${chipMatch?.[2] ? ` ${chipMatch[2]}` : ''}`
            : `MacBook ${line}`;
      } else if (watchMatch && watchMatch[1]) {
        model = `Watch ${watchMatch[1].trim()}`;
      } else if (airpodsMatch) {
        if (airpodsMatch[1]) {
          model = `AirPods Pro${airpodsMatch[2] ? ` ${airpodsMatch[2]}` : ''}`;
        } else if (airpodsMatch[3]) {
          model = 'AirPods Max';
        } else if (airpodsMatch[4]) {
          model = `AirPods ${airpodsMatch[4]}`;
        } else {
          model = 'AirPods';
        }
      } else {
        model = 'iPhone';
      }
    } else if (brand === 'Sony' && /wf-1000xm(\d+)/i.test(title)) {
      const m = title.match(/wf-1000xm(\d+)/i);
      model = `WF-1000XM${m?.[1] || '5'}`;
    } else if (brand === 'Sony' && /wh-1000xm(\d+)/i.test(title)) {
      const m = title.match(/wh-1000xm(\d+)/i);
      model = `WH-1000XM${m?.[1] || '5'}`;
    } else if (brand === 'Asus' && /zenbook\s*s\s*14/i.test(title)) {
      model = 'Zenbook S 14';
    } else if (brand === 'Lenovo' && /thinkpad\s*x1\s*carbon\s*gen\s*12/i.test(title)) {
      model = 'ThinkPad X1 Carbon Gen 12';
    } else if (brand === 'Garmin' && /forerunner\s*265/i.test(title)) {
      model = 'Forerunner 265';
    } else if (brand === 'Samsung' && /galaxy\s*watch\s*ultra/i.test(title)) {
      model = 'Galaxy Watch Ultra';
    } else if (brand === 'Samsung' && /galaxy\s*buds\s*3\s*pro/i.test(title)) {
      model = 'Galaxy Buds3 Pro';
    } else if (brand === 'Samsung' && /galaxy\s*tab\s*s10\s*ultra/i.test(title)) {
      model = 'Galaxy Tab S10 Ultra';
    } else if (brand === 'Xiaomi' && /pad\s*6s\s*pro/i.test(title)) {
      model = 'Pad 6S Pro';
    } else if (brand === 'Xiaomi' && /pad\s*7\s*pro/i.test(title)) {
      model = 'Pad 7 Pro';
    } else {
      const withoutLeadingPromo = title
        .replace(/^(?:\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】)\s*)+/, '')
        .trim();
      const cleaned = withoutLeadingPromo
        .replace(
          new RegExp(
            `^(?:(?:Hàng\\s*)?Chính\\s*hãng\\s+)?(?:Điện thoại(?:\\s*thông\\s*minh|\\s*di\\s*động)?|Smartphone|Máy tính bảng|Tablet|Laptop|Máy tính xách tay|Đồng hồ thông minh|Smartwatch|Tai nghe(?:\\s*Bluetooth|\\s*chống\\s*ồn|\\s*không\\s*dây)?|Earbuds)?\\s*(?:(?:Hàng\\s*)?Chính\\s*hãng\\s+)?(?:${brand}\\b\\s*)?`,
            'i'
          ),
          ''
        )
        .replace(/^(?:\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】)\s*)+/, '')
        .trim();
      const rawTokens = cleaned.split(/\s+/).filter(Boolean);
      const modelTokens: string[] = [];
      for (const tok of rawTokens) {
        if (modelTokens.length >= 4) break;
        if (
          /^(?:\d+(?:[.,]\d+)?(?:GB|TB)|\d+\/\d+(?:GB|TB)?|\d{2}mm|5G|4G|LTE|GPS|RAM|ROM|OLED|WiFi|Chính|Quốc|Bản|Mới|Fullbox|Likenew|Like|Cũ|99%|98%|VN\/A|VNA|LL\/A|\(|\[|-)/i.test(
            tok
          )
        ) {
          break;
        }
        modelTokens.push(tok);
      }
      model = modelTokens.length > 0 ? modelTokens.join(' ') : rawTokens.slice(0, 2).join(' ');
    }

    // 3. Extract Storage - RAM-aware (plan v7 §5.2, Codex-reproduced bug:
    // "Samsung Galaxy A55 8GB RAM 256GB" must be 256GB, not the first GB token).
    // Decimal separator: dot or comma (Vietnamese titles use "1,5TB").
    const sizeTokens = [...title.matchAll(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/gi)].map(m => ({
      value: parseFloat(m[1].replace(',', '.')) * (m[2].toUpperCase() === 'TB' ? 1024 : 1),
      index: m.index ?? 0,
      raw: m[0],
    }));

    const ramPhrases = [...title.matchAll(/bộ\s*nhớ\s*RAM|dung\s*lượng\s*RAM|RAM\b/gi)].map(
      m => m.index ?? 0
    );
    const claimable = sizeTokens.map(t => ({ ...t, claimed: false }));
    for (const p of ramPhrases) {
      const before = [...claimable]
        .filter(
          t =>
            !t.claimed &&
            t.index + t.raw.length <= p &&
            /^\s*$/.test(title.slice(t.index + t.raw.length, p))
        )
        .sort((a, b) => b.index - a.index)[0];
      const after = [...claimable]
        .filter(t => !t.claimed && t.index > p)
        .sort((a, b) => a.index - b.index)[0];
      const pick = before ?? after;
      if (pick) pick.claimed = true;
    }

    // Also support slash shorthand ("12GB/256GB", "8/256GB") and CellphoneS/TGDD
    // adjacent RAM+ROM pairs ("12GB 256GB") when no explicit RAM keyword is present.
    const slashRamRom = title.match(/\b(\d{1,2})\s*(?:GB)?\s*\/\s*(\d+(?:[.,]\d+)?)\s*(TB|GB)\b/i);
    if (slashRamRom && ramPhrases.length === 0) {
      const slashRam = parseInt(slashRamRom[1], 10);
      for (const c of claimable) {
        if (!c.claimed && c.value === slashRam) {
          c.claimed = true;
          break;
        }
      }
    } else if (ramPhrases.length === 0 && claimable.filter(t => !t.claimed).length === 2) {
      const [first, second] = claimable.filter(t => !t.claimed);
      const between = title.slice(first.index + first.raw.length, second.index);
      if (first.value <= 32 && second.value >= 64 && /^[\s/-]+$/.test(between)) {
        first.claimed = true;
      }
    }

    const storageCandidates = claimable.filter(t => !t.claimed);

    const romExplicit = title.match(/(?:ROM|bộ nhớ trong)\s*[:-]?\s*(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
    const romLoose = title.match(
      /dung lượng\s*[:-]?\s*(\d+(?:[.,]\d+)?)\s*(TB|GB)(?!\s*(?:RAM|bộ\s*nhớ\s*RAM|dung\s*lượng\s*RAM))/i
    );

    const baseKey = `${slugify(brand)}:${slugify(model)}`;
    const benchmark = CANONICAL_PHONE_REGISTRY[baseKey];

    let storageGb: number | null = null;
    let storageConfident = false;
    const marker = romExplicit ?? romLoose;
    if (marker) {
      storageGb =
        parseFloat(marker[1].replace(',', '.')) * (marker[2].toUpperCase() === 'TB' ? 1024 : 1);
      storageConfident = true;
    } else if (slashRamRom) {
      storageGb =
        parseFloat(slashRamRom[2].replace(',', '.')) *
        (slashRamRom[3].toUpperCase() === 'TB' ? 1024 : 1);
      storageConfident = true;
    } else if (storageCandidates.length === 1) {
      storageGb = storageCandidates[0].value;
      storageConfident = true;
    } else if (storageCandidates.length === 0 && benchmark?.default_storage_gb != null) {
      storageGb = benchmark.default_storage_gb;
      storageConfident = true;
    }
    const storageKnown = storageGb !== null;

    // 4. Extract Colors from models / variations
    const colors: string[] = [];
    if (Array.isArray(raw.models)) {
      for (const m of raw.models) {
        if (m.name && typeof m.name === 'string' && !colors.includes(m.name.trim())) {
          colors.push(m.name.trim());
        }
      }
    }

    // 5. Construct keys & slugs. Unknown storage keeps identity space explicit
    // (':unknown') instead of guessing a default (plan v7 §5.2).
    const modelKey = storageKnown ? `${baseKey}:${storageGb}gb` : `${baseKey}:unknown`;
    const storageDisplay =
      categorySlug === 'earbuds' && storageGb === 1
        ? 'Standard'
        : storageGb === null
          ? 'Không rõ dung lượng'
          : storageGb >= 1024
            ? `${storageGb / 1024}TB`
            : `${storageGb}GB`;
    const canonicalName =
      categorySlug === 'earbuds' && storageGb === 1
        ? `${brand} ${model}`
        : storageKnown
          ? `${brand} ${model} ${storageDisplay}`
          : `${brand} ${model}`;
    const slug = slugify(canonicalName);

    // 6. Enrich with 10 Field Groups (PhoneArena structure + GSMArena depth)
    const isApple = brand === 'Apple';

    const ramGb = benchmark ? benchmark.ram_gb : (claimable.find(t => t.claimed)?.value ?? null);
    const screenSize = benchmark ? benchmark.screen_size_inch : null;
    const batteryMah = benchmark ? benchmark.battery_mah : null;
    const has5g = benchmark ? benchmark.has_5g : categorySlug === 'smartphones';

    const cameraCount = benchmark
      ? [
          benchmark.rear_camera,
          benchmark.second_camera,
          benchmark.third_camera,
          benchmark.fourth_camera,
        ].filter(Boolean).length
      : 2;
    const rearSetupLabel =
      cameraCount >= 4
        ? 'Quad Camera'
        : cameraCount === 3
          ? 'Triple Camera'
          : cameraCount === 2
            ? 'Dual Camera'
            : 'Single Camera';

    const specifications: ProductSpecifications = {
      availability: {
        announced: benchmark?.release_date || '2024',
        status: 'Available',
        prices_msrp: `${storageDisplay}: ${(raw.priceMin || 0).toLocaleString('vi-VN')}₫`,
      },
      design: {
        dimensions: benchmark?.dimensions || undefined,
        weight_g: benchmark?.weight_g || undefined,
        materials: isApple
          ? 'Ceramic Shield front, glass back, metal frame'
          : 'Glass front/back, metal frame',
        resistance: benchmark?.ip_rating || 'IP68 dust/water resistant',
        biometrics: isApple ? 'Face ID' : 'Fingerprint (under display), Face unlock',
        keys: isApple ? 'Action Button, Camera Control, Volume, Power' : 'Volume, Power',
        colors: colors.length > 0 ? colors : ['Tiêu chuẩn'],
      },
      display: {
        size_inch: screenSize || undefined,
        type:
          benchmark?.screen_type ||
          (isApple ? 'Super Retina XDR OLED, HDR10' : 'AMOLED, 120Hz, HDR10+'),
        resolution: benchmark?.resolution || undefined,
        refresh_rate_hz: benchmark?.refresh_rate_hz || (isApple ? 60 : 120),
        ppi: benchmark?.screen_size_inch === 6.8 ? 505 : 460,
        protection: isApple ? 'Ceramic Shield' : 'Corning Gorilla Glass',
        features: isApple
          ? 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch'
          : 'Always-on display, HDR10+, Eye Comfort Shield',
      },
      hardware: {
        chipset: benchmark?.chipset || undefined,
        cpu: benchmark?.cpu || undefined,
        gpu: benchmark?.gpu || undefined,
        ram_gb: ramGb || undefined,
        storage_gb: storageGb !== null ? storageGb : undefined,
        storage_expansion: 'Không hỗ trợ thẻ nhớ',
        os: benchmark?.os || (isApple ? 'iOS 18' : 'Android 14'),
      },
      battery: {
        capacity_mah: batteryMah || undefined,
        type: 'Li-Ion, không thể tháo rời',
        charging: isApple ? 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2' : 'Sạc nhanh USB-C PD/PPS',
        fast_charging_w: benchmark?.charging_w || (isApple ? 25 : 45),
        reverse_charging: false,
      },
      camera: {
        rear_setup: rearSetupLabel,
        main_camera: benchmark?.rear_camera || '50 MP (wide, OIS)',
        second_camera: benchmark?.second_camera || '12 MP (ultrawide)',
        third_camera: benchmark?.third_camera || undefined,
        fourth_camera: benchmark?.fourth_camera || undefined,
        front_camera: benchmark?.front_camera || '12 MP',
        flash: isApple ? 'True Tone Dual-LED' : 'LED flash, auto-HDR, panorama',
        video_recording: '4K@30/60fps, 1080p@30/60/120/240fps, HDR',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 6E/7, dual-band, Wi-Fi Direct',
        usb: 'USB Type-C, OTG',
        sensors: isApple
          ? 'Face ID, gia tốc kế, con quay hồi chuyển, tiệm cận, la bàn, khí áp kế'
          : 'Vân tay dưới màn hình, gia tốc kế, con quay hồi chuyển, tiệm cận, la bàn',
        location: 'GPS, GLONASS, Galileo, QZSS, BeiDou',
        nfc: true,
        other: isApple ? 'Ultra Wideband (UWB), SOS vệ tinh' : 'Hỗ trợ OTG, Chia sẻ nhanh',
      },
      cellular: {
        has_5g: has5g,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'LTE Cat 20',
        technology: 'GSM / HSPA / LTE / 5G',
        sim_type: '2 Nano-SIM + eSIM',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo đa chiều',
        headphone_jack_35mm: false,
        audio_features: 'Dolby Atmos, Hi-Res Audio',
      },
      regulatory: {
        certifications: isApple ? 'CE, FCC ID, Apple Eco Standards' : 'CE, FCC, RoHS',
        sar_head: '1.10 W/kg',
        sar_body: '1.15 W/kg',
      },
    };

    const keySpecs: KeySpecs = {
      screen: `${screenSize || (isApple ? 6.1 : 6.6)}" ${benchmark?.screen_type?.split(',')[0] || (isApple ? 'OLED' : 'AMOLED 120Hz')}`,
      chip:
        benchmark?.chipset?.split('(')[0]?.trim() ||
        (isApple ? 'Apple A-Series' : 'Snapdragon / Dimensity'),
      camera: benchmark?.rear_camera ? benchmark.rear_camera.split(',')[0] : '50 MP OIS',
      battery: `${batteryMah || (isApple ? 3561 : 5000)} mAh (${benchmark?.charging_w || (isApple ? 25 : 45)}W)`,
      storage: storageDisplay,
      ram: ramGb ? `${ramGb}GB` : undefined,
    };

    const condition = detectProductCondition(title, raw.description);
    const origin = detectProductOrigin(title, raw.description);

    return {
      category_slug: categorySlug,
      brand,
      model,
      variant_name: storageDisplay,
      model_key: modelKey,
      name: canonicalName,
      slug,
      storage_gb: storageKnown ? storageGb : null,
      needs_review: !storageConfident || condition !== 'new',
      condition,
      origin,
      ram_gb: ramGb,
      screen_size_inch: screenSize,
      battery_mah: batteryMah,
      has_5g: has5g,
      colors,
      images: raw.images || [],
      specifications,
      key_specs: keySpecs,
      description: raw.description,
      is_benchmark_enriched: Boolean(benchmark),
      spec_source: benchmark ? 'benchmark_registry' : 'crawled_title',
    };
  }
}
