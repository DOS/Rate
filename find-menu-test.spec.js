const { test, expect } = require('@playwright/test');

test('Find Menu Items', async ({ page }) => {
  console.log('🔍 Finding all menu items in Strapi admin...');
  
  // Login to Strapi
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(3000);
  
  // Login if needed
  const emailInput = page.locator('input[name="email"]');
  if (await emailInput.isVisible()) {
    console.log('📝 Logging in...');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', '!CkLdz_28@HH');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
  }
  
  console.log('✅ Logged in successfully');
  await page.screenshot({ path: 'menu-dashboard.png' });
  
  // Find all clickable elements
  const allLinks = await page.locator('a, button, [role="button"]').allTextContents();
  console.log('🔗 All clickable elements:', allLinks.filter(text => text.trim()));
  
  // Look for specific patterns
  const menuSelectors = [
    'nav a',
    '[role="navigation"] a',
    '[role="navigation"] button',
    'aside a',
    'aside button',
    '.sidebar a',
    '.sidebar button',
    '[data-testid*="menu"]',
    '[data-testid*="nav"]'
  ];
  
  for (const selector of menuSelectors) {
    const elements = await page.locator(selector).allTextContents();
    if (elements.length > 0) {
      console.log(`📋 Found with selector "${selector}":`, elements.filter(text => text.trim()));
    }
  }
  
  // Try to find Settings in different ways
  const settingsSelectors = [
    'text=Settings',
    'text=Cài đặt', 
    'text=Configuration',
    'text=Admin',
    '[aria-label*="Settings"]',
    '[aria-label*="settings"]',
    '[title*="Settings"]',
    '[title*="settings"]'
  ];
  
  for (const selector of settingsSelectors) {
    const element = page.locator(selector);
    if (await element.isVisible()) {
      console.log(`⚙️ Found Settings with selector: ${selector}`);
      await element.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'settings-found.png' });
      break;
    }
  }
  
  // Look for Content-Type Builder directly
  const ctbSelectors = [
    'text=Content-Type Builder',
    'text=Content Types',
    'text=Content Type',
    'text=Builder',
    '[aria-label*="Content"]',
    '[title*="Content"]'
  ];
  
  for (const selector of ctbSelectors) {
    const element = page.locator(selector);
    if (await element.isVisible()) {
      console.log(`🏗️ Found Content-Type Builder with selector: ${selector}`);
      await element.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'ctb-found.png' });
      
      // Now look for Listing Type
      const listingType = page.locator('text=Listing Type').or(page.locator('text=listing-type'));
      if (await listingType.isVisible()) {
        console.log('📝 Found Listing Type!');
        await listingType.click();
        await page.waitForTimeout(2000);
        
        // Look for Add field
        const addField = page.locator('button').filter({ hasText: /Add.*field/i });
        if (await addField.isVisible()) {
          console.log('➕ Found Add Field button!');
          await addField.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: 'add-field-modal.png' });
          
          // Check for custom fields
          const pageContent = await page.textContent('body');
          if (pageContent.includes('CUSTOM FIELDS') || pageContent.includes('Custom Fields')) {
            console.log('🎯 CUSTOM FIELDS section found!');
            
            if (pageContent.includes('Component Multi-Select')) {
              console.log('🎉 SUCCESS! Component Multi-Select custom field found!');
              await page.screenshot({ path: 'plugin-working.png' });
            } else {
              console.log('❌ Component Multi-Select not found in custom fields');
              console.log('Available text:', pageContent.substring(0, 1000));
            }
          } else {
            console.log('❌ CUSTOM FIELDS section not found');
            console.log('Page content preview:', pageContent.substring(0, 500));
          }
        }
      }
      break;
    }
  }
  
  console.log('🏁 Menu search completed!');
}); 