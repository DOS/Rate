// Puppeteer Extra + plugin-stealth: Shopee anti-bot bypass demo
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const PRODUCT_URL = process.argv[2];
if (!PRODUCT_URL) {
  console.error('❌ Bạn phải truyền URL sản phẩm Shopee vào dòng lệnh!');
  console.error('Ví dụ: node Scripts/shopee-stealth-crawler.cjs https://shopee.vn/xxx-i.shopid.itemid');
  process.exit(1);
}
console.log('🌐 Sẽ crawl URL:', PRODUCT_URL);
// Thử lần lượt Default và Profile 1 nếu Profile 2 không đúng
const USER_DATA_DIR = 'C:/Users/JOY/AppData/Local/Google/Chrome/User Data/ShopeeCrawlerProfile'; // Profile riêng cho crawler
const PROFILE_ARG = ''; // Không cần --profile-directory khi dùng profile riêng
console.log('🟦 Đang dùng profile riêng cho crawler:', USER_DATA_DIR);
console.log('ℹ️ Nếu lần đầu, hãy đăng nhập Shopee trong cửa sổ Chrome này. Những lần sau sẽ giữ đăng nhập, không bị lock profile!');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', // Chrome thường
    userDataDir: USER_DATA_DIR,
    args: [
      PROFILE_ARG,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,720'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  console.log('➡️ Đang mở trang Shopee:', PRODUCT_URL);
  try {
    const response = await page.goto(PRODUCT_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    if (!response || !response.ok()) {
      console.error('❌ Không mở được trang Shopee hoặc bị chặn!');
      process.exit(3);
    }
    console.log('✅ Đã mở trang Shopee thành công:', PRODUCT_URL);
  } catch (e) {
    console.error('❌ Lỗi khi mở trang Shopee:', e.message);
    process.exit(4);
  }

  // Đợi login thủ công nếu chưa login (chỉ lần đầu)
  if (await page.$('input[name="loginKey"]')) {
    console.log('Hãy login Shopee thủ công, sau đó nhấn Enter để tiếp tục...');
    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));
  }

  // Đợi trang render xong
  await page.waitForTimeout(5000);

  // Lấy HTML và lưu ra file
  const path = require('path');
  const absPath = path.resolve('shopee-stealth-result.html');
  try {
    fs.writeFileSync(absPath, html);
    console.log('✅ Đã lưu HTML trang sản phẩm Shopee (stealth) ra file:', absPath);
  } catch (e) {
    console.error('❌ Lỗi khi lưu file:', e.message);
    process.exit(2);
  }

  // Lấy review (nếu muốn crawl tiếp)
  // const reviews = await page.evaluate(() => {
  //   // ... custom DOM crawl review ...
  // });

  // await browser.close(); // Để mở browser cho bạn kiểm tra manual
})();
