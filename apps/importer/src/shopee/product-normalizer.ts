import {
  MAX_VALID_VND_PRICE,
  UNKNOWN_VARIANT_KEY,
  type ProductSpecifications,
  type KeySpecs,
  type VariantSource,
} from '@repo/shared-data';
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
  /**
   * Item fields (DOS/Rate#1151). `normalize()` always sets them; they are optional
   * so candidates built elsewhere stay valid, and the matcher derives the keys
   * from `model_key` when they are missing.
   * `item_key` = `brand:model`, the first two `model_key` segments.
   */
  item_key?: string;
  /** The literal third `model_key` segment: `256gb`, `1024gb`, `unknown`. */
  variant_key?: string;
  /** Item name and slug, never with a storage size. */
  item_name?: string;
  item_slug?: string;
  /**
   * The listing's variant is known: a stated or single-size storage, or a line
   * with no storage axis (earbuds). False only for "storage not stated".
   */
  variant_known?: boolean;
  /** How the variant was found; null when it is not known. */
  variant_source?: Extract<VariantSource, 'title' | 'single_size' | 'single_variant'> | null;
  /**
   * False when the title gives no model segment. The key then carries the
   * `unkeyed` placeholder model instead of an empty segment (`samsung::unknown`),
   * and the pipeline and matcher reject the candidate (UnkeyableProductTitleError).
   */
  keyable?: boolean;
  name: string;
  slug: string;
  storage_gb: number | null; // null = unparseable from the title; identity carries ':unknown'
  needs_review: boolean; // true when identity could not be confidently derived or listing is non-new (plan v7 §5.2, Audit C6)
  condition?: ProductCondition;
  origin?: ProductOrigin;
  ram_gb: number | null;
  screen_size_inch: number | null;
  battery_mah: number | null;
  /** null = not known: no registry entry and no 5G in a phone or tablet title (DOS/Rate#1196). */
  has_5g: boolean | null;
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

/** Model segment of a title that names no model (`keyable: false`). */
export const UNKEYED_MODEL_SEGMENT = 'unkeyed';

/**
 * A title with no model to key on (e.g. it would key as `samsung::unknown`). The
 * listing has no identity to match, so it is rejected before anything is written
 * (DOS/Rate#1151). `normalize()` itself never throws; it marks `keyable: false`.
 */
export class UnkeyableProductTitleError extends Error {
  readonly code = 'UNKEYABLE_PRODUCT_TITLE';
  constructor(title: string) {
    super(
      `Cannot key product title (no model segment): ${JSON.stringify(String(title ?? '').slice(0, 200))}`
    );
    this.name = 'UnkeyableProductTitleError';
  }
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

/** Apple apps and services a device can support or run. */
const APPLE_SERVICE = String.raw`apple\s?(?:tv\+?|music|airplay\s?\d?|home(?:kit)?|arcade)|airplay\s?\d?|homekit|siri`;
/** Ends a service name: "TV+" keeps its "+", which would otherwise read as a Plus model. */
const SERVICE_END = String.raw`(?![a-z0-9+])`;
/** "hỗ trợ Apple TV", "tích hợp: AirPlay 2", "có ứng dụng Apple TV", "works with Siri". */
const SERVICE_MENTION_RE = new RegExp(
  String.raw`\b(?:hỗ trợ|tích hợp|có sẵn|cài sẵn|ứng dụng|app|kết nối|tương thích(?: với)?|supports?|works with|compatible with):? (?:(?:ứng dụng|app) )?(?:${APPLE_SERVICE})${SERVICE_END}`,
  'gi'
);
/**
 * A television of another brand: an "Apple TV" in it is the app, never the Apple TV box
 * ("Apple TV 4K - Smart TV Box" names no other brand and stays the box).
 */
const TELEVISION_TITLE_RE = /\btivi\b|\b(?:smart|google|android|qled|oled) ?tv\b/i;
const TELEVISION_BRAND_RE =
  /\b(?:samsung|lg|sony|tcl|xiaomi|casper|panasonic|sharp|toshiba|philips|hisense|coocaa|aqua|skyworth|ffalcon|asanzo|nanoco)\b/i;
const APPLE_SERVICE_RE = new RegExp(String.raw`\b(?:${APPLE_SERVICE})${SERVICE_END}`, 'gi');

/**
 * Drops the apps and services a title says the product supports, so they set no brand or
 * model: "Smart Tivi Samsung 55 inch hỗ trợ Apple TV" is a Samsung, not an Apple TV
 * (DOS/Rate#1195). `title` has single spaces.
 */
function stripServiceMentions(title: string): string {
  const stripped = title.replace(SERVICE_MENTION_RE, ' ');
  const otherBrandTv = TELEVISION_TITLE_RE.test(stripped) && TELEVISION_BRAND_RE.test(stripped);
  return (otherBrandTv ? stripped.replace(APPLE_SERVICE_RE, ' ') : stripped)
    .replace(/ {2,}/g, ' ')
    .trim();
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
  // An Apple Pencil is never the iPhone a title with no line falls back to; a stylus that
  // only says "Pencil" is not Apple's (DOS/Rate#1194).
  [/apple\s*pencil/i, 'Pencil'],
];

/**
 * The product's own part of a title, before a gift or bundle after it: "HomePod mini" in
 * "HomePod mini tặng dây Apple Watch Series 10", "MacBook Air M3" in "MacBook Air M3 +
 * Apple Watch", "HomePod mini (Tặng dây Apple Watch)". A marker that opens the title
 * ("Tặng ốp - Apple Watch", "[Tặng ốp] Apple Watch") leaves it whole; one after only a
 * word ("Quà tặng Apple Watch") leaves a part that names no product. Composed
 * form, so "tặng" is found in a decomposed (NFD) title too (DOS/Rate#1407).
 */
function ownProductPart(title: string): string {
  const composed = title.normalize('NFC');
  // A bracketed promo that opens the title is skipped when the product follows it: "[Sạc
  // Apple Watch tặng kèm] AirPods Pro 2" is the AirPods, but "(AirPods Pro 2 tặng dây
  // Apple Watch) Chính hãng" names the product inside the brackets.
  const block = /^\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】)/u.exec(composed)?.[0].length ?? 0;
  const lead =
    block > 0 && APPLE_FAMILIES.some(([family]) => family.test(composed.slice(block))) ? block : 0;
  const found = composed.slice(lead).search(/(?<![\p{L}\d])(?:tặng|kèm)(?![\p{L}\d])| ?\+ /iu);
  const at = found < 0 ? -1 : lead + found;
  return at > 0 ? composed.slice(0, at) : composed;
}

/** True when the text names an Apple family other than `line` (DOS/Rate#1407). */
function namesAppleFamilyOtherThan(text: string, line: string): boolean {
  return APPLE_FAMILIES.some(([family, name]) => name !== line && family.test(text));
}

