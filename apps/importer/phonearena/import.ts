/**
 * PhoneArena Import Script
 *
 * Usage:
 *   yarn tsx apps/importer/phonearena/import.ts <CRAWLED_JSON_FILE>
 *
 * Example:
 *   yarn tsx apps/importer/phonearena/import.ts Data/crawled/phonearena-1759413489663.json
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  mapPhoneArenaToItem,
  validateItem,
  StrapiClient,
  type PhoneArenaRawData,
} from '@repo/importer';

async function main() {
  const jsonFilePath = process.argv[2];

  if (!jsonFilePath) {
    console.error('❌ Usage: yarn tsx import.ts <CRAWLED_JSON_FILE>');
    console.error('   Example: yarn tsx import.ts Data/crawled/phonearena-*.json');
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('PHONEARENA IMPORT TO STRAPI');
  console.log('='.repeat(80));
  console.log();

  // Read crawled JSON
  const absolutePath = path.isAbsolute(jsonFilePath)
    ? jsonFilePath
    : path.join(process.cwd(), jsonFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  const rawData: PhoneArenaRawData[] = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
  console.log(`📂 Loaded ${rawData.length} phones from ${path.basename(jsonFilePath)}\n`);

  // Map data
  console.log('🔄 Mapping data...\n');
  const mappedItems = rawData.map(mapPhoneArenaToItem);

  // Validate
  console.log('✅ Validating...\n');
  const validItems = [];
  const invalidItems = [];

  for (const item of mappedItems) {
    const result = validateItem(item);
    if (result.valid) {
      validItems.push(item);
      if (result.warnings.length > 0) {
        console.warn(`⚠️  ${item.Title}:`);
        result.warnings.forEach((w) => console.warn(`   - ${w}`));
      }
    } else {
      invalidItems.push({ item, result });
      console.error(`❌ ${item.Title}:`);
      result.errors.forEach((e) => console.error(`   - ${e}`));
    }
  }

  console.log();
  console.log(`Valid: ${validItems.length} ✅`);
  console.log(`Invalid: ${invalidItems.length} ❌`);
  console.log();

  if (validItems.length === 0) {
    console.error('❌ No valid items to import');
    process.exit(1);
  }

  // Push to Strapi
  console.log('🚀 Pushing to Strapi...\n');

  const strapiUrl = process.env.STRAPI_URL || 'http://localhost:1337';
  const strapiToken = process.env.STRAPI_API_TOKEN;

  if (!strapiToken) {
    console.error('❌ Missing STRAPI_API_TOKEN environment variable');
    process.exit(1);
  }

  const client = new StrapiClient({
    apiUrl: strapiUrl,
    apiToken: strapiToken,
  });

  const stats = await client.importItems(validItems, {
    onProgress: (current, total, item) => {
      console.log(`[${current}/${total}] Processing: ${item.Title}`);
    },
    onError: (item, error) => {
      console.error(`  ❌ Error: ${error.message}`);
    },
  });

  console.log();
  console.log('='.repeat(80));
  console.log('✅ COMPLETED!');
  console.log(`   Created: ${stats.created}`);
  console.log(`   Updated: ${stats.updated}`);
  console.log(`   Skipped: ${stats.skipped}`);
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
