/**
 * DOS/Rate#1793: what DOS/Rate#1792 left. The flagship seed earbuds carried a display made of
 * drivers and LEDs, microphones and sensors as cameras, a 1 inch screen, 1GB RAM and 64GB
 * storage, a case as key_specs.screen, Bluetooth as a cellular network and firmware updates as
 * storage expansion, and the backfill wrote them to masters. Registry earbuds and a watch had
 * audio, LED or display controllers as their GPU, the Series 11 GPS seed had Wi-Fi and an eSIM
 * note as network values, and the iPad Pro M4 was registered without 5G.
 *
 * DOS/Rate#1796: the same for the six flagship seed smartwatches, which carried heart, ECG, depth,
 * light and gesture sensors as camera fields and a camera key spec, and whose GPS-only or no-SIM
 * seeds (Series 10, Series 11, Forerunner 265) carried Wi-Fi, Bluetooth and GPS text as network
 * values.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductSpecifications } from '@repo/shared-data';
import { applyCategorySpecTemplate } from '@repo/shared-data/rules';
import { FLAGSHIP_DEVICES_TO_SEED, flagshipSeedsByItem } from '../flagship-seed-data.js';
import { seedMasterSpecUpdate, syncItemSeedSpecs } from '../jobs/backfill-specs.js';
import { ProductNormalizer } from '../product-normalizer.js';
import type { ShopeeProduct } from '../types.js';

const EARBUD_SEEDS = [
  'apple:airpods-pro-2-usbc:64gb',
  'apple:airpods-pro-3:standard',
  'sony:wf-1000xm5:64gb',
  'samsung:galaxy-buds3-pro:64gb',
  'sony:wf-1000xm6:standard',
];

const seedOf = (key: string) => {
  const seed = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === key);
  assert.ok(seed, key);
  return seed;
};

const at = (specs: unknown, path: string): unknown => {
  const [group, field] = path.split('.') as [string, string];
  return (specs as Record<string, Record<string, unknown> | undefined>)[group]?.[field];
};

/** As stored: JSON drops the undefined fields a merge leaves. */
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** A copy without empty groups, which the earbuds template drops and the seed keeps as {}. */
const nonEmpty = (specs: unknown) =>
  Object.fromEntries(
    Object.entries(specs as Record<string, unknown>).filter(
      ([, v]) => !(v && typeof v === 'object' && Object.keys(v).length === 0)
    )
  );

test('every earbud seed is checked', () => {
  assert.deepEqual(
    FLAGSHIP_DEVICES_TO_SEED.filter(s => s.categorySlug === 'earbuds')
      .map(s => s.model_key)
      .sort(),
    [...EARBUD_SEEDS].sort()
  );
});

test('an earbud seed holds nothing the earbuds template removes', () => {
  for (const key of EARBUD_SEEDS) {
    const seed = seedOf(key);
    assert.equal(seed.ram_gb, null, key);
    assert.equal(seed.storage_gb, null, key);
    assert.equal(seed.screen_size_inch, null, key);
    assert.equal(seed.has_5g, false, key);
    const kept = applyCategorySpecTemplate(
      'earbuds',
      { specifications: seed.specifications, key_specs: seed.key_specs },
      { forStorage: true }
    );
    assert.deepEqual(
      nonEmpty(kept.specifications),
      nonEmpty(seed.specifications),
      `${key}: specifications`
    );
    assert.deepEqual(kept.key_specs, seed.key_specs, `${key}: key_specs`);
    // The groups the spec audit needs on a master with no category_slug stay, empty.
    for (const group of ['display', 'camera', 'cellular'] as const) {
      assert.deepEqual(seed.specifications[group], {}, `${key}: ${group}`);
    }
    // The audio chip and battery stay.
    assert.ok(seed.specifications.hardware?.chipset, key);
    assert.ok(seed.specifications.battery?.capacity_mah, key);
    assert.ok(seed.key_specs.chip, key);
  }
});

