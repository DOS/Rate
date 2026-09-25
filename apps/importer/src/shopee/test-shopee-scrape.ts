import { chromium } from 'playwright';
import { ShopeeScraper } from './shopee-scraper.js';

async function main() {
  const cdpEndpoint = process.env.CDP_ENDPOINT || 'http://localhost:9222';
  let targetUrl = process.argv[2];

  console.log('====================================================');
  console.log('       SHOPEE SCRAPER VERIFICATION TEST             ');
  console.log('====================================================');
  console.log(`CDP Endpoint: ${cdpEndpoint}`);

  const scraper = new ShopeeScraper({ cdpEndpoint, maxReviews: 10 });

  // If no target URL was specified, find a product link from an existing open Shopee tab
  if (!targetUrl) {
    console.log('\nNo target URL provided. Checking active Chrome tabs for Shopee products...');
    try {
      const browser = await chromium.connectOverCDP(cdpEndpoint);
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        const pages = contexts[0].pages();
        const shopeePage = pages.find(p => p.url().includes('shopee.vn'));
        
        if (shopeePage) {
          console.log(`Found active Shopee tab: ${shopeePage.url()}`);
          
          // If already on a product page, use it
          if (shopeePage.url().includes('i.')) {
            targetUrl = shopeePage.url();
          } else {
            // Find first product link on the page (e.g. from search results)
            console.log('Searching for product links in current tab...');
            const links: string[] = await shopeePage.evaluate(() => {
              const anchors = Array.from(document.querySelectorAll('a[href*="-i."]'));
              return anchors.map(a => (a as HTMLAnchorElement).href).filter(h => h.includes('shopee.vn'));
            });

            if (links.length > 0) {
              targetUrl = links[0];
              console.log(`Found product link from search page: ${targetUrl}`);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`Could not inspect tabs: ${err.message}`);
    }
  }

  // Fallback default sample product if nothing found
  if (!targetUrl) {
    targetUrl = 'https://shopee.vn/product-i.88201452.1904724016';
    console.log(`Using fallback test URL: ${targetUrl}`);
  }

  console.log(`\n--> Scraping Target: ${targetUrl}`);
  const startTime = Date.now();

  try {
    const product = await scraper.scrapeProduct(targetUrl);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n====================================================');
    console.log('       SCRAPE SUCCESSFUL! (Extracted Data)          ');
    console.log('====================================================');
    console.log(`Execution Time: ${duration}s`);
    console.log(`Product Title : ${product.title}`);
    console.log(`Item ID       : ${product.itemId}`);
    console.log(`Shop ID       : ${product.shopId}`);
    console.log(`Shop Name     : ${product.shop.name} (${product.shop.isMall ? 'Shopee Mall' : 'Regular Shop'})`);
    console.log(`Shop Location : ${product.shop.location || 'N/A'}`);
    console.log(`Price Range   : ${product.priceMin.toLocaleString('vi-VN')} - ${product.priceMax.toLocaleString('vi-VN')} ${product.currency}`);
    console.log(`Historical Sold: ${product.historicalSold.toLocaleString('vi-VN')}`);
    console.log(`Stock         : ${product.stock.toLocaleString('vi-VN')}`);
    console.log(`Rating        : ${product.ratingStar.toFixed(1)} / 5.0 (${product.ratingCount.toLocaleString('vi-VN')} reviews)`);
    console.log(`Images Count  : ${product.images.length}`);
    console.log(`Models/SKUs   : ${product.models.length}`);

    if (product.models.length > 0) {
      console.log('\nSample Variations (Models):');
      product.models.slice(0, 3).forEach((m, idx) => {
        console.log(`  ${idx + 1}. ${m.name} - ${m.price.toLocaleString('vi-VN')} VND (Stock: ${m.stock})`);
      });
    }

    if (product.attributes.length > 0) {
      console.log('\nSample Specifications:');
      product.attributes.slice(0, 4).forEach(a => {
        console.log(`  - ${a.name}: ${a.value}`);
      });
    }

    console.log(`\nReviews Extracted: ${product.reviews.length}`);
    if (product.reviews.length > 0) {
      console.log('Sample Reviews:');
      product.reviews.slice(0, 3).forEach((r, idx) => {
        console.log(`  [Review ${idx + 1}] (${r.ratingStar}★) ${r.author} [${r.createdAt.slice(0, 10)}]:`);
        console.log(`    "${r.comment.slice(0, 120)}${r.comment.length > 120 ? '...' : ''}"`);
        if (r.variation) console.log(`    Phân loại: ${r.variation}`);
      });
    }

    console.log('\nFull JSON preview (metadata):');
    const preview = {
      ...product,
      description: product.description ? product.description.slice(0, 150) + '...' : '',
      reviews: product.reviews.slice(0, 2),
    };
    console.log(JSON.stringify(preview, null, 2));

    console.log('\n[PASS] Verified Shopee scraping pipeline works cleanly without anti-bot blockage.');
  } catch (err: any) {
    console.error('\n[FAIL] Scraping error:', err.message);
    process.exit(1);
  }
}

main();
