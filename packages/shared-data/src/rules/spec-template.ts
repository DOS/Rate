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
  /** `key_specs` entries that apply. */
  keySpecs: readonly KeySpecKey[];
  /** Whether the top-level `ram_gb` / `storage_gb` / `screen_size_inch` apply. */
  ram: boolean;
  storage: boolean;
  screen: boolean;
  /** 5G is a phone and tablet fact; watches sell as LTE / GPS + Cellular. */
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
  keySpecs: ALL_KEY_SPECS,
  ram: true,
  storage: true,
  screen: true,
  has5g: true,
};

const SPEC_TEMPLATES: Readonly<Record<string, CategorySpecTemplate>> = {
  smartphones: PHONE_TEMPLATE,
  tablets: PHONE_TEMPLATE,
  laptops: { ...PHONE_TEMPLATE, has5g: false },
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
    hiddenFields: {
      hardware: ['gpu', 'storage_expansion'],
      cellular: ['has_5g', 'bands_5g'],
    },
    keySpecs: ['screen', 'chip', 'battery', 'storage'],
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
      'design',
      'availability',
      'regulatory',
    ],
    hiddenFields: {
      design: ['biometrics'],
      connectivity: ['wlan', 'location', 'nfc'],
      multimedia: ['headphone_jack_35mm'],
    },
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

/** Whether a field of a group applies to the category. */
export function specFieldApplies(
  template: CategorySpecTemplate,
  group: SpecGroupKey,
  field: string
): boolean {
  return (
    template.groups.includes(group) &&
    !(template.hiddenFields[group] ?? []).includes(field)
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

/**
 * A copy of a product with the spec groups, fields and flat columns its
 * category does not have removed. Fields outside the ten groups (such as
 * `category_slug`) are kept. Values the category has are never changed, so
 * applying it twice gives the same result.
 */
export function applyCategorySpecTemplate<T extends CategoryScopedSpecs>(
  categorySlug: string | null | undefined,
  product: T
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
      const hidden = template.hiddenFields[group as SpecGroupKey];
      if (hidden && isRecord(value)) {
        specs[group] = Object.fromEntries(
          Object.entries(value).filter(([field]) => !hidden.includes(field))
        );
      } else {
        specs[group] = value;
      }
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
  if (!template.has5g && 'has_5g' in product) out.has_5g = false;
  return out;
}
