import { MAX_VALID_VND_PRICE, type ProductSpecifications, type KeySpecs } from '@repo/shared-data';
import type { ShopeeProduct } from './types.js';

export const MAX_VALID_RAM_GB = 2048;
export const MAX_VALID_STORAGE_GB = 65536;
export const MAX_NORMALIZED_COLOR_LENGTH = 80;
export const MAX_NORMALIZED_COLOR_COUNT = 24;
export const MAX_NORMALIZED_IMAGE_URL_LENGTH = 2048;
export const MAX_NORMALIZED_IMAGE_COUNT = 50;
export const MAX_NORMALIZED_DESCRIPTION_LENGTH = 8000;

function stripControlChars(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/(?:(?![\t\r\n])\p{Cc})/gu, ' ');
}

function normalizeHttpAssetUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_NORMALIZED_IMAGE_URL_LENGTH || /[\s\p{Cc}]/u.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      !host.includes('.') ||
      host.startsWith('.') ||
      host.endsWith('.') ||
      host.includes('..') ||
      host.startsWith('[') ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

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
  const safeTitle = typeof title === 'string' ? title : '';
  const safeDesc = typeof description === 'string' ? description : '';
  const cleanTitle = safeTitle.replace(/thu\s*cũ\s*đổi\s*mới/gi, ' ');
  const cleanDesc = safeDesc.replace(/thu\s*cũ\s*đổi\s*mới/gi, ' ');

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
  const safeTitle = typeof title === 'string' ? title : '';
  const safeDesc = typeof description === 'string' ? description : '';
  const combined = `${safeTitle} ${safeDesc}`;
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

/** Apple product families, for a title whose line no Apple pattern matched (DOS/Rate#817). */
const APPLE_FAMILIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/iphone/i, 'iPhone'],
  [/ipad/i, 'iPad'],
  [/macbook/i, 'MacBook'],
  [/\bwatch\b/i, 'Watch'],
  [/airpods/i, 'AirPods'],
  // Lines with no pattern of their own; on a tie the first listed wins (DOS/Rate#819).
  [/apple\s*tv\s*4k/i, 'TV 4K'],
  [/apple\s*tv/i, 'TV'],
  [/vision\s*pro/i, 'Vision Pro'],
  [/mac\s*mini/i, 'Mac mini'],
  [/mac\s*studio/i, 'Mac Studio'],
  [/\bimac\b/i, 'iMac'],
  [/homepod\s*mini/i, 'HomePod mini'],
  [/homepod/i, 'HomePod'],
];

const APPLE_GENERATION_BY_YEAR: Readonly<Record<string, string>> = {
  'TV 4K 2017': '1',
  'TV 4K 2021': '2',
  'TV 4K 2022': '3',
  'HomePod 2018': '1',
  'HomePod 2023': '2',
};

/**
 * Detect canonical category slug from product title across all 5 tech categories.
 */
