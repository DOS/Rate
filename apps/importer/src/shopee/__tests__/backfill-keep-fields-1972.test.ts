/**
 * DOS/Rate#1972: the scoped spec backfill planned for DOS/Rate#1955 would have deleted stored
 * spec fields on 10 seeded masters (`-> (none)` in the dry run of Rate-Services run
 * 45992207607). A seed's `retract_spec_fields` (DOS/Rate#1459, #1858) removed them: Bluetooth
 * profile lists, certifications, tablet cellular text and the MacBooks' camera text. A run
 * never removes a stored spec value on its own now; the retractions apply only with an
 * explicit `--retract`. The Bluetooth version-only rule (#1955) is unchanged.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { FLAGSHIP_DEVICES_TO_SEED, type FlagshipDeviceSeed } from '../flagship-seed-data.js';
import {
  parseBackfillSpecsArgs,
  runBackfillSpecsCli,
  runMasterSpecsBackfillWith,
  seedMasterSpecUpdate,
  specUpdateChanges,
  type BackfillSpecsDeps,
} from '../jobs/backfill-specs.js';
import type { RateSupabaseClient } from '../types.js';

/** The stored values the dry run showed (`-> (none)`), by master, as `group.field: value`. */
const STORED_EXTRAS: Record<string, Record<string, unknown>> = {
  'xiaomi:14-ultra:512gb': {
    'connectivity.bluetooth': '5.4, A2DP, LE, aptX HD, aptX Adaptive, LHDC',
    'regulatory.certifications': 'CE, FCC, RoHS, TÜV Rheinland Triple Eye Protection, QCVN',
  },
  'xiaomi:17-pro-max:512gb': {
    'connectivity.bluetooth': '5.4, A2DP, LE, aptX HD, aptX Adaptive, LHDC 5.0',
  },
  'xiaomi:18-pro-max:512gb': {
    'connectivity.bluetooth': '6.0, A2DP, LE, aptX HD, aptX Adaptive, LHDC 5.0',
    'regulatory.certifications': 'CE, FCC, RoHS, TÜV Rheinland Flicker-Free, QCVN (BTTTT Vietnam)',
  },
  'xiaomi:pad-6s-pro:256gb': {
    'cellular.sim_type': 'Wi-Fi Only',
    'cellular.technology': 'Wi-Fi 7 (802.11be) + Bluetooth 5.3',
    'cellular.volte': false,
    'cellular.vowifi': false,
    'connectivity.bluetooth': '5.3, A2DP, LE, LHDC',
    'regulatory.certifications': 'CE, RoHS, TÜV Rheinland Low Blue Light, QCVN',
  },
  'xiaomi:pad-7-pro:256gb': {
    'cellular.sim_type': 'No cellular connectivity (Wi-Fi 7 edition)',
    'cellular.technology': 'Wi-Fi Only',
    'connectivity.bluetooth': '5.4, A2DP, LE, LHDC 5.0',
    'regulatory.certifications': 'CE, RoHS, TÜV Low Blue Light, QCVN (BTTTT Vietnam)',
  },
  'oppo:find-x8:256gb': {
    'connectivity.bluetooth': '5.4, A2DP, LE, aptX HD, LHDC 5.0',
    'regulatory.certifications': 'CE, RoHS, TÜV Rheinland Eye Comfort 4.0, IP69, QCVN',
  },
  'oppo:find-x9-pro:512gb': {
    'connectivity.bluetooth': '5.4, A2DP, LE, aptX HD, LHDC 5.0',
    'regulatory.certifications': 'CE, RoHS, QCVN (BTTTT Vietnam)',
  },
  'samsung:galaxy-watch-ultra:32gb': {
    'connectivity.bluetooth': '5.3, A2DP, AVRCP, HFP, HSP',
    'regulatory.certifications': 'IP68, 10ATM, MIL-STD-810H, CE, FCC, QCVN',
  },
  'apple:macbook-air-m4-13:256gb': {
    'camera.main_camera': '12MP Center Stage camera with support for Desk View',
    'camera.rear_setup': 'Dual External 6K Display Engine via Thunderbolt 4',
    'camera.second_camera':
      'Desk View Top-Down Workspace Framing + Continuity Camera Wireless iPhone Array',
    'cellular.sim_type': 'No cellular (Continuity Instant Hotspot via iPhone)',
    'cellular.technology': 'Wi-Fi 6E + Bluetooth 5.3',
  },
  'apple:macbook-pro-m4-pro-14:512gb': {
    'camera.main_camera': '12MP Center Stage camera with Desk View support',
    'camera.rear_setup': '3x Thunderbolt 5 (120Gb/s) + HDMI 2.1 (8K@60Hz / 4K@240Hz) + SDXC',
    'camera.second_camera':
      'Desk View Top-Down Workspace Framing + Studio-Quality 3-Mic Directional Array',
    'cellular.sim_type': 'No cellular',
    'cellular.technology': 'Wi-Fi 6E + Bluetooth 5.3',
  },
};
const KEYS = Object.keys(STORED_EXTRAS);

