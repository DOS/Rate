import { chromium } from 'playwright';
import { ShopeeScraper } from './shopee-scraper.js';

async function main() {
  const cdpEndpoint = 'http://127.0.0.1:9222';
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0];
  const page = await context.newPage();

  let selectedUrl = '';

  try {
    console.log('Navigating to Shopee category list: di động / thông minh...');
    await page.goto('https://shopee.vn/list/di%20%C4%91%E1%BB%99ng/th%C3%B4ng%20minh', {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });
    await page.waitForTimeout(4000);

    // Scroll slightly to trigger product rendering
    await page.evaluate(() => window.scrollBy({ top: 700, behavior: 'smooth' }));
    await page.waitForTimeout(2000);

    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="-i."]'));
      return anchors.map(a => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLElement).innerText ? (a as HTMLElement).innerText.replace(/\n+/g, ' | ') : ''
      })).filter(x => x.href.includes('shopee.vn'));
    });

    console.log(`Found ${links.length} products on category list.`);
    links.slice(0, 10).forEach((l, i) => {
      console.log(`[${i + 1}] ${l.text.slice(0, 70)}`);
      console.log(`    ${l.href}`);
    });

    if (links.length > 0) {
      selectedUrl = links[0].href;
    }
  } finally {
    await page.close().catch(() => {});
  }

  if (selectedUrl) {
    console.log(`\n================================================================`);
    console.log(`--> CÀO THÔNG TIN CHI TIẾT ĐIỆN THOẠI: ${selectedUrl}`);
    console.log(`================================================================\n`);

    const scraper = new ShopeeScraper({ cdpEndpoint, maxReviews: 10 });
    const product = await scraper.scrapeProduct(selectedUrl);

    console.log('\n================================================================');
    console.log('             THÔNG TIN SẢN PHẨM ĐIỆN THOẠI THU THẬP ĐƯỢC        ');
    console.log('================================================================');
    console.log(`📱 Tên máy       : ${product.title}`);
    console.log(`🏢 Gian hàng     : ${product.shop.name} (${product.shop.isMall ? 'Shopee Mall ⭐' : 'Shop thường'}) - ${product.shop.location || 'Toàn quốc'}`);
    console.log(`💰 Khoảng giá    : ${product.priceMin.toLocaleString('vi-VN')} - ${product.priceMax.toLocaleString('vi-VN')} ${product.currency}`);
    if (product.priceBeforeDiscount) {
      console.log(`🏷️  Giá niêm yết : ${product.priceBeforeDiscount.toLocaleString('vi-VN')} ${product.currency}`);
    }
    console.log(`📦 Tồn kho       : ${product.stock.toLocaleString('vi-VN')} chiếc`);
    console.log(`🔥 Đã bán        : ${product.historicalSold.toLocaleString('vi-VN')} chiếc`);
    console.log(`⭐ Điểm đánh giá : ${product.ratingStar} / 5.0 (${product.ratingCount} lượt đánh giá)`);
    console.log(`🖼️  Album ảnh     : ${product.images.length} ảnh sắc nét`);

    if (product.models.length > 0) {
      console.log('\n📋 Phiên bản / Tùy chọn màu & dung lượng (Models):');
      product.models.forEach((m, idx) => {
        console.log(`  ${idx + 1}. ${m.name.padEnd(30)} | ${m.price.toLocaleString('vi-VN')} ${product.currency} | Kho: ${m.stock}`);
      });
    }

    if (product.attributes.length > 0) {
      console.log('\n⚙️ Thông số kỹ thuật chi tiết (Attributes):');
      product.attributes.forEach((attr) => {
        console.log(`  • ${attr.name.padEnd(25)}: ${attr.value}`);
      });
    }

    if (product.reviews.length > 0) {
      console.log(`\n💬 Đánh giá từ người dùng thực tế (${product.reviews.length} mẫu):`);
      product.reviews.slice(0, 5).forEach((r, idx) => {
        console.log(`\n  [#${idx + 1}] ${r.author} - ${r.ratingStar}★ (${r.createdAt.slice(0, 10)})`);
        if (r.variation) console.log(`      Phiên bản chọn: ${r.variation}`);
        console.log(`      Nội dung: "${r.comment.replace(/\n+/g, ' ')}"`);
        if (r.sellerReply) console.log(`      Shop phản hồi: "${r.sellerReply.replace(/\n+/g, ' ')}"`);
      });
    }
  } else {
    console.log('No products found on category page.');
  }
}

main().catch(console.error);
