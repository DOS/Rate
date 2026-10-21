/**
 * JReviews-Inspired Directory -> Category -> Listing Type Filter Registry
 *
 * Architecture:
 * - Directory: Top-level vertical (e.g. `tech_electronics` - Công nghệ & Điện tử)
 * - Category: Specific row in `rate.categories` (e.g. `smartphones`, `laptops`, `tablets`, `smartwatches`, `earbuds`)
 * - Listing Type Filter Schema: Category-specific filter widgets mapped to the 10 Field Groups
 *   (`availability`, `design`, `display`, `hardware`, `battery`, `camera`, `connectivity`, `cellular`, `multimedia`, `regulatory`)
 */

export type ProductSortOption =
  | 'default'
  | 'price_asc'
  | 'price_desc'
  | 'rating_desc'
  | 'merchants_desc'
  | 'newest';

export interface PricePresetOption {
  id: string;
  label: string;
  minVnd?: number;
  maxVnd?: number;
}

export interface SpecFeatureOption {
  key:
    | 'has5g'
    | 'highRefresh'
    | 'bigBattery'
    | 'fastCharge'
    | 'hasNfc'
    | 'compactScreen';
  label: string;
  fieldGroup:
    | 'display'
    | 'hardware'
    | 'battery'
    | 'camera'
    | 'connectivity'
    | 'cellular'
    | 'multimedia'
    | 'design';
  description: string;
}

export interface CategoryFilterSchema {
  categorySlug: string;
  directorySlug: 'tech_electronics' | 'services';
  directoryName: string;
  categoryTitle: string;
  categorySubtitle: string;
  searchPlaceholder: string;
  defaultBrands: string[];
  ramOptionsGb: number[];
  storageOptionsGb: number[];
  priceRangeMillion: {
    min: number;
    max: number;
    step: number;
  };
  pricePresets: PricePresetOption[];
  featureCheckboxes: SpecFeatureOption[];
}

export const SORT_OPTIONS: { value: ProductSortOption; label: string }[] = [
  { value: 'default', label: 'Mặc định (Mới cập nhật)' },
  { value: 'price_asc', label: 'Giá thấp đến cao' },
  { value: 'price_desc', label: 'Giá cao đến thấp' },
  { value: 'rating_desc', label: 'Điểm đánh giá cao nhất' },
  { value: 'merchants_desc', label: 'Nhiều nơi bán nhất' },
  { value: 'newest', label: 'Mới ra mắt nhất' },
];

export const RATING_FILTER_OPTIONS: {
  value: number;
  id: string;
  label: string;
}[] = [
  { value: 0, id: 'rating-all', label: 'All' },
  { value: 3, id: 'rating-3plus', label: '3.0+' },
  { value: 4, id: 'rating-4plus', label: '4.0+' },
  { value: 4.5, id: 'rating-45plus', label: '4.5+' },
];