const APPLE_GENERATION_BY_YEAR: Readonly<Record<string, string>> = {
  'TV 4K 2017': '1',
  'TV 4K 2021': '2',
  'TV 4K 2022': '3',
  'HomePod 2018': '1',
  'HomePod 2023': '2',
};

/** "Apple TV 4K II" is the 2nd generation (DOS/Rate#1194). */
const ROMAN_GENERATIONS: Readonly<Record<string, string>> = { ii: '2', iii: '3', iv: '4' };

/**
 * A chip that names the generation of a line a title states without one: the Apple TV 4K
 * (A15) is the 3rd (2022). Read only when the title names no generation (DOS/Rate#1194).
 */
const APPLE_CHIP_GENERATIONS: ReadonlyArray<readonly [string, RegExp, string]> = [
  ['TV 4K', /\ba15\b/i, 'TV 4K 3'],
  ['TV 4K', /\ba12\b/i, 'TV 4K 2'],
  ['TV 4K', /\ba10x\b/i, 'TV 4K 1'],
  ['AirPods', /\bh2\b/i, 'AirPods 4'],
  ['HomePod', /\bs7\b/i, 'HomePod 2'],
];

/**
 * Apple part numbers (the 5 characters before the region suffix, "MN873SA/A") that name
 * a line's generation: [line without a generation, line with it] (DOS/Rate#1194).
 */
const APPLE_PART_NUMBERS: Readonly<Record<string, readonly [string, string]>> = {
  MQD22: ['TV 4K', 'TV 4K 1'],
  MP7P2: ['TV 4K', 'TV 4K 1'],
  MXGY2: ['TV 4K', 'TV 4K 2'],
  MXH02: ['TV 4K', 'TV 4K 2'],
  MN873: ['TV 4K', 'TV 4K 3'],
  MN893: ['TV 4K', 'TV 4K 3'],
  MV7N2: ['AirPods', 'AirPods 2'],
  MRXJ2: ['AirPods', 'AirPods 2'],
  MME73: ['AirPods', 'AirPods 3'],
  MPNY3: ['AirPods', 'AirPods 3'],
  MXP63: ['AirPods', 'AirPods 4'],
  MXP93: ['AirPods', 'AirPods 4'],
  MQD83: ['AirPods Pro', 'AirPods Pro 2'],
  MTJV3: ['AirPods Pro', 'AirPods Pro 2'],
  MQHV2: ['HomePod', 'HomePod 1'],
  MQHW2: ['HomePod', 'HomePod 1'],
  MQJ73: ['HomePod', 'HomePod 2'],
  MQJ83: ['HomePod', 'HomePod 2'],
  MK0C2: ['Pencil', 'Pencil 1'],
  MQLY3: ['Pencil', 'Pencil 1'],
  MU8F2: ['Pencil', 'Pencil 2'],
  MUWA3: ['Pencil', 'Pencil USB-C'],
  MX2D3: ['Pencil', 'Pencil Pro'],
};

/**
 * Detect canonical category slug from product title across all 5 tech categories.
 */
export function detectCategorySlug(title: string): CanonicalCategorySlug {
  const t = typeof title === 'string' ? title.normalize('NFC').toLowerCase() : '';
  // A gift or bundle after the product is not its category: "AirPods Pro 2 tặng dây Apple
  // Watch" is earbuds, "Apple iPhone 16 tặng smartwatch" a phone (DOS/Rate#1407). An own
  // part that names no category falls back to the whole title, unless it names another
  // Apple product.
  const own = ownProductPart(t);
  if (own !== t) {
    const ownSlug = categorySlugOf(own);
    if (ownSlug) return ownSlug;
    if (namesAppleFamilyOtherThan(own, 'Watch')) return 'smartphones';
  }
  return categorySlugOf(t) ?? 'smartphones';
}

