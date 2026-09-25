import { chromium } from 'playwright';
import { ShopeeScraper } from './shopee-scraper.js';

async function main() {
  const cdpEndpoint = 'http://127.0.0.1:9222';
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  let targetUrl = '';

  try {
    console.log('Visiting Samsung Official Store on Shopee...');
    await page.goto('https://shopee.vn/samsung_official_store', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3500);

    // Scroll down to load product carousel/grid
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy({ top: 1000, behavior: 'smooth' }));
      await page.waitForTimeout(1000);
    }

    const items = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="-i."]'));
      return anchors.map(a => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLElement).innerText ? (a as HTMLElement).innerText.replace(/\n+/g, ' | ') : ''
      })).filter(x => x.href.includes('shopee.vn'));
    });

    console.log(`Found ${items.length} product links in Samsung Store.`);
    const phoneItems = items.filter(it => /galaxy|điện thoại|smartphone|ultra|plus/i.test(it.text + it.href));
    console.log(`Found ${phoneItems.length} matching phone links.`);

    if (phoneItems.length > 0) {
      targetUrl = phoneItems[0].href;
      console.log(`Selected Samsung phone: ${phoneItems[0].text.slice(0, 70)}`);
      console.log(`URL: ${targetUrl}`);
    } else if (items.length > 0) {
      targetUrl = items[0].href;
      console.log(`Selected item: ${items[0].text.slice(0, 70)}`);
    }
  } finally {
    await page.close().catch(() => {});
  }

  if (targetUrl) {
    console.log(`\n--> Scraping Target: ${targetUrl}`);
    const scraper = new ShopeeScraper({ cdpEndpoint, maxReviews: 10 });
    const result = await scraper.scrapeProduct(targetUrl);

    console.log('\n================================================================');
    console.log('              KẾT QUẢ CÀO SAMSUNG GALAXY THỰC TẾ                ');
    console.log('================================================================');
    console.log(`📱 Tên sản phẩm : ${result.title}`);
    console.log(`🏢 Shop         : ${result.shop.name} (${result.shop.isMall ? 'Shopee Mall ⭐' : 'Normal'})`);
    console.log(`💰 Giá bán      : ${result.priceMin.toLocaleString('vi-VN')} - ${result.priceMax.toLocaleString('vi-VN')} ${result.currency}`);
    if (result.priceBeforeDiscount) {
      console.log(`🏷️  Giá gốc      : ${result.priceBeforeDiscount.toLocaleString('vi-VN')} ${result.currency}`);
    }
    console.log(`📦 Tồn kho      : ${result.stock.toLocaleString('vi-VN')}`);
    console.log(`🔥 Đã bán       : ${result.historicalSold.toLocaleString('vi-VN')}`);
    console.log(`⭐ Đánh giá     : ${result.ratingStar} / 5.0 (${result.ratingCount} đánh giá)`);
    console.log(`🖼️  Hình ảnh     : ${result.images.length} ảnh`);

    if (result.models.length > 0) {
      console.log('\n📋 Phân loại hàng (Bộ nhớ / Màu sắc):');
      result.models.slice(0, 6).forEach((m, idx) => {
        console.log(`  ${idx + 1}. ${m.name} | Giá: ${m.price.toLocaleString('vi-VN')} VND | Kho: ${m.stock}`);
      });
    }

    if (result.attributes.length > 0) {
      console.log('\n⚙️ Thông số kỹ thuật (Specs):');
      result.attributes.slice(0, 10).forEach((attr) => {
        console.log(`  • ${attr.name.padEnd(20)}: ${attr.value}`);
      });
    }

    if (result.reviews.length > 0) {
      console.log(`\n💬 Đánh giá thực tế của khách (${result.reviews.length} mẫu):`);
      result.reviews.slice(0, 3).forEach((r, idx) => {
        console.log(`  [Review ${idx + 1}] ${r.author} (${r.ratingStar}★)`);
        console.log(`    Nhận xét: "${r.comment.replace(/\n+/g, ' ')}"`);
      });
    }
  }
}

main().catch(console.error);
