import type { FlagshipDeviceSeed } from './flagship-seed-data.js';

/**
 * Catalog expansion, groups A1-A3 (Docs/Proposals/2026-10-30-catalog-expansion.html): the
 * iPhone 17 family, iPhone 18 Pro and Pro Max, and the Galaxy S26 family, in every storage
 * sold in Vietnam. Spec-only, like every seed: no listing, price, merchant or review. Every
 * spec value is cited in `sources` (field path or group -> URL); the launch price is the
 * Vietnamese list price at launch, for reference only. Generated from sourced research
 * notes on 2026-10-30; nothing here is applied to any database until JOY approves the
 * backfill (D1-D3).
 */
export const CATALOG_EXPANSION_2026_SEEDS: FlagshipDeviceSeed[] = [
  // Group A1
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17',
    variant_name: '256GB',
    model_key: 'apple:iphone-17:256gb',
    name: 'Apple iPhone 17 256GB',
    slug: 'apple-iphone-17-256gb',
    description:
      'Apple iPhone 17 256GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A19 (3 nm), 6-core CPU, 5-core GPU, RAM 8GB, bộ nhớ 256GB, pin 3692 mAh.',
    ram_gb: 8,
    storage_gb: 256,
    screen_size_inch: 6.3,
    battery_mah: 3692,
    has_5g: true,
    colors: ['Đen', 'Trắng', 'Xanh Lam Khói', 'Xanh Lá Xô Thơm', 'Tím Oải Hương'],
    images: [],
    key_specs: {
      screen: '6.3" LTPO Super Retina XDR OLED 120Hz ProMotion (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 (3 nm), 6-core CPU, 5-core GPU',
      ram: '8GB',
      storage: '256GB',
      camera: '48MP Fusion Main f/1.6 + 48MP Ultra Wide f/2.2; front 18MP Center Stage',
      battery: '3692 mAh, 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak)',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2',
        features: 'Anti-reflective coating',
      },
      hardware: {
        chipset: 'Apple A19 (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (5-core graphics)',
        ram_gb: 8,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Dual camera (48MP Fusion Main + 48MP Ultra Wide)',
        main_camera:
          '48 MP, f/1.6, 26mm (wide), 1/1.56", 1.0µm, dual pixel PDAF, sensor-shift OIS; 12MP 2x optical-quality crop (52mm)',
        second_camera: '48 MP, f/2.2, 13mm, 120˚ (ultrawide), 1/2.55", 0.7µm, PDAF',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K@24/25/30/60fps, 1080p@25/30/60/120/240fps, HDR, Dolby Vision HDR (up to 60fps), stereo sound rec.',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), PDAF, SL 3D depth/biometrics sensor; 4K@24/25/30/60fps, 1080p@25/30/60/120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 3692,
        type: 'Li-Ion 3692 mAh, non-removable',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min (30W+ adapter); 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '149.6 x 71.5 x 7.95 mm',
        weight_g: 177,
        materials: 'Aluminum frame, Ceramic Shield 2 front, colour-infused glass back',
        build: 'Glass front (Ceramic Shield 2), aluminum frame, glass back',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Đen', 'Trắng', 'Xanh Lam Khói', 'Xanh Lá Xô Thơm', 'Tím Oải Hương'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3520)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3520)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
        volte: true,
        vowifi: true,
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE (Apple N1 chip)',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6/7), tri-band, 2x2 MIMO, hotspot (Apple N1 chip)',
        usb: 'USB Type-C, USB 2 (up to 480Mb/s), DisplayPort',
        sensors:
          'Face ID, accelerometer (high-g), gyro, proximity, compass, barometer, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Available. Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025)',
        prices_msrp: '24.999.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      storages: 'https://support.apple.com/en-in/125089',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17',
      colors_apple_vn: 'https://www.apple.com/vn/shop/buy-iphone/iphone-17',
      'vn_launch_prices.256':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'vn_launch_prices.512': 'https://applepricehunt.com/vn/stock/iphone-17-512gb',
      display: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      hardware: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      camera: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'camera.main_camera (2x crop)': 'https://www.apple.com/iphone-17/specs/',
      battery: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125089',
      design: 'https://support.apple.com/en-in/125089',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17',
      cellular: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125089',
      'cellular.volte': 'https://support.apple.com/en-in/125089',
      'cellular.vowifi': 'https://support.apple.com/en-in/125089',
      connectivity: 'https://support.apple.com/en-in/125089',
      'connectivity.location': 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'availability.status': 'https://dtinews.dantri.com.vn/print/20250910094650571.htm',
      'availability.prices_msrp':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp (current Apple VN)':
        'https://www.apple.com/vn/shop/buy-iphone/iphone-17',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
    },
    aliases: ['Apple iPhone 17 256GB Chính hãng VN/A', 'Điện thoại iPhone 17 256GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17',
    variant_name: '512GB',
    model_key: 'apple:iphone-17:512gb',
    name: 'Apple iPhone 17 512GB',
    slug: 'apple-iphone-17-512gb',
    description:
      'Apple iPhone 17 512GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A19 (3 nm), 6-core CPU, 5-core GPU, RAM 8GB, bộ nhớ 512GB, pin 3692 mAh.',
    ram_gb: 8,
    storage_gb: 512,
    screen_size_inch: 6.3,
    battery_mah: 3692,
    has_5g: true,
    colors: ['Đen', 'Trắng', 'Xanh Lam Khói', 'Xanh Lá Xô Thơm', 'Tím Oải Hương'],
    images: [],
    key_specs: {
      screen: '6.3" LTPO Super Retina XDR OLED 120Hz ProMotion (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 (3 nm), 6-core CPU, 5-core GPU',
      ram: '8GB',
      storage: '512GB',
      camera: '48MP Fusion Main f/1.6 + 48MP Ultra Wide f/2.2; front 18MP Center Stage',
      battery: '3692 mAh, 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak)',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2',
        features: 'Anti-reflective coating',
      },
      hardware: {
        chipset: 'Apple A19 (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (5-core graphics)',
        ram_gb: 8,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Dual camera (48MP Fusion Main + 48MP Ultra Wide)',
        main_camera:
          '48 MP, f/1.6, 26mm (wide), 1/1.56", 1.0µm, dual pixel PDAF, sensor-shift OIS; 12MP 2x optical-quality crop (52mm)',
        second_camera: '48 MP, f/2.2, 13mm, 120˚ (ultrawide), 1/2.55", 0.7µm, PDAF',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K@24/25/30/60fps, 1080p@25/30/60/120/240fps, HDR, Dolby Vision HDR (up to 60fps), stereo sound rec.',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), PDAF, SL 3D depth/biometrics sensor; 4K@24/25/30/60fps, 1080p@25/30/60/120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 3692,
        type: 'Li-Ion 3692 mAh, non-removable',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min (30W+ adapter); 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '149.6 x 71.5 x 7.95 mm',
        weight_g: 177,
        materials: 'Aluminum frame, Ceramic Shield 2 front, colour-infused glass back',
        build: 'Glass front (Ceramic Shield 2), aluminum frame, glass back',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Đen', 'Trắng', 'Xanh Lam Khói', 'Xanh Lá Xô Thơm', 'Tím Oải Hương'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3520)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3520)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
        volte: true,
        vowifi: true,
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE (Apple N1 chip)',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6/7), tri-band, 2x2 MIMO, hotspot (Apple N1 chip)',
        usb: 'USB Type-C, USB 2 (up to 480Mb/s), DisplayPort',
        sensors:
          'Face ID, accelerometer (high-g), gyro, proximity, compass, barometer, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Available. Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025)',
        prices_msrp: '31.499.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      storages: 'https://support.apple.com/en-in/125089',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17',
      colors_apple_vn: 'https://www.apple.com/vn/shop/buy-iphone/iphone-17',
      'vn_launch_prices.256':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'vn_launch_prices.512': 'https://applepricehunt.com/vn/stock/iphone-17-512gb',
      display: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      hardware: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      camera: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'camera.main_camera (2x crop)': 'https://www.apple.com/iphone-17/specs/',
      battery: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125089',
      design: 'https://support.apple.com/en-in/125089',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17',
      cellular: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125089',
      'cellular.volte': 'https://support.apple.com/en-in/125089',
      'cellular.vowifi': 'https://support.apple.com/en-in/125089',
      connectivity: 'https://support.apple.com/en-in/125089',
      'connectivity.location': 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17-14050.php',
      'availability.status': 'https://dtinews.dantri.com.vn/print/20250910094650571.htm',
      'availability.prices_msrp':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp (current Apple VN)':
        'https://www.apple.com/vn/shop/buy-iphone/iphone-17',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17-14050.php',
    },
    aliases: ['Apple iPhone 17 512GB Chính hãng VN/A', 'Điện thoại iPhone 17 512GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17 Pro',
    variant_name: '256GB',
    model_key: 'apple:iphone-17-pro:256gb',
    name: 'Apple iPhone 17 Pro 256GB',
    slug: 'apple-iphone-17-pro-256gb',
    description:
      'Apple iPhone 17 Pro 256GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU, RAM 12GB, bộ nhớ 256GB, pin 3998 mAh.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.3,
    battery_mah: 3998,
    has_5g: true,
    colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    images: [],
    key_specs: {
      screen:
        '6.3" LTPO Super Retina XDR OLED 120Hz ProMotion, Always-On (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU',
      ram: '12GB',
      storage: '256GB',
      camera:
        '3x 48MP Fusion (Main f/1.78 + Ultra Wide + 4x Telephoto 100mm) + LiDAR; front 18MP Center Stage',
      battery: '3998 mAh (nano-SIM model), 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak)',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features: 'Always-On display',
      },
      hardware: {
        chipset: 'Apple A19 Pro (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (6-core graphics)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Triple 48MP Fusion camera (Main + Ultra Wide + 4x Telephoto) + LiDAR',
        main_camera:
          '48 MP Fusion Main, f/1.78, 24mm (wide), 1/1.28", dual pixel PDAF, sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120˚ (ultrawide)',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (tetraprism), 1/2.55", 4x optical zoom, 3D sensor-shift OIS; 8x optical-quality 12MP crop, up to 40x digital',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K Dolby Vision up to 120fps, 1080p slo-mo up to 240fps, 10-bit HDR, ProRes, ProRes RAW, Apple Log 2, Cinematic 4K@30fps, spatial video/audio',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), PDAF, SL 3D depth/biometrics sensor; 4K@60fps, 1080p@120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 3998,
        type: 'Li-Ion 3998 mAh (Nano-SIM model); 4252 mAh (eSIM-only model)',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min; 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '150 x 71.9 x 8.75 mm',
        weight_g: 204,
        materials: 'Aluminium unibody, Ceramic Shield 2 front, Ceramic Shield back',
        build:
          'Glass front (Ceramic Shield 2), aluminum frame, aluminum back / glass back (Ceramic Shield)',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3523)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3523)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6e/7), tri-band, 2x2 MIMO, hotspot',
        usb: 'USB Type-C, USB 3 (up to 10Gb/s), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, barometer, gyro, high-g accelerometer, proximity, compass, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025). No longer sold by Apple VN since iPhone 18 Pro launch (09/2026); still sold by VN retailers',
        prices_msrp: '34.999.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      storages: 'https://support.apple.com/en-in/125090',
      storages_vn: 'https://fptshop.com.vn/dien-thoai/iphone-17-pro-1tb',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17-pro',
      vn_launch_prices:
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      display: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'display.features': 'https://support.apple.com/en-in/125090',
      hardware: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      camera: 'https://support.apple.com/en-in/125090',
      'camera (sensor sizes, PDAF, video fps)':
        'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      battery: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125090',
      design: 'https://support.apple.com/en-in/125090',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17-pro',
      cellular: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125090',
      connectivity: 'https://support.apple.com/en-in/125090',
      'connectivity.wlan': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'availability.status':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp':
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
    },
    aliases: ['Apple iPhone 17 Pro 256GB Chính hãng VN/A', 'Điện thoại iPhone 17 Pro 256GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17 Pro',
    variant_name: '512GB',
    model_key: 'apple:iphone-17-pro:512gb',
    name: 'Apple iPhone 17 Pro 512GB',
    slug: 'apple-iphone-17-pro-512gb',
    description:
      'Apple iPhone 17 Pro 512GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU, RAM 12GB, bộ nhớ 512GB, pin 3998 mAh.',
    ram_gb: 12,
    storage_gb: 512,
    screen_size_inch: 6.3,
    battery_mah: 3998,
    has_5g: true,
    colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    images: [],
    key_specs: {
      screen:
        '6.3" LTPO Super Retina XDR OLED 120Hz ProMotion, Always-On (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU',
      ram: '12GB',
      storage: '512GB',
      camera:
        '3x 48MP Fusion (Main f/1.78 + Ultra Wide + 4x Telephoto 100mm) + LiDAR; front 18MP Center Stage',
      battery: '3998 mAh (nano-SIM model), 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak)',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features: 'Always-On display',
      },
      hardware: {
        chipset: 'Apple A19 Pro (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (6-core graphics)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Triple 48MP Fusion camera (Main + Ultra Wide + 4x Telephoto) + LiDAR',
        main_camera:
          '48 MP Fusion Main, f/1.78, 24mm (wide), 1/1.28", dual pixel PDAF, sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120˚ (ultrawide)',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (tetraprism), 1/2.55", 4x optical zoom, 3D sensor-shift OIS; 8x optical-quality 12MP crop, up to 40x digital',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K Dolby Vision up to 120fps, 1080p slo-mo up to 240fps, 10-bit HDR, ProRes, ProRes RAW, Apple Log 2, Cinematic 4K@30fps, spatial video/audio',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), PDAF, SL 3D depth/biometrics sensor; 4K@60fps, 1080p@120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 3998,
        type: 'Li-Ion 3998 mAh (Nano-SIM model); 4252 mAh (eSIM-only model)',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min; 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '150 x 71.9 x 8.75 mm',
        weight_g: 204,
        materials: 'Aluminium unibody, Ceramic Shield 2 front, Ceramic Shield back',
        build:
          'Glass front (Ceramic Shield 2), aluminum frame, aluminum back / glass back (Ceramic Shield)',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3523)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3523)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6e/7), tri-band, 2x2 MIMO, hotspot',
        usb: 'USB Type-C, USB 3 (up to 10Gb/s), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, barometer, gyro, high-g accelerometer, proximity, compass, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025). No longer sold by Apple VN since iPhone 18 Pro launch (09/2026); still sold by VN retailers',
        prices_msrp: '41.499.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      storages: 'https://support.apple.com/en-in/125090',
      storages_vn: 'https://fptshop.com.vn/dien-thoai/iphone-17-pro-1tb',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17-pro',
      vn_launch_prices:
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      display: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'display.features': 'https://support.apple.com/en-in/125090',
      hardware: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      camera: 'https://support.apple.com/en-in/125090',
      'camera (sensor sizes, PDAF, video fps)':
        'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      battery: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125090',
      design: 'https://support.apple.com/en-in/125090',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17-pro',
      cellular: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125090',
      connectivity: 'https://support.apple.com/en-in/125090',
      'connectivity.wlan': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'availability.status':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp':
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
    },
    aliases: ['Apple iPhone 17 Pro 512GB Chính hãng VN/A', 'Điện thoại iPhone 17 Pro 512GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17 Pro',
    variant_name: '1TB',
    model_key: 'apple:iphone-17-pro:1024gb',
    name: 'Apple iPhone 17 Pro 1TB',
    slug: 'apple-iphone-17-pro-1tb',
    description:
      'Apple iPhone 17 Pro 1TB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU, RAM 12GB, bộ nhớ 1TB, pin 3998 mAh.',
    ram_gb: 12,
    storage_gb: 1024,
    screen_size_inch: 6.3,
    battery_mah: 3998,
    has_5g: true,
    colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    images: [],
    key_specs: {
      screen:
        '6.3" LTPO Super Retina XDR OLED 120Hz ProMotion, Always-On (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU',
      ram: '12GB',
      storage: '1TB',
      camera:
        '3x 48MP Fusion (Main f/1.78 + Ultra Wide + 4x Telephoto 100mm) + LiDAR; front 18MP Center Stage',
      battery: '3998 mAh (nano-SIM model), 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak)',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features: 'Always-On display',
      },
      hardware: {
        chipset: 'Apple A19 Pro (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (6-core graphics)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 1024,
      },
      camera: {
        rear_setup: 'Triple 48MP Fusion camera (Main + Ultra Wide + 4x Telephoto) + LiDAR',
        main_camera:
          '48 MP Fusion Main, f/1.78, 24mm (wide), 1/1.28", dual pixel PDAF, sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120˚ (ultrawide)',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (tetraprism), 1/2.55", 4x optical zoom, 3D sensor-shift OIS; 8x optical-quality 12MP crop, up to 40x digital',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Dual-LED dual-tone flash, HDR (photo/panorama)',
        video_recording:
          '4K Dolby Vision up to 120fps, 1080p slo-mo up to 240fps, 10-bit HDR, ProRes, ProRes RAW, Apple Log 2, Cinematic 4K@30fps, spatial video/audio',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), PDAF, SL 3D depth/biometrics sensor; 4K@60fps, 1080p@120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 3998,
        type: 'Li-Ion 3998 mAh (Nano-SIM model); 4252 mAh (eSIM-only model)',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min; 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '150 x 71.9 x 8.75 mm',
        weight_g: 204,
        materials: 'Aluminium unibody, Ceramic Shield 2 front, Ceramic Shield back',
        build:
          'Glass front (Ceramic Shield 2), aluminum frame, aluminum back / glass back (Ceramic Shield)',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3523)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3523)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6e/7), tri-band, 2x2 MIMO, hotspot',
        usb: 'USB Type-C, USB 3 (up to 10Gb/s), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, barometer, gyro, high-g accelerometer, proximity, compass, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025). No longer sold by Apple VN since iPhone 18 Pro launch (09/2026); still sold by VN retailers',
        prices_msrp: '47.999.000 ₫ (1TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      storages: 'https://support.apple.com/en-in/125090',
      storages_vn: 'https://fptshop.com.vn/dien-thoai/iphone-17-pro-1tb',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17-pro',
      vn_launch_prices:
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      display: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'display.features': 'https://support.apple.com/en-in/125090',
      hardware: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      camera: 'https://support.apple.com/en-in/125090',
      'camera (sensor sizes, PDAF, video fps)':
        'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      battery: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125090',
      design: 'https://support.apple.com/en-in/125090',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17-pro',
      cellular: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125090',
      connectivity: 'https://support.apple.com/en-in/125090',
      'connectivity.wlan': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
      'availability.status':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp':
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17_pro-14049.php',
    },
    aliases: ['Apple iPhone 17 Pro 1TB Chính hãng VN/A', 'Điện thoại iPhone 17 Pro 1TB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17 Pro Max',
    variant_name: '256GB',
    model_key: 'apple:iphone-17-pro-max:256gb',
    name: 'Apple iPhone 17 Pro Max 256GB',
    slug: 'apple-iphone-17-pro-max-256gb',
    description:
      'Apple iPhone 17 Pro Max 256GB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU, RAM 12GB, bộ nhớ 256GB, pin 4823 mAh.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.9,
    battery_mah: 4823,
    has_5g: true,
    colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    images: [],
    key_specs: {
      screen: '6.9" LTPO Super Retina XDR OLED 120Hz ProMotion (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU',
      ram: '12GB',
      storage: '256GB',
      camera:
        '3x 48MP Fusion (Main f/1.78 + Ultra Wide + 4x Telephoto 100mm) + LiDAR; front 18MP Center Stage',
      battery: '4823 mAh (nano-SIM model), 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HBM), 3000 nits (peak)',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
      },
      hardware: {
        chipset: 'Apple A19 Pro (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (6-core graphics)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Triple 48MP Fusion camera (Main + Ultra Wide + 4x Telephoto) + LiDAR',
        main_camera: '48 MP Fusion Main, f/1.78, 24mm (wide), 1/1.28", sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120˚ (ultrawide)',
        third_camera:
          '48 MP Telephoto, f/2.8, 100mm (periscope), 4x optical zoom, 3D sensor-shift OIS; 8x (200mm) optical-quality 12MP crop, up to 40x digital',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Dual-LED dual-tone flash, HDR',
        video_recording:
          '4K Dolby Vision up to 120fps, 1080p slo-mo up to 240fps, 10-bit HDR, ProRes, ProRes RAW, Apple Log 2, Cinematic 4K@30fps, Action mode 2.8K@60fps, spatial video/audio',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), depth/biometrics sensor; 4K@60fps, 1080p@120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 4823,
        type: 'Li-Ion 4823 mAh (Nano-SIM model); 5088 mAh (eSIM-only model)',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min (30W+ adapter); 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78 x 8.75 mm',
        weight_g: 231,
        materials: 'Aluminium unibody, Ceramic Shield 2 front, Ceramic Shield back',
        build:
          'Glass front (Ceramic Shield 2), aluminum frame, aluminum back / glass back (Ceramic Shield)',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3526)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3526)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps; 5G sub-6GHz 4x4 MIMO, Gigabit LTE',
        sim_type: 'Nano-SIM + eSIM',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6e/7), tri-band, 2x2 MIMO, hotspot',
        usb: 'USB Type-C, USB 3 (up to 10Gb/s), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, barometer, gyro, high-g accelerometer, proximity, compass, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025). No longer sold by Apple VN since iPhone 18 Pro Max launch (09/2026); still sold by VN retailers',
        prices_msrp: '37.999.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      storages: 'https://support.apple.com/en-in/125091',
      storages_vn: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors_cellphones: 'https://cellphones.com.vn/iphone-17-pro-max.html',
      vn_launch_prices:
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      display: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      hardware: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      camera: 'https://support.apple.com/en-in/125091',
      'camera (sensor size, video fps)':
        'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125091',
      design: 'https://support.apple.com/en-in/125091',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      cellular: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125091',
      connectivity: 'https://support.apple.com/en-in/125091',
      'connectivity.wlan': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'connectivity.location': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.status':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp':
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
    },
    aliases: [
      'Apple iPhone 17 Pro Max 256GB Chính hãng VN/A',
      'Điện thoại iPhone 17 Pro Max 256GB',
    ],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17 Pro Max',
    variant_name: '512GB',
    model_key: 'apple:iphone-17-pro-max:512gb',
    name: 'Apple iPhone 17 Pro Max 512GB',
    slug: 'apple-iphone-17-pro-max-512gb',
    description:
      'Apple iPhone 17 Pro Max 512GB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU, RAM 12GB, bộ nhớ 512GB, pin 4823 mAh.',
    ram_gb: 12,
    storage_gb: 512,
    screen_size_inch: 6.9,
    battery_mah: 4823,
    has_5g: true,
    colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    images: [],
    key_specs: {
      screen: '6.9" LTPO Super Retina XDR OLED 120Hz ProMotion (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU',
      ram: '12GB',
      storage: '512GB',
      camera:
        '3x 48MP Fusion (Main f/1.78 + Ultra Wide + 4x Telephoto 100mm) + LiDAR; front 18MP Center Stage',
      battery: '4823 mAh (nano-SIM model), 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HBM), 3000 nits (peak)',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
      },
      hardware: {
        chipset: 'Apple A19 Pro (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (6-core graphics)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Triple 48MP Fusion camera (Main + Ultra Wide + 4x Telephoto) + LiDAR',
        main_camera: '48 MP Fusion Main, f/1.78, 24mm (wide), 1/1.28", sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120˚ (ultrawide)',
        third_camera:
          '48 MP Telephoto, f/2.8, 100mm (periscope), 4x optical zoom, 3D sensor-shift OIS; 8x (200mm) optical-quality 12MP crop, up to 40x digital',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Dual-LED dual-tone flash, HDR',
        video_recording:
          '4K Dolby Vision up to 120fps, 1080p slo-mo up to 240fps, 10-bit HDR, ProRes, ProRes RAW, Apple Log 2, Cinematic 4K@30fps, Action mode 2.8K@60fps, spatial video/audio',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), depth/biometrics sensor; 4K@60fps, 1080p@120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 4823,
        type: 'Li-Ion 4823 mAh (Nano-SIM model); 5088 mAh (eSIM-only model)',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min (30W+ adapter); 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78 x 8.75 mm',
        weight_g: 231,
        materials: 'Aluminium unibody, Ceramic Shield 2 front, Ceramic Shield back',
        build:
          'Glass front (Ceramic Shield 2), aluminum frame, aluminum back / glass back (Ceramic Shield)',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3526)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3526)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps; 5G sub-6GHz 4x4 MIMO, Gigabit LTE',
        sim_type: 'Nano-SIM + eSIM',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6e/7), tri-band, 2x2 MIMO, hotspot',
        usb: 'USB Type-C, USB 3 (up to 10Gb/s), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, barometer, gyro, high-g accelerometer, proximity, compass, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025). No longer sold by Apple VN since iPhone 18 Pro Max launch (09/2026); still sold by VN retailers',
        prices_msrp: '44.499.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      storages: 'https://support.apple.com/en-in/125091',
      storages_vn: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors_cellphones: 'https://cellphones.com.vn/iphone-17-pro-max.html',
      vn_launch_prices:
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      display: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      hardware: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      camera: 'https://support.apple.com/en-in/125091',
      'camera (sensor size, video fps)':
        'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125091',
      design: 'https://support.apple.com/en-in/125091',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      cellular: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125091',
      connectivity: 'https://support.apple.com/en-in/125091',
      'connectivity.wlan': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'connectivity.location': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.status':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp':
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
    },
    aliases: [
      'Apple iPhone 17 Pro Max 512GB Chính hãng VN/A',
      'Điện thoại iPhone 17 Pro Max 512GB',
    ],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17 Pro Max',
    variant_name: '1TB',
    model_key: 'apple:iphone-17-pro-max:1024gb',
    name: 'Apple iPhone 17 Pro Max 1TB',
    slug: 'apple-iphone-17-pro-max-1tb',
    description:
      'Apple iPhone 17 Pro Max 1TB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU, RAM 12GB, bộ nhớ 1TB, pin 4823 mAh.',
    ram_gb: 12,
    storage_gb: 1024,
    screen_size_inch: 6.9,
    battery_mah: 4823,
    has_5g: true,
    colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    images: [],
    key_specs: {
      screen: '6.9" LTPO Super Retina XDR OLED 120Hz ProMotion (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU',
      ram: '12GB',
      storage: '1TB',
      camera:
        '3x 48MP Fusion (Main f/1.78 + Ultra Wide + 4x Telephoto 100mm) + LiDAR; front 18MP Center Stage',
      battery: '4823 mAh (nano-SIM model), 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HBM), 3000 nits (peak)',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
      },
      hardware: {
        chipset: 'Apple A19 Pro (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (6-core graphics)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 1024,
      },
      camera: {
        rear_setup: 'Triple 48MP Fusion camera (Main + Ultra Wide + 4x Telephoto) + LiDAR',
        main_camera: '48 MP Fusion Main, f/1.78, 24mm (wide), 1/1.28", sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120˚ (ultrawide)',
        third_camera:
          '48 MP Telephoto, f/2.8, 100mm (periscope), 4x optical zoom, 3D sensor-shift OIS; 8x (200mm) optical-quality 12MP crop, up to 40x digital',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Dual-LED dual-tone flash, HDR',
        video_recording:
          '4K Dolby Vision up to 120fps, 1080p slo-mo up to 240fps, 10-bit HDR, ProRes, ProRes RAW, Apple Log 2, Cinematic 4K@30fps, Action mode 2.8K@60fps, spatial video/audio',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), depth/biometrics sensor; 4K@60fps, 1080p@120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 4823,
        type: 'Li-Ion 4823 mAh (Nano-SIM model); 5088 mAh (eSIM-only model)',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min (30W+ adapter); 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78 x 8.75 mm',
        weight_g: 231,
        materials: 'Aluminium unibody, Ceramic Shield 2 front, Ceramic Shield back',
        build:
          'Glass front (Ceramic Shield 2), aluminum frame, aluminum back / glass back (Ceramic Shield)',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3526)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3526)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps; 5G sub-6GHz 4x4 MIMO, Gigabit LTE',
        sim_type: 'Nano-SIM + eSIM',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6e/7), tri-band, 2x2 MIMO, hotspot',
        usb: 'USB Type-C, USB 3 (up to 10Gb/s), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, barometer, gyro, high-g accelerometer, proximity, compass, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025). No longer sold by Apple VN since iPhone 18 Pro Max launch (09/2026); still sold by VN retailers',
        prices_msrp: '50.999.000 ₫ (1TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      storages: 'https://support.apple.com/en-in/125091',
      storages_vn: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors_cellphones: 'https://cellphones.com.vn/iphone-17-pro-max.html',
      vn_launch_prices:
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      display: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      hardware: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      camera: 'https://support.apple.com/en-in/125091',
      'camera (sensor size, video fps)':
        'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125091',
      design: 'https://support.apple.com/en-in/125091',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      cellular: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125091',
      connectivity: 'https://support.apple.com/en-in/125091',
      'connectivity.wlan': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'connectivity.location': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.status':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp':
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
    },
    aliases: ['Apple iPhone 17 Pro Max 1TB Chính hãng VN/A', 'Điện thoại iPhone 17 Pro Max 1TB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17 Pro Max',
    variant_name: '2TB',
    model_key: 'apple:iphone-17-pro-max:2048gb',
    name: 'Apple iPhone 17 Pro Max 2TB',
    slug: 'apple-iphone-17-pro-max-2tb',
    description:
      'Apple iPhone 17 Pro Max 2TB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU, RAM 12GB, bộ nhớ 2TB, pin 4823 mAh.',
    ram_gb: 12,
    storage_gb: 2048,
    screen_size_inch: 6.9,
    battery_mah: 4823,
    has_5g: true,
    colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
    images: [],
    key_specs: {
      screen: '6.9" LTPO Super Retina XDR OLED 120Hz ProMotion (3000 nits peak, Ceramic Shield 2)',
      chip: 'Apple A19 Pro (3 nm), 6-core CPU, 6-core GPU',
      ram: '12GB',
      storage: '2TB',
      camera:
        '3x 48MP Fusion (Main f/1.78 + Ultra Wide + 4x Telephoto 100mm) + LiDAR; front 18MP Center Stage',
      battery: '4823 mAh (nano-SIM model), 50% in 20 min (40W+ adapter), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, 120Hz ProMotion, HDR10, Dolby Vision, 1000 nits (typ), 1600 nits (HBM), 3000 nits (peak)',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
      },
      hardware: {
        chipset: 'Apple A19 Pro (3 nm)',
        cpu: 'Hexa-core (2x4.26 GHz + 4x2.60 GHz), 2 performance + 4 efficiency cores',
        gpu: 'Apple GPU (6-core graphics)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 26, upgradable to iOS 27.2',
        storage_gb: 2048,
      },
      camera: {
        rear_setup: 'Triple 48MP Fusion camera (Main + Ultra Wide + 4x Telephoto) + LiDAR',
        main_camera: '48 MP Fusion Main, f/1.78, 24mm (wide), 1/1.28", sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120˚ (ultrawide)',
        third_camera:
          '48 MP Telephoto, f/2.8, 100mm (periscope), 4x optical zoom, 3D sensor-shift OIS; 8x (200mm) optical-quality 12MP crop, up to 40x digital',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Dual-LED dual-tone flash, HDR',
        video_recording:
          '4K Dolby Vision up to 120fps, 1080p slo-mo up to 240fps, 10-bit HDR, ProRes, ProRes RAW, Apple Log 2, Cinematic 4K@30fps, Action mode 2.8K@60fps, spatial video/audio',
        front_camera:
          '18 MP Center Stage multi-aspect, f/1.9, 20mm (ultrawide), depth/biometrics sensor; 4K@60fps, 1080p@120fps, gyro-EIS',
      },
      battery: {
        capacity_mah: 4823,
        type: 'Li-Ion 4823 mAh (Nano-SIM model); 5088 mAh (eSIM-only model)',
        charging:
          'Wired PD3.2/AVS, 50% in 20 min with 40W+ adapter; 25W wireless MagSafe/Qi2, 50% in 30 min (30W+ adapter); 4.5W reverse wired',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78 x 8.75 mm',
        weight_g: 231,
        materials: 'Aluminium unibody, Ceramic Shield 2 front, Ceramic Shield back',
        build:
          'Glass front (Ceramic Shield 2), aluminum frame, aluminum back / glass back (Ceramic Shield)',
        resistance: 'IP68 dust tight and water resistant (immersible up to 6m for 30 min)',
        biometrics: 'Face ID',
        colors: ['Bạc', 'Cam Vũ Trụ', 'Xanh Đậm'],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 (A3526)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66 (A3526)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE, 5G, EV-DO Rev.A 3.1 Mbps; 5G sub-6GHz 4x4 MIMO, Gigabit LTE',
        sim_type: 'Nano-SIM + eSIM',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11 a/b/g/n/ac/6e/7), tri-band, 2x2 MIMO, hotspot',
        usb: 'USB Type-C, USB 3 (up to 10Gb/s), DisplayPort',
        sensors:
          'Face ID, LiDAR scanner, barometer, gyro, high-g accelerometer, proximity, compass, dual ambient light sensors',
        location: 'Dual-frequency GPS (L1+L5), GLONASS, GALILEO, BDS, QZSS, NavIC',
        nfc: true,
        other:
          'Ultra Wideband gen 2, Thread; Emergency SOS, Roadside Assistance, Messages and Find My via satellite',
      },
      multimedia: { loudspeaker: 'Yes, with stereo speakers', headphone_jack_35mm: false },
      availability: {
        announced: '2025, September 09',
        status:
          'Released 2025, September 19 (Vietnam: pre-order 12/9/2025, on sale 19/9/2025). No longer sold by Apple VN since iPhone 18 Pro Max launch (09/2026); still sold by VN retailers',
        prices_msrp: '63.999.000 ₫ (2TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg (EU: 1.49 W/kg)', sar_body: '1.19 W/kg (EU: 1.49 W/kg)' },
    },
    sources: {
      ram_gb: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery_mah: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      storages: 'https://support.apple.com/en-in/125091',
      storages_vn: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors: 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      colors_cellphones: 'https://cellphones.com.vn/iphone-17-pro-max.html',
      vn_launch_prices:
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      display: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      hardware: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      camera: 'https://support.apple.com/en-in/125091',
      'camera (sensor size, video fps)':
        'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      battery: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'battery.charging (adapter W)': 'https://support.apple.com/en-in/125091',
      design: 'https://support.apple.com/en-in/125091',
      'design.build': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'design.colors': 'https://www.thegioididong.com/dtdd/iphone-17-pro-max',
      cellular: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'cellular.sim_type': 'https://support.apple.com/en-in/125091',
      connectivity: 'https://support.apple.com/en-in/125091',
      'connectivity.wlan': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'connectivity.location': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      multimedia: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
      'availability.status':
        'https://vietnamfinance.vn/iphone-17-bat-ngo-tang-gia-soc-tai-viet-nam-khi-iphone-18-pro-ra-mat-d150380.html',
      'availability.prices_msrp':
        'https://vnreview.vn/threads/gia-ban-iphone-17-pro-va-gia-ban-iphone-17-pro-max-tai-viet-nam-chinh-thuc-tu-apple-cao-nhat-gan-64-trieu-dong.68900/latest',
      regulatory: 'https://www.gsmarena.com/apple_iphone_17_pro_max-13964.php',
    },
    aliases: ['Apple iPhone 17 Pro Max 2TB Chính hãng VN/A', 'Điện thoại iPhone 17 Pro Max 2TB'],
  },
  // Group A2
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro Max',
    variant_name: '256GB',
    model_key: 'apple:iphone-18-pro-max:256gb',
    name: 'Apple iPhone 18 Pro Max 256GB',
    slug: 'apple-iphone-18-pro-max-256gb',
    description:
      'Apple iPhone 18 Pro Max 256GB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 256GB, pin 5391 mAh.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.9,
    battery_mah: 5391,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-max-256gb.jpg'],
    key_specs: {
      screen: '6.9" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '256GB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '5391 mAh (bản nano SIM), xem video đến 43 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", 1.22µm, dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, 1/2.55", 0.7µm, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 1/2.55", 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 5391,
        type: 'Li-Ion 5391 mAh (Nano-SIM model; 5567 mAh is the eSIM-only US model), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 43 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78.0 x 8.75 mm',
        weight_g: 249,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3717',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3717',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '41.999.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3717 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'camera.sensor_sizes': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'vn_retail_prices.fptshop':
        'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: [
      'Apple iPhone 18 Pro Max 256GB Chính hãng VN/A',
      'Điện thoại iPhone 18 Pro Max 256GB',
    ],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro Max',
    variant_name: '512GB',
    model_key: 'apple:iphone-18-pro-max:512gb',
    name: 'Apple iPhone 18 Pro Max 512GB',
    slug: 'apple-iphone-18-pro-max-512gb',
    description:
      'Apple iPhone 18 Pro Max 512GB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 512GB, pin 5391 mAh.',
    ram_gb: 12,
    storage_gb: 512,
    screen_size_inch: 6.9,
    battery_mah: 5391,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-max-256gb.jpg'],
    key_specs: {
      screen: '6.9" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '512GB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '5391 mAh (bản nano SIM), xem video đến 43 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", 1.22µm, dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, 1/2.55", 0.7µm, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 1/2.55", 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 5391,
        type: 'Li-Ion 5391 mAh (Nano-SIM model; 5567 mAh is the eSIM-only US model), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 43 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78.0 x 8.75 mm',
        weight_g: 249,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3717',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3717',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '48.499.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3717 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'camera.sensor_sizes': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'vn_retail_prices.fptshop':
        'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: [
      'Apple iPhone 18 Pro Max 512GB Chính hãng VN/A',
      'Điện thoại iPhone 18 Pro Max 512GB',
    ],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro Max',
    variant_name: '1TB',
    model_key: 'apple:iphone-18-pro-max:1024gb',
    name: 'Apple iPhone 18 Pro Max 1TB',
    slug: 'apple-iphone-18-pro-max-1tb',
    description:
      'Apple iPhone 18 Pro Max 1TB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 1TB, pin 5391 mAh.',
    ram_gb: 12,
    storage_gb: 1024,
    screen_size_inch: 6.9,
    battery_mah: 5391,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-max-256gb.jpg'],
    key_specs: {
      screen: '6.9" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '1TB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '5391 mAh (bản nano SIM), xem video đến 43 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 1024,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", 1.22µm, dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, 1/2.55", 0.7µm, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 1/2.55", 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 5391,
        type: 'Li-Ion 5391 mAh (Nano-SIM model; 5567 mAh is the eSIM-only US model), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 43 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78.0 x 8.75 mm',
        weight_g: 249,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3717',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3717',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '61.499.000 ₫ (1TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3717 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'camera.sensor_sizes': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'vn_retail_prices.fptshop':
        'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: ['Apple iPhone 18 Pro Max 1TB Chính hãng VN/A', 'Điện thoại iPhone 18 Pro Max 1TB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro Max',
    variant_name: '2TB',
    model_key: 'apple:iphone-18-pro-max:2048gb',
    name: 'Apple iPhone 18 Pro Max 2TB',
    slug: 'apple-iphone-18-pro-max-2tb',
    description:
      'Apple iPhone 18 Pro Max 2TB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 2TB, pin 5391 mAh.',
    ram_gb: 12,
    storage_gb: 2048,
    screen_size_inch: 6.9,
    battery_mah: 5391,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-max-256gb.jpg'],
    key_specs: {
      screen: '6.9" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '2TB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '5391 mAh (bản nano SIM), xem video đến 43 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1320 x 2868 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 2048,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", 1.22µm, dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, 1/2.55", 0.7µm, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 1/2.55", 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 5391,
        type: 'Li-Ion 5391 mAh (Nano-SIM model; 5567 mAh is the eSIM-only US model), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 43 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '163.4 x 78.0 x 8.75 mm',
        weight_g: 249,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3717',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3717',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '80.999.000 ₫ (2TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3717 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'camera.sensor_sizes': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_max-14716.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro-max-512gb.html',
      'vn_retail_prices.fptshop':
        'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://fptshop.com.vn/dien-thoai/iphone-18-pro-max?sku=00930829',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: ['Apple iPhone 18 Pro Max 2TB Chính hãng VN/A', 'Điện thoại iPhone 18 Pro Max 2TB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro',
    variant_name: '256GB',
    model_key: 'apple:iphone-18-pro:256gb',
    name: 'Apple iPhone 18 Pro 256GB',
    slug: 'apple-iphone-18-pro-256gb',
    description:
      'Apple iPhone 18 Pro 256GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 256GB, pin 4056 mAh.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.3,
    battery_mah: 4056,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-256gb.jpg'],
    key_specs: {
      screen: '6.3" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '256GB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '4056 mAh (bản nano SIM), xem video đến 34 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 4056,
        type: 'Li-Ion 4056 mAh (Nano-SIM model; 4288 mAh is the eSIM-only model, unconfirmed), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 34 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '150.0 x 71.9 x 8.75 mm',
        weight_g: 211,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3714',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3714',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '38.999.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3714 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro.html',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://cellphones.com.vn/iphone-18-pro.html',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: ['Apple iPhone 18 Pro 256GB Chính hãng VN/A', 'Điện thoại iPhone 18 Pro 256GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro',
    variant_name: '512GB',
    model_key: 'apple:iphone-18-pro:512gb',
    name: 'Apple iPhone 18 Pro 512GB',
    slug: 'apple-iphone-18-pro-512gb',
    description:
      'Apple iPhone 18 Pro 512GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 512GB, pin 4056 mAh.',
    ram_gb: 12,
    storage_gb: 512,
    screen_size_inch: 6.3,
    battery_mah: 4056,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-256gb.jpg'],
    key_specs: {
      screen: '6.3" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '512GB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '4056 mAh (bản nano SIM), xem video đến 34 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 4056,
        type: 'Li-Ion 4056 mAh (Nano-SIM model; 4288 mAh is the eSIM-only model, unconfirmed), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 34 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '150.0 x 71.9 x 8.75 mm',
        weight_g: 211,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3714',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3714',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '45.499.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3714 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro.html',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://cellphones.com.vn/iphone-18-pro.html',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: ['Apple iPhone 18 Pro 512GB Chính hãng VN/A', 'Điện thoại iPhone 18 Pro 512GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro',
    variant_name: '1TB',
    model_key: 'apple:iphone-18-pro:1024gb',
    name: 'Apple iPhone 18 Pro 1TB',
    slug: 'apple-iphone-18-pro-1tb',
    description:
      'Apple iPhone 18 Pro 1TB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 1TB, pin 4056 mAh.',
    ram_gb: 12,
    storage_gb: 1024,
    screen_size_inch: 6.3,
    battery_mah: 4056,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-256gb.jpg'],
    key_specs: {
      screen: '6.3" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '1TB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '4056 mAh (bản nano SIM), xem video đến 34 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 1024,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 4056,
        type: 'Li-Ion 4056 mAh (Nano-SIM model; 4288 mAh is the eSIM-only model, unconfirmed), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 34 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '150.0 x 71.9 x 8.75 mm',
        weight_g: 211,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3714',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3714',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '58.499.000 ₫ (1TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3714 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro.html',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://cellphones.com.vn/iphone-18-pro.html',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: ['Apple iPhone 18 Pro 1TB Chính hãng VN/A', 'Điện thoại iPhone 18 Pro 1TB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 18 Pro',
    variant_name: '2TB',
    model_key: 'apple:iphone-18-pro:2048gb',
    name: 'Apple iPhone 18 Pro 2TB',
    slug: 'apple-iphone-18-pro-2tb',
    description:
      'Apple iPhone 18 Pro 2TB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, RAM 12GB, bộ nhớ 2TB, pin 4056 mAh.',
    ram_gb: 12,
    storage_gb: 2048,
    screen_size_inch: 6.3,
    battery_mah: 4056,
    has_5g: true,
    colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
    images: ['/img/devices/apple-iphone-18-pro-256gb.jpg'],
    key_specs: {
      screen: '6.3" OLED Super Retina XDR, ProMotion 120Hz, 3000 nit (ngoài trời)',
      chip: 'Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân',
      ram: '12GB',
      storage: '2TB',
      camera:
        '3 camera 48MP (Chính f/1.48-f/4.0 + Tele 4x 100mm + Góc siêu rộng) + LiDAR; trước 18MP Center Stage',
      battery:
        '4056 mAh (bản nano SIM), xem video đến 34 giờ, 50% trong 15 phút (bộ sạc 60W AVS), MagSafe/Qi2 25W',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'LTPO Super Retina XDR OLED, ProMotion up to 120Hz, HDR, Dolby Vision, 1000 nits (typ), 1600 nits (HDR peak), 3000 nits (outdoor peak), 1 nit min',
        resolution: '1206 x 2622 pixels, 19.5:9 ratio (~460 ppi)',
        refresh_rate_hz: 120,
        ppi: 460,
        protection: 'Ceramic Shield 2, anti-reflective coating',
        features:
          'Always-On display, Dynamic Island, True Tone, P3 wide colour, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A20 Pro (2 nm)',
        cpu: 'Hexa-core (2x4.93 GHz + 4x2.64 GHz); 2 super cores + 4 efficiency cores',
        gpu: 'Apple 7-core GPU with Neural Accelerators, hardware-accelerated ray tracing',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'iOS 27',
        storage_gb: 2048,
      },
      camera: {
        rear_setup: 'Triple 48MP Pro Fusion camera system + LiDAR Scanner',
        main_camera:
          '48 MP Fusion Main, variable aperture f/1.48, f/1.8, f/2.8, f/4.0, 24mm, 1/1.28", dual pixel PDAF, 2nd-gen sensor-shift OIS',
        second_camera: '48 MP Fusion Ultra Wide, f/2.2, 13mm, 120°, PDAF',
        third_camera:
          '48 MP Fusion Telephoto, f/2.8, 100mm (4x), tetraprism periscope, 3D sensor-shift OIS',
        fourth_camera: 'TOF 3D LiDAR scanner (depth)',
        flash: 'Adaptive True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60/100/120fps, 1080p 25/30/60/120/240fps, ProRes and ProRes RAW up to 4K120 (external recording), Apple Log 2, ACES, Genlock, spatial video, 4 studio-quality mics',
        front_camera: '18 MP Center Stage, f/1.9, 20mm, PDAF; 4K Dolby Vision up to 60fps',
      },
      battery: {
        capacity_mah: 4056,
        type: 'Li-Ion 4056 mAh (Nano-SIM model; 4288 mAh is the eSIM-only model, unconfirmed), non-removable',
        charging:
          'Wired USB-C PD3.2 with AVS: 50% in ~15 min with a 60W+ adapter; MagSafe and Qi2 wireless up to 25W (50% in 30 min with 35W+ adapter); 4.5W reverse wired. Video playback up to 34 h (VN)',
        reverse_charging: '4.5W reverse wired',
      },
      design: {
        dimensions: '150.0 x 71.9 x 8.75 mm',
        weight_g: 211,
        materials:
          'Aluminium unibody (85% recycled aluminium enclosure), Ceramic Shield 2 front, Ceramic Shield back',
        build: 'Aluminium unibody',
        resistance: 'IP68 (up to 6 m for 30 min)',
        biometrics: 'Face ID (TrueDepth in the Center Stage front camera)',
        keys: 'Action button, Camera Control, side button, volume up/down',
        colors: ['Đen', 'Bạc', 'Băng Thanh', 'Đỏ Burgundy'],
      },
      cellular: {
        has_5g: true,
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 30, 38, 40, 41, 48, 53, 66, 70, 75, 77, 78, 79 SA/NSA/Sub6 - A3714',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 34, 38, 39, 40, 41, 42, 48, 53, 66, 106 - A3714',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        technology: 'GSM / HSPA / LTE / 5G (Apple C2 modem)',
        data_speed: 'HSPA, Gigabit LTE 4x4 MIMO, 5G 4x4 MIMO',
        sim_type: 'Nano-SIM + eSIM (dual eSIM supported)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be) 2x2 MIMO, tri-band, hotspot (Apple N1 wireless chip)',
        usb: 'USB-C, USB 3 (up to 10Gb/s), DisplayPort',
        nfc: true,
        location: 'Dual-frequency GPS (L1+L5), GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, LiDAR Scanner, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'Thread, 2nd-gen Ultra Wideband chip, Emergency SOS / Messages / Find My via satellite (availability varies by region), Crash Detection',
      },
      multimedia: {
        loudspeaker: 'Yes, stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio recording, Audio Mix, wind noise reduction',
      },
      availability: {
        announced: '2026, September 09',
        status:
          'Available. Released 2026, September 18 (Vietnam: pre-order 2026-09-12, on sale 2026-09-18)',
        prices_msrp: '77.999.000 ₫ (2TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: {
        certifications: 'Vietnam model A3714 (apple.com/vn lists model versions A3714 and A3717)',
      },
    },
    sources: {
      display: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'hardware.chipset': 'https://www.apple.com/iphone-18-pro/specs/',
      'hardware.cpu': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.ram_gb': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'hardware.os': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      camera: 'https://www.apple.com/iphone-18-pro/specs/',
      'battery.capacity_mah': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'battery.charging': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'battery.reverse_charging': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      design: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'design.colors': 'https://cellphones.com.vn/iphone-18-pro.html',
      'cellular.bands': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'cellular.sim_type': 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'cellular.technology': 'https://www.apple.com/iphone-18-pro/specs/',
      connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
      multimedia: 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.announced': 'https://www.gsmarena.com/apple_iphone_18_pro_5g-14934.php',
      'availability.vn_sale_date': 'https://cellphones.com.vn/iphone-18-pro.html',
      vn_launch_prices:
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
      'vn_launch_prices.crosscheck': 'https://cellphones.com.vn/iphone-18-pro.html',
      storages: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      colors: 'https://cellphones.com.vn/iphone-18-pro.html',
      regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
      'availability.prices_msrp':
        'https://www.thegioididong.com/tin-tuc/bang-gia-iphone-18-pro-iphone-18-pro-max-1598480',
    },
    aliases: ['Apple iPhone 18 Pro 2TB Chính hãng VN/A', 'Điện thoại iPhone 18 Pro 2TB'],
  },
  // Group A3
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S26 Ultra',
    variant_name: '12GB/256GB',
    model_key: 'samsung:galaxy-s26-ultra:256gb',
    name: 'Samsung Galaxy S26 Ultra 256GB',
    slug: 'samsung-galaxy-s26-ultra-256gb',
    description:
      'Samsung Galaxy S26 Ultra 256GB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Snapdragon 8 Elite Gen 5 for Galaxy (3 nm), RAM 12GB, bộ nhớ 256GB, pin 5000 mAh.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.9,
    battery_mah: 5000,
    has_5g: true,
    colors: [
      'Tím Cobalt',
      'Xanh Sky Blue',
      'Đen Classic',
      'Trắng Classic',
      'Vàng Hồng',
      'Bạc Shadow',
    ],
    images: ['/img/devices/samsung-galaxy-s26-ultra-256gb.jpg'],
    key_specs: {
      screen:
        '6.9" Dynamic LTPO AMOLED 2X, QHD+ 1440 x 3120, 120Hz, 2600 nits (peak), Gorilla Armor 2',
      chip: 'Snapdragon 8 Elite Gen 5 for Galaxy (3 nm)',
      ram: '12GB',
      storage: '256GB',
      camera: '200MP main + 50MP periscope 5x + 10MP tele 3x + 50MP ultrawide; 12MP front',
      battery: '5000 mAh, 60W wired, 25W wireless (Qi2.2)',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
        resolution: '1440 x 3120 pixels, 19.5:9 ratio (~500 ppi)',
        refresh_rate_hz: 120,
        ppi: 500,
        protection: 'Corning Gorilla Armor 2, DX anti-reflective coating',
        features: 'Privacy display',
      },
      hardware: {
        chipset: 'Qualcomm Snapdragon 8 Elite Gen 5 for Galaxy (SM8850-1-AD, 3 nm)',
        cpu: 'Octa-core (2x4.74 GHz Oryon V3 Phoenix L + 6x3.62 GHz Oryon V3 Phoenix M)',
        gpu: 'Adreno 840 (1.3 GHz)',
        storage_expansion: 'No',
        os: 'Android 16, upgradable to Android 17, One UI 9, up to 7 major Android upgrades',
        ram_gb: 12,
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Quad camera',
        main_camera: '200 MP, f/1.4, 23mm (wide), 1/1.3", 0.6µm, multi-directional PDAF, OIS',
        second_camera:
          '50 MP, f/1.9, 120˚ (ultrawide), 1/2.5", 0.7µm, dual pixel PDAF, Super Steady video',
        third_camera:
          '50 MP, f/2.9, 111mm (periscope telephoto), 1/2.52", 0.7µm, PDAF, OIS, 5x optical zoom',
        fourth_camera: '10 MP, f/2.4, 67mm (telephoto), 1/3.94", 1.0µm, PDAF, OIS, 3x optical zoom',
        flash: 'LED flash, laser AF, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60/120fps, 1080p@30/60/120/240fps, 10-bit HDR, HDR10+, stereo sound rec., gyro-EIS',
        front_camera: '12 MP, f/2.2, 23mm (wide), 1/3.2", 1.12µm, dual pixel PDAF; 4K@30/60fps',
      },
      battery: {
        capacity_mah: 5000,
        type: 'Li-Ion 5000 mAh',
        charging: '60W wired, PD3.0, 75% in 30 min; 25W wireless (Qi2.2); 4.5W reverse wireless',
        fast_charging_w: 60,
        reverse_charging: '4.5W reverse wireless',
      },
      design: {
        dimensions: '163.6 x 78.1 x 7.9 mm',
        weight_g: 214,
        materials:
          'Glass front (Gorilla Armor 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        build: 'Glass front (Gorilla Armor 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min); stylus (S Pen) support',
        biometrics: 'Fingerprint (under display, ultrasonic)',
        colors: [
          'Tím Cobalt',
          'Xanh Sky Blue',
          'Đen Classic',
          'Trắng Classic',
          'Vàng Hồng',
          'Bạc Shadow',
        ],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 38, 40, 41, 66, 75, 77, 78 SA/NSA/Sub6 (International)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 32, 38, 39, 40, 41, 66 (International)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE (CA), 5G',
        sim_type: 'Nano-SIM + Nano-SIM + eSIM (max 2 at a time) (International)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX, Ultra Wideband (UWB)',
      },
      multimedia: {
        loudspeaker: 'Yes, with stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'High-bitrate audio',
      },
      availability: {
        announced: '2026, February 25',
        status: 'Available. Released 2026, March 06',
        prices_msrp: '36.990.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.09 W/kg', sar_body: '1.19 W/kg' },
    },
    sources: {
      storages: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      ram_by_storage: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/buy/',
      colors: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/buy/',
      vn_launch_prices:
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      vn_launch_prices_crosscheck: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      'hardware.chipset_vn': 'https://fptshop.com.vn/dien-thoai/samsung-galaxy-s26-ultra',
      display: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      hardware: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      camera: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      battery: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      design: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'design.dimensions_weight_crosscheck':
        'https://fptshop.com.vn/dien-thoai/samsung-galaxy-s26-ultra',
      cellular: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      connectivity: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      multimedia: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'availability.announced_status':
        'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'availability.prices_msrp':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      regulatory: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
    },
    aliases: [
      'Điện thoại Samsung Galaxy S26 Ultra 5G 12GB/256GB',
      'Samsung Galaxy S26 Ultra 256GB',
    ],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S26 Ultra',
    variant_name: '12GB/512GB',
    model_key: 'samsung:galaxy-s26-ultra:512gb',
    name: 'Samsung Galaxy S26 Ultra 512GB',
    slug: 'samsung-galaxy-s26-ultra-512gb',
    description:
      'Samsung Galaxy S26 Ultra 512GB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Snapdragon 8 Elite Gen 5 for Galaxy (3 nm), RAM 12GB, bộ nhớ 512GB, pin 5000 mAh.',
    ram_gb: 12,
    storage_gb: 512,
    screen_size_inch: 6.9,
    battery_mah: 5000,
    has_5g: true,
    colors: [
      'Tím Cobalt',
      'Xanh Sky Blue',
      'Đen Classic',
      'Trắng Classic',
      'Vàng Hồng',
      'Bạc Shadow',
    ],
    images: ['/img/devices/samsung-galaxy-s26-ultra-256gb.jpg'],
    key_specs: {
      screen:
        '6.9" Dynamic LTPO AMOLED 2X, QHD+ 1440 x 3120, 120Hz, 2600 nits (peak), Gorilla Armor 2',
      chip: 'Snapdragon 8 Elite Gen 5 for Galaxy (3 nm)',
      ram: '12GB',
      storage: '512GB',
      camera: '200MP main + 50MP periscope 5x + 10MP tele 3x + 50MP ultrawide; 12MP front',
      battery: '5000 mAh, 60W wired, 25W wireless (Qi2.2)',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
        resolution: '1440 x 3120 pixels, 19.5:9 ratio (~500 ppi)',
        refresh_rate_hz: 120,
        ppi: 500,
        protection: 'Corning Gorilla Armor 2, DX anti-reflective coating',
        features: 'Privacy display',
      },
      hardware: {
        chipset: 'Qualcomm Snapdragon 8 Elite Gen 5 for Galaxy (SM8850-1-AD, 3 nm)',
        cpu: 'Octa-core (2x4.74 GHz Oryon V3 Phoenix L + 6x3.62 GHz Oryon V3 Phoenix M)',
        gpu: 'Adreno 840 (1.3 GHz)',
        storage_expansion: 'No',
        os: 'Android 16, upgradable to Android 17, One UI 9, up to 7 major Android upgrades',
        ram_gb: 12,
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Quad camera',
        main_camera: '200 MP, f/1.4, 23mm (wide), 1/1.3", 0.6µm, multi-directional PDAF, OIS',
        second_camera:
          '50 MP, f/1.9, 120˚ (ultrawide), 1/2.5", 0.7µm, dual pixel PDAF, Super Steady video',
        third_camera:
          '50 MP, f/2.9, 111mm (periscope telephoto), 1/2.52", 0.7µm, PDAF, OIS, 5x optical zoom',
        fourth_camera: '10 MP, f/2.4, 67mm (telephoto), 1/3.94", 1.0µm, PDAF, OIS, 3x optical zoom',
        flash: 'LED flash, laser AF, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60/120fps, 1080p@30/60/120/240fps, 10-bit HDR, HDR10+, stereo sound rec., gyro-EIS',
        front_camera: '12 MP, f/2.2, 23mm (wide), 1/3.2", 1.12µm, dual pixel PDAF; 4K@30/60fps',
      },
      battery: {
        capacity_mah: 5000,
        type: 'Li-Ion 5000 mAh',
        charging: '60W wired, PD3.0, 75% in 30 min; 25W wireless (Qi2.2); 4.5W reverse wireless',
        fast_charging_w: 60,
        reverse_charging: '4.5W reverse wireless',
      },
      design: {
        dimensions: '163.6 x 78.1 x 7.9 mm',
        weight_g: 214,
        materials:
          'Glass front (Gorilla Armor 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        build: 'Glass front (Gorilla Armor 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min); stylus (S Pen) support',
        biometrics: 'Fingerprint (under display, ultrasonic)',
        colors: [
          'Tím Cobalt',
          'Xanh Sky Blue',
          'Đen Classic',
          'Trắng Classic',
          'Vàng Hồng',
          'Bạc Shadow',
        ],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 38, 40, 41, 66, 75, 77, 78 SA/NSA/Sub6 (International)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 32, 38, 39, 40, 41, 66 (International)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE (CA), 5G',
        sim_type: 'Nano-SIM + Nano-SIM + eSIM (max 2 at a time) (International)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX, Ultra Wideband (UWB)',
      },
      multimedia: {
        loudspeaker: 'Yes, with stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'High-bitrate audio',
      },
      availability: {
        announced: '2026, February 25',
        status: 'Available. Released 2026, March 06',
        prices_msrp: '42.990.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.09 W/kg', sar_body: '1.19 W/kg' },
    },
    sources: {
      storages: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      ram_by_storage: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/buy/',
      colors: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/buy/',
      vn_launch_prices:
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      vn_launch_prices_crosscheck: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      'hardware.chipset_vn': 'https://fptshop.com.vn/dien-thoai/samsung-galaxy-s26-ultra',
      display: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      hardware: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      camera: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      battery: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      design: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'design.dimensions_weight_crosscheck':
        'https://fptshop.com.vn/dien-thoai/samsung-galaxy-s26-ultra',
      cellular: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      connectivity: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      multimedia: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'availability.announced_status':
        'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'availability.prices_msrp':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      regulatory: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
    },
    aliases: [
      'Điện thoại Samsung Galaxy S26 Ultra 5G 12GB/512GB',
      'Samsung Galaxy S26 Ultra 512GB',
    ],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S26 Ultra',
    variant_name: '16GB/1TB',
    model_key: 'samsung:galaxy-s26-ultra:1024gb',
    name: 'Samsung Galaxy S26 Ultra 1TB',
    slug: 'samsung-galaxy-s26-ultra-1tb',
    description:
      'Samsung Galaxy S26 Ultra 1TB chính hãng tại Việt Nam: màn hình 6.9 inch, chip Snapdragon 8 Elite Gen 5 for Galaxy (3 nm), RAM 16GB, bộ nhớ 1TB, pin 5000 mAh.',
    ram_gb: 16,
    storage_gb: 1024,
    screen_size_inch: 6.9,
    battery_mah: 5000,
    has_5g: true,
    colors: [
      'Tím Cobalt',
      'Xanh Sky Blue',
      'Đen Classic',
      'Trắng Classic',
      'Vàng Hồng',
      'Bạc Shadow',
    ],
    images: ['/img/devices/samsung-galaxy-s26-ultra-256gb.jpg'],
    key_specs: {
      screen:
        '6.9" Dynamic LTPO AMOLED 2X, QHD+ 1440 x 3120, 120Hz, 2600 nits (peak), Gorilla Armor 2',
      chip: 'Snapdragon 8 Elite Gen 5 for Galaxy (3 nm)',
      ram: '16GB',
      storage: '1TB',
      camera: '200MP main + 50MP periscope 5x + 10MP tele 3x + 50MP ultrawide; 12MP front',
      battery: '5000 mAh, 60W wired, 25W wireless (Qi2.2)',
    },
    specifications: {
      display: {
        size_inch: 6.9,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
        resolution: '1440 x 3120 pixels, 19.5:9 ratio (~500 ppi)',
        refresh_rate_hz: 120,
        ppi: 500,
        protection: 'Corning Gorilla Armor 2, DX anti-reflective coating',
        features: 'Privacy display',
      },
      hardware: {
        chipset: 'Qualcomm Snapdragon 8 Elite Gen 5 for Galaxy (SM8850-1-AD, 3 nm)',
        cpu: 'Octa-core (2x4.74 GHz Oryon V3 Phoenix L + 6x3.62 GHz Oryon V3 Phoenix M)',
        gpu: 'Adreno 840 (1.3 GHz)',
        storage_expansion: 'No',
        os: 'Android 16, upgradable to Android 17, One UI 9, up to 7 major Android upgrades',
        ram_gb: 16,
        storage_gb: 1024,
      },
      camera: {
        rear_setup: 'Quad camera',
        main_camera: '200 MP, f/1.4, 23mm (wide), 1/1.3", 0.6µm, multi-directional PDAF, OIS',
        second_camera:
          '50 MP, f/1.9, 120˚ (ultrawide), 1/2.5", 0.7µm, dual pixel PDAF, Super Steady video',
        third_camera:
          '50 MP, f/2.9, 111mm (periscope telephoto), 1/2.52", 0.7µm, PDAF, OIS, 5x optical zoom',
        fourth_camera: '10 MP, f/2.4, 67mm (telephoto), 1/3.94", 1.0µm, PDAF, OIS, 3x optical zoom',
        flash: 'LED flash, laser AF, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60/120fps, 1080p@30/60/120/240fps, 10-bit HDR, HDR10+, stereo sound rec., gyro-EIS',
        front_camera: '12 MP, f/2.2, 23mm (wide), 1/3.2", 1.12µm, dual pixel PDAF; 4K@30/60fps',
      },
      battery: {
        capacity_mah: 5000,
        type: 'Li-Ion 5000 mAh',
        charging: '60W wired, PD3.0, 75% in 30 min; 25W wireless (Qi2.2); 4.5W reverse wireless',
        fast_charging_w: 60,
        reverse_charging: '4.5W reverse wireless',
      },
      design: {
        dimensions: '163.6 x 78.1 x 7.9 mm',
        weight_g: 214,
        materials:
          'Glass front (Gorilla Armor 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        build: 'Glass front (Gorilla Armor 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min); stylus (S Pen) support',
        biometrics: 'Fingerprint (under display, ultrasonic)',
        colors: [
          'Tím Cobalt',
          'Xanh Sky Blue',
          'Đen Classic',
          'Trắng Classic',
          'Vàng Hồng',
          'Bạc Shadow',
        ],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 38, 40, 41, 66, 75, 77, 78 SA/NSA/Sub6 (International)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 32, 38, 39, 40, 41, 66 (International)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900',
        data_speed: 'HSPA, LTE (CA), 5G',
        sim_type: 'Nano-SIM + Nano-SIM + eSIM (max 2 at a time) (International)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX, Ultra Wideband (UWB)',
      },
      multimedia: {
        loudspeaker: 'Yes, with stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'High-bitrate audio',
      },
      availability: {
        announced: '2026, February 25',
        status: 'Available. Released 2026, March 06',
        prices_msrp: '51.990.000 ₫ (1TB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.09 W/kg', sar_body: '1.19 W/kg' },
    },
    sources: {
      storages: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      ram_by_storage: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/buy/',
      colors: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/buy/',
      vn_launch_prices:
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      vn_launch_prices_crosscheck: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      'hardware.chipset_vn': 'https://fptshop.com.vn/dien-thoai/samsung-galaxy-s26-ultra',
      display: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      hardware: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      camera: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      battery: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      design: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'design.dimensions_weight_crosscheck':
        'https://fptshop.com.vn/dien-thoai/samsung-galaxy-s26-ultra',
      cellular: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      connectivity: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      multimedia: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'availability.announced_status':
        'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
      'availability.prices_msrp':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      regulatory: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra_5g-14320.php',
    },
    aliases: ['Điện thoại Samsung Galaxy S26 Ultra 5G 16GB/1TB', 'Samsung Galaxy S26 Ultra 1TB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S26+',
    variant_name: '12GB/256GB',
    model_key: 'samsung:galaxy-s26-plus:256gb',
    name: 'Samsung Galaxy S26+ 256GB',
    slug: 'samsung-galaxy-s26-plus-256gb',
    description:
      'Samsung Galaxy S26+ 256GB chính hãng tại Việt Nam: màn hình 6.7 inch, chip Exynos 2600 (2 nm) in Vietnam, RAM 12GB, bộ nhớ 256GB, pin 4900 mAh.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.7,
    battery_mah: 4900,
    has_5g: true,
    colors: [
      'Tím Cobalt',
      'Xanh Sky Blue',
      'Đen Classic',
      'Trắng Classic',
      'Vàng Hồng',
      'Bạc Shadow',
    ],
    images: [],
    key_specs: {
      screen: '6.7" Dynamic LTPO AMOLED 2X, QHD+ 1440 x 3120, 120Hz, 2600 nits (peak)',
      chip: 'Exynos 2600 (2 nm) in Vietnam',
      ram: '12GB',
      storage: '256GB',
      camera: '50MP main + 10MP tele 3x + 12MP ultrawide; 12MP front',
      battery: '4900 mAh, 45W wired, 20W wireless (Qi2.2)',
    },
    specifications: {
      display: {
        size_inch: 6.7,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
        resolution: '1440 x 3120 pixels, 19.5:9 ratio (~516 ppi)',
        refresh_rate_hz: 120,
        ppi: 516,
        protection: 'Corning Gorilla Glass Victus 2',
      },
      hardware: {
        chipset:
          'Exynos 2600 (2 nm) in Vietnam and most markets; Snapdragon 8 Elite Gen 5 (3 nm) in USA/Canada/China',
        cpu: 'Exynos: 10-core (1x3.80 GHz C1-Ultra + 3x3.25 GHz C1-Pro + 6x2.75 GHz C1-Pro)',
        gpu: 'Xclipse 960 (Exynos)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'Android 16, upgradable to Android 17, One UI 9, up to 7 major Android upgrades',
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Triple camera',
        main_camera: '50 MP, f/1.8, 24mm (wide), 1/1.56", 1.0µm, dual pixel PDAF, OIS',
        second_camera: '10 MP, f/2.4, 67mm (telephoto), 1/3.94", 1.0µm, PDAF, OIS, 3x optical zoom',
        third_camera: '12 MP, f/2.2, 13mm, 120˚ (ultrawide), 1/2.55", 1.4µm, Super Steady video',
        flash: 'LED flash, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60fps, 1080p@30/60/120/240fps, 10-bit HDR, HDR10+, stereo sound rec., gyro-EIS',
        front_camera: '12 MP, f/2.2, 23mm (wide), 1/3.2", 1.12µm, dual pixel PDAF; 4K@30/60fps',
      },
      battery: {
        capacity_mah: 4900,
        type: 'Li-Ion 4900 mAh',
        charging: '45W wired, PD3.0, 69% in 30 min; 20W wireless (Qi2.2); 4.5W reverse wireless',
        fast_charging_w: 45,
        reverse_charging: '4.5W reverse wireless',
      },
      design: {
        dimensions: '158.4 x 75.8 x 7.3 mm',
        weight_g: 190,
        materials:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        build:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min)',
        biometrics: 'Fingerprint (under display, ultrasonic)',
        colors: [
          'Tím Cobalt',
          'Xanh Sky Blue',
          'Đen Classic',
          'Trắng Classic',
          'Vàng Hồng',
          'Bạc Shadow',
        ],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 38, 40, 41, 66, 75, 77, 78 SA/NSA/Sub6 (International)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 32, 38, 39, 40, 41, 66 (International)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        sim_type: 'Nano-SIM + eSIM (International)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX, Ultra Wideband (UWB)',
      },
      multimedia: {
        loudspeaker: 'Yes, with stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'High-bitrate audio',
      },
      availability: {
        announced: '2026, February 25',
        status: 'Available. Released 2026, March 06',
        prices_msrp: '29.990.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.15 W/kg', sar_body: '1.17 W/kg' },
    },
    sources: {
      storages: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      colors: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      ram_gb: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      vn_launch_prices:
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      vn_launch_prices_crosscheck: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      'hardware.chipset_vn': 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      display: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      hardware: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      camera: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      battery: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      design: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      cellular: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      connectivity: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      multimedia: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      'availability.announced_status': 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      'availability.prices_msrp':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      regulatory: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
    },
    aliases: ['Điện thoại Samsung Galaxy S26+ 5G 12GB/256GB', 'Samsung Galaxy S26 Plus 256GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S26+',
    variant_name: '12GB/512GB',
    model_key: 'samsung:galaxy-s26-plus:512gb',
    name: 'Samsung Galaxy S26+ 512GB',
    slug: 'samsung-galaxy-s26-plus-512gb',
    description:
      'Samsung Galaxy S26+ 512GB chính hãng tại Việt Nam: màn hình 6.7 inch, chip Exynos 2600 (2 nm) in Vietnam, RAM 12GB, bộ nhớ 512GB, pin 4900 mAh.',
    ram_gb: 12,
    storage_gb: 512,
    screen_size_inch: 6.7,
    battery_mah: 4900,
    has_5g: true,
    colors: [
      'Tím Cobalt',
      'Xanh Sky Blue',
      'Đen Classic',
      'Trắng Classic',
      'Vàng Hồng',
      'Bạc Shadow',
    ],
    images: [],
    key_specs: {
      screen: '6.7" Dynamic LTPO AMOLED 2X, QHD+ 1440 x 3120, 120Hz, 2600 nits (peak)',
      chip: 'Exynos 2600 (2 nm) in Vietnam',
      ram: '12GB',
      storage: '512GB',
      camera: '50MP main + 10MP tele 3x + 12MP ultrawide; 12MP front',
      battery: '4900 mAh, 45W wired, 20W wireless (Qi2.2)',
    },
    specifications: {
      display: {
        size_inch: 6.7,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
        resolution: '1440 x 3120 pixels, 19.5:9 ratio (~516 ppi)',
        refresh_rate_hz: 120,
        ppi: 516,
        protection: 'Corning Gorilla Glass Victus 2',
      },
      hardware: {
        chipset:
          'Exynos 2600 (2 nm) in Vietnam and most markets; Snapdragon 8 Elite Gen 5 (3 nm) in USA/Canada/China',
        cpu: 'Exynos: 10-core (1x3.80 GHz C1-Ultra + 3x3.25 GHz C1-Pro + 6x2.75 GHz C1-Pro)',
        gpu: 'Xclipse 960 (Exynos)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'Android 16, upgradable to Android 17, One UI 9, up to 7 major Android upgrades',
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Triple camera',
        main_camera: '50 MP, f/1.8, 24mm (wide), 1/1.56", 1.0µm, dual pixel PDAF, OIS',
        second_camera: '10 MP, f/2.4, 67mm (telephoto), 1/3.94", 1.0µm, PDAF, OIS, 3x optical zoom',
        third_camera: '12 MP, f/2.2, 13mm, 120˚ (ultrawide), 1/2.55", 1.4µm, Super Steady video',
        flash: 'LED flash, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60fps, 1080p@30/60/120/240fps, 10-bit HDR, HDR10+, stereo sound rec., gyro-EIS',
        front_camera: '12 MP, f/2.2, 23mm (wide), 1/3.2", 1.12µm, dual pixel PDAF; 4K@30/60fps',
      },
      battery: {
        capacity_mah: 4900,
        type: 'Li-Ion 4900 mAh',
        charging: '45W wired, PD3.0, 69% in 30 min; 20W wireless (Qi2.2); 4.5W reverse wireless',
        fast_charging_w: 45,
        reverse_charging: '4.5W reverse wireless',
      },
      design: {
        dimensions: '158.4 x 75.8 x 7.3 mm',
        weight_g: 190,
        materials:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        build:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min)',
        biometrics: 'Fingerprint (under display, ultrasonic)',
        colors: [
          'Tím Cobalt',
          'Xanh Sky Blue',
          'Đen Classic',
          'Trắng Classic',
          'Vàng Hồng',
          'Bạc Shadow',
        ],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 38, 40, 41, 66, 75, 77, 78 SA/NSA/Sub6 (International)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 32, 38, 39, 40, 41, 66 (International)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900',
        sim_type: 'Nano-SIM + eSIM (International)',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX, Ultra Wideband (UWB)',
      },
      multimedia: {
        loudspeaker: 'Yes, with stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'High-bitrate audio',
      },
      availability: {
        announced: '2026, February 25',
        status: 'Available. Released 2026, March 06',
        prices_msrp: '35.990.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.15 W/kg', sar_body: '1.17 W/kg' },
    },
    sources: {
      storages: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      colors: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      ram_gb: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      vn_launch_prices:
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      vn_launch_prices_crosscheck: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      'hardware.chipset_vn': 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      display: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      hardware: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      camera: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      battery: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      design: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      cellular: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      connectivity: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      multimedia: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      'availability.announced_status': 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
      'availability.prices_msrp':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      regulatory: 'https://www.gsmarena.com/samsung_galaxy_s26+_5g-14457.php',
    },
    aliases: ['Điện thoại Samsung Galaxy S26+ 5G 12GB/512GB', 'Samsung Galaxy S26 Plus 512GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S26',
    variant_name: '12GB/256GB',
    model_key: 'samsung:galaxy-s26:256gb',
    name: 'Samsung Galaxy S26 256GB',
    slug: 'samsung-galaxy-s26-256gb',
    description:
      'Samsung Galaxy S26 256GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Exynos 2600 (2 nm) in Vietnam, RAM 12GB, bộ nhớ 256GB, pin 4300 mAh.',
    ram_gb: 12,
    storage_gb: 256,
    screen_size_inch: 6.3,
    battery_mah: 4300,
    has_5g: true,
    colors: [
      'Tím Cobalt',
      'Xanh Sky Blue',
      'Đen Classic',
      'Trắng Classic',
      'Vàng Hồng',
      'Bạc Shadow',
    ],
    images: [],
    key_specs: {
      screen: '6.3" Dynamic LTPO AMOLED 2X, FHD+ 1080 x 2340, 120Hz, 2600 nits (peak)',
      chip: 'Exynos 2600 (2 nm) in Vietnam',
      ram: '12GB',
      storage: '256GB',
      camera: '50MP main + 10MP tele 3x + 12MP ultrawide; 12MP front',
      battery: '4300 mAh, 25W wired, 15W wireless',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
        resolution: '1080 x 2340 pixels, 19.5:9 ratio (~411 ppi)',
        refresh_rate_hz: 120,
        ppi: 411,
        protection: 'Corning Gorilla Glass Victus 2',
      },
      hardware: {
        chipset:
          'Exynos 2600 (2 nm) in Vietnam and most markets; Snapdragon 8 Elite Gen 5 (3 nm) in USA/Canada/China',
        cpu: 'Exynos: 10-core (1x3.80 GHz C1-Ultra + 3x3.25 GHz C1-Pro + 6x2.75 GHz C1-Pro)',
        gpu: 'Xclipse 960 (Exynos)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'Android 16, upgradable to Android 17, One UI 9, up to 7 major Android upgrades',
        storage_gb: 256,
      },
      camera: {
        rear_setup: 'Triple camera',
        main_camera: '50 MP, f/1.8, 24mm (wide), dual pixel PDAF, OIS',
        second_camera: '10 MP, f/2.4, 67mm (telephoto), PDAF, OIS, 3x optical zoom',
        third_camera: '12 MP, f/2.2, 13mm, 120˚ (ultrawide), Super Steady video',
        flash: 'LED flash, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60fps, 1080p@30/60/120/240fps, 10-bit HDR, HDR10+, stereo sound rec., gyro-EIS',
        front_camera: '12 MP, f/2.2, 23mm (wide), dual pixel PDAF; 4K@30/60fps',
      },
      battery: {
        capacity_mah: 4300,
        type: 'Li-Ion 4300 mAh',
        charging:
          '25W wired, PD3.0, 55% in 30 min; 15W wireless (Qi2 Ready); 4.5W reverse wireless',
        fast_charging_w: 25,
        reverse_charging: '4.5W reverse wireless',
      },
      design: {
        dimensions: '149.6 x 71.7 x 7.2 mm',
        weight_g: 167,
        materials:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        build:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min)',
        biometrics: 'Fingerprint (under display, ultrasonic)',
        colors: [
          'Tím Cobalt',
          'Xanh Sky Blue',
          'Đen Classic',
          'Trắng Classic',
          'Vàng Hồng',
          'Bạc Shadow',
        ],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 38, 40, 41, 66, 75, 77, 78 SA/NSA/Sub6 (International)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 32, 38, 39, 40, 41, 66 (International)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900; TD-SCDMA',
        sim_type: 'Nano-SIM + Nano-SIM + eSIM + eSIM (max 2 at a time) (International)',
      },
      connectivity: {
        bluetooth: '5.4, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX',
      },
      multimedia: {
        loudspeaker: 'Yes, with stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'High-bitrate audio',
      },
      availability: {
        announced: '2026, February 25',
        status: 'Available. Released 2026, March 06',
        prices_msrp: '25.990.000 ₫ (256GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg', sar_body: '1.20 W/kg' },
    },
    sources: {
      storages: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      colors: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      ram_gb: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      vn_launch_prices:
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      vn_launch_prices_crosscheck: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      'hardware.chipset_vn':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      display: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      hardware: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      camera: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      battery: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      design: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      cellular: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      connectivity: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      multimedia: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      'availability.announced_status': 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      'availability.prices_msrp':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      regulatory: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
    },
    aliases: ['Điện thoại Samsung Galaxy S26 5G 12GB/256GB', 'Samsung Galaxy S26 256GB'],
  },
  {
    categorySlug: 'smartphones',
    brand: 'Samsung',
    model: 'Galaxy S26',
    variant_name: '12GB/512GB',
    model_key: 'samsung:galaxy-s26:512gb',
    name: 'Samsung Galaxy S26 512GB',
    slug: 'samsung-galaxy-s26-512gb',
    description:
      'Samsung Galaxy S26 512GB chính hãng tại Việt Nam: màn hình 6.3 inch, chip Exynos 2600 (2 nm) in Vietnam, RAM 12GB, bộ nhớ 512GB, pin 4300 mAh.',
    ram_gb: 12,
    storage_gb: 512,
    screen_size_inch: 6.3,
    battery_mah: 4300,
    has_5g: true,
    colors: [
      'Tím Cobalt',
      'Xanh Sky Blue',
      'Đen Classic',
      'Trắng Classic',
      'Vàng Hồng',
      'Bạc Shadow',
    ],
    images: [],
    key_specs: {
      screen: '6.3" Dynamic LTPO AMOLED 2X, FHD+ 1080 x 2340, 120Hz, 2600 nits (peak)',
      chip: 'Exynos 2600 (2 nm) in Vietnam',
      ram: '12GB',
      storage: '512GB',
      camera: '50MP main + 10MP tele 3x + 12MP ultrawide; 12MP front',
      battery: '4300 mAh, 25W wired, 15W wireless',
    },
    specifications: {
      display: {
        size_inch: 6.3,
        type: 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits (peak)',
        resolution: '1080 x 2340 pixels, 19.5:9 ratio (~411 ppi)',
        refresh_rate_hz: 120,
        ppi: 411,
        protection: 'Corning Gorilla Glass Victus 2',
      },
      hardware: {
        chipset:
          'Exynos 2600 (2 nm) in Vietnam and most markets; Snapdragon 8 Elite Gen 5 (3 nm) in USA/Canada/China',
        cpu: 'Exynos: 10-core (1x3.80 GHz C1-Ultra + 3x3.25 GHz C1-Pro + 6x2.75 GHz C1-Pro)',
        gpu: 'Xclipse 960 (Exynos)',
        ram_gb: 12,
        storage_expansion: 'No',
        os: 'Android 16, upgradable to Android 17, One UI 9, up to 7 major Android upgrades',
        storage_gb: 512,
      },
      camera: {
        rear_setup: 'Triple camera',
        main_camera: '50 MP, f/1.8, 24mm (wide), dual pixel PDAF, OIS',
        second_camera: '10 MP, f/2.4, 67mm (telephoto), PDAF, OIS, 3x optical zoom',
        third_camera: '12 MP, f/2.2, 13mm, 120˚ (ultrawide), Super Steady video',
        flash: 'LED flash, auto-HDR, panorama',
        video_recording:
          '8K@24/30fps, 4K@30/60fps, 1080p@30/60/120/240fps, 10-bit HDR, HDR10+, stereo sound rec., gyro-EIS',
        front_camera: '12 MP, f/2.2, 23mm (wide), dual pixel PDAF; 4K@30/60fps',
      },
      battery: {
        capacity_mah: 4300,
        type: 'Li-Ion 4300 mAh',
        charging:
          '25W wired, PD3.0, 55% in 30 min; 15W wireless (Qi2 Ready); 4.5W reverse wireless',
        fast_charging_w: 25,
        reverse_charging: '4.5W reverse wireless',
      },
      design: {
        dimensions: '149.6 x 71.7 x 7.2 mm',
        weight_g: 167,
        materials:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        build:
          'Glass front (Gorilla Glass Victus 2), glass back (Gorilla Glass Victus 2), aluminum frame',
        resistance: 'IP68 dust/water resistant (up to 1.5m for 30 min)',
        biometrics: 'Fingerprint (under display, ultrasonic)',
        colors: [
          'Tím Cobalt',
          'Xanh Sky Blue',
          'Đen Classic',
          'Trắng Classic',
          'Vàng Hồng',
          'Bạc Shadow',
        ],
      },
      cellular: {
        has_5g: true,
        technology: 'GSM / CDMA / HSPA / EVDO / LTE / 5G',
        bands_5g:
          '1, 2, 3, 5, 7, 8, 12, 20, 25, 26, 28, 38, 40, 41, 66, 75, 77, 78 SA/NSA/Sub6 (International)',
        bands_4g:
          '1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 32, 38, 39, 40, 41, 66 (International)',
        bands_3g: 'HSDPA 850 / 900 / 1700(AWS) / 1900 / 2100; CDMA2000 1xEV-DO',
        bands_2g: 'GSM 850 / 900 / 1800 / 1900; CDMA 800 / 1900; TD-SCDMA',
        sim_type: 'Nano-SIM + Nano-SIM + eSIM + eSIM (max 2 at a time) (International)',
      },
      connectivity: {
        bluetooth: '5.4, A2DP, LE',
        wlan: 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band, Wi-Fi Direct',
        usb: 'USB Type-C 3.2, DisplayPort 1.2, OTG',
        sensors:
          'Fingerprint (under display, ultrasonic), accelerometer, gyro, proximity, compass, barometer',
        location: 'GPS, GLONASS, BDS, GALILEO, QZSS',
        nfc: true,
        other: 'Samsung DeX, Samsung Wireless DeX',
      },
      multimedia: {
        loudspeaker: 'Yes, with stereo speakers',
        headphone_jack_35mm: false,
        audio_features: 'High-bitrate audio',
      },
      availability: {
        announced: '2026, February 25',
        status: 'Available. Released 2026, March 06',
        prices_msrp: '31.990.000 ₫ (512GB, giá niêm yết khi mở bán tại Việt Nam)',
      },
      regulatory: { sar_head: '1.19 W/kg', sar_body: '1.20 W/kg' },
    },
    sources: {
      storages: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      colors: 'https://www.samsung.com/vn/smartphones/galaxy-s26-ultra/specs/',
      ram_gb: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      vn_launch_prices:
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      vn_launch_prices_crosscheck: 'https://cellphones.com.vn/sforum/bang-gia-galaxy-s26-series',
      'hardware.chipset_vn':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      display: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      hardware: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      camera: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      battery: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      design: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      cellular: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      connectivity: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      multimedia: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      'availability.announced_status': 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
      'availability.prices_msrp':
        'https://fptshop.com.vn/tin-tuc/tin-moi/bang-gia-samsung-galaxy-s26-series-202514',
      regulatory: 'https://www.gsmarena.com/samsung_galaxy_s26_5g-14456.php',
    },
    aliases: ['Điện thoại Samsung Galaxy S26 5G 12GB/512GB', 'Samsung Galaxy S26 512GB'],
  },
];
