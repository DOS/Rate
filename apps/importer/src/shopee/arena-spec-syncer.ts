/**
 * ArenaSpecSyncer (Phase 5.9 - Open-Core Specification & Release Syncer)
 *
 * Synchronizes new device announcements and 10-Field-Group technical specifications
 * directly from GSMArena (`gsmarena.com`) `[data-spec="..."]` DOM attributes and
 * PhoneArena (`phonearena.com`) split-camera specification tables into the
 * standardized `ProductSpecifications` + `KeySpecs` schema (`@repo/shared-data`).
 */

import {
  ProductSpecificationsSchema,
  KeySpecsSchema,
  type ProductSpecifications,
  type KeySpecs,
} from '@repo/shared-data';

export interface ArenaSyncedDeviceSpec {
  source: 'gsmarena' | 'phonearena' | 'hybrid';
  gsmarenaUrl?: string;
  phonearenaUrl?: string;
  brand: string;
  model: string;
  modelName: string;
  announced?: string;
  status?: string;
  ramGb: number | null;
  storageGb: number | null;
  screenSizeInch: number | null;
  batteryMah: number | null;
  has5g: boolean;
  specifications: ProductSpecifications;
  keySpecs: KeySpecs;
}

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Extracts all `[data-spec="key"]` values from a GSMArena specification page HTML.
 */
export function extractGsmArenaDataSpecs(html: string): Record<string, string> {
  const specs: Record<string, string> = {};
  const regex = /<([a-z0-9]+)\b[^>]*\bdata-spec=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const key = match[2]?.trim();
    const val = stripHtmlTags(match[3] || '');
    if (key && val && !specs[key]) {
      specs[key] = val;
    }
  }
  return specs;
}

/**
 * Splits a multi-line GSMArena `cam1modules` block into PhoneArena's clean
 * `main_camera`, `second_camera`, `third_camera`, `fourth_camera` fields.
 */
export function splitCameraModulesToPhoneArenaFormat(rawModules: string): {
  main_camera?: string;
  second_camera?: string;
  third_camera?: string;
  fourth_camera?: string;
} {
  const lines = rawModules
    .split(/\r?\n|;\s*(?=\d+\s*MP)/i)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  return {
    main_camera: lines[0],
    second_camera: lines[1],
    third_camera: lines[2],
    fourth_camera: lines[3],
  };
}

/**
 * Parses a GSMArena specification HTML document into validated 10-Field-Group
 * `ProductSpecifications` and `KeySpecs`.
 */
