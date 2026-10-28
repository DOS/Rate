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
import { isItemKey, splitModelKey } from '@repo/shared-data';
import { mergeProductSpecifications } from './ai-spec-enricher.js';
import { resolveItemModelMode, type ItemModelMode } from './item-model-flag.js';
import {
  mergeKeySpecs,
  withoutVariantKeySpecs,
  withoutVariantSpecs,
} from './jobs/backfill-specs.js';
import { fetchAllPages } from './paging.js';
import type { RateSupabaseClient } from './types.js';

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
  /** null when the page states no network technology (DOS/Rate#1196). */
  has5g: boolean | null;
  /**
   * The storage sizes the page lists, each with its RAM when the page pairs exactly one
   * RAM with it (`256GB 12GB RAM, 512GB 16GB RAM`). Variant overrides (DOS/Rate#1213).
   */
  memoryVariants?: ArenaMemoryVariant[];
  specifications: ProductSpecifications;
  keySpecs: KeySpecs;
}

export interface ArenaMemoryVariant {
  storageGb: number;
  ramGb: number | null;
}

const ARENA_STORAGE_REGEX = /(\d+(?:\.\d+)?)\s*(GB|TB)(?!\s*RAM)/gi;
// A RAM group, including the slash form of several options (`8GB/12GB RAM`, `8/12GB RAM`).
const ARENA_RAM_GROUP_REGEX =
  /\d+(?:\.\d+)?(?:\s*GB)?(?:\s*\/\s*\d+(?:\.\d+)?(?:\s*GB)?)*\s*GB\s*RAM/gi;

/**
 * Splits a memory line (`128GB 8GB RAM, 256GB 8GB RAM, 256GB 12GB RAM`) into storage
 * sizes in ascending order. A size whose entries name more than one RAM, or none, gets
 * `ramGb: null`: the RAM of that variant is not known from the page.
 */
export function parseArenaMemoryVariants(memRaw: string): ArenaMemoryVariant[] {
  if (typeof memRaw !== 'string' || !memRaw.trim()) return [];
  const ramsByStorage = new Map<number, Set<number | null>>();
  for (const segment of memRaw.slice(0, 2000).split(/[,;\n]/)) {
    // Every RAM figure of the segment; its numbers are never read as storage.
    const rams = new Set<number>();
    for (const group of segment.match(ARENA_RAM_GROUP_REGEX) ?? []) {
      for (const n of group.match(/\d+(?:\.\d+)?/g) ?? []) rams.add(Number(n));
    }
    const ramValues = [...rams];
    const ram =
      ramValues.length === 1 && Number.isInteger(ramValues[0]) && ramValues[0]! >= 1
        ? ramValues[0]! <= 2048
          ? ramValues[0]!
          : null
        : null;
    const storageText = segment.replace(ARENA_RAM_GROUP_REGEX, ' ');
    for (const m of storageText.matchAll(ARENA_STORAGE_REGEX)) {
      const val = m[2]?.toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1]);
      if (!Number.isInteger(val) || val < 1 || val > 65536) continue;
      const set = ramsByStorage.get(val) ?? new Set<number | null>();
      set.add(ram);
      ramsByStorage.set(val, set);
    }
  }
  return [...ramsByStorage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([storageGb, rams]) => {
      const only = rams.size === 1 ? [...rams][0] : null;
      return { storageGb, ramGb: only ?? null };
    });
}

const NAMED_ARENA_ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&#039;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&ndash;': '-',
  '&mdash;': '-',
  '&times;': 'x',
  '&deg;': '°',
  '&micro;': 'µ',
};

function decodeArenaHtmlEntities(raw: string): string {
  return raw
    .replace(
      /&(?:nbsp|amp|quot|apos|#0?39|lt|gt|ndash|mdash|times|deg|micro);/gi,
      m => NAMED_ARENA_ENTITIES[m.toLowerCase()] ?? m
    )
    .replace(/&#(x[0-9a-fA-F]{1,6}|\d{1,7});/g, (full, code: string) => {
      const cp =
        code.startsWith('x') || code.startsWith('X')
          ? Number.parseInt(code.slice(1), 16)
          : Number.parseInt(code, 10);
      if (!Number.isFinite(cp) || cp < 0x20 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        return full;
      }
      return String.fromCodePoint(cp);
    });
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toBoundedNumber(
  raw: number | null | undefined,
  min: number,
  max: number,
  integer = false
): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const val = integer ? Math.round(raw) : raw;
  if (val < min || val > max) return undefined;
  return val;
}

export const MAX_ARENA_HTML_LENGTH = 2_000_000;
export const MAX_ARENA_CATALOG_ITEMS = 500;

function normalizeArenaUrl(
  rawUrl: string | undefined,
  hostPattern: RegExp,
  baseOrigin?: string
): string | undefined {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed || trimmed.length > 2048 || /\p{Cc}/u.test(trimmed) || /\s/.test(trimmed)) {
    return undefined;
  }
  try {
    const parsed = baseOrigin ? new URL(trimmed, baseOrigin) : new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      Boolean(parsed.username || parsed.password) ||
      (parsed.port !== '' && parsed.port !== '80' && parsed.port !== '443') ||
      !hostname ||
      hostname.startsWith('.') ||
      hostname.endsWith('.') ||
      hostname.includes('..') ||
      !hostPattern.test(hostname)
    ) {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}

