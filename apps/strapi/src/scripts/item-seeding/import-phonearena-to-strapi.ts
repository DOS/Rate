/**
 * Import PhoneArena crawled data vào Strapi
 *
 * Usage:
 *   yarn tsx src/scripts/item-seeding/import-phonearena-to-strapi.ts <JSON_FILE>
 *
 * Example:
 *   yarn tsx src/scripts/item-seeding/import-phonearena-to-strapi.ts Data/crawled/phonearena-1759413489663.json
 */

import * as fs from 'fs';
import * as path from 'path';

interface PhoneArenaData {
  url: string;
  specs: Record<string, Record<string, string>>;
}

/**
 * Extract phone name từ URL
 * https://www.phonearena.com/phones/Xiaomi-17_id12857 -> Xiaomi 17
 */
function extractPhoneName(url: string): string {
  const match = url.match(/\/phones\/([^_]+)_id\d+$/);
  if (!match) return '';
  return match[1].replace(/-/g, ' ');
}

/**
 * Extract PhoneArena ID từ URL
 * https://www.phonearena.com/phones/Xiaomi-17_id12857 -> 12857
 */
function extractPhoneArenaId(url: string): string {
  const match = url.match(/_id(\d+)$/);
  return match ? match[1] : '';
}

/**
 * Parse announced date
 * "Oct 25, 2025" -> Date object
 */
function parseAnnouncedDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Map PhoneArena data sang Strapi Item structure
 */
function mapPhoneArenaToItem(data: PhoneArenaData): any {
  const availability = data.specs['Availability'] || {};
  const design = data.specs['Design'] || {};
  const display = data.specs['Display'] || {};
  const hardware = data.specs['Hardware'] || {};
  const battery = data.specs['Battery'] || {};
  const camera = data.specs['Camera'] || {};

  // Extract basic info
  const name = extractPhoneName(data.url);
  const phoneArenaId = extractPhoneArenaId(data.url);
  const announcedDate = parseAnnouncedDate(availability['Officially announced']);

  // Map to Strapi Item structure
  return {
    // Basic fields - match Item schema
    Title: name, // Required field
    ItemType: 'Product', // Phone là Product
    Brand: name.split(' ')[0], // Extract brand từ name (e.g., "Xiaomi 17" -> "Xiaomi")

    // Platform identifiers
    PlatformIdentifiers: {
      phonearena: phoneArenaId,
      source: 'PhoneArena',
      sourceUrl: data.url,
    },

    // Availability
    AnnouncedDate: announcedDate,
    AvailabilityStatus: 'Available', // Default, sẽ update sau nếu cần

    // Specs - lưu vào DynamicFields vì chưa có Specs component
    DynamicFields: {
      // Design
      Dimensions: design['Dimensions'] || null,
      Weight: design['Weight'] || null,
      Materials: design['Materials'] || null,
      Colors: design['Colors'] || null,
      WaterResistance: design['Resistance'] || null,
      Biometrics: design['Biometrics'] || null,

      // Display
      DisplaySize: display['Size'] || null,
      DisplayType: display['Type'] || null,
      DisplayResolution: display['Resolution'] || null,
      DisplayProtection: display['Protection'] || null,

      // Hardware
      Chipset: hardware['System chip'] || null,
      CPU: hardware['Processor'] || null,
      GPU: hardware['GPU'] || null,
      Memory: hardware['Memory'] || null,
      StorageExpansion: hardware['Storage expansion'] || null,
      OS: hardware['OS'] || null,

      // Battery
      BatteryCapacity: battery['Type'] || null,
      ChargingSpeed: battery['Charge speed'] || null,
      ChargingTechnology: battery['Charging'] || null,

      // Camera
      RearCamera: camera['Rear'] || null,
      MainCamera: camera['Main camera'] || null,
      SecondCamera: camera['Second camera'] || null,
      ThirdCamera: camera['Third camera'] || null,
      FrontCamera: camera['Front'] || null,
      VideoRecording: camera['Video recording'] || null,
    },

    // Metadata
    PublishedAt: null, // Chưa publish
    Locale: 'vi', // Mặc định Vietnamese
  };
}

/**
 * Main function
 */
async function importPhoneArenaData(jsonFilePath: string) {
  console.log('='.repeat(80));
  console.log('IMPORT PHONEARENA DATA TO STRAPI');
  console.log('='.repeat(80));
  console.log();

  // Read JSON file
  const absolutePath = path.isAbsolute(jsonFilePath)
    ? jsonFilePath
    : path.join(process.cwd(), jsonFilePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(absolutePath, 'utf-8');
  const phoneData: PhoneArenaData[] = JSON.parse(rawData);

  console.log(`📂 Loaded ${phoneData.length} phones from ${path.basename(jsonFilePath)}\n`);

  // Map data
  const mappedItems = phoneData.map((phone, idx) => {
    const item = mapPhoneArenaToItem(phone);
    console.log(`[${idx + 1}/${phoneData.length}] Mapped: ${item.Title}`);
    return item;
  });

  // Save mapped data to file
  const outputDir = path.join(process.cwd(), 'Data', 'mapped');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, `mapped-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(mappedItems, null, 2));

  console.log();
  console.log('='.repeat(80));
  console.log(`✅ Mapped ${mappedItems.length} items`);
  console.log(`📁 Saved to: ${outputFile}`);
  console.log('='.repeat(80));
  console.log();
  console.log('📋 Next steps:');
  console.log('  1. Review mapped data');
  console.log('  2. Create script to push to Strapi API');
  console.log('  3. Handle duplicate detection');
}

// CLI
const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.error('❌ Usage: yarn tsx import-phonearena-to-strapi.ts <JSON_FILE>');
  console.error('   Example: yarn tsx import-phonearena-to-strapi.ts Data/crawled/phonearena-1759413489663.json');
  process.exit(1);
}

importPhoneArenaData(jsonFilePath).catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
