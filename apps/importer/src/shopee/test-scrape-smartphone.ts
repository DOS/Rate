import { chromium } from 'playwright';
import { ShopeeScraper, ShopeeProduct } from './shopee-scraper.js';

async function main() {
  const cdpEndpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
  console.log('================================================================');
  console.log('       SHOPEE SMARTPHONE (ĐIỆN THOẠI THÔNG MINH) SCRAPER        ');
  console.log('================================================================');
  console.log(`Connecting to CDP at: ${cdpEndpoint}...`);

  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const context = browser.contexts()[0];

  // 1. Search for top smartphone or visit a direct official store
  console.log('\n[1/3] Finding live smartphone product on Shopee...');
  const searchPage = await context.newPage();
  let productUrl = '';

  try {
    const searchUrl = 'https://shopee.vn/search?category=11036030&keyword=%C4%91i%E1%BB%87n%20tho%E1%BA%A1i%20th%C3%B4ng%20minh&sortBy=sales';
    console.log(`Navigating to search page (sorted by sales): ${searchUrl}`);
    await searchPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await searchPage.waitForTimeout(3500);

    // Check if redirect or captcha occurred on search
    const currentUrl = searchPage.url();
    console.log(`Current Search Page URL: ${currentUrl.slice(0, 100)}`);

    const links = await searchPage.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="-i."]'));
      return anchors.map(a => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLElement).innerText ? (a as HTMLElement).innerText.replace(/\n+/g, ' | ') : ''
      })).filter(x => x.href.includes('shopee.vn'));
    });

    console.log(`Found ${links.length} smartphone product links on search page.`);
    if (links.length > 0) {
      links.slice(0, 5).forEach((item, idx) => {
        console.log(`  [${idx + 1}] ${item.text.slice(0, 70)}`);
      });
      productUrl = links[0].href;
    }
  } catch (err: any) {
    console.warn(`Search error: ${err.message}`);
  } finally {
    await searchPage.close().catch(() => {});
  }

  // Fallback to verified official Shopee Mall smartphone link if search page was blocked/empty
  if (!productUrl) {
    console.log('\nUsing known official Shopee Mall smartphone target...');
    // Apple Flagship Store product
    productUrl = 'https://shopee.vn/Điện-thoại-Apple-iPhone-Air-256GB-i.88201679.40818391346';
  }

  console.log(`\n[2/3] Target Smartphone URL: ${productUrl}`);

  // 2. Scrape product details & reviews with 4G Proxy support
  const scraper = new ShopeeScraper({
    cdpEndpoint,
    maxReviews: 10,
    timeoutMs: 35000,
    proxy: true,
  });
  const pm = scraper.getProxyManager();
  if (pm) {
    const currentIp = await pm.getCurrentIp();
    console.log(`[4G Proxy Active] Current Mobile IP: ${currentIp}`);
  }
  const startTime = Date.now();
  const product: ShopeeProduct = await scraper.scrapeProduct(productUrl);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // 3. Display comprehensive extracted smartphone specs and data
  console.log('\n================================================================');
  console.log(`           SCRAPING RESULT (${duration}s)                       `);
  console.log('================================================================');
  console.log(`📱 Tên sản phẩm : ${product.title}`);
  console.log(`🏢 Shop         : ${product.shop.name} (${product.shop.isMall ? 'Shopee Mall ⭐' : 'Shop thường'}) - ${product.shop.location || 'N/A'}`);
  console.log(`💰 Giá bán      : ${product.priceMin.toLocaleString('vi-VN')} - ${product.priceMax.toLocaleString('vi-VN')} ${product.currency}`);
  if (product.priceBeforeDiscount) {
    console.log(`🏷️  Giá gốc      : ${product.priceBeforeDiscount.toLocaleString('vi-VN')} ${product.currency}`);
  }
  console.log(`📦 Tồn kho      : ${product.stock.toLocaleString('vi-VN')} máy`);
  console.log(`🔥 Đã bán       : ${product.historicalSold.toLocaleString('vi-VN')} máy`);
  console.log(`⭐ Đánh giá     : ${product.ratingStar} / 5.0 (${product.ratingCount.toLocaleString('vi-VN')} lượt đánh giá)`);
  console.log(`🖼️  Hình ảnh     : ${product.images.length} ảnh`);

  console.log('\n📋 PHÂN LOẠI HÀNG (MODELS / VARIATIONS):');
  product.models.slice(0, 8).forEach((m, idx) => {
    console.log(`  - [${idx + 1}] ${m.name} | Giá: ${m.price.toLocaleString('vi-VN')} ${product.currency} | Kho: ${m.stock}`);
  });

  console.log('\n⚙️ THÔNG SỐ KỸ THUẬT CHI TIẾT (ATTRIBUTES):');
  product.attributes.forEach((attr) => {
    console.log(`  • ${attr.name.padEnd(25)}: ${attr.value}`);
  });

  console.log(`\n💬 ĐÁNH GIÁ THỰC TẾ CỦA KHÁCH HÀNG (${product.reviews.length} mẫu):`);
  product.reviews.slice(0, 5).forEach((r, idx) => {
    console.log(`\n  [Review ${idx + 1}] ${r.author} - ${r.ratingStar}★ (${r.createdAt.slice(0, 10)})`);
    if (r.variation) console.log(`  Phân loại mua: ${r.variation}`);
    console.log(`  Nhận xét: "${r.comment.replace(/\n+/g, ' ')}"`);
    if (r.images && r.images.length > 0) {
      console.log(`  Ảnh đính kèm: ${r.images.length} ảnh`);
    }
  });

  console.log('\n================================================================');
  console.log('✅ HOÀN TẤT CÀO DỮ LIỆU ĐIỆN THOẠI THÔNG MINH THÀNH CÔNG!');
  console.log('================================================================\n');
}

main().catch(console.error);