function stripHtmlTags(raw: string): string {
  return decodeArenaHtmlEntities(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^<>]+>/g, ' '))
    .replace(/(?:(?!\n)\p{Cc})+/gu, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Extracts all `[data-spec="key"]` values from a GSMArena specification page HTML.
 */
export function extractGsmArenaDataSpecs(html: string): Record<string, string> {
  if (typeof html !== 'string' || !html) return {};
  const safeHtml =
    html.length > MAX_ARENA_HTML_LENGTH ? html.slice(0, MAX_ARENA_HTML_LENGTH) : html;
  const specs: Record<string, string> = {};
  // Scan opening tags, then search for the matching close from there. A single
  // regex with `[^>]*\bdata-spec=` and a lazy body backtracks polynomially on
  // hostile pages (CodeQL js/polynomial-redos).
  const openTag = /<([a-z0-9]+)\b([^<>]*)>/gi;
  // Index every close tag once (offsets into the original string, so case
  // folding cannot shift them). Openings are visited left to right, so a
  // per-tag cursor finds the first close after each opening in amortized
  // constant time and the whole scan stays linear.
  const closesByTag = new Map<string, { at: number; end: number }[]>();
  for (const close of safeHtml.matchAll(/<\/([a-z0-9]+)>/gi)) {
    const tag = close[1].toLowerCase();
    const list = closesByTag.get(tag) ?? [];
    const at = close.index ?? 0;
    list.push({ at, end: at + close[0].length });
    closesByTag.set(tag, list);
  }
  const cursors = new Map<string, number>();
  let specCount = 0;
  let match: RegExpExecArray | null;
  while (specCount < 500 && (match = openTag.exec(safeHtml)) !== null) {
    const keyMatch = /\bdata-spec=["']([^"']+)["']/i.exec(match[2] || '');
    if (!keyMatch) continue;
    const tag = match[1].toLowerCase();
    const list = closesByTag.get(tag);
    if (!list) continue;
    let cursor = cursors.get(tag) ?? 0;
    while (cursor < list.length && list[cursor].at < openTag.lastIndex) cursor++;
    cursors.set(tag, cursor);
    const close = list[cursor];
    if (!close) continue;
    const key = keyMatch[1]
      ?.replace(/\p{Cc}+/gu, '')
      .trim()
      .slice(0, 120);
    const val = stripHtmlTags(safeHtml.slice(openTag.lastIndex, close.at)).slice(0, 4000);
    if (
      key &&
      val &&
      /[a-z0-9]/i.test(key) &&
      !/^(?:__proto__|constructor|prototype)$/i.test(key) &&
      !Object.hasOwn(specs, key)
    ) {
      specs[key] = val;
      specCount += 1;
    }
    openTag.lastIndex = close.end;
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
  if (typeof rawModules !== 'string' || !rawModules) {
    return {};
  }
  const lines = rawModules
    .split(/\r?\n|;\s*(?=\d+\s*MP)/i)
    .map(l =>
      l
        .replace(/\p{Cc}+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500)
    )
    .filter(l => l.length > 0);

  return {
    main_camera: lines[0],
    second_camera: lines[1],
    third_camera: lines[2],
    fourth_camera: lines[3],
  };
}

/**
 * Parses a GSMArena specification HTML document (and optional PhoneArena table HTML)
 * into validated 10-Field-Group `ProductSpecifications` and `KeySpecs`.
 */
export function parseGsmArenaHtmlToSpecs(
  html: string,
  meta?: { gsmarenaUrl?: string; phonearenaUrl?: string; phonearenaHtml?: string }
): ArenaSyncedDeviceSpec {
  const safeMeta = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : undefined;
  const d = extractGsmArenaDataSpecs(html);
  const pa =
    typeof safeMeta?.phonearenaHtml === 'string' && safeMeta.phonearenaHtml
      ? extractPhoneArenaTableSpecs(safeMeta.phonearenaHtml)
      : {};
  const rawModelName = (d['modelname'] || pa['device name'] || 'Unknown Device')
    .replace(/\s+/g, ' ')
    .trim();
  const modelName = (rawModelName || 'Unknown Device').slice(0, 200).trim();
  const brand = (modelName.split(/\s+/)[0] || 'Generic').slice(0, 80);
  const model = (
    modelName.replace(new RegExp(`^${escapeRegExp(brand)}\\s+`, 'i'), '').trim() || modelName
  )
    .slice(0, 160)
    .trim();

  // Display parsing
  const sizeMatch = (d['displaysize'] || pa['screen size'] || '').match(
    /(\d+(?:\.\d+)?)\s*(?:inches|inch|in\b|")/i
  );
  const screenSizeInch = toBoundedNumber(sizeMatch ? Number(sizeMatch[1]) : null, 0.5, 120) ?? null;
  const refreshMatch = (d['displaytype'] || pa['refresh rate'] || '').match(/(\d+)\s*Hz/i);
  const refreshRateHz = toBoundedNumber(
    refreshMatch ? Number(refreshMatch[1]) : null,
    1,
    1000,
    true
  );
  const ppiMatch = (d['displayresolution'] || pa['pixel density'] || '').match(/~?(\d+)\s*ppi/i);
  const ppi = toBoundedNumber(ppiMatch ? Number(ppiMatch[1]) : null, 10, 2000, true);

  // Hardware & memory parsing (`256GB 12GB RAM, 512GB 16GB RAM`)
  const memRaw = d['internalmemory'] || `${pa['internal storage'] || ''} ${pa['ram'] || ''}`.trim();
  const ramMatches = Array.from(memRaw.matchAll(/(\d+(?:\.\d+)?)\s*GB\s*RAM/gi))
    .map(m => {
      const val = Number(m[1]);
      return Number.isInteger(val) ? toBoundedNumber(val, 1, 2048, true) : undefined;
    })
    .filter((v): v is number => v !== undefined);
  const storageMatches = Array.from(memRaw.matchAll(/(\d+(?:\.\d+)?)\s*(GB|TB)(?!\s*RAM)/gi))
    .map(m => {
      const val = m[2]?.toUpperCase() === 'TB' ? Number(m[1]) * 1024 : Number(m[1]);
      return Number.isInteger(val) ? toBoundedNumber(val, 1, 65536, true) : undefined;
    })
    .filter((v): v is number => v !== undefined);

  const ramGb = ramMatches.length > 0 ? Math.max(...ramMatches) : null;
  const storageGb = storageMatches.length > 0 ? Math.max(...storageMatches) : null;

  // Camera parsing (PhoneArena split format + PhoneArena table overrides)
  const camSplitRaw = splitCameraModulesToPhoneArenaFormat(d['cam1modules'] || '');
  const camSplit = {
    main_camera: pa['main camera'] || camSplitRaw.main_camera,
    second_camera: pa['second camera'] || pa['ultra-wide camera'] || camSplitRaw.second_camera,
    third_camera: pa['third camera'] || pa['telephoto camera'] || camSplitRaw.third_camera,
    fourth_camera: pa['fourth camera'] || pa['periscope camera'] || camSplitRaw.fourth_camera,
  };

  // Battery parsing
  const batRaw = d['batdescription1'] || pa['capacity'] || '';
  const batMatch = batRaw.match(/(\d{2,6})\s*mAh/i);
  const batteryMah =
    toBoundedNumber(batMatch ? Number(batMatch[1]) : null, 10, 200000, true) ?? null;
  const chargingRaw = d['batcharging'] || pa['charging'] || batRaw;
  const fastChargeMatch =
    chargingRaw.match(/(\d+(?:\.\d+)?)\s*W\s*wired/i) ||
    chargingRaw.match(/(\d+(?:\.\d+)?)\s*W\b/i);
  const fastChargingW = toBoundedNumber(
    fastChargeMatch ? Number(fastChargeMatch[1]) : null,
    1,
    1000
  );

  // Weight parsing
  const weightMatch = (d['weight'] || pa['weight'] || '').match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const weightG = toBoundedNumber(weightMatch ? Number(weightMatch[1]) : null, 1, 25000);

  // Resistance parsing
  const resistanceMatch = (d['bodyother'] || pa['water resistance'] || '').match(
    /IP\d{2}[A-Z]?[^.;\n]*/i
  );

  // 5G check: a page with no network fields says nothing about 5G (DOS/Rate#1196).
  const netTech = `${d['nettech'] || ''} ${d['speed'] || ''} ${d['5g'] || ''} ${d['net5g'] || ''}`;
  const has5g: boolean | null = netTech.trim() ? /5G|NR|SA\/NSA/i.test(netTech) : null;

  // 3.5mm headphone jack check
  const jackRaw = d['jack'] || d['3.5mm jack'] || pa['headphones'] || '';
  const has35mmJack = jackRaw ? /^yes\b|3\.5\s*mm\s*jack/i.test(jackRaw.trim()) : false;

  const colorsRaw = d['colors'] || pa['colors'] || '';
  const parsedColors = colorsRaw
    ? Array.from(
        new Set(
          colorsRaw
            .split(',')
            .map(c => c.trim().slice(0, 80))
            .filter(Boolean)
        )
      ).slice(0, 50)
    : [];
  const nfcRaw = d['nfc'] || pa['nfc'] || '';
  const capSpec = (val: string | undefined): string | undefined => {
    if (!val) return undefined;
    const trimmed = val.trim().slice(0, 500);
    return trimmed || undefined;
  };
  const capKeySpec = (val: string | undefined): string | undefined => {
    if (!val) return undefined;
    const trimmed = val.trim().slice(0, 200);
    return trimmed || undefined;
  };

  const rawSpecs: ProductSpecifications = {
    display: {
      size_inch: screenSizeInch ?? undefined,
      type: capSpec(d['displaytype'] || pa['display type']),
      resolution: capSpec(d['displayresolution'] || pa['resolution']),
      refresh_rate_hz: refreshRateHz,
      ppi,
      protection: capSpec(d['displayprotection']),
      features: capSpec(d['displayother'] || d['displaytype']),
    },
    hardware: {
      chipset: capSpec(d['chipset'] || pa['system chip']),
      cpu: capSpec(d['cpu'] || pa['processor']),
      gpu: capSpec(d['gpu'] || pa['gpu']),
      ram_gb: ramGb ?? undefined,
      storage_gb: storageGb ?? undefined,
      storage_expansion: capSpec(
        d['memoryother']
          ? `${d['memoryslot'] || 'No'} (${d['memoryother']})`
          : d['memoryslot'] || 'No'
      ),
      os: capSpec(d['os'] || pa['os']),
    },
    camera: {
      main_camera: capSpec(camSplit.main_camera),
      second_camera: capSpec(camSplit.second_camera),
      third_camera: capSpec(camSplit.third_camera),
      fourth_camera: capSpec(camSplit.fourth_camera),
      video_recording: capSpec(d['cam1video'] || pa['video recording']),
      front_camera: capSpec(
        d['cam2modules'] ? d['cam2modules'].replace(/\r?\n/g, ' | ') : pa['front camera']
      ),
      flash: capSpec(d['cam1features'] || 'LED Flash, HDR, Panorama'),
    },
    battery: {
      capacity_mah: batteryMah ?? undefined,
      type: capSpec(batRaw),
      charging: capSpec(chargingRaw ? chargingRaw.replace(/\r?\n/g, ', ') : undefined),
      fast_charging_w: fastChargingW,
      reverse_charging: /reverse\s+wireless/i.test(chargingRaw) ? true : undefined,
    },
    design: {
      dimensions: capSpec(d['dimensions'] || pa['dimensions']),
      weight_g: weightG,
      materials: capSpec(d['build'] || d['bodyother']),
      resistance: capSpec(resistanceMatch ? resistanceMatch[0].trim() : undefined),
      biometrics: /fingerprint/i.test(d['sensors'] || pa['biometrics'] || '')
        ? 'Under-display ultrasonic fingerprint, Face Unlock'
        : 'Face ID / Biometric sensor',
      colors: parsedColors.length > 0 ? parsedColors : undefined,
    },
    // An unknown 5G invents no cellular defaults: only what the page states.
    cellular:
      has5g === null
        ? {
            bands_5g: capSpec(d['net5g']),
            sim_type: capSpec(d['sim']),
            data_speed: capSpec(d['speed']),
            technology: capSpec(d['nettech']),
          }
        : {
            has_5g: has5g,
            bands_5g: capSpec(has5g ? d['net5g'] || '5G SA/NSA/Sub6' : d['net5g']),
            sim_type: capSpec(
              d['sim'] || (has5g ? 'Dual SIM (Nano-SIM + eSIM)' : 'No cellular connectivity')
            ),
            data_speed: capSpec(d['speed'] || (has5g ? '5G, LTE-A' : 'Wi-Fi Only')),
            technology: capSpec(
              d['nettech'] || (has5g ? 'GSM / HSPA / LTE / 5G' : 'No cellular connectivity')
            ),
          },
    connectivity: {
      bluetooth: capSpec(d['bluetooth'] || pa['bluetooth']),
      wlan: capSpec(d['wlan'] || pa['wi-fi']),
      usb: capSpec(d['usb'] || pa['usb']),
      nfc: nfcRaw ? /yes|true|nfc/i.test(nfcRaw) && !/^no\b/i.test(nfcRaw.trim()) : true,
      location: capSpec(d['gps']),
      sensors: capSpec(d['sensors']),
    },
    multimedia: {
      loudspeaker: capSpec(d['loudspeaker'] || 'Stereo speakers, Dolby Atmos'),
      headphone_jack_35mm: has35mmJack,
      audio_features: capSpec(d['soundother'] || '24-bit/192kHz Hi-Res & Hi-Res Wireless audio'),
    },
    availability: {
      announced: capSpec(d['announced']),
      status: capSpec(d['status']),
      prices_msrp: capSpec(d['price']),
    },
    regulatory: {
      sar_head: capSpec(d['sar-us']),
      sar_body: capSpec(d['sar-eu']),
      certifications: 'CE, FCC, RoHS, QCVN (BTTTT Vietnam)',
    },
  };

  const validatedSpecs = ProductSpecificationsSchema.parse(rawSpecs);
  const keySpecs = KeySpecsSchema.parse({
    screen: capKeySpec(
      screenSizeInch
        ? `${screenSizeInch}" ${d['displaytype']?.split(',')[0] || 'LTPO OLED'} ${refreshRateHz ? `${refreshRateHz}Hz` : ''}`
        : d['displaytype']
    ),
    chip: capKeySpec(d['chipset'] || pa['system chip']),
    ram: ramGb ? `${ramGb}GB` : undefined,
    storage: storageGb
      ? storageGb >= 1024 && storageGb % 512 === 0
        ? `${storageGb / 1024}TB`
        : `${storageGb}GB`
      : undefined,
    camera: capKeySpec(
      camSplit.main_camera
        ? [camSplit.main_camera, camSplit.second_camera, camSplit.third_camera]
            .filter(Boolean)
            .map(c => c?.split(',')[0]?.trim())
            .join(' + ')
        : undefined
    ),
    battery: capKeySpec(
      batteryMah ? `${batteryMah}mAh${fastChargingW ? ` ${fastChargingW}W` : ''}` : batRaw
    ),
  });

  const gsmarenaUrl = normalizeArenaUrl(safeMeta?.gsmarenaUrl, /(?:^|\.)gsmarena\.com$/i);
  const phonearenaUrl = normalizeArenaUrl(safeMeta?.phonearenaUrl, /(?:^|\.)phonearena\.com$/i);

  return {
    source:
      phonearenaUrl || (typeof safeMeta?.phonearenaHtml === 'string' && safeMeta.phonearenaHtml)
        ? 'hybrid'
        : 'gsmarena',
    gsmarenaUrl,
    phonearenaUrl,
    brand,
    model,
    modelName,
    announced: capSpec(d['announced']?.replace(/\s+/g, ' ')),
    status: capSpec(d['status']?.replace(/\s+/g, ' ')),
    ramGb,
    storageGb,
    screenSizeInch,
    batteryMah,
    has5g,
    // GSMArena's memory line only: PhoneArena's RAM field carries no "RAM" word.
    memoryVariants: parseArenaMemoryVariants(d['internalmemory'] || ''),
    specifications: validatedSpecs,
    keySpecs,
  };
}

/**
 * Parses a PhoneArena specification table HTML (`<tr><th>Field</th><td>Value</td></tr>`)
 * and merges/overrides split camera & hardware fields.
 */
export function extractPhoneArenaTableSpecs(html: string): Record<string, string> {
  if (typeof html !== 'string' || !html) return {};
  const safeHtml =
    html.length > MAX_ARENA_HTML_LENGTH ? html.slice(0, MAX_ARENA_HTML_LENGTH) : html;
  const out: Record<string, string> = {};
  // Cell bodies cannot contain another tr/th/td tag, so each attempt stops at
  // the next cell instead of rescanning the rest of the page (polynomial-redos).
  const rowRegex =
    /<tr[^<>]*>\s*<(?:th|td)[^<>]*>((?:(?!<\/?t[rhd]\b)[\s\S])*)<\/(?:th|td)>\s*<td[^<>]*>((?:(?!<\/?t[rhd]\b)[\s\S])*)<\/td>\s*<\/tr>/gi;
  let rowCount = 0;
  let match: RegExpExecArray | null;
  while (rowCount < 500 && (match = rowRegex.exec(safeHtml)) !== null) {
    const label = stripHtmlTags(match[1] || '')
      .replace(/\s+/g, ' ')
      .replace(/:$/, '')
      .trim()
      .toLowerCase()
      .slice(0, 120);
    const val = stripHtmlTags(match[2] || '').slice(0, 4000);
    if (label && val && !Object.hasOwn(out, label)) {
      out[label] = val;
      rowCount += 1;
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
  if (typeof html !== 'string' || !html) return [];
  const safeHtml =
    html.length > MAX_ARENA_HTML_LENGTH ? html.slice(0, MAX_ARENA_HTML_LENGTH) : html;
  const results: DiscoveredArenaCatalogItem[] = [];
  const trimmedBrand =
    typeof brandHint === 'string'
      ? brandHint
          .replace(/\p{Cc}+/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80)
      : '';
  const brandPrefixRe = trimmedBrand
    ? new RegExp(`^${escapeRegExp(trimmedBrand)}(?:\\s|$)`, 'i')
    : null;
  // The link body cannot contain another <a> or <li>, so a page of unclosed
  // items cannot make each attempt rescan to the end (polynomial-redos).
  const itemRegex =
    /<li[^<>]*>\s*<a\s+href=["']([^"'<>]+\.php)["'][^<>]*>((?:(?!<\/?(?:a|li)\b)[\s\S])*)<\/a>\s*<\/li>/gi;
  let match: RegExpExecArray | null;
  while (results.length < MAX_ARENA_CATALOG_ITEMS && (match = itemRegex.exec(safeHtml)) !== null) {
    const href = match[1]?.trim() || '';
    const inner = match[2] || '';
    const nameMatch = inner.match(/<span[^<>]*>((?:(?!<\/?span\b)[\s\S])*)<\/span>/i);
    const rawName = stripHtmlTags(nameMatch ? nameMatch[1] || '' : inner)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    if (!rawName || !href) continue;
    const url = normalizeArenaUrl(
      decodeArenaHtmlEntities(href),
      /(?:^|\.)gsmarena\.com$/i,
      'https://www.gsmarena.com/'
    );
    if (!url) continue;
    const fullName = (
      brandPrefixRe && !brandPrefixRe.test(rawName) ? `${trimmedBrand} ${rawName}` : rawName
    )
      .slice(0, 200)
      .trim();
    const rawImgSrc = [...inner.matchAll(/<img\b([^<>]*)>/gi)]
      // `(?:^|\s)` so `data-src` lazy-load placeholders are not taken for src.
      .map(img => /(?:^|\s)src=["']([^"']+)["']/i.exec(img[1] || '')?.[1])
      .find(Boolean);
    const imgSrc = normalizeArenaUrl(
      rawImgSrc ? decodeArenaHtmlEntities(rawImgSrc) : undefined,
      /(?:^|\.)gsmarena\.com$/i,
      'https://www.gsmarena.com/'
    );
    results.push({
      source: 'gsmarena',
      name: fullName,
      url,
      imageUrl: imgSrc,
    });
  }
  return results;
}

/**
 * Parses a PhoneArena device finder HTML block to discover newly announced devices.
 */
export function parsePhoneArenaCatalogHtml(html: string): DiscoveredArenaCatalogItem[] {
  if (typeof html !== 'string' || !html) return [];
  const safeHtml =
    html.length > MAX_ARENA_HTML_LENGTH ? html.slice(0, MAX_ARENA_HTML_LENGTH) : html;
  const results: DiscoveredArenaCatalogItem[] = [];
  // Match the whole <a> first (attributes cannot span tags, the body cannot
  // contain another <a>), then read href from the attributes. One regex with
  // `[^>]+href=` backtracks polynomially on repeated attributes.
  const linkRegex = /<a\s([^<>]*)>((?:(?!<\/?a\b)[\s\S])*)<\/a>/gi;
  const hrefRegex =
    /(?:^|\s)href=["'](https?:\/\/www\.phonearena\.com\/phones\/[^"'#?]+|\/phones\/[^"'#?]+)["']/i;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while (results.length < MAX_ARENA_CATALOG_ITEMS && (match = linkRegex.exec(safeHtml)) !== null) {
    const rawHref = hrefRegex.exec(match[1] || '')?.[1]?.trim() || '';
    const text = stripHtmlTags(match[2] || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);
    if (!rawHref || !text || text.length < 4) continue;
    if (/compare|benchmarks|size-compare|reviews/i.test(rawHref)) continue;
    const url = normalizeArenaUrl(
      decodeArenaHtmlEntities(rawHref),
      /(?:^|\.)phonearena\.com$/i,
      'https://www.phonearena.com/'
    );
    if (!url || !new URL(url).pathname.toLowerCase().startsWith('/phones/')) continue;
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

function isPopulatedSpecFieldValue(
  v: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>()
): boolean {
  if (v === null || v === undefined || depth > 8) return false;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.replace(/\p{Cc}+/gu, '').trim().length > 0;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'object') {
    if (seen.has(v)) return false;
    seen.add(v);
    try {
      if (Array.isArray(v)) {
        return v.slice(0, 100).some(item => isPopulatedSpecFieldValue(item, depth + 1, seen));
      }
      return Object.values(v as Record<string, unknown>)
        .slice(0, 100)
        .some(item => isPopulatedSpecFieldValue(item, depth + 1, seen));
    } finally {
      seen.delete(v);
    }
  }
  return false;
}

export function countPopulatedFieldGroups(
  specs: Record<string, unknown> | null | undefined
): number {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return 0;
  let count = 0;
  for (const key of CANONICAL_10_SPEC_GROUPS) {
    const group = specs[key];
    if (
      group &&
      typeof group === 'object' &&
      !Array.isArray(group) &&
      Object.values(group as Record<string, unknown>).some(val => isPopulatedSpecFieldValue(val, 0))
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
  /**
   * RATE_ITEM_MODEL on only: Items with < 10 populated field groups. Variants inherit
   * their Item's specs, so these are the rows a spec sync should fill (DOS/Rate#1213).
   */
  incompleteSpecItems?: Array<{
    id: string;
    name: string;
    item_key: string;
    populatedGroups: number;
  }>;
}

export interface ArenaAuditItemRow {
  id: string;
  name: string;
  slug?: string | null;
  item_key: string;
  specifications?: Record<string, unknown> | null;
}

export interface ArenaAuditMasterRow {
  id: string;
  name: string;
  slug?: string | null;
  model_key: string;
  specifications?: Record<string, unknown> | null;
}

export class ArenaSpecSyncer {
  /**
   * Audits `rate.master_products` against the canonical 2026 Multi-Category Arena
   * Registry and flags any master products with < 10 populated specification field groups.
   * Reads the whole table in pages (one response stops at max-rows) and throws on a
   * read error rather than reporting every flagship as missing.
   */
  public async auditCatalogAgainstArenaRegistry(
    supabase: {
      from: (table: string) => {
        select: (columns: string) => {
          order: (
            column: string,
            options: { ascending: boolean }
          ) => {
            range: (
              from: number,
              to: number
            ) => PromiseLike<{
              data: ArenaAuditMasterRow[] | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    },
    pageSize?: number,
    options: { itemModel?: ItemModelMode } = {}
  ): Promise<ArenaCatalogAuditReport> {
    const itemModel =
      options && typeof options === 'object' && options.itemModel
        ? options.itemModel
        : resolveItemModelMode();
    const rows = await fetchAllPages(
      'Arena catalog audit: failed to read master_products',
      (from, to) =>
        supabase
          .from('master_products')
          .select('id, name, slug, model_key, specifications')
          .order('id', { ascending: true })
          .range(from, to),
      pageSize
    );

    const existingKeys = new Set<string>();
    const existingSlugs = new Set<string>();
    const incompleteSpecMasters: ArenaCatalogAuditReport['incompleteSpecMasters'] = [];

    const sanitizeAuditToken = (raw: unknown, maxLen: number): string => {
      const str =
        typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0
          ? String(raw)
          : typeof raw === 'string'
            ? raw
            : '';
      if (!str) return '';
      const trimmed = str.replace(/\p{Cc}+/gu, '').trim();
      if (
        !trimmed ||
        trimmed.length > maxLen ||
        /\s/.test(trimmed) ||
        !/[a-zA-Z0-9]/.test(trimmed) ||
        /^(?:0+|null|undefined|nan|none|n\/a|unknown|infinity|-infinity|true|false|__proto__|constructor|prototype)$/i.test(
          trimmed
        )
      ) {
        return '';
      }
      return trimmed;
    };

    for (const r of rows) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      const safeModelKey = sanitizeAuditToken(r.model_key, 200);
      if (safeModelKey) {
        existingKeys.add(safeModelKey.toLowerCase());
      }
      const safeSlug = sanitizeAuditToken(r.slug, 200);
      if (safeSlug) {
        existingSlugs.add(safeSlug.toLowerCase());
      }
      const populatedGroups = countPopulatedFieldGroups(r.specifications);
      if (populatedGroups < 10) {
        incompleteSpecMasters.push({
          id: sanitizeAuditToken(r.id, 128),
          name:
            typeof r.name === 'string'
              ? r.name
                  .replace(/\p{Cc}+/gu, '')
                  .trim()
                  .slice(0, 300)
              : '',
          model_key: safeModelKey,
          populatedGroups,
        });
      }
    }

    // With the Item model on, a flagship is present when its Item is: another size of
    // the same Item is not a missing release (design doc 4.1, DOS/Rate#1213).
    const existingItemKeys = new Set<string>();
    let incompleteSpecItems: ArenaCatalogAuditReport['incompleteSpecItems'];
    if (itemModel !== 'off') {
      incompleteSpecItems = [];
      for (const key of existingKeys) {
        const itemKey = splitModelKey(key)?.itemKey;
        if (itemKey) existingItemKeys.add(itemKey);
      }
      // The client is typed for master rows; the items read returns Item rows.
      const items = await fetchAllPages<ArenaAuditItemRow>(
        'Arena catalog audit: failed to read items',
        (from, to) =>
          supabase
            .from('items')
            .select('id, name, slug, item_key, specifications')
            .order('id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{
            data: ArenaAuditItemRow[] | null;
            error: { message: string } | null;
          }>,
        pageSize
      );
      for (const item of items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const safeItemKey = sanitizeAuditToken(item.item_key, 200).toLowerCase();
        const reportedItemKey =
          safeItemKey ||
          (typeof item.item_key === 'string'
            ? item.item_key
                .replace(/\p{Cc}+/gu, '')
                .trim()
                .slice(0, 200)
            : '');
        if (safeItemKey && isItemKey(safeItemKey)) existingItemKeys.add(safeItemKey);
        const populatedGroups = countPopulatedFieldGroups(item.specifications);
        if (populatedGroups < 10) {
          incompleteSpecItems.push({
            id: sanitizeAuditToken(item.id, 128),
            name:
              typeof item.name === 'string'
                ? item.name
                    .replace(/\p{Cc}+/gu, '')
                    .trim()
                    .slice(0, 300)
                : '',
            item_key: reportedItemKey,
            populatedGroups,
          });
        }
      }
    }

    const missingFromDatabase = UPSTREAM_2026_ARENA_REFERENCE_URLS.filter(ref => {
      if (existingKeys.has(ref.model_key.toLowerCase())) return false;
      if (existingSlugs.has(ref.slug.toLowerCase())) return false;
      const itemKey = splitModelKey(ref.model_key.toLowerCase())?.itemKey;
      return !(itemKey && existingItemKeys.has(itemKey));
    });

    return {
      totalArena2026Flagships: UPSTREAM_2026_ARENA_REFERENCE_URLS.length,
      presentInDatabase: UPSTREAM_2026_ARENA_REFERENCE_URLS.length - missingFromDatabase.length,
      missingFromDatabase,
      incompleteSpecMasters,
      ...(incompleteSpecItems ? { incompleteSpecItems } : {}),
    };
  }
}

export interface ArenaItemSyncResult {
  /** `skipped`: flag off or no usable key; `item_missing`: no `rate.items` row. */
  status: 'skipped' | 'item_missing' | 'synced';
  apply: boolean;
  itemKey: string | null;
  /** The Item was (apply) or would be (dry-run) updated. */
  itemUpdated: boolean;
  /** Variants that were (apply) or would be (dry-run) updated. */
  variantsUpdated: number;
  /** Rows another writer changed between the read and the write: left as they are. */
  conflicts: number;
}

/**
 * Compare-and-swap on `updated_at`: the update applies only to the row as it was read
 * (and, for a variant, still not archived). Returns false when nothing matched.
 */
async function updateIfUnchanged(
  supabase: RateSupabaseClient,
  table: 'items' | 'master_products',
  id: string,
  readUpdatedAt: unknown,
  payload: Record<string, unknown>
): Promise<boolean> {
  let query = supabase
    .from(table)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id);
  query =
    typeof readUpdatedAt === 'string' && readUpdatedAt
      ? query.eq('updated_at', readUpdatedAt)
      : query.is('updated_at', null);
  if (table === 'master_products') query = query.neq('status', 'archived');
  const { data, error } = await query.select('id');
  if (error) throw new Error(`Failed to update ${table} ${id}: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

/** `12GB` → 12; anything else → null. */
const gbOfLabel = (raw: unknown): number | null => {
  const m = typeof raw === 'string' ? /^\s*(\d+)\s*GB\s*$/i.exec(raw) : null;
  return m ? toPositiveInt(Number(m[1]), 2048) : null;
};

const toPositiveInt = (raw: unknown, max: number): number | null => {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};

/** `256gb` → 256, `1tb` → 1024; null for `unknown`, `standard` and suffixed keys. */
function storageGbOfVariantKey(variantKey: unknown): number | null {
  if (typeof variantKey !== 'string') return null;
  const m = /^(\d+)(gb|tb)$/.exec(variantKey.trim().toLowerCase());
  if (!m) return null;
  return toPositiveInt(m[2] === 'tb' ? Number(m[1]) * 1024 : Number(m[1]), 65536);
}

const formatStorage = (gb: number): string =>
  gb >= 1024 && gb % 512 === 0 ? `${gb / 1024}TB` : `${gb}GB`;

/**
 * Writes an Arena spec to the Item model (design doc 4.1 and 5.3, DOS/Rate#1213):
 * - the Item (`rate.items` by `item_key`) gets the specs and key specs without storage
 *   or RAM, merged over what it has;
 * - each sized variant of the Item gets only its own overrides, and only where they are
 *   still empty: `storage_gb` from its `variant_key`, `ram_gb` when the page pairs one
 *   RAM with that size, and the matching `key_specs.storage`/`key_specs.ram`.
 * A stored RAM (number or label) wins over Arena's. Each write is a compare-and-swap on
 * `updated_at`, so a row another writer changed (or archived) after the read is left
 * alone and counted in `conflicts`.
 * `key` is an `item_key` or a `model_key`. Items are never created (the M1 sync trigger
 * and the M2 backfill own that). Dry-run unless `apply`; with RATE_ITEM_MODEL off it
 * reads and writes nothing.
 */
export async function syncArenaSpecsToItem(
  supabase: RateSupabaseClient,
  spec: ArenaSyncedDeviceSpec,
  options: { key: string; apply?: boolean; itemModel?: ItemModelMode }
): Promise<ArenaItemSyncResult> {
  const safeOptions =
    options && typeof options === 'object' && !Array.isArray(options)
      ? options
      : ({} as { key?: string; apply?: boolean; itemModel?: ItemModelMode });
  const apply = safeOptions.apply === true;
  const result: ArenaItemSyncResult = {
    status: 'skipped',
    apply,
    itemKey: null,
    itemUpdated: false,
    variantsUpdated: 0,
    conflicts: 0,
  };
  if ((safeOptions.itemModel ?? resolveItemModelMode()) === 'off') return result;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return result;
  const rawKey = typeof safeOptions.key === 'string' ? safeOptions.key.trim().toLowerCase() : '';
  const itemKey = isItemKey(rawKey) ? rawKey : (splitModelKey(rawKey)?.itemKey ?? null);
  if (!itemKey) return result;
  result.itemKey = itemKey;

  const { data: item, error: itemErr } = await supabase
    .from('items')
    .select('id, specifications, key_specs, updated_at')
    .eq('item_key', itemKey)
    .maybeSingle();
  if (itemErr) throw new Error(`Failed to look up Item ${itemKey}: ${itemErr.message}`);
  const itemRow = item as {
    id?: unknown;
    specifications?: unknown;
    key_specs?: unknown;
    updated_at?: unknown;
  } | null;
  const itemId = typeof itemRow?.id === 'string' && itemRow.id.trim() ? itemRow.id.trim() : null;
  if (!itemRow || !itemId) {
    result.status = 'item_missing';
    return result;
  }
  result.status = 'synced';

  const itemPayload = {
    specifications: withoutVariantSpecs(
      mergeProductSpecifications(itemRow.specifications, spec.specifications)
    ),
    key_specs: withoutVariantKeySpecs(
      mergeKeySpecs(itemRow.key_specs, spec.keySpecs as unknown as Record<string, unknown>)
    ),
  };
  if (
    !apply ||
    (await updateIfUnchanged(supabase, 'items', itemId, itemRow.updated_at, itemPayload))
  ) {
    result.itemUpdated = true;
  } else {
    result.conflicts++;
  }

  const { data: variants, error: varErr } = await supabase
    .from('master_products')
    .select('id, variant_key, status, storage_gb, ram_gb, key_specs, updated_at')
    .eq('item_id', itemId);
  if (varErr) throw new Error(`Failed to read the variants of ${itemKey}: ${varErr.message}`);
  const ramByStorage = new Map(
    (Array.isArray(spec.memoryVariants) ? spec.memoryVariants : []).map(v => [
      v?.storageGb,
      v?.ramGb ?? null,
    ])
  );
  for (const raw of Array.isArray(variants) ? variants : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as {
      id?: unknown;
      variant_key?: unknown;
      status?: unknown;
      storage_gb?: unknown;
      ram_gb?: unknown;
      key_specs?: unknown;
      updated_at?: unknown;
    };
    const variantId = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null;
    const storageGb = storageGbOfVariantKey(row.variant_key);
    if (!variantId || !storageGb || row.status === 'archived') continue;
    const keySpecs =
      row.key_specs && typeof row.key_specs === 'object' && !Array.isArray(row.key_specs)
        ? (row.key_specs as Record<string, unknown>)
        : {};
    // One RAM per variant: a stored value (number, else label) wins over Arena's, so
    // the number and the label never disagree.
    const storedRamGb = toPositiveInt(row.ram_gb, 2048);
    const ramGb =
      storedRamGb ?? gbOfLabel(keySpecs.ram) ?? toPositiveInt(ramByStorage.get(storageGb), 2048);
    const storedStorageGb = toPositiveInt(row.storage_gb, 65536);
    const update: Record<string, unknown> = {};
    const keySpecUpdate: Record<string, unknown> = {};
    if (storedStorageGb === null) update.storage_gb = storageGb;
    if (ramGb !== null && storedRamGb === null) update.ram_gb = ramGb;
    if (typeof keySpecs.storage !== 'string' || !keySpecs.storage.trim()) {
      keySpecUpdate.storage = formatStorage(storedStorageGb ?? storageGb);
    }
    if (ramGb !== null && (typeof keySpecs.ram !== 'string' || !keySpecs.ram.trim())) {
      keySpecUpdate.ram = `${ramGb}GB`;
    }
    if (Object.keys(keySpecUpdate).length > 0) {
      update.key_specs = mergeKeySpecs(keySpecs, keySpecUpdate);
    }
    if (Object.keys(update).length === 0) continue;
    if (
      apply &&
      !(await updateIfUnchanged(supabase, 'master_products', variantId, row.updated_at, update))
    ) {
      result.conflicts++;
      continue;
    }
    result.variantsUpdated++;
  }
  return result;
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
    phonearenaUrl: 'https://www.phonearena.com/tablets/Apple-iPad-Pro-11-inch-M5_id12750',
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
