/**
 * Test PhoneArena Playwright Crawler
 */

import { PhoneArenaPlaywrightCrawler } from '../../crawlers/phonearena-playwright-crawler.js';

async function testPhoneArena(productName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TESTING PHONEARENA CRAWLER: ${productName}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();

  try {
    const crawler = new PhoneArenaPlaywrightCrawler();
    const data = await crawler.getPhoneData(productName);

    if (!data) {
      throw new Error('No data returned from crawler');
    }

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`RESULTS:`);
    console.log(`${'─'.repeat(80)}\n`);

    console.log(`✅ Name: ${data.name}`);
    console.log(`✅ Images: ${data.images.length} found`);
    console.log(`✅ Specifications: ${Object.keys(data.specifications).length} categories`);

    console.log(`\n📋 Sample Specifications:`);
    Object.entries(data.specifications)
      .slice(0, 3)
      .forEach(([category, specs]) => {
        console.log(`\n   [${category}]`);
        Object.entries(specs)
          .slice(0, 3)
          .forEach(([key, value]) => {
            console.log(`     ${key}: ${value}`);
          });
      });

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ TEST PASSED (${duration}s)`);
    console.log(`${'='.repeat(80)}\n`);

    process.exit(0);
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.error(`\n${'='.repeat(80)}`);
    console.error(`❌ TEST FAILED (${duration}s)`);
    console.error(`${'='.repeat(80)}\n`);
    console.error(error);

    process.exit(1);
  }
}

const productName = process.argv[2] || 'Samsung Galaxy S24';
testPhoneArena(productName);
