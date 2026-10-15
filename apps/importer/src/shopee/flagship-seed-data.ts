import type { ProductSpecifications, KeySpecs } from '@repo/shared-data';

export interface FlagshipDeviceSeed {
  categorySlug: 'smartphones' | 'tablets' | 'laptops' | 'smartwatches' | 'earbuds';
  brand: string;
  model: string;
  variant_name: string;
  model_key: string;
  name: string;
  slug: string;
  description: string;
  ram_gb: number | null;
  storage_gb: number | null;
  screen_size_inch: number | null;
  battery_mah: number | null;
  has_5g: boolean;
  colors: string[];
  images: string[];
  specifications: ProductSpecifications;
  key_specs: KeySpecs;
  expert_rating: number;
  expert_review_summary: string;
  expert_criteria_scores: {
    display: number;
    performance: number;
    camera: number;
    battery: number;
    value: number;
  };
  listings: Array<{
    platform: 'shopee' | 'lazada' | 'tiki' | 'cellphones' | 'tgdd';
    platform_item_id: string;
    merchant_key: string;
    title: string;
    price_current: number;
    price_original: number;
    historical_sold: number;
    stock: number;
    rating_star: number;
    rating_count: number;
    url: string;
    /** Price history points relative to today: { daysAgo, price, priceOriginal } */
    price_history: Array<{ daysAgo: number; price: number; priceOriginal: number }>;
    reviews: Array<{
      reviewId: string;
      author: string;
      ratingStar: number;
      comment: string;
      variation: string;
      daysAgo: number;
    }>;
  }>;
}

export interface SeedMerchantProfile {
  key: string;
  platform: 'shopee' | 'lazada' | 'tiki' | 'cellphones' | 'tgdd';
  platform_shop_id: string;
  name: string;
  slug: string;
  url: string;
  is_official: boolean;
  rating_star: number;
  follower_count: number;
  location: string;
  dosafe_risk_score: number;
}

export const SEED_MERCHANTS: SeedMerchantProfile[] = [
  {
    key: 'shopee_apple_flagship',
    platform: 'shopee',
    platform_shop_id: '88201679',
    name: 'Apple Flagship Store',
    slug: 'apple-flagship-store-shopee',
    url: 'https://shopee.vn/apple_flagship_store',
    is_official: true,
    rating_star: 4.94,
    follower_count: 1125000,
    location: 'TP. Hồ Chí Minh',
    dosafe_risk_score: 2,
  },
  {
    key: 'shopee_samsung_official',
    platform: 'shopee',
    platform_shop_id: '65589552',
    name: 'Samsung Official Store',
    slug: 'samsung-official-store-shopee',
    url: 'https://shopee.vn/samsung_official_store',
    is_official: true,
    rating_star: 4.92,
    follower_count: 985000,
    location: 'TP. Hồ Chí Minh',
    dosafe_risk_score: 3,
  },
  {
    key: 'shopee_xiaomi_official',
    platform: 'shopee',
    platform_shop_id: '139249852',
    name: 'Xiaomi Official Store VN',
    slug: 'xiaomi-official-store-vn-shopee',
    url: 'https://shopee.vn/xiaomi.official.store.vn',
    is_official: true,
    rating_star: 4.91,
    follower_count: 742000,
    location: 'TP. Hồ Chí Minh',
    dosafe_risk_score: 4,
  },
  {
    key: 'lazada_oppo_flagship',
    platform: 'lazada',
    platform_shop_id: 'laz-oppo-vn-01',
    name: 'OPPO Flagship Store LazMall',
    slug: 'oppo-flagship-store-lazmall',
    url: 'https://www.lazada.vn/shop/oppo-flagship-store',
    is_official: true,
    rating_star: 4.9,
    follower_count: 530000,
    location: 'TP. Hồ Chí Minh',
    dosafe_risk_score: 4,
  },
  {
    key: 'tiki_trading',
    platform: 'tiki',
    platform_shop_id: 'tiki-trading-1',
    name: 'Tiki Trading Official',
    slug: 'tiki-trading-official',
    url: 'https://tiki.vn/cua-hang/tiki-trading',
    is_official: true,
    rating_star: 4.89,
    follower_count: 890000,
    location: 'TP. Hồ Chí Minh',
    dosafe_risk_score: 5,
  },
  {
    key: 'cellphones_official',
    platform: 'cellphones',
    platform_shop_id: 'cps-retail-vn',
    name: 'CellphoneS Hệ Thống Bán Lẻ Ủy Quyền',
    slug: 'cellphones-official',
    url: 'https://cellphones.com.vn',
    is_official: true,
    rating_star: 4.93,
    follower_count: 680000,
    location: 'Toàn quốc (TP.HCM & Hà Nội)',
    dosafe_risk_score: 3,
  },
  {
    key: 'tgdd_official',
    platform: 'tgdd',
    platform_shop_id: 'tgdd-mwg-vn',
    name: 'Thế Giới Di Động Official',
    slug: 'the-gioi-di-dong-official',
    url: 'https://www.thegioididong.com',
    is_official: true,
    rating_star: 4.91,
    follower_count: 1450000,
    location: 'Toàn quốc',
    dosafe_risk_score: 2,
  },
  {
    key: 'shopee_grey_market_247',
    platform: 'shopee',
    platform_shop_id: '998120441',
    name: 'Kho Sỉ Công Nghệ Giá Rẻ 247',
    slug: 'kho-si-cong-nghe-gia-re-247',
    url: 'https://shopee.vn/kho_si_cong_nghe_247',
    is_official: false,
    rating_star: 4.35,
    follower_count: 1840,
    location: 'Hà Nội',
    dosafe_risk_score: 48,
  },
];

/**
 * Authoritative 10-Field-Group specifications (PhoneArena structure + GSMArena depth)
 * for existing & flagship devices across all 5 categories.
 */
export const CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY: Record<
  string,
  {
    ram_gb: number | null;
    storage_gb: number | null;
    screen_size_inch: number | null;
    battery_mah: number | null;
    has_5g: boolean;
    colors: string[];
    expert_rating: number;
    expert_review_summary: string;
    expert_criteria_scores: {
      display: number;
      performance: number;
      camera: number;
      battery: number;
      value: number;
    };
    specifications: ProductSpecifications;
    key_specs: KeySpecs;
  }
