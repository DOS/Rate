/**
 * DOS/Rate#1955: what DOS/Rate#1910 left on seeded masters. `connectivity.bluetooth` held
 * "6.0, A2DP, LE" (profile names in the version field) on the iPhone 18 Pro, iPhone 18 Pro Max
 * and Galaxy S26 Ultra, and on masters the AI enricher or the Arena sync wrote. Every writer
 * merges through `mergeProductSpecifications`, so a re-run wrote the profiles back. The merge
 * now keeps the version only, except on earbuds (their codecs are the value).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductSpecifications } from '@repo/shared-data';
import { mergeProductSpecifications } from '../ai-spec-enricher.js';
import { FLAGSHIP_DEVICES_TO_SEED } from '../flagship-seed-data.js';
import { seedMasterSpecUpdate } from '../jobs/backfill-specs.js';
import { bluetoothVersionOnly, keepsBluetoothCodecs } from '../spec-bluetooth.js';

const TARGETS: Record<string, string> = {
  'apple:iphone-18-pro:256gb': '6',
  'apple:iphone-18-pro-max:256gb': '6',
  'samsung:galaxy-s26-ultra:256gb': '6.0',
};
const DIRTY = '6.0, A2DP, LE';

const bluetoothOf = (specs: ProductSpecifications | undefined): unknown =>
  (specs as { connectivity?: { bluetooth?: unknown } } | undefined)?.connectivity?.bluetooth;

test('bluetoothVersionOnly cuts a version list to the version and leaves anything else alone', () => {
  for (const [value, expected] of [
    ['6.0, A2DP, LE', '6.0'],
    ['5.3, A2DP, LE', '5.3'],
    ['5.4, A2DP, LE, aptX HD, LHDC 5.0', '5.4'],
    ['5.3, A2DP, AVRCP, HFP, HSP', '5.3'],
    ['5.3 (SBC, AAC, LDAC)', '5.3'],
    ['6.0; LE Audio', '6.0'],
    [' 6, A2DP', '6'],
    ['6.0', '6.0'],
    ['6', '6'],
    ['5.4 Wireless Card', '5.4 Wireless Card'],
    ['Bluetooth Smart (BLE) & ANT+', 'Bluetooth Smart (BLE) & ANT+'],
    ['LE Audio, 5.3', 'LE Audio, 5.3'],
    // A decimal comma is not a list separator.
    ['5,3', '5,3'],
    ['6,0', '6,0'],
    ['5 - 6', '5 - 6'],
    // Other shapes the AI enricher states.
    ['Bluetooth 5.3, A2DP', '5.3'],
    ['5.3 LE', '5.3'],
    ['5.3/LE Audio', '5.3'],
    ['5.3 / A2DP', '5.3'],
    ['5.3 A2DP', '5.3'],
    ['', ''],
  ] as const) {
    assert.equal(bluetoothVersionOnly(value), expected, JSON.stringify(value));
  }
});

test('the merge keeps the version only, whoever writes the profiles (#1955)', () => {
  const phone = { category_slug: 'smartphones', display: { size_inch: 6.9 } };
  // An AI or Arena value over a clean stored one.
  const incoming = mergeProductSpecifications(
    { ...phone, connectivity: { bluetooth: '6.0' } },
    { connectivity: { bluetooth: DIRTY } }
  );
  assert.equal(bluetoothOf(incoming), '6.0');
  // A dirty stored value, nothing incoming (a re-run that does not restate it).
  const stored = mergeProductSpecifications({ ...phone, connectivity: { bluetooth: DIRTY } }, {});
  assert.equal(bluetoothOf(stored), '6.0');
  // Without a stored category, a device with a display is not an earbud.
  const noSlug = mergeProductSpecifications(
    { display: { size_inch: 11 }, connectivity: { bluetooth: '5.3, A2DP, LE' } },
    {}
  );
  assert.equal(bluetoothOf(noSlug), '5.3');
  const watch = mergeProductSpecifications(
    { display: { size_inch: 1.5 }, cellular: { has_5g: false } },
    { connectivity: { bluetooth: '5.3, A2DP, AVRCP, HFP, HSP' } }
  );
  assert.equal(bluetoothOf(watch), '5.3');
});

test('earbuds keep their codecs in the Bluetooth field (#1955)', () => {
  const codecs = '5.4, A2DP, AVRCP, HFP (SBC, AAC, LDAC, LC3)';
  assert.equal(keepsBluetoothCodecs({ category_slug: 'earbuds' }), true);
  assert.equal(keepsBluetoothCodecs({ category_slug: 'smartphones' }), false);
  // The seeds' earbud shape: no category_slug in the specs, an empty display group.
  assert.equal(keepsBluetoothCodecs({ display: {}, hardware: { chipset: 'H3' } }), true);
  assert.equal(keepsBluetoothCodecs({ display: {}, cellular: { has_5g: false } }), true);
  for (const base of [{ category_slug: 'earbuds' }, { display: {}, cellular: {} }]) {
    const merged = mergeProductSpecifications(base, { connectivity: { bluetooth: codecs } });
    assert.equal(bluetoothOf(merged), codecs);
  }
});

test('a master with no category_slug and a display value or no display group is cut (#1955)', () => {
  const list = '5.4, A2DP, AVRCP, HFP (SBC, AAC, LDAC, LC3)';
  assert.equal(keepsBluetoothCodecs({ display: { features: 'touch' } }), false);
  assert.equal(keepsBluetoothCodecs({ connectivity: { bluetooth: list } }), false);
  assert.equal(keepsBluetoothCodecs({}), false);
  for (const specs of [
    {},
    { display: { features: 'touch' } },
    { connectivity: { bluetooth: '5.3, A2DP' } },
  ]) {
    const merged = mergeProductSpecifications(specs, { connectivity: { bluetooth: list } });
    assert.equal(bluetoothOf(merged), '5.4');
  }
});

test('a seed re-run writes the clean Bluetooth value over the dirty stored one (#1955)', () => {
  for (const [modelKey, expected] of Object.entries(TARGETS)) {
    const seed = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === modelKey);
    assert.ok(seed, `${modelKey} is a seed`);
    const update = seedMasterSpecUpdate(
      { specifications: { connectivity: { bluetooth: DIRTY } }, key_specs: {} },
      seed
    ) as { specifications: ProductSpecifications };
    assert.equal(bluetoothOf(update.specifications), expected, modelKey);
  }
});

test('no non-earbud seed update leaves a profile list in Bluetooth, even over a dirty master', () => {
  for (const seed of FLAGSHIP_DEVICES_TO_SEED) {
    if (seed.categorySlug === 'earbuds') continue;
    const update = seedMasterSpecUpdate(
      { specifications: { connectivity: { bluetooth: DIRTY } }, key_specs: {} },
      seed
    ) as { specifications: ProductSpecifications };
    const bluetooth = bluetoothOf(update.specifications);
    assert.ok(
      bluetooth === undefined ||
        (typeof bluetooth === 'string' && bluetoothVersionOnly(bluetooth) === bluetooth),
      `${seed.model_key}: ${JSON.stringify(bluetooth)}`
    );
  }
});

test('a seed update writes design.colors equal to the colors column on every seed (#1955)', () => {
  for (const seed of FLAGSHIP_DEVICES_TO_SEED) {
    const update = seedMasterSpecUpdate(
      {
        specifications: { design: { colors: ['Sky Blue'] } },
        key_specs: {},
      },
      seed
    ) as { specifications: ProductSpecifications };
    assert.deepEqual(update.specifications.design?.colors, seed.colors, seed.model_key);
  }
});

test('earbud seeds state no cellular network and no 5G (#1955)', () => {
  const earbuds = FLAGSHIP_DEVICES_TO_SEED.filter(s => s.categorySlug === 'earbuds');
  assert.ok(earbuds.length >= 5, 'the earbud seeds are checked');
  for (const seed of earbuds) {
    assert.equal(seed.has_5g, false, `${seed.model_key}: has_5g column`);
    const cellular = (seed.specifications as { cellular?: Record<string, unknown> }).cellular;
    assert.ok(
      !cellular || Object.keys(cellular).length === 0,
      `${seed.model_key}: no cellular fields`
    );
    const update = seedMasterSpecUpdate(
      { specifications: { cellular: { has_5g: true } }, key_specs: {} },
      seed
    ) as { specifications: ProductSpecifications };
    const merged = (update.specifications as { cellular?: { has_5g?: unknown } }).cellular;
    assert.notEqual(merged?.has_5g, true, `${seed.model_key}: a stored cellular.has_5g`);
  }
});
