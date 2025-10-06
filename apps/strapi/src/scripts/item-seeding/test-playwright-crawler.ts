/**
 * Test Playwright Crawler
 * Simple test to verify Playwright crawler works
 */

import { GSMArenaPlaywrightCrawler } from '../../crawlers/gsmarena-playwright-crawler.js';

async function testPlaywrightCrawler(productName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`TESTING PLAYWRIGHT CRAWLER: ${productName}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();

  try {
    const crawler = new GSMArenaPlaywrightCrawler();
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
    console.log(`✅ Quick Specs: ${data.quickSpecs?.length || 0} items`);

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

// Run test
const productName = process.argv[2] || 'Samsung Galaxy S24';
testPlaywrightCrawler(productName);