const seedOf = (modelKey: string): FlagshipDeviceSeed => {
  const seed = FLAGSHIP_DEVICES_TO_SEED.find(s => s.model_key === modelKey);
  assert.ok(seed, `${modelKey} is a seed`);
  return seed;
};

/** The master as Production holds it: the seed's specs plus the values the seed lacks. */
function storedMaster(modelKey: string): {
  id: string;
  specifications: Record<string, Record<string, unknown>>;
  key_specs: Record<string, unknown>;
} {
  const specifications = structuredClone(seedOf(modelKey).specifications) as unknown as Record<
    string,
    Record<string, unknown>
  >;
  for (const [path, value] of Object.entries(STORED_EXTRAS[modelKey]!)) {
    const [group, field] = path.split('.') as [string, string];
    specifications[group] = { ...(specifications[group] ?? {}), [field]: value };
  }
  return { id: `id-${modelKey}`, specifications, key_specs: {} };
}

const hasRetractions = (seed: FlagshipDeviceSeed) => (seed.retract_spec_fields ?? []).length > 0;

test('the 10 masters of #1972 are seeds that retract the fields the dry run deleted', () => {
  assert.equal(KEYS.length, 10);
  for (const key of KEYS) {
    const seed = seedOf(key);
    assert.ok(hasRetractions(seed), `${key} has retract_spec_fields`);
    for (const path of Object.keys(STORED_EXTRAS[key]!)) {
      assert.ok(seed.retract_spec_fields!.includes(path), `${key} retracts ${path}`);
    }
  }
});

test('a seed update keeps every stored spec value the seed does not state (#1972)', () => {
  for (const key of KEYS) {
    const stored = storedMaster(key);
    const before = JSON.stringify(stored);
    const update = seedMasterSpecUpdate(stored, seedOf(key)) as {
      specifications: Record<string, Record<string, unknown>>;
      variant_name?: unknown;
    };
    assert.equal(JSON.stringify(stored), before, `${key}: the stored row is not mutated`);
    assert.equal('variant_name' in update, false, `${key}: no replaced-seed column`);
    const changes = specUpdateChanges(stored, { specifications: update.specifications });
    assert.deepEqual(
      changes.filter(c => c.endsWith('-> (none)')),
      [],
      `${key}: no stored spec value is deleted`
    );
    for (const [path, value] of Object.entries(STORED_EXTRAS[key]!)) {
      const [group, field] = path.split('.') as [string, string];
      const kept = update.specifications[group]?.[field];
      if (path === 'connectivity.bluetooth') {
        // #1955: the version only, never removed.
        assert.equal(kept, String(value).match(/^\d+(?:\.\d+)?/)![0], `${key}: bluetooth`);
      } else {
        assert.deepEqual(kept, value, `${key}: ${path} stays`);
      }
    }
  }
});

test('only the intended paths change: the Bluetooth version and the seed colours (#1972, #1955)', () => {
  for (const key of KEYS) {
    const stored = storedMaster(key);
    const update = seedMasterSpecUpdate(stored, seedOf(key)) as {
      specifications: Record<string, Record<string, unknown>>;
    };
    const paths = specUpdateChanges(stored, { specifications: update.specifications }).map(
      c => c.split(':')[0]
    );
    for (const path of paths) {
      assert.ok(
        path === 'specifications.connectivity.bluetooth' || path === 'specifications.design.colors',
        `${key}: unexpected change at ${path}`
      );
    }
    if (key in { 'xiaomi:14-ultra:512gb': 1, 'oppo:find-x8:256gb': 1 }) {
      assert.deepEqual(paths, ['specifications.connectivity.bluetooth'], key);
    }
  }
});

