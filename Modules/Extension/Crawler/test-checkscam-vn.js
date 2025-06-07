const { chromium } = require('playwright');

async function testCheckscamVN() {
  console.log('🚀 Testing checkscam.vn crawler...\n');
  
  const browser = await chromium.launch({
    headless: false, // Show browser to see what happens
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox'
    ]
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh'
    });

    // Add stealth scripts
    await context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    const page = await context.newPage();
    
    console.log('📍 Navigating to checkscam.vn...');
    const response = await page.goto('https://checkscam.vn/category/danh-sanh-scam/', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    console.log('📊 Response status:', response.status());
    console.log('🌐 Current URL:', page.url());
    
    // Wait a bit to see if there's any redirect or challenge
    await page.waitForTimeout(5000);
    
    // Check for Cloudflare or other protection
    const pageContent = await page.content();
    if (pageContent.includes('Cloudflare') || pageContent.includes('cf-browser-verification')) {
      console.log('⚠️  Cloudflare protection detected!');
      console.log('⏳ Waiting for challenge to complete...');
      
      // Wait for Cloudflare to pass
      await page.waitForTimeout(10000);
    }
    
    // Try to find scam listings
    console.log('\n🔍 Looking for scam listings...');
    
    // Method 1: Check for article elements
    const articles = await page.$$('article');
    console.log(`Found ${articles.length} article elements`);
    
    // Method 2: Look for specific selectors
    const possibleSelectors = [
      '.post-item',
      '.entry-title',
      'h2 a',
      'h3 a',
      '.post-title',
      'article a',
      '.content-area a'
    ];
    
    for (const selector of possibleSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
        
        // Get first few links
        const links = await Promise.all(
          elements.slice(0, 3).map(async el => {
            const href = await el.getAttribute('href');
            const text = await el.textContent();
            return { href, text: text?.trim() };
          })
        );
        
        console.log('Sample links:');
        links.forEach(link => {
          console.log(`  - ${link.text || 'No text'}: ${link.href}`);
        });
        break;
      }
    }
    
    // Get page title
    const title = await page.title();
    console.log('\n📄 Page title:', title);
    
    // Check for any error messages
    const bodyText = await page.textContent('body');
    if (bodyText.includes('Access Denied') || bodyText.includes('Error')) {
      console.log('❌ Access denied or error detected');
    }
    
    // Take screenshot
    const timestamp = Date.now();
    await page.screenshot({ 
      path: `checkscam-vn-${timestamp}.png`,
      fullPage: false 
    });
    console.log(`\n📸 Screenshot saved: checkscam-vn-${timestamp}.png`);
    
    // Try to extract some data
    console.log('\n📊 Attempting data extraction...');
    const scamData = await page.evaluate(() => {
      const data = [];
      
      // Try different methods to get data
      const links = document.querySelectorAll('a[href*="/scam/"], a[href*="/bao-cao/"], article a');
      
      links.forEach(link => {
        const href = link.href;
        const text = link.textContent?.trim();
        
        if (href && text && !href.includes('#') && !href.includes('javascript:')) {
          data.push({
            url: href,
            title: text,
            parent: link.closest('article')?.className || 'no-article'
          });
        }
      });
      
      return data.slice(0, 10); // Get first 10
    });
    
    console.log(`\n✨ Extracted ${scamData.length} potential scam links:`);
    scamData.forEach((item, i) => {
      console.log(`${i + 1}. ${item.title}`);
      console.log(`   URL: ${item.url}`);
      console.log(`   Parent: ${item.parent}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    console.log('\n🔚 Closing browser...');
    await browser.close();
  }
}

// Run the test
testCheckscamVN().catch(console.error);
