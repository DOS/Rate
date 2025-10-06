/**
 * Push mapped PhoneArena data vào Strapi qua API
 *
 * Usage:
 *   yarn tsx src/scripts/item-seeding/push-to-strapi.ts <MAPPED_JSON_FILE>
 *
 * Example:
 *   yarn tsx src/scripts/item-seeding/push-to-strapi.ts Data/mapped/mapped-1759413629261.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { createStrapi, compileStrapi } from '@strapi/strapi';

interface MappedItem {
  Title: string;
  ItemType: string;
  Brand: string;
  PlatformIdentifiers: {
    phonearena: string;
    source: string;
    sourceUrl: string;
  };
  AnnouncedDate: string | null;
  AvailabilityStatus: string;
  DynamicFields: Record<string, any>;
  PublishedAt: null;
  Locale: string;
}

/**
 * Check if Item exists by PhoneArena ID (stored in PlatformIdentifiers)
 */
async function findExistingItem(
  strapi: any,
  phoneArenaId: string
): Promise<any | null> {
  // Get all items and filter in code (simpler than JSON query)
  const items = await strapi.entityService.findMany('api::item.item', {
    fields: ['id', 'Title', 'PlatformIdentifiers'],
    limit: -1, // Get all
  });

  // Filter by PlatformIdentifiers.phonearena
  const found = items.find(
    (item: any) => item.PlatformIdentifiers?.phonearena === phoneArenaId
  );

  return found || null;
}

/**
 * Create new Item
 */
async function createItem(strapi: any, itemData: MappedItem): Promise<any> {
  return await strapi.entityService.create('api::item.item', {
    data: itemData,
  });
}

/**
 * Update existing Item
 */
async function updateItem(
  strapi: any,
  itemId: number,
  itemData: MappedItem
): Promise<any> {
  return await strapi.entityService.update('api::item.item', itemId, {
    data: itemData,
  });
}

/**
 * Main function
 */
async function pushToStrapi(jsonFilePath: string) {
  console.log('='.repeat(80));
  console.log('PUSH PHONEARENA DATA TO STRAPI');
  console.log('='.repeat(80));
  console.log();

  // Read mapped JSON file
  const absolutePath = path.isAbsolute(jsonFilePath)
    ? jsonFilePath
    : path.join(process.cwd(), jsonFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(absolutePath, 'utf-8');
  const mappedItems: MappedItem[] = JSON.parse(rawData);

  console.log(`📂 Loaded ${mappedItems.length} items from ${path.basename(jsonFilePath)}\n`);

  // Bootstrap Strapi
  console.log('⚡ Bootstrapping Strapi...\n');
  const appContext = await compileStrapi();
  const strapi = await createStrapi(appContext).load();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Process each item
  for (let i = 0; i < mappedItems.length; i++) {
    const item = mappedItems[i];
    console.log(`[${i + 1}/${mappedItems.length}] Processing: ${item.Title}`);

    try {
      // Check if exists
      const existing = await findExistingItem(strapi, item.PlatformIdentifiers.phonearena);

      if (existing) {
        console.log(`  ℹ️  Found existing item (ID: ${existing.id})`);

        // Update
        await updateItem(strapi, existing.id, item);
        console.log(`  ✅ Updated\n`);
        updated++;
      } else {
        // Create new
        const newItem = await createItem(strapi, item);
        console.log(`  ✅ Created (ID: ${newItem.id})\n`);
        created++;
      }
    } catch (error: any) {
      console.error(`  ❌ Error: ${error.message}\n`);
      skipped++;
    }
  }

  console.log('='.repeat(80));
  console.log(`✅ Completed!`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log('='.repeat(80));

  // Cleanup
  await strapi.destroy();
}

// CLI
const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.error('❌ Usage: yarn tsx push-to-strapi.ts <MAPPED_JSON_FILE>');
  console.error(
    '   Example: yarn tsx push-to-strapi.ts Data/mapped/mapped-1759413629261.json'
  );
  process.exit(1);
}

pushToStrapi(jsonFilePath).catch((error) => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
