import {
  z,
  AvailabilitySchema,
  DesignSchema,
  DisplaySchema,
  HardwareSchema,
  BatterySchema,
  CameraSchema,
  ConnectivitySchema,
  CellularSchema,
  MultimediaSchema,
  RegulatorySchema,
  ProductSpecificationsSchema,
  KeySpecsSchema,
  type ProductSpecifications,
  type KeySpecs,
} from '@repo/shared-data';
import type { NormalizedProductCandidate } from './product-normalizer.js';
import { computeRetryDelayMs, createImporterLogger, sanitizeAiGeneratedText } from './logger.js';

export type SupportedAiProvider =
  'openai' | 'dos-ai' | 'gemini' | 'deepseek' | 'groq' | 'openrouter' | 'ollama';

export interface AiSpecEnricherConfig {
  provider?: SupportedAiProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
}

export interface AiEnrichmentResponse {
  ram_gb?: number | null;
  storage_gb?: number | null;
  screen_size_inch?: number | null;
  battery_mah?: number | null;
  has_5g?: boolean;
  specifications: ProductSpecifications;
  key_specs: KeySpecs;
}

export const AiSpecEnrichmentPayloadSchema = z.object({
  ram_gb: z.number().int().positive().max(2048).nullable().optional(),
  storage_gb: z.number().int().positive().max(65536).nullable().optional(),
  screen_size_inch: z.number().positive().max(120).nullable().optional(),
  battery_mah: z.number().int().positive().max(500000).nullable().optional(),
  has_5g: z.boolean().optional(),
  specifications: ProductSpecificationsSchema,
  key_specs: KeySpecsSchema.optional(),
});

export function getAiSpecEnrichmentJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(AiSpecEnrichmentPayloadSchema) as Record<string, unknown>;
}

const logger = createImporterLogger('AiSpecEnricher');

const PROVIDER_DEFAULTS: Record<
  SupportedAiProvider,
  { baseUrl: string; defaultModel: string; envKeys: string[] }
> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    envKeys: ['AI_API_KEY', 'OPENAI_API_KEY'],
  },
  'dos-ai': {
    baseUrl: 'https://api.dos.me/v1',
    defaultModel: 'gpt-4o-mini',
    envKeys: ['DOS_AI_API_KEY', 'AI_API_KEY', 'OPENAI_API_KEY'],
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'AI_API_KEY'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    envKeys: ['DEEPSEEK_API_KEY', 'AI_API_KEY'],
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    envKeys: ['GROQ_API_KEY', 'AI_API_KEY'],
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    envKeys: ['OPENROUTER_API_KEY', 'AI_API_KEY'],
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5:14b',
    envKeys: ['AI_API_KEY'],
  },
};

function toNumberOrUndefined(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const match = val
      .slice(0, 200)
      .replace(',', '.')
      .match(/(?<![-\d.])(\d+(?:\.\d+)?)/);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function toBoundedNumberOrUndefined(
  val: unknown,
  max: number,
  allowZero = false
): number | undefined {
  const num = toNumberOrUndefined(val);
  if (num === undefined) return undefined;
  const minOk = allowZero ? num >= 0 : num > 0;
  if (!minOk || num > max) return undefined;
  return num;
}

function toBoundedIntOrUndefined(val: unknown, max: number, allowZero = false): number | undefined {
  const num = toBoundedNumberOrUndefined(val, max, allowZero);
  if (num === undefined || !Number.isInteger(num)) return undefined;
  return num;
}

function sanitizeKeySpecText(val: unknown): string | undefined {
  const str = toStringOrUndefined(val);
  if (!str) return undefined;
  const cleaned = sanitizeAiGeneratedText(str).trim().slice(0, 160);
  return cleaned.length > 0 ? cleaned : undefined;
}

function toBooleanOrUndefined(val: unknown): boolean | undefined {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (['true', 'yes', 'có', '1', 'supported'].includes(lower)) return true;
    if (['false', 'no', 'không', '0', 'none'].includes(lower)) return false;
  }
  return undefined;
}

function toStringOrUndefined(val: unknown, maxLen = 500): string | undefined {
  if (typeof val === 'string') {
    const cleaned = sanitizeAiGeneratedText(val, maxLen).trim();
    return cleaned.length > 0 ? cleaned : undefined;
  }
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  return undefined;
}

function sanitizeColorList(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const cleaned = Array.from(
    new Set(
      val.map((c: unknown) => toStringOrUndefined(c, 64)).filter((c): c is string => Boolean(c))
    )
  ).slice(0, 32);
  return cleaned.length > 0 ? cleaned : undefined;
}

function asRecord(val: unknown): Record<string, unknown> | undefined {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : undefined;
}

/**
 * Extracts the outermost JSON object substring (`{...}`) in O(n) without regex backtracking.
 */
