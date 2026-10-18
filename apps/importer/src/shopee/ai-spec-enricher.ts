import {
  z,
  ProductSpecificationsSchema,
  KeySpecsSchema,
  type ProductSpecifications,
  type KeySpecs,
} from '@repo/shared-data';
import type { NormalizedProductCandidate } from './product-normalizer.js';
import { computeRetryDelayMs, createImporterLogger } from './logger.js';

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
  ram_gb: z.number().positive().nullable().optional(),
  storage_gb: z.number().positive().nullable().optional(),
  screen_size_inch: z.number().positive().nullable().optional(),
  battery_mah: z.number().positive().nullable().optional(),
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
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val === 'string') {
    const match = val.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const parsed = parseFloat(match[1]);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return undefined;
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

function toStringOrUndefined(val: unknown): string | undefined {
  if (typeof val === 'string' && val.trim().length > 0) return val.trim();
  if (typeof val === 'number') return String(val);
  return undefined;
}

/**
 * Coerces raw LLM JSON output into strict types matching ProductSpecificationsSchema
 */
export function sanitizeSpecifications(raw: any): ProductSpecifications {
  if (!raw || typeof raw !== 'object') return {};

  const availability = raw.availability
    ? {
        announced: toStringOrUndefined(raw.availability.announced),
        status: toStringOrUndefined(raw.availability.status),
        prices_msrp: toStringOrUndefined(raw.availability.prices_msrp),
      }
    : undefined;

  const design = raw.design
    ? {
        dimensions: toStringOrUndefined(raw.design.dimensions),
        weight_g: toNumberOrUndefined(raw.design.weight_g),
        materials: toStringOrUndefined(raw.design.materials),
        build: toStringOrUndefined(raw.design.build),
        resistance: toStringOrUndefined(raw.design.resistance),
        biometrics: toStringOrUndefined(raw.design.biometrics),
        keys: toStringOrUndefined(raw.design.keys),
        colors: Array.isArray(raw.design.colors)
          ? raw.design.colors.map((c: unknown) => String(c).trim()).filter(Boolean)
          : undefined,
      }
    : undefined;

  const display = raw.display
    ? {
        size_inch: toNumberOrUndefined(raw.display.size_inch),
        type: toStringOrUndefined(raw.display.type),
        resolution: toStringOrUndefined(raw.display.resolution),
        refresh_rate_hz: toNumberOrUndefined(raw.display.refresh_rate_hz),
        ppi: toNumberOrUndefined(raw.display.ppi),
        protection: toStringOrUndefined(raw.display.protection),
        features: toStringOrUndefined(raw.display.features),
      }
    : undefined;

  const hardware = raw.hardware
    ? {
        chipset: toStringOrUndefined(raw.hardware.chipset),
        cpu: toStringOrUndefined(raw.hardware.cpu),
        gpu: toStringOrUndefined(raw.hardware.gpu),
        ram_gb: toNumberOrUndefined(raw.hardware.ram_gb),
        storage_gb: toNumberOrUndefined(raw.hardware.storage_gb),
        storage_expansion: toStringOrUndefined(raw.hardware.storage_expansion),
        os: toStringOrUndefined(raw.hardware.os),
      }
    : undefined;

  const battery = raw.battery
    ? {
        capacity_mah: toNumberOrUndefined(raw.battery.capacity_mah),
        type: toStringOrUndefined(raw.battery.type),
        charging: toStringOrUndefined(raw.battery.charging),
        fast_charging_w: toNumberOrUndefined(raw.battery.fast_charging_w),
        reverse_charging:
          typeof raw.battery.reverse_charging === 'boolean' ||
          typeof raw.battery.reverse_charging === 'string'
            ? raw.battery.reverse_charging
            : undefined,
      }
    : undefined;

  const camera = raw.camera
    ? {
        rear_setup: toStringOrUndefined(raw.camera.rear_setup),
        main_camera: toStringOrUndefined(raw.camera.main_camera),
        second_camera: toStringOrUndefined(raw.camera.second_camera),
        third_camera: toStringOrUndefined(raw.camera.third_camera),
        fourth_camera: toStringOrUndefined(raw.camera.fourth_camera),
        flash: toStringOrUndefined(raw.camera.flash),
        video_recording: toStringOrUndefined(raw.camera.video_recording),
        front_camera: toStringOrUndefined(raw.camera.front_camera),
      }
    : undefined;

  const connectivity = raw.connectivity
    ? {
        bluetooth: toStringOrUndefined(raw.connectivity.bluetooth),
        wlan: toStringOrUndefined(raw.connectivity.wlan),
        usb: toStringOrUndefined(raw.connectivity.usb),
        sensors: toStringOrUndefined(raw.connectivity.sensors),
        location: toStringOrUndefined(raw.connectivity.location),
        nfc: toBooleanOrUndefined(raw.connectivity.nfc),
        other: toStringOrUndefined(raw.connectivity.other),
      }
    : undefined;

  const cellular = raw.cellular
    ? {
        has_5g: toBooleanOrUndefined(raw.cellular.has_5g),
        bands_5g: toStringOrUndefined(raw.cellular.bands_5g),
        bands_4g: toStringOrUndefined(raw.cellular.bands_4g),
        bands_3g: toStringOrUndefined(raw.cellular.bands_3g),
        bands_2g: toStringOrUndefined(raw.cellular.bands_2g),
        technology: toStringOrUndefined(raw.cellular.technology),
        data_speed: toStringOrUndefined(raw.cellular.data_speed),
        sim_type: toStringOrUndefined(raw.cellular.sim_type),
        volte: toBooleanOrUndefined(raw.cellular.volte),
        vowifi: toBooleanOrUndefined(raw.cellular.vowifi),
      }
    : undefined;

  const multimedia = raw.multimedia
    ? {
        loudspeaker: toStringOrUndefined(raw.multimedia.loudspeaker),
        headphone_jack_35mm: toBooleanOrUndefined(raw.multimedia.headphone_jack_35mm),
        audio_features: toStringOrUndefined(raw.multimedia.audio_features),
      }
    : undefined;

  const regulatory = raw.regulatory
    ? {
        fcc_approval: toStringOrUndefined(raw.regulatory.fcc_approval),
        sar_head: toStringOrUndefined(raw.regulatory.sar_head),
        sar_body: toStringOrUndefined(raw.regulatory.sar_body),
        sar_simultaneous: toStringOrUndefined(raw.regulatory.sar_simultaneous),
        certifications: toStringOrUndefined(raw.regulatory.certifications),
      }
    : undefined;

  const candidateSpecs: ProductSpecifications = {
    availability,
    design,
    display,
    hardware,
    battery,
    camera,
    connectivity,
    cellular,
    multimedia,
    regulatory,
  };

  const parsed = ProductSpecificationsSchema.safeParse(candidateSpecs);
  return parsed.success ? parsed.data : {};
}

/**
 * Provider-Agnostic AI Spec Enricher
 * Populates the 10 Field Groups (PhoneArena structure + GSMArena depth) for any mobile device.
 * Supports: OpenAI, DOS-AI Gateway, Gemini, DeepSeek, Groq, OpenRouter, Ollama (or any OpenAI-compatible API).
 */
export class AiSpecEnricher {
  private provider: SupportedAiProvider;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;
  private temperature: number;
  private memoryCache = new Map<string, AiEnrichmentResponse>();

  constructor(config: AiSpecEnricherConfig = {}) {
    this.provider = this.resolveProvider(config.provider);
    const defaults = PROVIDER_DEFAULTS[this.provider];

    this.apiKey = config.apiKey ?? this.resolveApiKey(this.provider);
    this.baseUrl = (
      config.baseUrl ||
      process.env.AI_BASE_URL ||
      process.env.DOS_AI_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      defaults.baseUrl
    ).replace(/\/+$/, '');

    this.model =
      config.model || process.env.AI_MODEL || process.env.OPENAI_MODEL || defaults.defaultModel;

    this.timeoutMs = config.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS || 25000);
    this.temperature = config.temperature ?? 0.1;
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

  /**
   * Builds the system & user prompts referencing PhoneArena 10-Field-Group structure and GSMArena technical accuracy
   */
  private buildPrompts(
    brand: string,
    model: string,
    storageGb: number | null,
    ramGb: number | null,
    rawTitle?: string,
    rawDescription?: string
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a mobile hardware specification database expert with authoritative knowledge of PhoneArena and GSMArena device specifications.
Your job is to return accurate, comprehensive technical specifications for a smartphone model, structured into the 10 standard PhoneArena Field Groups (with GSMArena technical precision).

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

    const userPrompt = [
      `Target Smartphone:`,
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
  }): Promise<AiEnrichmentResponse | null> {
    if (!this.isConfigured()) {
      console.log(
        `[AiSpecEnricher] Skipped AI call for "${params.brand} ${params.model}" (no API key configured for provider "${this.provider}").`
      );
      return null;
    }

    const cacheKey = `${params.brand.toLowerCase()}:${params.model.toLowerCase()}:${params.storageGb || 'default'}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      console.log(`[AiSpecEnricher] Cache hit for "${cacheKey}"`);
      return cached;
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(
      params.brand,
      params.model,
      params.storageGb,
      params.ramGb,
      params.rawTitle,
      params.rawDescription
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

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

      const data = (await response.json()) as any;
      const rawContent: string | undefined = data?.choices?.[0]?.message?.content;
      if (!rawContent) {
        logger.warn('spec_enrich.empty_response', `Empty message content from ${this.provider}`, {
          provider: this.provider,
        });
        return null;
      }

      const cleanedJson = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsedJson = JSON.parse(cleanedJson);
      const specifications = sanitizeSpecifications(parsedJson.specifications || parsedJson);

      const ramGb =
        params.ramGb ??
        toNumberOrUndefined(parsedJson.ram_gb) ??
        specifications.hardware?.ram_gb ??
        null;

      const storageGb =
        params.storageGb ??
        toNumberOrUndefined(parsedJson.storage_gb) ??
        specifications.hardware?.storage_gb ??
        null;

      const screenSizeInch =
        toNumberOrUndefined(parsedJson.screen_size_inch) ??
        specifications.display?.size_inch ??
        null;

      const batteryMah =
        toNumberOrUndefined(parsedJson.battery_mah) ?? specifications.battery?.capacity_mah ?? null;

      const has5g = toBooleanOrUndefined(parsedJson.has_5g) ?? specifications.cellular?.has_5g;

      if (specifications.hardware) {
        if (ramGb !== null) specifications.hardware.ram_gb = ramGb;
        if (storageGb !== null) specifications.hardware.storage_gb = storageGb;
      }

      const rawKeySpecs = parsedJson.key_specs || {};
      const keySpecsCandidate: KeySpecs = {
        screen:
          toStringOrUndefined(rawKeySpecs.screen) ||
          (screenSizeInch
            ? `${screenSizeInch}" ${specifications.display?.type?.split(',')[0] || 'OLED'}`
            : undefined),
        chip:
          toStringOrUndefined(rawKeySpecs.chip) ||
          specifications.hardware?.chipset?.split('(')[0]?.trim(),
        camera:
          toStringOrUndefined(rawKeySpecs.camera) ||
          specifications.camera?.main_camera?.split(',')[0]?.trim(),
        battery:
          toStringOrUndefined(rawKeySpecs.battery) ||
          (batteryMah
            ? `${batteryMah} mAh${specifications.battery?.fast_charging_w ? ` (${specifications.battery.fast_charging_w}W)` : ''}`
            : undefined),
        storage:
          storageGb !== null
            ? storageGb >= 1024
              ? `${storageGb / 1024}TB`
              : `${storageGb}GB`
            : toStringOrUndefined(rawKeySpecs.storage),
        ram: ramGb !== null ? `${ramGb}GB` : toStringOrUndefined(rawKeySpecs.ram),
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

      this.memoryCache.set(cacheKey, result);
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
      return result;
    } catch (err: any) {
      logger.warn(
        'spec_enrich.failed',
        `Failed to enrich "${params.brand} ${params.model}": ${err?.message || err}`,
        { brand: params.brand, deviceModel: params.model }
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Enriches a NormalizedProductCandidate in-place (and returns it) if it wasn't already
   * enriched by the canonical benchmark registry.
   */
  public async enrichCandidate(
    candidate: NormalizedProductCandidate,
    rawTitle?: string
  ): Promise<NormalizedProductCandidate> {
    if (candidate.is_benchmark_enriched) {
      return {
        ...candidate,
        spec_source: candidate.spec_source ?? 'benchmark_registry',
      };
    }

    const aiResult = await this.fetchSpecsFromAi({
      brand: candidate.brand,
      model: candidate.model,
      storageGb: candidate.storage_gb,
      ramGb: candidate.ram_gb,
      rawTitle,
      rawDescription: candidate.description,
    });

    if (!aiResult) {
      return candidate;
    }

    // Merge colors from crawled variations if available
    if (candidate.colors.length > 0 && aiResult.specifications.design) {
      aiResult.specifications.design.colors = candidate.colors;
    }

    return {
      ...candidate,
      ram_gb: candidate.ram_gb ?? aiResult.ram_gb ?? null,
      screen_size_inch: aiResult.screen_size_inch ?? candidate.screen_size_inch,
      battery_mah: aiResult.battery_mah ?? candidate.battery_mah,
      has_5g: aiResult.has_5g ?? candidate.has_5g,
      specifications: aiResult.specifications,
      key_specs: {
        ...candidate.key_specs,
        ...aiResult.key_specs,
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
