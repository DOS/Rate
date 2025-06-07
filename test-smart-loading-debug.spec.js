const { test, expect } = require('@playwright/test');

test.describe('Smart Loading Debug Test', () => {
  test('debug Dynamic Zone and Smart Loading', async ({ page }) => {
    console.log('🔍 Starting Smart Loading debug test...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Login if needed
    try {
      const loginForm = await page.locator('form').first();
      if (await loginForm.isVisible()) {
        console.log('🔐 Logging in...');
        await page.fill('input[name="email"]', 'joy@joy.vn');
        await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
        await page.click('button[type="submit"]');
        await page.waitForLoadState('networkidle');
        console.log('✅ Login successful');
      }
    } catch (error) {
      console.log('ℹ️ Already logged in');
    }
    
    // Navigate to Scammer item
    console.log('🚨 Navigating to Scammer item...');
    await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/f98zymeazmd6zcqhdoaruftk?plugins%5Bi18n%5D%5Blocale%5D=en');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Listen for console logs
    page.on('console', msg => {
      if (msg.text().includes('Smart Component Filter') || 
          msg.text().includes('🎯') || 
          msg.text().includes('Component picker')) {
        console.log('🔍 Browser console:', msg.text());
      }
    });
    
    // Debug: Get all text content on page
    console.log('📋 Analyzing page content...');
    
    // Look for ListingType info
    const listingTypeElements = await page.locator('*:has-text("ListingType"), *:has-text("Listing Type"), *:has-text("Scammer"), *:has-text("Bank")').all();
    console.log(`📋 Found ${listingTypeElements.length} ListingType-related elements`);
    
    for (let i = 0; i < Math.min(listingTypeElements.length, 5); i++) {
      const text = await listingTypeElements[i].textContent();
      console.log(`   ${i + 1}. "${text?.trim()}"`);
    }
    
    // Look for Dynamic Zone or component-related elements
    console.log('🔍 Looking for Dynamic Zone elements...');
    
    const dynamicZoneKeywords = [
      'Dynamic Zone', 'dynamic zone', 'dynamiczone',
      'Add component', 'add component', 'Choose component',
      'Component', 'component', 'Components', 'components'
    ];
    
    for (const keyword of dynamicZoneKeywords) {
      const elements = await page.locator(`*:has-text("${keyword}")`).all();
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with "${keyword}"`);
        
        for (let i = 0; i < Math.min(elements.length, 3); i++) {
          const text = await elements[i].textContent();
          const tagName = await elements[i].evaluate(el => el.tagName);
          console.log(`   ${tagName}: "${text?.trim().substring(0, 100)}"`);
        }
      }
    }
    
    // Look for all buttons on the page
    console.log('🔍 Analyzing all buttons on page...');
    const allButtons = await page.locator('button').all();
    console.log(`📋 Found ${allButtons.length} buttons total`);
    
    let componentButtons = [];
    for (let i = 0; i < allButtons.length; i++) {
      const text = await allButtons[i].textContent();
      const isVisible = await allButtons[i].isVisible();
      
      if (text && isVisible && (
        text.toLowerCase().includes('add') ||
        text.toLowerCase().includes('component') ||
        text.toLowerCase().includes('choose') ||
        text.toLowerCase().includes('select')
      )) {
        componentButtons.push({ index: i, text: text.trim() });
        console.log(`🎯 Potential component button ${i}: "${text.trim()}"`);
      }
    }
    
    // Scroll down to find more content
    console.log('📜 Scrolling to find more content...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Look again after scrolling
    const moreButtons = await page.locator('button:has-text("Add"), button:has-text("component"), button:has-text("Choose")').all();
    console.log(`📋 After scrolling, found ${moreButtons.length} more potential buttons`);
    
    // Try to find form fields
    console.log('🔍 Looking for form structure...');
    const formFields = await page.locator('input, textarea, select, [role="combobox"]').all();
    console.log(`📋 Found ${formFields.length} form fields`);
    
    // Look for field labels
    const labels = await page.locator('label, [class*="label"], [class*="Label"]').all();
    console.log(`📋 Found ${labels.length} labels`);
    
    for (let i = 0; i < Math.min(labels.length, 10); i++) {
      const text = await labels[i].textContent();
      if (text && text.trim()) {
        console.log(`   Label ${i + 1}: "${text.trim()}"`);
      }
    }
    
    // Check if we're on the right page
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`📄 Page title: "${pageTitle}"`);
    console.log(`🔗 Page URL: ${pageUrl}`);
    
    // Look for any data-strapi attributes
    console.log('🔍 Looking for Strapi-specific attributes...');
    const strapiElements = await page.locator('[data-strapi*=""], [class*="strapi"], [class*="Strapi"]').all();
    console.log(`📋 Found ${strapiElements.length} Strapi-specific elements`);
    
    // Take screenshot
    await page.screenshot({ path: 'smart-loading-debug-result.png', fullPage: true });
    console.log('📸 Debug screenshot saved');
    
    // Try to trigger any potential component picker
    if (componentButtons.length > 0) {
      console.log(`🖱️ Trying to click first potential button: "${componentButtons[0].text}"`);
      try {
        await allButtons[componentButtons[0].index].click();
        await page.waitForTimeout(2000);
        
        // Check what opened
        const newElements = await page.locator('h1, h2, h3, h4, [role="dialog"], [class*="modal"], [class*="Modal"]').all();
        console.log(`📋 After click, found ${newElements.length} new prominent elements`);
        
        for (let i = 0; i < Math.min(newElements.length, 5); i++) {
          const text = await newElements[i].textContent();
          console.log(`   New element ${i + 1}: "${text?.trim()}"`);
        }
        
        await page.screenshot({ path: 'smart-loading-after-click.png', fullPage: true });
        console.log('📸 After-click screenshot saved');
        
      } catch (error) {
        console.log('❌ Error clicking button:', error.message);
      }
    }
    
    console.log('🏁 Debug test completed');
  });
}); 