// What every earlier earbud seed wrote, as stored on its master.
const STORED_TEMPLATE_TEXT = {
  specifications: {
    display: {
      size_inch: 1.0,
      type: 'LED Status Indicator + iOS Dynamic Island Battery HUD',
      resolution: 'Acoustic Custom High-Excursion Driver (11mm)',
      refresh_rate_hz: 60,
    },
    camera: {
      rear_setup: 'Dual Beamforming & Inward-Facing Acoustic Array',
      main_camera: 'Dual beamforming microphones',
      second_camera: 'Inward-facing microphone',
      front_camera: 'Capacitive Touch Panels + Head Gesture Control (Nod/Shake)',
    },
    hardware: {
      chipset: 'Old chip text',
      gpu: 'Personalized Spatial Audio Engine',
      ram_gb: 1,
      storage_gb: 64,
      storage_expansion: 'Firmware tự động cập nhật qua iCloud',
    },
    cellular: {
      has_5g: false,
      technology: 'Bluetooth 5.3 + Ultra Wideband (U1)',
      sim_type: 'Wireless Audio Accessory',
    },
    battery: { capacity_mah: 1 },
  },
  key_specs: {
    screen: 'Hộp sạc MagSafe USB-C (IP54 + Loa Find My)',
    ram: 'Bluetooth 5.3',
    storage: 'USB-C / MagSafe',
    camera: 'ANC Khử ồn gấp 2 lần + Adaptive Audio',
  },
};

const RETRACTED_EVERYWHERE = [
  'display.size_inch',
  'display.type',
  'display.resolution',
  'display.refresh_rate_hz',
  'camera.rear_setup',
  'camera.main_camera',
  'camera.second_camera',
  'camera.front_camera',
  'hardware.gpu',
  'hardware.ram_gb',
  'hardware.storage_gb',
  'hardware.storage_expansion',
  'cellular.technology',
  'cellular.sim_type',
  'key_specs.screen',
  'key_specs.ram',
  'key_specs.storage',
  'key_specs.camera',
  // The other fields the earbuds template does not have, which every earlier seed set.
  'design.biometrics',
  'display.features',
  'hardware.cpu',
  'hardware.os',
  'connectivity.wlan',
  'connectivity.nfc',
  'cellular.has_5g',
  'multimedia.headphone_jack_35mm',
];

// The fields only some earlier seeds set.
const RETRACTED_ALSO: Record<string, readonly string[]> = {
  'apple:airpods-pro-2-usbc:64gb': [
    'display.ppi',
    'display.protection',
    'camera.video_recording',
    'connectivity.location',
    'cellular.volte',
    'cellular.vowifi',
  ],
  'apple:airpods-pro-3:standard': ['connectivity.location'],
  'sony:wf-1000xm5:64gb': [
    'display.ppi',
    'display.protection',
    'camera.video_recording',
    'connectivity.location',
    'cellular.volte',
    'cellular.vowifi',
  ],
  'samsung:galaxy-buds3-pro:64gb': [
    'display.ppi',
    'display.protection',
    'camera.video_recording',
    'connectivity.location',
    'cellular.volte',
    'cellular.vowifi',
  ],
  'sony:wf-1000xm6:standard': [],
};

