/**
 * Which spec groups and fields apply to each category (DOS/Rate#1142).
 *
 * The spec schema is one phone-shaped schema for every device, and the AI
 * enricher fills it for earbuds and watches too: earbuds came out with a
 * "1 inch" screen, 1GB RAM and microphones as cameras, and a cellular watch
 * with 5G. rate.vn renders each category with its own template, and the
 * importer drops the fields a category does not have before it writes a
 * master. Plain data and functions only, like the rest of `rules`.
 */

export type SpecGroupKey =
  | 'display'
  | 'hardware'
  | 'camera'
  | 'battery'
  | 'design'
  | 'cellular'
  | 'connectivity'
  | 'multimedia'
  | 'availability'
  | 'regulatory';

export type KeySpecKey =
  'screen' | 'chip' | 'camera' | 'battery' | 'storage' | 'ram';

export interface CategorySpecTemplate {
  /** Groups the category has, in display order. */
  groups: readonly SpecGroupKey[];
  /** Fields of a listed group that the category does not have. */
  hiddenFields: Partial<Record<SpecGroupKey, readonly string[]>>;
  /**
   * Fields the page does not show although a model may really have them, so
   * the importer keeps them: a few watches do carry 5G (RedCap).
   */
  displayHiddenFields: Partial<Record<SpecGroupKey, readonly string[]>>;
  /** `key_specs` entries that apply. */
  keySpecs: readonly KeySpecKey[];
  /** Whether the top-level `ram_gb` / `storage_gb` / `screen_size_inch` apply. */
  ram: boolean;
  storage: boolean;
  screen: boolean;
  /**
   * Whether the page shows 5G. Watches sell as LTE / GPS + Cellular and the
   * enricher flags them 5G wrongly; the stored flag is cleared only for a
   * category without a cellular group.
   */
  has5g: boolean;
}

const ALL_GROUPS: readonly SpecGroupKey[] = [
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
];

const ALL_KEY_SPECS: readonly KeySpecKey[] = [
  'screen',
  'chip',
  'camera',
  'battery',
  'storage',
  'ram',
];

const PHONE_TEMPLATE: CategorySpecTemplate = {
  groups: ALL_GROUPS,
  hiddenFields: {},
  displayHiddenFields: {},
  keySpecs: ALL_KEY_SPECS,
  ram: true,
  storage: true,
  screen: true,
  has5g: true,
};

const SPEC_TEMPLATES: Readonly<Record<string, CategorySpecTemplate>> = {
  smartphones: PHONE_TEMPLATE,
  tablets: PHONE_TEMPLATE,
  // Laptops keep the full template: some ship with 5G modems.
  laptops: PHONE_TEMPLATE,
  smartwatches: {
    groups: [
      'display',
      'hardware',
      'battery',
      'design',
      'cellular',
      'connectivity',
      'multimedia',
      'availability',
      'regulatory',
    ],
    hiddenFields: {},
    displayHiddenFields: {
      hardware: ['gpu', 'storage_expansion'],
      cellular: ['has_5g', 'bands_5g'],
    },
    keySpecs: ['screen', 'chip', 'battery', 'storage', 'ram'],
    ram: true,
    storage: true,
    screen: true,
    has5g: false,
  },
  earbuds: {
    groups: [
      'multimedia',
      'battery',
      'connectivity',
      'hardware',
      'design',
      'availability',
      'regulatory',
    ],
    hiddenFields: {
      // The audio chip (Apple H2, BES2700) is the one hardware fact earbuds have.
      hardware: [
        'cpu',
        'gpu',
        'ram_gb',
        'storage_gb',
        'storage_expansion',
        'os',
      ],
      design: ['biometrics'],
      connectivity: ['wlan', 'location', 'nfc'],
      multimedia: ['headphone_jack_35mm'],
    },
    displayHiddenFields: {},
    keySpecs: ['chip', 'battery'],
    ram: false,
    storage: false,
    screen: false,
    has5g: false,
  },
};

const normalizeSlug = (categorySlug: unknown): string =>
  typeof categorySlug === 'string' ? categorySlug.trim().toLowerCase() : '';

/** The template for a category slug; unknown slugs keep the full phone template. */
export function getCategorySpecTemplate(
  categorySlug: string | null | undefined
): CategorySpecTemplate {
  return SPEC_TEMPLATES[normalizeSlug(categorySlug)] ?? PHONE_TEMPLATE;
}

const hiddenIn = (
  template: CategorySpecTemplate,
  group: SpecGroupKey,
  forStorage: boolean
): readonly string[] => [
  ...(template.hiddenFields[group] ?? []),
  ...(forStorage ? [] : (template.displayHiddenFields[group] ?? [])),
];

/** Whether the page shows a field of a group for the category. */
export function specFieldApplies(
  template: CategorySpecTemplate,
  group: SpecGroupKey,
  field: string
): boolean {
  return (
    template.groups.includes(group) &&
    !hiddenIn(template, group, false).includes(field)
  );
}

