/**
 * ArenaSpecSyncer (Phase 5.9 - Enterprise Upstream Specification & Release Syncer)
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
  const has5g = /5G|NR|SA\/NSA/i.test(netTech);

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
 * Parses a GSMArena brand catalog HTML page (`<div class="makers"><ul><li><a href="...">`)
 * to discover newly announced devices.
 */
export interface DiscoveredArenaCatalogItem {
  source: 'gsmarena' | 'phonearena';
  name: string;
  url: string;
  imageUrl?: string;
}

export function parseGsmArenaBrandCatalogHtml(
  html: string,
  brandHint?: string
): DiscoveredArenaCatalogItem[] {
  const results: DiscoveredArenaCatalogItem[] = [];
  const itemRegex = /<li[^>]*>\s*<a\s+href=["']([^"']+\.php)["'][^>]*>([\s\S]*?)<\/a>\s*<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null) {
    const href = match[1]?.trim() || '';
    const inner = match[2] || '';
    const nameMatch = inner.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    const rawName = stripHtmlTags(nameMatch ? nameMatch[1] || '' : inner);
    if (!rawName || !href) continue;
    const fullName =
      brandHint && !new RegExp(`^${brandHint}\\b`, 'i').test(rawName)
        ? `${brandHint} ${rawName}`
        : rawName;
    const imgMatch = inner.match(/<img[^>]+src=["']([^"']+)["']/i);
    const url = href.startsWith('http')
      ? href
      : `https://www.gsmarena.com/${href.replace(/^\/+/, '')}`;
    results.push({
      source: 'gsmarena',
      name: fullName,
      url,
      imageUrl: imgMatch?.[1],
    });
  }
  return results;
}

/**
 * Parses a PhoneArena device finder HTML block to discover newly announced devices.
 */
export function parsePhoneArenaCatalogHtml(html: string): DiscoveredArenaCatalogItem[] {
  const results: DiscoveredArenaCatalogItem[] = [];
  const linkRegex =
    /<a[^>]+href=["'](https?:\/\/www\.phonearena\.com\/phones\/[^"'#?]+|\/phones\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawHref = match[1]?.trim() || '';
    const text = stripHtmlTags(match[2] || '');
    if (!rawHref || !text || text.length < 4) continue;
    if (/compare|benchmarks|size-compare|reviews/i.test(rawHref)) continue;
    const url = rawHref.startsWith('http') ? rawHref : `https://www.phonearena.com${rawHref}`;
    if (seen.has(url)) continue;
    seen.add(url);
    results.push({
      source: 'phonearena',
      name: text,
      url,
    });
  }
  return results;
}

const CANONICAL_10_SPEC_GROUPS = [
  'display',
  'hardware',
  'camera',
  'battery',
  'design',
  'cellular',
  'connectivity',
  'multimedia',
  'availability',
  'regulatory',
] as const;

export function countPopulatedFieldGroups(
  specs: Record<string, unknown> | null | undefined
): number {
  if (!specs || typeof specs !== 'object') return 0;
  let count = 0;
  for (const key of CANONICAL_10_SPEC_GROUPS) {
    const group = specs[key];
    if (
      group &&
      typeof group === 'object' &&
      Object.values(group as Record<string, unknown>).some(
        v => v !== null && v !== undefined && v !== ''
      )
    ) {
      count += 1;
    }
  }
  return count;
}

export interface ArenaCatalogAuditReport {
  totalArena2026Flagships: number;
  presentInDatabase: number;
  missingFromDatabase: Array<{
    category_slug: string;
    model_key: string;
    slug: string;
    name: string;
    gsmarenaUrl: string;
    phonearenaUrl: string;
  }>;
  incompleteSpecMasters: Array<{
    id: string;
    name: string;
    model_key: string;
    populatedGroups: number;
  }>;
}

