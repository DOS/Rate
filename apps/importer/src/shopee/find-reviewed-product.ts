import { chromium } from 'playwright';
import { ShopeeScraper } from './shopee-scraper.js';

async function main() {
  const cdpEndpoint = 'http://localhost:9222';
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0];
  
  let page = context.pages().find(p => p.url().includes('shopee.vn'));
  let shouldClose = false;

  if (!page) {
    console.log('No existing Shopee tab found. Opening a search tab...');
    page = await context.newPage();
    shouldClose = true;
    await page.goto('https://shopee.vn/search?keyword=chuot%20khong%20day', {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  console.log('Active Shopee page:', page.url());

  // Extract all product cards
  const items = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('a[href*="-i."]'));
    return cards.map(c => {
      const href = (c as HTMLAnchorElement).href;
      const text = (c as HTMLElement).innerText || '';
      return { href, text: text.replace(/\n+/g, ' | ') };
    }).filter(x => x.href.includes('shopee.vn'));
  });

  if (shouldClose) {
    await page.close().catch(() => {});
  }

  console.log(`Found ${items.length} product links on search page.`);
  if (items.length === 0) {
    console.log('Could not find product links. Check if search page rendered.');
    return;
  }

  items.slice(0, 5).forEach((item, idx) => {
    console.log(`[${idx}] ${item.text.slice(0, 60)} -> ${item.href.slice(0, 70)}`);
  });

  const selected = items[0];
  console.log(`\nSelected product: ${selected.href}`);

  const scraper = new ShopeeScraper({ cdpEndpoint, maxReviews: 10 });
  const result = await scraper.scrapeProduct(selected.href);

  console.log('\n================ SCRAPING SUCCESS ================');
  console.log('Title               :', result.title);
  console.log('Item ID / Shop ID   :', `${result.itemId} / ${result.shopId}`);
  console.log('Price               :', result.priceMin.toLocaleString(), '-', result.priceMax.toLocaleString(), result.currency);
  console.log('Historical Sold     :', result.historicalSold);
  console.log('Rating              :', `${result.ratingStar} ★ (${result.ratingCount} reviews)`);
  console.log('Shop Name           :', result.shop.name, `(${result.shop.isMall ? 'Mall' : 'Normal'})`);
  console.log('Models / Variations :', result.models.length);
  console.log('Captured Reviews    :', result.reviews.length);

  if (result.reviews.length > 0) {
    console.log('\nSample Review:');
    console.log(`- Author: ${result.reviews[0].author} (${result.reviews[0].ratingStar}★)`);
    console.log(`- Comment: "${result.reviews[0].comment.slice(0, 100)}..."`);
  }
}

main().catch(console.error);