export function detectCategorySlug(title: string): CanonicalCategorySlug {
  const t = typeof title === 'string' ? title.toLowerCase() : '';
  if (
    /airpods|galaxy\s*buds|w[fh]1000xm|wf-\d+|wh-\d+|tai\s*nghe|earbuds?|freebuds|soundcore|quietcomfort|momentum\s*true/i.test(
      t
    )
  ) {
    return 'earbuds';
  }
  if (
    /apple\s*watch|galaxy\s*watch|\bgarmin\b|forerunner|fenix|venu|vivo(?:active|smart|move|fit|sport|life)|watch\s*(?:ultra|series|gt|fit|se)|đồng\s*hồ\s*thông\s*minh|vòng\s*(?:đeo\s*)?tay\s*thông\s*minh|smartwatch|amazfit|coros/i.test(
      t
    )
  ) {
    return 'smartwatches';
  }
  if (
    /macbook|thinkpad|ideapad|legion|vivo\s*book|zenbook|rog\s*(?:strix|zephyrus|flow)|tuf\s*gaming|inspiron|\bxps\b|latitude|pavilion|envy|victus|omen|nitro\s*\d|swift|predator|surface\s*laptop|\blaptop\b|máy\s*tính\s*xách\s*tay|ultrabook/i.test(
      t
    )
  ) {
    return 'laptops';
  }
  if (
    /\bipad\b|galaxy\s*tab|xiaomi\s*pad|redmi\s*pad|\bmi\s*pad\b|matepad|lenovo\s*tab|surface\s*pro|máy\s*tính\s*bảng|\btablet\b/i.test(
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
    screen_size_inch?: number;
    battery_mah: number;
    ram_gb?: number;
    chipset: string;
    cpu: string;
    gpu: string;
    os: string;
    weight_g: number;
    dimensions: string;
    resolution: string;
    screen_type: string;
    refresh_rate_hz?: number;
    rear_camera: string;
    second_camera?: string;
    third_camera?: string;
    fourth_camera?: string;
    front_camera: string;
    charging_w: number;
    has_5g: boolean;
    release_date: string;
    ip_rating: string;
    // Set only for a model that ships in a single storage size (a watch generation), so a
    // title that names no storage still knows it. A model sold in several sizes has none:
    // its storage-less title keys as ':unknown' (DOS/Rate#1094).
    only_storage_gb?: number;
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
    only_storage_gb: 64,
  },
  'apple:airpods-pro-2': {
    battery_mah: 523,
    chipset: 'Apple H2 headphone chip + Apple U1 chip (MagSafe Case)',
    cpu: 'Apple H2 custom acoustic DSP',
    gpu: 'N/A',
    os: 'iOS / macOS / Spatial Audio firmware',
    weight_g: 50.8,
    dimensions: '45.2 x 60.6 x 21.7 mm (Case)',
    resolution: 'Custom high-excursion Apple driver',
    screen_type: 'Active Noise Cancellation (2x ANC) + Adaptive Transparency',
    rear_camera: 'Inward-facing microphone + skin-detect sensor',
    front_camera: 'Beamforming dual microphones',
    charging_w: 5,
    has_5g: false,
    release_date: 'September 2023',
    ip_rating: 'IP54 dust, sweat, and water resistant',
  },
  'sony:wf-1000xm5': {
    battery_mah: 500,
    chipset: 'Sony Integrated Processor V2 + HD Noise Cancelling Processor QN2e',
    cpu: 'Dual-processor 24-bit Audio DSP',
    gpu: 'N/A',
    os: 'Sony Sound Connect (LDAC / Multipoint)',
    weight_g: 49,
    dimensions: '64.6 x 40.0 x 26.5 mm (Case)',
    resolution: '8.4 mm Dynamic Driver X (20Hz-40,000Hz LDAC)',
    screen_type: 'Industry-leading Dual-Processor ANC + Bone Conduction Sensor',
    rear_camera: 'Dual feedback microphones per earbud',
    second_camera: 'Feed-forward & feedback 6-mic array',
    front_camera: 'Bone conduction sensor + Wind noise reduction',
    charging_w: 5,
    has_5g: false,
    release_date: 'July 2023',
    ip_rating: 'IPX4 water resistant',
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
    only_storage_gb: 32,
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
    only_storage_gb: 8,
  },
  'samsung:galaxy-buds3-pro': {
    battery_mah: 515,
    chipset: 'Samsung Proprietary Bluetooth 5.4 SoC + Dual Amplifier',
    cpu: 'Galaxy AI Adaptive ANC & Real-Time Interpreter DSP',
    gpu: 'Blade Lights LED Controller',
    os: 'Galaxy Wearable (SSC UHQ 24-bit/96kHz)',
    weight_g: 57.4,
    dimensions: '48.7 x 58.9 x 24.4 mm (Case)',
    resolution: 'Enhanced 2-Way Speaker (10.5mm Dynamic + 6.1mm Planar Tweeter)',
    screen_type: 'Blade Lights LED Indicator + Transparent Cradle Lid',
    rear_camera: '3 High-SNR Microphones + VPU (Voice Pickup Unit)',
    second_camera: 'In-canal feedback mic + Siren/Voice Detect AI sensor',
    front_camera: 'Pinch & Swipe Blade Touch Controls',
    charging_w: 5,
    has_5g: false,
    release_date: 'July 2024',
    ip_rating: 'IP57 dust and water resistant (1m up to 30 mins)',
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
    only_storage_gb: 64,
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
    only_storage_gb: 64,
  },
  'apple:airpods-pro-3': {
    battery_mah: 540,
    chipset: 'Apple H3 Headphone Chip + U2 Ultra Wideband (MagSafe Case)',
    cpu: 'Apple H3 Ultra-Low-Latency Audio DSP (96kHz/24-bit Lossless)',
    gpu: 'Acoustic & Heart-Rate Biosensor Co-Processor',
    os: 'Apple AudioOS (Hearing Health & Live Translation AI)',
    weight_g: 50.2,
    dimensions: '45.2 x 60.6 x 21.7 mm (USB-C MagSafe Case)',
    resolution: 'Custom High-Excursion Apple Driver + High Dynamic Range Amplifier',
    screen_type: 'Status LED + Built-in Find My Precision Speaker',
    rear_camera: 'In-Ear Optical Heart-Rate & Body Temperature Sensor + 3x ANC Pro vs Gen 1',
    second_camera: 'Clinical-Grade Hearing Aid Mode + Conversation Awareness + Voice Isolation',
    front_camera: 'Capacitive Touch Stem (Swipe Volume + Press Control)',
    charging_w: 5,
    has_5g: false,
    release_date: 'September 2025',
    ip_rating: 'IP54 dust, sweat, and water resistant (earbuds and MagSafe charging case)',
  },
  'sony:wf-1000xm6': {
    battery_mah: 550,
    chipset: 'Sony Integrated Processor V3 + QN3e HD Noise Cancelling Processor',
    cpu: 'Dual-Processor 24-bit Audio Signal Processing + DSEE Ultimate AI',
    gpu: 'LE Audio LC3 & LDAC High-Bitrate Controller',
    os: 'Sony Sound Connect (LDAC 990kbps / 360 Reality Audio)',
    weight_g: 46.8,
    dimensions: '64.0 x 40.0 x 25.8 mm (Qi Wireless Case)',
    resolution: '8.4mm Dynamic Driver X (Dual-layer dome-edge diaphragm)',
    screen_type: 'Recessed Matte Acoustic Chassis + Multi-Point Status LED',
    rear_camera: 'Dual Feedback + Feedforward 6-Mic Array + Bone Conduction Sensor',
    second_camera: 'AI Beamforming Wind Noise Reduction + Speak-to-Chat + Head Gesture Control',
    front_camera: 'Customizable Capacitive Touch Panels (L/R)',
    charging_w: 5,
    has_5g: false,
    release_date: 'June 2025',
    ip_rating: 'IPX4 splash and sweat resistant + Polyurethane Noise Isolation Tips',
  },
};

/**
 * A maker's product code ("15IAH8", "14AHP9", "X1407AA-LY360W"): an alphanumeric run of
 * five characters or more with at least two digits and two letters. Model names ("X1",
 * "E14", "T14s") are shorter, and "2-in-1" is three runs.
 */
function isProductCodeToken(token: string): boolean {
  return token
    .split(/[^a-z0-9]+/i)
    .some(
      run =>
        run.length >= 5 &&
        (run.match(/\d/g)?.length ?? 0) >= 2 &&
        (run.match(/[a-z]/gi)?.length ?? 0) >= 2
    );
}

// Screen sizes an Apple line is sold in. A bare number counts only on its own: not in a
// part code ("Z15S"), after "RAM" or an OS name ("macOS 14"), or before a storage, a
// RAM/ROM pair or a core count ("16GB", "16G", "16/512", "16-core", "16 nhân CPU").
// Titles carry single spaces, so each gap is one optional space (CodeQL
// js/polynomial-redos).
const SIZE_NOT_PRECEDED_BY = String.raw`(?<![\d.,a-z])(?<!(?:ram|os) )`;
const SIZE_NOT_FOLLOWED_BY = String.raw`(?![.,]?\d|[a-z]| ?(?:gb?\b|tb?\b|th\b|gen|mm|w\b|h\b|\/|-? ?(?:core|nhân|lõi)|cpu|gpu|tiếng|giờ))`;
const SIZE_MARKER = String.raw` ?(?:-? ?inch|in\b|"|''|”|″)`;
const IPAD_SIZE = String.raw`(11|12[.,]9|13)(?:[.,]0)?`;
const MACBOOK_AIR_SIZE = String.raw`(13|15)(?:[.,]\d)?`;
const MACBOOK_PRO_SIZE = String.raw`(1[3-6])(?:[.,]\d)?`;
const sizePatterns = (size: string): [RegExp, RegExp] => [
  new RegExp(String.raw`(?<![\d.,])` + size + SIZE_MARKER, 'i'),
  new RegExp(SIZE_NOT_PRECEDED_BY + size + SIZE_NOT_FOLLOWED_BY, 'i'),
];
const WATCH_BAND_WORD =
  /(?<!kh[\p{L}\p{M}]{1,3}ng )(?:d(?:\u00e2|a\u0302)y|band|strap|loop|bracelet)(?![\p{L}\d])/iu;
const WATCH_SIZE = /(?<!\d)(38|4[0-2]|4[4-6]) ?mm\b/i;
const LIST_WATCH_SIZE = /^ ?(?:38|4[0-2]|4[4-6]) ?mm\b/i;
const APPLE_SIZE_PATTERNS: Record<string, [RegExp, RegExp]> = {
  ipad: sizePatterns(IPAD_SIZE),
  'macbook air': sizePatterns(MACBOOK_AIR_SIZE),
  'macbook pro': sizePatterns(MACBOOK_PRO_SIZE),
};

/**
 * The size of an Apple line sold in more than one: "11", "12.9" or "13" for an iPad Pro
 * or Air, "13" or "15" for a MacBook Air, "13" to "16" for a MacBook Pro, "42mm" or
 * "46mm" for a Watch Series or SE. Read from the product's own part of the title, after
 * its family word and before a "cho/for" accessory phrase or a "+" bundle; a size with
 * "inch" wins over
 * a bare number (DOS/Rate#1113).
 */
function readAppleSize(model: string, title: string): string {
  const family = /^ipad (?:pro|air)\b/i.test(model)
    ? 'ipad'
    : /^macbook air\b/i.test(model)
      ? 'macbook air'
      : /^macbook pro\b/i.test(model)
        ? 'macbook pro'
        : /^watch (?:series|se\d?)\b/i.test(model)
          ? 'watch'
          : '';
  if (!family) return '';
  const at = title.search(new RegExp(`\\b${family.split(' ')[0]}\\b`, 'i'));
  // A bundle's "+ bàn phím 11 inch" is another product; "GPS + Cellular" is the watch.
  const own = title.slice(Math.max(0, at)).split(/ (?:cho|for) | ?\+ (?!cellular|lte)/i)[0]!;
  if (family === 'watch') {
    // A size outside a band phrase ("dây", "band", "strap", "loop" or "bracelet" up to the
    // next ")", ",", "|", ";", en dash or " - ") is the case's. A band is sold by the case
    // it fits ("Dây Cao Su 46mm"), so a band's size counts only when the title names no
    // other: "dây Sport Band 45mm cho mặt 42mm" does not tell the watch's (DOS/Rate#1124).
    // A band phrase with a size runs on over the parts after it that start with a size
    // and follow "," or "|": "Sport Loop 42mm | 46mm" or "Dây 42mm S/M, 46mm M/L" names
    // two band sizes, not a case (DOS/Rate#1137).
    const parts = own.split(/([),|;\u2013]| - )/);
    const outside: string[] = [];
    let bandList = false;
    for (let i = 0; i < parts.length; i += 2) {
      const part = parts[i]!;
      if (bandList && /^[,|]$/.test(parts[i - 1]!) && LIST_WATCH_SIZE.test(part)) continue;
      const [before, ...band] = part.split(WATCH_BAND_WORD);
      outside.push(before!);
      bandList = WATCH_SIZE.test(band.join(' '));
    }
    const caseSize = outside.join(' ').match(WATCH_SIZE)?.[1];
    if (caseSize) return `${caseSize}mm`;
    const bandSize = own.match(WATCH_SIZE)?.[1];
    const sizes = new Set(
      [...title.slice(Math.max(0, at)).matchAll(new RegExp(WATCH_SIZE, 'gi'))].map(m => m[1])
    );
    return bandSize && sizes.size === 1 ? `${bandSize}mm` : '';
  }
  const [marked, bare] = APPLE_SIZE_PATTERNS[family]!;
  const size = (own.match(marked) ?? own.match(bare))?.[1];
  return size ? size.replace(',', '.') : '';
}

