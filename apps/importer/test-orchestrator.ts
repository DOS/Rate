/**
 * Test ScraperOrchestrator với Tier 1 PhoneArena scraper
 *
 * Usage:
 *   yarn tsx apps/importer/test-orchestrator.ts <PHONEARENA_URL>
 *
 * Example:
 *   yarn tsx apps/importer/test-orchestrator.ts https://www.phonearena.com/phones/Xiaomi-17_id12857
 */

import 'dotenv/config';
import {
  ScraperOrchestrator,
  PhoneArenaScraper,
  mapPhoneArenaToItem,
  validateItem,
} from '@repo/importer';

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('❌ Usage: yarn tsx test-orchestrator.ts <PHONEARENA_URL>');
    console.error('   Example: yarn tsx test-orchestrator.ts https://www.phonearena.com/phones/Xiaomi-17_id12857');
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('TEST: SCRAPER ORCHESTRATOR');
  console.log('='.repeat(80));
  console.log();

  // 1. Create orchestrator
  const orchestrator = new ScraperOrchestrator({
    fallbackEnabled: true,
    cache: {
      enabled: true,
      ttl: 7 * 24 * 60 * 60, // 7 days
      prefix: 'scraper',
    },
    scrapers: [],
  });

  // 2. Register Tier 1 scraper
  const phoneArenaScraper = new PhoneArenaScraper();
  orchestrator.registerScraper(phoneArenaScraper);

  console.log('📊 Orchestrator stats:', orchestrator.getStats());
  console.log();

  // 3. Scrape
  console.log(`🔍 Scraping: ${url}\n`);
  const result = await orchestrator.scrape(url);

  if (!result.success) {
    console.error(`\n❌ Scraping failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`\n✅ Scraping succeeded!`);
  console.log(`   Source: ${result.source}`);
  console.log(`   Tier: ${result.tier}`);
  console.log(`   Cached: ${result.cached || false}`);
  console.log();

  // 4. Map to Strapi format
  console.log('🗺️  Mapping to Strapi Item format...\n');
  const mappedItem = mapPhoneArenaToItem(result.data);

  console.log(`   Title: ${mappedItem.Title}`);
  console.log(`   Brand: ${mappedItem.Brand}`);
  console.log(`   Status: ${mappedItem.AvailabilityStatus}`);
  console.log(`   Announced: ${mappedItem.AnnouncedDate || 'N/A'}`);
  console.log();

  // 5. Validate
  console.log('✔️  Validating...\n');
  const validation = validateItem(mappedItem);

  if (validation.valid) {
    console.log('   ✅ Validation passed!');
  } else {
    console.log('   ❌ Validation failed:');
    validation.errors.forEach(err => console.log(`      - ${err}`));
  }

  if (validation.warnings.length > 0) {
    console.log('\n   ⚠️  Warnings:');
    validation.warnings.forEach(warn => console.log(`      - ${warn}`));
  }

  console.log();
  console.log('='.repeat(80));
  console.log('MAPPED ITEM (Preview):');
  console.log('='.repeat(80));
  console.log(JSON.stringify(mappedItem, null, 2).slice(0, 1000) + '...');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
