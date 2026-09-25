import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ShopeeIngestionPipeline } from './shopee-to-supabase.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const crawlFile = path.resolve(__dirname, '../../Results/shopee_smartphones_crawl_2026-09-17T09-12-40-878Z.json');

  if (!fs.existsSync(crawlFile)) {
    console.error(`File not found: ${crawlFile}`);
    process.exit(1);
  }

  console.log(`[Test] Loading crawled dataset from: ${crawlFile}`);
  const rawData = JSON.parse(fs.readFileSync(crawlFile, 'utf-8'));
  const products = rawData.results;

  console.log(`[Test] Found ${products.length} products to ingest.`);

  const pipeline = new ShopeeIngestionPipeline();
  await pipeline.init();

  for (const product of products) {
    try {
      const res = await pipeline.ingestProduct(product);
      console.log(`[Test] Result for "${product.title}":`, res);
    } catch (err: any) {
      console.error(`[Test] Ingestion error for "${product.title}":`, err.message);
    }
  }

  console.log('\n[Test] Ingestion finished! Verifying data in Supabase...');
}

main().catch(console.error);
