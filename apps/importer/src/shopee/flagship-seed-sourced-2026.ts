import type { FlagshipDeviceSeed } from './flagship-seed-data.js';

/**
 * Sourced replacements for the iPhone 18 Pro, iPhone 18 Pro Max and Galaxy S26 Ultra 256GB
 * seeds, whose earlier, unsourced specs and prices contradicted the manufacturer and retail
 * sources (battery, colours, price, frame material, cameras, charging, RAM). Same keys and
 * slugs. Spec-only, like every seed: no listing, price, merchant or review. Every spec
 * group is cited in `sources` (a whole group, or a field path where the page is narrower,
 * -> URL); the launch prices are the Vietnamese list prices at launch, for reference only.
 * `retract_spec_fields` names what the old entries wrote that the sources do not support,
 * so the backfill removes it. Researched on 2026-10-30.
 */
export const SOURCED_SEEDS_2026: FlagshipDeviceSeed[] = [
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
      'Apple iPhone 18 Pro Max chính hãng tại Việt Nam: màn hình 6.9 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, pin 5391 mAh.',
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
        prices_msrp:
          'Giá niêm yết khi mở bán tại Việt Nam: 256GB: 41.999.000 ₫; 512GB: 48.499.000 ₫; 1TB: 61.499.000 ₫; 2TB: 80.999.000 ₫',
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
    retract_spec_fields: ['battery.fast_charging_w', 'regulatory.sar_head', 'regulatory.sar_body'],
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
      'Apple iPhone 18 Pro chính hãng tại Việt Nam: màn hình 6.3 inch, chip Apple A20 Pro (2 nm), CPU 6 nhân, GPU 7 nhân, pin 4056 mAh.',
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
        prices_msrp:
          'Giá niêm yết khi mở bán tại Việt Nam: 256GB: 38.999.000 ₫; 512GB: 45.499.000 ₫; 1TB: 58.499.000 ₫; 2TB: 77.999.000 ₫',
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
    retract_spec_fields: ['battery.fast_charging_w', 'regulatory.sar_head', 'regulatory.sar_body'],
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
      'Samsung Galaxy S26 Ultra chính hãng tại Việt Nam: màn hình 6.9 inch, chip Snapdragon 8 Elite Gen 5 for Galaxy (3 nm), pin 5000 mAh.',
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
        prices_msrp:
          'Giá niêm yết khi mở bán tại Việt Nam: 256GB: 36.990.000 ₫; 512GB: 42.990.000 ₫; 1TB: 51.990.000 ₫',
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
    retract_spec_fields: ['regulatory.certifications'],
  },
];
