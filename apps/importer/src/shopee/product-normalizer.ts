import type { ProductSpecifications, KeySpecs } from '@repo/shared-data';
import type { ShopeeProduct } from './shopee-scraper.js';

export interface NormalizedProductCandidate {
  brand: string;
  model: string;
  variant_name: string;
  model_key: string;
  name: string;
  slug: string;
  storage_gb: number | null; // null = unparseable from the title; identity carries ':unknown'
  needs_review: boolean; // true when identity could not be confidently derived (plan v7 §5.2)
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
}

/**
 * Standard phone specification registry for benchmark/flagship devices
 * Structured per PhoneArena 10-Field-Group taxonomy + GSMArena technical accuracy
 */
const CANONICAL_PHONE_REGISTRY: Record<string, {
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
}> = {
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
    second_camera: '12 MP, f/2.8, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
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
    second_camera: '12 MP, f/2.8, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
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
    second_camera: '12 MP, f/2.8, 120mm (periscope telephoto), 5x optical zoom, 3D sensor-shift OIS',
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
   * Normalizes raw Shopee product into canonical master product candidate
   */
  public normalize(raw: ShopeeProduct): NormalizedProductCandidate {
    const title = raw.title;

    // 1. Extract Brand
    let brand = 'Khác';
    if (/apple|iphone/i.test(title)) brand = 'Apple';
    else if (/samsung|galaxy/i.test(title)) brand = 'Samsung';
    else if (/xiaomi|redmi|poco/i.test(title)) brand = 'Xiaomi';
    else if (/oppo/i.test(title)) brand = 'OPPO';
    else if (/vivo/i.test(title)) brand = 'Vivo';
    else if (/realme/i.test(title)) brand = 'Realme';
    else if (/google|pixel/i.test(title)) brand = 'Google';
    else if (/asus|rog/i.test(title)) brand = 'Asus';

    // 2. Extract Model
    let model = '';
    if (brand === 'Apple') {
      const iphoneMatch = title.match(/iphone\s*(\d+(?:\s*(?:pro\s*max|pro|plus|mini))?)/i);
      if (iphoneMatch && iphoneMatch[1]) {
        model = `iPhone ${iphoneMatch[1].trim()}`;
      } else {
        model = 'iPhone';
      }
    } else {
      const cleaned = title.replace(new RegExp(`^(?:Điện thoại|Smartphone)?\\s*${brand}`, 'i'), '').trim();
      const rawTokens = cleaned.split(/\s+/);
      const modelTokens: string[] = [];
      for (const tok of rawTokens) {
        if (modelTokens.length >= 3) break;
        if (/^(?:\d+(?:[.,]\d+)?(?:GB|TB)|\d+\/\d+(?:GB|TB)?|RAM|ROM|Chính|Quốc|Bản|Mới|Fullbox|\(|\[|-)/i.test(tok)) {
          break;
        }
        modelTokens.push(tok);
      }
      model = modelTokens.length > 0 ? modelTokens.join(' ') : rawTokens.slice(0, 2).join(' ');
    }

    // 3. Extract Storage - RAM-aware (plan v7 §5.2, Codex-reproduced bug:
    // "Samsung Galaxy A55 8GB RAM 256GB" must be 256GB, not the first GB token).
    // Decimal separator: dot or comma (Vietnamese titles use "1,5TB").
    const sizeTokens = [...title.matchAll(/(\d+(?:[.,]\d+)?)\s*(TB|GB)/gi)].map((m) => ({
      value: parseFloat(m[1].replace(',', '.')) * (m[2].toUpperCase() === 'TB' ? 1024 : 1),
      index: m.index ?? 0,
      raw: m[0],
    }));
    // RAM-word matching (replaces per-pattern heuristics after two review
    // rounds found holes: "8GB RAM 12GB RAM", "RAM 8GB RAM 12GB", the shared
    // "RAM" in "8GB RAM 256GB", "dung luong 8GB bo nho RAM 256GB"). Rule:
    // every literal "RAM" word claims the nearest UNCLAIMED size token -
    // preferring the one BEFORE it (suffix "<size> RAM"), else the one AFTER
    // it ("RAM <size>"). Any token left unclaimed is a storage candidate.
    // A prefix claim requires adjacency: only whitespace between the token
    // and the RAM phrase. "256GB - RAM 8GB" (Codex round-4) separates the ROM
    // size with a dash - claiming 256 as RAM there would publish a wrong
    // identity, so non-adjacent tokens are left for the storage side. Phrases
    // like "bộ nhớ RAM" span their full length (Codex round-4 regression:
    // "dung lượng 8GB bộ nhớ RAM 256GB" - the phrase's own words sit between
    // 8GB and the literal RAM word, so adjacency is measured to the PHRASE
    // start and 8GB claims correctly).
    const ramPhrases = [...title.matchAll(/bộ\s*nhớ\s*RAM|dung\s*lượng\s*RAM|RAM\b/gi)].map((m) => m.index ?? 0);
    const claimable = sizeTokens.map((t) => ({ ...t, claimed: false }));
    for (const p of ramPhrases) {
      const before = [...claimable]
        .filter((t) => !t.claimed && t.index + t.raw.length <= p && /^\s*$/.test(title.slice(t.index + t.raw.length, p)))
        .sort((a, b) => b.index - a.index)[0];
      const after = [...claimable].filter((t) => !t.claimed && t.index > p).sort((a, b) => a.index - b.index)[0];
      const pick = before ?? after;
      if (pick) pick.claimed = true;
    }
    const storageCandidates = claimable.filter((t) => !t.claimed);

    // ROM/storage markers, two confidence tiers (Codex round-6): an EXPLICIT
    // "ROM"/"bộ nhớ trong" marker always wins - even when a separate RAM
    // phrase follows ("ROM 256GB RAM 8GB" = storage 256, RAM 8). The LOOSE
    // "dung lượng" marker is only trusted when not immediately followed by a
    // RAM phrase ("dung lượng 8GB RAM 256GB" / "dung lượng 8GB dung lượng RAM
    // 256GB" mean 8 is RAM, not storage).
    const romExplicit = title.match(/(?:ROM|bộ nhớ trong)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(TB|GB)/i);
    const romLoose = title.match(
      /dung lượng\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*(TB|GB)(?!\s*(?:RAM|bộ\s*nhớ\s*RAM|dung\s*lượng\s*RAM))/i
    );

    let storageGb: number | null = null;
    let storageConfident = false;
    const marker = romExplicit ?? romLoose;
    if (marker) {
      // An explicit ROM marker always wins; the loose "dung lượng" marker has
      // already been rejected when a RAM phrase follows its size.
      storageGb = parseFloat(marker[1].replace(',', '.')) * (marker[2].toUpperCase() === 'TB' ? 1024 : 1);
      storageConfident = true;
    } else if (storageCandidates.length === 1) {
      storageGb = storageCandidates[0].value;
      storageConfident = true;
    }
    // Ambiguous (multiple unclaimed tokens, no ROM anchor) or nothing found:
    // leave storageGb null -> ':unknown' identity + needs_review (never guess).
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
    const baseKey = `${slugify(brand)}:${slugify(model)}`;
    const modelKey = storageKnown ? `${baseKey}:${storageGb}gb` : `${baseKey}:unknown`;
    const storageDisplay = storageGb === null
      ? 'Không rõ dung lượng'
      : storageGb >= 1024
        ? `${storageGb / 1024}TB`
        : `${storageGb}GB`;
    const canonicalName = storageKnown ? `${brand} ${model} ${storageDisplay}` : `${brand} ${model}`;
    const slug = slugify(canonicalName);

    // 6. Enrich with 10 Field Groups (PhoneArena structure + GSMArena depth)
    const benchmark = CANONICAL_PHONE_REGISTRY[baseKey];
    const isApple = brand === 'Apple';

    const ramGb = benchmark ? benchmark.ram_gb : claimable.find((t) => t.claimed)?.value ?? null;
    const screenSize = benchmark ? benchmark.screen_size_inch : null;
    const batteryMah = benchmark ? benchmark.battery_mah : null;
    const has5g = benchmark ? benchmark.has_5g : true;

    const cameraCount = benchmark
      ? [benchmark.rear_camera, benchmark.second_camera, benchmark.third_camera, benchmark.fourth_camera].filter(Boolean).length
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
        type: benchmark?.screen_type || (isApple ? 'Super Retina XDR OLED, HDR10' : 'AMOLED, 120Hz, HDR10+'),
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
        charging: isApple
          ? 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2'
          : 'Sạc nhanh USB-C PD/PPS',
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
      chip: benchmark?.chipset?.split('(')[0]?.trim() || (isApple ? 'Apple A-Series' : 'Snapdragon / Dimensity'),
      camera: benchmark?.rear_camera ? benchmark.rear_camera.split(',')[0] : '50 MP OIS',
      battery: `${batteryMah || (isApple ? 3561 : 5000)} mAh (${benchmark?.charging_w || (isApple ? 25 : 45)}W)`,
      storage: storageDisplay,
      ram: ramGb ? `${ramGb}GB` : undefined,
    };

    return {
      brand,
      model,
      variant_name: storageDisplay,
      model_key: modelKey,
      name: canonicalName,
      slug,
      storage_gb: storageKnown ? storageGb : null,
      needs_review: !storageConfident,
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
    };
  }
}
