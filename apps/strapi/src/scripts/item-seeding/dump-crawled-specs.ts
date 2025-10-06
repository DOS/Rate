/**
 * Dump crawled specs structure from GSMArena
 * To see what fields are available for Strapi Component design
 */

import { GSMArenaPlaywrightCrawler } from '../../crawlers/gsmarena-playwright-crawler.js';

async function dumpSpecs(productName: string) {
  const crawler = new GSMArenaPlaywrightCrawler();

  try {
    await crawler.init();
    console.log(`\n🔍 Crawling: ${productName}\n`);

    // Search and get URL
    const url = await crawler.searchPhone(productName);
    if (!url) {
      console.log('❌ Product not found');
      return;
    }

    console.log(`✅ Found: ${url}\n`);

    // Crawl specs
    const data = await crawler.crawlPhoneSpecs(url);
    if (!data) {
      console.log('❌ Failed to crawl specs');
      return;
    }

    console.log('=' .repeat(80));
    console.log('CRAWLED DATA STRUCTURE');
    console.log('=' .repeat(80));
    console.log(`\nProduct: ${data.name}`);
    console.log(`Images: ${data.images.length} images`);

    if (data.quickSpecs && data.quickSpecs.length > 0) {
      console.log(`\nQuick Specs: ${data.quickSpecs.length} items`);
      data.quickSpecs.forEach((spec, i) => {
        console.log(`  ${i + 1}. ${spec}`);
      });
    }

    console.log(`\nMetadata:`);
    console.log(`  Release Date: ${data.metadata.releaseDate || 'N/A'}`);
    console.log(`  Status: ${data.metadata.status || 'N/A'}`);
    console.log(`  Popularity: ${data.metadata.popularity || 'N/A'}`);

    console.log(`\n${'='.repeat(80)}`);
    console.log('SPECIFICATIONS BY CATEGORY');
    console.log('=' .repeat(80));

    const categories = Object.keys(data.specifications);
    console.log(`\nTotal Categories: ${categories.length}\n`);

    categories.forEach((category, idx) => {
      const specs = data.specifications[category];
      const specCount = Object.keys(specs).length;

      console.log(`\n[${ idx + 1}/${categories.length}] ${category.toUpperCase()} (${specCount} fields)`);
      console.log('-'.repeat(80));

      Object.entries(specs).forEach(([key, value]) => {
        const displayValue = typeof value === 'string' && value.length > 80
          ? value.substring(0, 77) + '...'
          : value;
        console.log(`  • ${key}: ${displayValue}`);
      });
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log('SUMMARY FOR STRAPI COMPONENT DESIGN');
    console.log('=' .repeat(80));
    console.log(`\nCategories to create as Components:`);
    categories.forEach((cat, idx) => {
      const fieldCount = Object.keys(data.specifications[cat]).length;
      const fields = Object.keys(data.specifications[cat]);
      console.log(`\n${idx + 1}. Component: "specs.${cat.toLowerCase().replace(/\s+/g, '-')}"`);
      console.log(`   Fields (${fieldCount}):`);
      fields.forEach(field => {
        const fieldName = field.replace(/\s+/g, '');
        console.log(`   - ${fieldName}: string`);
      });
    });

    console.log(`\n${'='.repeat(80)}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await crawler.close();
  }
}

// Run
const productName = process.argv[2] || 'Samsung Galaxy S24';
dumpSpecs(productName);
