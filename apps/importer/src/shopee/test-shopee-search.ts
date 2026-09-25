import { ShopeeSearchScraper } from './shopee-search-scraper.js';

async function main() {
  const keyword = process.argv[2] || 'chuột không dây';
  console.log(`====================================================`);
  console.log(`        SHOPEE BATCH SEARCH TEST (60 ITEMS)        `);
  console.log(`====================================================`);
  console.log(`Keyword: ${keyword}`);

  const scraper = new ShopeeSearchScraper('http://localhost:9222');
  const start = Date.now();

  try {
    const result = await scraper.search(keyword, { limit: 10, sortBy: 'sales' });
    const duration = ((Date.now() - start) / 1000).toFixed(2);

    console.log(`\n--> Execution Time: ${duration}s`);
    console.log(`Total Reported: ${result.totalCount}`);
    console.log(`Items Fetched : ${result.items.length}\n`);

    console.log(`Sample Top 5 Best Sellers:`);
    result.items.slice(0, 5).forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.isOfficialShop ? 'MALL' : 'NORMAL'}] ${item.title.slice(0, 60)}...`);
      console.log(`     - Giá: ${item.priceMin.toLocaleString()} VND (Gốc: ${item.priceBeforeDiscount ? item.priceBeforeDiscount.toLocaleString() + ' VND' : 'N/A'})`);
      console.log(`     - Đã bán: ${item.historicalSold.toLocaleString()} | Rating: ${item.ratingStar.toFixed(1)}/5.0`);
      console.log(`     - Shop ID: ${item.shopId} | Item ID: ${item.itemId}`);
      console.log(`     - Link: ${item.rawUrl}\n`);
    });

    console.log(`[PASS] Batch Search Scraper successfully extracted ${result.items.length} products in ${duration}s!`);
  } catch (err: any) {
    console.error(`[FAIL] Search failed:`, err.message);
    process.exit(1);
  }
}

main();
