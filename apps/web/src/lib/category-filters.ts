/**
 * JReviews-Inspired Directory -> Category -> Listing Type Filter Registry
 *
 * Architecture:
 * - Directory: Top-level vertical (e.g. `tech_electronics` - Công nghệ & điện tử)
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
  directorySlug: 'tech_electronics' | 'services' | 'retail' | 'places';
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
  // The sidebar shows catalog.sidebar.ratingAll for this option (#718).
  { value: 0, id: 'rating-all', label: 'All' },
  { value: 3, id: 'rating-3plus', label: '3.0+' },
  { value: 4, id: 'rating-4plus', label: '4.0+' },
  { value: 4.5, id: 'rating-45plus', label: '4.5+' },
];

export const CATEGORY_FILTER_SCHEMAS: Record<string, CategoryFilterSchema> = {
  smartphones: {
    categorySlug: 'smartphones',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
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
    directoryName: 'Công nghệ & thiết bị số',
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
    directoryName: 'Công nghệ & thiết bị số',
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
    directoryName: 'Công nghệ & thiết bị số',
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
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Tai nghe không dây và chống ồn ANC',
    categorySubtitle:
      'So sánh khả năng chống ồn chủ động ANC, codec âm thanh Hi-Res (LDAC/aptX), thời lượng pin và giá bán thực tế trên nhiều sàn',
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
  tvs: {
    categorySlug: 'tvs',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Smart TV',
    categorySubtitle:
      'Đối chiếu chất lượng hiển thị, âm thanh, hệ điều hành và lịch sử giá TV chính hãng',
    searchPlaceholder: 'Tìm Samsung QLED, LG OLED, Sony Bravia, TCL...',
    defaultBrands: ['Samsung', 'LG', 'Sony', 'TCL', 'Hisense', 'Xiaomi'],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 60,
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
        maxVnd: 60_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'air-conditioners': {
    categorySlug: 'air-conditioners',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Điều hòa - Máy lạnh',
    categorySubtitle:
      'Đối chiếu khả năng làm lạnh, tiết kiệm điện Inverter, độ ồn và lịch sử giá thực tế',
    searchPlaceholder:
      'Tìm Daikin Inverter, Panasonic, LG Dual Cool, Casper...',
    defaultBrands: [
      'Daikin',
      'Panasonic',
      'LG',
      'Casper',
      'Samsung',
      'Mitsubishi',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 35,
      step: 1,
    },
    pricePresets: [
      {
        id: 'under-8m',
        label: 'Dưới 8 triệu',
        minVnd: 0,
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
        maxVnd: 35_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  refrigerators: {
    categorySlug: 'refrigerators',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Tủ lạnh',
    categorySubtitle:
      'Đối chiếu dung tích sử dụng, tiết kiệm điện, độ ồn và giá bán tủ lạnh chính hãng',
    searchPlaceholder:
      'Tìm Samsung Bespoke, LG, Panasonic, Toshiba, Hitachi...',
    defaultBrands: [
      'Samsung',
      'LG',
      'Panasonic',
      'Toshiba',
      'Hitachi',
      'Electrolux',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
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
    featureCheckboxes: [],
  },
  'washing-machines': {
    categorySlug: 'washing-machines',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Máy giặt',
    categorySubtitle:
      'Đối chiếu hiệu quả giặt sạch, độ ồn vắt, tiết kiệm điện nước và giá bán máy giặt chính hãng',
    searchPlaceholder:
      'Tìm LG AI DD, Electrolux, Samsung EcoBubble, Toshiba...',
    defaultBrands: [
      'LG',
      'Samsung',
      'Electrolux',
      'Toshiba',
      'Aqua',
      'Panasonic',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 30,
      step: 1,
    },
    pricePresets: [
      {
        id: 'under-8m',
        label: 'Dưới 8 triệu',
        minVnd: 0,
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
    featureCheckboxes: [],
  },
  'air-purifiers': {
    categorySlug: 'air-purifiers',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Máy lọc không khí',
    categorySubtitle:
      'Đối chiếu hiệu suất lọc HEPA/CADR, chi phí thay màng lọc, độ ồn và lịch sử giá thực tế',
    searchPlaceholder:
      'Tìm Xiaomi Air Purifier, Sharp, Coway, Philips, Dyson...',
    defaultBrands: ['Xiaomi', 'Sharp', 'Coway', 'Philips', 'Dyson', 'LG'],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 20,
      step: 1,
    },
    pricePresets: [
      {
        id: 'under-3m',
        label: 'Dưới 3 triệu',
        minVnd: 0,
        maxVnd: 3_000_000,
      },
      {
        id: '3m-7m',
        label: '3 - 7 triệu',
        minVnd: 3_000_000,
        maxVnd: 7_000_000,
      },
      {
        id: 'over-7m',
        label: 'Trên 7 triệu',
        minVnd: 7_000_000,
        maxVnd: 20_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'bank-savings': {
    categorySlug: 'bank-savings',
    directorySlug: 'services',
    directoryName: 'Dịch vụ công & tài chính',
    categoryTitle: 'Tiết kiệm ngân hàng',
    categorySubtitle:
      'So sánh lãi suất niêm yết theo kỳ hạn, chất lượng phục vụ và đánh giá thực tế từ khách hàng',
    searchPlaceholder: 'Tìm Vietcombank, ACB, tiết kiệm 6 tháng, 12 tháng...',
    defaultBrands: [
      'Vietcombank',
      'ACB',
      'Techcombank',
      'MB Bank',
      'BIDV',
      'VietinBank',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 0,
      step: 1,
    },
    pricePresets: [],
    featureCheckboxes: [],
  },
  'internet-telecom': {
    categorySlug: 'internet-telecom',
    directorySlug: 'services',
    directoryName: 'Dịch vụ công & tài chính',
    categoryTitle: 'Internet & Viễn thông',
    categorySubtitle:
      'So sánh gói cước Internet cáp quang, tốc độ xử lý sự cố và cước hàng tháng minh bạch',
    searchPlaceholder: 'Tìm VNPT Home, FPT Telecom Sky, Viettel Fiber...',
    defaultBrands: ['VNPT', 'FPT Telecom', 'Viettel'],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 2,
      step: 0.05,
    },
    pricePresets: [
      {
        id: 'under-200k',
        label: 'Dưới 200K',
        minVnd: 0,
        maxVnd: 200_000,
      },
      {
        id: '200k-350k',
        label: '200K - 350K',
        minVnd: 200_000,
        maxVnd: 350_000,
      },
      {
        id: 'over-350k',
        label: 'Trên 350K',
        minVnd: 350_000,
        maxVnd: 2_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  supplements: {
    categorySlug: 'supplements',
    directorySlug: 'retail',
    directoryName: 'Tiêu dùng & sức khỏe',
    categoryTitle: 'Thực phẩm chức năng',
    categorySubtitle:
      'Đối chiếu giá thật và đánh giá cộng đồng về hiệu quả, thành phần và độ an toàn',
    searchPlaceholder: 'Tìm Omega-3, Collagen, Vitamin D3, Blackmores...',
    defaultBrands: [
      'Blackmores',
      'DHC',
      'Doppelherz',
      'Nature Made',
      'Kirkland',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 5,
      step: 0.1,
    },
    pricePresets: [
      {
        id: 'under-300k',
        label: 'Dưới 300K',
        minVnd: 0,
        maxVnd: 300_000,
      },
      {
        id: '300k-800k',
        label: '300K - 800K',
        minVnd: 300_000,
        maxVnd: 800_000,
      },
      {
        id: 'over-800k',
        label: 'Trên 800K',
        minVnd: 800_000,
        maxVnd: 5_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  cosmetics: {
    categorySlug: 'cosmetics',
    directorySlug: 'retail',
    directoryName: 'Tiêu dùng & sức khỏe',
    categoryTitle: 'Mỹ phẩm & Chăm sóc da',
    categorySubtitle:
      'So sánh giá bán chính hãng và đánh giá thực tế về thành phần, kết cấu và độ lành tính',
    searchPlaceholder:
      'Tìm La Roche-Posay, Bioderma, CeraVe, kem chống nắng...',
    defaultBrands: [
      'La Roche-Posay',
      'Bioderma',
      'CeraVe',
      "L'Oreal",
      'Cocoon',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 5,
      step: 0.1,
    },
    pricePresets: [
      {
        id: 'under-300k',
        label: 'Dưới 300K',
        minVnd: 0,
        maxVnd: 300_000,
      },
      {
        id: '300k-800k',
        label: '300K - 800K',
        minVnd: 300_000,
        maxVnd: 800_000,
      },
      {
        id: 'over-800k',
        label: 'Trên 800K',
        minVnd: 800_000,
        maxVnd: 5_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'mother-baby': {
    categorySlug: 'mother-baby',
    directorySlug: 'retail',
    directoryName: 'Tiêu dùng & sức khỏe',
    categoryTitle: 'Mẹ & Bé',
    categorySubtitle:
      'Đối chiếu giá sữa bột, tã bỉm, đồ dùng cho bé cùng đánh giá an toàn từ phụ huynh',
    searchPlaceholder: 'Tìm Huggies, Merries, Aptamil, Enfamil, máy hút sữa...',
    defaultBrands: ['Huggies', 'Merries', 'Aptamil', 'Similac', 'Pigeon'],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 10,
      step: 0.1,
    },
    pricePresets: [
      {
        id: 'under-300k',
        label: 'Dưới 300K',
        minVnd: 0,
        maxVnd: 300_000,
      },
      {
        id: '300k-1m',
        label: '300K - 1 triệu',
        minVnd: 300_000,
        maxVnd: 1_000_000,
      },
      {
        id: 'over-1m',
        label: 'Trên 1 triệu',
        minVnd: 1_000_000,
        maxVnd: 10_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  restaurants: {
    categorySlug: 'restaurants',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Nhà hàng & Quán ăn',
    categorySubtitle:
      'Khám phá đánh giá thực khách về món ăn, vệ sinh, thái độ phục vụ và mức giá tham khảo',
    searchPlaceholder:
      'Tìm nhà hàng, quán ăn, quận/thành phố, món đặc trưng...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 5,
      step: 0.05,
    },
    pricePresets: [
      {
        id: 'under-200k',
        label: 'Dưới 200K/người',
        minVnd: 0,
        maxVnd: 200_000,
      },
      {
        id: '200k-500k',
        label: '200K - 500K/người',
        minVnd: 200_000,
        maxVnd: 500_000,
      },
      {
        id: 'over-500k',
        label: 'Trên 500K/người',
        minVnd: 500_000,
        maxVnd: 5_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  cafes: {
    categorySlug: 'cafes',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Quán cà phê & Trà',
    categorySubtitle:
      'Đánh giá đồ uống, không gian làm việc, phục vụ và mức chi trung bình mỗi người',
    searchPlaceholder: 'Tìm quán cà phê, trà sữa, roastery, khu vực...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 0.5,
      step: 0.02,
    },
    pricePresets: [
      {
        id: 'under-60k',
        label: 'Dưới 60K/người',
        minVnd: 0,
        maxVnd: 60_000,
      },
      {
        id: '60k-120k',
        label: '60K - 120K/người',
        minVnd: 60_000,
        maxVnd: 120_000,
      },
      {
        id: 'over-120k',
        label: 'Trên 120K/người',
        minVnd: 120_000,
        maxVnd: 500_000,
      },
    ],
    featureCheckboxes: [],
  },
  hotels: {
    categorySlug: 'hotels',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Khách sạn & Resort',
    categorySubtitle:
      'Xem đánh giá chất lượng phòng, vệ sinh, vị trí và giá phòng tham khảo theo đêm',
    searchPlaceholder: 'Tìm khách sạn, resort, tên đường hoặc khu vực...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 20,
      step: 0.2,
    },
    pricePresets: [
      {
        id: 'under-1m',
        label: 'Dưới 1 triệu/đêm',
        minVnd: 0,
        maxVnd: 1_000_000,
      },
      {
        id: '1m-3m',
        label: '1 - 3 triệu/đêm',
        minVnd: 1_000_000,
        maxVnd: 3_000_000,
      },
      {
        id: 'over-3m',
        label: 'Trên 3 triệu/đêm',
        minVnd: 3_000_000,
        maxVnd: 20_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  homestays: {
    categorySlug: 'homestays',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Homestay & Villa',
    categorySubtitle:
      'Đánh giá trải nghiệm lưu trú, độ sạch sẽ, vị trí và giá tham khảo mỗi đêm',
    searchPlaceholder: 'Tìm homestay, villa nghỉ dưỡng, Đà Lạt, Sa Pa...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 10,
      step: 0.1,
    },
    pricePresets: [
      {
        id: 'under-800k',
        label: 'Dưới 800K/đêm',
        minVnd: 0,
        maxVnd: 800_000,
      },
      {
        id: '800k-2m',
        label: '800K - 2 triệu/đêm',
        minVnd: 800_000,
        maxVnd: 2_000_000,
      },
      {
        id: 'over-2m',
        label: 'Trên 2 triệu/đêm',
        minVnd: 2_000_000,
        maxVnd: 10_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'dental-clinics': {
    categorySlug: 'dental-clinics',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Nha khoa',
    categorySubtitle:
      'Đánh giá chất lượng điều trị, vô trùng, thái độ bác sĩ và chi phí tham khảo tại phòng khám nha khoa',
    searchPlaceholder: 'Tìm nha khoa, dịch vụ niềng, implant, khu vực...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 50,
      step: 0.5,
    },
    pricePresets: [
      {
        id: 'under-500k',
        label: 'Dưới 500K',
        minVnd: 0,
        maxVnd: 500_000,
      },
      {
        id: '500k-5m',
        label: '500K - 5 triệu',
        minVnd: 500_000,
        maxVnd: 5_000_000,
      },
      {
        id: 'over-5m',
        label: 'Trên 5 triệu',
        minVnd: 5_000_000,
        maxVnd: 50_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'gyms-fitness': {
    categorySlug: 'gyms-fitness',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Phòng tập gym & fitness',
    categorySubtitle:
      'Đánh giá máy tập, lớp tập, vệ sinh, huấn luyện viên và giá gói tập tham khảo',
    searchPlaceholder: 'Tìm phòng gym, yoga, fitness, khu vực...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 30,
      step: 0.25,
    },
    pricePresets: [
      {
        id: 'under-500k',
        label: 'Dưới 500K',
        minVnd: 0,
        maxVnd: 500_000,
      },
      {
        id: '500k-2m',
        label: '500K - 2 triệu',
        minVnd: 500_000,
        maxVnd: 2_000_000,
      },
      {
        id: 'over-2m',
        label: 'Trên 2 triệu',
        minVnd: 2_000_000,
        maxVnd: 30_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'spas-aesthetics': {
    categorySlug: 'spas-aesthetics',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Spa & Thẩm mỹ',
    categorySubtitle:
      'Đánh giá hiệu quả liệu trình, tay nghề, vệ sinh, độ minh bạch chi phí và không gian tại spa & thẩm mỹ viện',
    searchPlaceholder: 'Tìm spa, thẩm mỹ viện, chăm sóc da, khu vực...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 50,
      step: 0.5,
    },
    pricePresets: [
      {
        id: 'under-500k',
        label: 'Dưới 500K',
        minVnd: 0,
        maxVnd: 500_000,
      },
      {
        id: '500k-3m',
        label: '500K - 3 triệu',
        minVnd: 500_000,
        maxVnd: 3_000_000,
      },
      {
        id: 'over-3m',
        label: 'Trên 3 triệu',
        minVnd: 3_000_000,
        maxVnd: 50_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'english-centers': {
    categorySlug: 'english-centers',
    directorySlug: 'places',
    directoryName: 'Địa điểm & lưu trú',
    categoryTitle: 'Trung tâm tiếng Anh',
    categorySubtitle:
      'Đánh giá chất lượng giảng dạy, giáo viên, giáo trình, lịch học và học phí tại trung tâm tiếng Anh',
    searchPlaceholder: 'Tìm trung tâm tiếng Anh, IELTS, TOEIC, khu vực...',
    defaultBrands: [],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 50,
      step: 0.5,
    },
    pricePresets: [
      {
        id: 'under-5m',
        label: 'Dưới 5 triệu',
        minVnd: 0,
        maxVnd: 5_000_000,
      },
      {
        id: '5m-15m',
        label: '5 - 15 triệu',
        minVnd: 5_000_000,
        maxVnd: 15_000_000,
      },
      {
        id: 'over-15m',
        label: 'Trên 15 triệu',
        minVnd: 15_000_000,
        maxVnd: 50_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'credit-cards': {
    categorySlug: 'credit-cards',
    directorySlug: 'services',
    directoryName: 'Dịch vụ công & tài chính',
    categoryTitle: 'Thẻ tín dụng',
    categorySubtitle:
      'So sánh ưu đãi hoàn tiền, phí thường niên, lãi suất, tốc độ duyệt thẻ và ứng dụng quản lý thẻ',
    searchPlaceholder: 'Tìm thẻ tín dụng VPBank, VIB, Techcombank, HSBC...',
    defaultBrands: [
      'VPBank',
      'VIB',
      'Techcombank',
      'Vietcombank',
      'ACB',
      'Sacombank',
      'TPBank',
      'HSBC',
      'Shinhan Bank',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 10,
      step: 0.1,
    },
    pricePresets: [
      {
        id: 'under-500k',
        label: 'Dưới 500K',
        minVnd: 0,
        maxVnd: 500_000,
      },
      {
        id: '500k-1500k',
        label: '500K - 1,5 triệu',
        minVnd: 500_000,
        maxVnd: 1_500_000,
      },
      {
        id: 'over-1500k',
        label: 'Trên 1,5 triệu',
        minVnd: 1_500_000,
        maxVnd: 10_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  monitors: {
    categorySlug: 'monitors',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Màn hình máy tính',
    categorySubtitle:
      'Đối chiếu tấm nền, độ phủ màu, tần số quét, cổng kết nối và lịch sử giá màn hình chính hãng',
    searchPlaceholder:
      'Tìm Dell UltraSharp, LG UltraGear, ASUS ProArt, Odyssey...',
    defaultBrands: [
      'Dell',
      'LG',
      'Asus',
      'Samsung',
      'MSI',
      'Acer',
      'BenQ',
      'ViewSonic',
      'AOC',
      'Gigabyte',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 45,
      step: 0.5,
    },
    pricePresets: [
      {
        id: 'under-5m',
        label: 'Dưới 5 triệu',
        minVnd: 0,
        maxVnd: 5_000_000,
      },
      {
        id: '5m-12m',
        label: '5 - 12 triệu',
        minVnd: 5_000_000,
        maxVnd: 12_000_000,
      },
      {
        id: 'over-12m',
        label: 'Trên 12 triệu',
        minVnd: 12_000_000,
        maxVnd: 45_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  cameras: {
    categorySlug: 'cameras',
    directorySlug: 'tech_electronics',
    directoryName: 'Công nghệ & thiết bị số',
    categoryTitle: 'Máy ảnh & Action Cam',
    categorySubtitle:
      'So sánh chất lượng ảnh và video, tốc độ lấy nét, thời lượng pin và giá bán thực tế đa sàn',
    searchPlaceholder: 'Tìm Sony Alpha, Canon EOS, Fujifilm X, GoPro, DJI...',
    defaultBrands: [
      'Sony',
      'Canon',
      'Fujifilm',
      'Nikon',
      'GoPro',
      'DJI',
      'Insta360',
      'Panasonic',
    ],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 100,
      step: 1,
    },
    pricePresets: [
      {
        id: 'under-15m',
        label: 'Dưới 15 triệu',
        minVnd: 0,
        maxVnd: 15_000_000,
      },
      {
        id: '15m-35m',
        label: '15 - 35 triệu',
        minVnd: 15_000_000,
        maxVnd: 35_000_000,
      },
      {
        id: 'over-35m',
        label: 'Trên 35 triệu',
        minVnd: 35_000_000,
        maxVnd: 100_000_000,
      },
    ],
    featureCheckboxes: [],
  },
  'vps-hosting': {
    categorySlug: 'vps-hosting',
    directorySlug: 'services',
    directoryName: 'Dịch vụ công & tài chính',
    categoryTitle: 'VPS & Hosting',
    categorySubtitle:
      'So sánh hiệu năng, uptime, tốc độ mạng và SSD NVMe, hỗ trợ kỹ thuật và giá cước theo tháng',
    searchPlaceholder: 'Tìm Cloud VPS Nhân Hòa, P.A Việt Nam, HOSTVN, BKNS...',
    defaultBrands: ['Nhân Hòa', 'P.A Việt Nam', 'HOSTVN', 'BKNS', 'Long Vân'],
    ramOptionsGb: [],
    storageOptionsGb: [],
    priceRangeMillion: {
      min: 0,
      max: 5,
      step: 0.05,
    },
    pricePresets: [
      {
        id: 'under-200k',
        label: 'Dưới 200K/tháng',
        minVnd: 0,
        maxVnd: 200_000,
      },
      {
        id: '200k-600k',
        label: '200K - 600K/tháng',
        minVnd: 200_000,
        maxVnd: 600_000,
      },
      {
        id: 'over-600k',
        label: 'Trên 600K/tháng',
        minVnd: 600_000,
        maxVnd: 5_000_000,
      },
    ],
    featureCheckboxes: [],
  },
};

const DEFAULT_SMARTPHONE_SCHEMA: CategoryFilterSchema = {
  categorySlug: 'smartphones',
  directorySlug: 'tech_electronics',
  directoryName: 'Công nghệ & thiết bị số',
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

const MAX_DYNAMIC_BRANDS = 100;
const MAX_BRAND_NAME_LEN = 128;
const MAX_STORAGE_GB = 1_048_576;
const CATEGORY_CONTROL_CHAR_RE = /\p{Cc}/gu;

export function getCategoryFilterSchema(
  categorySlug: string = 'smartphones',
  dynamicBrands: string[] = []
): CategoryFilterSchema {
  const safeSlug =
    typeof categorySlug === 'string'
      ? categorySlug.replace(CATEGORY_CONTROL_CHAR_RE, '').trim()
      : 'smartphones';
  const base: CategoryFilterSchema = Object.hasOwn(
    CATEGORY_FILTER_SCHEMAS,
    safeSlug
  )
    ? CATEGORY_FILTER_SCHEMAS[safeSlug]!
    : DEFAULT_SMARTPHONE_SCHEMA;

  const canonicalByLower = new Map<string, string>();
  for (const defBrand of base.defaultBrands) {
    const trimmed = defBrand.trim();
    if (trimmed) {
      canonicalByLower.set(trimmed.toLowerCase(), trimmed);
    }
  }

  const safeDynamic = Array.isArray(dynamicBrands)
    ? dynamicBrands.slice(0, MAX_DYNAMIC_BRANDS)
    : [];
  const seenLower = new Set<string>();
  const mergedBrands: string[] = [];
  for (const candidate of [...safeDynamic, ...base.defaultBrands]) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate
      .replace(CATEGORY_CONTROL_CHAR_RE, '')
      .trim()
      .slice(0, MAX_BRAND_NAME_LEN);
    if (
      !trimmed ||
      !/[\p{L}\p{N}]/u.test(trimmed) ||
      /^(?:0+|null|undefined|nan|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i.test(
        trimmed
      )
    ) {
      continue;
    }
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
  const safeSchema =
    schema && typeof schema === 'object' ? schema : DEFAULT_SMARTPHONE_SCHEMA;
  const slug =
    typeof safeSchema.categorySlug === 'string' &&
    Object.hasOwn(CATEGORY_FILTER_SCHEMAS, safeSchema.categorySlug)
      ? safeSchema.categorySlug
      : 'smartphones';
  const fallbackSchema =
    CATEGORY_FILTER_SCHEMAS[slug] ?? DEFAULT_SMARTPHONE_SCHEMA;
  const presets = Array.isArray(safeSchema.pricePresets)
    ? safeSchema.pricePresets
    : fallbackSchema.pricePresets;
  const features = Array.isArray(safeSchema.featureCheckboxes)
    ? safeSchema.featureCheckboxes
    : fallbackSchema.featureCheckboxes;

  return {
    ...safeSchema,
    directoryName:
      safeSchema.directorySlug === 'services'
        ? t('schemas.directoryServices')
        : safeSchema.directorySlug === 'retail'
          ? t('schemas.directoryRetail')
          : safeSchema.directorySlug === 'places'
            ? t('schemas.directoryPlaces')
            : t('schemas.directoryTech'),
    categoryTitle: t(`schemas.${slug}.title`),
    categorySubtitle: t(`schemas.${slug}.subtitle`),
    searchPlaceholder: t(`schemas.${slug}.searchPlaceholder`),
    pricePresets: presets.map((preset) => ({
      ...preset,
      label: t(`schemas.${slug}.presets.${preset.id}`),
    })),
    featureCheckboxes: features.map((feat) => ({
      ...feat,
      label: t(`schemas.${slug}.features.${feat.key}.label`),
      description: t(`schemas.${slug}.features.${feat.key}.desc`),
    })),
  };
}

export function formatStorageLabel(gb: number): string {
  const rawGb: unknown = gb;
  if (typeof rawGb !== 'number' && typeof rawGb !== 'string') {
    return '0GB';
  }
  let n: number;
  if (typeof rawGb === 'string') {
    const cleaned = rawGb.replace(CATEGORY_CONTROL_CHAR_RE, '').trim();
    if (!cleaned || cleaned.length > 32 || /^[+-]?0[xbo]/i.test(cleaned)) {
      return '0GB';
    }
    n = Number(cleaned);
  } else {
    n = rawGb;
  }
  if (!Number.isFinite(n) || n <= 0 || n > MAX_STORAGE_GB) {
    return '0GB';
  }
  if (n >= 1024) {
    const tb = Number((n / 1024).toFixed(2));
    if (Math.abs(tb * 1024 - n) < 1e-6) {
      return `${tb}TB`;
    }
  }
  return `${n}GB`;
}
