/**
 * DOS/Rate#1758: flagship seed and canonical entries carried template values copied from the
 * arena spec syncer's old defaults and the normalizer's generic fallbacks, and the backfill
 * wrote them to Production. Each one is now a value a cited source states, or gone (with a
 * retraction, since the backfill's merge never deletes a stored field).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductSpecifications } from '@repo/shared-data';
import {
  CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY,
  FLAGSHIP_DEVICES_TO_SEED,
  flagshipSeedsByItem,
} from '../flagship-seed-data.js';
import { seedMasterSpecUpdate } from '../jobs/backfill-specs.js';

interface Entry {
  key: string;
  specifications: ProductSpecifications;
  sources?: Readonly<Record<string, string>>;
}

const ENTRIES: Entry[] = [
  ...FLAGSHIP_DEVICES_TO_SEED.map(s => ({ ...s, key: s.model_key })),
  ...Object.entries(CANONICAL_BACKFILL_SPECS_BY_MODEL_KEY).map(([key, e]) => ({ ...e, key })),
];

const at = (specs: ProductSpecifications, path: string): unknown => {
  const [group, field] = path.split('.') as [string, string];
  return (specs as Record<string, Record<string, unknown> | undefined>)[group]?.[field];
};

// The arena syncer's former page-omitted defaults (removed in DOS/Rate#1754, still in
// `arena-spec-syncer.ts` for the cellular ones) and the normalizer's generic fallbacks.
// A seed may hold one only where its `sources` cite that field.
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

test('no seed or canonical entry holds an unsourced template value', () => {
  for (const entry of ENTRIES) {
    for (const [path, value] of TEMPLATE_VALUES) {
      if (at(entry.specifications, path) !== value) continue;
      assert.ok(entry.sources?.[path], `${entry.key}: unsourced template ${path} = ${value}`);
    }
  }
});

test('a 5G band field always lists bands', () => {
  for (const entry of ENTRIES) {
    const bands = at(entry.specifications, 'cellular.bands_5g');
    if (bands === undefined) continue;
    assert.doesNotMatch(String(bands), /^\s*(5G\s+)?SA\/NSA\/Sub6\s*$/i, entry.key);
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

test('the replaced values are the sourced ones', () => {
  const expected: Record<string, Record<string, string>> = {
    'apple:iphone-16:128gb': {
      'connectivity.bluetooth': '5.3',
      'regulatory.sar_head': '1.08 W/kg',
      'regulatory.sar_body': '1.17 W/kg',
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
      'cellular.data_speed': '5G (sub-6 GHz) with 4x4 MIMO, Gigabit LTE with 4x4 MIMO',
    },
  };
  for (const [key, fields] of Object.entries(expected)) {
    const entry = byKey(key);
    for (const [path, value] of Object.entries(fields)) {
      assert.equal(at(entry.specifications, path), value, `${key}: ${path}`);
      assert.ok(entry.sources?.[path], `${key}: ${path} has no source`);
    }
  }
});

// Fields no checked source states: dropped from the seed and retracted from stored rows.
const RETRACTED: Record<string, string[]> = {
  'samsung:galaxy-a55:256gb': ['cellular.bands_5g', 'connectivity.bluetooth'],
  'xiaomi:17-pro-max:512gb': [
    'cellular.sim_type',
    'multimedia.audio_features',
    'regulatory.certifications',
  ],
  'xiaomi:pad-7-pro:256gb': ['multimedia.audio_features'],
};

test('fields no source states are dropped and retracted from stored rows', () => {
  for (const [key, paths] of Object.entries(RETRACTED)) {
    const seed = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === key);
    assert.ok(seed, key);
    assert.deepEqual(seed.retract_spec_fields, paths, key);
    for (const path of paths) {
      assert.equal(at(seed.specifications, path), undefined, `${key} still sets ${path}`);
    }
    // The Item carries the retraction too.
    const item = flagshipSeedsByItem().find(i => key.startsWith(`${i.itemKey}:`));
    assert.ok(item, key);
    for (const path of paths) assert.ok(item.retract_spec_fields.includes(path), key);

    // The master update removes the stored template value instead of keeping it.
    const stored = {
      specifications: {
        cellular: { bands_5g: 'SA/NSA/Sub6', sim_type: 'Dual SIM (Nano-SIM + eSIM)' },
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
  }
});

test('only the dropped-field seeds gained a retraction', () => {
  const withRetract = FLAGSHIP_DEVICES_TO_SEED.filter(s => s.retract_spec_fields).map(
    s => s.model_key
  );
  for (const key of Object.keys(RETRACTED)) assert.ok(withRetract.includes(key), key);
  // The sourced 2026 replacements keep theirs; no other seed gained one here.
  const others = withRetract.filter(k => !(k in RETRACTED));
  assert.deepEqual(others.sort(), [
    'apple:iphone-18-pro-max:256gb',
    'apple:iphone-18-pro:256gb',
    'samsung:galaxy-s26-ultra:256gb',
  ]);
});
