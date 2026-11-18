import type { FlagshipDeviceSeed } from './flagship-seed-data.js';

const NEWSROOM = 'https://www.apple.com/newsroom/2026/03/apple-introduces-iphone-17e/';
const SPECS_VN = 'https://www.apple.com/vn/iphone-17e/specs/';
const SPECS_US = 'https://www.apple.com/iphone-17e/specs/';
const SPECS_SUPPORT = 'https://support.apple.com/en-us/126470';
const IDENTIFY = 'https://support.apple.com/en-us/108044';
const WIKIPEDIA = 'https://en.wikipedia.org/wiki/IPhone_17e';
const VODAFONE_UK = 'https://deviceguides.vodafone.co.uk/apple/iphone-17e-ios-27/specifications';

/**
 * Sourced seed for the iPhone 17e (DOS/Rate#1737), the successor of the iPhone 16e, which
 * Apple discontinued when it introduced the 17e on 2026-03-02. No master existed for it.
 * One entry per storage Apple Vietnam sells (256GB and 512GB, apple.com/vn). Spec-only,
 * like every seed: no listing, price, merchant or review. Every spec group is cited in
 * `sources` (a whole group, or a field path where the page is narrower, -> URL).
 *
 * The values are the Vietnamese model's (A3634: nano-SIM and eSIM, 170 g and the A3634
 * bands on apple.com/vn), not the U.S. model's (A3575: eSIM only, 169 g). Apple states
 * "There's one camera on the back", so the seed declares a single rear camera and has no
 * `second_camera`; the 2x Telephoto is a crop of the same 48MP sensor. Apple publishes no
 * battery capacity or RAM: 4005 mAh and 8GB are from Wikipedia and Vodafone UK's device
 * guide, which agree. Values no source checked here states are left out: display refresh
 * rate, notch, maximum wired charging wattage, loudspeaker layout, SAR, FCC ID and the
 * Vietnamese price (a retail value that changes; the US price already did). No `images`:
 * Rate holds no licensed picture of it yet. Researched on 2026-11-18.
 */
