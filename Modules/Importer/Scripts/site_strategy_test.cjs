// Script test từng giải pháp crawl cho từng domain, log kết quả
// Node.js CJS, chạy: node site_strategy_test.cjs
const { getStrategiesForDomain } = require('./siteStrategyResolver.cjs');
const { execSync } = require('child_process');

// Danh sách domain và 1 URL test cho mỗi domain
// Cấu hình test cho từng domain: url, selector, mô tả
const testSites = [
  {
    domain: 'checkscam.com',
    url: 'https://checkscam.com/scams?page=1',
    selector: 'a.stretched-link[href^="https://checkscam.com/scams/"]',
    desc: 'Profile link checkscam.com'
  },
  {
    domain: 'checkscam.vn',
    url: 'https://checkscam.vn/category/danh-sanh-scam/',
    selector: 'a[href^="/canh-bao/"]',
    desc: 'Profile link checkscam.vn (relative)'
  },
  {
    domain: 'lazada.vn',
    url: 'https://www.lazada.vn/catalog/?page=1',
    selector: 'div[data-qa-locator="product-item"] a',
    desc: 'Product link lazada.vn (placeholder)'
  }
];

// Map tên giải pháp sang lệnh test (demo: chỉ support playwright và flaresolverr)
function runPlaywrightTest(url, selector, desc) {
  try {
    // Tạo script tạm thời để truyền selector động
    const fs = require('fs');
    const tempScript = `temp_playwright_test.cjs`;
    const tempScriptContent = [
      "const { chromium } = require('playwright');",
      "(async () => {",
      "  const browser = await chromium.launch({ headless: true });",
      `  let page = null;`,
      `  if (${JSON.stringify(url)}.includes('checkscam.vn')) {`,
      "    // Tạo context với user-agent và viewport",
      "    const context = await browser.newContext({",
      "      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',",
      "      viewport: { width: 1200, height: 800 }",
      "    });",
      "    page = await context.newPage();",
      "  } else {",
      "    page = await browser.newPage();",
      "  }",
      `  await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 120000 });`,
      // Custom logic for checkscam.vn: close popup, wait AJAX, click 'Xem thêm'
      `  if (${JSON.stringify(url)}.includes('checkscam.vn')) {`,
      "    // Scroll nhẹ để kích hoạt AJAX",
      "    // Đóng popup nếu có",
      "    try {",
      "      await page.waitForSelector('.mft .cls', { timeout: 5000 });",
      "      await page.click('.mft .cls');",
      "    } catch (e) { console.log('Không thấy popup hoặc nút đóng'); }",
      "    // Scroll nhẹ để kích hoạt AJAX",
      "    await page.evaluate(() => window.scrollBy(0, 300));",
      "    // Chờ nội dung AJAX load",
      "    try {",
      "      await page.waitForSelector('.ct1 a', { timeout: 30000 });",
      "    } catch (e) { console.log('Không thấy .ct1 a sau 30s'); }",
      "    // Click 'Xem thêm' 3 lần nếu có",
      "    for (let i = 0; i < 3; i++) {",
      "      try {",
      "        await page.click('button.load-more');",
      "        await page.waitForTimeout(2000);",
      "      } catch (e) { break; }",
      "    }",
      "    const links = await page.$$eval('.ct1 a', as => as.map(a => a.href));",
      `    console.log('✅ ' + ${JSON.stringify(desc)} + ': Tìm thấy', links.length, 'links');`,
      "    links.slice(0, 5).forEach((link, i) => console.log(`#${i + 1}:`, link));",
      "    await browser.close();",
      "    process.exit(0);",
      "  }",
      // Default for other domains
      "  const html = await page.content();",
      "  if (!html.includes('<body')) {",
      "    console.error('❌ Không tìm thấy <body> trong HTML!');",
      "    await browser.close();",
      "    process.exit(1);",
      "  }",
      `  const links = await page.$$eval(${JSON.stringify(selector)}, links => links.map(a => a.href));`,
      `  console.log('✅ ' + ${JSON.stringify(desc)} + ': Tìm thấy', links.length, 'links');`,
      "  links.slice(0, 5).forEach((link, i) => console.log(`#${i + 1}:`, link));",
      "  await browser.close();",
      "})();"
    ].join('\n');
    fs.writeFileSync(tempScript, tempScriptContent);

    execSync(`node ${tempScript}`, { stdio: 'inherit' });
    fs.unlinkSync(tempScript);
    return true;
  } catch (e) {
    console.log('❌ Playwright FAIL:', e.message);
    return false;
  }
}
// FlareSolverr demo: chỉ log giả lập, chưa có script thực tế
function runFlareSolverrTest(url, selector, desc) {
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');
    const FLARE_URL = process.env.FLARESOLVERR_URL || 'http://localhost:8191';
    const payload = {
      cmd: 'request.get',
      url,
      maxTimeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
      }
    };
    const res = axios.post(`${FLARE_URL}/v1`, payload, { timeout: 70000 });
    return res.then(r => {
      const html = r.data && r.data.solution && r.data.solution.response;
      if (!html || !html.includes('<body')) {
        console.log('❌ FlareSolverr: Không lấy được HTML body!');
        return false;
      }
      const $ = cheerio.load(html);
      let links = [];
      if (selector) {
        links = $(selector).map((i, el) => $(el).attr('href')).get();
      } else {
        // fallback: regex for /canh-bao/ links
        links = Array.from(html.matchAll(/href=["'](\/canh-bao\/[0-9a-zA-Z\-_]+\.html)["']/g)).map(m => m[1]);
      }
      // Normalize relative links
      links = links.map(l => l.startsWith('http') ? l : 'https://checkscam.vn' + l);
      console.log(`✅ ${desc} (FlareSolverr): Tìm thấy`, links.length, 'links');
      links.slice(0, 5).forEach((link, i) => console.log(`#${i + 1}:`, link));
      return links.length > 0;
    }).catch(e => {
      console.log('❌ FlareSolverr FAIL:', e.message);
      return false;
    });
  } catch (e) {
    console.log('❌ FlareSolverr Exception:', e.message);
    return false;
  }
}

const methodRunner = {
  playwright: runPlaywrightTest,
  flaresolverr: runFlareSolverrTest
};

(async () => {
  const fs = require('fs');
  const path = require('path');
  const resultsFile = path.join(__dirname, 'test_results.json');
  let allResults = [];
  if (fs.existsSync(resultsFile)) {
    try { allResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8')); } catch {}
  }

  for (const site of testSites) {
    console.log(`\n=== TEST SITE: ${site.domain} ===`);
    const strategies = getStrategiesForDomain(site.domain);
    let success = false;
    let numLinks = 0;
    let methodUsed = null;
    for (const method of strategies) {
      console.log(`\n→ Thử giải pháp: ${method.toUpperCase()}`);
      const runner = methodRunner[method];
      if (!runner) {
        console.log('Không có runner cho method này!');
        continue;
      }
      let runnerResult;
      if (method === 'playwright') {
        if (!site.selector) {
          console.log('❗ Selector undefined cho domain:', site.domain);
        }
        runnerResult = runner(site.url, site.selector, site.desc);
      } else {
        runnerResult = runner(site.url, site.selector, site.desc);
      }
      if (runnerResult && typeof runnerResult.then === 'function') {
        success = await runnerResult;
      } else {
        success = runnerResult;
      }
      methodUsed = method;
      // numLinks: not available directly, set to 0 for now
      numLinks = 0;
      // Log result
      const resultObj = {
        domain: site.domain,
        method,
        success: !!success,
        num_links: numLinks,
        timestamp: new Date().toISOString()
      };
      allResults.push(resultObj);
      fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
      if (success) {
        console.log(`✅ Thành công với ${method} cho ${site.domain}`);
        break;
      }
    }
    if (!success) {
      console.log(`❌ Không giải pháp nào chạy được cho ${site.domain}`);
      // Suggest update mapping
      console.log(`[GỢI Ý] Xem lại site_strategy.json cho domain này!`);
    }
  }
})();
