/**
 * DOS/Rate#1910: the catalog spec audit judges a master by its category. Non-device
 * categories (TVs, home appliances, bank savings, internet plans, ...) carry no device spec
 * groups and must not fail the audit; devices keep today's checks. A scoped run fails only
 * on the masters it names.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { RATING_DEVICE_CATEGORIES } from '@repo/shared-data/rules';
import {
  auditedSpecGroups,
  auditMasterSpecs,
  REQUIRED_10_SPEC_GROUPS,
  requiredSpecGroups,
} from '../jobs/backfill-specs.js';

const NON_DEVICE_CATEGORIES = [
  'internet-telecom',
  'bank-savings',
  'air-purifiers',
  'washing-machines',
  'tvs',
  'air-conditioners',
  'refrigerators',
];

/**
 * Every category with a template that is not a device: the audit requires none of its
 * groups. A new template must be added here or to RATING_DEVICE_CATEGORIES on purpose.
 */
const KNOWN_NON_DEVICE_TEMPLATES = [
  ...NON_DEVICE_CATEGORIES,
  'supplements',
  'cosmetics',
  'mother-baby',
  'restaurants',
  'cafes',
  'hotels',
  'homestays',
  'dental-clinics',
  'gyms-fitness',
  'spas-aesthetics',
  'english-centers',
  'credit-cards',
];

/** A keyset-paged stand-in for the audit's master_products read. */
function keysetClient(seedRows: Array<Record<string, unknown>>) {
  return {
    from: () => {
      let current = [...seedRows];
      const builder = {
        select: () => builder,
        gt: (col: string, val: string) => {
          current = current.filter(r => String(r[col] ?? '') > val);
          return builder;
        },
        order: (col: string) => {
          current = [...current].sort((a, b) => {
            const av = String(a[col] ?? '');
            const bv = String(b[col] ?? '');
            return av < bv ? -1 : av > bv ? 1 : 0;
          });
          return builder;
        },
        limit: async (n: number) => ({ data: current.slice(0, n), error: null }),
      };
      return builder;
    },
  } as never;
}

function captureWarnings<T>(run: () => Promise<T>): Promise<{ result: T; text: string }> {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  return run()
    .then(result => ({ result, text: lines.join('\n') }))
    .finally(() => {
      console.warn = original;
    });
}

/** A full device master: all 10 groups, two rear cameras. */
function phoneMaster(id: string, modelKey: string): Record<string, unknown> {
  return {
    id,
    name: `Phone ${id}`,
    model_key: modelKey,
    specifications: {
      category_slug: 'smartphones',
      availability: { status: 'Available' },
      design: { dimensions: '1 x 2 x 3 mm' },
      display: { size: '6.1 inches' },
      hardware: { chipset: 'Chip' },
      battery: { capacity_mah: 3000 },
      camera: { main_camera: '48 MP', second_camera: '12 MP' },
      connectivity: { wifi: 'Wi-Fi 6' },
      cellular: { network_technology: 'GSM / LTE / 5G' },
      multimedia: { loudspeaker: 'Yes' },
      regulatory: { certifications: 'CE' },
    },
  };
}

/** Shaped like the Phase 8 masters on Production (2026-11-25): an availability group only. */
function nonDeviceMaster(id: string, category: string): Record<string, unknown> {
  return {
    id,
    name: `Non-device ${id}`,
    model_key: `brand:${category}-${id}:unknown`,
    specifications: { category_slug: category, availability: { status: 'Available' } },
  };
}

test('auditedSpecGroups keeps device checks and requires no group of a non-device category', () => {
  for (const category of RATING_DEVICE_CATEGORIES) {
    assert.deepEqual(auditedSpecGroups(category), requiredSpecGroups(category), category);
    assert.ok(auditedSpecGroups(category).length > 0, category);
  }
  assert.deepEqual(auditedSpecGroups(' Smartphones '), [...REQUIRED_10_SPEC_GROUPS]);
  // No category, or one the spec templates do not know, keeps all 10 as before.
  for (const category of [undefined, null, '', 'unknown-category', 42]) {
    assert.deepEqual(auditedSpecGroups(category), [...REQUIRED_10_SPEC_GROUPS], String(category));
  }
  for (const category of NON_DEVICE_CATEGORIES) {
    assert.deepEqual(auditedSpecGroups(category), [], category);
  }
});

