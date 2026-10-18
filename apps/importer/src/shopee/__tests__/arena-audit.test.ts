/**
 * ArenaSpecSyncer.auditCatalogAgainstArenaRegistry (DOS/Rate#422):
 * - reads every master product, past one PostgREST page
 * - the report does not depend on where page boundaries fall
 * - a read error rejects instead of reporting every flagship missing
 */
import assert from 'node:assert/strict';
import {
  ArenaSpecSyncer,
  UPSTREAM_2026_ARENA_REFERENCE_URLS,
  type ArenaAuditMasterRow,
} from '../arena-spec-syncer.js';

const FULL_SPECS = Object.fromEntries(
  [
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
  ].map(group => [group, { value: 'x' }])
);

// A fake master_products table that, like PostgREST, never returns more than
// `maxRows` rows per response whatever range is asked for.
function fakeClient(rows: ArenaAuditMasterRow[], maxRows: number, failAtOffset?: number) {
  const calls: Array<[number, number]> = [];
  const client = {
    from: (table: string) => {
      assert.equal(table, 'master_products');
      return {
        select: (columns: string) => {
          assert.equal(columns, 'id, name, slug, model_key, specifications');
          return {
            order: (column: string, options: { ascending: boolean }) => {
              assert.equal(column, 'id');
              assert.equal(options.ascending, true);
              return {
                range: (from: number, to: number) => {
                  calls.push([from, to]);
                  if (failAtOffset !== undefined && from >= failAtOffset) {
                    return Promise.resolve({ data: null, error: { message: 'boom' } });
                  }
                  const end = Math.min(to + 1, from + maxRows);
                  return Promise.resolve({ data: rows.slice(from, end), error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

async function run() {
  console.log('🧪 ArenaSpecSyncer catalog audit suite');
  const syncer = new ArenaSpecSyncer();
  const [first, second] = UPSTREAM_2026_ARENA_REFERENCE_URLS;
  assert.ok(first && second, 'registry has at least two flagships');

  // 2,500 filler masters with full specs, then the two flagships past row 1000:
  // one matched by model_key, one by slug and with incomplete specs.
  const rows: ArenaAuditMasterRow[] = Array.from({ length: 2500 }, (_, i) => ({
    id: `m-${String(i).padStart(5, '0')}`,
    name: `Filler ${i}`,
    model_key: `filler:${i}`,
    slug: `filler-${i}`,
    specifications: FULL_SPECS,
  }));
  rows.push(
    {
      id: 'z-1',
      name: first.name,
      model_key: first.model_key.toUpperCase(),
      specifications: FULL_SPECS,
    },
    {
      id: 'z-2',
      name: second.name,
      model_key: 'other:key',
      slug: second.slug,
      specifications: { display: { size: '6.9' }, camera: {} },
    }
  );

  const capped = fakeClient(rows, 1000);
  const report = await syncer.auditCatalogAgainstArenaRegistry(capped.client);
  assert.ok(capped.calls.length > 3, 'kept reading past the 1000-row cap');
  assert.equal(report.totalArena2026Flagships, UPSTREAM_2026_ARENA_REFERENCE_URLS.length);
  assert.equal(report.presentInDatabase, 2, 'both flagships past row 1000 are found');
  assert.ok(!report.missingFromDatabase.some(m => m.slug === first.slug || m.slug === second.slug));
  assert.equal(report.missingFromDatabase.length, UPSTREAM_2026_ARENA_REFERENCE_URLS.length - 2);
  assert.deepEqual(report.incompleteSpecMasters, [
    { id: 'z-2', name: second.name, model_key: 'other:key', populatedGroups: 1 },
  ]);

  // Same table read with small, uneven pages: identical report.
  const smallPages = fakeClient(rows, 1000);
  assert.deepEqual(await syncer.auditCatalogAgainstArenaRegistry(smallPages.client, 333), report);

  // A read error on a later page rejects; no partial or fabricated report.
  const failing = fakeClient(rows, 1000, 1000);
  await assert.rejects(
    syncer.auditCatalogAgainstArenaRegistry(failing.client),
    /Arena catalog audit: failed to read master_products: boom/
  );

  // An empty catalog is a real result: every flagship is missing.
  const empty = await syncer.auditCatalogAgainstArenaRegistry(fakeClient([], 1000).client);
  assert.equal(empty.presentInDatabase, 0);
  assert.equal(empty.missingFromDatabase.length, UPSTREAM_2026_ARENA_REFERENCE_URLS.length);
  assert.deepEqual(empty.incompleteSpecMasters, []);

  console.log('✅ ArenaSpecSyncer catalog audit suite passed');
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