/** The category a lower-cased title names, or null (DOS/Rate#1407). */
function categorySlugOf(t: string): CanonicalCategorySlug | null {
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
  return null;
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
    // The watch case (mm) the size-dependent specs (screen, battery, weight, dimensions)
    // describe. A title naming another case gets none of them and is not benchmark
    // enriched (DOS/Rate#1152).
    case_mm?: number;
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
  // One storage (64GB), so a title without it keys like the `:64gb` seed (M0 inventory,
  // DOS/Rate#1148, #1152). Size-dependent specs are the 42mm's (`case_mm`).
  'apple:watch-series-10': {
    case_mm: 42,
    screen_size_inch: 1.77,
    battery_mah: 327,
    ram_gb: 2,
    chipset: 'Apple S10 SiP (64-bit dual-core processor)',
    cpu: 'Dual-core S10 with 4-core Neural Engine',
    gpu: 'Apple Watch integrated GPU',
    os: 'watchOS 11',
    weight_g: 30,
    dimensions: '42.0 x 36.0 x 9.7 mm',
    resolution: '374 x 446 pixels (~326 ppi)',
    screen_type: 'Wide-angle LTPO3 OLED Always-On Retina display, 1-60Hz, 2000 nits (peak)',
    refresh_rate_hz: 60,
    rear_camera: 'Optical Heart Sensor Gen 3 + Electrical Heart Sensor (ECG)',
    second_camera: 'Depth gauge (6m) + Water temperature sensor',
    front_camera: 'Ambient light & Double Tap gesture sensor',
    charging_w: 15,
    has_5g: false,
    release_date: 'September 2024',
    ip_rating: 'WR50 water resistant (50m) + IP6X dust resistant',
    only_storage_gb: 64,
  },
  // Size-dependent specs are the 46mm's (`case_mm`, DOS/Rate#1211).
  'apple:watch-series-11': {
    case_mm: 46,
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
// js/polynomial-redos). A unit ends where a letter does, Vietnamese ones included: "13
// tặng" or "13 hãng" is a bare 13, not "13 t(b)" or "13 h"; "15 tháng" (warranty), "10%"
// or "15 gói" is no size (DOS/Rate#1291).
// A number right before "năm" is a duration or a shop's age ("13 năm", "Shop 13 năm",
// "iStore 13+ năm"), never a size (DOS/Rate#1410). The one exception is the release-year
// form, the size right after the line (up to three chip, storage, network or generation
// words between) and a four-digit year after "năm" that is no count ("2000 đơn"): "iPad
// Pro 11 năm 2022", "MacBook Air chip M2 13 năm sản xuất 2022", "iPad Pro M4 13 năm-2024"
// (DOS/Rate#1317). A shop-age word after the year ("13 năm 2024 uy tín") keeps it a
// shop's age.
// "16 RAM 512" is the RAM; "13 RAM 8GB" (a RAM size follows) is the screen's 13
// (DOS/Rate#1317).
const UNIT_END = String.raw`(?![\p{L}\p{M}\d])`;
const NAM_AFTER_SIZE = String.raw`\d{1,2}(?:[.,]\d)?(?: ?\+)? ?năm(?![\p{L}\d])`;
const LINE_BEFORE_SIZE = String.raw`(?:ipad (?:pro|air)|macbook (?:pro|air))(?: (?:\(?(?:chip )?m\d{1,2}(?: pro| max)?\)?|\d{2,4} ?(?:gb|tb)|wi-?fi|5g|4g|lte|cellular|gen ?\d{1,2}|\d{1,2})){0,3} `;
const YEAR_AFTER_NAM = String.raw` ?(?:(?:sx|sản xuất|ra mắt|phát hành) ?)?(?:[.:/–-] ?)?(?:19|20)\d\d(?:\/(?:19|20)\d\d)?(?![\p{L}\d%/])(?! (?:đơn|khách|người|lượt|máy|sản phẩm|đánh giá|review|kinh nghiệm|uy tín|hoạt động|thành lập|bán hàng|chuyên|kinh doanh|phát triển)(?![\p{L}\d]))`;
const SIZE_NOT_PRECEDED_BY = String.raw`(?<![\d.,a-z])(?<!\d ?\/ ?)(?<!(?:ram|os|sonoma|sequoia|ventura|monterey|tahoe) )(?!(?<!${LINE_BEFORE_SIZE})${NAM_AFTER_SIZE})(?!${NAM_AFTER_SIZE}(?!${YEAR_AFTER_NAM}))`;
const SIZE_NOT_FOLLOWED_BY = String.raw`(?![.,]?\d|[a-z]| ?(?:gb?${UNIT_END}|tb?${UNIT_END}|th${UNIT_END}|gen|mm|w${UNIT_END}|h${UNIT_END}|\/|-? ?(?:core|nhân|lõi)|cpu|gpu|tiếng|giờ|%|(?:tháng|ngày|tuần|phút|gói|kỳ|nghìn|ngàn|triệu|vnd|months?|years?|days?|weeks?|hours?)${UNIT_END}|ram${UNIT_END}(?! ?\d{1,2}(?!\d))))`;
const SIZE_MARKER = String.raw` ?(?:-? ?inch|in${UNIT_END}|"|''|”|″)`;
const IPAD_SIZE = String.raw`(11|12[.,]9|13)(?:[.,]0)?`;
const MACBOOK_AIR_SIZE = String.raw`(13|15)(?:[.,]\d)?`;
const MACBOOK_PRO_SIZE = String.raw`(1[3-6])(?:[.,]\d)?`;
const sizePatterns = (size: string): [RegExp, RegExp] => [
  new RegExp(String.raw`(?<![\d.,])` + size + SIZE_MARKER, 'iu'),
  new RegExp(SIZE_NOT_PRECEDED_BY + size + SIZE_NOT_FOLLOWED_BY, 'iu'),
];
const WATCH_BAND_WORD =
  /(?<!kh[\p{L}\p{M}]{1,3}ng )(?:d(?:\u00e2|a\u0302)y|band|strap|loop|bracelet)(?![\p{L}\d])/iu;
const WATCH_SIZE = /(?<!\d)(38|4[0-2]|4[4-6]) ?mm\b/i;
const LIST_WATCH_SIZE = /^ ?(?:38|4[0-2]|4[4-6]) ?mm\b/i;
const LONE_WATCH_SIZE = /^ ?(?:38|4[0-2]|4[4-6]) ?mm ?$/i;
const LAST_WATCH_SIZE = /(?<!\d)(?:38|4[0-2]|4[4-6]) ?mm ?$/i;
const WATCH_RANGE_SEP = /^(?: - |\u2013)$/;
const WATCH_CASE_WORD = /(?<![\p{L}\d])(?:case|mặt|vỏ)(?![\p{L}\d])/iu;
// A size naming the case: "46mm Titanium Case", "46mm Viền Titanium", "Case 42mm"
// (DOS/Rate#1223). At most two words between the size and a case word that follows it.
const NAMED_CASE_SIZE =
  /(?<!\d)(38|4[0-2]|4[4-6]) ?mm(?: [\p{L}\d-]+){0,2} (?:case|vỏ|viền)(?![\p{L}\d])|(?<![\p{L}\d])(?:case|vỏ|viền|mặt) (38|4[0-2]|4[4-6]) ?mm\b/iu;
// A part about a box, a cover, a gift or a fit names no case of the watch itself
// ("tặng Silicone Case 46mm", "ốp TPU 46mm", DOS/Rate#1263).
const CASE_ACCESSORY_WORD =
  /(?<![\p{L}\d])(?:fits?|hộp|ốp|kèm|tặng|quà|gift|silicone|silicon|tpu|bao da|compatible|tương thích|cho|for)(?![\p{L}\d])/iu;
// "tặng/kèm" and up to four words, then a watch or screen size, or a list of them
// ("tặng ốp 42mm / 46mm", "tặng ốp 11 inch, 13 inch", DOS/Rate#1291).
const GIFT_BARE_END = String.raw`(?= ?(?:$|[,|;)+/]|(?:tặng|kèm|quà)(?![\p{L}\d])))`;
const GIFT_SIZE = String.raw`(?:(?:38|4[0-2]|4[4-6]) ?mm\b|\d{1,2}(?:[.,]\d)? ?(?:inch\b|in\b|")|(?:38|4[0-2]|4[4-6]|1[0-6](?:[.,]\d)?)${GIFT_BARE_END})`;
const GIFTED_ACCESSORY_SIZE = new RegExp(
  String.raw`(?<![\p{L}\d])(quà tặng|tặng|kèm)((?: [\p{L}-]+){1,4}?) ?${GIFT_SIZE}(?: ?(?:\/|,|hoặc|or) ?${GIFT_SIZE})*`,
  'giu'
);
// The sizes a gift names: a watch case ("46mm") or a screen ("11", "12.9").
const GIFT_SIZE_VALUE = new RegExp(
  String.raw`(?<!\d)((?:38|4[0-2]|4[4-6]) ?mm|\d{1,2}(?:[.,]\d)?(?= ?(?:inch|in|"))|(?:38|4[0-2]|4[4-6]|1[0-6](?:[.,]\d)?)${GIFT_BARE_END})`,
  'giu'
);
// A size the product's part names in a form no size reading takes, so a gift's size must
// not stand in for it (DOS/Rate#1291): for a watch a bare case number or "size 46"
// ("Series 10 size 46 tặng ốp 42mm"); for an iPad or a MacBook a bare screen number or
// one with a decimal ("iPad Air 10.9 tặng ốp 11 inch"), with the guards of a bare size
// above (no storage, RAM, OS version, warranty or percentage).
const WATCH_BARE_SIZE = new RegExp(
  SIZE_NOT_PRECEDED_BY + String.raw`(?:38|4[0-2]|4[4-6])` + SIZE_NOT_FOLLOWED_BY,
  'iu'
);
const SCREEN_BARE_SIZE = new RegExp(
  SIZE_NOT_PRECEDED_BY + String.raw`1[0-6](?:[.,]\d)?` + SIZE_NOT_FOLLOWED_BY,
  'iu'
);
// A lone size listed right after a gift's ("kèm hộp 46mm | 42mm"): a list of sizes.
const LISTED_AFTER_GIFT = /^ ?[,|/] ?(?:38|4[0-2]|4[4-6]) ?mm ?(?:[),|;]|$)/i;
// "size 46" names the watch's case when nothing else does.
// "size 42/46" lists two sizes.
const WATCH_SIZE_WORD = /(?<![\p{L}\d])size ?(38|4[0-2]|4[4-6])(?![.,]?\d|\p{L}| ?[/,-] ?\d)/giu;
// An accessory sold by the size it fits: a case, cover, film or box.
const GIFT_ACCESSORY_NOUN =
  /(?<![\p{L}\d])(?:ốp|case|bao da|silicone|silicon|tpu|cường lực|kính|miếng dán|vỏ|hộp|túi)(?![\p{L}\d])/iu;
// For a watch, "vỏ" with a material ("kèm vỏ nhôm 46mm") is the watch's own case, and a
// box ("hộp") is sold by no case size (DOS/Rate#1277).
const WATCH_GIFT_ACCESSORY_NOUN =
  /(?<![\p{L}\d])(?:ốp|case|bao da|silicone|silicon|tpu|cường lực|kính|miếng dán|vỏ(?! (?:nhôm|titan|titanium|thép|nhựa|aluminum|aluminium|stainless|steel)(?![\p{L}\d]))|túi)(?![\p{L}\d])/iu;
// The product's own part ends where "cho/for" or "+" starts another product; "GPS +
// Cellular" is the watch and "13+ năm" a shop's age (DOS/Rate#1389).
// A promo tag in front of the title is no part of the model: "[Mã giảm 50K]",
// "(Hàng mới)", "【Hot】" or "{ Kích T10 }" (DOS/Rate#1421).
const LEADING_PROMO_GROUPS = /^(?:\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】|\{[^}]*\}))+\s*/;
// So is a promo word right before the brand or its line: "Live Samsung Galaxy S26
// Ultra", "Hot Sale Samsung …", "Flash Sale Điện thoại Samsung …", "Sale Galaxy S26
// Ultra" (DOS/Rate#1421). Only then: "JBL Live Pro 2" or "Live Beam 3 - JBL" keep
// their "Live", and "Hotwav" is no "Hot". One promo word is matched at a time, so a
// long run of them costs linear time (CodeQL js/polynomial-redos).
const LEADING_PROMO_WORD =
  /^(?:live(?:stream)?|(?:hot|flash|big|siêu|mega) sale|sale(?: (?:off|sốc|sock))?|hot|deal(?: hot)?|giảm giá|xả kho)(?![\p{L}\d])(?: ?\d{1,2} ?%)?[\s:!|-]*/iu;
