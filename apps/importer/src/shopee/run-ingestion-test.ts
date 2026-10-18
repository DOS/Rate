import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ShopeeIngestionPipeline } from './shopee-to-supabase.js';
import { createImporterLogger } from './logger.js';

dotenv.config({ quiet: true });

const logger = createImporterLogger('RunIngestionTest');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const crawlFile = path.resolve(
    __dirname,
    '../../Results/shopee_smartphones_crawl_2026-09-17T09-12-40-878Z.json'
  );

  if (!fs.existsSync(crawlFile)) {
    logger.error('test.missing_file', `File not found: ${crawlFile}`);
    process.exit(1);
  }

  logger.info('test.load', `Loading crawled dataset from: ${crawlFile}`);
  const rawData = JSON.parse(fs.readFileSync(crawlFile, 'utf-8'));
  const products = rawData.results;

  logger.info('test.count', `Found ${products.length} products to ingest.`);

  const pipeline = new ShopeeIngestionPipeline();
  await pipeline.init();

  for (const product of products) {
    try {
      const res = await pipeline.ingestProduct(product);
      logger.info('test.product_done', `Result for "${product.title}"`, { ...res });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('test.product_error', `Ingestion error for "${product.title}": ${msg}`);
    }
  }

  logger.info('test.complete', 'Ingestion finished! Verifying data in Supabase...');
}

main().catch((err: unknown) => {
  logger.error('test.fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