export function extractJsonObjectString(rawContent: string): string {
  if (typeof rawContent !== 'string') return '';
  const trimmed = rawContent.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/**
 * Coerces raw LLM JSON output into strict types matching ProductSpecificationsSchema.
 * Validates each of the 10 Field Groups independently so an invalid field in one group
 * never discards the remaining valid specification groups.
 */
export function sanitizeSpecifications(raw: unknown): ProductSpecifications {
  const root = asRecord(raw);
  if (!root) return {};

  const rawAvailability = asRecord(root.availability);
  const availabilityParsed = rawAvailability
    ? AvailabilitySchema.safeParse({
        announced: toStringOrUndefined(rawAvailability.announced),
        status: toStringOrUndefined(rawAvailability.status),
        prices_msrp: toStringOrUndefined(rawAvailability.prices_msrp),
      })
    : undefined;

  const rawDesign = asRecord(root.design);
  const designParsed = rawDesign
    ? DesignSchema.safeParse({
        dimensions: toStringOrUndefined(rawDesign.dimensions),
        weight_g: toBoundedNumberOrUndefined(rawDesign.weight_g, 25000),
        materials: toStringOrUndefined(rawDesign.materials),
        build: toStringOrUndefined(rawDesign.build),
        resistance: toStringOrUndefined(rawDesign.resistance),
        biometrics: toStringOrUndefined(rawDesign.biometrics),
        keys: toStringOrUndefined(rawDesign.keys),
        colors: sanitizeColorList(rawDesign.colors),
      })
    : undefined;

  const rawDisplay = asRecord(root.display);
  const displayParsed = rawDisplay
    ? DisplaySchema.safeParse({
        size_inch: toBoundedNumberOrUndefined(rawDisplay.size_inch, 120),
        type: toStringOrUndefined(rawDisplay.type),
        resolution: toStringOrUndefined(rawDisplay.resolution),
        refresh_rate_hz: toBoundedIntOrUndefined(rawDisplay.refresh_rate_hz, 1000),
        ppi: toBoundedIntOrUndefined(rawDisplay.ppi, 5000),
        protection: toStringOrUndefined(rawDisplay.protection),
        features: toStringOrUndefined(rawDisplay.features),
      })
    : undefined;

  const rawHardware = asRecord(root.hardware);
  const hardwareParsed = rawHardware
    ? HardwareSchema.safeParse({
        chipset: toStringOrUndefined(rawHardware.chipset),
        cpu: toStringOrUndefined(rawHardware.cpu),
        gpu: toStringOrUndefined(rawHardware.gpu),
        ram_gb: toBoundedIntOrUndefined(rawHardware.ram_gb, 2048),
        storage_gb: toBoundedIntOrUndefined(rawHardware.storage_gb, 65536),
        storage_expansion: toStringOrUndefined(rawHardware.storage_expansion),
        os: toStringOrUndefined(rawHardware.os),
      })
    : undefined;

  const rawBattery = asRecord(root.battery);
  const batteryParsed = rawBattery
    ? BatterySchema.safeParse({
        capacity_mah: toBoundedIntOrUndefined(rawBattery.capacity_mah, 500000),
        type: toStringOrUndefined(rawBattery.type),
        charging: toStringOrUndefined(rawBattery.charging),
        fast_charging_w: toBoundedNumberOrUndefined(rawBattery.fast_charging_w, 1000, true),
        reverse_charging:
          toBooleanOrUndefined(rawBattery.reverse_charging) ??
          toStringOrUndefined(rawBattery.reverse_charging),
      })
    : undefined;

  const rawCamera = asRecord(root.camera);
  const cameraParsed = rawCamera
    ? CameraSchema.safeParse({
        rear_setup: toStringOrUndefined(rawCamera.rear_setup),
        main_camera: toStringOrUndefined(rawCamera.main_camera),
        second_camera: toStringOrUndefined(rawCamera.second_camera),
        third_camera: toStringOrUndefined(rawCamera.third_camera),
        fourth_camera: toStringOrUndefined(rawCamera.fourth_camera),
        flash: toStringOrUndefined(rawCamera.flash),
        video_recording: toStringOrUndefined(rawCamera.video_recording),
        front_camera: toStringOrUndefined(rawCamera.front_camera),
      })
    : undefined;

  const rawConnectivity = asRecord(root.connectivity);
  const connectivityParsed = rawConnectivity
    ? ConnectivitySchema.safeParse({
        bluetooth: toStringOrUndefined(rawConnectivity.bluetooth),
        wlan: toStringOrUndefined(rawConnectivity.wlan),
        usb: toStringOrUndefined(rawConnectivity.usb),
        sensors: toStringOrUndefined(rawConnectivity.sensors),
        location: toStringOrUndefined(rawConnectivity.location),
        nfc: toBooleanOrUndefined(rawConnectivity.nfc),
        other: toStringOrUndefined(rawConnectivity.other),
      })
    : undefined;

  const rawCellular = asRecord(root.cellular);
  const cellularParsed = rawCellular
    ? CellularSchema.safeParse({
        has_5g: toBooleanOrUndefined(rawCellular.has_5g),
        bands_5g: toStringOrUndefined(rawCellular.bands_5g),
        bands_4g: toStringOrUndefined(rawCellular.bands_4g),
        bands_3g: toStringOrUndefined(rawCellular.bands_3g),
        bands_2g: toStringOrUndefined(rawCellular.bands_2g),
        technology: toStringOrUndefined(rawCellular.technology),
        data_speed: toStringOrUndefined(rawCellular.data_speed),
        sim_type: toStringOrUndefined(rawCellular.sim_type),
        volte: toBooleanOrUndefined(rawCellular.volte),
        vowifi: toBooleanOrUndefined(rawCellular.vowifi),
      })
    : undefined;

  const rawMultimedia = asRecord(root.multimedia);
  const multimediaParsed = rawMultimedia
    ? MultimediaSchema.safeParse({
        loudspeaker: toStringOrUndefined(rawMultimedia.loudspeaker),
        headphone_jack_35mm: toBooleanOrUndefined(rawMultimedia.headphone_jack_35mm),
        audio_features: toStringOrUndefined(rawMultimedia.audio_features),
      })
    : undefined;

  const rawRegulatory = asRecord(root.regulatory);
  const regulatoryParsed = rawRegulatory
    ? RegulatorySchema.safeParse({
        fcc_approval: toStringOrUndefined(rawRegulatory.fcc_approval),
        sar_head: toStringOrUndefined(rawRegulatory.sar_head),
        sar_body: toStringOrUndefined(rawRegulatory.sar_body),
        sar_simultaneous: toStringOrUndefined(rawRegulatory.sar_simultaneous),
        certifications: toStringOrUndefined(rawRegulatory.certifications),
      })
    : undefined;

  const candidateSpecs: ProductSpecifications = {
    category_slug: toStringOrUndefined(root.category_slug, 64),
    availability: availabilityParsed?.success ? availabilityParsed.data : undefined,
    design: designParsed?.success ? designParsed.data : undefined,
    display: displayParsed?.success ? displayParsed.data : undefined,
    hardware: hardwareParsed?.success ? hardwareParsed.data : undefined,
    battery: batteryParsed?.success ? batteryParsed.data : undefined,
    camera: cameraParsed?.success ? cameraParsed.data : undefined,
    connectivity: connectivityParsed?.success ? connectivityParsed.data : undefined,
    cellular: cellularParsed?.success ? cellularParsed.data : undefined,
    multimedia: multimediaParsed?.success ? multimediaParsed.data : undefined,
    regulatory: regulatoryParsed?.success ? regulatoryParsed.data : undefined,
  };

  const parsed = ProductSpecificationsSchema.safeParse(candidateSpecs);
  return parsed.success ? parsed.data : {};
}

const SPEC_FIELD_GROUP_KEYS = [
  'availability',
  'design',
  'display',
  'hardware',
  'battery',
  'camera',
  'connectivity',
  'cellular',
  'multimedia',
  'regulatory',
] as const;

function mergeSpecGroupRecord(
  baseGroup: Record<string, unknown> | undefined,
  incomingGroup: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!baseGroup && !incomingGroup) return undefined;
  const merged: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(baseGroup ?? {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim().length === 0) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) merged[k] = [...v];
      continue;
    }
    merged[k] = v;
  }
  for (const [k, v] of Object.entries(incomingGroup ?? {})) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim().length === 0) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) merged[k] = [...v];
      continue;
    }
    merged[k] = v;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Deep-merges two 10-Field-Group `ProductSpecifications` objects without allowing
 * `undefined`, `null`, or empty incoming fields to overwrite defined base fields.
 */
