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
  parseGsmArenaHtmlToSpecs,
  parseGsmArenaBrandCatalogHtml,
  parsePhoneArenaCatalogHtml,
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

  // parseGsmArenaHtmlToSpecs enforces integer RAM/storage bounds, clean TB formatting, and meta URL checks (#831)
  const parsedSpec = parseGsmArenaHtmlToSpecs(
    `<h1 data-spec="modelname">Samsung Galaxy S26 Ultra</h1>
     <td data-spec="internalmemory">0.5GB 0.5GB RAM, 1200GB 12.5GB RAM, 1200GB 16GB RAM</td>`,
    {
      gsmarenaUrl: 'https://www.gsmarena.com/samsung_galaxy_s26_ultra-14015.php',
      phonearenaUrl: 'https://evil.example/phones/Samsung',
    }
  );
  assert.equal(parsedSpec.ramGb, 16);
  assert.equal(parsedSpec.storageGb, 1200);
  assert.equal(parsedSpec.keySpecs.storage, '1200GB');
  assert.equal(
    parsedSpec.gsmarenaUrl,
    'https://www.gsmarena.com/samsung_galaxy_s26_ultra-14015.php'
  );
  assert.equal(parsedSpec.phonearenaUrl, undefined);
  assert.equal(parsedSpec.source, 'gsmarena');

  const parsedTbSpec = parseGsmArenaHtmlToSpecs(
    `<h1 data-spec="modelname">Apple iPad Pro M5</h1>
     <td data-spec="internalmemory">1.5TB 16GB RAM</td>`
  );
  assert.equal(parsedTbSpec.storageGb, 1536);
  assert.equal(parsedTbSpec.keySpecs.storage, '1.5TB');

  // parseGsmArenaBrandCatalogHtml normalizes *.gsmarena.com image URLs and drops non-gsmarena image sources (#831)
  const gsmCatalog = parseGsmArenaBrandCatalogHtml(
    `<ul>
       <li><a href="xiaomi_18_pro-14288.php"><img src="//fdn2.gsmarena.com/vv/bigpic/xiaomi-18.jpg"><span>18 Pro</span></a></li>
       <li><a href="xiaomi_18-14287.php"><img src="https://evil.example/tracker.png"><span>18</span></a></li>
     </ul>`,
    'Xiaomi'
  );
  assert.equal(gsmCatalog.length, 2);
  assert.equal(gsmCatalog[0]?.imageUrl, 'https://fdn2.gsmarena.com/vv/bigpic/xiaomi-18.jpg');
  assert.equal(gsmCatalog[1]?.imageUrl, undefined);

  // parsePhoneArenaCatalogHtml canonicalizes URLs and rejects path traversal outside /phones/ (#831)
  const paCatalog = parsePhoneArenaCatalogHtml(
    `<div>
       <a href="/phones/Apple-iPhone-18-Pro_id12539">Apple iPhone 18 Pro</a>
       <a href="/phones/../../news/leak">Leaked News</a>
     </div>`
  );
  assert.equal(paCatalog.length, 1);
  assert.equal(paCatalog[0]?.url, 'https://www.phonearena.com/phones/Apple-iPhone-18-Pro_id12539');

  console.log('✅ ArenaSpecSyncer catalog audit suite passed');
}

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