export const CATEGORY_FILTER_SCHEMAS: Record<string, CategoryFilterSchema> = {
  smartphones: {
    categorySlug: 'smartphones',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & Thiết bị số',
    categoryTitle: 'Điện thoại thông minh',
    categorySubtitle:
      'Tra cứu dữ liệu kỹ thuật 10 nhóm thông số chuẩn GSMArena & PhoneArena, đối chiếu giá đa sàn và lọc đánh giá thật bằng AI',
    searchPlaceholder:
      'Tìm tên máy, chip (VD: iPhone 16, Snapdragon 8 Gen 3)...',
    defaultBrands: [
      'Apple',
      'Samsung',
      'Xiaomi',
      'OPPO',
      'Vivo',
      'Realme',
      'Honor',
    ],
    ramOptionsGb: [4, 6, 8, 12, 16],
    storageOptionsGb: [64, 128, 256, 512, 1024],
    priceRangeMillion: {
      min: 0,
      max: 50,
      step: 1,
    },
    pricePresets: [
      { id: 'under-7m', label: 'Dưới 7 triệu', minVnd: 0, maxVnd: 7_000_000 },
      {
        id: '7m-15m',
        label: '7 - 15 triệu',
        minVnd: 7_000_000,
        maxVnd: 15_000_000,
      },
      {
        id: '15m-25m',
        label: '15 - 25 triệu',
        minVnd: 15_000_000,
        maxVnd: 25_000_000,
      },
      {
        id: 'over-25m',
        label: 'Trên 25 triệu',
        minVnd: 25_000_000,
        maxVnd: 50_000_000,
      },
    ],
    featureCheckboxes: [
      {
        key: 'has5g',
        label: 'Hỗ trợ 5G',
        fieldGroup: 'cellular',
        description: 'Cellular: Kết nối mạng di động 5G tốc độ cao',
      },
      {
        key: 'highRefresh',
        label: 'Màn hình 120Hz+',
        fieldGroup: 'display',
        description: 'Display: Tần số quét từ 120Hz trở lên',
      },
      {
        key: 'bigBattery',
        label: 'Pin >= 5000mAh',
        fieldGroup: 'battery',
        description: 'Battery: Dung lượng pin từ 5000 mAh trở lên',
      },
      {
        key: 'fastCharge',
        label: 'Sạc nhanh >= 45W',
        fieldGroup: 'battery',
        description: 'Battery: Công suất sạc nhanh từ 45W trở lên',
      },
      {
        key: 'hasNfc',
        label: 'Có NFC',
        fieldGroup: 'connectivity',
        description: 'Connectivity: Thanh toán chạm & đọc CCCD gắn chip',
      },
      {
        key: 'compactScreen',
        label: 'Nhỏ gọn (<= 6.2")',
        fieldGroup: 'display',
        description: 'Display: Màn hình gọn dễ cầm một tay (<= 6.2 inch)',
      },
    ],
  },
  tablets: {
    categorySlug: 'tablets',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & Thiết bị số',
    categoryTitle: 'Máy tính bảng',
    categorySubtitle:
      'So sánh thông số kỹ thuật 10 nhóm và giá bán máy tính bảng từ các sàn TMĐT',
    searchPlaceholder: 'Tìm iPad, Galaxy Tab, Xiaomi Pad...',
    defaultBrands: ['Apple', 'Samsung', 'Xiaomi', 'Lenovo', 'Huawei'],
    ramOptionsGb: [4, 8, 12, 16],
    storageOptionsGb: [64, 128, 256, 512, 1024],
    priceRangeMillion: {
      min: 0,
      max: 50,
      step: 1,
    },
    pricePresets: [
      {
        id: 'under-10m',
        label: 'Dưới 10 triệu',
        minVnd: 0,
        maxVnd: 10_000_000,
      },
      {
        id: '10m-20m',
        label: '10 - 20 triệu',
        minVnd: 10_000_000,
        maxVnd: 20_000_000,
      },
      {
        id: 'over-20m',
        label: 'Trên 20 triệu',
        minVnd: 20_000_000,
        maxVnd: 50_000_000,
      },
    ],
    featureCheckboxes: [
      {
        key: 'has5g',
        label: 'Bản 5G / Cellular',
        fieldGroup: 'cellular',
        description: 'Hỗ trợ lắp SIM / eSIM kết nối 5G',
      },
      {
        key: 'highRefresh',
        label: 'Màn hình 120Hz+',
        fieldGroup: 'display',
        description: 'Tần số quét màn hình >= 120Hz',
      },
      {
        key: 'bigBattery',
        label: 'Pin >= 8000mAh',
        fieldGroup: 'battery',
        description: 'Dung lượng pin lớn',
      },
    ],
  },
  laptops: {
    categorySlug: 'laptops',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & Thiết bị số',
    categoryTitle: 'Laptop',
    categorySubtitle:
      'Đối chiếu cấu hình phần cứng 10 nhóm và lịch sử giá laptop chính hãng',
    searchPlaceholder: 'Tìm MacBook, ThinkPad, ASUS ROG, Dell XPS...',
    defaultBrands: ['Apple', 'ASUS', 'Lenovo', 'Dell', 'HP', 'Acer', 'MSI'],
    ramOptionsGb: [8, 16, 32, 64],
    storageOptionsGb: [256, 512, 1024, 2048],
    priceRangeMillion: {
      min: 0,
      max: 80,
      step: 2,
    },
    pricePresets: [
      {
        id: 'under-15m',
        label: 'Dưới 15 triệu',
        minVnd: 0,
        maxVnd: 15_000_000,
      },
      {
        id: '15m-30m',
        label: '15 - 30 triệu',
        minVnd: 15_000_000,
        maxVnd: 30_000_000,
      },
      {
        id: 'over-30m',
        label: 'Trên 30 triệu',
        minVnd: 30_000_000,
        maxVnd: 80_000_000,
      },
    ],
    featureCheckboxes: [
      {
        key: 'highRefresh',
        label: 'Màn hình 120Hz+',
        fieldGroup: 'display',
        description: 'Tần số quét cao >= 120Hz',
      },
      {
        key: 'fastCharge',
        label: 'Sạc nhanh USB-C PD',
        fieldGroup: 'battery',
        description: 'Hỗ trợ sạc nhanh công suất cao',
      },
    ],
  },
  smartwatches: {
    categorySlug: 'smartwatches',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & Thiết bị số',
    categoryTitle: 'Đồng hồ thông minh',
    categorySubtitle:
      'Đối chiếu cảm biến sức khỏe, chuẩn kháng nước, GPS đa băng tần và lịch sử giá đồng hồ thông minh chính hãng',
    searchPlaceholder:
      'Tìm Apple Watch, Galaxy Watch, Garmin, Xiaomi Watch, Huawei Watch...',
    defaultBrands: [
      'Apple',
      'Samsung',
      'Garmin',
      'Xiaomi',
      'Huawei',
      'Amazfit',
    ],
    ramOptionsGb: [1, 2, 4],
    storageOptionsGb: [4, 16, 32, 64],
    priceRangeMillion: {
      min: 0,
      max: 30,
      step: 1,
    },
    pricePresets: [
      { id: 'under-3m', label: 'Dưới 3 triệu', minVnd: 0, maxVnd: 3_000_000 },
      {
        id: '3m-8m',
        label: '3 - 8 triệu',
        minVnd: 3_000_000,
        maxVnd: 8_000_000,
      },
      {
        id: '8m-15m',
        label: '8 - 15 triệu',
        minVnd: 8_000_000,
        maxVnd: 15_000_000,
      },
      {
        id: 'over-15m',
        label: 'Trên 15 triệu',
        minVnd: 15_000_000,
        maxVnd: 30_000_000,
      },
    ],
    featureCheckboxes: [
      {
        key: 'has5g',
        label: 'Hỗ trợ eSIM / LTE',
        fieldGroup: 'cellular',
        description: 'Nghe gọi độc lập qua eSIM không cần mang theo điện thoại',
      },
      {
        key: 'hasNfc',
        label: 'Có NFC / Thanh toán chạm',
        fieldGroup: 'connectivity',
        description: 'Hỗ trợ kết nối NFC và thanh toán không chạm',
      },
      {
        key: 'fastCharge',
        label: 'Sạc nhanh từ tính',
        fieldGroup: 'battery',
        description: 'Hỗ trợ sạc nhanh không dây nam châm',
      },
    ],
  },
  earbuds: {
    categorySlug: 'earbuds',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & Thiết bị số',
    categoryTitle: 'Tai nghe không dây và chống ồn ANC',
    categorySubtitle:
      'So sánh khả năng chống ồn chủ động ANC, codec âm thanh Hi-Res (LDAC/aptX), thời lượng pin và giá bán thực tế đa sàn',
    searchPlaceholder:
      'Tìm AirPods Pro, Sony WF-1000XM5, Galaxy Buds, Bose, Sennheiser...',
    defaultBrands: [
      'Apple',
      'Sony',
      'Samsung',
      'Bose',
      'Sennheiser',
      'Xiaomi',
      'JBL',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 15,
      step: 1,
    },
    pricePresets: [
      { id: 'under-1m', label: 'Dưới 1 triệu', minVnd: 0, maxVnd: 1_000_000 },
      {
        id: '1m-3m',
        label: '1 - 3 triệu',
        minVnd: 1_000_000,
        maxVnd: 3_000_000,
      },
      {
        id: '3m-6m',
        label: '3 - 6 triệu',
        minVnd: 3_000_000,
        maxVnd: 6_000_000,
      },
      {
        id: 'over-6m',
        label: 'Trên 6 triệu',
        minVnd: 6_000_000,
        maxVnd: 15_000_000,
      },
    ],
    featureCheckboxes: [
      {
        key: 'fastCharge',
        label: 'Hộp sạc nhanh / MagSafe',
        fieldGroup: 'battery',
        description: 'Hỗ trợ sạc nhanh qua USB-C hoặc sạc không dây Qi/MagSafe',
      },
    ],
  },
};

