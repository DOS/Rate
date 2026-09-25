import fs from 'node:fs';
import path from 'node:path';
import { ShopeeScraper, ShopeeProduct } from './shopee-scraper.js';

// List of target smartphones across official Shopee Mall stores
const SMARTPHONE_TARGETS = [
  {
    name: 'Apple iPhone 16 128GB (Apple Flagship Store)',
    url: 'https://shopee.vn/Điện-thoại-Apple-iPhone-16-128GB-i.88201679.27110898667',
  },
  {
    name: 'Apple iPhone 15 128GB (Apple Flagship Store)',
    url: 'https://shopee.vn/Điện-thoại-Apple-iPhone-15-128GB-i.88201679.18093055535',
  },
  {
    name: 'Apple iPhone 16 Plus 256GB (Apple Flagship Store)',
    url: 'https://shopee.vn/Điện-thoại-Apple-iPhone-16-Plus-256GB-i.88201679.29410893286',
  },
];

async function main() {
  console.log('================================================================');
  console.log('    SHOPEE SMARTPHONE BATCH CRAWLER WITH 4G ROTATING PROXY     ');
  console.log('================================================================');

  const cdpEndpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
  const scraper = new ShopeeScraper({
    cdpEndpoint,
    maxReviews: 10,
    timeoutMs: 35000,
    proxy: true,
    autoRotateOnBlock: true,
  });

  const pm = scraper.getProxyManager();
  if (pm) {
    const ip = await pm.getCurrentIp();
    console.log(`[4G Proxy Active] Initial Mobile IP: ${ip}\n`);
  }

  const results: ShopeeProduct[] = [];
  const errors: Array<{ name: string; url: string; error: string }> = [];

  for (let i = 0; i < SMARTPHONE_TARGETS.length; i++) {
    const target = SMARTPHONE_TARGETS[i];
    console.log(`\n----------------------------------------------------------------`);
    console.log(`[${i + 1}/${SMARTPHONE_TARGETS.length}] Crawling: ${target.name}`);
    console.log(`URL: ${target.url}`);
    console.log(`----------------------------------------------------------------`);

    const start = Date.now();
    try {
      const product = await scraper.scrapeProduct(target.url);
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`✅ Scraped successfully in ${elapsed}s!`);
      console.log(`   - Tên: ${product.title}`);
      console.log(`   - Giá: ${product.priceMin.toLocaleString('vi-VN')} - ${product.priceMax.toLocaleString('vi-VN')} ${product.currency}`);
      console.log(`   - Shop: ${product.shop.name} (${product.shop.isMall ? 'Mall ⭐' : 'Thường'})`);
      console.log(`   - Phân loại hàng: ${product.models.length} mẫu`);
      console.log(`   - Đánh giá: ${product.reviews.length} reviews`);

      results.push(product);
    } catch (err: any) {
      console.error(`❌ Error scraping ${target.name}:`, err.message);
      errors.push({ name: target.name, url: target.url, error: err.message });

      // Rotate IP on failure to ensure fresh session for next item
      if (pm) {
        console.log('[Crawler] Rotating 4G IP for next product retry...');
        await pm.rotateIp();
      }
    }

    // Polite delay between products
    if (i < SMARTPHONE_TARGETS.length - 1) {
      console.log('Sleeping 3s before next product...');
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // Save results to disk
  const outDir = path.resolve(process.cwd(), 'Results');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `shopee_smartphones_crawl_${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ results, errors, crawledAt: new Date().toISOString() }, null, 2));

  console.log('\n================================================================');
  console.log('                     CRAWL SUMMARY REPORT                       ');
  console.log('================================================================');
  console.log(`Total Targets : ${SMARTPHONE_TARGETS.length}`);
  console.log(`Success       : ${results.length}`);
  console.log(`Errors        : ${errors.length}`);
  console.log(`Saved To      : ${outFile}`);
  console.log('================================================================\n');
}

main().catch(console.error);