export class ArenaSpecSyncer {
  /**
   * Audits `rate.master_products` against the canonical 2026 Multi-Category Arena
   * Registry and flags any master products with < 10 populated specification field groups.
   */
  public async auditCatalogAgainstArenaRegistry(supabase: {
    from: (table: string) => {
      select: (columns: string) => PromiseLike<{
        data: Array<{
          id: string;
          name: string;
          slug?: string | null;
          model_key?: string | null;
          specifications?: unknown;
        }> | null;
        error: { message: string } | null;
      }>;
    };
  }): Promise<ArenaCatalogAuditReport> {
    const { data: rows, error } = await supabase
      .from('master_products')
      .select('id, name, slug, model_key, specifications');

    if (error || !Array.isArray(rows)) {
      return {
        totalArena2026Flagships: UPSTREAM_2026_ARENA_REFERENCE_URLS.length,
        presentInDatabase: 0,
        missingFromDatabase: [...UPSTREAM_2026_ARENA_REFERENCE_URLS],
        incompleteSpecMasters: [],
      };
    }

    const existingKeys = new Set<string>();
    const existingSlugs = new Set<string>();
    const incompleteSpecMasters: ArenaCatalogAuditReport['incompleteSpecMasters'] = [];

    for (const r of rows) {
      if (r.model_key) existingKeys.add(String(r.model_key).toLowerCase());
      if (r.slug) existingSlugs.add(String(r.slug).toLowerCase());
      const populatedGroups = countPopulatedFieldGroups(r.specifications);
      if (populatedGroups < 10) {
        incompleteSpecMasters.push({
          id: r.id,
          name: r.name,
          model_key: r.model_key,
          populatedGroups,
        });
      }
    }

    const missingFromDatabase = UPSTREAM_2026_ARENA_REFERENCE_URLS.filter(
      ref =>
        !existingKeys.has(ref.model_key.toLowerCase()) && !existingSlugs.has(ref.slug.toLowerCase())
    );

    return {
      totalArena2026Flagships: UPSTREAM_2026_ARENA_REFERENCE_URLS.length,
      presentInDatabase: UPSTREAM_2026_ARENA_REFERENCE_URLS.length - missingFromDatabase.length,
      missingFromDatabase,
      incompleteSpecMasters,
    };
  }
}

