/**
 * DOS/Rate#1758 & DOS/Rate#1855: flagship seed and canonical entries carried template values
 * copied from the arena spec syncer's old defaults, the normalizer's generic fallbacks, and
 * cross-category placeholders, and the backfill wrote them to Production. Each one is now a
 * value an explicit per-field source states, or gone (with a retraction in
 * `retract_spec_fields`, since the backfill's merge never deletes a stored field). Group-level
 * `sources.<group>` entries never excuse template-shaped or cross-category field values.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductSpecificationsSchema, type ProductSpecifications } from '@repo/shared-data';
import {
  CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY,
  FLAGSHIP_DEVICES_TO_SEED,
  flagshipSeedsByItem,
  type FlagshipDeviceSeed,
} from '../flagship-seed-data.js';
import { requiredSpecGroups, seedMasterSpecUpdate } from '../jobs/backfill-specs.js';
import { ProductNormalizer } from '../product-normalizer.js';
import type { ShopeeProduct } from '../types.js';

interface Entry {
  key: string;
  categorySlug?: FlagshipDeviceSeed['categorySlug'];
  has_5g?: boolean;
  specifications: ProductSpecifications;
  sources?: Readonly<Record<string, string>>;
}

const ENTRIES: Entry[] = [
  ...FLAGSHIP_DEVICES_TO_SEED.map(s => ({ ...s, key: s.model_key })),
  ...Object.entries(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY).map(([key, e]) => ({
    ...e,
    key,
    categorySlug: 'smartphones' as const,
  })),
];

const at = (specs: ProductSpecifications, path: string): unknown => {
  const [group, field] = path.split('.') as [string, string];
  return (specs as Record<string, Record<string, unknown> | undefined>)[group]?.[field];
};

// The arena syncer's former page-omitted defaults (removed in DOS/Rate#1754) and the
// normalizer's generic fallbacks.
const TEMPLATE_VALUES: ReadonlyArray<readonly [string, string]> = [
  ['regulatory.certifications', 'CE, FCC, RoHS, QCVN (BTTTT Vietnam)'],
  ['multimedia.audio_features', '24-bit/192kHz Hi-Res & Hi-Res Wireless audio'],
  ['multimedia.loudspeaker', 'Stereo speakers, Dolby Atmos'],
  ['camera.flash', 'LED Flash, HDR, Panorama'],
  ['camera.flash', 'LED flash, auto-HDR, panorama'],
  ['cellular.sim_type', 'Dual SIM (Nano-SIM + eSIM)'],
  ['cellular.sim_type', '2 Nano-SIM + eSIM'],
  ['cellular.data_speed', '5G, LTE-A'],
  ['connectivity.bluetooth', '5.3, A2DP, LE'],
];

const BLUETOOTH_PROFILES_RE = /\b\d+(?:\.\d+)?,\s*A2DP\b/i;
const CERT_CODES_RE = /\b(?:CE|FCC|NCC|KC|VCCI|SRRC|SDPPI|SIRIM|NBTC|IMDA|NTRA)\b|\bQCVN\d*\b/;
const TWO_BAND_NUMBERS_RE = /\bn?\d{1,3}\b.*\bn?\d{1,3}\b/;
const BARE_NEGATIVE_PLACEHOLDER_RE = /^\s*(?:none|no|n\/a)\s*$/i;
const NON_CELLULAR_PLACEHOLDER_RE = /^\s*(?:no\b|none\b|n\/a\b|wi-?fi\b|bluetooth\b)/i;

const LAPTOP_REAR_CAMERA_PATHS = [
  'camera.rear_setup',
  'camera.main_camera',
  'camera.second_camera',
  'camera.third_camera',
  'camera.fourth_camera',
  'camera.flash',
] as const;

const CELLULAR_DETAIL_PATHS = [
  'cellular.bands_5g',
  'cellular.bands_4g',
  'cellular.bands_3g',
  'cellular.bands_2g',
  'cellular.technology',
  'cellular.data_speed',
  'cellular.sim_type',
  'cellular.volte',
  'cellular.vowifi',
] as const;

// DOS/Rate#1855: template-shaped and cross-category values require an explicit field-level
// `sources[path]` URL. A group-level `sources.<group>` never excuses them.
const citesField = (entry: Entry, path: string): boolean => Boolean(entry.sources?.[path]);

function findTemplateViolations(entry: Entry): string[] {
  const issues: string[] = [];

  for (const [path, value] of TEMPLATE_VALUES) {
    if (at(entry.specifications, path) === value && !citesField(entry, path)) {
      issues.push(`${entry.key}: unsourced template ${path} = ${JSON.stringify(value)}`);
    }
  }

  const bluetooth = at(entry.specifications, 'connectivity.bluetooth');
  if (
    typeof bluetooth === 'string' &&
    BLUETOOTH_PROFILES_RE.test(bluetooth) &&
    !citesField(entry, 'connectivity.bluetooth')
  ) {
    issues.push(`${entry.key}: unsourced Bluetooth profile connectivity.bluetooth = ${bluetooth}`);
  }

  const certifications = at(entry.specifications, 'regulatory.certifications');
  if (
    typeof certifications === 'string' &&
    CERT_CODES_RE.test(certifications) &&
    !citesField(entry, 'regulatory.certifications')
  ) {
    issues.push(
      `${entry.key}: unsourced regulatory codes regulatory.certifications = ${certifications}`
    );
  }

  const bands5g = at(entry.specifications, 'cellular.bands_5g');
  if (bands5g !== undefined) {
    const text = String(bands5g);
    const hasExplicitBands =
      TWO_BAND_NUMBERS_RE.test(text) && !BARE_NEGATIVE_PLACEHOLDER_RE.test(text);
    if (!hasExplicitBands && !citesField(entry, 'cellular.bands_5g')) {
      issues.push(`${entry.key}: unsourced 5G band text cellular.bands_5g = ${text}`);
    }
    if (/SA\/NSA\/Sub6/i.test(text) && !TWO_BAND_NUMBERS_RE.test(text)) {
      if (!citesField(entry, 'cellular.bands_5g')) {
        issues.push(`${entry.key}: bare SA/NSA/Sub6 cellular.bands_5g = ${text}`);
      }
    }
  }

  if (entry.categorySlug === 'laptops') {
    for (const path of LAPTOP_REAR_CAMERA_PATHS) {
      const val = at(entry.specifications, path);
      if (val !== undefined && !citesField(entry, path)) {
        issues.push(`${entry.key}: unsourced laptop rear-camera field ${path} = ${String(val)}`);
      }
    }
  }

  if (
    entry.has_5g === false &&
    (entry.categorySlug === 'tablets' || entry.categorySlug === 'laptops')
  ) {
    for (const path of CELLULAR_DETAIL_PATHS) {
      const val = at(entry.specifications, path);
      if (val !== undefined && !citesField(entry, path)) {
        issues.push(
          `${entry.key}: unsourced Wi-Fi-only ${entry.categorySlug} cellular field ${path} = ${String(val)}`
        );
      }
    }
  }

  for (const group of ['camera', 'cellular', 'connectivity'] as const) {
    const groupObj = entry.specifications[group];
    if (!groupObj || typeof groupObj !== 'object') continue;
    for (const [field, val] of Object.entries(groupObj)) {
      if (typeof val !== 'string') continue;
      const path = `${group}.${field}`;
      if (citesField(entry, path)) continue;
      if (BARE_NEGATIVE_PLACEHOLDER_RE.test(val)) {
        issues.push(`${entry.key}: unsourced placeholder ${path} = ${JSON.stringify(val)}`);
      } else if (group === 'cellular' && NON_CELLULAR_PLACEHOLDER_RE.test(val)) {
        issues.push(
          `${entry.key}: unsourced non-cellular placeholder ${path} = ${JSON.stringify(val)}`
        );
      }
    }
  }

  return issues;
}

test('no seed or canonical entry holds an unsourced template or cross-category value', () => {
  for (const entry of ENTRIES) {
    assert.deepEqual(findTemplateViolations(entry), [], entry.key);
  }
});

test('group-level sources never mask template-shaped or cross-category field values (#1855)', () => {
  const groupSourcesOnly: Readonly<Record<string, string>> = {
    camera: 'https://www.apple.com/macbook-air/specs/',
    cellular: 'https://www.apple.com/ipad-pro/specs/',
    connectivity: 'https://www.apple.com/iphone-18-pro/specs/',
    multimedia: 'https://www.gsmarena.com/example.php',
    regulatory: 'https://www.apple.com/vn/iphone-18-pro/specs/',
  };

  const masked: Entry = {
    key: 'test:masked-by-group:256gb',
    categorySlug: 'laptops',
    has_5g: false,
    specifications: {
      camera: {
        rear_setup: 'None',
        second_camera: 'None',
        front_camera: '1080p FaceTime HD',
      },
      cellular: {
        has_5g: false,
        bands_5g: 'SA/NSA/Sub6',
        sim_type: 'No cellular',
      },
      connectivity: {
        bluetooth: '6.0, A2DP, LE',
      },
      multimedia: {
        audio_features: '24-bit/192kHz Hi-Res & Hi-Res Wireless audio',
      },
      regulatory: {
        certifications: 'CE, FCC, QCVN127',
      },
    },
    sources: groupSourcesOnly,
  };

  const violations = findTemplateViolations(masked);
  assert.ok(violations.some(v => v.includes('connectivity.bluetooth')));
  assert.ok(violations.some(v => v.includes('regulatory.certifications')));
  assert.ok(violations.some(v => v.includes('cellular.bands_5g')));
  assert.ok(violations.some(v => v.includes('multimedia.audio_features')));
  assert.ok(violations.some(v => v.includes('camera.rear_setup')));
  assert.ok(violations.some(v => v.includes('camera.second_camera')));
  assert.ok(violations.some(v => v.includes('cellular.sim_type')));

  // Explicit field-level sources clear only the exact cited paths.
  const fieldCited: Entry = {
    ...masked,
    sources: {
      ...groupSourcesOnly,
      'camera.rear_setup': 'https://www.apple.com/macbook-air/specs/',
      'camera.second_camera': 'https://www.apple.com/macbook-air/specs/',
      'cellular.bands_5g': 'https://www.apple.com/ipad-pro/specs/',
      'cellular.sim_type': 'https://www.apple.com/ipad-pro/specs/',
      'connectivity.bluetooth': 'https://www.apple.com/iphone-18-pro/specs/',
      'multimedia.audio_features': 'https://www.gsmarena.com/example.php',
      'regulatory.certifications': 'https://www.apple.com/vn/iphone-18-pro/specs/',
    },
  };
  assert.deepEqual(findTemplateViolations(fieldCited), []);
});

test('a 5G band field lists explicit bands or cites an official field-level source', () => {
  for (const entry of ENTRIES) {
    const bands = at(entry.specifications, 'cellular.bands_5g');
    if (bands === undefined) continue;
    const text = String(bands);
    if (/SA\/NSA\/Sub6/i.test(text)) {
      assert.match(text, TWO_BAND_NUMBERS_RE, `${entry.key}: ${text}`);
    }
    assert.ok(
      TWO_BAND_NUMBERS_RE.test(text) || citesField(entry, 'cellular.bands_5g'),
      `${entry.key}: ${text}`
    );
  }
});

test('every cited source is an https URL', () => {
  for (const entry of ENTRIES) {
    for (const [path, url] of Object.entries(entry.sources ?? {})) {
      assert.match(url, /^https:\/\/[^\s]+$/, `${entry.key}: ${path}`);
    }
  }
});

const byKey = (key: string): Entry => {
  const found = ENTRIES.find(e => e.key === key);
  assert.ok(found, key);
  return found;
};

test('the replaced values are the sourced ones (seeds and 2026 normalizer registry)', () => {
  const expected: Record<string, Record<string, string>> = {
    'apple:iphone-16:128gb': {
      'cellular.bands_5g':
        'FDD-5G NR n1/n2/n3/n5/n7/n8/n12/n20/n25/n26/n28/n30/n66/n70/n75/n76; TDD-5G NR n38/n40/n41/n48/n53/n77/n78/n79',
      'connectivity.bluetooth': '5.3',
      'regulatory.sar_head': '1.08 W/kg',
      'regulatory.sar_body': '1.17 W/kg',
    },
    'apple:iphone-16-pro-max:256gb': {
      'cellular.bands_5g':
        'FDD-5G NR n1/n2/n3/n5/n7/n8/n12/n14/n20/n25/n26/n28/n29/n30/n66/n70/n71/n75/n76; TDD-5G NR n38/n40/n41/n48/n53/n77/n78/n79',
    },
    'apple:iphone-16-plus:256gb': {
      'cellular.bands_5g':
        'FDD-5G NR n1/n2/n3/n5/n7/n8/n12/n20/n25/n26/n28/n30/n66/n70/n75/n76; TDD-5G NR n38/n40/n41/n48/n53/n77/n78/n79',
    },
    'apple:iphone-15:128gb': {
      'cellular.bands_5g':
        '5G NR n1/n2/n3/n5/n7/n8/n12/n20/n25/n26/n28/n30/n38/n40/n41/n48/n53/n66/n70/n75/n76/n77/n78/n79',
    },
    'apple:iphone-16-pro:256gb': {
      'cellular.bands_5g':
        'FDD-5G NR n1/n2/n3/n5/n7/n8/n12/n14/n20/n25/n26/n28/n29/n30/n66/n70/n71/n75/n76; TDD-5G NR n38/n40/n41/n48/n53/n77/n78/n79',
      'regulatory.sar_head': '1.09 W/kg',
      'regulatory.sar_body': '1.19 W/kg',
    },
    'samsung:galaxy-s24-ultra:256gb': {
      'cellular.bands_5g':
        'FDD Sub6 n1/n2/n3/n5/n7/n8/n12/n20/n25/n26/n28/n66; TDD Sub6 n38/n40/n41/n77/n78',
      'camera.flash': 'LED flash',
      'connectivity.bluetooth': '5.3',
    },
    'samsung:galaxy-tab-s10-ultra:256gb': {
      'cellular.bands_5g': '5G (Sub-6)',
      'connectivity.bluetooth': '5.3',
    },
    'xiaomi:14-ultra:512gb': {
      'cellular.bands_5g':
        '5G NR n1/n2/n3/n5/n7/n8/n20/n28/n38/n40/n41/n48/n66/n77/n78/n79 (n66 varies by region)',
    },
    'oppo:find-x8:256gb': {
      'cellular.bands_5g': '5G NR n1/n2/n3/n5/n7/n8/n12/n20/n28/n38/n40/n41/n66/n77/n78',
      'cellular.sim_type': 'Nano-SIM + eSIM (dual SIM)',
    },
    'oppo:find-x9-pro:512gb': { 'cellular.sim_type': 'Nano-SIM + Nano-SIM + eSIM' },
    'apple:ipad-pro-m5-11:256gb': {
      'cellular.bands_5g':
        '5G NR n1/n2/n3/n5/n7/n8/n12/n14/n20/n25/n26/n28/n29/n30/n38/n40/n41/n48/n66/n70/n71/n75/n77/n78/n79',
      'cellular.data_speed': '5G (sub-6 GHz) with 4x4 MIMO, Gigabit LTE with 4x4 MIMO',
      'connectivity.bluetooth': '6',
    },
    'apple:watch-ultra-3-49mm:64gb': {
      'cellular.bands_5g':
        'FDD-5G NR n1/n2/n3/n5/n7/n8/n12/n14/n20/n25/n26/n28/n66/n71; TDD-5G NR n38/n40/n41/n53',
      'connectivity.bluetooth': '5.3',
    },
    'apple:iphone-18-pro-max:256gb': { 'connectivity.bluetooth': '6' },
    'apple:iphone-18-pro:256gb': { 'connectivity.bluetooth': '6' },
    'samsung:galaxy-s26-ultra:256gb': { 'connectivity.bluetooth': '6.0' },
  };
  for (const [key, fields] of Object.entries(expected)) {
    const entry = byKey(key);
    for (const [path, value] of Object.entries(fields)) {
      assert.equal(at(entry.specifications, path), value, `${key}: ${path}`);
      assert.ok(entry.sources?.[path], `${key}: ${path} has no field-level source`);
    }
  }

  // DOS/Rate#1803 item 6: the normalizer registry carries the sourced Bluetooth versions too.
  const normalizer = new ProductNormalizer();
  const normalize = (title: string) =>
    normalizer.normalize({
      itemId: '1',
      shopId: '2',
      title,
      priceMin: 30_000_000,
      priceMax: 30_000_000,
      priceBeforeDiscount: 0,
      currency: 'VND',
      stock: 1,
      historicalSold: 1,
      ratingStar: 5,
      ratingCount: 1,
      images: [],
      models: [],
      attributes: [],
      shop: { shopId: '2' },
    } as unknown as ShopeeProduct);

  for (const [title, bt] of [
    ['Apple iPhone 18 Pro Max 256GB', '6'],
    ['Apple iPhone 18 Pro 256GB', '6'],
    ['Samsung Galaxy S26 Ultra 256GB', '6.0'],
  ] as const) {
    const out = normalize(title).specifications;
    assert.equal(out.connectivity?.bluetooth, bt, title);
    assert.doesNotMatch(out.connectivity?.bluetooth ?? '', BLUETOOTH_PROFILES_RE, title);
  }
});

// Fields no checked source states (including cross-category laptop/Wi-Fi placeholders):
// dropped from each seed and listed in `retract_spec_fields` so `seedMasterSpecUpdate`
// removes stale stored copies instead of keeping them on merge.
const RETRACTED_SUBSETS: Record<string, readonly string[]> = {
  'samsung:galaxy-s24-ultra:256gb': ['regulatory.certifications'],
  'apple:iphone-16-pro-max:256gb': ['regulatory.certifications'],
  'samsung:galaxy-a55:256gb': [
    'cellular.bands_5g',
    'connectivity.bluetooth',
    'regulatory.certifications',
  ],
  'xiaomi:14-ultra:512gb': ['connectivity.bluetooth', 'regulatory.certifications'],
  'oppo:find-x8:256gb': ['connectivity.bluetooth', 'regulatory.certifications'],
  'apple:ipad-pro-m4-11:256gb': [
    'cellular.technology',
    'cellular.sim_type',
    'cellular.volte',
    'cellular.vowifi',
    'regulatory.certifications',
  ],
  'apple:macbook-air-m3-13:256gb': [
    'camera.rear_setup',
    'camera.main_camera',
    'camera.second_camera',
    'cellular.technology',
    'cellular.sim_type',
    'cellular.volte',
    'cellular.vowifi',
    'regulatory.certifications',
  ],
  'apple:iphone-16-pro:256gb': ['regulatory.certifications'],
  'apple:watch-series-10-42mm:64gb': [
    'cellular.technology',
    'cellular.sim_type',
    'cellular.volte',
    'cellular.vowifi',
    'regulatory.certifications',
  ],
  'apple:airpods-pro-2-usbc:64gb': ['regulatory.certifications'],
  'samsung:galaxy-tab-s10-ultra:256gb': ['regulatory.certifications'],
  'xiaomi:pad-6s-pro:256gb': [
    'connectivity.bluetooth',
    'cellular.technology',
    'cellular.sim_type',
    'cellular.volte',
    'cellular.vowifi',
    'regulatory.certifications',
  ],
  'asus:zenbook-s-14:1024gb': [
    'camera.rear_setup',
    'camera.main_camera',
    'camera.second_camera',
    'cellular.technology',
    'cellular.sim_type',
    'cellular.volte',
    'cellular.vowifi',
  ],
  'lenovo:thinkpad-x1-carbon-gen-12:512gb': [
    'camera.rear_setup',
    'camera.main_camera',
    'camera.second_camera',
    'cellular.technology',
    'cellular.sim_type',
    'cellular.volte',
    'cellular.vowifi',
  ],
  'apple:watch-ultra-2:64gb': ['regulatory.certifications'],
  'samsung:galaxy-watch-ultra:32gb': ['connectivity.bluetooth', 'regulatory.certifications'],
  'garmin:forerunner-265:8gb': ['cellular.volte', 'cellular.vowifi', 'regulatory.certifications'],
  'sony:wf-1000xm5:64gb': ['connectivity.bluetooth', 'regulatory.certifications'],
  'samsung:galaxy-buds3-pro:64gb': ['connectivity.bluetooth', 'regulatory.certifications'],
  'xiaomi:18-pro-max:512gb': ['connectivity.bluetooth', 'regulatory.certifications'],
  'xiaomi:17-pro-max:512gb': [
    'cellular.sim_type',
    'connectivity.bluetooth',
    'multimedia.audio_features',
    'regulatory.certifications',
  ],
  'oppo:find-x9-pro:512gb': ['connectivity.bluetooth', 'regulatory.certifications'],
  'apple:ipad-pro-m5-11:256gb': ['regulatory.certifications'],
  'xiaomi:pad-7-pro:256gb': [
    'cellular.sim_type',
    'cellular.technology',
    'connectivity.bluetooth',
    'multimedia.audio_features',
    'regulatory.certifications',
  ],
  'apple:macbook-air-m4-13:256gb': [
    'camera.rear_setup',
    'camera.main_camera',
    'camera.second_camera',
    'cellular.sim_type',
    'cellular.technology',
    'regulatory.certifications',
  ],
  'apple:macbook-pro-m4-pro-14:512gb': [
    'camera.rear_setup',
    'camera.main_camera',
    'camera.second_camera',
    'cellular.sim_type',
    'cellular.technology',
    'regulatory.certifications',
  ],
  'apple:watch-series-11-46mm:64gb': ['regulatory.certifications'],
  'apple:watch-ultra-3-49mm:64gb': ['regulatory.certifications'],
  'apple:airpods-pro-3:standard': ['connectivity.bluetooth', 'regulatory.certifications'],
  'sony:wf-1000xm6:standard': ['connectivity.bluetooth', 'regulatory.certifications'],
};

test('fields no source states are dropped and retracted from stored rows', () => {
  // Every seed's `retract_spec_fields` is deduplicated and never overlaps a field the seed sets.
  for (const seed of FLAGSHIP_DEVICES_TO_SEED) {
    const retracted = seed.retract_spec_fields ?? [];
    assert.equal(new Set(retracted).size, retracted.length, `${seed.model_key}: duplicate retract`);
    for (const path of retracted) {
      if (path.startsWith('key_specs.')) {
        const keyField = path.slice('key_specs.'.length);
        assert.equal(
          (seed.key_specs as Record<string, unknown>)[keyField],
          undefined,
          `${seed.model_key} still sets ${path}`
        );
      } else {
        assert.equal(
          at(seed.specifications, path),
          undefined,
          `${seed.model_key} still sets ${path}`
        );
      }
    }
  }

  const items = flagshipSeedsByItem();
  for (const [key, paths] of Object.entries(RETRACTED_SUBSETS)) {
    const seed = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === key);
    assert.ok(seed, key);
    const retractedSet = new Set(seed.retract_spec_fields ?? []);
    for (const path of paths) {
      assert.ok(retractedSet.has(path), `${key}: missing retract_spec_fields entry ${path}`);
      assert.equal(at(seed.specifications, path), undefined, `${key} still sets ${path}`);
    }

    // The Item carries every retraction of its variants too.
    const item = items.find(i => key.startsWith(`${i.itemKey}:`));
    assert.ok(item, key);
    for (const path of paths) {
      assert.ok(item.retract_spec_fields.includes(path), `${key}: Item missing ${path}`);
    }

    // `seedMasterSpecUpdate` removes the stale stored template/placeholder values instead of
    // keeping them, and the resulting specifications pass schema and 10-group checks.
    const stored = {
      specifications: {
        camera: {
          rear_setup: 'None',
          main_camera: '1080p Webcam',
          second_camera: 'None',
          front_camera: '1080p Webcam',
        },
        cellular: {
          has_5g: false,
          bands_5g: 'SA/NSA/Sub6',
          technology: 'Wi-Fi Only',
          sim_type: 'No cellular',
          volte: false,
          vowifi: true,
        },
        connectivity: { bluetooth: '5.3, A2DP, LE' },
        multimedia: { audio_features: '24-bit/192kHz Hi-Res & Hi-Res Wireless audio' },
        regulatory: { certifications: 'CE, FCC, RoHS, QCVN (BTTTT Vietnam)' },
      },
      key_specs: {},
    };
    const update = seedMasterSpecUpdate(stored, seed) as {
      specifications: ProductSpecifications;
    };
    for (const path of paths) {
      assert.equal(at(update.specifications, path), undefined, `${key} keeps stored ${path}`);
    }
    const parsed = ProductSpecificationsSchema.safeParse(update.specifications);
    assert.equal(parsed.success, true, `${key}: ${parsed.error?.message}`);
    for (const grp of requiredSpecGroups(seed.categorySlug)) {
      assert.ok(update.specifications[grp], `${key}: missing group ${grp} after retraction`);
    }
  }
});

// DOS/Rate#1785: `xiaomi:pad-7-pro:256gb` was labelled "8GB/256GB" while it stored 12GB of RAM
// (Xiaomi ships 12GB only with 512GB). The backfill writes the label onto the master product,
// so a label, `ram_gb`, `specifications.hardware.ram_gb` and `key_specs.ram` must agree.
const labelRamGb = (variantName: string): number | null => {
  const m = /(?:^|[^\d])(\d{1,2})\s*GB\s*[/+]\s*\d+\s*(?:GB|TB)\b/i.exec(variantName);
  return m ? Number(m[1]) : null;
};

test('a seed variant label that names RAM agrees with every stored RAM value', () => {
  assert.equal(labelRamGb('8GB/256GB'), 8);
  assert.equal(labelRamGb('12GB + 512GB'), 12);
  assert.equal(labelRamGb('256GB'), null);
  assert.equal(labelRamGb('1TB'), null);
  for (const seed of FLAGSHIP_DEVICES_TO_SEED) {
    const ram = labelRamGb(seed.variant_name);
    if (ram === null) continue;
    assert.equal(seed.ram_gb, ram, `${seed.model_key}: ram_gb vs "${seed.variant_name}"`);
    const hardwareRam = (seed.specifications as { hardware?: { ram_gb?: unknown } }).hardware
      ?.ram_gb;
    if (hardwareRam !== undefined) {
      assert.equal(
        hardwareRam,
        ram,
        `${seed.model_key}: hardware.ram_gb vs "${seed.variant_name}"`
      );
    }
    const keyRam = (seed.key_specs as { ram?: unknown }).ram;
    if (typeof keyRam === 'string') {
      // "12GB" or "16GB LPDDR5T": the leading size is what must agree.
      const keyRamGb = /^\s*(\d{1,2})\s*GB\b/i.exec(keyRam);
      assert.ok(keyRamGb, `${seed.model_key}: key_specs.ram "${keyRam}"`);
      assert.equal(
        Number(keyRamGb[1]),
        ram,
        `${seed.model_key}: key_specs.ram vs "${seed.variant_name}"`
      );
    }
  }
});

test('xiaomi:pad-7-pro:256gb is the official 8GB + 256GB configuration', () => {
  const seed = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === 'xiaomi:pad-7-pro:256gb');
  assert.ok(seed);
  assert.equal(seed.variant_name, '8GB/256GB');
  assert.equal(seed.ram_gb, 8);
  assert.equal(seed.key_specs.ram, '8GB');
  assert.equal(
    seed.sources?.['hardware.ram_gb'],
    'https://www.mi.com/global/product/xiaomi-pad-7-pro/specs/'
  );
});