function slugify(text: string): string {
  return (
    String(text ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/đ/g, 'd')
      // "Pro+" / "S24+" are Plus models: keep them apart from the base model's
      // key and slug, and give "S24+" the same key as "S24 Plus" (DOS/Rate#597).
      // Only a "+" that ends a model word counts; "A55 + Tặng" and "8+256GB" keep
      // their old keys.
      .replace(/(?<=[a-z0-9])\+(?![a-z0-9])/g, ' plus ')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200)
      .replace(/-+$/g, '')
  );
}

export class ProductNormalizer {
  /**
   * Normalizes raw Shopee product into canonical master product candidate across all 5 categories
   */
  public normalize(raw: ShopeeProduct): NormalizedProductCandidate {
    const safeRaw = raw && typeof raw === 'object' ? raw : ({} as ShopeeProduct);
    const title =
      typeof safeRaw.title === 'string'
        ? stripControlChars(safeRaw.title).replace(/\s+/g, ' ').trim().slice(0, 1000)
        : '';
    const categorySlug = detectCategorySlug(title);

    // 1. Extract Brand
    let brand = 'Khác';
    // Not the "ipad" in Xiaomi's "Mipad" (DOS/Rate#826).
    if (/apple|iphone|(?<![a-z])ipad|macbook|airpods/i.test(title)) brand = 'Apple';
    else if (/samsung|galaxy/i.test(title)) brand = 'Samsung';
    else if (/xiaomi|redmi|poco|\bmi\s*pad\b/i.test(title)) brand = 'Xiaomi';
    else if (/\bsony\b|w[fh]-1000|w[fh]1000xm|xperia/i.test(title)) brand = 'Sony';
    else if (
      /\bgarmin\b|forerunner|fenix|venu|vivo(?:active|smart|move|fit|sport|life)/i.test(title)
    )
      brand = 'Garmin';
    else if (/\blenovo\b|thinkpad|ideapad|legion/i.test(title)) brand = 'Lenovo';
    else if (/oppo/i.test(title)) brand = 'OPPO';
    // Not "Vivobook" / "Vivo Book" (Asus) (DOS/Rate#761); Garmin's Vivo lines are matched above.
    else if (/\bvivo(?!\s*book)/i.test(title)) brand = 'Vivo';
    else if (/realme/i.test(title)) brand = 'Realme';
    else if (/google|pixel/i.test(title)) brand = 'Google';
    else if (/\basus\b|\brog\b|zenbook|vivo\s*book|tuf\s*gaming/i.test(title)) brand = 'Asus';
    else if (/\bdell\b|inspiron|\bxps\b|alienware|latitude/i.test(title)) brand = 'Dell';
    // "Omen" as a word: Sennheiser "Momentum" is not HP.
    else if (/\bhp\b|pavilion|victus|\bomen\b|elitebook|envy/i.test(title)) brand = 'HP';
    else if (/\bacer\b|nitro\s*\d|swift|predator|aspire/i.test(title)) brand = 'Acer';
    else if (/\bmsi\b|katana|cyborg|stealth|prestige/i.test(title)) brand = 'MSI';
    else if (/\bhuawei\b|matepad|freebuds|watch\s*gt/i.test(title)) brand = 'Huawei';
    else if (/\bbose\b|quietcomfort/i.test(title)) brand = 'Bose';
    else if (/\bjbl\b|tour\s*pro|tune\s*\d+/i.test(title)) brand = 'JBL';
    else if (/sennheiser|momentum/i.test(title)) brand = 'Sennheiser';
    else if (/oneplus/i.test(title)) brand = 'OnePlus';
    else if (/\bhonor\b|magicbook/i.test(title)) brand = 'Honor';
    // Apple's desktops and speakers, last so another brand wins, and not when the title
    // only names what it fits or looks like ("Bàn phím cho Mac mini") (DOS/Rate#819).
    else if (
      /\bimac\b|\bmac\s*(?:mini|studio)\b|homepod|\bvision\s*pro\b/i.test(title) &&
      !/\b(?:cho|for|giống)\s+(?:imac|mac|homepod|vision)/i.test(title)
    )
      brand = 'Apple';

    // 2. Extract Model
    let model = '';
    let appleSize = '';
    // Spellings that split a tier word from its model number read like the joined ones
    // (DOS/Rate#1090). `title` has single spaces, so each gap is one optional space.
    // Each rewrite applies only where the name ends right after it: the title ends, or a
    // separator, a size ("256GB"), a RAM/ROM pair ("8/256"), a network or "Chính hãng"
    // follows, so "Tab S9 - Ultra slim case", "Tab S9 - Ultra 2-in-1 case" and "A55 + Tặng"
    // keep their keys.
    let modelTitle = title
      // "15 - ProMax", "S24-Ultra" and "15 (ProMax)" are "15 ProMax" and "S24 Ultra".
      .replace(
        /(?<=\d[a-z]?) ?- ?(pro ?max|pro|plus|ultra|mini|lite|fe)\b(?= ?(?:$|[-,(]|\d+(?:[.,]\d+)? ?(?:gb|tb)\b|\d+ ?\/ ?\d+|[45]g\b|lte\b|chính\b))/gi,
        ' $1'
      )
      .replace(
        /(?<=\d[a-z]?) ?\( ?(pro ?max|pro|plus|ultra|mini|lite|fe) ?\)(?= ?(?:$|[-,(]|\d+(?:[.,]\d+)? ?(?:gb|tb)\b|\d+ ?\/ ?\d+|[45]g\b|lte\b|chính\b))/gi,
        ' $1 '
      )
      // A "+" set apart after a model number or its "Pro" ("S24 +", "iPhone 15 +", "Note
      // 13 Pro +") is the Plus. "A55 8 + 256GB" is a RAM/ROM pair and keeps its key. The
      // text before the "+" is checked on a bounded slice rather than by a variable-length
      // lookbehind (CodeQL js/polynomial-redos).
      .replace(
        / \+(?= ?(?:$|[-,]|\d+(?:[.,]\d+)? ?(?:gb|tb)\b|[45]g\b|lte\b|chính\b))/gi,
        (plus: string, at: number, text: string) =>
          /(?:\b[a-z]+ ?\d+[a-z]?|\d[a-z]? pro)$/i.test(text.slice(Math.max(0, at - 32), at))
            ? '+ '
            : plus
      )
      .replace(/ {2,}/g, ' ')
      .trim();
    // Samsung's "Galaxy S 24" and "Tab S 9" are the S24 and the Tab S9.
    if (brand === 'Samsung')
      modelTitle = modelTitle.replace(/\b(galaxy|tab) s (\d{1,2})\b/gi, '$1 S$2');
    if (brand === 'Apple') {
      // "(2nd generation)" is the generation number: "Watch Ultra (2nd generation)" is
      // "Watch Ultra 2", "AirPods Pro (2nd generation)" is "AirPods Pro 2" (DOS/Rate#817).
      // One optional space before the "(" keeps a single space in the name; a leading
      // `\s*` would be quadratic on long whitespace (CodeQL js/polynomial-redos).
      let appleTitle = modelTitle.replace(
        / ?\(\s*(\d{1,2})(?:st|nd|rd|th)\s*gen(?:eration)?\s*\)/gi,
        ' $1'
      );
      // An iPhone or iPad named after another Apple product as what it fits is not the
      // product: "AirPods Pro 2 cho iPhone Air" is the AirPods (DOS/Rate#819).
      const fitsAt = appleTitle.search(/ (?:cho|for) (?:iphone|ipad)\b/i);
      // Only another family counts: "Ốp lưng iPhone cho iPhone 15" is still the iPhone 15.
      if (fitsAt > 0 && /airpods|\bwatch\b|macbook/i.test(appleTitle.slice(0, fitsAt)))
        appleTitle = appleTitle.slice(0, fitsAt);
      const iphoneMatch = appleTitle.match(
        /iphone\s*(\d+e\b|\d+(?:\s*(?:pro\s*max|pro|plus|mini|air)|\+(?= ?(?:$|[-,]|\d+(?:[.,]\d+)? ?(?:gb|tb)\b|[45]g\b|lte\b|chính\b)))?|air\b|duo\b|se(?:\s*(?:\(\s*(?:2020|2022|2025)\s*\)|(?:2020|2022|2025)\b|(?:gen\s*)?[234]\b))?)/i
      );
      // The base iPad by its chip, "iPad A16" or "iPad (A16)", and "iPad Gen 10" like
      // "iPad 10" (DOS/Rate#817).
      const ipadMatch = appleTitle.match(
        // A screen size before the line ("iPad 11 Pro M4") is skipped (DOS/Rate#819).
        /ipad\s*(?:\(\s*)?(?:\d{2}(?:[.,]\d)?\s*(?:inch\s*)?(?=pro|air|mini))?(pro\s*m\d+|air\s*m\d+|air\s*[1-9](?!\d|[.,]\d|g\b|\s*(?:gb|tb|inch\b|in\b|"|''))|pro|air|mini(?:\s*[1-9](?!\d|[.,]\d|g\b|\s*(?:gb|tb|inch\b|in\b|"|'')))?|gen\s*\d+|a\d{2}\b|\d+(?!\d|\s*(?:pro|air|mini)\b))/i
      );
      const macbookMatch = appleTitle.match(
        /macbook\s*(pro\s*m\d+(?:\s*(?:pro|max))?|air\s*m\d+|air|pro|neo\b)/i
      );
      const watchMatch = appleTitle.match(
        // "Ultra 49mm" is the case size, not a generation (DOS/Rate#819).
        /(?:apple\s*)?watch\s*(ultra(?:\s*\d+(?!\d|\s*mm\b))?|series\s*\d+|se(?:\s*\d+(?!\d|\s*(?:mm|gb|tb)\b)|(?![a-z])))/i
      );
      const airpodsMatch = appleTitle.match(
        // Each run of spaces has exactly one `\s*` that can match it, so long
        // whitespace cannot backtrack polynomially (CodeQL js/polynomial-redos).
        /airpods\s*(?:(pro)(?:\s*(?:(?:gen|thế\s*hệ)\s*|\(\s*)?(\d+))?|(max)|(?:(?:gen|thế\s*hệ)\s*)?(\d+))/i
      );

      // Retail titles often put the chip after the screen size ("iPad Pro 11 inch M4",
      // "MacBook Air 13 inch M3"); pick it up wherever it sits.
      const chipMatch = modelTitle.match(/\b(M\d)(?:\s+(Pro|Max))?\b/i);
      const chip = chipMatch ? chipMatch[1].toUpperCase() : '';

      if (iphoneMatch && iphoneMatch[1]) {
        const normalizedIphoneSuffix = iphoneMatch[1]
          .replace(/[()]/g, ' ')
          .replace(/\bgen\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/^(\d+)E\b/, '$1e')
          .replace(/^se\b/i, 'SE')
          // The 2020 and 2022 iPhone SE are the 2nd and 3rd generation (DOS/Rate#819).
          .replace(/^SE 2020$/, 'SE 2')
          .replace(/^SE 2022$/, 'SE 3')
          // "iPhone Air" and "iPhone Duo" have no number (DOS/Rate#817).
          .replace(
            /^(air|duo)$/i,
            (line: string) => line[0]!.toUpperCase() + line.slice(1).toLowerCase()
          )
          // "15+" is "15 Plus" (DOS/Rate#1090).
          .replace(/^(\d+)\+$/, '$1 Plus')
          // "16ProMax" and "16 ProMax" are "16 Pro Max" (DOS/Rate#815).
          .replace(/^(\d+)(?=pro|plus|mini|air)/i, '$1 ')
          .replace(/\b(pro)(max)\b/i, '$1 $2');
        model = `iPhone ${normalizedIphoneSuffix}`;
      } else if (ipadMatch && ipadMatch[1]) {
        // Apple names the base iPad by its chip from the A16 on, so an A16 or later chip
        // after the screen size or generation is the model: "iPad 11 inch (A16)" and
        // "iPad 11 2025 A16" are the iPad (A16). Earlier ones go by generation: "iPad 10" and
        // "iPad Gen 10 (A14 Bionic)" stay the 10th (DOS/Rate#817, #819).
        // The first A-chip counts, and only up to another iPad or a comparison: "iPad 10
        // so sánh với iPad A16" and "iPad 9 chip A13 - A16 sắp về" keep their generation.
        const chipAfter = /^(?:gen\s*)?\d+$/i.test(ipadMatch[1])
          ? appleTitle
              .slice((ipadMatch.index ?? 0) + ipadMatch[0].length)
              .split(/\bipad\b|so sánh|\bvs\b/i)[0]!
              .match(/\ba(\d{2})\b/i)
          : null;
        let line =
          chipAfter && Number(chipAfter[1]) >= 16
            ? `A${chipAfter[1]}`
            : ipadMatch[1]
                .trim()
                .replace(/^gen\s*/i, '')
                .replace(/^a(\d{2})$/i, 'A$1')
                // The 11th generation is the iPad (A16) (DOS/Rate#819).
                .replace(/^11$/, 'A16');
        // An iPad Air generation without a chip is its own model; the 6th and 7th are the M2
        // and M3 Airs, keyed like titles that name the chip, and a named M chip wins: "iPad
        // Air 5 M1" is the "iPad Air M1" (DOS/Rate#819). The chip is read only from the Air's
        // own part of the title, before a "+" bundle or a "cho/for" accessory phrase.
        const air = line.match(/^air\s*([1-9])$/i);
        const airChip = air
          ? appleTitle
              .slice(ipadMatch.index ?? 0)
              .split(/ ?\+ | (?:cho|for) /i)[0]!
              .match(/\b(M\d)\b/i)?.[1]
              ?.toUpperCase()
          : undefined;
        if (air)
          line = airChip
            ? `Air ${airChip}`
            : air[1] === '6'
              ? 'Air M2'
              : air[1] === '7'
                ? 'Air M3'
                : `Air ${air[1]}`;
        // "iPad mini 6" and "iPad mini 7" are two models, not one "iPad mini"; Apple calls the
        // 7th "iPad mini (A17 Pro)", and "8.3 inch" or "8,3 inch" is the screen (DOS/Rate#819).
        // One digit, not a "5G" or "4G" network or a storage ("mini 64 Wifi").
        const mini = line.match(/^mini\s*([1-9])?$/i);
        if (mini)
          line = `mini${mini[1] ? ` ${mini[1]}` : /\ba17\s*pro\b/i.test(appleTitle) ? ' 7' : ''}`;
        model = /^(pro|air)$/i.test(line) && chip ? `iPad ${line} ${chip}` : `iPad ${line}`;
      } else if (macbookMatch && macbookMatch[1]) {
        const line = macbookMatch[1].trim().replace(/^neo$/i, 'Neo');
        model =
          /^(pro|air)$/i.test(line) && chip
            ? `MacBook ${line} ${chip}${chipMatch?.[2] ? ` ${chipMatch[2]}` : ''}`
            : `MacBook ${line}`;
      } else if (watchMatch && watchMatch[1]) {
        model = `Watch ${watchMatch[1].trim()}`;
      } else if (airpodsMatch) {
        if (airpodsMatch[1]) {
          const rawGen = airpodsMatch[2];
          // FPT Shop names 2nd-gen AirPods Pro by release/USB-C refresh year ("AirPods Pro 2022",
          // "AirPods Pro 2023") (DOS/Rate#643).
          const proGen = rawGen === '2022' || rawGen === '2023' ? '2' : rawGen;
          model = `AirPods Pro${proGen ? ` ${proGen}` : ''}`;
        } else if (airpodsMatch[3]) {
          model = 'AirPods Max';
        } else if (airpodsMatch[4]) {
          model = `AirPods ${airpodsMatch[4]}`;
        } else {
          model = 'AirPods';
        }
      } else {
        // No line matched: keep the family the title names first rather than call it an
        // iPhone ("MacBook M4", "Apple \"iPad\" 256GB") (DOS/Rate#817).
        let first = Infinity;
        let familyEnd = 0;
        model = 'iPhone';
        for (const [family, name] of APPLE_FAMILIES) {
          const found = appleTitle.match(family);
          const at = found?.index ?? -1;
          if (at >= 0 && at < first) [first, model, familyEnd] = [at, name, at + found![0].length];
        }
        // Desktop Macs go by their chip like the MacBooks; otherwise a generation or year right
        // after the line keeps "HomePod 2" and "Apple TV 4K 2022" apart (DOS/Rate#819).
        const generation = appleTitle
          .slice(familyEnd)
          .match(/^ ?\(? ?([1-9]|20\d{2})\b(?! ?(?:gb|tb)\b)/i);
        if (/^(?:Mac mini|Mac Studio|iMac)$/.test(model) && chip)
          model = `${model} ${chip}${chipMatch?.[2] ? ` ${chipMatch[2]}` : ''}`;
        else if (
          /^(?:TV|TV 4K|HomePod|HomePod mini|Mac mini|Mac Studio|iMac)$/.test(model) &&
          generation
        )
          // Retailers name an Apple TV 4K or HomePod by its year as often as by its generation.
          model = `${model} ${APPLE_GENERATION_BY_YEAR[`${model} ${generation[1]}`] ?? generation[1]}`;
      }
      // A line Apple sells in more than one size keys each size apart: the 11 and 13 inch
      // iPad Pro, or the 42 and 46mm Watch Series, are two products at two prices. A title
      // without its size keeps the size-less key, and one-size lines (Watch Ultra 49mm,
      // iPad mini, MacBook Neo) never carry one (DOS/Rate#1113).
      appleSize = readAppleSize(model, appleTitle);
      if (appleSize) model = `${model} ${appleSize}`;
    } else if (brand === 'Sony' && /w([fh])-?1000xm(\d+)/i.test(modelTitle)) {
      // "WF1000XM5" without the hyphen is the same model (DOS/Rate#815).
      const m = modelTitle.match(/w([fh])-?1000xm(\d+)/i);
      model = `W${m?.[1]?.toUpperCase()}-1000XM${m?.[2]}`;
    } else if (brand === 'Asus' && /zenbook\s*s\s*14/i.test(modelTitle)) {
      model = 'Zenbook S 14';
    } else if (brand === 'Lenovo' && /thinkpad\s*x1\s*carbon\s*gen\s*12/i.test(modelTitle)) {
      model = 'ThinkPad X1 Carbon Gen 12';
    } else if (brand === 'Garmin' && /forerunner\s*265/i.test(modelTitle)) {
      model = 'Forerunner 265';
    } else if (brand === 'Samsung' && /galaxy\s*watch\s*ultra/i.test(modelTitle)) {
      model = 'Galaxy Watch Ultra';
    } else if (brand === 'Samsung' && /galaxy\s*buds\s*3\s*pro/i.test(modelTitle)) {
      model = 'Galaxy Buds3 Pro';
    } else if (brand === 'Samsung' && /galaxy\s*tab\s*s10\s*ultra/i.test(modelTitle)) {
      model = 'Galaxy Tab S10 Ultra';
    } else if (brand === 'Xiaomi' && /pad\s*6s\s*pro/i.test(modelTitle)) {
      model = 'Pad 6S Pro';
    } else if (brand === 'Xiaomi' && /pad\s*7\s*pro/i.test(modelTitle)) {
      model = 'Pad 7 Pro';
    } else {
      const withoutLeadingPromo = modelTitle
        .replace(/^(?:\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】))+\s*/, '')
        .trim();
      const cleaned = withoutLeadingPromo
        .replace(
          new RegExp(
            `^(?:(?:Hàng\\s+)?Chính\\s+hãng\\s+)?(?:(?:Điện\\s+thoại(?:\\s+thông\\s+minh|\\s+di\\s+động)?|Smartphone|Máy\\s+tính\\s+bảng|Tablet|Laptop|Máy\\s+tính\\s+xách\\s+tay|Đồng\\s+hồ(?:\\s+đeo\\s+tay)?(?:\\s+thông\\s+minh)?|Vòng\\s+đeo\\s+tay(?:\\s+thông\\s+minh)?|Vòng\\s+tay\\s+thông\\s+minh|Smartwatch|Tai\\s+nghe(?:\\s+Bluetooth|\\s+chống\\s+ồn|\\s+không\\s+dây)?|Earbuds)\\s+(?:(?:Hàng\\s+)?Chính\\s+hãng\\s+)?)?(?:${brand}\\b\\s*)?`,
            'i'
          ),
          ''
        )
        .replace(/^(?:\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】))+\s*/, '')
        // "Vivo Book 15" is the Asus Vivobook line: key it like "Vivobook 15" (DOS/Rate#774).
        .replace(/\bvivo\s+book\b/gi, 'Vivobook')
        // "17 ProMax" keys like "17 Pro Max" (DOS/Rate#815).
        .replace(/\b(pro)(max)\b/gi, '$1 $2')
        .trim();
      const rawTokens = cleaned.split(/\s+/).filter(Boolean);
      const modelTokens: string[] = [];
      let hasProductCode = false;
      for (let i = 0; i < rawTokens.length; i++) {
        const tok = rawTokens[i];
        // "Samsung, Galaxy S25 Ultra": the brand's comma is not the end of the model.
        if (modelTokens.length === 0 && /^[,;]+$/.test(tok)) continue;
        const startsGeneration =
          /^gen$/i.test(tok) && /^\d{1,2}[,;]?$/.test(rawTokens[i + 1] ?? '');
        // A product code already names the generation: "IdeaPad Slim 3 15IAH8 Gen 8" and
        // "Legion 5 15IRX9 Gen 9" key as their code, like the titles without "Gen".
        if (hasProductCode && startsGeneration) break;
        // Otherwise a generation ("Gen 13") is part of the model even past the 4-token
        // cap, so "ThinkPad X1 Carbon Gen 13" and "Gen 11" key apart (DOS/Rate#762).
        const generation =
          startsGeneration ||
          (/^gen$/i.test(modelTokens[modelTokens.length - 1] ?? '') && /^\d{1,2}[,;]?$/.test(tok));
        // A trailing "Plus" word is part of the model even past the 4-token cap,
        // so "Redmi Note 13 Pro Plus" keys like "Redmi Note 13 Pro+" (#597); so is
        // "Max" after "Pro": "Redmi Note 17 Pro Max" is not the Pro (DOS/Rate#815).
        if (
          modelTokens.length >= 4 &&
          !(modelTokens.length === 4 && /^plus[,;]?$/i.test(tok)) &&
          !(/^pro$/i.test(modelTokens[modelTokens.length - 1] ?? '') && /^max[,;]?$/i.test(tok)) &&
          !generation
        ) {
          break;
        }
        if (
          /^(?:\d+(?:[.,]\d+)?(?:GB|TB)|\d+\/\d+(?:GB|TB)?|\d{2}mm|5G|4G|LTE|GPS|RAM|ROM|OLED|WiFi|Chính|Quốc|Bản|Mới|Fullbox|Likenew|Like|Cũ|99%|98%|VN\/A|VNA|LL\/A|\(|\[|-)/i.test(
            tok
          ) ||
          // A size written apart, "256 GB", ends the model like "256GB" (DOS/Rate#815).
          (/^\d+(?:[.,]\d+)?$/.test(tok) && /^(?:GB|TB)\b/i.test(rawTokens[i + 1] ?? ''))
        ) {
          break;
        }
        // A comma or semicolon ends the model: "Garmin Epix Gen 2, Black, Gray Carbon" is
        // "Epix Gen 2" (DOS/Rate#774: "Redmi Note 13 Pro Plus; 8GB" too).
        if (/[,;]$/.test(tok)) {
          if (tok.length > 1) modelTokens.push(tok.slice(0, -1));
          break;
        }
        modelTokens.push(tok);
        hasProductCode ||= isProductCodeToken(tok);
      }
      model = modelTokens.length > 0 ? modelTokens.join(' ') : rawTokens.slice(0, 2).join(' ');
    }
    model = model.replace(/\s+/g, ' ').trim().slice(0, 120).trim();

    // 3. Extract Storage - RAM-aware (plan v7 §5.2, Codex-reproduced bug:
    // "Samsung Galaxy A55 8GB RAM 256GB" must be 256GB, not the first GB token).
    // Decimal separator: dot or comma (Vietnamese titles use "1,5TB").
    // (?<!\d): a match never starts inside a digit run, so a long run with no
    // unit costs one pass instead of one per digit (CodeQL polynomial regex).
    // The matches are unchanged: the leftmost one always starts at the run's
    // first digit.
    const sizeTokens = [...title.matchAll(/(?<!\d)(\d+(?:[.,]\d+)?)\s*(TB|GB)/gi)]
      .map(m => ({
        value: parseFloat(m[1].replace(',', '.')) * (m[2].toUpperCase() === 'TB' ? 1024 : 1),
        index: m.index ?? 0,
        raw: m[0],
      }))
      .filter(t => Number.isFinite(t.value) && t.value > 0);

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
    // adjacent RAM+ROM pairs ("12GB 256GB", laptop spec lists "32GB, 1TB") when no
    // explicit RAM keyword is present.
    // `\s*(?:X\s*)?` rather than `\s*X?\s*` (here and in the ROM patterns
    // below): the same strings, without the two adjacent \s* that made long
    // whitespace runs quadratic (CodeQL polynomial regex, DOS/Rate#537).
    const romExplicit = title.match(
      /(?:ROM|bộ nhớ trong)\s*(?:[:-]\s*)?(\d+(?:[.,]\d+)?)\s*(TB|GB)/i
    );
    const romLoose = title.match(
      /dung lượng\s*(?:[:-]\s*)?(\d+(?:[.,]\d+)?)\s*(TB|GB)(?!\s*(?:RAM|bộ\s*nhớ\s*RAM|dung\s*lượng\s*RAM))/i
    );

    const slashRamRom = title.match(/\b(\d{1,2})\s*(?:GB\s*)?\/\s*(\d+(?:[.,]\d+)?)\s*(TB|GB)\b/i);
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
      if (first.value <= 32 && second.value >= 64 && /^[\s/,-]+$/.test(between)) {
        first.claimed = true;
      }
    } else if (
      ramPhrases.length === 0 &&
      !romExplicit &&
      !romLoose &&
      claimable.filter(t => !t.claimed).length === 1
    ) {
      const [only] = claimable.filter(t => !t.claimed);
      // Retailers such as FPT Shop name iPads/laptops by their RAM ("iPad Pro 11 M5 2025 WiFi 12GB"):
      // tablets start at >=32GB storage and laptops at >=64GB, and non-power-of-two GB values
      // (6/12/18/24/36/48GB) are always RAM rather than storage (DOS/Rate#643).
      const isTabletOrLaptopRamOnly =
        (categorySlug === 'tablets' && only.value <= 24) ||
        (categorySlug === 'laptops' && only.value <= 48);
      const isNonPowerOfTwoRamSize = [3, 6, 12, 18, 24, 36, 48].includes(only.value);
      if (isTabletOrLaptopRamOnly || isNonPowerOfTwoRamSize) {
        only.claimed = true;
      }
    }

    const storageCandidates = claimable.filter(
      t => !t.claimed && Number.isInteger(t.value) && t.value > 0 && t.value <= MAX_VALID_STORAGE_GB
    );

    const baseKey = `${slugify(brand)}:${slugify(model)}`;
    // The registry holds one entry per line, not per size.
    const registryKey = appleSize
      ? `${slugify(brand)}:${slugify(model.slice(0, -appleSize.length))}`
      : baseKey;
    const benchmark = Object.hasOwn(CANONICAL_PHONE_REGISTRY, registryKey)
      ? CANONICAL_PHONE_REGISTRY[registryKey]
      : undefined;

    const toValidStorageGb = (val: number): number | null =>
      Number.isFinite(val) && Number.isInteger(val) && val > 0 && val <= MAX_VALID_STORAGE_GB
        ? val
        : null;

    let storageGb: number | null = null;
    let storageConfident = false;
    const marker = romExplicit ?? romLoose;
    if (categorySlug === 'earbuds') {
      // Earbuds have no storage variant and must key as :unknown with null storage (DOS/Rate#643, #657).
      storageGb = null;
      storageConfident = true;
    } else if (marker) {
      const candidateStorage = toValidStorageGb(
        parseFloat(marker[1].replace(',', '.')) * (marker[2].toUpperCase() === 'TB' ? 1024 : 1)
      );
      if (candidateStorage !== null) {
        storageGb = candidateStorage;
        storageConfident = true;
      }
    } else if (slashRamRom) {
      const candidateStorage = toValidStorageGb(
        parseFloat(slashRamRom[2].replace(',', '.')) *
          (slashRamRom[3].toUpperCase() === 'TB' ? 1024 : 1)
      );
      if (candidateStorage !== null) {
        storageGb = candidateStorage;
        storageConfident = true;
      }
    } else if (storageCandidates.length === 1) {
      storageGb = storageCandidates[0].value;
      storageConfident = true;
    } else if (storageCandidates.length === 0 && benchmark?.only_storage_gb != null) {
      storageGb = benchmark.only_storage_gb;
      storageConfident = true;
    }
    const storageKnown = storageGb !== null;

    // 4. Extract Colors from models / variations
    const colors: string[] = [];
    if (Array.isArray(safeRaw.models)) {
      for (const m of safeRaw.models) {
        if (colors.length >= MAX_NORMALIZED_COLOR_COUNT) break;
        const normalizedColor =
          typeof m?.name === 'string'
            ? stripControlChars(m.name)
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, MAX_NORMALIZED_COLOR_LENGTH)
                .trim()
            : '';
        if (normalizedColor.length > 0 && !colors.includes(normalizedColor)) {
          colors.push(normalizedColor);
        }
      }
    }

    const images: string[] = [];
    if (Array.isArray(safeRaw.images)) {
      for (const img of safeRaw.images) {
        if (images.length >= MAX_NORMALIZED_IMAGE_COUNT) break;
        const normalizedImg = normalizeHttpAssetUrl(img);
        if (normalizedImg && !images.includes(normalizedImg)) {
          images.push(normalizedImg);
        }
      }
    }

    // 5. Construct keys & slugs. Unknown storage keeps identity space explicit
    // (':unknown') instead of guessing a default (plan v7 §5.2).
    const modelKey = storageKnown ? `${baseKey}:${storageGb}gb` : `${baseKey}:unknown`;
    const storageDisplay =
      categorySlug === 'earbuds'
        ? 'Standard'
        : storageGb === null
          ? 'Không rõ dung lượng'
          : storageGb >= 1024 && storageGb % 512 === 0
            ? `${storageGb / 1024}TB`
            : `${storageGb}GB`;
    const canonicalName =
      categorySlug === 'earbuds'
        ? `${brand} ${model}`
        : storageKnown
          ? `${brand} ${model} ${storageDisplay}`
          : `${brand} ${model}`;
    const slug = slugify(canonicalName);

    // 6. Enrich with 10 Field Groups (PhoneArena structure + GSMArena depth)
    const isApple = brand === 'Apple';
    const isSmartphone = categorySlug === 'smartphones';

    const titleScreenMatch =
      categorySlug === 'earbuds' ? null : title.match(/\b(\d{1,2}(?:[.,]\d)?)\s*(?:inch|in\b|")/i);
    const parsedTitleScreen = titleScreenMatch
      ? parseFloat(titleScreenMatch[1].replace(',', '.'))
      : null;
    const titleScreenSize =
      parsedTitleScreen !== null &&
      Number.isFinite(parsedTitleScreen) &&
      parsedTitleScreen >= 0.8 &&
      parsedTitleScreen <= 20
        ? parsedTitleScreen
        : null;

    const claimedRamValue = claimable.find(t => t.claimed)?.value ?? null;
    const validClaimedRam =
      claimedRamValue !== null &&
      Number.isFinite(claimedRamValue) &&
      Number.isInteger(claimedRamValue) &&
      claimedRamValue > 0 &&
      claimedRamValue <= MAX_VALID_RAM_GB
        ? claimedRamValue
        : null;
    // Title-stated RAM takes precedence over benchmark RAM; earbuds and smartwatches
    // have no GB RAM spec (DOS/Rate#657).
    const ramGb =
      categorySlug === 'earbuds' || categorySlug === 'smartwatches'
        ? null
        : (validClaimedRam ?? benchmark?.ram_gb ?? null);
    // The registry describes one size of a line: its screen and battery do not describe
    // the other size ("iPad Pro M4 13" is not the 11 inch entry) (DOS/Rate#1113).
    const appleInches = appleSize && !appleSize.endsWith('mm') ? parseFloat(appleSize) : null;
    const benchmarkSized =
      benchmark &&
      (appleInches === null ||
        Math.floor(benchmark.screen_size_inch ?? NaN) === Math.floor(appleInches))
        ? benchmark
        : undefined;
    const screenSize =
      categorySlug === 'earbuds'
        ? null
        : (benchmarkSized?.screen_size_inch ?? titleScreenSize ?? appleInches);
    const batteryMah = benchmarkSized ? benchmarkSized.battery_mah : null;
    const has5g = benchmark
      ? benchmark.has_5g
      : categorySlug === 'smartphones' || /\b5g\b/i.test(title);

    const fallbackOs =
      categorySlug === 'laptops'
        ? isApple
          ? 'macOS Sequoia'
          : 'Windows 11 Home'
        : categorySlug === 'tablets'
          ? isApple
            ? 'iPadOS 18'
            : 'Android 14'
          : categorySlug === 'smartwatches'
            ? isApple
              ? 'watchOS 11'
              : brand === 'Garmin'
                ? 'Garmin OS'
                : 'Wear OS 5'
            : categorySlug === 'earbuds'
              ? isApple
                ? 'Apple AudioOS'
                : 'Bluetooth 5.3 Audio DSP'
              : isApple
                ? 'iOS 18'
                : 'Android 14';

    const fallbackScreenSize =
      screenSize ||
      (categorySlug === 'laptops'
        ? isApple
          ? 13.6
          : 14.0
        : categorySlug === 'tablets'
          ? 11.0
          : categorySlug === 'smartwatches'
            ? 1.4
            : categorySlug === 'earbuds'
              ? 1.0
              : isApple
                ? 6.1
                : 6.6);

    const fallbackScreenType =
      categorySlug === 'laptops'
        ? isApple
          ? 'Liquid Retina IPS'
          : 'IPS / OLED Anti-Glare'
        : categorySlug === 'tablets'
          ? isApple
            ? 'Liquid Retina IPS, True Tone'
            : 'IPS LCD / AMOLED, 120Hz'
          : categorySlug === 'smartwatches'
            ? 'AMOLED Always-On Touchscreen'
            : categorySlug === 'earbuds'
              ? 'Status LED Indicator'
              : isApple
                ? 'Super Retina XDR OLED, HDR10'
                : 'AMOLED, 120Hz, HDR10+';

    const fallbackChip =
      categorySlug === 'laptops'
        ? isApple
          ? 'Apple M-Series'
          : 'Intel Core / AMD Ryzen'
        : categorySlug === 'tablets'
          ? isApple
            ? 'Apple M / A-Series'
            : 'Snapdragon / Dimensity'
          : categorySlug === 'smartwatches'
            ? isApple
              ? 'Apple S-Series SiP'
              : 'Wearable Dual-Core SoC'
            : categorySlug === 'earbuds'
              ? isApple
                ? 'Apple H-Series Audio Chip'
                : 'Bluetooth 5.3 ANC DSP'
              : isApple
                ? 'Apple A-Series'
                : 'Snapdragon / Dimensity';

    const fallbackMainCamera =
      categorySlug === 'laptops'
        ? '1080p FHD Webcam with Dual-Array Mic'
        : categorySlug === 'earbuds'
          ? 'Multi-Mic Array + Active Noise Cancellation (ANC)'
          : categorySlug === 'smartwatches'
            ? 'Optical Heart Rate + SpO2 Blood Oxygen Sensor'
            : '50 MP (wide, OIS)';

    const fallbackSecondCamera =
      categorySlug === 'laptops'
        ? 'IR Camera / Privacy Shutter'
        : categorySlug === 'earbuds'
          ? 'Voice Pickup & Ambient Sound Sensor'
          : categorySlug === 'smartwatches'
            ? 'Accelerometer + Gyroscope + Altimeter'
            : '12 MP (ultrawide)';

    const fallbackFrontCamera =
      categorySlug === 'laptops'
        ? '1080p FHD Webcam'
        : categorySlug === 'earbuds'
          ? 'Capacitive Touch Controls'
          : categorySlug === 'smartwatches'
            ? 'AMOLED Touch + Physical Crown/Button'
            : '12 MP';

    const fallbackKeyCamera =
      categorySlug === 'laptops'
        ? '1080p FHD Webcam'
        : categorySlug === 'earbuds'
          ? 'Active Noise Cancellation (ANC)'
          : categorySlug === 'smartwatches'
            ? 'Optical HR + SpO2 Sensor'
            : '50 MP OIS';

    const fallbackBatteryMah =
      batteryMah ||
      (categorySlug === 'laptops'
        ? 4800
        : categorySlug === 'tablets'
          ? 8000
          : categorySlug === 'smartwatches'
            ? 400
            : categorySlug === 'earbuds'
              ? 500
              : isApple
                ? 3561
                : 5000);

    const fallbackChargingW =
      benchmark?.charging_w ||
      (categorySlug === 'laptops'
        ? 65
        : categorySlug === 'tablets'
          ? 30
          : categorySlug === 'smartwatches'
            ? 10
            : categorySlug === 'earbuds'
              ? 5
              : isApple
                ? 25
                : 45);

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

    const rawPriceMinInput: unknown = safeRaw.priceMin;
    const rawPriceMin = typeof rawPriceMinInput === 'boolean' ? NaN : Number(rawPriceMinInput);
    const safePriceMin =
      Number.isFinite(rawPriceMin) && rawPriceMin > 0 && rawPriceMin <= MAX_VALID_VND_PRICE
        ? rawPriceMin
        : 0;

    const specifications: ProductSpecifications = {
      category_slug: categorySlug,
      availability: {
        announced: benchmark?.release_date || '2024',
        status: 'Available',
        prices_msrp: `${storageDisplay}: ${safePriceMin.toLocaleString('vi-VN')}₫`,
      },
      design: {
        dimensions: benchmark?.dimensions || undefined,
        weight_g: benchmark?.weight_g || undefined,
        materials: isSmartphone
          ? isApple
            ? 'Ceramic Shield front, glass back, metal frame'
            : 'Glass front/back, metal frame'
          : undefined,
        resistance:
          benchmark?.ip_rating || (isSmartphone ? 'IP68 dust/water resistant' : undefined),
        biometrics: isSmartphone
          ? isApple
            ? /^iPhone SE\b/i.test(model)
              ? 'Touch ID'
              : 'Face ID'
            : 'Fingerprint (under display), Face unlock'
          : undefined,
        keys: isSmartphone
          ? isApple
            ? 'Action Button, Camera Control, Volume, Power'
            : 'Volume, Power'
          : undefined,
        colors: colors.length > 0 ? colors : ['Tiêu chuẩn'],
      },
      display: {
        size_inch: categorySlug === 'earbuds' ? undefined : screenSize || undefined,
        type: benchmark?.screen_type || fallbackScreenType,
        resolution: benchmark?.resolution || undefined,
        refresh_rate_hz:
          categorySlug === 'earbuds'
            ? undefined
            : benchmark?.refresh_rate_hz || (isSmartphone ? (isApple ? 60 : 120) : undefined),
        ppi: isSmartphone ? (benchmark?.screen_size_inch === 6.8 ? 505 : 460) : undefined,
        protection: isSmartphone
          ? isApple
            ? 'Ceramic Shield'
            : 'Corning Gorilla Glass'
          : undefined,
        features: isSmartphone
          ? isApple
            ? 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch'
            : 'Always-on display, HDR10+, Eye Comfort Shield'
          : undefined,
      },
      hardware: {
        chipset: benchmark?.chipset || undefined,
        cpu: benchmark?.cpu || undefined,
        gpu: benchmark?.gpu || undefined,
        ram_gb: ramGb || undefined,
        storage_gb: storageGb !== null && storageGb > 0 ? storageGb : undefined,
        storage_expansion: 'Không hỗ trợ thẻ nhớ',
        os: benchmark?.os || fallbackOs,
      },
      battery: {
        capacity_mah: batteryMah || undefined,
        type: 'Li-Ion, không thể tháo rời',
        charging: isApple ? 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2' : 'Sạc nhanh USB-C PD/PPS',
        fast_charging_w: fallbackChargingW,
        reverse_charging: false,
      },
      camera: {
        rear_setup: rearSetupLabel,
        main_camera: benchmark?.rear_camera || fallbackMainCamera,
        second_camera: benchmark?.second_camera || fallbackSecondCamera,
        third_camera: benchmark?.third_camera || undefined,
        fourth_camera: benchmark?.fourth_camera || undefined,
        front_camera: benchmark?.front_camera || fallbackFrontCamera,
        flash: isApple ? 'True Tone Dual-LED' : 'LED flash, auto-HDR, panorama',
        video_recording: '4K@30/60fps, 1080p@30/60/120/240fps, HDR',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 6E/7, dual-band, Wi-Fi Direct',
        usb: 'USB Type-C, OTG',
        sensors: isSmartphone
          ? isApple
            ? 'Face ID, gia tốc kế, con quay hồi chuyển, tiệm cận, la bàn, khí áp kế'
            : 'Vân tay dưới màn hình, gia tốc kế, con quay hồi chuyển, tiệm cận, la bàn'
          : undefined,
        location: 'GPS, GLONASS, Galileo, QZSS, BeiDou',
        nfc: true,
        other: isApple ? 'Ultra Wideband (UWB), SOS vệ tinh' : 'Hỗ trợ OTG, Chia sẻ nhanh',
      },
      cellular:
        !has5g && categorySlug !== 'smartphones'
          ? {
              has_5g: false,
              technology:
                categorySlug === 'earbuds' || categorySlug === 'laptops'
                  ? 'Wi-Fi / Bluetooth (No Cellular)'
                  : 'Wi-Fi / Bluetooth',
              sim_type: 'No SIM',
              volte: false,
              vowifi: false,
            }
          : {
              has_5g: has5g,
              bands_5g: has5g ? 'SA/NSA/Sub6' : undefined,
              bands_4g: 'LTE Cat 20',
              technology: has5g ? 'GSM / HSPA / LTE / 5G' : 'GSM / HSPA / LTE',
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
        sar_head: isSmartphone ? '1.10 W/kg' : undefined,
        sar_body: isSmartphone ? '1.15 W/kg' : undefined,
      },
    };

    const keySpecs: KeySpecs = {
      screen:
        categorySlug === 'earbuds'
          ? benchmark?.screen_type?.split(',')[0] || 'TWS In-Ear + Charging Case'
          : `${fallbackScreenSize}" ${benchmark?.screen_type?.split(',')[0] || fallbackScreenType.split(',')[0]}`,
      chip: benchmark?.chipset?.split('(')[0]?.trim() || fallbackChip,
      camera: benchmark?.rear_camera ? benchmark.rear_camera.split(',')[0] : fallbackKeyCamera,
      battery: `${fallbackBatteryMah} mAh (${fallbackChargingW}W)`,
      storage: storageDisplay,
      ram: ramGb ? `${ramGb}GB` : undefined,
    };

    const sanitizedDescription =
      typeof safeRaw.description === 'string'
        ? stripControlChars(safeRaw.description).trim().slice(0, MAX_NORMALIZED_DESCRIPTION_LENGTH)
        : undefined;
    const condition = detectProductCondition(title, sanitizedDescription);
    const origin = detectProductOrigin(title, sanitizedDescription);

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
      images,
      specifications,
      key_specs: keySpecs,
      description:
        sanitizedDescription && sanitizedDescription.length > 0 ? sanitizedDescription : undefined,
      is_benchmark_enriched: Boolean(benchmark),
      spec_source: benchmark ? 'benchmark_registry' : 'crawled_title',
    };
  }
}