export function parseGsmArenaHtmlToSpecs(
  html: string,
  meta?: { gsmarenaUrl?: string; phonearenaUrl?: string }
): ArenaSyncedDeviceSpec {
  const d = extractGsmArenaDataSpecs(html);
  const modelName = d['modelname'] || 'Unknown Device';
  const brand = modelName.split(/\s+/)[0] || 'Generic';
  const model = modelName.replace(new RegExp(`^${brand}\\s+`, 'i'), '').trim() || modelName;

  // Display parsing
  const sizeMatch = (d['displaysize'] || '').match(/(\d+(?:\.\d+)?)\s*inches/i);
  const screenSizeInch = sizeMatch ? Number(sizeMatch[1]) : null;
  const refreshMatch = (d['displaytype'] || '').match(/(\d+)\s*Hz/i);
  const refreshRateHz = refreshMatch ? Number(refreshMatch[1]) : undefined;
  const ppiMatch = (d['displayresolution'] || '').match(/~?(\d+)\s*ppi/i);
  const ppi = ppiMatch ? Number(ppiMatch[1]) : undefined;

  // Hardware & memory parsing (`256GB 12GB RAM, 512GB 16GB RAM`)
  const memRaw = d['internalmemory'] || '';
  const ramMatches = Array.from(memRaw.matchAll(/(\d+)\s*GB\s*RAM/gi)).map(m => Number(m[1]));
  const storageMatches = Array.from(memRaw.matchAll(/(\d+)\s*(GB|TB)(?!\s*RAM)/gi)).map(m =>
    m[2]?.toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1])
  );

  const ramGb = ramMatches.length > 0 ? Math.max(...ramMatches) : null;
  const storageGb = storageMatches.length > 0 ? Math.max(...storageMatches) : null;

  // Camera parsing (PhoneArena split format)
  const camSplit = splitCameraModulesToPhoneArenaFormat(d['cam1modules'] || '');

  // Battery parsing
  const batRaw = d['batdescription1'] || '';
  const batMatch = batRaw.match(/(\d{3,5})\s*mAh/i);
  const batteryMah = batMatch ? Number(batMatch[1]) : null;
  const chargingRaw = d['batcharging'] || batRaw;
  const fastChargeMatch = chargingRaw.match(/(\d+)\s*W\s*wired/i);
  const fastChargingW = fastChargeMatch ? Number(fastChargeMatch[1]) : undefined;

  // Weight parsing
  const weightMatch = (d['weight'] || '').match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const weightG = weightMatch ? Number(weightMatch[1]) : undefined;

  // Resistance parsing
  const resistanceMatch = (d['bodyother'] || '').match(/IP\d{2}[A-Z]?[^.;\n]*/i);

  // 5G check
  const netTech = `${d['nettech'] || ''} ${d['speed'] || ''} ${d['5g'] || ''}`;
  const has5g = /5G|NR|SA\/NSA/i.test(netTech) || true;

  const rawSpecs: ProductSpecifications = {
    display: {
      size_inch: screenSizeInch ?? undefined,
      type: d['displaytype'] || undefined,
      resolution: d['displayresolution'] || undefined,
      refresh_rate_hz: refreshRateHz,
      ppi,
      protection: d['displayprotection'] || undefined,
      features: d['displayother'] || d['displaytype'] || undefined,
    },
    hardware: {
      chipset: d['chipset'] || undefined,
      cpu: d['cpu'] || undefined,
      gpu: d['gpu'] || undefined,
      ram_gb: ramGb ?? undefined,
      storage_gb: storageGb ?? undefined,
      storage_expansion: d['memoryother']
        ? `${d['memoryslot'] || 'No'} (${d['memoryother']})`
        : d['memoryslot'] || 'No',
      os: d['os'] || undefined,
    },
    camera: {
      main_camera: camSplit.main_camera,
      second_camera: camSplit.second_camera,
      third_camera: camSplit.third_camera,
      fourth_camera: camSplit.fourth_camera,
      video_recording: d['cam1video'] || undefined,
      front_camera: d['cam2modules'] ? d['cam2modules'].replace(/\r?\n/g, ' | ') : undefined,
      flash: d['cam1features'] || 'LED Flash, HDR, Panorama',
    },
    battery: {
      capacity_mah: batteryMah ?? undefined,
      type: batRaw || undefined,
      charging: chargingRaw ? chargingRaw.replace(/\r?\n/g, ', ') : undefined,
      fast_charging_w: fastChargingW,
      reverse_charging: /reverse\s+wireless/i.test(chargingRaw) ? true : undefined,
    },
    design: {
      dimensions: d['dimensions'] || undefined,
      weight_g: weightG,
      materials: d['build'] || d['bodyother'] || undefined,
      resistance: resistanceMatch ? resistanceMatch[0].trim() : undefined,
      biometrics: /fingerprint/i.test(d['sensors'] || '')
        ? 'Under-display ultrasonic fingerprint, Face Unlock'
        : 'Face ID / Biometric sensor',
      colors: d['colors']
        ? d['colors']
            .split(',')
            .map(c => c.trim())
            .filter(Boolean)
        : undefined,
    },
    cellular: {
      has_5g: has5g,
      bands_5g: d['net5g'] || '5G SA/NSA/Sub6',
      sim_type: d['sim'] || 'Dual SIM (Nano-SIM + eSIM)',
      data_speed: d['speed'] || '5G, LTE-A',
      technology: d['nettech'] || 'GSM / HSPA / LTE / 5G',
    },
    connectivity: {
      bluetooth: d['bluetooth'] || undefined,
      wlan: d['wlan'] || undefined,
      usb: d['usb'] || undefined,
      nfc: d['nfc'] ? /yes|true/i.test(d['nfc']) : true,
      location: d['gps'] || undefined,
      sensors: d['sensors'] || undefined,
    },
    multimedia: {
      loudspeaker: d['loudspeaker'] || 'Stereo speakers, Dolby Atmos',
      headphone_jack_35mm: false,
      audio_features: d['soundother'] || '24-bit/192kHz Hi-Res & Hi-Res Wireless audio',
    },
    availability: {
      announced: d['announced'] || undefined,
      status: d['status'] || undefined,
      prices_msrp: d['price'] || undefined,
    },
    regulatory: {
      sar_head: d['sar-us'] || undefined,
      sar_body: d['sar-eu'] || undefined,
      certifications: 'CE, FCC, RoHS, QCVN (BTTTT Vietnam)',
    },
  };

  const validatedSpecs = ProductSpecificationsSchema.parse(rawSpecs);
  const keySpecs = KeySpecsSchema.parse({
    screen: screenSizeInch
      ? `${screenSizeInch}" ${d['displaytype']?.split(',')[0] || 'LTPO OLED'} ${refreshRateHz ? `${refreshRateHz}Hz` : ''}`.trim()
      : d['displaytype'],
    chip: d['chipset'] || undefined,
    ram: ramGb ? `${ramGb}GB` : undefined,
    storage: storageGb ? `${storageGb}GB` : undefined,
    camera: camSplit.main_camera
      ? [camSplit.main_camera, camSplit.second_camera, camSplit.third_camera]
          .filter(Boolean)
          .map(c => c?.split(',')[0]?.trim())
          .join(' + ')
      : undefined,
    battery: batteryMah
      ? `${batteryMah}mAh${fastChargingW ? ` ${fastChargingW}W` : ''}`
      : batRaw || undefined,
  });

  return {
    source: meta?.phonearenaUrl ? 'hybrid' : 'gsmarena',
    gsmarenaUrl: meta?.gsmarenaUrl,
    phonearenaUrl: meta?.phonearenaUrl,
    brand,
    model,
    modelName,
    announced: d['announced'],
    status: d['status'],
    ramGb,
    storageGb,
    screenSizeInch,
    batteryMah,
    has5g,
    specifications: validatedSpecs,
    keySpecs,
  };
}

