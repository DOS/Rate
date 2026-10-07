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
}

/**
 * Standard phone specification registry for benchmark/flagship devices
 * To enrich crawled listings with high-fidelity 10 Field Groups specs
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
  front_camera: string;
  charging_w: number;
  has_5g: boolean;
  release_date: string;
  ip_rating: string;
}> = {
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
    rear_camera: '48 MP, f/1.6 (wide, sensor-shift OIS) + 12 MP, f/2.2 (ultrawide)',
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
    rear_camera: '48 MP, f/1.6 (wide, sensor-shift OIS) + 12 MP, f/2.2 (ultrawide)',
    front_camera: '12 MP, f/1.9 (wide, PDAF) + SL 3D',
    charging_w: 25,
    has_5g: true,
    release_date: 'September 2024',
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
    rear_camera: '48 MP, f/1.6 (wide, sensor-shift OIS) + 12 MP, f/2.4 (ultrawide)',
    front_camera: '12 MP, f/1.9 (wide, PDAF) + SL 3D',
    charging_w: 20,
    has_5g: true,
    release_date: 'September 2023',
    ip_rating: 'IP68 (6m up to 30 mins)',
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
      const tokens = cleaned.split(/\s+/);
      model = tokens.slice(0, 3).join(' ');
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

    // 6. Enrich with 10 Field Groups
    const benchmark = CANONICAL_PHONE_REGISTRY[baseKey];

    const ramGb = benchmark ? benchmark.ram_gb : claimable.find((t) => t.claimed)?.value ?? null;
    const screenSize = benchmark ? benchmark.screen_size_inch : null;
    const batteryMah = benchmark ? benchmark.battery_mah : null;
    const has5g = benchmark ? benchmark.has_5g : true;

    const specifications: ProductSpecifications = {
      availability: {
        announced: benchmark?.release_date || 'Q3 2024',
        status: 'Available',
        prices_msrp: `${storageDisplay}: ${(raw.priceMin || 0).toLocaleString('vi-VN')}₫`,
      },
      design: {
        dimensions: benchmark?.dimensions || undefined,
        weight_g: benchmark?.weight_g || undefined,
        materials: brand === 'Apple' ? 'Ceramic Shield front, glass back, aluminum frame' : 'Glass front/back, metal frame',
        resistance: benchmark?.ip_rating || 'IP68 dust/water resistant',
        biometrics: brand === 'Apple' ? 'Face ID' : 'Fingerprint (under display), Face unlock',
        keys: brand === 'Apple' ? 'Action Button, Camera Control, Volume, Power' : 'Volume, Power',
        colors: colors.length > 0 ? colors : ['Tiêu chuẩn'],
      },
      display: {
        size_inch: screenSize || undefined,
        type: benchmark?.screen_type || 'OLED, HDR10',
        resolution: benchmark?.resolution || undefined,
        refresh_rate_hz: benchmark?.refresh_rate_hz || 60,
        ppi: benchmark?.screen_size_inch === 6.1 ? 460 : 460,
        protection: brand === 'Apple' ? 'Ceramic Shield (thế hệ mới nhất)' : 'Corning Gorilla Glass',
        features: 'Dynamic Island, True Tone, Wide color (P3), Haptic Touch',
      },
      hardware: {
        chipset: benchmark?.chipset || undefined,
        cpu: benchmark?.cpu || undefined,
        gpu: benchmark?.gpu || undefined,
        ram_gb: ramGb || undefined,
        storage_gb: storageGb !== null ? storageGb : undefined,
        storage_expansion: 'Không hỗ trợ thẻ nhớ',
        os: benchmark?.os || 'iOS 18',
      },
      battery: {
        capacity_mah: batteryMah || undefined,
        type: 'Li-Ion, không thể tháo rời',
        charging: 'Sạc nhanh PD, Sạc không dây MagSafe/Qi2',
        fast_charging_w: benchmark?.charging_w || 25,
        reverse_charging: false,
      },
      camera: {
        rear_setup: benchmark?.rear_camera.includes('+') ? 'Dual Camera' : 'Single Camera',
        main_camera: benchmark?.rear_camera || '48 MP',
        front_camera: benchmark?.front_camera || '12 MP',
        flash: 'True Tone Dual-LED',
        video_recording: '4K@24/25/30/60fps, 1080p@25/30/60/120/240fps, Dolby Vision HDR',
      },
      connectivity: {
        bluetooth: '5.3, A2DP, LE',
        wlan: 'Wi-Fi 7 (802.11be), dual-band, hotspot',
        usb: 'USB Type-C 2.0, DisplayPort',
        sensors: 'Face ID, gia tốc kế, con quay hồi chuyển, tiệm cận, la bàn, khí áp kế',
        location: 'GPS, GLONASS, Galileo, QZSS, BeiDou',
        nfc: true,
        other: 'Ultra Wideband (UWB), SOS vệ tinh',
      },
      cellular: {
        has_5g: has5g,
        bands_5g: 'Sub-6 GHz, mmWave',
        bands_4g: 'LTE Cat 20',
        technology: 'GSM / HSPA / LTE / 5G',
        sim_type: 'Nano-SIM + eSIM (Dual eSIM)',
        volte: true,
        vowifi: true,
      },
      multimedia: {
        loudspeaker: 'Loa kép Stereo đa chiều',
        headphone_jack_35mm: false,
        audio_features: 'Spatial Audio, Dolby Atmos',
      },
      regulatory: {
        certifications: 'CE, FCC ID, Apple Eco Standards',
        sar_head: '1.15 W/kg',
        sar_body: '1.18 W/kg',
      },
    };

    const keySpecs: KeySpecs = {
      screen: `${screenSize || 6.1}" ${benchmark?.screen_type?.split(',')[0] || 'OLED'}`,
      chip: benchmark?.chipset?.split('(')[0]?.trim() || 'A-Series / Snapdragon',
      camera: benchmark?.rear_camera ? benchmark.rear_camera.split(')')[0] + ')' : '48MP',
      battery: `${batteryMah || 3500} mAh (${benchmark?.charging_w || 25}W)`,
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
    };
  }
}
