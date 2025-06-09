// Playwright-based crawler for checkscam.com
// Usage: node playwrightCheckScam.js

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const allLinks = [];
  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    const url = `https://checkscam.com/scams?page=${pageNum}`;
    console.log(`\n🌐 Đang mở trang: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    const html = await page.content();
    if (!html.includes('<body')) {
      console.error('❌ Không tìm thấy <body> trong HTML! Trang:', url);
      continue;
    }
    const profileLinks = await page.$$eval('a.stretched-link[href^="https://checkscam.com/scams/"]', links =>
      links.map(a => a.href)
    );
    console.log(`✅ Trang ${pageNum}: Tìm thấy ${profileLinks.length} profile links`);
    profileLinks.slice(0, 5).forEach((link, i) => {
      console.log(`#${i + 1}: ${link}`);
    });
    allLinks.push(...profileLinks);
  }
  console.log(`\n🎉 Tổng số link profile tìm được trên 5 trang: ${allLinks.length}`);
  await browser.close();
})();