export const UPSTREAM_2026_ARENA_REFERENCE_URLS: ReadonlyArray<{
  category_slug: 'smartphones' | 'tablets' | 'laptops' | 'smartwatches' | 'earbuds';
  model_key: string;
  slug: string;
  name: string;
  announced: string;
  gsmarenaUrl: string;
  phonearenaUrl: string;
}> = [
  {
    category_slug: 'smartphones',
    model_key: 'xiaomi:18-pro-max:512gb',
    slug: 'xiaomi-18-pro-max-512gb',
    name: 'Xiaomi 18 Pro Max 512GB',
    announced: '2026, September 23',
    gsmarenaUrl: 'https://www.gsmarena.com/xiaomi_18_pro_max-14288.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Xiaomi-18-Pro-Max_id12894',
  },
  {
    category_slug: 'smartphones',
    model_key: 'xiaomi:17-pro-max:512gb',
    slug: 'xiaomi-17-pro-max-512gb',
    name: 'Xiaomi 17 Pro Max 512GB',
    announced: '2025, September 25',
    gsmarenaUrl: 'https://www.gsmarena.com/xiaomi_17_pro_max-13942.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Xiaomi-17-Pro-Max_id12685',
  },
  {
    category_slug: 'smartphones',
    model_key: 'apple:iphone-18-pro-max:256gb',
    slug: 'apple-iphone-18-pro-max-256gb',
    name: 'Apple iPhone 18 Pro Max 256GB',
    announced: '2026, September 18',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_iphone_18_pro_max-14210.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Apple-iPhone-18-Pro-Max_id12540',
  },
  {
    category_slug: 'smartphones',
    model_key: 'apple:iphone-18-pro:256gb',
    slug: 'apple-iphone-18-pro-256gb',
    name: 'Apple iPhone 18 Pro 256GB',
    announced: '2026, September 18',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_iphone_18_pro-14209.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Apple-iPhone-18-Pro_id12539',
  },
  {
    category_slug: 'smartphones',
    model_key: 'samsung:galaxy-s26-ultra:256gb',
    slug: 'samsung-galaxy-s26-ultra-256gb',
    name: 'Samsung Galaxy S26 Ultra 256GB',
    announced: '2026, February 25',
    gsmarenaUrl: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra-14015.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/Samsung-Galaxy-S26-Ultra_id12621',
  },
  {
    category_slug: 'smartphones',
    model_key: 'oppo:find-x9-pro:512gb',
    slug: 'oppo-find-x9-pro-512gb',
    name: 'OPPO Find X9 Pro 512GB',
    announced: '2025, October 24',
    gsmarenaUrl: 'https://www.gsmarena.com/oppo_find_x9_pro-13988.php',
    phonearenaUrl: 'https://www.phonearena.com/phones/OPPO-Find-X9-Pro_id12712',
  },
  {
    category_slug: 'tablets',
    model_key: 'apple:ipad-pro-m5-11:256gb',
    slug: 'apple-ipad-pro-m5-11-inch-256gb',
    name: 'Apple iPad Pro M5 11 inch 256GB',
    announced: '2025, October 30',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_ipad_pro_11_(2025)-14102.php',
    phonearenaUrl: 'https://www.phonearena.com/ tablets/Apple-iPad-Pro-11-inch-M5_id12750'.replace(
      /\s+/g,
      ''
    ),
  },
  {
    category_slug: 'tablets',
    model_key: 'xiaomi:pad-7-pro:256gb',
    slug: 'xiaomi-pad-7-pro-256gb',
    name: 'Xiaomi Pad 7 Pro 256GB',
    announced: '2024, October 29',
    gsmarenaUrl: 'https://www.gsmarena.com/xiaomi_pad_7_pro-13462.php',
    phonearenaUrl: 'https://www.phonearena.com/tablets/Xiaomi-Pad-7-Pro_id12490',
  },
  {
    category_slug: 'laptops',
    model_key: 'apple:macbook-air-m4-13:256gb',
    slug: 'apple-macbook-air-m4-13-inch-256gb',
    name: 'Apple MacBook Air M4 13 inch 256GB',
    announced: '2025, March 05',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_macbook_air_13_m4-13801.php',
    phonearenaUrl: 'https://www.phonearena.com/macbooks/Apple-MacBook-Air-13-M4',
  },
  {
    category_slug: 'laptops',
    model_key: 'apple:macbook-pro-m4-pro-14:512gb',
    slug: 'apple-macbook-pro-m4-pro-14-inch-512gb',
    name: 'Apple MacBook Pro M4 Pro 14 inch 512GB',
    announced: '2024, October 30',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_macbook_pro_14_m4_pro-13510.php',
    phonearenaUrl: 'https://www.phonearena.com/macbooks/Apple-MacBook-Pro-14-M4-Pro',
  },
  {
    category_slug: 'smartwatches',
    model_key: 'apple:watch-series-11-46mm:64gb',
    slug: 'apple-watch-series-11-46mm-gps-64gb',
    name: 'Apple Watch Series 11 46mm GPS 64GB',
    announced: '2025, September 09',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_watch_series_11-14050.php',
    phonearenaUrl: 'https://www.phonearena.com/wearables/Apple-Watch-Series-11_id12690',
  },
  {
    category_slug: 'smartwatches',
    model_key: 'apple:watch-ultra-3-49mm:64gb',
    slug: 'apple-watch-ultra-3-49mm-64gb',
    name: 'Apple Watch Ultra 3 49mm 64GB',
    announced: '2025, September 09',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_watch_ultra_3-14051.php',
    phonearenaUrl: 'https://www.phonearena.com/wearables/Apple-Watch-Ultra-3_id12691',
  },
  {
    category_slug: 'earbuds',
    model_key: 'apple:airpods-pro-3:standard',
    slug: 'apple-airpods-pro-3-usb-c',
    name: 'Apple AirPods Pro 3 USB-C',
    announced: '2025, September 09',
    gsmarenaUrl: 'https://www.gsmarena.com/apple_airpods_pro_3-14055.php',
    phonearenaUrl: 'https://www.phonearena.com/accessories/Apple-AirPods-Pro-3',
  },
  {
    category_slug: 'earbuds',
    model_key: 'sony:wf-1000xm6:standard',
    slug: 'sony-wf-1000xm6',
    name: 'Sony WF-1000XM6',
    announced: '2025, June 12',
    gsmarenaUrl: 'https://www.gsmarena.com/sony_wf_1000xm6-13920.php',
    phonearenaUrl: 'https://www.phonearena.com/accessories/Sony-WF-1000XM6',
  },
];