test('the backfill removes the stored earbud template text from masters and Items', async () => {
  for (const key of EARBUD_SEEDS) {
    const seed = seedOf(key);
    const expected = [...RETRACTED_EVERYWHERE, ...(RETRACTED_ALSO[key] ?? [])];
    assert.deepEqual(
      [...(seed.retract_spec_fields ?? [])].sort(),
      expected.sort(),
      `${key}: retract_spec_fields`
    );
    const update = seedMasterSpecUpdate(structuredClone(STORED_TEMPLATE_TEXT), seed) as {
      specifications: ProductSpecifications;
      key_specs: Record<string, unknown>;
      ram_gb: unknown;
      storage_gb: unknown;
      screen_size_inch: unknown;
    };
    for (const group of ['display', 'camera', 'cellular'] as const) {
      assert.deepEqual(stored(update.specifications[group]), {}, `${key}: stored ${group}`);
    }
    for (const field of ['gpu', 'ram_gb', 'storage_gb', 'storage_expansion'] as const) {
      assert.equal(update.specifications.hardware?.[field], undefined, `${key}: ${field}`);
    }
    assert.equal(update.specifications.hardware?.chipset, seed.specifications.hardware?.chipset);
    assert.deepEqual(
      Object.keys(stored(update.key_specs)).sort(),
      Object.keys(seed.key_specs).sort()
    );
    // The replaced seed's columns follow it.
    assert.equal(update.ram_gb, null, key);
    assert.equal(update.storage_gb, null, key);
    assert.equal(update.screen_size_inch, null, key);

    // The Item update removes them too.
    const item = flagshipSeedsByItem().find(i => key.startsWith(`${i.itemKey}:`));
    assert.ok(item, key);
    let written: { specifications: ProductSpecifications; key_specs: Record<string, unknown> };
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'i1', ...structuredClone(STORED_TEMPLATE_TEXT) },
              error: null,
            }),
          }),
        }),
        update: (row: typeof written) => {
          written = row;
          return { eq: async () => ({ error: null }) };
        },
      }),
    };
    await syncItemSeedSpecs(client as never, { apply: true, seeds: [item], itemModel: 'item' });
    for (const path of RETRACTED_EVERYWHERE) {
      const [scope, field] = path.split('.') as [string, string];
      const value =
        scope === 'key_specs' ? written!.key_specs[field] : at(written!.specifications, path);
      assert.equal(value, undefined, `${key}: Item keeps ${path}`);
    }
  }
});

test('the Series 11 GPS seed has no Wi-Fi, Bluetooth or eSIM text as a network value', () => {
  const seed = seedOf('apple:watch-series-11-46mm:64gb');
  assert.equal(seed.has_5g, false);
  assert.deepEqual(seed.specifications.cellular, { has_5g: false });
  assert.ok(seed.retract_spec_fields?.includes('cellular.sim_type'));
  assert.ok(seed.retract_spec_fields?.includes('cellular.technology'));
  const update = seedMasterSpecUpdate(
    {
      specifications: {
        cellular: {
          has_5g: false,
          sim_type: 'GPS Model (eSIM optional on Cellular variant)',
          technology: 'Wi-Fi + Bluetooth 5.3 + UWB Gen 2',
        },
      },
      key_specs: {},
    },
    seed
  ) as { specifications: ProductSpecifications };
  assert.deepEqual(stored(update.specifications.cellular), { has_5g: false });
});