const DEFAULT_SMARTPHONE_SCHEMA: CategoryFilterSchema = {
  categorySlug: 'smartphones',
  directorySlug: 'tech_electronics',
  directoryName: 'Công nghệ & Thiết bị số',
  categoryTitle: 'Điện thoại thông minh',
  categorySubtitle:
    'Tra cứu dữ liệu kỹ thuật 10 nhóm thông số chuẩn GSMArena & PhoneArena, đối chiếu giá đa sàn và lọc đánh giá thật bằng AI',
  searchPlaceholder: 'Tìm tên máy, chip (VD: iPhone 16, Snapdragon 8 Gen 3)...',
  defaultBrands: [
    'Apple',
    'Samsung',
    'Xiaomi',
    'OPPO',
    'Vivo',
    'Realme',
    'Honor',
  ],
  ramOptionsGb: [4, 6, 8, 12, 16],
  storageOptionsGb: [64, 128, 256, 512, 1024],
  priceRangeMillion: {
    min: 0,
    max: 50,
    step: 1,
  },
  pricePresets: [
    { id: 'under-7m', label: 'Dưới 7 triệu', minVnd: 0, maxVnd: 7_000_000 },
    {
      id: '7m-15m',
      label: '7 - 15 triệu',
      minVnd: 7_000_000,
      maxVnd: 15_000_000,
    },
    {
      id: '15m-25m',
      label: '15 - 25 triệu',
      minVnd: 15_000_000,
      maxVnd: 25_000_000,
    },
    {
      id: 'over-25m',
      label: 'Trên 25 triệu',
      minVnd: 25_000_000,
      maxVnd: 50_000_000,
    },
  ],
  featureCheckboxes: [
    {
      key: 'has5g',
      label: 'Hỗ trợ 5G',
      fieldGroup: 'cellular',
      description: 'Cellular: Kết nối mạng di động 5G tốc độ cao',
    },
    {
      key: 'highRefresh',
      label: 'Màn hình 120Hz+',
      fieldGroup: 'display',
      description: 'Display: Tần số quét từ 120Hz trở lên',
    },
    {
      key: 'bigBattery',
      label: 'Pin >= 5000mAh',
      fieldGroup: 'battery',
      description: 'Battery: Dung lượng pin từ 5000 mAh trở lên',
    },
    {
      key: 'fastCharge',
      label: 'Sạc nhanh >= 45W',
      fieldGroup: 'battery',
      description: 'Battery: Công suất sạc nhanh từ 45W trở lên',
    },
    {
      key: 'hasNfc',
      label: 'Có NFC',
      fieldGroup: 'connectivity',
      description: 'Connectivity: Thanh toán chạm & đọc CCCD gắn chip',
    },
    {
      key: 'compactScreen',
      label: 'Nhỏ gọn (<= 6.2")',
      fieldGroup: 'display',
      description: 'Display: Màn hình gọn dễ cầm một tay (<= 6.2 inch)',
    },
  ],
};

