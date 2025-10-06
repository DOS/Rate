/**
 * Seed Single Item Script
 * Test script to seed one item and verify the entire flow
 */

import Strapi from '@strapi/strapi';
import type { QueueItem } from '../../crawlers/types.js';
import { CrawlerOrchestrator } from '../../crawlers/crawler-orchestrator.js';
import { ItemMerger } from '../../services/item-merger.js';
import { ItemNormalizer } from '../../services/item-normalizer.js';
import { ItemValidator } from '../../services/item-validator.js';

async function seedSingleItem(productName: string, brand: string, category: 'phones' | 'laptops' = 'phones') {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ITEM SEEDING TEST: ${productName}`);
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
    console.log(JSON.stringify(queueItem, null, 2));

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
    }

    // 4. AI Normalize
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`STEP 3: AI NORMALIZATION`);
    console.log(`${'─'.repeat(80)}\n`);

    const normalizer = new ItemNormalizer();
    const normalizedData = await normalizer.normalize(mergedData);

    console.log(`\n✅ Normalized Data:`);
    console.log(`   VI: ${normalizedData.vi.name}`);
    console.log(`   EN: ${normalizedData.en.name}`);
    console.log(`   Slug: ${normalizedData.vi.slug}`);
    console.log(`   Brand: ${normalizedData.vi.brand}`);
    console.log(`   Category: ${normalizedData.vi.category}`);
    console.log(`   Specs: ${Object.keys(normalizedData.vi.specifications).length} categories`);
    console.log(`   Images: ${normalizedData.vi.images.length}`);
    console.log(`   Key Features: ${normalizedData.vi.keyFeatures.length}`);

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

    // 6. Create Item in Strapi
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`STEP 5: CREATING ITEM IN STRAPI`);
    console.log(`${'─'.repeat(80)}\n`);

    const strapi = await Strapi().load();

    // Check if item already exists
    const existing = await strapi.db.query('api::item.item').findOne({
      where: {
        $or: [{ name: normalizedData.vi.name }, { slug: normalizedData.vi.slug }],
      },
    });

    if (existing) {
      console.log(`⚠️  Item already exists (ID: ${existing.id})`);
      console.log(`   Skipping creation...`);
    } else {
      // Create Vietnamese version
      console.log(`📝 Creating Vietnamese version...`);
      const viItem = await strapi.entityService.create('api::item.item', {
        data: {
          name: normalizedData.vi.name,
          slug: normalizedData.vi.slug,
          description: normalizedData.vi.description,
          shortDescription: normalizedData.vi.shortDescription,
          brand: normalizedData.vi.brand,
          model: normalizedData.vi.model,
          category: normalizedData.vi.category,
          specifications: normalizedData.vi.specifications,
          keyFeatures: normalizedData.vi.keyFeatures,
          images: normalizedData.vi.images,
          metadata: normalizedData.vi.metadata,
          publishedAt: new Date(),
        },
        locale: 'vi',
      });

      console.log(`✅ Vietnamese item created (ID: ${viItem.id})`);

      // Create English version
      console.log(`📝 Creating English version...`);
      const enItem = await strapi.entityService.create('api::item.item', {
        data: {
          name: normalizedData.en.name,
          slug: normalizedData.en.slug,
          description: normalizedData.en.description,
          shortDescription: normalizedData.en.shortDescription,
          brand: normalizedData.en.brand,
          model: normalizedData.en.model,
          category: normalizedData.en.category,
          specifications: normalizedData.en.specifications,
          keyFeatures: normalizedData.en.keyFeatures,
          images: normalizedData.en.images,
          metadata: normalizedData.en.metadata,
          documentId: viItem.documentId, // Link to Vietnamese version
          publishedAt: new Date(),
        },
        locale: 'en',
      });

      console.log(`✅ English item created (ID: ${enItem.id})`);
      console.log(`🔗 Linked via documentId: ${viItem.documentId}`);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ SEEDING COMPLETED IN ${duration}s`);
    console.log(`${'='.repeat(80)}\n`);
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.error(`\n${'='.repeat(80)}`);
    console.error(`❌ SEEDING FAILED AFTER ${duration}s`);
    console.error(`${'='.repeat(80)}\n`);
    console.error(error);

    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`Usage: yarn seed:item:test "<product_name>" "<brand>" [category]`);
  console.log(`Example: yarn seed:item:test "iPhone 16 Pro Max" "Apple" "phones"`);
  process.exit(1);
}

const productName = args[0];
const brand = args[1];
const category = (args[2] as 'phones' | 'laptops') || 'phones';

seedSingleItem(productName, brand, category)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
