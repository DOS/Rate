/**
 * Test Full Flow (Without Database)
 * Test: Crawl → Merge → AI Normalize → Validate
 * Skip: Create Item (requires Strapi running)
 */

import type { QueueItem } from '../../crawlers/types.js';
import { CrawlerOrchestrator } from '../../crawlers/crawler-orchestrator.js';
import { ItemMerger } from '../../services/item-merger.js';
import { ItemNormalizer } from '../../services/item-normalizer.js';
import { ItemValidator } from '../../services/item-validator.js';

async function testFullFlow(productName: string, brand: string, category: 'phones' | 'laptops' = 'phones') {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`FULL FLOW TEST (NO DB): ${productName}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();

  try {
    // 1. Prepare queue item
    const queueItem: QueueItem = {
      name: productName,
      brand: brand,
      category: category,
    };

    console.log(`📦 Queue Item:`);
    console.log(`   Name: ${queueItem.name}`);
    console.log(`   Brand: ${queueItem.brand}`);
    console.log(`   Category: ${queueItem.category}`);

    // 2. Crawl from multiple sources
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`STEP 1: CRAWLING FROM SOURCES`);
    console.log(`${'─'.repeat(80)}\n`);

    const orchestrator = new CrawlerOrchestrator();
    const crawledData = await orchestrator.crawl(queueItem);

    if (crawledData.length === 0) {
      throw new Error('No data from any source');
    }

    console.log(`\n✅ Crawled data from ${crawledData.length} source(s):`);
    crawledData.forEach((data) => {
      console.log(`   - ${data.source} (reliability: ${data.reliability})`);
      console.log(`     Specs: ${Object.keys(data.data.specifications).length} categories`);
      console.log(`     Images: ${data.data.images.length}`);
    });

    // 3. Merge data
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`STEP 2: MERGING DATA`);
    console.log(`${'─'.repeat(80)}\n`);

    const merger = new ItemMerger();
    const mergedData = merger.merge(crawledData);

    const mergeValidation = merger.validate(mergedData);
    if (!mergeValidation.valid) {
      console.log(`⚠️  Merge validation issues:`);
      mergeValidation.issues.forEach((issue) => console.log(`   - ${issue}`));
    } else {
      console.log(`✅ Merge validation passed`);
    }

    console.log(`\nMerged Data Summary:`);
    console.log(`   Name: ${mergedData.name}`);
    console.log(`   Brand: ${mergedData.brand}`);
    console.log(`   Specs: ${Object.keys(mergedData.specifications).length} categories`);
    console.log(`   Images: ${mergedData.images.length}`);
    console.log(`   Sources: ${mergedData.sources.length}`);

    // 4. AI Normalize
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`STEP 3: AI NORMALIZATION (GPT-4o-mini)`);
    console.log(`${'─'.repeat(80)}\n`);

    const normalizer = new ItemNormalizer();
    const normalizedData = await normalizer.normalize(mergedData);

    console.log(`\n✅ Normalized Data:`);
    console.log(`\n   Vietnamese:`);
    console.log(`     Name: ${normalizedData.vi.name}`);
    console.log(`     Slug: ${normalizedData.vi.slug}`);
    console.log(`     Brand: ${normalizedData.vi.brand}`);
    console.log(`     Category: ${normalizedData.vi.category}`);
    console.log(`     Description: ${normalizedData.vi.shortDescription}`);
    console.log(`     Specs: ${Object.keys(normalizedData.vi.specifications).length} categories`);
    console.log(`     Images: ${normalizedData.vi.images.length}`);
    console.log(`     Key Features: ${normalizedData.vi.keyFeatures.length}`);
    if (normalizedData.vi.keyFeatures.length > 0) {
      normalizedData.vi.keyFeatures.slice(0, 3).forEach((feature) => {
        console.log(`       • ${feature}`);
      });
    }

    console.log(`\n   English:`);
    console.log(`     Name: ${normalizedData.en.name}`);
    console.log(`     Slug: ${normalizedData.en.slug}`);
    console.log(`     Description: ${normalizedData.en.shortDescription}`);

    console.log(`\n   Quality:`);
    console.log(`     Completeness: ${(normalizedData.quality.completeness * 100).toFixed(1)}%`);
    console.log(`     Confidence: ${(normalizedData.quality.confidence * 100).toFixed(1)}%`);
    if (normalizedData.quality.missingFields.length > 0) {
      console.log(`     Missing Fields: ${normalizedData.quality.missingFields.join(', ')}`);
    }

    // 5. Validate
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`STEP 4: QUALITY VALIDATION`);
    console.log(`${'─'.repeat(80)}\n`);

    const validator = new ItemValidator();
    const validation = validator.validate(normalizedData);

    console.log(validator.getValidationSummary(validation));

    if (!validation.valid) {
      throw new Error('Validation failed');
    }

    // 6. Decision
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`STEP 5: DECISION`);
    console.log(`${'─'.repeat(80)}\n`);

    const autoCreate = validator.meetsAutoCreateThreshold(normalizedData);
    const needsReview = validator.needsReview(normalizedData);

    if (autoCreate) {
      console.log(`✅ AUTO-CREATE: Quality meets threshold (≥95%)`);
      console.log(`   → Would create Item automatically in database`);
    } else if (needsReview) {
      console.log(`⚠️  REVIEW QUEUE: Quality 80-95%`);
      console.log(`   → Would add to admin review queue`);
    } else {
      console.log(`❌ SKIP: Quality too low (<80%)`);
      console.log(`   → Would skip this item`);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ FULL FLOW TEST COMPLETED IN ${duration}s`);
    console.log(`${'='.repeat(80)}\n`);

    console.log(`📊 Summary:`);
    console.log(`   Product: ${normalizedData.vi.name}`);
    console.log(`   Quality: ${(normalizedData.quality.completeness * 100).toFixed(1)}%`);
    console.log(`   Decision: ${autoCreate ? 'AUTO-CREATE' : needsReview ? 'REVIEW' : 'SKIP'}`);
    console.log(`   Duration: ${duration}s\n`);

    process.exit(0);
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.error(`\n${'='.repeat(80)}`);
    console.error(`❌ FULL FLOW TEST FAILED AFTER ${duration}s`);
    console.error(`${'='.repeat(80)}\n`);
    console.error(error);

    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`Usage: yarn test:full-flow "<product_name>" "<brand>" [category]`);
  console.log(`Example: yarn test:full-flow "Samsung Galaxy S24" "Samsung" "phones"`);
  process.exit(1);
}

const productName = args[0];
const brand = args[1];
const category = (args[2] as 'phones' | 'laptops') || 'phones';

testFullFlow(productName, brand, category);
