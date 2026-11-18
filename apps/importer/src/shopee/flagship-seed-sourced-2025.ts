import type { FlagshipDeviceSeed } from './flagship-seed-data.js';

/**
 * Sourced seed for the iPhone 16e 128GB master (DOS/Rate#1718). That master was created by
 * the DOS/Rate#594 offer move with a partial spec set (no connectivity, multimedia or
 * regulatory group), so it failed the backfill's catalog audit. Spec-only, like every
 * seed: no listing, price, merchant or review. Every spec group is cited in `sources`
 * (a whole group, or a field path where the page is narrower, -> URL). Apple states
 * "There's one camera on the back", so the seed declares a single rear camera and has no
 * `second_camera`; the 2x Telephoto is a crop of the same 48MP sensor. Values no source
 * states (loudspeaker layout, headphone jack, SAR, FCC ID, Vietnamese price) are left out of
 * the seed; the backfill's field merge keeps what the master already holds (the #594 row's
 * `hardware.os` and `battery.fast_charging_w`, 20W being Apple's stated adapter).
 * No `images`: the master keeps its own. Researched on 2026-11-18.
 */
export const SOURCED_SEEDS_2025: FlagshipDeviceSeed[] = [
  {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 16e',
    variant_name: '128GB',
    model_key: 'apple:iphone-16e:128gb',
    name: 'Apple iPhone 16e 128GB',
    slug: 'apple-iphone-16e-128gb',
    description:
      'Apple iPhone 16e: màn hình OLED 6.1 inch, chip Apple A18 (CPU 6 nhân, GPU 4 nhân), một camera sau 48MP Fusion (2-in-1, Telephoto 2x), modem Apple C1, pin 4005 mAh.',
    ram_gb: 8,
    storage_gb: 128,
    screen_size_inch: 6.1,
    battery_mah: 4005,
    has_5g: true,
    colors: ['Đen', 'Trắng'],
    images: [],
    key_specs: {
      screen: '6.1" OLED Super Retina XDR, 60Hz, 1200 nit (HDR)',
      chip: 'Apple A18, CPU 6 nhân, GPU 4 nhân',
      ram: '8GB',
      storage: '128GB',
      camera: '1 camera sau 48MP Fusion (2-in-1, Telephoto 2x); trước 12MP TrueDepth',
      battery: '4005 mAh, sạc 50% trong 30 phút (bộ sạc 20W), sạc không dây Qi 7.5W',
    },
    specifications: {
      availability: {
        announced: '2025, February 19',
        status:
          'Released 2025, February 28 (pre-orders from 2025, February 21); discontinued 2026, March 2',
      },
      design: {
        dimensions: '146.7 x 71.5 x 7.8 mm',
        weight_g: 167,
        materials: 'Aluminium design, Ceramic Shield front, glass back',
        resistance: 'IP68 (maximum depth of 6 m up to 30 minutes, IEC 60529)',
        biometrics: 'Face ID',
        keys: 'Action button, side button, volume buttons',
        colors: ['Đen', 'Trắng'],
      },
      display: {
        size_inch: 6.1,
        type: 'Super Retina XDR OLED, HDR, 800 nits max (typ), 1200 nits peak (HDR)',
        resolution: '1170 x 2532 pixels (460 ppi)',
        refresh_rate_hz: 60,
        ppi: 460,
        protection: 'Ceramic Shield front',
        features: 'Notch (no Dynamic Island), True Tone, wide colour (P3), 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A18',
        cpu: '6-core CPU (2 performance + 4 efficiency cores)',
        gpu: 'Apple 4-core GPU, hardware-accelerated ray tracing; 16-core Neural Engine',
        ram_gb: 8,
        storage_gb: 128,
      },
      battery: {
        capacity_mah: 4005,
        type: 'Li-ion 4005 mAh (15.55 Wh)',
        charging:
          'USB-C: up to 50% in 30 min with a 20W adapter or higher; Qi wireless up to 7.5W (no MagSafe). Video playback up to 26 h',
      },
      camera: {
        rear_setup: 'Single Camera (48MP Fusion, 2-in-1 with 2x Telephoto)',
        main_camera:
          '48 MP Fusion Main, f/1.6, 26mm, OIS, Hybrid Focus Pixels; 12 MP 2x Telephoto (52mm) from the same sensor',
        flash: 'True Tone flash',
        video_recording:
          '4K Dolby Vision 24/25/30/60fps, 1080p Dolby Vision 25/30/60fps, 720p Dolby Vision 30fps, slo-mo 1080p 120/240fps, Cinematic video stabilization, Spatial Audio and stereo recording',
        front_camera:
          '12 MP TrueDepth, f/1.9, autofocus with Focus Pixels, Retina Flash; 4K Dolby Vision up to 60fps',
      },
      connectivity: {
        bluetooth: '5.3',
        wlan: 'Wi-Fi 6 (802.11ax) with 2x2 MIMO',
        usb: 'USB-C, USB 2 (up to 480Mb/s)',
        nfc: true,
        location: 'GPS, GLONASS, Galileo, QZSS, BeiDou, NavIC',
        sensors:
          'Face ID, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'NFC with reader mode; Emergency SOS, Messages, Find My and Roadside Assistance via satellite; Crash Detection; no Ultra Wideband chip, no MagSafe',
      },
      cellular: {
        has_5g: true,
        bands_5g:
          'n1, n2, n3, n5, n7, n8, n12, n14, n20, n25, n26, n28, n29, n30, n38, n40, n41, n48, n53, n66, n70, n71, n75, n76, n77, n78, n79 (sub-6 GHz) - A3212',
        bands_4g:
          'FDD-LTE 1, 2, 3, 4, 5, 7, 8, 12, 13, 14, 17, 18, 19, 20, 25, 26, 28, 29, 30, 32, 66, 71; TD-LTE 34, 38, 39, 40, 41, 42, 48, 53 - A3212',
        technology: 'GSM/EDGE / UMTS/HSPA+ / LTE / 5G (Apple C1 modem)',
        data_speed: '5G (sub-6 GHz) with 4x4 MIMO, Gigabit LTE with 4x4 MIMO',
        sim_type: 'Dual eSIM; models sold outside the U.S. also have a nano-SIM tray',
      },
      multimedia: {
        audio_features:
          'Spatial Audio playback; AAC, MP3, Apple Lossless, FLAC, Dolby Digital, Dolby Digital Plus and Dolby Atmos playback; Audio Mix, wind noise reduction',
      },
      regulatory: {
        certifications:
          'Model numbers A3212 (United States, Puerto Rico), A3408 (Canada, Mexico, Middle East and others), A3410 (China mainland), A3409 (other countries and regions, which covers Vietnam)',
      },
    },
    sources: {
      availability:
        'https://www.apple.com/newsroom/2025/02/apple-debuts-iphone-16e-a-powerful-new-member-of-the-iphone-16-family/',
      'availability.status': 'https://en.wikipedia.org/wiki/IPhone_16e',
      design: 'https://support.apple.com/en-us/122208',
      'design.colors': 'https://support.apple.com/en-us/108044',
      display: 'https://support.apple.com/en-us/122208',
      'display.refresh_rate_hz': 'https://en.wikipedia.org/wiki/IPhone_16e',
      'display.features': 'https://en.wikipedia.org/wiki/IPhone_16e',
      hardware: 'https://support.apple.com/en-us/122208',
      'hardware.ram_gb': 'https://en.wikipedia.org/wiki/IPhone_16e',
      'battery.capacity_mah': 'https://en.wikipedia.org/wiki/IPhone_16e',
      'battery.type': 'https://en.wikipedia.org/wiki/IPhone_16e',
      'battery.charging': 'https://support.apple.com/en-us/122208',
      'battery.charging.qi_wattage': 'https://en.wikipedia.org/wiki/IPhone_16e',
      camera: 'https://support.apple.com/en-us/122208',
      'camera.rear_setup': 'https://support.apple.com/en-us/108044',
      connectivity: 'https://support.apple.com/en-us/122208',
      'connectivity.other': 'https://en.wikipedia.org/wiki/IPhone_16e',
      cellular: 'https://support.apple.com/en-us/122208',
      'cellular.sim_type': 'https://support.apple.com/en-us/108044',
      multimedia: 'https://support.apple.com/en-us/122208',
      regulatory: 'https://support.apple.com/en-us/108044',
    },
    aliases: ['Apple iPhone 16e 128GB Chính hãng VN/A', 'Điện thoại iPhone 16e 128GB'],
  },
];