test('every spec template category is classed as a device or a known non-device (#1910)', () => {
  // The audit requires no group of a category with its own template that is not a device,
  // so a new device template (monitors, handhelds, ...) must not slip in unaudited.
  const source = readFileSync(
    new URL('../../../../../packages/shared-data/src/rules/spec-template.ts', import.meta.url),
    'utf8'
  );
  const start = source.indexOf('const SPEC_TEMPLATES');
  assert.ok(start >= 0, 'SPEC_TEMPLATES is found');
  const block = source.slice(start, source.indexOf('\n};', start));
  const keys = [...block.matchAll(/^ {2}'?([a-z0-9-]+)'?:/gm)].map(m => m[1]!);
  assert.ok(keys.includes('smartphones') && keys.includes('bank-savings'), keys.join(','));
  const devices = new Set<string>(RATING_DEVICE_CATEGORIES);
  const unclassed = keys.filter(k => !devices.has(k) && !KNOWN_NON_DEVICE_TEMPLATES.includes(k));
  assert.deepEqual(
    unclassed,
    [],
    'a new spec template must be classed: a device in RATING_DEVICE_CATEGORIES, or a non-device here'
  );
  for (const key of KNOWN_NON_DEVICE_TEMPLATES) {
    assert.deepEqual(auditedSpecGroups(key), [], key);
  }
});

test('non-device masters pass the audit; a device master missing a group still fails', async () => {
  const rows = [
    phoneMaster('p1', 'apple:iphone-16:128gb'),
    ...NON_DEVICE_CATEGORIES.map((category, i) => nonDeviceMaster(`n${i}`, category)),
  ];
  assert.equal(await auditMasterSpecs(keysetClient(rows)), rows.length);

  const broken = phoneMaster('p2', 'apple:iphone-15:128gb');
  delete (broken.specifications as Record<string, unknown>).regulatory;
  await assert.rejects(
    auditMasterSpecs(keysetClient([...rows, broken])),
    /Spec audit failed \(1\):\n {2}- Phone p2 \(apple:iphone-15:128gb\) is missing specification group "regulatory"\n\n/m
  );

  // A non-device master stating a rear camera is still held to the camera check.
  const tvWithCamera = nonDeviceMaster('t1', 'tvs');
  (tvWithCamera.specifications as Record<string, unknown>).camera = { rear_setup: 'Dual' };
  await assert.rejects(
    auditMasterSpecs(keysetClient([tvWithCamera])),
    /is missing camera\.main_camera/
  );
});

test('a scoped audit fails only on the masters it names and warns about the rest', async () => {
  const named = phoneMaster('p1', 'apple:iphone-16:128gb');
  const outOfScope = phoneMaster('p2', 'apple:iphone-15:128gb');
  delete (outOfScope.specifications as Record<string, unknown>).battery;
  const rows = [named, outOfScope];

  // Unscoped: the out-of-scope master fails the audit, as before.
  await assert.rejects(
    auditMasterSpecs(keysetClient(rows)),
    /Phone p2 \(apple:iphone-15:128gb\) is missing specification group "battery"/
  );

  // Scoped to the passing master: the audit passes and reports the other failure.
  const { result, text } = await captureWarnings(() =>
    auditMasterSpecs(keysetClient(rows), { scope: [' apple:iphone-16:128gb '] })
  );
  assert.equal(result, rows.length, 'the whole catalog is still read and checked');
  assert.match(text, /backfill\.audit_out_of_scope/);
  assert.match(text, /1 failure\(s\) on masters outside this scoped run/);
  assert.match(text, /apple:iphone-15:128gb\) is missing specification group \\"battery\\"/);

  // A named master that fails still fails the scoped audit.
  await assert.rejects(
    captureWarnings(() =>
      auditMasterSpecs(keysetClient(rows), { scope: ['apple:iphone-15:128gb'] })
    ),
    /Spec audit failed \(1\):\n {2}- Phone p2 \(apple:iphone-15:128gb\) is missing specification group "battery"\n\n/m
  );

  // An empty scope names nothing, so nothing can fail it; a clean catalog logs no warning.
  const clean = await captureWarnings(() => auditMasterSpecs(keysetClient([named]), { scope: [] }));
  assert.equal(clean.result, 1);
  assert.equal(clean.text, '');
});