export function getCategoryFilterSchema(
  categorySlug: string = 'smartphones',
  dynamicBrands: string[] = []
): CategoryFilterSchema {
  const base: CategoryFilterSchema =
    CATEGORY_FILTER_SCHEMAS[categorySlug] ?? DEFAULT_SMARTPHONE_SCHEMA;

  const canonicalByLower = new Map<string, string>();
  for (const defBrand of base.defaultBrands) {
    const trimmed = defBrand.trim();
    if (trimmed) {
      canonicalByLower.set(trimmed.toLowerCase(), trimmed);
    }
  }

  const seenLower = new Set<string>();
  const mergedBrands: string[] = [];
  for (const candidate of [...dynamicBrands, ...base.defaultBrands]) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);
    mergedBrands.push(canonicalByLower.get(lower) ?? trimmed);
  }

  return {
    ...base,
    defaultBrands: mergedBrands,
  };
}

export function localizeCategoryFilterSchema(
  schema: CategoryFilterSchema,
  t: (key: string) => string
): CategoryFilterSchema {
  const slug =
    schema.categorySlug in CATEGORY_FILTER_SCHEMAS
      ? schema.categorySlug
      : 'smartphones';

  return {
    ...schema,
    directoryName: t('schemas.directoryTech'),
    categoryTitle: t(`schemas.${slug}.title`),
    categorySubtitle: t(`schemas.${slug}.subtitle`),
    searchPlaceholder: t(`schemas.${slug}.searchPlaceholder`),
    pricePresets: schema.pricePresets.map((preset) => ({
      ...preset,
      label: t(`schemas.${slug}.presets.${preset.id}`),
    })),
    featureCheckboxes: schema.featureCheckboxes.map((feat) => ({
      ...feat,
      label: t(`schemas.${slug}.features.${feat.key}.label`),
      description: t(`schemas.${slug}.features.${feat.key}.desc`),
    })),
  };
}

export function formatStorageLabel(gb: number): string {
  if (gb >= 1024 && Number.isFinite(gb)) {
    const tb = Number((gb / 1024).toFixed(2));
    if (Math.abs(tb * 1024 - gb) < 1e-6) {
      return `${tb}TB`;
    }
  }
  return `${gb}GB`;
}
