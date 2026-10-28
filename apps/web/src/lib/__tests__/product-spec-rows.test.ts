import assert from 'node:assert/strict';
import { getCategorySpecTemplate } from '@repo/shared-data/rules';
import type { KeySpecs, ProductSpecifications } from '@repo/shared-data';
import {
  buildProductSpecGroups,
  compareRowIsShown,
  isEmptySpecValue,
} from '../product-spec-rows';
import { getSpecUiDictionary } from '../spec-localizer';

const groupsFor = (
  category: string,
  specs: Record<string, unknown>,
  keySpecs: Record<string, unknown> = {},
  product: Record<string, unknown> = {}
) =>
  buildProductSpecGroups({
    specs: specs as ProductSpecifications,
    keySpecs: keySpecs as KeySpecs,
    product,
    template: getCategorySpecTemplate(category),
    ui: getSpecUiDictionary('vi'),
    locale: 'vi',
  });

const labelsOf = (groups: ReturnType<typeof groupsFor>, group: string) =>
  groups.find((g) => g.group === group)?.rows.map((r) => r.label) ?? null;

function testProductPage() {
  const ui = getSpecUiDictionary('vi');

  // A GPS watch: no cellular value at all, so no cellular group; empty rows
  // of other groups are left out, filled ones kept.
  const watch = groupsFor('smartwatches', {
    display: { size_inch: 1.9, type: 'LTPO OLED', resolution: '' },
    hardware: { chipset: 'Apple S11' },
    battery: { capacity_mah: 327 },
    cellular: { technology: '', data_speed: null, bands_4g: '' },
    connectivity: { bluetooth: '5.3' },
  });
  assert.equal(labelsOf(watch, 'cellular'), null);
  assert.deepEqual(labelsOf(watch, 'display'), [
    ui.fields.screenSize,
    ui.fields.panelType,
  ]);
  assert.deepEqual(labelsOf(watch, 'hardware'), [ui.fields.chipset]);
  // Availability keeps its default commercial status.
  assert.deepEqual(labelsOf(watch, 'availability'), [
    ui.fields.commercialStatus,
  ]);
  // A cellular watch keeps its 4G bands under the 4G-only label.
  const lte = groupsFor('smartwatches', {
    cellular: { has_5g: true, bands_4g: 'B1/B3', bands_5g: 'n78' },
  });
  assert.deepEqual(lte.find((g) => g.group === 'cellular')?.rows, [
    { label: ui.fields.bands4g, value: 'B1/B3' },
  ]);
  for (const { rows } of watch) {
    for (const { value } of rows) {
      assert.ok(!isEmptySpecValue(value), `empty row: ${value}`);
    }
  }

  // Earbuds: an empty FCC row is gone, certifications stay; the hardware
  // card keeps only the audio chip.
  const buds = groupsFor(
    'earbuds',
    {
      hardware: { chipset: 'H2' },
      regulatory: { certifications: 'CE', fcc_approval: '-' },
      multimedia: { audio_features: 'ANC' },
    },
    { battery: '6 giờ' }
  );
  assert.deepEqual(labelsOf(buds, 'regulatory'), [ui.fields.certifications]);
  assert.deepEqual(labelsOf(buds, 'hardware'), [ui.fields.chipset]);
  assert.deepEqual(
    buds.map((g) => g.group),
    ['multimedia', 'battery', 'hardware', 'availability', 'regulatory']
  );

  // A group with nothing but empty values disappears.
  const bare = groupsFor('earbuds', {
    design: { dimensions: '', weight_g: 0, keys: null },
  });
  assert.equal(labelsOf(bare, 'design'), null);

  // Phones keep their filled rows and flat-column fallbacks.
  const phone = groupsFor(
    'smartphones',
    { hardware: { chipset: 'A18' } },
    {},
    { ram_gb: 8, storage_gb: 128, has_5g: true }
  );
  assert.deepEqual(
    phone.find((g) => g.group === 'hardware')?.rows.map((r) => r.value),
    ['A18', '8 GB', '128 GB']
  );
  assert.equal(
    phone.find((g) => g.group === 'cellular')?.rows[0]?.value,
    ui.has5gYes
  );
  console.warn('  ✅ Product page leaves out empty rows and groups');
}

function testCompare() {
  assert.equal(compareRowIsShown(['-', '-'], false), false);
  assert.equal(compareRowIsShown(['', ' - '], true), false);
  // "-" stays where another column has a value.
  assert.equal(compareRowIsShown(['-', 'LTE'], false), true);
  assert.equal(compareRowIsShown(['-', 'LTE'], true), true);
  assert.equal(compareRowIsShown(['LTE', 'LTE'], true), false);
  assert.equal(compareRowIsShown(['LTE', 'LTE'], false), true);
  assert.equal(compareRowIsShown(['LTE'], true), true);
  assert.equal(compareRowIsShown(['-'], false), false);
  console.warn('  ✅ Compare keeps "-" only beside a value');
}

function main() {
  console.warn('🧪 Product spec rows suite (DOS/Rate#1186)');
  testProductPage();
  testCompare();
}

main();