> = {
  'apple:iphone-16:128gb': {
    ram_gb: 8,
    storage_gb: 128,
    screen_size_inch: 6.1,
    battery_mah: 3561,
    has_5g: true,
    colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'],
    expert_rating: 4.6,
    expert_review_summary:
      'iPhone 16 tiêu chuẩn nâng cấp mạnh với chip A18 3nm (8GB RAM hỗ trợ Apple Intelligence), nút Action Button và Camera Control, nhưng màn hình vẫn giữ ở mức 60Hz.',
    expert_criteria_scores: {
      display: 8.2,
      performance: 9.5,
      camera: 8.9,
      battery: 8.6,
      value: 8.8,
    },
    specifications: {
      availability: {
        announced: 'September 2024',
        status: 'Available',
        prices_msrp: '22.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '147.6 x 71.6 x 7.8 mm',
        weight_g: 170,
        materials:
          'Ceramic Shield (2024) front, color-infused glass back, aerospace-grade aluminum frame',
        build: 'Khung nhôm hàng không, mặt lưng kính pha màu nhám',
        resistance: 'IP68 dust/water resistant (up to 6m for 30 min)',
        biometrics: '3D Face ID (TrueDepth camera)',
        keys: 'Action Button, Camera Control, Volume, Side Power button',
        colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'],
      },
      display: {
        size_inch: 6.1,
        type: 'Super Retina XDR OLED, HDR10, Dolby Vision, 1000 nits (typ), 2000 nits (peak)',
        resolution: '1179 x 2556 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 60,
        ppi: 460,
        protection: 'Ceramic Shield glass (2024 generation)',
        features: 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch',
      },
      hardware: {
        chipset: 'Apple A18 (3 nm)',
        cpu: 'Hexa-core (2x4.04 GHz performance + 4x2.20 GHz efficiency)',
        gpu: 'Apple GPU (5-core graphics with hardware ray tracing)',
        ram_gb: 8,
        storage_gb: 128,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (NVMe)',
        os: 'iOS 18 (hỗ trợ Apple Intelligence)',
      },
      battery: {
        capacity_mah: 3561,
        type: 'Li-Ion 3561 mAh, non-removable',
        charging:
          '25W wired PD2.0 (50% in 30 min), 25W MagSafe wireless, 15W Qi2 wireless, 4.5W reverse wired',
        fast_charging_w: 25,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Dual Camera',
        main_camera:
          '48 MP, f/1.6, 26mm (wide), 1/1.56", 1.0µm, dual pixel PDAF, sensor-shift OIS (2x optical-quality telephoto)',
        second_camera:
          '12 MP, f/2.2, 13mm, 120˚ (ultrawide), 0.7µm, dual pixel PDAF (hỗ trợ chụp Macro)',
        front_camera: '12 MP, f/1.9, 23mm (wide), 1/3.6", PDAF + SL 3D (depth/biometrics sensor)',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K@24/25/30/60fps, 1080p@25/30/60/120/240fps, HDR, Dolby Vision HDR (up to 60fps), Spatial Video, Stereo sound rec.',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6/7, dual-band, hotspot',
        usb: 'USB Type-C 2.0 (480Mbps), DisplayPort',
        sensors: 'Face ID, accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, GALILEO, BDS, QZSS',
        nfc: true,
        other: 'Ultra Wideband (UWB) gen2 chip, Emergency SOS via satellite',
      },
      cellular: {
        has_5g: true,
        bands_5g:
          'SA/NSA/Sub6 (n1/n2/n3/n5/n7/n8/n12/n20/n25/n26/n28/n30/n38/n40/n41/n48/n66/n70/n77/n78/n79)',
        bands_4g: 'Gigabit LTE with 4x4 MIMO',
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        data_speed: 'HSPA, LTE-A, 5G, EV-DO Rev.A 3.1 Mbps',
        sim_type: '1 Nano-SIM + eSIM (hỗ trợ Dual eSIM)',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo hỗ trợ Spatial Audio & Dolby Atmos',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio playback, Audio Mix, Voice Isolation',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-E8692A',
        sar_head: '1.14 W/kg',
        sar_body: '1.15 W/kg',
        certifications: 'CE, FCC, RoHS, QCVN (Bộ TT&TT Việt Nam)',
      },
    },
    key_specs: {
      screen: '6.1" Super Retina XDR OLED',
      chip: 'Apple A18 (3 nm)',
      camera: '48MP Fusion + 12MP Ultrawide Macro',
      battery: '3561 mAh (25W MagSafe)',
      storage: '128GB',
      ram: '8GB',
    },
  },
  'apple:iphone-16-plus:256gb': {
    ram_gb: 8,
    storage_gb: 256,
    screen_size_inch: 6.7,
    battery_mah: 4674,
    has_5g: true,
    colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'],
    expert_rating: 4.7,
    expert_review_summary:
      'iPhone 16 Plus 256GB sở hữu thời lượng pin ấn tượng nhất dòng tiêu chuẩn (4674 mAh), màn hình lớn 6.7 inch và hiệu năng A18 mượt mà nhiều năm.',
    expert_criteria_scores: {
      display: 8.5,
      performance: 9.5,
      camera: 8.9,
      battery: 9.6,
      value: 8.9,
    },
    specifications: {
      availability: {
        announced: 'September 2024',
        status: 'Available',
        prices_msrp: '28.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '160.9 x 77.8 x 7.8 mm',
        weight_g: 199,
        materials:
          'Ceramic Shield (2024) front, color-infused glass back, aerospace-grade aluminum frame',
        build: 'Khung nhôm hàng không, mặt lưng kính pha màu nhám',
        resistance: 'IP68 dust/water resistant (up to 6m for 30 min)',
        biometrics: '3D Face ID (TrueDepth camera)',
        keys: 'Action Button, Camera Control, Volume, Side Power button',
        colors: ['Xanh Lưu Ly', 'Xanh Mòng Két', 'Hồng', 'Trắng', 'Đen'],
      },
      display: {
        size_inch: 6.7,
        type: 'Super Retina XDR OLED, HDR10, Dolby Vision, 1000 nits (typ), 2000 nits (peak)',
        resolution: '1290 x 2796 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 60,
        ppi: 460,
        protection: 'Ceramic Shield glass (2024 generation)',
        features: 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch',
      },
      hardware: {
        chipset: 'Apple A18 (3 nm)',
        cpu: 'Hexa-core (2x4.04 GHz performance + 4x2.20 GHz efficiency)',
        gpu: 'Apple GPU (5-core graphics with hardware ray tracing)',
        ram_gb: 8,
        storage_gb: 256,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (NVMe)',
        os: 'iOS 18 (hỗ trợ Apple Intelligence)',
      },
      battery: {
        capacity_mah: 4674,
        type: 'Li-Ion 4674 mAh, non-removable',
        charging: '25W wired PD2.0, 25W MagSafe wireless, 15W Qi2 wireless, 4.5W reverse wired',
        fast_charging_w: 25,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Dual Camera',
        main_camera: '48 MP, f/1.6, 26mm (wide), 1/1.56", 1.0µm, dual pixel PDAF, sensor-shift OIS',
        second_camera:
          '12 MP, f/2.2, 13mm, 120˚ (ultrawide), 0.7µm, dual pixel PDAF (hỗ trợ chụp Macro)',
        front_camera: '12 MP, f/1.9, 23mm (wide), 1/3.6", PDAF + SL 3D',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K@24/25/30/60fps, 1080p@25/30/60/120/240fps, HDR, Dolby Vision HDR (up to 60fps), Spatial Video',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6/7, dual-band, hotspot',
        usb: 'USB Type-C 2.0 (480Mbps), DisplayPort',
        sensors: 'Face ID, accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, GALILEO, BDS, QZSS',
        nfc: true,
        other: 'Ultra Wideband (UWB) gen2 chip, Emergency SOS via satellite',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'Gigabit LTE with 4x4 MIMO',
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        data_speed: 'HSPA, LTE-A, 5G',
        sim_type: '1 Nano-SIM + eSIM (hỗ trợ Dual eSIM)',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo hỗ trợ Spatial Audio & Dolby Atmos',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio playback, Audio Mix, Voice Isolation',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-E8693A',
        sar_head: '1.12 W/kg',
        sar_body: '1.14 W/kg',
        certifications: 'CE, FCC, RoHS, QCVN (Bộ TT&TT Việt Nam)',
      },
    },
    key_specs: {
      screen: '6.7" Super Retina XDR OLED',
      chip: 'Apple A18 (3 nm)',
      camera: '48MP Fusion + 12MP Ultrawide Macro',
      battery: '4674 mAh (25W MagSafe)',
      storage: '256GB',
      ram: '8GB',
    },
  },
  'apple:iphone-15:128gb': {
    ram_gb: 6,
    storage_gb: 128,
    screen_size_inch: 6.1,
    battery_mah: 3349,
    has_5g: true,
    colors: ['Hồng', 'Vàng', 'Xanh Lá', 'Xanh Dương', 'Đen'],
    expert_rating: 4.5,
    expert_review_summary:
      'iPhone 15 128GB mang Dynamic Island, cổng USB-C và camera chính 48MP xuống phân khúc dễ tiếp cận hơn, là lựa chọn iOS đáng tiền dưới 20 triệu đồng.',
    expert_criteria_scores: {
      display: 8.1,
      performance: 8.9,
      camera: 8.7,
      battery: 8.3,
      value: 9.1,
    },
    specifications: {
      availability: {
        announced: 'September 2023',
        status: 'Available',
        prices_msrp: '19.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '147.6 x 71.6 x 7.8 mm',
        weight_g: 171,
        materials: 'Ceramic Shield front, color-infused glass back, aluminum frame',
        build: 'Khung nhôm bo cong nhẹ, mặt lưng kính pha màu nhám',
        resistance: 'IP68 dust/water resistant (up to 6m for 30 min)',
        biometrics: '3D Face ID (TrueDepth camera)',
        keys: 'Silent Switch, Volume, Side Power button',
        colors: ['Hồng', 'Vàng', 'Xanh Lá', 'Xanh Dương', 'Đen'],
      },
      display: {
        size_inch: 6.1,
        type: 'Super Retina XDR OLED, HDR10, Dolby Vision, 1000 nits (HBM), 2000 nits (peak)',
        resolution: '1179 x 2556 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 60,
        ppi: 460,
        protection: 'Ceramic Shield glass',
        features: 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch',
      },
      hardware: {
        chipset: 'Apple A16 Bionic (4 nm)',
        cpu: 'Hexa-core (2x3.46 GHz Everest + 4x2.02 GHz Sawtooth)',
        gpu: 'Apple GPU (5-core graphics)',
        ram_gb: 6,
        storage_gb: 128,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (NVMe)',
        os: 'iOS 17 (nâng cấp lên iOS 18)',
      },
      battery: {
        capacity_mah: 3349,
        type: 'Li-Ion 3349 mAh, non-removable',
        charging: '20W wired PD2.0 (50% in 30 min), 15W MagSafe/Qi2 wireless, 4.5W reverse wired',
        fast_charging_w: 20,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Dual Camera',
        main_camera: '48 MP, f/1.6, 26mm (wide), 1/1.56", 1.0µm, dual pixel PDAF, sensor-shift OIS',
        second_camera: '12 MP, f/2.4, 13mm, 120˚ (ultrawide)',
        front_camera: '12 MP, f/1.9, 23mm (wide), 1/3.6", PDAF + SL 3D',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K@24/25/30/60fps, 1080p@25/30/60/120/240fps, HDR, Dolby Vision HDR (up to 60fps), Cinematic mode (4K@30fps)',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6, dual-band, hotspot',
        usb: 'USB Type-C 2.0, DisplayPort',
        sensors: 'Face ID, accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, GALILEO, BDS, QZSS',
        nfc: true,
        other: 'Ultra Wideband (UWB) gen2 chip, Emergency SOS via satellite',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'Gigabit LTE with 4x4 MIMO',
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        data_speed: 'HSPA, LTE-A, 5G',
        sim_type: '1 Nano-SIM + eSIM',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo hỗ trợ Dolby Atmos',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio, Dolby Digital Plus',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-E8431A',
        sar_head: '1.12 W/kg',
        sar_body: '1.14 W/kg',
        certifications: 'CE, FCC, RoHS, QCVN',
      },
    },
    key_specs: {
      screen: '6.1" Super Retina XDR OLED',
      chip: 'Apple A16 Bionic (4 nm)',
      camera: '48MP Main OIS + 12MP Ultrawide',
      battery: '3349 mAh (20W PD)',
      storage: '128GB',
      ram: '6GB',
    },
  },
};