const MAX_LEADING_PROMO_WORDS = 4;
// A line name that stands for the brand at the start of a title.
const BRAND_LINES: Readonly<Record<string, readonly string[]>> = {
  Samsung: ['galaxy'],
  Xiaomi: ['redmi', 'poco'],
};
const BRAND_HEAD_PREFIX = String.raw`^(?:(?:điện thoại(?: thông minh| di động)?|smartphone|máy tính bảng|tablet|laptop|đồng hồ(?: thông minh)?|tai nghe) )?(?:(?:hàng )?chính hãng )?`;
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const brandHead = (brand: string): RegExp =>
  new RegExp(
    `${BRAND_HEAD_PREFIX}(?:${[brand, ...(BRAND_LINES[brand] ?? [])].map(escapeRegExp).join('|')})(?![\\p{L}\\d])`,
    'iu'
  );
const withoutLeadingPromoWords = (title: string, brand: string): string => {
  let rest = title;
  for (let i = 0; i < MAX_LEADING_PROMO_WORDS; i++) {
    const promo = rest.match(LEADING_PROMO_WORD);
    if (!promo) break;
    rest = rest.slice(promo[0].length);
  }
  return rest !== title && brandHead(brand).test(rest) ? rest : title;
};
const OWN_PART_END = / (?:cho|for) | ?\+ (?!cellular|lte|năm(?![\p{L}\d]))/iu;
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
function readAppleSize(model: string, rawTitle: string): string {
  // Composed form, so "tặng" is found in a decomposed (NFD) title too.
  const title = rawTitle.normalize('NFC');
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
  // The size of a gifted or bundled accessory is not the product's: "tặng Silicone Case
  // 46mm", "kèm ốp 46mm" lose that size; "kèm sạc 46mm GPS" and "kèm bút 13 inch" name
  // no accessory with a size of its own and keep it (DOS/Rate#1263).
  const productPart = title.slice(Math.max(0, at));
  const giftSizes = new Set<string>();
  const stripGift = (scope: string, noun: RegExp, sizes = new Set<string>()) =>
    scope.replace(GIFTED_ACCESSORY_SIZE, (m, word: string, words: string) => {
      if (!noun.test(words)) return m;
      for (const s of m.slice(word.length + words.length).matchAll(GIFT_SIZE_VALUE)) {
        sizes.add(
          s[1]!
            .replace(/ /g, '')
            .replace(',', '.')
            .replace(/\.0(?=mm|$)/, '')
            .replace(/mm$/, '')
            .toLowerCase()
        );
      }
      return `${word}${words}`;
    });
  const withoutGift = stripGift(
    productPart,
    family === 'watch' ? WATCH_GIFT_ACCESSORY_NOUN : GIFT_ACCESSORY_NOUN,
    giftSizes
  );
  // For a watch, "kèm vỏ nhôm 46mm" or "kèm hộp 46mm" names the watch's case only when the
  // rest of the title gives it no case of its own: "Series 10 kèm hộp 46mm, GPS 42mm" is
  // the 42mm (DOS/Rate#1291). A band size alone does not count as its own (DOS/Rate#1277).
  if (family === 'watch') {
    // A size listed right after the gift's ("kèm hộp 46mm | 42mm") is a list, not the case.
    const withoutBox = withoutGift.replace(
      GIFTED_ACCESSORY_SIZE,
      (m, word: string, words: string, offset: number, whole: string) =>
        GIFT_ACCESSORY_NOUN.test(words) && !LISTED_AFTER_GIFT.test(whole.slice(offset + m.length))
          ? `${word}${words}`
          : m
    );
    if (withoutBox !== withoutGift) {
      const own = readFamilySize(family, withoutBox, false) || readWordedWatchSize(withoutBox);
      if (own) return own;
    }
  }
  const read = readFamilySize(family, withoutGift);
  if (read) return read;
  // The same part the size is read from: not what follows "cho/for" or "+".
  const ownPart = withoutGift.split(OWN_PART_END)[0]!;
  if (family === 'watch') {
    const worded = readWordedWatchSize(withoutGift);
    if (worded) return worded;
  }
  // A size only the gift names is still the best evidence of the product's: an 11 inch
  // case fits an 11 inch iPad (DOS/Rate#1277). Only when the rest names no size at all (a
  // size it names but leaves unresolved, such as a band list or "mặt 46mm" inside a band
  // phrase, or one in a form no reading takes, such as "size 46" or "10.9", is never
  // replaced by the gift's), and only when the gift names one size ("tặng ốp 42mm /
  // 46mm" fits either).
  const giftSize = giftSizes.size === 1 ? [...giftSizes][0] : undefined;
  const namesOtherBare = (bare: RegExp) =>
    [...ownPart.matchAll(new RegExp(bare.source, 'giu'))].some(
      m => m[0].replace(',', '.') !== giftSize
    );
  const namesSize =
    family === 'watch'
      ? WATCH_SIZE.test(withoutGift) || namesOtherBare(WATCH_BARE_SIZE)
      : APPLE_SIZE_PATTERNS[family]!.some(re => re.test(ownPart)) ||
        namesOtherBare(SCREEN_BARE_SIZE);
  return namesSize || withoutGift === productPart || giftSizes.size !== 1
    ? ''
    : readFamilySize(family, productPart);
}