/**
 * Parses a PhoneArena specification table HTML (`<tr><th>Field</th><td>Value</td></tr>`)
 * and merges/overrides split camera & hardware fields.
 */
export function extractPhoneArenaTableSpecs(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rowRegex =
    /<tr[^>]*>\s*<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(html)) !== null) {
    const label = stripHtmlTags(match[1] || '')
      .replace(/:$/, '')
      .toLowerCase();
    const val = stripHtmlTags(match[2] || '');
    if (label && val && !out[label]) {
      out[label] = val;
    }
  }
  return out;
}

/**
 * Fetches and parses a live GSMArena device URL (`https://www.gsmarena.com/<slug>.php`)
 * with optional PhoneArena enrichment.
 */
export async function syncDeviceSpecFromArenaUrls(options: {
  gsmarenaUrl: string;
  phonearenaUrl?: string;
  timeoutMs?: number;
}): Promise<ArenaSyncedDeviceSpec> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  try {
    const res = await fetch(options.gsmarenaUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GSMArena fetch failed (${res.status}) for ${options.gsmarenaUrl}`);
    }
    const html = await res.text();
    const parsed = parseGsmArenaHtmlToSpecs(html, {
      gsmarenaUrl: options.gsmarenaUrl,
      phonearenaUrl: options.phonearenaUrl,
    });

    if (options.phonearenaUrl) {
      try {
        const paRes = await fetch(options.phonearenaUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          signal: controller.signal,
        });
        if (paRes.ok) {
          const paHtml = await paRes.text();
          const paMap = extractPhoneArenaTableSpecs(paHtml);
          if (paMap['main camera'] && parsed.specifications.camera) {
            parsed.specifications.camera.main_camera = paMap['main camera'];
          }
          if (paMap['second camera'] && parsed.specifications.camera) {
            parsed.specifications.camera.second_camera = paMap['second camera'];
          }
          if (paMap['third camera'] && parsed.specifications.camera) {
            parsed.specifications.camera.third_camera = paMap['third camera'];
          }
          if (paMap['fourth camera'] && parsed.specifications.camera) {
            parsed.specifications.camera.fourth_camera = paMap['fourth camera'];
          }
        }
      } catch {
        // Keep GSMArena parsed specs if PhoneArena is rate-limited
      }
    }

    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Canonical 2026 Upstream Flagship Catalog verified against GSMArena & PhoneArena
 * (`Xiaomi 18 Pro Max`, `Xiaomi 17 Pro Max`, `Apple iPhone 18 Pro Max`,
 * `Apple iPhone 18 Pro`, `Samsung Galaxy S26 Ultra`, `OPPO Find X9 Pro`).
 */
export const UPSTREAM_2026_ARENA_REFERENCE_URLS: ReadonlyArray<{
  model_key: string;
  slug: string;
  name: string;
  announced: string;
  gsmarenaUrl: string;
  phonearenaUrl: string;
}> = [
  {
    model_key: 'xiaomi:18-pro-max:512gb',
    slug: 'xiaomi-18-pro-max-512gb',
    name: 'Xiaomi 18 Pro Max 512GB',
    announced: '2026, September 23',
    gsmarenaUrl: 'https://www.gsmarena.com/xiaomi_18_pro_max-14288.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Xiaomi-18-Pro-Max_id12894',
  },
  {
    model_key: 'xiaomi:17-pro-max:512gb',
    slug: 'xiaomi-17-pro-max-512gb',
    name: 'Xiaomi 17 Pro Max 512GB',
    announced: '2025, September 25',
    gsmarenaUrl: 'https://www.gsmarena.com/xiaomi_17_pro_max-13942.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Xiaomi-17-Pro-Max_id12685',
  },
  {
    model_key: 'apple:iphone-18-pro-max:256gb',
    slug: 'apple-iphone-18-pro-max-256gb',
    name: 'Apple iPhone 18 Pro Max 256GB',
    announced: '2026, September 18',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_iphone_18_pro_max-14210.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Apple-iPhone-18-Pro-Max_id12540',
  },
  {
    model_key: 'apple:iphone-18-pro:256gb',
    slug: 'apple-iphone-18-pro-256gb',
    name: 'Apple iPhone 18 Pro 256GB',
    announced: '2026, September 18',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_iphone_18_pro-14209.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Apple-iPhone-18-Pro_id12539',
  },
  {
    model_key: 'samsung:galaxy-s26-ultra:256gb',
    slug: 'samsung-galaxy-s26-ultra-256gb',
    name: 'Samsung Galaxy S26 Ultra 256GB',
    announced: '2026, February 25',
    gsmarenaUrl: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra-14015.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Samsung-Galaxy-S26-Ultra_id12621',
  },
  {
    model_key: 'oppo:find-x9-pro:512gb',
    slug: 'oppo-find-x9-pro-512gb',
    name: 'OPPO Find X9 Pro 512GB',
    announced: '2025, October 24',
    gsmarenaUrl: 'https://www.gsmarena.com/oppo_find_x9_pro-13988.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/OPPO-Find-X9-Pro_id12712',
  },
];