export interface CategoryScopedSpecs {
  specifications?: unknown;
  key_specs?: unknown;
  ram_gb?: number | null;
  storage_gb?: number | null;
  screen_size_inch?: number | null;
  has_5g?: boolean | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Free-text cellular fields the enricher writes for a watch, such as
// "LTE / 5G" (DOS/Rate#1166).
const FREE_TEXT_CELLULAR_FIELDS = ['technology', 'data_speed', 'sim_type'];
const CELLULAR_SEPARATOR_RE = /\s*[/,|;]\s*/;
// A bracketed 5G note, as in "LTE (5G RedCap)".
const FIVE_G_BRACKET_RE = /\s*\([^()]*\b5G\b[^()]*\)/gi;
// "5G" with its qualifiers, also slash-joined ones: "5G SA/NSA/Sub6",
// "5G NR Sub-6", "5G-ready".
const FIVE_G_PHRASE_RE =
  /\b5G\b(?:(?:\s*\/\s*|[\s-]*)(?:NR|SA|NSA|Sub-?6(?:\s*GHz)?|mmWave|RedCap|ready)\b)*/gi;

/** The text without its 5G parts, or null when nothing else is left. */
const withoutFiveG = (text: string): string | null => {
  const stripped = text
    .replace(FIVE_G_BRACKET_RE, '')
    .replace(FIVE_G_PHRASE_RE, '');
  const kept = stripped
    .split(CELLULAR_SEPARATOR_RE)
    .map((part) =>
      part
        .replace(/\s+/g, ' ')
        .replace(/^[\s-]+|[\s(-]+$/g, '')
        .trim()
    )
    .filter(Boolean);
  if (kept.length === 0) return null;
  const separator = CELLULAR_SEPARATOR_RE.exec(text)?.[0] ?? ' / ';
  return kept.join(separator);
};

const withoutFiveGText = (
  cellular: Record<string, unknown>
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...cellular };
  for (const field of FREE_TEXT_CELLULAR_FIELDS) {
    const value = out[field];
    if (typeof value !== 'string' || !/\b5G\b/i.test(value)) continue;
    const cleaned = withoutFiveG(value);
    if (cleaned === null) delete out[field];
    else out[field] = cleaned;
  }
  return out;
};

/**
 * A copy of a product with the spec groups, fields and flat columns its
 * category does not have removed. Fields outside the ten groups (such as
 * `category_slug`) are kept. Values the category has are never changed,
 * except that display mode drops the 5G parts of a free-text network field
 * ("LTE / 5G" becomes "LTE") for a category that hides 5G, so applying it
 * twice gives the same result. It only narrows: removed flat
 * columns become `null` (`has_5g` becomes `false`) and groups lose keys, so
 * callers should type those fields as nullable, as the row types do.
 *
 * `forStorage` (the importer) removes only what the category cannot have and
 * keeps what the page merely hides, such as a watch's real 5G support.
 */
export function applyCategorySpecTemplate<T extends CategoryScopedSpecs>(
  categorySlug: string | null | undefined,
  product: T,
  { forStorage = false }: { forStorage?: boolean } = {}
): T {
  const template = getCategorySpecTemplate(categorySlug);
  if (template === PHONE_TEMPLATE) return product;
  const out: T = { ...product };

  if (isRecord(product.specifications)) {
    const specs: Record<string, unknown> = {};
    for (const [group, value] of Object.entries(product.specifications)) {
      if (!(ALL_GROUPS as readonly string[]).includes(group)) {
        specs[group] = value;
        continue;
      }
      if (!template.groups.includes(group as SpecGroupKey)) continue;
      const hidden = hiddenIn(template, group as SpecGroupKey, forStorage);
      if (hidden.length > 0 && isRecord(value)) {
        specs[group] = Object.fromEntries(
          Object.entries(value).filter(([field]) => !hidden.includes(field))
        );
      } else {
        specs[group] = value;
      }
    }
    // The page hides 5G for the category, so it also leaves it out of the
    // free-text network fields.
    const shownCellular = specs.cellular;
    if (!forStorage && !template.has5g && isRecord(shownCellular)) {
      specs.cellular = withoutFiveGText(shownCellular);
    }
    out.specifications = specs;
  }

  if (isRecord(product.key_specs)) {
    out.key_specs = Object.fromEntries(
      Object.entries(product.key_specs).filter(([key]) =>
        (template.keySpecs as readonly string[]).includes(key)
      )
    );
  }

  if (!template.ram && 'ram_gb' in product) out.ram_gb = null;
  if (!template.storage && 'storage_gb' in product) out.storage_gb = null;
  if (!template.screen && 'screen_size_inch' in product)
    out.screen_size_inch = null;
  const shows5g = forStorage
    ? template.groups.includes('cellular')
    : template.has5g;
  if (!shows5g && 'has_5g' in product) out.has_5g = false;
  return out;
}