const normalizer = new ProductNormalizer();
const normalize = (title: string) =>
  normalizer.normalize({
    itemId: '1',
    shopId: '2',
    title,
    priceMin: 5_000_000,
    priceMax: 5_000_000,
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

test('registry earbuds and the Forerunner 265 have no controller text as a GPU', () => {
  for (const title of [
    'Tai nghe AirPods Pro 2',
    'Tai nghe AirPods Pro 3',
    'Sony WF-1000XM5',
    'Sony WF-1000XM6',
    'Samsung Galaxy Buds3 Pro',
    'Garmin Forerunner 265',
  ]) {
    const n = normalize(title);
    assert.equal(n.is_benchmark_enriched, true, title);
    assert.equal(n.specifications.hardware?.gpu, undefined, title);
    assert.ok(n.specifications.hardware?.chipset, title);
  }
  // A real GPU stays.
  assert.equal(
    normalize('iPad Pro M4 11 inch 256GB').specifications.hardware?.gpu,
    'Apple 10-core GPU with hardware ray tracing'
  );
});

test('the iPad Pro M4 supports 5G, as Apple’s Tech Specs state for its cellular models', () => {
  // https://support.apple.com/en-us/119892 (11-inch) and /119891 (13-inch): "5G (sub-6 GHz)
  // with 4x4 MIMO" on the Wi-Fi + Cellular models.
  const n = normalize('iPad Pro M4 11 inch 256GB');
  assert.equal(n.is_benchmark_enriched, true);
  assert.equal(n.has_5g, true);
  assert.equal(n.specifications.cellular?.has_5g, true);
  // The Wi-Fi seed stays without 5G.
  assert.equal(seedOf('apple:ipad-pro-m4-11:256gb').has_5g, false);
});

// DOS/Rate#1796: smartwatches.
const WATCH_SEEDS = [
  'apple:watch-series-10-42mm:64gb',
  'apple:watch-ultra-2:64gb',
  'samsung:galaxy-watch-ultra:32gb',
  'garmin:forerunner-265:8gb',
  'apple:watch-series-11-46mm:64gb',
  'apple:watch-ultra-3-49mm:64gb',
];

/** The GPS-only or no-SIM seeds: their cellular group has no network text. */
const WATCH_SEEDS_WITHOUT_CELLULAR = [
  'apple:watch-series-10-42mm:64gb',
  'garmin:forerunner-265:8gb',
  'apple:watch-series-11-46mm:64gb',
];

/** The seeds whose storage_expansion held the internal storage, not a card slot. */
const WATCH_SEEDS_WITH_STORAGE_TEXT = [
  'apple:watch-ultra-2:64gb',
  'samsung:galaxy-watch-ultra:32gb',
  'garmin:forerunner-265:8gb',
];

const CAMERA_FIELDS = [
  'rear_setup',
  'main_camera',
  'second_camera',
  'front_camera',
  'video_recording',
] as const;

test('every smartwatch seed is checked', () => {
  assert.deepEqual(
    FLAGSHIP_DEVICES_TO_SEED.filter(s => s.categorySlug === 'smartwatches')
      .map(s => s.model_key)
      .sort(),
    [...WATCH_SEEDS].sort()
  );
});

test('a smartwatch seed holds nothing the smartwatches template removes', () => {
  for (const key of WATCH_SEEDS) {
    const seed = seedOf(key);
    const kept = applyCategorySpecTemplate(
      'smartwatches',
      { specifications: seed.specifications, key_specs: seed.key_specs },
      { forStorage: true }
    );
    assert.deepEqual(
      nonEmpty(kept.specifications),
      nonEmpty(seed.specifications),
      `${key}: specifications`
    );
    assert.deepEqual(kept.key_specs, seed.key_specs, `${key}: key_specs`);
    // No sensor as a camera: the group stays as {} for the spec audit, and there is no key spec.
    assert.deepEqual(seed.specifications.camera, {}, `${key}: camera`);
    assert.equal((seed.key_specs as Record<string, unknown>).camera, undefined, key);
    // What a watch has stays.
    assert.ok(seed.specifications.display?.type, key);
    assert.ok(seed.specifications.hardware?.chipset, key);
    assert.ok(seed.specifications.battery?.capacity_mah, key);
    assert.ok(seed.specifications.connectivity?.sensors, key);
    assert.ok(seed.key_specs.screen && seed.key_specs.chip && seed.key_specs.battery, key);
    assert.ok(seed.key_specs.storage && seed.key_specs.ram, key);
  }
});

test('a watch with no SIM has no Wi-Fi, Bluetooth or GPS text as a network value', () => {
  for (const key of WATCH_SEEDS_WITHOUT_CELLULAR) {
    const cellular = seedOf(key).specifications.cellular as Record<string, unknown>;
    assert.equal(cellular.technology, undefined, key);
    assert.equal(cellular.sim_type, undefined, key);
    assert.equal(cellular.has_5g, false, key);
  }
  // A cellular watch keeps its network.
  for (const key of ['apple:watch-ultra-2:64gb', 'samsung:galaxy-watch-ultra:32gb']) {
    const cellular = seedOf(key).specifications.cellular as Record<string, unknown>;
    assert.ok(cellular.technology && cellular.sim_type, key);
  }
});

test('no smartwatch seed states its internal storage as storage expansion', () => {
  for (const key of WATCH_SEEDS) {
    const text = seedOf(key).specifications.hardware?.storage_expansion;
    if (WATCH_SEEDS_WITH_STORAGE_TEXT.includes(key)) assert.equal(text, undefined, key);
    // What stays says that there is no card slot.
    else if (text !== undefined) assert.match(text, /^(No|Không hỗ trợ thẻ nhớ)/, key);
  }
});

// What every earlier watch seed wrote, as stored on its master.
const STORED_WATCH_TEXT = {
  specifications: {
    camera: {
      rear_setup: 'Multi-Spectral Biometric & Dive Array',
      main_camera: '3rd-gen Optical Heart Sensor + Electrical Heart Sensor (ECG)',
      second_camera: 'Blood Oxygen Sensor + Depth Gauge',
      front_camera: 'Dual ambient light sensors + Double Tap gesture neural sensor',
      video_recording: 'Điều khiển từ xa Camera iPhone với khung ngắm trực tiếp',
    },
    hardware: {
      chipset: 'Old chip text',
      storage_expansion: 'Bộ nhớ trong 64GB',
    },
    cellular: {
      has_5g: false,
      technology: 'GPS + Wi-Fi + Bluetooth',
      sim_type: 'GPS Model (paired via iPhone)',
    },
  },
  key_specs: { screen: 'Old screen', camera: 'ECG + SpO2 + Đo độ sâu lặn 40m + Còi 86dB' },
};

test('the backfill removes the stored smartwatch camera text from masters and Items', async () => {
  for (const key of WATCH_SEEDS) {
    const seed = seedOf(key);
    const retracted = new Set(seed.retract_spec_fields ?? []);
    for (const field of CAMERA_FIELDS)
      assert.ok(retracted.has(`camera.${field}`), `${key}: ${field}`);
    assert.ok(retracted.has('key_specs.camera'), key);
    assert.equal(retracted.has('cellular.technology'), WATCH_SEEDS_WITHOUT_CELLULAR.includes(key));
    assert.equal(
      retracted.has('hardware.storage_expansion'),
      WATCH_SEEDS_WITH_STORAGE_TEXT.includes(key),
      key
    );

    const update = seedMasterSpecUpdate(structuredClone(STORED_WATCH_TEXT), seed) as {
      specifications: ProductSpecifications;
      key_specs: Record<string, unknown>;
    };
    assert.deepEqual(stored(update.specifications.camera), {}, `${key}: stored camera`);
    assert.equal(stored(update.key_specs).camera, undefined, `${key}: stored key_specs.camera`);
    assert.equal(
      update.specifications.cellular?.technology === undefined,
      WATCH_SEEDS_WITHOUT_CELLULAR.includes(key) || !seed.specifications.cellular?.technology,
      `${key}: stored cellular.technology`
    );
    assert.equal(
      stored(update.specifications).hardware?.storage_expansion === undefined,
      WATCH_SEEDS_WITH_STORAGE_TEXT.includes(key) ||
        !seed.specifications.hardware?.storage_expansion,
      `${key}: stored storage_expansion`
    );
    assert.equal(update.specifications.hardware?.chipset, seed.specifications.hardware?.chipset);

    // The Item update removes them too.
    const item = flagshipSeedsByItem().find(i => key.startsWith(`${i.itemKey}:`));
    assert.ok(item, key);
    let written: { specifications: ProductSpecifications; key_specs: Record<string, unknown> };
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'i1', ...structuredClone(STORED_WATCH_TEXT) },
              error: null,
            }),
          }),
        }),
        update: (row: typeof written) => {
          written = row;
          return { eq: async () => ({ error: null }) };
        },
      }),
    };
    await syncItemSeedSpecs(client as never, { apply: true, seeds: [item], itemModel: 'item' });
    assert.deepEqual(stored(written!.specifications.camera), {}, `${key}: Item camera`);
    assert.equal(written!.key_specs.camera, undefined, `${key}: Item key_specs.camera`);
  }
});