export function mergeProductSpecifications(
  base: unknown,
  incoming: unknown,
  colorsOverride?: readonly string[] | null
): ProductSpecifications {
  const safeBase = sanitizeSpecifications(base) as Record<string, unknown>;
  const safeIncoming = sanitizeSpecifications(incoming) as Record<string, unknown>;
  const mergedRaw: Record<string, unknown> = {};

  const mergedCategorySlug =
    toStringOrUndefined(safeIncoming.category_slug) ?? toStringOrUndefined(safeBase.category_slug);
  if (mergedCategorySlug) {
    mergedRaw.category_slug = mergedCategorySlug;
  }

  for (const key of SPEC_FIELD_GROUP_KEYS) {
    const mergedGroup = mergeSpecGroupRecord(asRecord(safeBase[key]), asRecord(safeIncoming[key]));
    if (mergedGroup) {
      mergedRaw[key] = mergedGroup;
    }
  }

  const cleanColors = sanitizeColorList(colorsOverride) ?? [];
  if (cleanColors.length > 0) {
    mergedRaw.design = {
      ...(asRecord(mergedRaw.design) ?? {}),
      colors: cleanColors,
    };
  }

  return sanitizeSpecifications(mergedRaw);
}

export const MAX_SPEC_CACHE_ENTRIES = 250;