/**
 * A watch's "size 46" in the product's own part, outside a band phrase ("Sport Band size
 * 42 cho mặt 46mm" names the band's), when it names one size (DOS/Rate#1291).
 */
function readWordedWatchSize(scope: string): string {
  const own = scope.split(OWN_PART_END)[0]!;
  const sizes = new Set<string>();
  for (const part of own.split(/[),|;\u2013]| - /)) {
    for (const m of part.matchAll(WATCH_SIZE_WORD)) {
      const before = part.slice(0, m.index).normalize('NFC');
      if (WATCH_BAND_WORD.test(before) || CASE_ACCESSORY_WORD.test(before)) return '';
      sizes.add(m[1]!);
    }
  }
  return sizes.size === 1 ? `${[...sizes][0]}mm` : '';
}

/**
 * `readAppleSize` over one reading of the product's part of the title. `withBand` false
 * leaves out a watch size only a band names.
 */
function readFamilySize(family: string, scope: string, withBand = true): string {
  const own = scope.split(OWN_PART_END)[0]!;
  if (family === 'watch') {
    // A size outside a band phrase ("dây", "band", "strap", "loop" or "bracelet" up to the
    // next ")", ",", "|", ";", en dash or " - ") is the case's. A band is sold by the case
    // it fits ("Dây Cao Su 46mm"), so a band's size counts only when the title names no
    // other: "dây Sport Band 45mm cho mặt 42mm" does not tell the watch's (DOS/Rate#1124).
    // A band phrase with a size runs on over the parts after it that start with a size
    // and follow "," or "|": "Sport Loop 42mm | 46mm" or "Dây 42mm S/M, 46mm M/L" names
    // two band sizes, not a case (DOS/Rate#1137). A part that names the case ("46mm, 42mm
    // Aluminum Case") ends the list. An en dash or " - " between a band size and a bare
    // size is a range of band sizes ("Sport Loop 42mm - 46mm"), and two or more sizes
    // listed right before a band word are the band's ("GPS 40mm, 44mm Dây Sport Band"); a
    // size after the dash with more text ("Dây Vải 45mm - 46mm GPS") or a single size
    // before the band ("GPS 46mm, Dây Cao Su 46mm S/M") is still the case's (DOS/Rate#1162).
    const parts = own.split(/([),|;\u2013]| - )/);
    const outside: string[] = [];
    let bandList = false;
    let bandEnd = false;
    for (let i = 0; i < parts.length; i += 2) {
      const part = parts[i]!;
      const sep = parts[i - 1] ?? '';
      const listed = LIST_WATCH_SIZE.test(part) && !WATCH_CASE_WORD.test(part.normalize('NFC'));
      const ranged = bandEnd && WATCH_RANGE_SEP.test(sep) && LONE_WATCH_SIZE.test(part);
      if (bandList && ((/^[,|]$/.test(sep) && listed) || ranged)) {
        outside.push('');
        // "42mm S/M, 44mm - 46mm" ranges on from the listed size; "44mm M/L - 46mm" does not.
        bandEnd = LAST_WATCH_SIZE.test(part);
        continue;
      }
      const [before, ...band] = part.split(WATCH_BAND_WORD);
      // Walk back over the bare sizes listed before this band ("40mm, 44mm Dây"): k ends
      // at the first of them, and the part before it may end in one more ("GPS 40mm") if
      // it has no band of its own. A part before the list that names the case ("(Vỏ nhôm)
      // 46mm, 42mm Dây") keeps the list's first size as the case's, and a band that names
      // the case ("42mm Dây Sport Band mặt 46mm") starts no walk.
      const sizeBeforeBand =
        band.length > 0 &&
        LONE_WATCH_SIZE.test(before!) &&
        !WATCH_CASE_WORD.test(part.normalize('NFC'));
      const listSepAt = (n: number) =>
        /^[,|]$/.test(parts[2 * n - 1]!) || WATCH_RANGE_SEP.test(parts[2 * n - 1]!);
      let k = outside.length;
      while (sizeBeforeBand && k > 0 && listSepAt(k) && LONE_WATCH_SIZE.test(outside[k - 1]!)) k--;
      const head = k > 0 ? parts[2 * k - 2]! : '';
      const headCase = WATCH_CASE_WORD.test(head.normalize('NFC'));
      const headListed =
        sizeBeforeBand &&
        k > 0 &&
        listSepAt(k) &&
        LAST_WATCH_SIZE.test(head) &&
        !WATCH_BAND_WORD.test(head) &&
        !headCase;
      if ((k < outside.length && !headCase) || headListed) {
        for (let j = k; j < outside.length; j++) outside[j] = '';
        if (headListed) outside[k - 1] = outside[k - 1]!.replace(LAST_WATCH_SIZE, '');
        outside.push('');
      } else outside.push(before!);
      bandList = WATCH_SIZE.test(band.join(' '));
      bandEnd = LAST_WATCH_SIZE.test(band.join(' '));
    }
    // A part that names the case with one size ("46mm Titanium Case", "Case 42mm") says
    // the watch's size, whatever band size comes before it: "45mm Sport Band, 46mm
    // Titanium Case" is the 46mm (DOS/Rate#1223).
    // The size must sit next to the case word, and the part must not be about a box, a
    // cover or what something fits ("kèm vỏ hộp 42mm", "fits 42mm case").
    // A "| Case 46mm" after a part that already gives the watch a size outside any band
    // ("Series 10 42mm GPS | Case 46mm") is a bundled case, not the watch's (DOS/Rate#1263).
    // One pass: a part is after such a "|" once a sized part came before a "|" before it
    // (linear in the parts, DOS/Rate#1277).
    const afterSizedPipe: boolean[] = [];
    let sizedSeen = false;
    let armed = false;
    parts.forEach((p, k) => {
      if (k % 2 === 1) {
        if (p === '|' && sizedSeen) armed = true;
        return;
      }
      afterSizedPipe[k] = armed;
      if (
        WATCH_SIZE.test(p) &&
        !WATCH_BAND_WORD.test(p) &&
        !CASE_ACCESSORY_WORD.test(p.normalize('NFC'))
      ) {
        sizedSeen = true;
      }
    });
    const namedCase = parts
      .map((part, i) => ({ part: part.normalize('NFC'), i }))
      .filter(({ i }) => i % 2 === 0 && !afterSizedPipe[i])
      .map(({ part }) => part)
      .filter(
        part =>
          !WATCH_BAND_WORD.test(part) &&
          !CASE_ACCESSORY_WORD.test(part) &&
          [...part.matchAll(new RegExp(WATCH_SIZE, 'gi'))].length === 1
      )
      .map(part => {
        const m = part.match(NAMED_CASE_SIZE);
        return m?.[1] ?? m?.[2];
      })
      .filter(Boolean);
    if (namedCase.length === 1 && namedCase[0]) return `${namedCase[0]}mm`;
    const caseSize = outside.join(' ').match(WATCH_SIZE)?.[1];
    if (caseSize) return `${caseSize}mm`;
    const bandSize = own.match(WATCH_SIZE)?.[1];
    const sizes = new Set([...scope.matchAll(new RegExp(WATCH_SIZE, 'gi'))].map(m => m[1]));
    return withBand && bandSize && sizes.size === 1 ? `${bandSize}mm` : '';
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
    // An app or service the product supports names no brand or model: "Smart Tivi Samsung
    // ... hỗ trợ Apple TV" is a Samsung TV (DOS/Rate#1195).
    const identityTitle = stripServiceMentions(title);
    let brand = 'Khác';
    // Not the "ipad" in Xiaomi's "Mipad" (DOS/Rate#826).
    if (/apple|iphone|(?<![a-z])ipad|macbook|airpods/i.test(identityTitle)) brand = 'Apple';
    else if (/samsung|galaxy/i.test(identityTitle)) brand = 'Samsung';
    else if (/xiaomi|redmi|poco|\bmi\s*pad\b/i.test(identityTitle)) brand = 'Xiaomi';
    else if (/\bsony\b|w[fh]-1000|w[fh]1000xm|xperia/i.test(identityTitle)) brand = 'Sony';
    else if (
      /\bgarmin\b|forerunner|fenix|venu|vivo(?:active|smart|move|fit|sport|life)/i.test(
        identityTitle
      )
    )
      brand = 'Garmin';
    else if (/\blenovo\b|thinkpad|ideapad|legion/i.test(identityTitle)) brand = 'Lenovo';
    else if (/oppo/i.test(identityTitle)) brand = 'OPPO';
    // Not "Vivobook" / "Vivo Book" (Asus) (DOS/Rate#761); Garmin's Vivo lines are matched above.
    else if (/\bvivo(?!\s*book)/i.test(identityTitle)) brand = 'Vivo';
    else if (/realme/i.test(identityTitle)) brand = 'Realme';
    else if (/google|pixel/i.test(identityTitle)) brand = 'Google';
    else if (/\basus\b|\brog\b|zenbook|vivo\s*book|tuf\s*gaming/i.test(identityTitle))
      brand = 'Asus';
    else if (/\bdell\b|inspiron|\bxps\b|alienware|latitude/i.test(identityTitle)) brand = 'Dell';
    // "Omen" as a word: Sennheiser "Momentum" is not HP.
    else if (/\bhp\b|pavilion|victus|\bomen\b|elitebook|envy/i.test(identityTitle)) brand = 'HP';
    else if (/\bacer\b|nitro\s*\d|swift|predator|aspire/i.test(identityTitle)) brand = 'Acer';
    else if (/\bmsi\b|katana|cyborg|stealth|prestige/i.test(identityTitle)) brand = 'MSI';
    else if (/\bhuawei\b|matepad|freebuds|watch\s*gt/i.test(identityTitle)) brand = 'Huawei';
    else if (/\bbose\b|quietcomfort/i.test(identityTitle)) brand = 'Bose';
    else if (/\bjbl\b|tour\s*pro|tune\s*\d+/i.test(identityTitle)) brand = 'JBL';
    else if (/sennheiser|momentum/i.test(identityTitle)) brand = 'Sennheiser';
    else if (/oneplus/i.test(identityTitle)) brand = 'OnePlus';
    else if (/\bhonor\b|magicbook/i.test(identityTitle)) brand = 'Honor';
    // Apple's desktops and speakers, last so another brand wins, and not when the title
    // only names what it fits or looks like ("Bàn phím cho Mac mini") (DOS/Rate#819).
    else if (
      /\bimac\b|\bmac\s*(?:mini|studio)\b|homepod|\bvision\s*pro\b/i.test(identityTitle) &&
      !/\b(?:cho|for|giống)\s+(?:imac|mac|homepod|vision)/i.test(identityTitle)
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
    let modelTitle = identityTitle
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
      let appleTitle = modelTitle
        .replace(/ ?\(\s*(\d{1,2})(?:st|nd|rd|th)\s*gen(?:eration)?\s*\)/gi, ' $1')
        // Generation words read as the number: "Apple TV 4K thế hệ 3", "Gen 3", "3rd Gen"
        // and "II" are the 3rd and 2nd generation, in parentheses too: "AirPods (thế hệ
        // thứ 3)" is the "AirPods 3" (DOS/Rate#1194).
        .replace(/ ?\(\s*(?:thế\s*hệ\s*(?:thứ\s*)?|gen(?:eration)?\s*)(\d{1,2})\s*\)/gi, ' $1')
        .replace(/\bthế\s*hệ\s*(?:thứ\s*)?(\d{1,2})\b/gi, '$1')
        .replace(/\b(\d{1,2})(?:st|nd|rd|th)\s*gen(?:eration)?\b/gi, '$1')
        .replace(/\bgen(?:eration)?\s*(\d{1,2})\b/gi, '$1')
        .replace(
          /\b(pro|ultra|se|4k|homepod|airpods|pencil|max|mini|air) (ii|iii|iv)\b/gi,
          (_: string, line: string, roman: string) =>
            `${line} ${ROMAN_GENERATIONS[roman.toLowerCase()]}`
        );
      // An iPhone or iPad named after another Apple product as what it fits is not the
      // product: "AirPods Pro 2 cho iPhone Air" is the AirPods (DOS/Rate#819).
      const fitsAt = appleTitle.search(/ (?:cho|for) (?:iphone|ipad)\b/i);
      // Only another family counts: "Ốp lưng iPhone cho iPhone 15" is still the iPhone 15.
      if (
        fitsAt > 0 &&
        /airpods|\bwatch\b|macbook|apple\s*pencil/i.test(appleTitle.slice(0, fitsAt))
      )
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
      // A watch or AirPods in a gift or bundle after another Apple product is not the
      // product: "HomePod mini tặng dây Apple Watch Series 10" is the HomePod mini, "Apple
      // TV 4K tặng AirPods Pro 2" the Apple TV (DOS/Rate#1407).
      const ownAppleTitle = ownProductPart(appleTitle);
      const lineTitle = (line: string) =>
        namesAppleFamilyOtherThan(ownAppleTitle, line) ? ownAppleTitle : appleTitle;
      const watchMatch = lineTitle('Watch').match(
        // "Ultra 49mm" is the case size, not a generation (DOS/Rate#819). "Watch S10" is
        // the Series 10; only a generation (1 to 19) right after "Watch", with no unit or
        // letter after it, counts, so an "S 42mm" size, a "S 16cm" or "S 14-16cm" band
        // length or a "S/M" band is no series (DOS/Rate#1402).
        /(?:apple\s*)?watch\s*(ultra(?:\s*\d+(?!\d|\s*mm\b))?|series\s*\d+|se(?:\s*\d+(?!\d|\s*(?:mm|gb|tb)\b)|(?![a-z]))|s ?(?:1\d|[1-9])(?![\d.,a-z]|\s*(?:mm|cm|gb|tb|inch)\b| ?[-–] ?\d+(?:[.,]\d+)? ?cm\b))/i
      );
      const airpodsMatch = lineTitle('AirPods').match(
        // Each run of spaces has exactly one `\s*` that can match it, so long
        // whitespace cannot backtrack polynomially (CodeQL js/polynomial-redos).
        /airpods\s*(?:(pro)(?:\s*(?:(?:gen|thế\s*hệ)\s*|\(\s*)?(\d+))?|(max)|(?:(?:gen|thế\s*hệ)\s*)?(\d+))/i
      );

      // True when no Apple line is named and the model fell back to the iPhone.
      let noLine = false;
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
        // "S10" keys like "Series 10" (DOS/Rate#1402).
        model = `Watch ${watchMatch[1].trim().replace(/^s ?(?=\d)/i, 'Series ')}`;
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
          /^(?:TV|TV 4K|HomePod|HomePod mini|Mac mini|Mac Studio|iMac|Pencil)$/.test(model) &&
          generation
        )
          // Retailers name an Apple TV 4K or HomePod by its year as often as by its generation.
          model = `${model} ${APPLE_GENERATION_BY_YEAR[`${model} ${generation[1]}`] ?? generation[1]}`;
        else if (model === 'Pencil') {
          const pencil = appleTitle.slice(familyEnd).match(/^ ?\(? ?(pro|usb-?c)\b/i);
          if (pencil) model = /^pro$/i.test(pencil[1]!) ? 'Pencil Pro' : 'Pencil USB-C';
        }
        noLine = first === Infinity;
      }
      // A part number or chip names the generation a title leaves out: "Apple TV 4K
      // MN873SA/A" and "Apple TV 4K (A15)" are the 3rd (2022). A part number also names a
      // title with no line. A stated generation always wins, and only the product's own
      // part of the title counts, before a "+" bundle or what it fits (DOS/Rate#1194).
      const ownTitle = appleTitle.split(/ ?\+ | (?:cho|for|tương thích|dùng cho|kèm|tặng) /i)[0]!;
      const part = Array.from(
        ownTitle.matchAll(/\b(m[a-z0-9]{4})(?:[a-z]{1,2}(?:\/a)?)?\b/gi),
        m => {
          const partNumber = m[1]!.toUpperCase();
          return Object.hasOwn(APPLE_PART_NUMBERS, partNumber)
            ? APPLE_PART_NUMBERS[partNumber]
            : undefined;
        }
      ).find(Boolean);
      if (part && (model === part[0] || noLine)) model = part[1];
      else {
        const chipGeneration = APPLE_CHIP_GENERATIONS.find(
          ([line, chipPattern]) => model === line && chipPattern.test(ownTitle)
        );
        if (chipGeneration) model = chipGeneration[2];
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
    } else if (
      brand === 'Garmin' &&
      /forerunner\s*265[ -]?s(?![\p{L}\p{M}])(?! ?[/-] ?[a-z])/iu.test(modelTitle)
    ) {
      // The 265S is the 42mm model, not the 46mm 265 (DOS/Rate#1222): "265S", "265 S",
      // "265-S", "265S42mm", but not a "265 S/M" band size or a word ("265 Sport", and
      // "265 Sạc nhanh", whose next letter is not ASCII, DOS/Rate#1262).
      model = 'Forerunner 265S';
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
      const withoutLeadingPromo = withoutLeadingPromoWords(
        modelTitle.replace(LEADING_PROMO_GROUPS, '').trim(),
        brand
      );
      const cleaned = withoutLeadingPromo
        .replace(
          new RegExp(
            `^(?:(?:Hàng\\s+)?Chính\\s+hãng\\s+)?(?:(?:Điện\\s+thoại(?:\\s+thông\\s+minh|\\s+di\\s+động)?|Smartphone|Máy\\s+tính\\s+bảng|Tablet|Laptop|Máy\\s+tính\\s+xách\\s+tay|Đồng\\s+hồ(?:\\s+đeo\\s+tay)?(?:\\s+thông\\s+minh)?|Vòng\\s+đeo\\s+tay(?:\\s+thông\\s+minh)?|Vòng\\s+tay\\s+thông\\s+minh|Smartwatch|Tai\\s+nghe(?:\\s+Bluetooth|\\s+chống\\s+ồn|\\s+không\\s+dây)?|Earbuds)\\s+(?:(?:Hàng\\s+)?Chính\\s+hãng\\s+)?)?(?:${brand}\\b\\s*)?`,
            'i'
          ),
          ''
        )
        .replace(LEADING_PROMO_GROUPS, '')
        // "Vivo Book 15" is the Asus Vivobook line: key it like "Vivobook 15" (DOS/Rate#774).
        .replace(/\bvivo\s+book\b/gi, 'Vivobook')
        // "17 ProMax" keys like "17 Pro Max" (DOS/Rate#815).
        .replace(/\b(pro)(max)\b/gi, '$1 $2')
        .trim();
      const rawTokens = cleaned.split(/\s+/).filter(Boolean);
      const modelTokens: string[] = [];
      let hasProductCode = false;
      for (let i = 0; i < rawTokens.length; i++) {
        let tok = rawTokens[i];
        // "Samsung, Galaxy S25 Ultra": the brand's comma is not the end of the model.
        if (modelTokens.length === 0 && /^[,;]+$/.test(tok)) continue;
        // "Samsung -Galaxy S24": a dash glued to the model's first word is no separator.
        if (modelTokens.length === 0) tok = tok.replace(/^[-–|/]+(?=[\p{L}\d])/u, '');
        // Nor does a size, RAM, a case size, a network, GPS, a dash or the shop's own
        // "Chính hãng" / "Mới 100%" before the model has begun: "Samsung 256GB Galaxy
        // S24 Ultra", "Samsung - Galaxy A55", "Xiaomi 16GB/512GB 15 Ultra" (DOS/Rate#1429).
        if (modelTokens.length === 0) {
          if (
            /^(?:\d+(?:[.,]\d+)?(?:GB|TB)|\d+(?:GB)?[-/]\d+(?:GB|TB)?|\d{2}mm|[45]G|LTE|GPS|RAM|ROM|Chính|Hãng|Hàng|Mới|New|Fullbox|\d{1,3}%)?[-–|/]*$/iu.test(
              tok
            )
          ) {
            continue;
          }
          if (/^\d+(?:[.,]\d+)?$/.test(tok) && /^(?:GB|TB)$/i.test(rawTokens[i + 1] ?? '')) {
            i++;
            continue;
          }
        }
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
        // A gift or bundle ends the model: "Xiaomi - 15T tặng ốp lưng" (DOS/Rate#1429).
        if (/^(?:tặng|kèm|quà|\+)$/iu.test(tok.normalize('NFC'))) break;
        const stop =
          /^(?:\d+(?:[.,]\d+)?(?:GB|TB)|\d+\/\d+(?:GB|TB)?|\d{2}mm|5G|4G|LTE|GPS|RAM|ROM|OLED|WiFi|Chính|Quốc|Bản|Mới|Fullbox|Likenew|Like|Cũ|99%|98%|VN\/A|VNA|LL\/A|\(|\[|-)/i.exec(
            tok
          );
        // As the model's first word, a stop word only counts whole: "Garmin GPSMAP 67"
        // is the GPSMAP, not a "GPS" option (DOS/Rate#1429).
        const startsWithStopWord =
          modelTokens.length === 0 &&
          stop !== null &&
          /^[a-z]/i.test(stop[0]) &&
          /^[\p{L}\d]/u.test(tok.slice(stop[0].length));
        if (
          (stop && !startsWithStopWord) ||
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
      // No model token is no model: the title is unkeyable (DOS/Rate#1151) rather than
      // keyed on whatever came first, which linked different phones to one master
      // (DOS/Rate#1429).
      model = modelTokens.join(' ');
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
    // Storage first ("64GB/4GB") reads the same pair the other way round (DOS/Rate#1421).
    const slashSecondGb = slashRamRom
      ? parseFloat(slashRamRom[2].replace(',', '.')) *
        (slashRamRom[3].toUpperCase() === 'TB' ? 1024 : 1)
      : 0;
    const slashReversed = slashRamRom !== null && parseInt(slashRamRom[1], 10) > slashSecondGb;
    if (slashRamRom && ramPhrases.length === 0) {
      const slashRam = slashReversed ? slashSecondGb : parseInt(slashRamRom[1], 10);
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
      } else if (first.value >= 64 && second.value <= 32 && /^\s*\/\s*$/.test(between)) {
        // Storage first, RAM second: "256GB/12GB" is 256GB with 12GB RAM (DOS/Rate#1421).
        second.claimed = true;
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
    let variantSource: NormalizedProductCandidate['variant_source'] = null;
    const marker = romExplicit ?? romLoose;
    if (categorySlug === 'earbuds') {
      // Earbuds have no storage variant and must key as :unknown with null storage (DOS/Rate#643, #657).
      storageGb = null;
      storageConfident = true;
      variantSource = 'single_variant';
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
        slashReversed ? parseInt(slashRamRom[1], 10) : slashSecondGb
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
      variantSource = 'single_size';
    }
    const storageKnown = storageGb !== null;
    if (storageKnown && variantSource === null) variantSource = 'title';

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
    // An empty key segment ("samsung::unknown") is never emitted: a title with no
    // model keys on a placeholder and is marked unkeyable (DOS/Rate#1151).
    const keyable = Boolean(slugify(brand) && slugify(model));
    const itemKey = keyable ? baseKey : `${slugify(brand) || 'khac'}:${UNKEYED_MODEL_SEGMENT}`;
    const variantKey = storageKnown ? `${storageGb}gb` : UNKNOWN_VARIANT_KEY;
    const modelKey = `${itemKey}:${variantKey}`;
    const itemName = `${brand} ${model}`.trim();
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
    // A watch registry entry pinned to one case does not describe another one.
    const caseMismatch =
      benchmark?.case_mm !== undefined &&
      appleSize.endsWith('mm') &&
      parseInt(appleSize, 10) !== benchmark.case_mm;
    const benchmarkSized =
      benchmark &&
      !caseMismatch &&
      (appleInches === null ||
        Math.floor(benchmark.screen_size_inch ?? NaN) === Math.floor(appleInches))
        ? benchmark
        : undefined;
    const screenSize =
      categorySlug === 'earbuds'
        ? null
        : (benchmarkSized?.screen_size_inch ?? titleScreenSize ?? appleInches);
    const batteryMah = benchmarkSized ? benchmarkSized.battery_mah : null;
    // A phone or tablet title that names no 5G does not say it lacks it: unknown, not
    // false (and not true for every phone). Laptops, watches and earbuds have no 5G
    // (DOS/Rate#1196).
    const has5g: boolean | null = benchmark
      ? benchmark.has_5g
      : /\b5 ?g\b/i.test(title)
        ? true
        : categorySlug === 'smartphones' || categorySlug === 'tablets'
          ? null
          : false;

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
        dimensions: (caseMismatch ? undefined : benchmark?.dimensions) || undefined,
        weight_g: (caseMismatch ? undefined : benchmark?.weight_g) || undefined,
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
        resolution: (caseMismatch ? undefined : benchmark?.resolution) || undefined,
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
      // Nothing is known about the network of a phone or tablet whose 5G is unknown.
      cellular:
        has5g === null
          ? {}
          : !has5g && categorySlug !== 'smartphones'
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
      item_key: itemKey,
      variant_key: variantKey,
      item_name: itemName,
      item_slug: slugify(itemName),
      variant_known: storageKnown || categorySlug === 'earbuds',
      variant_source: variantSource,
      keyable,
      name: canonicalName,
      slug,
      storage_gb: storageKnown ? storageGb : null,
      needs_review: !keyable || !storageConfident || condition !== 'new',
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
      is_benchmark_enriched: Boolean(benchmark) && !caseMismatch,
      spec_source: benchmark && !caseMismatch ? 'benchmark_registry' : 'crawled_title',
    };
  }
}