function iphone17e(storageGb: 256 | 512): FlagshipDeviceSeed {
  const storage = `${storageGb}GB`;
  return {
    categorySlug: 'smartphones',
    brand: 'Apple',
    model: 'iPhone 17e',
    variant_name: storage,
    model_key: `apple:iphone-17e:${storageGb}gb`,
    name: `Apple iPhone 17e ${storage}`,
    slug: `apple-iphone-17e-${storageGb}gb`,
    description:
      'Apple iPhone 17e: màn hình OLED 6.1 inch, chip Apple A19 (CPU 6 nhân, GPU 4 nhân), một camera sau 48MP Fusion (2-in-1, Telephoto 2x), modem Apple C1X, sạc không dây MagSafe/Qi2 15W, pin 4005 mAh.',
    ram_gb: 8,
    storage_gb: storageGb,
    screen_size_inch: 6.1,
    battery_mah: 4005,
    has_5g: true,
    colors: ['Đen', 'Trắng', 'Hồng Phai'],
    images: [],
    key_specs: {
      screen: '6.1" OLED Super Retina XDR, 1200 nit (HDR)',
      chip: 'Apple A19, CPU 6 nhân, GPU 4 nhân',
      ram: '8GB',
      storage,
      camera: '1 camera sau 48MP Fusion (2-in-1, Telephoto 2x); trước 12MP TrueDepth',
      battery:
        '4005 mAh, xem video đến 26 giờ, sạc 50% trong 30 phút (bộ sạc từ 20W), MagSafe/Qi2 15W',
    },
    specifications: {
      availability: {
        announced: '2026, March 2',
        status: 'Released 2026, March 11 (pre-orders from 2026, March 4)',
      },
      design: {
        dimensions: '146.7 x 71.5 x 7.80 mm',
        weight_g: 170,
        materials: 'Aluminium design, Ceramic Shield 2 front, glass back',
        resistance: 'IP68 (maximum depth of 6 m up to 30 minutes, IEC 60529)',
        biometrics: 'Face ID',
        keys: 'Action button, side button, volume buttons',
        colors: ['Đen', 'Trắng', 'Hồng Phai'],
      },
      display: {
        size_inch: 6.1,
        type: 'Super Retina XDR OLED, HDR, 800 nits max (typ), 1200 nits peak (HDR)',
        resolution: '1170 x 2532 pixels (460 ppi)',
        ppi: 460,
        protection: 'Ceramic Shield 2 front',
        features: 'True Tone, wide colour (P3), Haptic Touch, 2,000,000:1 contrast',
      },
      hardware: {
        chipset: 'Apple A19 (3 nm)',
        cpu: '6-core CPU (2 performance + 4 efficiency cores)',
        gpu: 'Apple 4-core GPU with Neural Accelerators, hardware-accelerated ray tracing; 16-core Neural Engine',
        os: 'iOS 26 at launch; iOS 27 in the box (Apple Vietnam, 2026-11-18)',
        ram_gb: 8,
        storage_gb: storageGb,
      },
      battery: {
        capacity_mah: 4005,
        type: 'Li-ion 4005 mAh (15.556 Wh)',
        charging:
          'USB-C: up to 50% in 30 min with a 20W adapter or higher; MagSafe and Qi2 wireless up to 15W. Video playback up to 26 h (streamed up to 21 h)',
      },
      camera: {
        rear_setup: 'Single Camera (48MP Fusion, 2-in-1 with 2x Telephoto)',
        main_camera:
          '48 MP Fusion Main, f/1.6, 26mm, OIS, Hybrid Focus Pixels; 12 MP 2x Telephoto (52mm, f/1.6) from the same sensor',
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
        location:
          'GPS, GLONASS, Galileo, QZSS, BeiDou, NavIC; digital compass; iBeacon microlocation',
        sensors:
          'Face ID, barometer, high dynamic range gyro, high-g accelerometer, proximity sensor, dual ambient light sensors',
        other:
          'NFC with reader mode, Express Cards with power reserve; Emergency SOS, Messages, Find My and Roadside Assistance via satellite; Crash Detection',
      },
      cellular: {
        has_5g: true,
        bands_5g:
          'FDD n1, n2, n3, n5, n7, n8, n12, n20, n25, n26, n28, n30, n66, n70, n75; TDD n38, n40, n41, n48, n53, n77, n78, n79 (sub-6 GHz) - A3634',
        bands_4g:
          'FDD-LTE 1, 2, 3, 4, 5, 7, 8, 12, 13, 17, 18, 19, 20, 25, 26, 28, 30, 32, 66; TD-LTE 34, 38, 39, 40, 41, 42, 48, 53 - A3634',
        technology: 'GSM/EDGE / UMTS/HSPA+ / LTE / 5G (Apple C1X modem)',
        data_speed: '5G (sub-6 GHz) with 4x4 MIMO, Gigabit LTE with 4x4 MIMO',
        sim_type: 'Nano-SIM and eSIM; dual eSIM supported (A3634)',
      },
      multimedia: {
        audio_features:
          'Spatial Audio playback; AAC, MP3, Apple Lossless, FLAC, Dolby Digital, Dolby Digital Plus and Dolby Atmos playback; Audio Mix, wind noise reduction',
      },
      regulatory: {
        certifications:
          'Model numbers A3575 (United States, Puerto Rico, Canada, Japan, Mexico and others), A3635 (China mainland), A3634 (other countries and regions, which covers Vietnam)',
      },
    },
    sources: {
      availability: NEWSROOM,
      'availability.status': NEWSROOM,
      design: SPECS_VN,
      'design.materials': SPECS_SUPPORT,
      'design.colors': SPECS_VN,
      'design.keys': SPECS_US,
      display: SPECS_SUPPORT,
      hardware: SPECS_SUPPORT,
      'hardware.chipset': NEWSROOM,
      'hardware.os': SPECS_VN,
      'hardware.ram_gb': WIKIPEDIA,
      'hardware.ram_gb.corroboration': VODAFONE_UK,
      battery: SPECS_VN,
      'battery.capacity_mah': WIKIPEDIA,
      'battery.capacity_mah.corroboration': VODAFONE_UK,
      'battery.type': WIKIPEDIA,
      'battery.charging': SPECS_SUPPORT,
      camera: SPECS_US,
      'camera.rear_setup': IDENTIFY,
      connectivity: SPECS_VN,
      'connectivity.other': SPECS_US,
      cellular: SPECS_VN,
      'cellular.technology': SPECS_SUPPORT,
      multimedia: SPECS_US,
      regulatory: IDENTIFY,
    },
    aliases: [
      `Apple iPhone 17e ${storage} Chính hãng VN/A`,
      `Điện thoại iPhone 17e ${storage}`,
      `iPhone 17E ${storage}`,
    ],
  };
}

export const SOURCED_SEEDS_IPHONE_17E: FlagshipDeviceSeed[] = [iphone17e(256), iphone17e(512)];
