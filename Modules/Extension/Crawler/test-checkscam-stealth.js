const { chromium } = require('playwright');

async function testCheckscamStealth() {
  console.log('🥷 Testing checkscam.vn with STEALTH mode...\n');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000, // Slow down to appear more human
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--disable-features=CrossSiteDocumentBlockingIfIsolating',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      permissions: ['geolocation'],
      geolocation: { latitude: 10.8231, longitude: 106.6297 }, // Ho Chi Minh City
      colorScheme: 'light',
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      javascriptEnabled: true,
      acceptDownloads: true,
      ignoreHTTPSErrors: true
    });

    // Enhanced stealth scripts
    await context.addInitScript(() => {
      // Override navigator properties
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      
      // Chrome specific
      window.chrome = { runtime: {} };
      
      // Permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.apply(this, arguments);
      };
    });

    const page = await context.newPage();
    
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });

    console.log('📍 Step 1: Navigate to homepage first (like a real user)...');
    await page.goto('https://checkscam.vn/', {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    
    await page.waitForTimeout(3000);
    console.log('✅ Homepage loaded');
    
    // Move mouse randomly
    await page.mouse.move(100, 100);
    await page.mouse.move(500, 300);
    
    console.log('📍 Step 2: Click on menu or navigate to scam list...');
    
    // Try to find and click menu link
    const menuLink = await page.$('a[href*="danh-sanh-scam"]');
    if (menuLink) {
      console.log('🖱️ Found menu link, clicking...');
      await menuLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      console.log('🔗 Direct navigation to scam list...');
      await page.goto('https://checkscam.vn/category/danh-sanh-scam/', {
        waitUntil: 'networkidle',
        timeout: 60000
      });
    }
    
    await page.waitForTimeout(5000);
    
    console.log('📊 Current URL:', page.url());
    console.log('📄 Page title:', await page.title());
    
    // Check page content
    const pageContent = await page.content();
    
    if (pageContent.includes('Access Denied') || pageContent.includes('Error 1020')) {
      console.log('❌ Still blocked by protection!');
      
      // Try to solve challenge if visible
      const challengeButton = await page.$('input[type="submit"], button[type="submit"]');
      if (challengeButton) {
        console.log('🔘 Found challenge button, clicking...');
        await challengeButton.click();
        await page.waitForTimeout(10000);
      }
    }
    
    // Advanced data extraction
    console.log('\n🔍 Attempting advanced extraction...');
    
    const scamData = await page.evaluate(() => {
      const results = [];
      
      // Method 1: Find all links
      const allLinks = Array.from(document.querySelectorAll('a'));
      const scamLinks = allLinks.filter(link => {
        const href = link.href;
        const text = link.textContent;
        return href && (
          href.includes('/scam/') || 
          href.includes('/report/') ||
          href.includes('/bao-cao/') ||
          (text && text.match(/\d{9,11}|scam|lừa đảo/i))
        );
      });
      
      scamLinks.forEach(link => {
        results.push({
          url: link.href,
          text: link.textContent?.trim(),
          title: link.title || '',
          parent: link.parentElement?.tagName
        });
      });
      
      // Method 2: Find phone numbers in text
      const bodyText = document.body.innerText;
      const phoneRegex = /\b(0|84)\d{9,10}\b/g;
      const phones = bodyText.match(phoneRegex) || [];
      
      // Method 3: Find any div/article with scam content
      const contentDivs = document.querySelectorAll('div, article, section');
      contentDivs.forEach(div => {
        const text = div.textContent;
        if (text && text.match(/scam|lừa đảo|chiếm đoạt|stk|tài khoản/i)) {
          const links = div.querySelectorAll('a');
          links.forEach(link => {
            if (link.href && !results.find(r => r.url === link.href)) {
              results.push({
                url: link.href,
                text: link.textContent?.trim(),
                context: text.substring(0, 100)
              });
            }
          });
        }
      });
      
      return {
        links: results.slice(0, 20),
        phoneNumbers: [...new Set(phones)].slice(0, 10),
        pageStructure: {
          hasArticles: document.querySelectorAll('article').length,
          hasPosts: document.querySelectorAll('.post, .entry, .item').length,
          hasPhoneNumbers: phones.length
        }
      };
    });
    
    console.log('\n📊 Extraction Results:');
    console.log(`Found ${scamData.links.length} potential links`);
    console.log(`Found ${scamData.phoneNumbers.length} phone numbers`);
    console.log('Page structure:', scamData.pageStructure);
    
    if (scamData.links.length > 0) {
      console.log('\n🔗 Sample links:');
      scamData.links.slice(0, 5).forEach((link, i) => {
        console.log(`${i + 1}. ${link.text || 'No text'}`);
        console.log(`   URL: ${link.url}`);
        if (link.context) console.log(`   Context: ${link.context}`);
      });
    }
    
    if (scamData.phoneNumbers.length > 0) {
      console.log('\n📱 Phone numbers found:', scamData.phoneNumbers);
    }
    
    // Screenshot
    await page.screenshot({ 
      path: `checkscam-stealth-${Date.now()}.png`,
      fullPage: false 
    });
    console.log('\n📸 Screenshot saved');
    
    // Try to access a specific report if we found any
    if (scamData.links.length > 0 && scamData.links[0].url.includes('checkscam.vn')) {
      console.log('\n🔍 Trying to access first report...');
      const firstLink = scamData.links[0].url;
      
      await page.goto(firstLink, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      await page.waitForTimeout(3000);
      
      const reportData = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          title: document.title,
          hasPhone: /\b(0|84)\d{9,10}\b/.test(text),
          hasBank: /bank|ngân hàng/i.test(text),
          hasAmount: /số tiền|amount|\d+[.,]\d+/i.test(text),
          textLength: text.length
        };
      });
      
      console.log('Report page data:', reportData);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    console.log('\n⏸️ Keeping browser open for 10 seconds to observe...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log('🔚 Closing browser...');
    await browser.close();
  }
}

// Run the test
testCheckscamStealth().catch(console.error);