test('--retract still removes the retracted paths when it is asked for (#1459, #1858)', () => {
  for (const key of KEYS) {
    const seed = seedOf(key);
    const stored = storedMaster(key);
    const update = seedMasterSpecUpdate(stored, seed, { retract: true }) as {
      specifications: Record<string, Record<string, unknown>>;
    };
    for (const path of Object.keys(STORED_EXTRAS[key]!)) {
      const [group, field] = path.split('.') as [string, string];
      assert.equal(update.specifications[group]?.[field], undefined, `${key}: ${path}`);
    }
  }
});

/** A stand-in for the rate-scoped client that serves the stored masters and records writes. */
function mockClient(existing: Record<string, Record<string, unknown>>) {
  const writes: Array<{ payload: Record<string, unknown>; id: unknown }> = [];
  const client = {
    from(table: string) {
      let key: unknown;
      let payload: Record<string, unknown> | undefined;
      let id: unknown;
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          if (column === 'model_key') key = value;
          if (column === 'id') id = value;
          return builder;
        },
        order: () => builder,
        gt: () => builder,
        limit: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === 'master_products' && typeof key === 'string'
                ? (existing[key] ?? null)
                : null,
            error: null,
          }),
        update(p: Record<string, unknown>) {
          payload = p;
          return builder;
        },
        then<T>(resolve: (value: { data: unknown; error: null }) => T) {
          if (payload) writes.push({ payload, id });
          const data = table === 'categories' ? [{ id: 'cat-1', slug: 'smartphones' }] : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as RateSupabaseClient, writes };
}

const deps: BackfillSpecsDeps = {
  enricher: { isConfigured: () => false },
  matcher: { enrichMasterProductById: async () => true },
};

test('a scoped --apply of the 10 masters writes no deletion, and --retract is the only way to one', async () => {
  const existing = Object.fromEntries(KEYS.map(k => [k, storedMaster(k)]));
  const only = [...KEYS];

  const plain = mockClient(existing);
  await runMasterSpecsBackfillWith(plain.client, deps, { apply: true, only, expect: 10 });
  assert.equal(plain.writes.length, 10);
  for (const { payload, id } of plain.writes) {
    const key = String(id).replace(/^id-/, '');
    const stored = existing[key] as ReturnType<typeof storedMaster>;
    const changes = specUpdateChanges(stored, {
      specifications: payload.specifications as Record<string, unknown>,
    });
    assert.deepEqual(
      changes.filter(c => c.endsWith('-> (none)')),
      [],
      `${key}: the written specs delete nothing`
    );
  }

  const retracting = mockClient(existing);
  await runMasterSpecsBackfillWith(retracting.client, deps, {
    apply: true,
    only,
    expect: 10,
    retract: true,
  });
  const deleted = retracting.writes.flatMap(({ payload, id }) =>
    specUpdateChanges(existing[String(id).replace(/^id-/, '')] as never, {
      specifications: payload.specifications as Record<string, unknown>,
    }).filter(c => c.endsWith('-> (none)'))
  );
  assert.ok(deleted.length >= 20, 'with --retract the dry-run deletions are written');
});

test('--retract is a strict, single, write-side flag', async () => {
  assert.deepEqual(parseBackfillSpecsArgs(['--only', 'a:b:c', '--retract']), {
    apply: false,
    auditOnly: false,
    only: ['a:b:c'],
    retract: true,
  });
  assert.equal('retract' in parseBackfillSpecsArgs(['--only', 'a:b:c']), false);
  assert.throws(() => parseBackfillSpecsArgs(['--retract', '--retract']), /repeated/);
  assert.throws(() => parseBackfillSpecsArgs(['--retract', '--audit-only']), /audit-only/);
  let seen: Record<string, unknown> | undefined;
  await runBackfillSpecsCli(['--only', 'a:b:c', '--retract'], {
    runBackfill: async options => {
      seen = options as Record<string, unknown>;
    },
  });
  assert.equal(seen?.retract, true);
  await runBackfillSpecsCli(['--only', 'a:b:c'], {
    runBackfill: async options => {
      seen = options as Record<string, unknown>;
    },
  });
  assert.equal('retract' in (seen ?? {}), false);
});
