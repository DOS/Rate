import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('shopee.vn')) || await context.newPage();

  console.log('Current page URL:', page.url());

  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('search') && !u.includes('.js') && !u.includes('.css') && !u.includes('doubleclick')) {
      console.log(`[HTTP ${resp.status()}] ${u}`);
      try {
        const text = await resp.text();
        console.log(`Payload preview: ${text.slice(0, 300)}\n`);
      } catch {}
    }
  });

  console.log('Reloading search page to sniff actual search requests...');
  await page.goto('https://shopee.vn/search?keyword=chuot%20khong%20day', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  console.log('Done sniffing.');
}

main().catch(console.error);