export function cloneAiEnrichmentResponse(res: AiEnrichmentResponse): AiEnrichmentResponse {
  const safeRes = res && typeof res === 'object' ? res : ({} as AiEnrichmentResponse);
  return {
    ram_gb: safeRes.ram_gb ?? null,
    storage_gb: safeRes.storage_gb ?? null,
    screen_size_inch: safeRes.screen_size_inch ?? null,
    battery_mah: safeRes.battery_mah ?? null,
    has_5g: safeRes.has_5g,
    specifications: sanitizeSpecifications(safeRes.specifications),
    key_specs: { ...(safeRes.key_specs ?? {}) },
  };
}

/**
 * Provider-Agnostic AI Spec Enricher
 * Populates the 10 Field Groups (PhoneArena structure + GSMArena depth) for any mobile device.
 * Supports: OpenAI, DOS-AI Gateway, Gemini, DeepSeek, Groq, OpenRouter, Ollama (or any OpenAI-compatible API).
 */
export function trimTrailingSlashes(rawUrl: string): string {
  if (typeof rawUrl !== 'string') return '';
  let end = rawUrl.length;
  while (end > 0 && rawUrl.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return end === rawUrl.length ? rawUrl : rawUrl.slice(0, end);
}

export function resolveValidHttpBaseUrl(candidateUrl: string, fallbackUrl: string): string {
  const cleaned = trimTrailingSlashes(typeof candidateUrl === 'string' ? candidateUrl.trim() : '');
  if (cleaned && cleaned.length <= 512 && !/\p{Cc}/u.test(cleaned) && !/\s/.test(cleaned)) {
    try {
      const parsed = new URL(cleaned);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.hostname &&
        parsed.username === '' &&
        parsed.password === '' &&
        parsed.search === '' &&
        parsed.hash === ''
      ) {
        return cleaned;
      }
    } catch {
      // fall through to fallbackUrl
    }
  }
  return trimTrailingSlashes(fallbackUrl);
}

export class AiSpecEnricher {
  private provider: SupportedAiProvider;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;
  private temperature: number;
  private memoryCache = new Map<string, AiEnrichmentResponse>();

