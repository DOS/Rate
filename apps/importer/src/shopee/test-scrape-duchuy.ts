import { chromium } from 'playwright';
import { ShopeeScraper } from './shopee-scraper.js';

async function main() {
  const cdpEndpoint = 'http://127.0.0.1:9222';
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  let targetProductUrl = '';

  try {
    console.log('Navigating to Đức Huy Mobile shop...');
    await page.goto('https://shopee.vn/duchuymobile.shop', { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3500);

    // Scroll down to load product grid
    await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
    await page.waitForTimeout(2000);

    const items = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="-i."]'));
      return anchors.map(a => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLElement).innerText ? (a as HTMLElement).innerText.replace(/\n+/g, ' | ') : ''
      })).filter(x => x.href.includes('shopee.vn'));
    });

    console.log(`Found ${items.length} products in shop.`);
    items.slice(0, 5).forEach((item, idx) => {
      console.log(`[${idx + 1}] ${item.text.slice(0, 70)}`);
      console.log(`    ${item.href}`);
    });

    if (items.length > 0) {
      targetProductUrl = items[0].href;
    }
  } finally {
    await page.close().catch(() => {});
  }

  // Fallback to the live Apple iPhone Air link verified earlier if shop grid was empty
  if (!targetProductUrl) {
    targetProductUrl = 'https://shopee.vn/Điện-thoại-Apple-iPhone-Air-256GB-i.88201679.40818391346';
  }

  console.log(`\n--> Scraping Target Smartphone: ${targetProductUrl}`);
  const scraper = new ShopeeScraper({ cdpEndpoint, maxReviews: 10 });
  const result = await scraper.scrapeProduct(targetProductUrl);

  console.log('\n================================================================');
  console.log('       KẾT QUẢ CÀO THỰC TẾ NGÀNH HÀNG ĐIỆN THOẠI THÔNG MINH     ');
  console.log('================================================================');
  console.log(`📱 Tên sản phẩm : ${result.title}`);
  console.log(`🏢 Shop         : ${result.shop.name} (${result.shop.isMall ? 'Shopee Mall' : 'Shop Thường'})`);
  console.log(`💰 Giá bán      : ${result.priceMin.toLocaleString('vi-VN')} - ${result.priceMax.toLocaleString('vi-VN')} ${result.currency}`);
  console.log(`📦 Tồn kho      : ${result.stock.toLocaleString('vi-VN')}`);
  console.log(`🔥 Đã bán       : ${result.historicalSold.toLocaleString('vi-VN')}`);
  console.log(`⭐ Đánh giá     : ${result.ratingStar} / 5.0 (${result.ratingCount} đánh giá)`);
  console.log(`🖼️  Hình ảnh     : ${result.images.length} ảnh`);

  console.log('\n📋 Phân loại hàng (Models):');
  result.models.forEach((m, idx) => {
    console.log(`  ${idx + 1}. ${m.name} | Giá: ${m.price.toLocaleString('vi-VN')} ${result.currency} | Kho: ${m.stock}`);
  });

  console.log('\n⚙️ Thông số kỹ thuật (Attributes):');
  result.attributes.forEach((attr) => {
    console.log(`  • ${attr.name}: ${attr.value}`);
  });

  if (result.reviews.length > 0) {
    console.log(`\n💬 Đánh giá khách hàng (${result.reviews.length} mẫu):`);
    result.reviews.slice(0, 3).forEach((r, idx) => {
      console.log(`  [${idx + 1}] ${r.author} (${r.ratingStar}★)`);
      console.log(`      Nhận xét: "${r.comment.replace(/\n+/g, ' ')}"`);
      if (r.variation) console.log(`      Phiên bản: ${r.variation}`);
    });
  }
}

main().catch(console.error);