export const FLAGSHIP_DEVICES_TO_SEED: FlagshipDeviceSeed[] = [
  // 1. Samsung Galaxy S24 Ultra 256GB (Quad Camera Flagship)
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    variant_name: '256GB',
    model_key: 'samsung:galaxy-s24-ultra:256gb',
    name: 'Samsung Galaxy S24 Ultra 256GB',
    slug: 'samsung-galaxy-s24-ultra-256gb',
    description:
      'Flagship đỉnh cao Samsung Galaxy S24 Ultra 5G 12GB/256GB với khung Titanium, bút S Pen tích hợp, màn hình chống chói Corning Gorilla Armor và hệ thống Quad Camera 200MP zoom quang 5x/10x.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.8,
    battery_mah: 5000,
    has_5g: true,
    colors: ['Xám Titan', 'Đen Titan', 'Tím Titan', 'Vàng Titan'],
    images: [
      'https://images.samsung.com/is/image/samsung/p6pim/vn/2401/gallery/vn-galaxy-s24-s928-sm-s928bztcxxv-thumb-539291326',
    ],
    expert_rating: 4.9,
    expert_review_summary:
      'Mẫu flagship Android toàn diện nhất năm với lớp kính Gorilla Armor chống phản chiếu xuất sắc, cụm 4 camera đa tiêu cự 200MP + 50MP 5x periscope và cam kết cập nhật 7 năm.',
    expert_criteria_scores: {
      display: 9.8,
      performance: 9.6,
      camera: 9.7,
      battery: 9.3,
      value: 9.1,
    },
    specifications: {
      availability: {
        announced: 'January 2024',
        status: 'Available',
        prices_msrp: '29.990.000₫ (Chính hãng SSVN)',
      },
      design: {
        dimensions: '162.3 x 79.0 x 8.6 mm',
        weight_g: 232,
        materials: 'Corning Gorilla Armor glass front/back, Grade 2 Titanium frame',
        build: 'Khung viền Titanium cấp độ 2, tích hợp khe cắm bút S Pen (độ trễ 2.8ms)',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min)',
        biometrics:
          'Ultrasonic under-display fingerprint (Qualcomm 3D Sonic Gen 2), Face Recognition',
        keys: 'Volume rocker, Side Power/AI key, S Pen ejector',
        colors: ['Xám Titan', 'Đen Titan', 'Tím Titan', 'Vàng Titan'],
      },
      display: {
        size_inch: 6.8,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz (1-120Hz), HDR10+, 2600 nits (peak)',
        resolution: '1440 x 3120 pixels, 19.5:9 ratio (~505 ppi)',
        refresh_rate_hz: 120,
        ppi: 505,
        protection: 'Corning Gorilla Armor (giảm 75% phản xạ ánh sáng)',
        features: 'Always-on display, Vision Booster, DX anti-reflective coating',
      },
      hardware: {
        chipset: 'Qualcomm SM8650-AC Snapdragon 8 Gen 3 for Galaxy (4 nm)',
        cpu: 'Octa-core (1x3.39GHz Cortex-X4 & 3x3.1GHz Cortex-A720 & 2x2.9GHz Cortex-A720 & 2x2.2GHz Cortex-A520)',
        gpu: 'Adreno 750 (1 GHz)',
        ram_gb: 12,
        storage_gb: 256,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (UFS 4.0)',
        os: 'Android 14, One UI 6.1.1 (cam kết 7 năm cập nhật OS)',
      },
      battery: {
        capacity_mah: 5000,
        type: 'Li-Ion 5000 mAh, non-removable',
        charging: '45W wired PD3.0 (65% in 30 min), 15W wireless (Qi/PMA), 4.5W reverse wireless',
        fast_charging_w: 45,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Quad Camera',
        main_camera:
          '200 MP, f/1.7, 24mm (wide), 1/1.3", 0.6µm, multi-directional PDAF, Laser AF, OIS',
        second_camera:
          '50 MP, f/3.4, 111mm (periscope telephoto), 1/2.52", 0.7µm, PDAF, OIS, 5x optical zoom (10x optical quality)',
        third_camera:
          '10 MP, f/2.4, 67mm (telephoto), 1/3.52", 1.12µm, Dual Pixel PDAF, OIS, 3x optical zoom',
        fourth_camera:
          '12 MP, f/2.2, 13mm, 120˚ (ultrawide), 1/2.55", 1.4µm, Dual Pixel PDAF, Super Steady video',
        front_camera: '12 MP, f/2.2, 26mm (wide), 1/3.2", 1.12µm, Dual Pixel PDAF',
        flash: 'LED flash, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60/120fps, 1080p@30/60/240fps, HDR10+, stereo sound rec., gyro-EIS',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2 Gen 1, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX, Ultra Wideband (UWB)',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'LTE Cat20 (up to 2000 Mbps DL)',
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        data_speed: 'HSPA, LTE-A (up to 7CA), 5G',
        sim_type: '2 Nano-SIM + eSIM (Dual stand-by)',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo tinh chỉnh bởi AKG',
        headphone_jack_35mm: false,
        audio_features: '32-bit/384kHz audio, Dolby Atmos',
      },
      regulatory: {
        fcc_approval: 'FCC ID A3LSMS928U',
        sar_head: '1.06 W/kg',
        sar_body: '0.66 W/kg',
        certifications: 'CE, FCC, RoHS, QCVN',
      },
    },
    key_specs: {
      screen: '6.8" Dynamic LTPO AMOLED 2X 120Hz',
      chip: 'Snapdragon 8 Gen 3 for Galaxy',
      camera: '200MP + 50MP (5x) + 10MP (3x) + 12MP',
      battery: '5000 mAh (45W)',
      storage: '256GB',
      ram: '12GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '24819203112',
        merchant_key: 'shopee_samsung_official',
        title: 'Điện thoại Samsung Galaxy S24 Ultra 5G 12GB/256GB Chính Hãng SSVN',
        price_current: 25490000,
        price_original: 29990000,
        historical_sold: 1840,
        stock: 85,
        rating_star: 4.95,
        rating_count: 612,
        url: 'https://shopee.vn/product/65589552/24819203112',
        price_history: [
          { daysAgo: 60, price: 27990000, priceOriginal: 29990000 },
          { daysAgo: 45, price: 27490000, priceOriginal: 29990000 },
          { daysAgo: 30, price: 26990000, priceOriginal: 29990000 },
          { daysAgo: 14, price: 26490000, priceOriginal: 29990000 },
          { daysAgo: 7, price: 25990000, priceOriginal: 29990000 },
          { daysAgo: 0, price: 25490000, priceOriginal: 29990000 },
        ],
        reviews: [
          {
            reviewId: 's24u-rv-1',
            author: 'minh_quan_tech',
            ratingStar: 5,
            comment:
              'Màn hình chống chói Gorilla Armor thực sự khác biệt khi dùng ngoài trời nắng Sài Gòn. Camera zoom 5x chụp sân khấu cực nét, pin 5000mAh trụ dư 1 ngày rưỡi với 7h onscreen.',
            variation: 'Xám Titan, 256GB',
            daysAgo: 12,
          },
          {
            reviewId: 's24u-rv-2',
            author: 'hoang_nam_88',
            ratingStar: 5,
            comment:
              'Hàng chính hãng SSVN nguyên seal, kích hoạt bảo hành điện tử đủ 12 tháng. Bút S Pen ghi chú họp hành rất tiện, Galaxy AI dịch trực tiếp cuộc gọi hoạt động tốt.',
            variation: 'Đen Titan, 256GB',
            daysAgo: 6,
          },
          {
            reviewId: 's24u-rv-3',
            author: 'user_coin_991',
            ratingStar: 5,
            comment:
              'Hình ảnh mang tính chất nhận xu, chưa khui hộp nhưng cứ cho shop 5 sao lấy 200 xu đã.',
            variation: 'Xám Titan, 256GB',
            daysAgo: 3,
          },
        ],
      },
      {
        platform: 'cellphones',
        platform_item_id: 'cps-s24-ultra-256',
        merchant_key: 'cellphones_official',
        title: 'Samsung Galaxy S24 Ultra 12GB 256GB Chính Hãng VN/A',
        price_current: 25990000,
        price_original: 29990000,
        historical_sold: 950,
        stock: 42,
        rating_star: 4.92,
        rating_count: 310,
        url: 'https://cellphones.com.vn/samsung-galaxy-s24-ultra.html',
        price_history: [
          { daysAgo: 45, price: 27990000, priceOriginal: 29990000 },
          { daysAgo: 15, price: 26490000, priceOriginal: 29990000 },
          { daysAgo: 0, price: 25990000, priceOriginal: 29990000 },
        ],
        reviews: [
          {
            reviewId: 's24u-cps-1',
            author: 'thanh_tung_hcm',
            ratingStar: 4,
            comment:
              'Máy rất mạnh và màn phẳng dễ dán cường lực hơn S23 Ultra, chỉ hơi tiếc góc máy vuông nên cầm lâu bằng 1 tay hơi cấn nhẹ.',
            variation: 'Tím Titan, 256GB',
            daysAgo: 9,
          },
        ],
      },
      {
        platform: 'shopee',
        platform_item_id: '99812044101',
        merchant_key: 'shopee_grey_market_247',
        title: '[XẢ KHO GIẢM 40%] Điện thoại Samsung Galaxy S24 Ultra 256GB Quốc Tế Giá Sốc',
        price_current: 26900000,
        price_original: 39990000, // Inflated fake original price
        historical_sold: 24,
        stock: 5,
        rating_star: 4.4,
        rating_count: 15,
        url: 'https://shopee.vn/product/998120441/99812044101',
        price_history: [
          { daysAgo: 30, price: 25500000, priceOriginal: 29990000 },
          { daysAgo: 15, price: 25800000, priceOriginal: 29990000 },
          { daysAgo: 0, price: 26900000, priceOriginal: 39990000 },
        ],
        reviews: [
          {
            reviewId: 's24u-grey-1',
            author: 'seeding_acc_01',
            ratingStar: 5,
            comment:
              'Shop uy tín nhất vịnh bắc bộ mua ngay kẻo lỡ tuyệt vời xuất sắc 10 điểm không có nhưng!',
            variation: 'Đen Titan',
            daysAgo: 2,
          },
        ],
      },
    ],
  },

  // 2. Apple iPhone 16 Pro Max 256GB (Triple Camera + LiDAR Flagship)
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    variant_name: '256GB',
    model_key: 'apple:iphone-16-pro-max:256gb',
    name: 'Apple iPhone 16 Pro Max 256GB',
    slug: 'apple-iphone-16-pro-max-256gb',
    description:
      'Apple iPhone 16 Pro Max 256GB VN/A với màn hình 6.9 inch viền siêu mỏng, khung Titan cấp độ 5, chip A18 Pro 3nm, quay video 4K 120fps Dolby Vision và nút Camera Control chuyên nghiệp.',
    ram_gb: 8,
    storage_gb: 256,
    screen_size_inch: 6.9,
    battery_mah: 4685,
    has_5g: true,
    colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Trắng', 'Titan Đen'],
    images: [
      'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/iphone-16-pro-finish-select-202409-6-9inch-deserttitanium?wid=800&hei=800&fmt=jpeg',
    ],
    expert_rating: 4.9,
    expert_review_summary:
      'Đỉnh cao công nghệ của Apple năm 2024 với thời lượng pin kỷ lục trên iPhone, quay video 4K@120fps ProRes, camera góc siêu rộng 48MP mới và hiệu năng đơn nhân dẫn đầu thị trường.',
    expert_criteria_scores: {
      display: 9.7,
      performance: 9.9,
      camera: 9.7,
      battery: 9.7,
      value: 9.0,
    },
    specifications: {
      availability: {
        announced: 'September 2024',
        status: 'Available',
        prices_msrp: '34.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '163.0 x 77.6 x 8.25 mm',
        weight_g: 227,
        materials: 'Ceramic Shield (2024) front, textured matte glass back, Grade 5 Titanium frame',
        build: 'Khung Titan cấp 5 siêu bền nhẹ, cấu trúc tản nhiệt nhôm tái chế 100%',
        resistance: 'IP68 dust/water resistant (up to 6m for 30 min)',
        biometrics: '3D Face ID (TrueDepth camera)',
        keys: 'Action Button, Camera Control (cảm ứng lực sapphire), Volume, Side Power button',
        colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Trắng', 'Titan Đen'],
      },
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, ProMotion 120Hz, HDR10, Dolby Vision, 1-2000 nits',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield glass (2024 generation, bền gấp 2 lần)',
        features:
          'Always-On display, Dynamic Island, ProMotion 1-120Hz, True Tone, Wide color (P3)',
      },
      hardware: {
        chipset: 'Apple A18 Pro (3 nm N3E)',
        cpu: 'Hexa-core (2x4.05 GHz performance + 4x2.42 GHz efficiency)',
        gpu: 'Apple GPU (6-core graphics with hardware-accelerated ray tracing)',
        ram_gb: 8,
        storage_gb: 256,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (NVMe)',
        os: 'iOS 18 (hỗ trợ Apple Intelligence)',
      },
      battery: {
        capacity_mah: 4685,
        type: 'Li-Ion 4685 mAh, non-removable',
        charging: '30W wired PD2.0, 25W MagSafe wireless (Qi2 15W), 4.5W reverse wired',
        fast_charging_w: 30,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Triple Camera',
        main_camera:
          '48 MP, f/1.78, 24mm (wide), 1/1.28", 1.22µm, dual pixel PDAF, second-gen sensor-shift OIS',
        second_camera:
          '12 MP, f/2.8, 120mm (periscope telephoto), 1/3.06", 1.12µm, dual pixel PDAF, 3D sensor-shift OIS, 5x optical zoom',
        third_camera: '48 MP, f/2.2, 13mm, 120˚ (ultrawide), 0.7µm, PDAF + TOF 3D LiDAR scanner',
        front_camera: '12 MP, f/1.9, 23mm (wide), 1/3.6", PDAF, OIS + SL 3D',
        flash: 'Adaptive True Tone LED flash, HDR (photo/panorama)',
        video_recording:
          '4K@24/25/30/60/100/120fps (Dolby Vision), 1080p@25/30/60/120/240fps, 10-bit HDR, ProRes, Apple Log, Spatial Video, 4-mic studio array',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7 (802.11be), tri-band, hotspot',
        usb: 'USB Type-C 3.2 Gen 2 (10Gbps), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, accelerometer, high-g gyro, proximity, compass, barometer',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other: 'Ultra Wideband (UWB) gen2 chip, Emergency SOS via satellite',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6 (Qualcomm Snapdragon X75 5G Modem)',
        bands_4g: 'Gigabit LTE with 4x4 MIMO',
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        data_speed: 'HSPA, LTE-A, 5G',
        sim_type: '1 Nano-SIM + eSIM (hỗ trợ Dual eSIM)',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo + Hệ thống 4 micro chuẩn phòng thu (Audio Mix)',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio, Dolby Atmos, Lossless Audio via USB-C',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-E8695A',
        sar_head: '1.16 W/kg',
        sar_body: '1.17 W/kg',
        certifications: 'CE, FCC, RoHS, QCVN',
      },
    },
    key_specs: {
      screen: '6.9" LTPO Super Retina XDR 120Hz',
      chip: 'Apple A18 Pro (3 nm)',
      camera: '48MP Fusion + 48MP Ultrawide + 12MP 5x',
      battery: '4685 mAh (30W PD / 25W MagSafe)',
      storage: '256GB',
      ram: '8GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '29104857123',
        merchant_key: 'shopee_apple_flagship',
        title: 'Điện thoại Apple iPhone 16 Pro Max 256GB Chính Hãng VN/A',
        price_current: 32490000,
        price_original: 34990000,
        historical_sold: 3420,
        stock: 60,
        rating_star: 4.96,
        rating_count: 1120,
        url: 'https://shopee.vn/product/88201679/29104857123',
        price_history: [
          { daysAgo: 60, price: 34990000, priceOriginal: 34990000 },
          { daysAgo: 45, price: 34290000, priceOriginal: 34990000 },
          { daysAgo: 30, price: 33690000, priceOriginal: 34990000 },
          { daysAgo: 15, price: 32990000, priceOriginal: 34990000 },
          { daysAgo: 0, price: 32490000, priceOriginal: 34990000 },
        ],
        reviews: [
          {
            reviewId: 'ip16pm-rv-1',
            author: 'duc_anh_photo',
            ratingStar: 5,
            comment:
              'Màu Titan Sa Mạc ngoài đời cực sang, viền màn hình mỏng đến mức gần như tràn viền. Quay 4K 120fps slow-motion mượt kinh khủng, pin dùng hỗn hợp gần 2 ngày mới phải sạc.',
            variation: 'Titan Sa Mạc, 256GB',
            daysAgo: 10,
          },
          {
            reviewId: 'ip16pm-rv-2',
            author: 'linh_chi_nguyen',
            ratingStar: 5,
            comment:
              'Giao hàng hoả tốc 2 tiếng ở Q1, nguyên seal Apple Việt Nam, check serial chuẩn ngày kích hoạt. Camera zoom 5x chụp chân dung xoá phông rất tự nhiên.',
            variation: 'Titan Tự Nhiên, 256GB',
            daysAgo: 4,
          },
        ],
      },
      {
        platform: 'tgdd',
        platform_item_id: 'tgdd-ip16pm-256',
        merchant_key: 'tgdd_official',
        title: 'Điện thoại iPhone 16 Pro Max 256GB VN/A',
        price_current: 32990000,
        price_original: 34990000,
        historical_sold: 2150,
        stock: 90,
        rating_star: 4.94,
        rating_count: 580,
        url: 'https://www.thegioididong.com/dtdd/iphone-16-pro-max',
        price_history: [
          { daysAgo: 30, price: 33990000, priceOriginal: 34990000 },
          { daysAgo: 0, price: 32990000, priceOriginal: 34990000 },
        ],
        reviews: [],
      },
    ],
  },

  // 3. Samsung Galaxy A55 5G 256GB (Mid-range Champion - Triple Camera)
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy A55',
    variant_name: '256GB',
    model_key: 'samsung:galaxy-a55:256gb',
    name: 'Samsung Galaxy A55 256GB',
    slug: 'samsung-galaxy-a55-256gb',
    description:
      'Samsung Galaxy A55 5G 8GB/256GB với khung viền kim loại Key Island, mặt lưng kính Gorilla Glass Victus+, kháng nước IP67 và hệ thống 3 camera 50MP chống rung OIS.',
    ram_gb: 8,
    storage_gb: 256,
    screen_size_inch: 6.6,
    battery_mah: 5000,
    has_5g: true,
    colors: ['Xanh Iceblue', 'Tím Lilac', 'Xanh đen Navy', 'Vàng Lemon'],
    images: [
      'https://images.samsung.com/is/image/samsung/p6pim/vn/sm-a556elbgxxv/gallery/vn-galaxy-a55-5g-sm-a556-sm-a556elbgxxv-thumb-540150082',
    ],
    expert_rating: 4.5,
    expert_review_summary:
      'Chiếc máy tầm trung hoàn thiện tốt nhất của Samsung với khung nhôm phay xước, kính Victus+, bảo mật phần cứng Knox Vault và thời lượng pin 5000mAh cực kỳ bền bỉ.',
    expert_criteria_scores: {
      display: 8.8,
      performance: 8.2,
      camera: 8.3,
      battery: 9.2,
      value: 9.3,
    },
    specifications: {
      availability: {
        announced: 'March 2024',
        status: 'Available',
        prices_msrp: '10.990.000₫ (Chính hãng SSVN)',
      },
      design: {
        dimensions: '161.1 x 77.4 x 8.2 mm',
        weight_g: 213,
        materials:
          'Corning Gorilla Glass Victus+ front, Gorilla Glass back, brushed aluminum frame',
        build: 'Khung nhôm phay xước thiết kế nổi Key Island',
        resistance: 'IP67 dust/water resistant (up to 1m for 30 min)',
        biometrics: 'Optical under-display fingerprint, Face unlock',
        keys: 'Key Island (Volume rocker, Side Power key)',
        colors: ['Xanh Iceblue', 'Tím Lilac', 'Xanh đen Navy', 'Vàng Lemon'],
      },
      display: {
        size_inch: 6.6,
        type: 'Super AMOLED, 120Hz, HDR10+, 1000 nits (HBM)',
        resolution: '1080 x 2340 pixels, 19.5:9 ratio (~390 ppi)',
        refresh_rate_hz: 120,
        ppi: 390,
        protection: 'Corning Gorilla Glass Victus+',
        features: 'Always-on display, Vision Booster',
      },
      hardware: {
        chipset: 'Exynos 1480 (4 nm)',
        cpu: 'Octa-core (4x2.75 GHz Cortex-A78 & 4x2.0 GHz Cortex-A55)',
        gpu: 'Xclipse 530 (kiến trúc AMD RDNA 2)',
        ram_gb: 8,
        storage_gb: 256,
        storage_expansion: 'Hỗ trợ thẻ nhớ microSDXC (dùng chung khe SIM 2, tối đa 1TB)',
        os: 'Android 14, One UI 6.1 (4 năm cập nhật OS)',
      },
      battery: {
        capacity_mah: 5000,
        type: 'Li-Ion 5000 mAh, non-removable',
        charging: '25W wired PD3.0',
        fast_charging_w: 25,
        reverse_charging: false,
      },
      camera: {
        rear_setup: 'Triple Camera',
        main_camera: '50 MP, f/1.8, (wide), 1/1.56", 1.0µm, PDAF, OIS',
        second_camera: '12 MP, f/2.2, 123˚ (ultrawide), 1/3.06", 1.12µm',
        third_camera: '5 MP, f/2.4 (macro)',
        front_camera: '32 MP, f/2.2, 26mm (wide), 1/2.74", 0.8µm',
        flash: 'LED flash, panorama, HDR',
        video_recording: '4K@30fps, 1080p@30/60fps, gyro-EIS',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6, dual-band, Wi-Fi Direct',
        usb: 'USB Type-C 2.0, OTG',
        sensors:
          'Fingerprint (under display, optical), accelerometer, gyro, compass, Virtual proximity sensing',
        location: 'GPS, GALILEO, GLONASS, BDS, QZSS',
        nfc: true,
        other: 'Samsung Knox Vault EAL5+ hardware security',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'LTE Cat18',
        technology: 'GSM / HSPA / LTE / 5G',
        data_speed: 'HSPA, LTE, 5G',
        sim_type: 'Hybrid Dual SIM (Nano-SIM) + eSIM',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo hỗ trợ Dolby Atmos',
        headphone_jack_35mm: false,
        audio_features: 'Voice Focus, Dolby Atmos',
      },
      regulatory: {
        fcc_approval: 'FCC ID A3LSMA556E',
        sar_head: '0.68 W/kg',
        sar_body: '1.04 W/kg',
        certifications: 'CE, FCC, RoHS, QCVN',
      },
    },
    key_specs: {
      screen: '6.6" Super AMOLED 120Hz',
      chip: 'Exynos 1480 (4 nm)',
      camera: '50MP OIS + 12MP Ultrawide + 5MP Macro',
      battery: '5000 mAh (25W)',
      storage: '256GB',
      ram: '8GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '25918273645',
        merchant_key: 'shopee_samsung_official',
        title: 'Điện thoại Samsung Galaxy A55 5G 8GB RAM 256GB Chính Hãng',
        price_current: 8690000,
        price_original: 10990000,
        historical_sold: 4210,
        stock: 150,
        rating_star: 4.93,
        rating_count: 1480,
        url: 'https://shopee.vn/product/65589552/25918273645',
        price_history: [
          { daysAgo: 60, price: 9990000, priceOriginal: 10990000 },
          { daysAgo: 45, price: 9690000, priceOriginal: 10990000 },
          { daysAgo: 30, price: 9390000, priceOriginal: 10990000 },
          { daysAgo: 15, price: 9190000, priceOriginal: 10990000 },
          { daysAgo: 0, price: 8690000, priceOriginal: 10990000 },
        ],
        reviews: [
          {
            reviewId: 'a55-rv-1',
            author: 'phuong_thao_95',
            ratingStar: 5,
            comment:
              'Mua tặng bố mẹ cực kỳ ưng ý! Khung kim loại cầm đầm tay như dòng S, màn hình sáng rõ, pin trâu dùng 2 ngày mới sạc 1 lần.',
            variation: 'Xanh Iceblue, 8GB/256GB',
            daysAgo: 8,
          },
        ],
      },
      {
        platform: 'tiki',
        platform_item_id: 'tiki-a55-256',
        merchant_key: 'tiki_trading',
        title: 'Điện Thoại Samsung Galaxy A55 5G (8GB/256GB) - Hàng Chính Hãng',
        price_current: 8890000,
        price_original: 10990000,
        historical_sold: 1120,
        stock: 70,
        rating_star: 4.9,
        rating_count: 340,
        url: 'https://tiki.vn/dien-thoai-samsung-galaxy-a55-5g-p274819201.html',
        price_history: [
          { daysAgo: 30, price: 9490000, priceOriginal: 10990000 },
          { daysAgo: 0, price: 8890000, priceOriginal: 10990000 },
        ],
        reviews: [],
      },
    ],
  },

  // 4. Xiaomi 14 Ultra 5G 16GB/512GB (Quad Camera Leica 1-inch Sensor Flagship)
  {
    categorySlug: 'smartphones',
    brand: 'Xiaomi',
    model: '14 Ultra',
    variant_name: '512GB',
    model_key: 'xiaomi:14-ultra:512gb',
    name: 'Xiaomi 14 Ultra 512GB',
    slug: 'xiaomi-14-ultra-512gb',
    description:
      'Xiaomi 14 Ultra 5G 16GB/512GB chính hãng với hệ thống 4 camera Leica Summilux 50MP cảm biến chính 1-inch Sony LYT-900 khẩu độ biến thiên vô cấp f/1.63-f/4.0, Snapdragon 8 Gen 3 và sạc nhanh 90W.',
    ram_gb: 16,
    storage_gb: 512,
    screen_size_inch: 6.73,
    battery_mah: 5000,
    has_5g: true,
    colors: ['Đen Da Thuần Chay', 'Trắng Da Thuần Chay'],
    images: [
      'https://i02.appmifile.com/685_operator_sg/23/02/2024/c2b48fb43db8715808b90e440275996e.png',
    ],
    expert_rating: 4.8,
    expert_review_summary:
      'Camera phone xuất sắc bậc nhất dành cho nhiếp ảnh gia di động nhờ cảm biến 1-inch LYT-900 khẩu độ biến thiên, 2 ống kính tele Leica 75mm & 120mm cùng sạc không dây 80W siêu tốc.',
    expert_criteria_scores: {
      display: 9.6,
      performance: 9.6,
      camera: 9.9,
      battery: 9.1,
      value: 9.0,
    },
    specifications: {
      availability: {
        announced: 'February 2024',
        status: 'Available',
        prices_msrp: '29.990.000₫ (Chính hãng DGW)',
      },
      design: {
        dimensions: '161.4 x 75.3 x 9.2 mm',
        weight_g: 219.8,
        materials:
          'Xiaomi Shield Glass front, nano-tech vegan leather back, high-strength 6M42 aluminum frame',
        build: 'Khung nhôm nguyên khối Xiaomi Guardian Structure, mặt lưng da nano chống bám bẩn',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min)',
        biometrics: 'Optical under-display fingerprint, AI Face unlock',
        keys: 'Volume rocker, Textured Power button',
        colors: ['Đen Da Thuần Chay', 'Trắng Da Thuần Chay'],
      },
      display: {
        size_inch: 6.73,
        type: 'LTPO AMOLED, 68B colors, 120Hz (1-120Hz), Dolby Vision, HDR10+, 3000 nits (peak)',
        resolution: '1440 x 3200 pixels, 20:9 ratio (~522 ppi)',
        refresh_rate_hz: 120,
        ppi: 522,
        protection: 'Xiaomi Shield Glass (bền gấp 10 lần khi rơi)',
        features: 'All Around Liquid Display, 1920Hz PWM dimming, Original Color PRO',
      },
      hardware: {
        chipset: 'Qualcomm SM8650-AB Snapdragon 8 Gen 3 (4 nm)',
        cpu: 'Octa-core (1x3.3 GHz Cortex-X4 & 3x3.2 GHz Cortex-A720 & 2x3.0 GHz Cortex-A720 & 2x2.3 GHz Cortex-A520)',
        gpu: 'Adreno 750',
        ram_gb: 16,
        storage_gb: 512,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (UFS 4.0)',
        os: 'Android 14, Xiaomi HyperOS',
      },
      battery: {
        capacity_mah: 5000,
        type: 'Li-Po 5000 mAh, non-removable',
        charging:
          '90W wired HyperCharge (100% in 33 min), 80W wireless HyperCharge, 10W reverse wireless',
        fast_charging_w: 90,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Quad Camera (Leica Summilux)',
        main_camera:
          '50 MP, f/1.63-f/4.0 (stepless variable aperture), 23mm (wide), 1.0"-type (Sony LYT-900), 1.6µm, multi-directional PDAF, Laser AF, OIS',
        second_camera:
          '50 MP, f/1.8, 75mm (floating telephoto), 1/2.51" (IMX858), Dual-Pixel PDAF (10cm telemacro), OIS, 3.2x optical zoom',
        third_camera:
          '50 MP, f/2.5, 120mm (periscope telephoto), 1/2.51" (IMX858), Dual-Pixel PDAF (30cm macro), OIS, 5x optical zoom',
        fourth_camera:
          '50 MP, f/1.8, 12mm, 122˚ (ultrawide), 1/2.51" (IMX858), Dual-Pixel PDAF (5cm macro)',
        front_camera: '32 MP, f/2.0, 22mm (wide), 0.7µm',
        flash: 'Dual-LED flash, HDR, Leica Authentic & Vibrant styles',
        video_recording:
          '8K@24/30fps, 4K@24/30/60/120fps, 1080p@30/60/120/240/480/960/1920fps, gyro-EIS, Dolby Vision HDR 10-bit rec., 4-mic array',
      },
      connectivity: {
        bluetooth: '5.4, A2DP, LE, aptX HD, aptX Adaptive, LHDC',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2 Gen 2 (10Gbps), DisplayPort, OTG',
        sensors:
          'Fingerprint (under display), accelerometer, proximity, gyro, compass, barometer, color spectrum',
        location: 'GPS (L1+L5), GLONASS (G1), BDS (B1I+B1c+B2a), GALILEO (E1+E5a), QZSS (L1+L5)',
        nfc: true,
        other: 'Infrared blaster (hồng ngoại điều khiển thiết bị), Two-way satellite communication',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'LTE-A Cat20',
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        data_speed: 'HSPA, LTE, 5G',
        sim_type: 'Dual SIM (Nano-SIM, dual stand-by)',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo chuẩn Hi-Res & Dolby Atmos',
        headphone_jack_35mm: false,
        audio_features: '24-bit/192kHz Hi-Res & Hi-Res Wireless audio, Snapdragon Sound',
      },
      regulatory: {
        fcc_approval: 'FCC ID 2AFZZPN82G',
        sar_head: '0.99 W/kg',
        sar_body: '1.19 W/kg',
        certifications: 'CE, FCC, RoHS, TÜV Rheinland Triple Eye Protection, QCVN',
      },
    },
    key_specs: {
      screen: '6.73" LTPO AMOLED 120Hz (3000 nits)',
      chip: 'Snapdragon 8 Gen 3',
      camera: 'Quad 50MP Leica Summilux (1-inch LYT-900)',
      battery: '5000 mAh (90W Wired / 80W Wireless)',
      storage: '512GB',
      ram: '16GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '26401928374',
        merchant_key: 'shopee_xiaomi_official',
        title: 'Điện thoại Xiaomi 14 Ultra 5G 16GB RAM 512GB Chính Hãng Leica Summilux',
        price_current: 26490000,
        price_original: 29990000,
        historical_sold: 460,
        stock: 28,
        rating_star: 4.94,
        rating_count: 168,
        url: 'https://shopee.vn/product/139249852/26401928374',
        price_history: [
          { daysAgo: 60, price: 29990000, priceOriginal: 29990000 },
          { daysAgo: 45, price: 28990000, priceOriginal: 29990000 },
          { daysAgo: 30, price: 27990000, priceOriginal: 29990000 },
          { daysAgo: 15, price: 27490000, priceOriginal: 29990000 },
          { daysAgo: 0, price: 26490000, priceOriginal: 29990000 },
        ],
        reviews: [
          {
            reviewId: 'mi14u-rv-1',
            author: 'kiet_le_leica',
            ratingStar: 5,
            comment:
              'Màu ảnh Leica Authentic cùng tiêu cự 75mm f/1.8 chụp chân dung và telemacro 10cm thực sự đỉnh cao, không cần hậu kỳ nhiều. Trong hộp tặng sẵn củ sạc nhanh 90W luôn.',
            variation: 'Đen Da Thuần Chay, 16GB/512GB',
            daysAgo: 11,
          },
        ],
      },
      {
        platform: 'cellphones',
        platform_item_id: 'cps-xiaomi-14-ultra-512',
        merchant_key: 'cellphones_official',
        title: 'Xiaomi 14 Ultra 5G 16GB 512GB Chính Hãng',
        price_current: 26990000,
        price_original: 29990000,
        historical_sold: 310,
        stock: 19,
        rating_star: 4.92,
        rating_count: 95,
        url: 'https://cellphones.com.vn/xiaomi-14-ultra.html',
        price_history: [
          { daysAgo: 30, price: 27990000, priceOriginal: 29990000 },
          { daysAgo: 0, price: 26990000, priceOriginal: 29990000 },
        ],
        reviews: [],
      },
    ],
  },

  // 5. OPPO Find X8 5G 16GB/256GB (Hasselblad Triple Periscope Flagship)
  {
    categorySlug: 'smartphones',
    brand: 'OPPO',
    model: 'Find X8',
    variant_name: '256GB',
    model_key: 'oppo:find-x8:256gb',
    name: 'OPPO Find X8 256GB',
    slug: 'oppo-find-x8-256gb',
    description:
      'OPPO Find X8 5G 16GB/256GB trang bị vi xử lý MediaTek Dimensity 9400 (3nm), hệ thống 3 camera 50MP Hasselblad với tiềm vọng W-prism 3x siêu mỏng và viên pin Silicon-Carbon 5630mAh.',
    ram_gb: 16,
    storage_gb: 256,
    screen_size_inch: 6.59,
    battery_mah: 5630,
    has_5g: true,
    colors: ['Xám Tinh Tú', 'Đen Không Gian', 'Hồng Vỏ Sò'],
    images: [
      'https://image.oppo.com/content/dam/oppo/common/mkt/v2-2/find-x8-series/navigation/find-x8-grey-440-440.png',
    ],
    expert_rating: 4.8,
    expert_review_summary:
      'Bước nhảy vọt ấn tượng với thân máy mỏng 7.85mm nhưng chứa viên pin Silicon-Carbon 5630mAh và cụm 3 camera 50MP Hasselblad đồng đều cả 3 tiêu cự.',
    expert_criteria_scores: {
      display: 9.4,
      performance: 9.6,
      camera: 9.5,
      battery: 9.7,
      value: 9.2,
    },
    specifications: {
      availability: {
        announced: 'October 2024',
        status: 'Available',
        prices_msrp: '22.990.000₫ (Chính hãng OPPO VN)',
      },
      design: {
        dimensions: '157.4 x 74.3 x 7.85 mm',
        weight_g: 193,
        materials: 'Corning Gorilla Glass 7i front/back, aerospace aluminum frame',
        build: 'Thiết kế phẳng siêu mỏng 7.85mm, cụm camera Cosmos Ring cân đối',
        resistance: 'IP68 / IP69 dust/water resistant (chịu tia nước áp lực cao 80°C)',
        biometrics: 'Optical under-display fingerprint, Face unlock',
        keys: 'Alert Slider 3 chế độ, Volume rocker, Power key',
        colors: ['Xám Tinh Tú', 'Đen Không Gian', 'Hồng Vỏ Sò'],
      },
      display: {
        size_inch: 6.59,
        type: 'LTPO AMOLED, 1B colors, 120Hz, Dolby Vision, HDR10+, 1600 nits (HBM), 4500 nits (peak)',
        resolution: '1256 x 2760 pixels, 19.8:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Corning Gorilla Glass 7i',
        features: 'Viền đối xứng 1.45mm, 3840Hz PWM dimming bảo vệ mắt',
      },
      hardware: {
        chipset: 'MediaTek Dimensity 9400 (3 nm)',
        cpu: 'Octa-core (1x3.63 GHz Cortex-X925 & 3x3.3 GHz Cortex-X4 & 4x2.4 GHz Cortex-A720)',
        gpu: 'Immortalis-G925 MC12',
        ram_gb: 16,
        storage_gb: 256,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (UFS 4.0)',
        os: 'Android 15, ColorOS 15',
      },
      battery: {
        capacity_mah: 5630,
        type: 'Silicon-Carbon (Si/C) 5630 mAh, non-removable',
        charging: '80W wired SUPERVOOC, 50W wireless AIRVOOC, 10W reverse wireless',
        fast_charging_w: 80,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Triple Camera (Hasselblad Master)',
        main_camera:
          '50 MP, f/1.8, 24mm (wide), 1/1.56" (Sony LYT-700), multi-directional PDAF, OIS',
        second_camera:
          '50 MP, f/2.6, 73mm (periscope telephoto W-prism), 1/1.95" (Sony LYT-600), multi-directional PDAF, OIS, 3x optical zoom',
        third_camera: '50 MP, f/2.0, 15mm, 120˚ (ultrawide), 1/2.75" (Samsung JN5), PDAF',
        front_camera: '32 MP, f/2.4, 21mm (wide), 1/2.74"',
        flash: 'LED flash, Hasselblad Color Calibration, panorama',
        video_recording: '4K@30/60fps (Dolby Vision 10-bit), 1080p@30/60/240fps, gyro-EIS',
      },
      connectivity: {
        bluetooth: '5.4, A2DP, LE, aptX HD, LHDC 5.0',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6/7, tri-band',
        usb: 'USB Type-C 3.0, OTG',
        sensors:
          'Fingerprint (under display), accelerometer, gyro, proximity, compass, color spectrum',
        location: 'Dual-band GPS (L1+L5), BDS, GALILEO, QZSS, GLONASS',
        nfc: true,
        other: 'Infrared port, O+ Connect chia sẻ nhanh với iPhone/Mac',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'LTE-A',
        technology: 'GSM / HSPA / LTE / 5G',
        data_speed: 'HSPA, LTE, 5G',
        sim_type: '2 Nano-SIM + eSIM',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo',
        headphone_jack_35mm: false,
        audio_features: 'Hi-Res Audio, OReality Audio',
      },
      regulatory: {
        fcc_approval: 'CPH2651',
        sar_head: '0.98 W/kg',
        sar_body: '1.12 W/kg',
        certifications: 'CE, RoHS, TÜV Rheinland Eye Comfort 4.0, IP69, QCVN',
      },
    },
    key_specs: {
      screen: '6.59" LTPO AMOLED 120Hz (4500 nits)',
      chip: 'MediaTek Dimensity 9400 (3 nm)',
      camera: 'Triple 50MP Hasselblad (3x W-Prism)',
      battery: '5630 mAh Si/C (80W SUPERVOOC)',
      storage: '256GB',
      ram: '16GB',
    },
    listings: [
      {
        platform: 'lazada',
        platform_item_id: 'laz-oppo-find-x8-256',
        merchant_key: 'lazada_oppo_flagship',
        title: 'Điện thoại OPPO Find X8 5G 16GB/256GB Camera Hasselblad Chính Hãng',
        price_current: 20990000,
        price_original: 22990000,
        historical_sold: 520,
        stock: 40,
        rating_star: 4.95,
        rating_count: 195,
        url: 'https://www.lazada.vn/products/oppo-find-x8-5g-i284910293.html',
        price_history: [
          { daysAgo: 45, price: 22990000, priceOriginal: 22990000 },
          { daysAgo: 30, price: 21990000, priceOriginal: 22990000 },
          { daysAgo: 14, price: 21490000, priceOriginal: 22990000 },
          { daysAgo: 0, price: 20990000, priceOriginal: 22990000 },
        ],
        reviews: [
          {
            reviewId: 'fx8-rv-1',
            author: 'hai_dang_sg',
            ratingStar: 5,
            comment:
              'Máy cầm cực gọn nhẹ mà pin 5630mAh dùng mãi không hết. ColorOS 15 vuốt chạm mượt ngang iOS, chụp chân dung Hasselblad lên màu da rất đẹp.',
            variation: 'Xám Tinh Tú, 256GB',
            daysAgo: 5,
          },
        ],
      },
      {
        platform: 'tgdd',
        platform_item_id: 'tgdd-oppo-find-x8-256',
        merchant_key: 'tgdd_official',
        title: 'Điện thoại OPPO Find X8 5G 16GB/256GB Chính Hãng',
        price_current: 21490000,
        price_original: 22990000,
        historical_sold: 380,
        stock: 55,
        rating_star: 4.91,
        rating_count: 112,
        url: 'https://www.thegioididong.com/dtdd/oppo-find-x8',
        price_history: [
          { daysAgo: 30, price: 22490000, priceOriginal: 22990000 },
          { daysAgo: 0, price: 21490000, priceOriginal: 22990000 },
        ],
        reviews: [],
      },
    ],
  },

  // 6. Apple iPad Pro M4 11 inch Wi-Fi 256GB (Tablets Flagship)
  {
    categorySlug: 'tablets',
    brand: 'Apple',
    model: 'iPad Pro M4 11 inch',
    variant_name: '256GB',
    model_key: 'apple:ipad-pro-m4-11:256gb',
    name: 'Apple iPad Pro M4 11 inch 256GB',
    slug: 'apple-ipad-pro-m4-11-inch-256gb',
    description:
      'Máy tính bảng Apple iPad Pro M4 11 inch Wi-Fi 256GB với màn hình Ultra Retina XDR Tandem OLED 120Hz, thiết kế siêu mỏng 5.3mm và chip Apple M4 mạnh mẽ.',
    ram_gb: 8,
    storage_gb: 256,
    screen_size_inch: 11.0,
    battery_mah: 8160,
    has_5g: false,
    colors: ['Đen Không Gian', 'Bạc'],
    images: [
      'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/ipad-pro-finish-select-202405-11inch-spaceblack-wifi?wid=800&hei=800&fmt=jpeg',
    ],
    expert_rating: 4.9,
    expert_review_summary:
      'Chiếc máy tính bảng tốt nhất thế giới hiện tại với tấm nền OLED 2 lớp (Tandem OLED) tuyệt đẹp, độ mỏng không tưởng 5.3mm và sức mạnh xử lý từ chip M4.',
    expert_criteria_scores: {
      display: 9.9,
      performance: 9.9,
      camera: 8.8,
      battery: 9.1,
      value: 8.7,
    },
    specifications: {
      availability: {
        announced: 'May 2024',
        status: 'Available',
        prices_msrp: '28.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '249.7 x 177.5 x 5.3 mm',
        weight_g: 444,
        materials: 'Scratch-resistant glass front, 100% recycled aluminum unibody',
        build: 'Thân nhôm nguyên khối siêu mỏng 5.3mm, hỗ trợ Apple Pencil Pro & Magic Keyboard',
        resistance: 'Oleophobic anti-fingerprint coating',
        biometrics: '3D Face ID (đặt ở cạnh ngang Landscape)',
        keys: 'Top button, Volume buttons, Smart Connector, Magnetic connector',
        colors: ['Đen Không Gian', 'Bạc'],
      },
      display: {
        size_inch: 11.0,
        type: 'Ultra Retina XDR Tandem OLED, ProMotion 10-120Hz, HDR10, Dolby Vision, 1000 nits (SDR), 1600 nits (HDR)',
        resolution: '1668 x 2420 pixels, 3:2 ratio (~264 ppi)',
        refresh_rate_hz: 120,
        ppi: 264,
        protection: 'Scratch-resistant glass, oleophobic coating',
        features: 'ProMotion 120Hz, Wide color (P3), True Tone, Reference Mode',
      },
      hardware: {
        chipset: 'Apple M4 (3 nm)',
        cpu: '9-core CPU (3 performance cores + 6 efficiency cores)',
        gpu: 'Apple M4 10-core GPU with Hardware Ray Tracing',
        ram_gb: 8,
        storage_gb: 256,
        storage_expansion: 'Không hỗ trợ thẻ nhớ',
        os: 'iPadOS 18',
      },
      battery: {
        capacity_mah: 8160,
        type: 'Li-Po 31.29 Wh (8160 mAh), non-removable',
        charging: '30W wired USB-C PD',
        fast_charging_w: 30,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Single Camera + LiDAR',
        main_camera: '12 MP, f/1.8, (wide), dual pixel PDAF',
        second_camera: 'TOF 3D LiDAR scanner (depth & AR)',
        front_camera: '12 MP, f/2.0, 122˚ (ultrawide Landscape Center Stage) + Face ID',
        flash: 'Adaptive True Tone flash',
        video_recording: '4K@24/25/30/60fps, ProRes 4K@30fps, 1080p@25/30/60/120/240fps, gyro-EIS',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e, dual-band (2.4GHz & 5GHz & 6GHz), MIMO',
        usb: 'Thunderbolt 3 / USB4 (40Gbps), DisplayPort, magnetic Smart Connector',
        sensors:
          'Face ID, LiDAR scanner, accelerometer, 3-axis gyro, barometer, dual ambient light sensors',
        location: 'Digital compass, Wi-Fi, iBeacon microlocation',
        nfc: false,
        other: 'Hỗ trợ Apple Pencil Pro (bóp & xoay thân bút)',
      },
      cellular: {
        has_5g: false,
        technology: 'Wi-Fi Only',
        sim_type: 'No cellular connectivity (Wi-Fi model)',
        volte: false,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Hệ thống 4 loa Four-speaker audio chuẩn phòng thu',
        headphone_jack_35mm: false,
        audio_features: '4 studio-quality microphones, Spatial Audio, Dolby Atmos',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-A2836',
        sar_body: '0.95 W/kg',
        certifications: 'ENERGY STAR, CE, FCC, QCVN',
      },
    },
    key_specs: {
      screen: '11.0" Ultra Retina XDR Tandem OLED 120Hz',
      chip: 'Apple M4 (9-core CPU / 10-core GPU)',
      camera: '12MP Wide + LiDAR + 12MP Center Stage',
      battery: '31.29 Wh / 8160 mAh (10h)',
      storage: '256GB',
      ram: '8GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '28192039481',
        merchant_key: 'shopee_apple_flagship',
        title: 'Máy tính bảng Apple iPad Pro M4 2024 11 inch Wi-Fi 256GB Chính Hãng VN/A',
        price_current: 26290000,
        price_original: 28990000,
        historical_sold: 640,
        stock: 35,
        rating_star: 4.97,
        rating_count: 215,
        url: 'https://shopee.vn/product/88201679/28192039481',
        price_history: [
          { daysAgo: 45, price: 27990000, priceOriginal: 28990000 },
          { daysAgo: 20, price: 26990000, priceOriginal: 28990000 },
          { daysAgo: 0, price: 26290000, priceOriginal: 28990000 },
        ],
        reviews: [
          {
            reviewId: 'ipad-m4-rv-1',
            author: 'designer_minh_anh',
            ratingStar: 5,
            comment:
              'Màn hình Tandem OLED màu đen sâu tuyệt đối, vẽ Procreate kết hợp Apple Pencil Pro cực kỳ nhạy. Máy mỏng nhẹ cầm đọc tài liệu cả buổi không mỏi tay.',
            variation: 'Đen Không Gian, 256GB Wi-Fi',
            daysAgo: 7,
          },
        ],
      },
    ],
  },

  // 7. Apple MacBook Air 13 inch M3 16GB/256GB (Laptops Flagship)
  {
    categorySlug: 'laptops',
    brand: 'Apple',
    model: 'MacBook Air M3 13 inch',
    variant_name: '256GB',
    model_key: 'apple:macbook-air-m3-13:256gb',
    name: 'Apple MacBook Air M3 13 inch 256GB',
    slug: 'apple-macbook-air-m3-13-inch-256gb',
    description:
      'Laptop Apple MacBook Air 13.6 inch chip M3 (8-core CPU, 8-core GPU), phiên bản nâng cấp 16GB Unified Memory chuẩn mới của Apple, 256GB SSD, thời lượng pin 18 giờ.',
    ram_gb: 16,
    storage_gb: 256,
    screen_size_inch: 13.6,
    battery_mah: 5260,
    has_5g: false,
    colors: ['Xanh Đêm Midnight', 'Ánh Sao Starlight', 'Xám Space Gray', 'Bạc Silver'],
    images: [
      'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/mba13-midnight-select-202402?wid=800&hei=800&fmt=jpeg',
    ],
    expert_rating: 4.9,
    expert_review_summary:
      'Chiếc ultrabook chuẩn mực cho công việc và học tập năm 2026 khi Apple đã nâng RAM mặc định lên 16GB, vận hành hoàn toàn yên tĩnh không quạt tản nhiệt và pin thực tế 15-18 giờ.',
    expert_criteria_scores: {
      display: 9.2,
      performance: 9.5,
      camera: 8.6,
      battery: 9.8,
      value: 9.5,
    },
    specifications: {
      availability: {
        announced: 'March 2024 (16GB Standard Update Oct 2024)',
        status: 'Available',
        prices_msrp: '27.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '304.1 x 215.0 x 11.3 mm',
        weight_g: 1240,
        materials: '100% recycled aluminum unibody with anodization seal (giảm bám vân tay)',
        build: 'Vỏ nhôm nguyên khối mỏng 11.3mm, bàn phím Magic Keyboard có đèn nền',
        resistance: 'Anodization seal chống bám dấu vân tay',
        biometrics: 'Touch ID trên nút nguồn',
        keys: '78-key Magic Keyboard + Force Touch trackpad + Touch ID',
        colors: ['Xanh Đêm Midnight', 'Ánh Sao Starlight', 'Xám Space Gray', 'Bạc Silver'],
      },
      display: {
        size_inch: 13.6,
        type: 'Liquid Retina IPS LED-backlit display, 1B colors, 500 nits, Wide color (P3), True Tone',
        resolution: '2560 x 1664 pixels (~224 ppi)',
        refresh_rate_hz: 60,
        ppi: 224,
        protection: 'Hard-coated anti-reflective glass',
        features: 'True Tone, P3 Wide Color, hỗ trợ xuất 2 màn hình rời 6K/5K khi gập máy',
      },
      hardware: {
        chipset: 'Apple M3 (3 nm)',
        cpu: '8-core CPU (4 performance cores + 4 efficiency cores), 16-core Neural Engine',
        gpu: 'Apple M3 8-core GPU (Hardware-accelerated ray tracing & mesh shading)',
        ram_gb: 16,
        storage_gb: 256,
        storage_expansion: 'Không hỗ trợ nâng cấp (Unified Memory & NVMe SSD)',
        os: 'macOS Sequoia',
      },
      battery: {
        capacity_mah: 5260,
        type: 'Li-Po 52.6 Wh, built-in (lên tới 18 giờ xem video)',
        charging: '70W fast charge qua cổng MagSafe 3 hoặc USB-C PD (kèm sạc 30W/35W)',
        fast_charging_w: 70,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'FaceTime HD System',
        main_camera: '1080p FaceTime HD camera với bộ xử lý tín hiệu hình ảnh ISP trên chip M3',
        second_camera: '3-mic array with directional beamforming (Voice Isolation & Wide Spectrum)',
        front_camera: '1080p FaceTime HD (f/2.0)',
        video_recording: '1080p@30fps HD video recording',
      },
      connectivity: {
        bluetooth: '5.3',
        wlan: 'Wi-Fi 6E (802.11ax)',
        usb: '2x Thunderbolt / USB 4 (up to 40Gb/s, DisplayPort, Charging) + MagSafe 3',
        sensors: 'Touch ID sensor, Ambient light sensor, Hall sensor',
        location: 'Wi-Fi positioning',
        nfc: false,
        other: 'Hỗ trợ tai nghe trở kháng cao qua cổng 3.5mm',
      },
      cellular: {
        has_5g: false,
        technology: 'Wi-Fi 6E',
        sim_type: 'No cellular slot',
        volte: false,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Hệ thống 4 loa Four-speaker sound system',
        headphone_jack_35mm: true,
        audio_features:
          'Spatial Audio with Dolby Atmos, 3.5mm headphone jack with high-impedance support',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCGA3113',
        certifications: 'ENERGY STAR, EPEAT Gold, CE, FCC, QCVN',
      },
    },
    key_specs: {
      screen: '13.6" Liquid Retina (2560x1664, 500 nits)',
      chip: 'Apple M3 (8-core CPU / 8-core GPU)',
      camera: '1080p FaceTime HD + 3-Mic Studio Array',
      battery: '52.6 Wh (Lên tới 18 giờ, MagSafe 3)',
      storage: '256GB',
      ram: '16GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '27591029384',
        merchant_key: 'shopee_apple_flagship',
        title: 'Laptop Apple MacBook Air 13 inch M3 16GB RAM 256GB SSD Chính Hãng SA/A',
        price_current: 25490000,
        price_original: 27990000,
        historical_sold: 890,
        stock: 48,
        rating_star: 4.98,
        rating_count: 340,
        url: 'https://shopee.vn/product/88201679/27591029384',
        price_history: [
          { daysAgo: 60, price: 27490000, priceOriginal: 27990000 },
          { daysAgo: 30, price: 26290000, priceOriginal: 27990000 },
          { daysAgo: 0, price: 25490000, priceOriginal: 27990000 },
        ],
        reviews: [
          {
            reviewId: 'mba-m3-rv-1',
            author: 'hoang_dev_vn',
            ratingStar: 5,
            comment:
              'Bản 16GB RAM chính hãng quá hời ở mức 25.4 triệu! Chạy Docker nhẹ, VS Code mở 20 tab Chrome vẫn mát lạnh và pin trụ nguyên ngày làm việc ở quán cafe không cần mang sạc.',
            variation: 'Xanh Đêm Midnight, 16GB/256GB',
            daysAgo: 6,
          },
        ],
      },
    ],
  },

  // 8. Apple iPhone 16 Pro 256GB (Compact Flagship - Triple Camera 5x)
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    variant_name: '256GB',
    model_key: 'apple:iphone-16-pro:256gb',
    name: 'Apple iPhone 16 Pro 256GB',
    slug: 'apple-iphone-16-pro-256gb',
    description:
      'Apple iPhone 16 Pro 256GB VN/A với màn hình 6.3 inch ProMotion 120Hz, khung Titan cấp 5, chip A18 Pro 3nm và ống kính tiềm vọng Tetraprism zoom quang 5x tương đương bản Pro Max.',
    ram_gb: 8,
    storage_gb: 256,
    screen_size_inch: 6.3,
    battery_mah: 3582,
    has_5g: true,
    colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Trắng', 'Titan Đen'],
    images: [
      'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/iphone-16-pro-finish-select-202409-6-3inch-naturaltitanium?wid=800&hei=800&fmt=jpeg',
    ],
    expert_rating: 4.8,
    expert_review_summary:
      'Lần đầu tiên dòng Pro nhỏ gọn 6.3 inch có trọn vẹn cụm camera tiềm vọng 5x và góc siêu rộng 48MP y hệt Pro Max, lý tưởng cho người thích thao tác một tay.',
    expert_criteria_scores: {
      display: 9.6,
      performance: 9.9,
      camera: 9.7,
      battery: 8.9,
      value: 9.1,
    },
    specifications: {
      availability: {
        announced: 'September 2024',
        status: 'Available',
        prices_msrp: '31.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '149.6 x 71.5 x 8.25 mm',
        weight_g: 199,
        materials: 'Ceramic Shield (2024) front, textured matte glass back, Grade 5 Titanium frame',
        build: 'Khung Titan cấp 5 nhỏ gọn vừa tay, tản nhiệt graphite & nhôm tái chế',
        resistance: 'IP68 dust/water resistant (up to 6m for 30 min)',
        biometrics: '3D Face ID (TrueDepth camera)',
        keys: 'Action Button, Camera Control, Volume, Side Power button',
        colors: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Trắng', 'Titan Đen'],
      },
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, ProMotion 120Hz, HDR10, Dolby Vision, 2000 nits (peak)',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield glass (2024 generation)',
        features: 'Always-On display, Dynamic Island, ProMotion 1-120Hz, True Tone',
      },
      hardware: {
        chipset: 'Apple A18 Pro (3 nm N3E)',
        cpu: 'Hexa-core (2x4.05 GHz performance + 4x2.42 GHz efficiency)',
        gpu: 'Apple GPU (6-core graphics with hardware ray tracing)',
        ram_gb: 8,
        storage_gb: 256,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (NVMe)',
        os: 'iOS 18 (hỗ trợ Apple Intelligence)',
      },
      battery: {
        capacity_mah: 3582,
        type: 'Li-Ion 3582 mAh, non-removable',
        charging: '30W wired PD2.0, 25W MagSafe wireless, 15W Qi2 wireless',
        fast_charging_w: 30,
        reverse_charging: true,
      },
      camera: {
        rear_setup: 'Triple Camera',
        main_camera:
          '48 MP, f/1.78, 24mm (wide), 1/1.28", dual pixel PDAF, second-gen sensor-shift OIS',
        second_camera:
          '12 MP, f/2.8, 120mm (periscope telephoto), 3D sensor-shift OIS, 5x optical zoom',
        third_camera: '48 MP, f/2.2, 13mm, 120˚ (ultrawide), PDAF + TOF 3D LiDAR scanner',
        front_camera: '12 MP, f/1.9, 23mm (wide), PDAF, OIS + SL 3D',
        flash: 'Adaptive True Tone LED flash, HDR',
        video_recording:
          '4K@24/25/30/60/100/120fps (Dolby Vision), ProRes, Apple Log, Spatial Video',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band',
        usb: 'USB Type-C 3.2 Gen 2 (10Gbps), DisplayPort',
        sensors: 'Face ID, LiDAR scanner, accelerometer, gyro, proximity, compass, barometer',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS',
        nfc: true,
        other: 'Ultra Wideband (UWB) gen2 chip, Emergency SOS via satellite',
      },
      cellular: {
        has_5g: true,
        bands_5g: 'SA/NSA/Sub6',
        bands_4g: 'Gigabit LTE with 4x4 MIMO',
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        data_speed: 'HSPA, LTE-A, 5G',
        sim_type: '1 Nano-SIM + eSIM',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo + 4 micro chuẩn phòng thu',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio, Audio Mix, Dolby Atmos',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-E8694A',
        sar_head: '1.15 W/kg',
        sar_body: '1.16 W/kg',
        certifications: 'CE, FCC, RoHS, QCVN',
      },
    },
    key_specs: {
      screen: '6.3" LTPO Super Retina XDR 120Hz',
      chip: 'Apple A18 Pro (3 nm)',
      camera: '48MP Fusion + 48MP Ultrawide + 12MP 5x',
      battery: '3582 mAh (30W PD / 25W MagSafe)',
      storage: '256GB',
      ram: '8GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '29104857999',
        merchant_key: 'shopee_apple_flagship',
        title: 'Điện thoại Apple iPhone 16 Pro 256GB Chính Hãng VN/A',
        price_current: 29490000,
        price_original: 31990000,
        historical_sold: 1620,
        stock: 45,
        rating_star: 4.95,
        rating_count: 490,
        url: 'https://shopee.vn/product/88201679/29104857999',
        price_history: [
          { daysAgo: 45, price: 31490000, priceOriginal: 31990000 },
          { daysAgo: 20, price: 30290000, priceOriginal: 31990000 },
          { daysAgo: 0, price: 29490000, priceOriginal: 31990000 },
        ],
        reviews: [
          {
            reviewId: 'ip16p-rv-1',
            author: 'quoc_bao_hn',
            ratingStar: 5,
            comment:
              'Kích thước 6.3 inch vừa vặn túi quần, không quá to như Pro Max nhưng năm nay đã có đủ camera 5x zoom xa rất thích.',
            variation: 'Titan Tự Nhiên, 256GB',
            daysAgo: 4,
          },
        ],
      },
    ],
  },

  // 9. Apple Watch Series 10 42mm GPS Viền Nhôm (Smartwatches Flagship)
  {
    categorySlug: 'smartwatches',
    brand: 'Apple',
    model: 'Watch Series 10 42mm GPS',
    variant_name: '64GB',
    model_key: 'apple:watch-series-10-42mm:64gb',
    name: 'Apple Watch Series 10 42mm GPS 64GB',
    slug: 'apple-watch-series-10-42mm-gps-64gb',
    description:
      'Đồng hồ thông minh Apple Watch Series 10 42mm GPS viền nhôm thiết kế mỏng nhất lịch sử (9.7mm), màn hình OLED góc rộng sáng hơn 40%, chip S10 SiP và sạc nhanh 80% trong 30 phút.',
    ram_gb: 2,
    storage_gb: 64,
    screen_size_inch: 1.77,
    battery_mah: 327,
    has_5g: false,
    colors: ['Đen Bóng Jet Black', 'Vàng Hồng Rose Gold', 'Bạc Silver'],
    images: [
      'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/s10-case-unselect-gallery-1-202409?wid=800&hei=800&fmt=jpeg',
    ],
    expert_rating: 4.8,
    expert_review_summary:
      'Kỷ niệm 10 năm Apple Watch với thân máy mỏng 9.7mm cực kỳ ôm cổ tay, màn hình Wide-angle OLED nhìn nghiêng sáng rõ và tốc độ sạc nhanh nhất từ trước đến nay.',
    expert_criteria_scores: {
      display: 9.7,
      performance: 9.5,
      camera: 8.0,
      battery: 8.4,
      value: 9.1,
    },
    specifications: {
      availability: {
        announced: 'September 2024',
        status: 'Available',
        prices_msrp: '10.990.000₫ (VN/A)',
      },
      design: {
        dimensions: '42.0 x 36.0 x 9.7 mm',
        weight_g: 30,
        materials: 'Ion-X strengthened glass front, aerospace aluminum case, metal back',
        build: 'Vỏ nhôm hoàn thiện bóng Jet Black hoặc nhám, mỏng chỉ 9.7mm',
        resistance: 'WR50 water resistant (50m) + IP6X dust resistant + Depth gauge (6m)',
        biometrics: 'Wrist Detection & Passcode, Optical Heart Sensor Gen 3',
        keys: 'Digital Crown with haptic feedback, Side button',
        colors: ['Đen Bóng Jet Black', 'Vàng Hồng Rose Gold', 'Bạc Silver'],
      },
      display: {
        size_inch: 1.77,
        type: 'Wide-angle LTPO3 OLED Always-On Retina display, 1-60Hz, 2000 nits (peak)',
        resolution: '374 x 446 pixels (~326 ppi)',
        refresh_rate_hz: 60,
        ppi: 326,
        protection: 'Ion-X front crystal glass',
        features: 'Always-On display (cập nhật kim giây mỗi 1Hz), sáng hơn 40% khi nhìn nghiêng',
      },
      hardware: {
        chipset: 'Apple S10 SiP (64-bit dual-core processor)',
        cpu: 'Dual-core S10 with 4-core Neural Engine',
        gpu: 'Apple Watch integrated GPU',
        ram_gb: 2,
        storage_gb: 64,
        storage_expansion: 'Không hỗ trợ thẻ nhớ (64GB onboard)',
        os: 'watchOS 11',
      },
      battery: {
        capacity_mah: 327,
        type: 'Li-Ion 327 mAh, non-removable (18h normal / 36h Low Power Mode)',
        charging: 'Fast wireless magnetic charging (0-80% in 30 min)',
        fast_charging_w: 15,
        reverse_charging: false,
      },
      camera: {
        rear_setup: 'Remote Camera Viewfinder & Optical Health Array',
        main_camera:
          'Camera Remote kính ngắm từ xa cho iPhone + Cảm biến nhịp tim quang học thế hệ 3',
        second_camera: 'Cảm biến điện tâm đồ (ECG) + Cảm biến nhiệt độ nước & độ sâu',
        front_camera: 'Ambient light & Double Tap gesture sensor',
        video_recording: 'Điều khiển quay video và chụp hẹn giờ trực tiếp trên iPhone',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 802.11 b/g/n (2.4GHz & 5GHz)',
        usb: 'Magnetic Fast Charger to USB-C Cable',
        sensors:
          'Electrical heart sensor (ECG), Optical heart sensor Gen 3, Temperature sensor, Depth gauge, Water temperature sensor, Compass, Altimeter',
        location: 'L1 GPS, GLONASS, GALILEO, QZSS, BeiDou',
        nfc: true,
        other: 'Second-generation Ultra Wideband (UWB) Precision Finding, Double Tap gesture',
      },
      cellular: {
        has_5g: false,
        technology: 'GPS + Wi-Fi + Bluetooth',
        sim_type: 'GPS Model (paired via iPhone)',
        volte: false,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa tích hợp phát nhạc trực tiếp (Media playback speaker)',
        headphone_jack_35mm: false,
        audio_features: 'Voice Isolation microphone, phát nhạc/podcast trực tiếp qua loa đồng hồ',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-A2997',
        sar_head: '0.28 W/kg',
        sar_body: '0.35 W/kg',
        certifications: 'CE, FCC, RoHS, WR50, IP6X, QCVN',
      },
    },
    key_specs: {
      screen: '1.77" Wide-Angle LTPO3 OLED (2000 nits)',
      chip: 'Apple S10 SiP (4-core Neural Engine)',
      camera: 'Optical Heart Gen 3 + ECG + Depth Sensor',
      battery: '327 mAh (Sạc 80% trong 30 phút)',
      storage: '64GB',
      ram: '2GB',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '29581726354',
        merchant_key: 'shopee_apple_flagship',
        title: 'Đồng hồ thông minh Apple Watch Series 10 42mm GPS Viền Nhôm Chính Hãng VN/A',
        price_current: 9990000,
        price_original: 10990000,
        historical_sold: 780,
        stock: 65,
        rating_star: 4.96,
        rating_count: 245,
        url: 'https://shopee.vn/product/88201679/29581726354',
        price_history: [
          { daysAgo: 30, price: 10690000, priceOriginal: 10990000 },
          { daysAgo: 14, price: 10290000, priceOriginal: 10990000 },
          { daysAgo: 0, price: 9990000, priceOriginal: 10990000 },
        ],
        reviews: [
          {
            reviewId: 'aws10-rv-1',
            author: 'thao_vy_runner',
            ratingStar: 5,
            comment:
              'Màu Đen Bóng Jet Black đẹp xuất sắc, đeo đi chạy bộ nhẹ tênh và sạc lúc tắm 25 phút là đầy pin để đeo đi ngủ theo dõi giấc ngủ luôn.',
            variation: 'Đen Bóng Jet Black, 42mm GPS',
            daysAgo: 5,
          },
        ],
      },
    ],
  },

  // 10. Apple AirPods Pro 2 USB-C MagSafe (Earbuds Flagship)
  {
    categorySlug: 'earbuds',
    brand: 'Apple',
    model: 'AirPods Pro 2 USB-C',
    variant_name: 'Tiêu chuẩn',
    model_key: 'apple:airpods-pro-2-usbc:64gb',
    name: 'Apple AirPods Pro 2 USB-C',
    slug: 'apple-airpods-pro-2-usb-c',
    description:
      'Tai nghe chống ồn chủ động Apple AirPods Pro 2 cổng sạc MagSafe USB-C trang bị chip H2, khử tiếng ồn ANC gấp 2 lần, Adaptive Audio, chuẩn kháng bụi nước IP54 và hỗ trợ Lossless với Vision Pro.',
    ram_gb: 1,
    storage_gb: 64,
    screen_size_inch: 1.0,
    battery_mah: 523,
    has_5g: false,
    colors: ['Trắng'],
    images: [
      'https://store.storeimages.cdn-apple.com/8756/as-images.apple.com/is/MTJV3?wid=800&hei=800&fmt=jpeg',
    ],
    expert_rating: 4.9,
    expert_review_summary:
      'Chiếc tai nghe True Wireless toàn diện nhất cho hệ sinh thái Apple với khả năng chống ồn ANC và xuyên âm tự nhiên hàng đầu phân khúc cùng hộp sạc USB-C tích hợp loa tìm kiếm UWB.',
    expert_criteria_scores: {
      display: 9.0,
      performance: 9.8,
      camera: 9.0,
      battery: 9.3,
      value: 9.4,
    },
    specifications: {
      availability: {
        announced: 'September 2023',
        status: 'Available',
        prices_msrp: '6.190.000₫ (VN/A)',
      },
      design: {
        dimensions: '45.2 x 60.6 x 21.7 mm (Charging Case)',
        weight_g: 50.8,
        materials: 'Polycarbonate acoustic housing, silicone ear tips (XS, S, M, L)',
        build:
          'Tai nghe In-ear có đuôi cảm ứng vuốt chỉnh âm lượng, hộp sạc tích hợp móc dây đeo & loa',
        resistance: 'IP54 dust, sweat, and water resistant (cả tai nghe và hộp sạc)',
        biometrics: 'Skin-detect sensor (cảm biến nhận diện da tai tự động phát/dừng)',
        keys: 'Touch Control stem (nhấn & vuốt tăng giảm âm lượng)',
        colors: ['Trắng'],
      },
      display: {
        size_inch: 1.0,
        type: 'LED Status Indicator + iOS Dynamic Island Battery HUD',
        resolution: 'Acoustic Custom High-Excursion Driver (11mm)',
        refresh_rate_hz: 60,
        ppi: 300,
        protection: 'IP54 Dust & Water Ingress Protection',
        features: 'Hiển thị phần trăm pin trực tiếp trên iPhone/Mac kể cả khi đóng nắp hộp',
      },
      hardware: {
        chipset: 'Apple H2 headphone chip + Apple U1 chip (trong hộp sạc MagSafe)',
        cpu: 'Apple H2 custom DSP (48,000 lần khử ồn mỗi giây)',
        gpu: 'Personalized Spatial Audio Engine',
        ram_gb: 1,
        storage_gb: 64,
        storage_expansion: 'Firmware tự động cập nhật qua iCloud',
        os: 'iOS 18 Hearing Health & Adaptive Audio firmware',
      },
      battery: {
        capacity_mah: 523,
        type: 'Li-Ion 523 mAh (Case) + 2x 49.7 mAh (Buds) - 6h nghe liên tục / 30h kèm hộp sạc',
        charging: 'USB-C, MagSafe, Apple Watch charger, hoặc chuẩn Qi (5 phút sạc nghe được 1 giờ)',
        fast_charging_w: 5,
        reverse_charging: false,
      },
      camera: {
        rear_setup: 'Dual Beamforming & Inward-Facing Acoustic Array',
        main_camera: 'Dual beamforming microphones (thu giọng nói định hướng khử gió)',
        second_camera: 'Inward-facing microphone (tối ưu EQ & khử ồn trong ống tai)',
        front_camera: 'Optical Skin-detect & Motion-detecting / Speech-detecting accelerometer',
        video_recording:
          'Hỗ trợ thu âm giọng nói chuẩn Studio Voice Isolation khi quay video trên iPhone',
      },
      connectivity: {
        bluetooth: '5.3, AAC, Ultra-low latency 20-bit/48kHz Lossless Audio Protocol',
        wlan: 'Apple Ecosystem Instant iCloud Handoff',
        usb: 'USB Type-C charging port',
        sensors:
          'Skin-detect sensor, motion-detecting accelerometer, speech-detecting accelerometer, touch control',
        location: 'Find My with Precision Finding (Apple U1 Ultra Wideband)',
        nfc: false,
        other:
          'Conversation Awareness (tự giảm nhạc khi người dùng bắt đầu nói chuyện), Hearing Aid & Hearing Test',
      },
      cellular: {
        has_5g: false,
        technology: 'Bluetooth 5.3 + Ultra Wideband (U1)',
        sim_type: 'Wireless Audio Accessory',
        volte: false,
        vowifi: false,
      },
      multimedia: {
        loudspeaker: 'Custom high-excursion Apple driver + Custom high dynamic range amplifier',
        headphone_jack_35mm: false,
        audio_features:
          'Active Noise Cancellation (2x), Adaptive Transparency, Personalized Spatial Audio with dynamic head tracking',
      },
      regulatory: {
        fcc_approval: 'FCC ID BCG-A3047 / A3048',
        sar_head: '0.09 W/kg',
        certifications: 'CE, FCC, RoHS, IP54, QCVN',
      },
    },
    key_specs: {
      screen: 'Hộp sạc MagSafe USB-C (IP54 + Loa Find My)',
      chip: 'Apple H2 + Apple U1 Ultra Wideband',
      camera: 'ANC Khử ồn gấp 2 lần + Adaptive Audio',
      battery: '6h tai nghe / 30h hộp sạc (523 mAh)',
      storage: 'USB-C / MagSafe',
      ram: 'Bluetooth 5.3',
    },
    listings: [
      {
        platform: 'shopee',
        platform_item_id: '23819203847',
        merchant_key: 'shopee_apple_flagship',
        title: 'Tai nghe Bluetooth Apple AirPods Pro 2 cổng USB-C MagSafe Chính Hãng VN/A',
        price_current: 5490000,
        price_original: 6190000,
        historical_sold: 5640,
        stock: 120,
        rating_star: 4.97,
        rating_count: 2150,
        url: 'https://shopee.vn/product/88201679/23819203847',
        price_history: [
          { daysAgo: 60, price: 5890000, priceOriginal: 6190000 },
          { daysAgo: 30, price: 5690000, priceOriginal: 6190000 },
          { daysAgo: 0, price: 5490000, priceOriginal: 6190000 },
        ],
        reviews: [
          {
            reviewId: 'app2-rv-1',
            author: 'tuan_kiet_music',
            ratingStar: 5,
            comment:
              'Chống ồn trên máy bay và quán cafe cực kỳ đỉnh, bật chế độ Adaptive tự chuyển sang xuyên âm khi có người hỏi chuyện rất thông minh.',
            variation: 'Bản USB-C VN/A',
            daysAgo: 3,
          },
        ],
      },
    ],
  },
];
