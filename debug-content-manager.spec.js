const { test, expect } = require('@playwright/test');

test('Debug Content Manager', async ({ page }) => {
  console.log('🚀 Starting content manager debug...');
  
  // Navigate to Strapi admin
  await page.goto('http://localhost:1337/admin');
  await page.waitForLoadState('networkidle');
  
  // Login
  const loginButton = page.locator('button:has-text("Login")');
  if (await loginButton.isVisible()) {
    console.log('🔐 Logging in...');
    await page.fill('input[name="email"]', 'admin@example.com');
    await page.fill('input[name="password"]', 'admin123');
    await loginButton.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('✅ Logged in');
  }
  
  // Take screenshot of dashboard
  await page.screenshot({ path: 'dashboard-debug.png', fullPage: true });
  console.log('📸 Dashboard screenshot saved');
  
  // Look for Content Manager in navigation
  console.log('🔍 Looking for Content Manager in navigation...');
  
  const navSelectors = [
    'text=Content Manager',
    'text=Content-Manager', 
    'text=Content',
    'a[href*="content-manager"]',
    'nav a:has-text("Content")',
    '[data-testid*="content"]'
  ];
  
  let contentManagerLink = null;
  for (const selector of navSelectors) {
    const element = page.locator(selector).first();
    if (await element.count() > 0) {
      console.log(`✅ Found Content Manager with selector: ${selector}`);
      contentManagerLink = element;
      break;
    }
  }
  
  if (!contentManagerLink) {
    console.log('❌ Content Manager not found in navigation');
    
    // Debug: Look for all navigation links
    const allLinks = await page.locator('nav a, a').all();
    console.log(`Found ${allLinks.length} links:`);
    
    for (let i = 0; i < Math.min(allLinks.length, 20); i++) {
      const link = allLinks[i];
      const text = await link.textContent().catch(() => 'no-text');
      const href = await link.getAttribute('href').catch(() => 'no-href');
      if (text && text.trim()) {
        console.log(`  Link ${i}: "${text.trim()}" -> ${href}`);
      }
    }
    return;
  }
  
  // Click Content Manager
  console.log('🖱️ Clicking Content Manager...');
  await contentManagerLink.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  
  // Take screenshot of content manager
  await page.screenshot({ path: 'content-manager-debug.png', fullPage: true });
  console.log('📸 Content Manager screenshot saved');
  
  // Look for collection types
  console.log('🔍 Looking for collection types...');
  
  // Look for all text on the page
  const allText = await page.locator('*').allTextContents();
  const relevantText = allText.filter(text => 
    text && text.trim() && 
    (text.toLowerCase().includes('item') || 
     text.toLowerCase().includes('collection') ||
     text.toLowerCase().includes('type'))
  );
  
  console.log('📝 Relevant text found:');
  relevantText.slice(0, 20).forEach((text, i) => {
    console.log(`  ${i}: "${text.trim()}"`);
  });
  
  // Look for specific collection types
  const collectionSelectors = [
    'text=Item',
    'text=Items', 
    'a:has-text("Item")',
    'a:has-text("Items")',
    '[href*="item"]',
    'text=api::item.item'
  ];
  
  for (const selector of collectionSelectors) {
    const elements = await page.locator(selector).all();
    if (elements.length > 0) {
      console.log(`✅ Found "${selector}" in ${elements.length} elements`);
      
      // Try clicking the first one
      try {
        await elements[0].click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        
        await page.screenshot({ path: 'item-collection-debug.png', fullPage: true });
        console.log('📸 Item collection screenshot saved');
        
        // Look for Create button
        const createSelectors = [
          'text=Create new entry',
          'text=Create',
          'button:has-text("Create")',
          'a:has-text("Create")'
        ];
        
        for (const createSelector of createSelectors) {
          const createElements = await page.locator(createSelector).all();
          if (createElements.length > 0) {
            console.log(`✅ Found Create button with selector: ${createSelector}`);
            
            await createElements[0].click();
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(5000);
            
            await page.screenshot({ path: 'create-form-debug.png', fullPage: true });
            console.log('📸 Create form screenshot saved');
            
            // Now check for form fields
            console.log('🔍 Checking form fields...');
            
            // Look for all form elements
            const formElements = await page.locator('input, select, textarea, button').all();
            console.log(`Found ${formElements.length} form elements`);
            
            // Look for ListingType specifically
            const listingTypeElements = await page.locator('*').filter({ hasText: /ListingType|listing.*type/i }).all();
            console.log(`Found ${listingTypeElements.length} elements containing "ListingType"`);
            
            for (let i = 0; i < listingTypeElements.length; i++) {
              const element = listingTypeElements[i];
              const text = await element.textContent().catch(() => 'no-text');
              const tagName = await element.evaluate(el => el.tagName).catch(() => 'unknown');
              console.log(`  ListingType element ${i}: ${tagName} - "${text}"`);
            }
            
            // Look for FieldGroup
            const fieldGroupElements = await page.locator('*').filter({ hasText: /FieldGroup|field.*group/i }).all();
            console.log(`Found ${fieldGroupElements.length} elements containing "FieldGroup"`);
            
            for (let i = 0; i < fieldGroupElements.length; i++) {
              const element = fieldGroupElements[i];
              const text = await element.textContent().catch(() => 'no-text');
              const tagName = await element.evaluate(el => el.tagName).catch(() => 'unknown');
              console.log(`  FieldGroup element ${i}: ${tagName} - "${text}"`);
            }
            
            break;
          }
        }
        
        break;
      } catch (e) {
        console.log(`❌ Error clicking ${selector}: ${e.message}`);
      }
    }
  }
  
  console.log('✅ Content Manager debug completed');
}); 