  constructor(config: AiSpecEnricherConfig = {}) {
    const safeConfig = config && typeof config === 'object' ? config : {};
    this.provider = this.resolveProvider(safeConfig.provider);
    const defaults = PROVIDER_DEFAULTS[this.provider];

    this.apiKey =
      typeof safeConfig.apiKey === 'string'
        ? safeConfig.apiKey.trim()
        : this.resolveApiKey(this.provider);
    this.baseUrl = resolveValidHttpBaseUrl(
      safeConfig.baseUrl ||
        process.env.AI_BASE_URL ||
        process.env.DOS_AI_BASE_URL ||
        process.env.OPENAI_BASE_URL ||
        defaults.baseUrl,
      defaults.baseUrl
    );

    this.model =
      safeConfig.model || process.env.AI_MODEL || process.env.OPENAI_MODEL || defaults.defaultModel;

    const rawTimeout =
      typeof safeConfig.timeoutMs === 'boolean'
        ? Number.NaN
        : (safeConfig.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS || 25000));
    this.timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout >= 1000 && rawTimeout <= 120000
        ? Math.round(rawTimeout)
        : 25000;
    const rawTemp =
      typeof safeConfig.temperature === 'boolean' ? Number.NaN : (safeConfig.temperature ?? 0.1);
    this.temperature = Number.isFinite(rawTemp) && rawTemp >= 0 && rawTemp <= 2 ? rawTemp : 0.1;
  }

  private resolveProvider(explicit?: SupportedAiProvider): SupportedAiProvider {
    if (explicit && explicit in PROVIDER_DEFAULTS) return explicit;
    const envProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase() as SupportedAiProvider;
    if (envProvider && envProvider in PROVIDER_DEFAULTS) return envProvider;

    if (process.env.DOS_AI_API_KEY || process.env.DOS_AI_BASE_URL) return 'dos-ai';
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.OPENROUTER_API_KEY) return 'openrouter';
    return 'openai';
  }

  private resolveApiKey(provider: SupportedAiProvider): string {
    const keys = PROVIDER_DEFAULTS[provider].envKeys;
    for (const k of keys) {
      const val = process.env[k];
      if (val && val.trim().length > 0) return val.trim();
    }
    return '';
  }

  /**
   * Returns true if the enricher has credentials (or uses local Ollama)
   */
  public isConfigured(): boolean {
    if (this.provider === 'ollama') return true;
    return this.apiKey.length > 0;
  }

  public getProviderInfo(): {
    provider: SupportedAiProvider;
    model: string;
    baseUrl: string;
    configured: boolean;
  } {
    return {
      provider: this.provider,
      model: this.model,
      baseUrl: this.baseUrl,
      configured: this.isConfigured(),
    };
  }

  public getCacheSize(): number {
    return this.memoryCache.size;
  }

  /**
   * Builds the system & user prompts referencing PhoneArena 10-Field-Group structure and GSMArena technical accuracy
   */
  private buildPrompts(
    brand: string,
    model: string,
    storageGb: number | null,
    ramGb: number | null,
    rawTitle?: string,
    rawDescription?: string,
    categorySlug: string = 'smartphones'
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a hardware specification database expert with authoritative knowledge of PhoneArena and GSMArena device specifications.
Your job is to return accurate, comprehensive technical specifications for a consumer tech device, structured into the 10 standard PhoneArena Field Groups (with GSMArena technical precision).

RULES:
1. Return ONLY a valid JSON object matching the exact schema below. Do not wrap in markdown code fences.
2. Numeric fields (size_inch, refresh_rate_hz, ppi, ram_gb, storage_gb, capacity_mah, fast_charging_w, weight_g) MUST be JSON numbers (e.g. 6.7, 120, 5000), not strings with units.
3. Boolean fields (has_5g, nfc, volte, vowifi, headphone_jack_35mm) MUST be JSON booleans (true or false).
4. Separate cameras clearly following PhoneArena structure: main_camera, second_camera (ultrawide), third_camera (telephoto/macro), fourth_camera (periscope if present), front_camera.
5. Keep descriptive text concise, accurate, and readable for Vietnamese & international users.

REQUIRED JSON SCHEMA:
{
  "ram_gb": number,
  "storage_gb": number,
  "screen_size_inch": number,
  "battery_mah": number,
  "has_5g": boolean,
  "specifications": {
    "availability": {
      "announced": "string (e.g. 'September 2024')",
      "status": "string (e.g. 'Available')",
      "prices_msrp": "string (e.g. '$999 / 28.990.000₫')"
    },
    "design": {
      "dimensions": "string (e.g. '162.8 x 77.6 x 8.2 mm')",
      "weight_g": number,
      "materials": "string (e.g. 'Gorilla Glass Armor front/back, Titanium frame')",
      "build": "string",
      "resistance": "string (e.g. 'IP68 dust/water resistant (1.5m for 30 min)')",
      "biometrics": "string (e.g. 'Ultrasonic under-display fingerprint, Face unlock' or '3D Face ID')",
      "keys": "string (e.g. 'Volume, Side/Power key')",
      "colors": ["string"]
    },
    "display": {
      "size_inch": number,
      "type": "string (e.g. 'Dynamic LTPO AMOLED 2X, 120Hz, HDR10+, 2600 nits')",
      "resolution": "string (e.g. '1440 x 3120 pixels, 19.5:9 ratio')",
      "refresh_rate_hz": number,
      "ppi": number,
      "protection": "string (e.g. 'Corning Gorilla Armor' or 'Ceramic Shield')",
      "features": "string (e.g. 'Always-on display, HDR10+, Dolby Vision')"
    },
    "hardware": {
      "chipset": "string (e.g. 'Qualcomm Snapdragon 8 Gen 3 (4 nm)' or 'Apple A18 Pro (3 nm)')",
      "cpu": "string (e.g. 'Octa-core (1x3.39GHz Cortex-X4 & ...)')",
      "gpu": "string (e.g. 'Adreno 750' or 'Apple 6-core GPU')",
      "ram_gb": number,
      "storage_gb": number,
      "storage_expansion": "string (e.g. 'Không hỗ trợ thẻ nhớ' or 'microSDXC')",
      "os": "string (e.g. 'Android 14, One UI 6.1' or 'iOS 18')"
    },
    "battery": {
      "capacity_mah": number,
      "type": "string (e.g. 'Li-Ion 5000 mAh, non-removable')",
      "charging": "string (e.g. '45W wired PD3.0, 15W wireless (Qi/PMA), 4.5W reverse wireless')",
      "fast_charging_w": number,
      "reverse_charging": boolean
    },
    "camera": {
      "rear_setup": "string (e.g. 'Quad Camera' / 'Triple Camera' / 'Dual Camera')",
      "main_camera": "string (e.g. '200 MP, f/1.7, 24mm (wide), multi-directional PDAF, OIS')",
      "second_camera": "string (e.g. '12 MP, f/2.2, 13mm, 120˚ (ultrawide)')",
      "third_camera": "string (e.g. '10 MP, f/2.4, 67mm (telephoto), 3x optical zoom, OIS')",
      "fourth_camera": "string (optional, e.g. '50 MP, f/3.4, 111mm (periscope telephoto), 5x optical zoom')",
      "flash": "string (e.g. 'LED flash, auto-HDR, panorama')",
      "video_recording": "string (e.g. '8K@24/30fps, 4K@30/60/120fps, 1080p@30/60/240fps, HDR10+')",
      "front_camera": "string (e.g. '12 MP, f/2.2, 26mm (wide), Dual Pixel PDAF')"
    },
    "connectivity": {
      "bluetooth": "string (e.g. '5.3, A2DP, LE')",
      "wlan": "string (e.g. 'Wi-Fi 802.11 a/b/g/n/ac/6e/7, tri-band')",
      "usb": "string (e.g. 'USB Type-C 3.2, DisplayPort 1.2, OTG')",
      "sensors": "string (e.g. 'Accelerometer, gyro, proximity, compass, barometer')",
      "location": "string (e.g. 'GPS, GLONASS, BDS, GALILEO, QZSS')",
      "nfc": boolean,
      "other": "string (e.g. 'Ultra Wideband (UWB), Samsung DeX')"
    },
    "cellular": {
      "has_5g": boolean,
      "bands_5g": "string (e.g. 'SA/NSA/Sub6')",
      "bands_4g": "string (e.g. 'LTE Cat20')",
      "technology": "string (e.g. 'GSM / HSPA / LTE / 5G')",
      "data_speed": "string (e.g. 'HSPA, LTE-A, 5G')",
      "sim_type": "string (e.g. '2 Nano-SIM + eSIM')",
      "volte": boolean,
      "vowifi": boolean
    },
    "multimedia": {
      "loudspeaker": "string (e.g. 'Stereo speakers, tuned by AKG')",
      "headphone_jack_35mm": boolean,
      "audio_features": "string (e.g. '32-bit/384kHz audio, Dolby Atmos')"
    },
    "regulatory": {
      "fcc_approval": "string",
      "sar_head": "string (e.g. '1.05 W/kg')",
      "sar_body": "string (e.g. '0.95 W/kg')",
      "certifications": "string (e.g. 'CE, FCC, RoHS')"
    }
  },
  "key_specs": {
    "screen": "string (short summary, e.g. '6.8" Dynamic AMOLED 2X 120Hz')",
    "chip": "string (short summary, e.g. 'Snapdragon 8 Gen 3')",
    "camera": "string (short summary, e.g. '200MP + 50MP + 12MP + 10MP')",
    "battery": "string (short summary, e.g. '5000 mAh (45W)')",
    "storage": "string (e.g. '256GB')",
    "ram": "string (e.g. '12GB')"
  }
}`;

    const safeCat = (categorySlug || 'smartphones').trim().toLowerCase() || 'smartphones';
    const userPrompt = [
      `Target Device (${safeCat}):`,
      `- Category: ${safeCat}`,
      `- Brand: ${brand}`,
      `- Model: ${model}`,
      storageGb !== null ? `- Variant Storage: ${storageGb}GB` : null,
      ramGb !== null ? `- Variant RAM: ${ramGb}GB` : null,
      rawTitle ? `- Crawled Listing Title: ${rawTitle}` : null,
      rawDescription ? `- Crawled Description Excerpt: ${rawDescription.slice(0, 500)}` : null,
      ``,
      `Generate the complete 10 Field Groups JSON specification for "${brand} ${model}" (${storageGb ? `${storageGb}GB` : 'Standard'}).`,
    ]
      .filter(Boolean)
      .join('\n');

    return { systemPrompt, userPrompt };
  }

  private setCacheEntry(cacheKey: string, value: AiEnrichmentResponse): void {
    if (this.memoryCache.has(cacheKey)) {
      this.memoryCache.delete(cacheKey);
    }
    while (this.memoryCache.size >= MAX_SPEC_CACHE_ENTRIES) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(cacheKey, cloneAiEnrichmentResponse(value));
  }

  /**
   * Calls the configured LLM endpoint and parses the structured JSON specs
   */
  public async fetchSpecsFromAi(params: {
    brand: string;
    model: string;
    storageGb: number | null;
    ramGb: number | null;
    rawTitle?: string;
    rawDescription?: string;
    categorySlug?: string;
  }): Promise<AiEnrichmentResponse | null> {
    if (!params || typeof params !== 'object') return null;
    const cleanBrand =
      typeof params.brand === 'string' ? params.brand.replace(/\p{Cc}+/gu, ' ').trim() : '';
    const cleanModel =
      typeof params.model === 'string' ? params.model.replace(/\p{Cc}+/gu, ' ').trim() : '';
    if (!cleanBrand || !cleanModel) return null;
    params = { ...params, brand: cleanBrand, model: cleanModel };

    if (!this.isConfigured()) {
      logger.info(
        'spec_enrich.skipped_unconfigured',
        `Skipped AI call for "${params.brand} ${params.model}" (no API key configured for provider "${this.provider}").`,
        {
          provider: this.provider,
          brand: params.brand,
          deviceModel: params.model,
        }
      );
      return null;
    }

    const safeParamStorageGb = toBoundedIntOrUndefined(params.storageGb, 65536) ?? null;
    const safeParamRamGb = toBoundedIntOrUndefined(params.ramGb, 2048) ?? null;
    const catKey = (params.categorySlug || 'smartphones').trim().toLowerCase() || 'smartphones';
    const cacheKey = `${catKey}:${params.brand.toLowerCase()}:${params.model.toLowerCase()}:${safeParamStorageGb || 'default'}:${safeParamRamGb || 'default'}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      this.memoryCache.delete(cacheKey);
      this.memoryCache.set(cacheKey, cached);
      logger.info('spec_enrich.cache_hit', `Cache hit for "${cacheKey}"`, {
        cacheKey,
      });
      return cloneAiEnrichmentResponse(cached);
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(
      params.brand,
      params.model,
      safeParamStorageGb,
      safeParamRamGb,
      params.rawTitle,
      params.rawDescription,
      catKey
    );

    try {
      logger.info(
        'spec_enrich.query_start',
        `Querying ${this.provider} (${this.model}) for "${params.brand} ${params.model}"`,
        {
          provider: this.provider,
          model: this.model,
          brand: params.brand,
          deviceModel: params.model,
        }
      );

      const endpoint = `${this.baseUrl}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const body: Record<string, unknown> = {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.temperature,
        response_format: { type: 'json_object' },
      };

      let response: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const reqController = new AbortController();
        const reqTimer = setTimeout(() => reqController.abort(), this.timeoutMs);
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: reqController.signal,
          });
          if (response.ok) break;
          if (response.status !== 429 && response.status < 500) break;
        } finally {
          clearTimeout(reqTimer);
        }
        if (attempt === 0) {
          await new Promise(resolve =>
            setTimeout(resolve, computeRetryDelayMs(attempt, 250, 1500))
          );
        }
      }

      if (!response || !response.ok) {
        const status = response?.status ?? 0;
        const errText = response ? await response.text().catch(() => '') : '';
        logger.warn(
          'spec_enrich.http_error',
          `HTTP ${status} from ${this.provider}: ${errText.slice(0, 300)}`,
          { provider: this.provider, status }
        );
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent: string | undefined = data?.choices?.[0]?.message?.content;
      if (!rawContent) {
        logger.warn('spec_enrich.empty_response', `Empty message content from ${this.provider}`, {
          provider: this.provider,
        });
        return null;
      }

      const cleanedJson = extractJsonObjectString(rawContent);
      const parsedJson = JSON.parse(cleanedJson);
      const specifications = sanitizeSpecifications(parsedJson.specifications || parsedJson);

      const ramGb =
        safeParamRamGb ??
        toBoundedIntOrUndefined(parsedJson.ram_gb, 2048) ??
        specifications.hardware?.ram_gb ??
        null;

      const storageGb =
        safeParamStorageGb ??
        toBoundedIntOrUndefined(parsedJson.storage_gb, 65536) ??
        specifications.hardware?.storage_gb ??
        null;

      const screenSizeInch =
        toBoundedNumberOrUndefined(parsedJson.screen_size_inch, 120) ??
        specifications.display?.size_inch ??
        null;

      const batteryMah =
        toBoundedIntOrUndefined(parsedJson.battery_mah, 500000) ??
        specifications.battery?.capacity_mah ??
        null;

      const has5g = toBooleanOrUndefined(parsedJson.has_5g) ?? specifications.cellular?.has_5g;

      if (specifications.hardware) {
        if (ramGb !== null) specifications.hardware.ram_gb = ramGb;
        if (storageGb !== null) specifications.hardware.storage_gb = storageGb;
      }

      const rawKeySpecs = parsedJson.key_specs || {};
      const keySpecsCandidate: KeySpecs = {
        screen:
          sanitizeKeySpecText(rawKeySpecs.screen) ||
          (screenSizeInch
            ? `${screenSizeInch}" ${specifications.display?.type?.split(',')[0] || 'OLED'}`
            : undefined),
        chip:
          sanitizeKeySpecText(rawKeySpecs.chip) ||
          specifications.hardware?.chipset?.split('(')[0]?.trim(),
        camera:
          sanitizeKeySpecText(rawKeySpecs.camera) ||
          specifications.camera?.main_camera?.split(',')[0]?.trim(),
        battery:
          sanitizeKeySpecText(rawKeySpecs.battery) ||
          (batteryMah
            ? `${batteryMah} mAh${specifications.battery?.fast_charging_w ? ` (${specifications.battery.fast_charging_w}W)` : ''}`
            : undefined),
        storage:
          storageGb !== null
            ? storageGb >= 1024 && storageGb % 512 === 0
              ? `${storageGb / 1024}TB`
              : `${storageGb}GB`
            : sanitizeKeySpecText(rawKeySpecs.storage),
        ram: ramGb !== null ? `${ramGb}GB` : sanitizeKeySpecText(rawKeySpecs.ram),
      };

      const keySpecsParsed = KeySpecsSchema.safeParse(keySpecsCandidate);
      const keySpecs: KeySpecs = keySpecsParsed.success ? keySpecsParsed.data : {};

      const result: AiEnrichmentResponse = {
        ram_gb: ramGb,
        storage_gb: storageGb,
        screen_size_inch: screenSizeInch,
        battery_mah: batteryMah,
        has_5g: has5g,
        specifications,
        key_specs: keySpecs,
      };

      this.setCacheEntry(cacheKey, result);
      logger.info(
        'spec_enrich.completed',
        `Enriched "${params.brand} ${params.model}": Chip="${keySpecs.chip}", Screen="${keySpecs.screen}", Battery="${keySpecs.battery}"`,
        {
          brand: params.brand,
          deviceModel: params.model,
          chip: keySpecs.chip ?? null,
          screen: keySpecs.screen ?? null,
          battery: keySpecs.battery ?? null,
        }
      );
      return cloneAiEnrichmentResponse(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        'spec_enrich.failed',
        `Failed to enrich "${params.brand} ${params.model}": ${errMsg}`,
        { brand: params.brand, deviceModel: params.model }
      );
      return null;
    }
  }

  /**
   * Enriches a NormalizedProductCandidate (and returns a new object) if it wasn't already
   * enriched by the canonical benchmark registry.
   */
  public async enrichCandidate(
    candidate: NormalizedProductCandidate,
    rawTitle?: string
  ): Promise<NormalizedProductCandidate> {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error('[AiSpecEnricher] candidate must be a non-null object');
    }
    if (candidate.is_benchmark_enriched) {
      return {
        ...candidate,
        spec_source: candidate.spec_source ?? 'benchmark_registry',
      };
    }

    const validCandidateRam = toBoundedIntOrUndefined(candidate.ram_gb, 2048) ?? null;
    const validCandidateStorage = toBoundedIntOrUndefined(candidate.storage_gb, 65536) ?? null;
    const validCandidateScreen =
      toBoundedNumberOrUndefined(candidate.screen_size_inch, 120) ?? null;
    const validCandidateBattery = toBoundedIntOrUndefined(candidate.battery_mah, 500000) ?? null;

    const aiResult = await this.fetchSpecsFromAi({
      brand: candidate.brand,
      model: candidate.model,
      storageGb: validCandidateStorage,
      ramGb: validCandidateRam,
      rawTitle,
      rawDescription: candidate.description,
      categorySlug: candidate.category_slug,
    });

    if (!aiResult) {
      return candidate;
    }

    // Deep-merge all 10 Field Groups so candidate.specifications fields are preserved
    // when AI omits a field or group, and candidate.colors override design.colors.
    const mergedSpecifications = mergeProductSpecifications(
      candidate.specifications,
      aiResult.specifications,
      candidate.colors
    );

    const incomingKeySpecs = Object.fromEntries(
      Object.entries(aiResult.key_specs || {}).filter(
        ([, v]) => v !== undefined && v !== null && String(v).trim() !== ''
      )
    );

    return {
      ...candidate,
      ram_gb: validCandidateRam ?? toBoundedIntOrUndefined(aiResult.ram_gb, 2048) ?? null,
      storage_gb:
        validCandidateStorage ?? toBoundedIntOrUndefined(aiResult.storage_gb, 65536) ?? null,
      screen_size_inch:
        toBoundedNumberOrUndefined(aiResult.screen_size_inch, 120) ?? validCandidateScreen,
      battery_mah: toBoundedIntOrUndefined(aiResult.battery_mah, 500000) ?? validCandidateBattery,
      has_5g: aiResult.has_5g ?? candidate.has_5g,
      specifications: mergedSpecifications,
      key_specs: {
        ...candidate.key_specs,
        ...incomingKeySpecs,
      },
      spec_source: 'ai_unverified',
      spec_enrichment_meta: {
        provider: this.provider,
        model: this.model,
        enriched_at: new Date().toISOString(),
      },
    };
  }
}
