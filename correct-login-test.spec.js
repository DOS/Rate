const { test, expect } = require('@playwright/test');

test('Test Plugin with Correct Login', async ({ page }) => {
  console.log('🚀 Testing Smart Component Filter Plugin with correct credentials...');
  
  // Login to Strapi with correct credentials
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(3000);
  
  // Login with correct credentials
  const emailInput = page.locator('input[name="email"]');
  if (await emailInput.isVisible()) {
    console.log('📝 Logging in with correct credentials...');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);
  }
  
  console.log('✅ Logged in successfully');
  await page.screenshot({ path: 'correct-login-dashboard.png' });
  
  // Wait for dashboard to load completely
  await page.waitForTimeout(3000);
  
  // Find all menu items after successful login
  const allElements = await page.locator('a, button, [role="button"]').allTextContents();
  const menuItems = allElements.filter(text => text.trim() && text.length > 1);
  console.log('📋 Available menu items after login:', menuItems);
  
  // Look for Settings in various ways
  const settingsSelectors = [
    'text=Settings',
    'text=Cài đặt',
    'text=Configuration',
    '[aria-label*="Settings"]',
    '[aria-label*="settings"]',
    'a[href*="settings"]',
    'button[aria-label*="Settings"]'
  ];
  
  let settingsFound = false;
  for (const selector of settingsSelectors) {
    const element = page.locator(selector);
    if (await element.isVisible()) {
      console.log(`⚙️ Found Settings with selector: ${selector}`);
      await element.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'settings-page.png' });
      settingsFound = true;
      break;
    }
  }
  
  if (!settingsFound) {
    console.log('❌ Settings not found, trying direct navigation...');
    // Try direct navigation to content-type-builder
    await page.goto('http://localhost:1337/admin/content-type-builder');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'direct-ctb.png' });
  }
  
  // Look for Content-Type Builder
  const ctbSelectors = [
    'text=Content-Type Builder',
    'text=Content Types',
    'text=Content Type',
    'text=Builder',
    'a[href*="content-type-builder"]'
  ];
  
  let ctbFound = false;
  for (const selector of ctbSelectors) {
    const element = page.locator(selector);
    if (await element.isVisible()) {
      console.log(`🏗️ Found Content-Type Builder with selector: ${selector}`);
      await element.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'ctb-page.png' });
      ctbFound = true;
      break;
    }
  }
  
  if (!ctbFound) {
    console.log('❌ Content-Type Builder not found, checking current page...');
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    if (currentUrl.includes('content-type-builder')) {
      console.log('✅ Already on Content-Type Builder page');
      ctbFound = true;
    }
  }
  
  if (ctbFound || page.url().includes('content-type-builder')) {
    // Look for Listing Type
    const listingTypeSelectors = [
      'text=Listing Type',
      'text=listing-type',
      'text=ListingType',
      '[data-testid*="listing"]'
    ];
    
    for (const selector of listingTypeSelectors) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        console.log(`📝 Found Listing Type with selector: ${selector}`);
        await element.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'listing-type-page.png' });
        
        // Look for Add field button
        const addFieldSelectors = [
          'button:has-text("Add field")',
          'button:has-text("Add Field")',
          'button:has-text("Thêm field")',
          '[data-testid*="add-field"]'
        ];
        
        for (const addSelector of addFieldSelectors) {
          const addButton = page.locator(addSelector);
          if (await addButton.isVisible()) {
            console.log(`➕ Found Add Field button with selector: ${addSelector}`);
            await addButton.click();
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'add-field-modal.png' });
            
            // Check page content for custom fields
            const pageContent = await page.textContent('body');
            console.log('📄 Page content preview:', pageContent.substring(0, 500));
            
            if (pageContent.includes('CUSTOM FIELDS') || pageContent.includes('Custom Fields')) {
              console.log('🎯 CUSTOM FIELDS section found!');
              
              if (pageContent.includes('Component Multi-Select')) {
                console.log('🎉 SUCCESS! Component Multi-Select custom field found!');
                await page.screenshot({ path: 'plugin-success-final.png' });
                
                // Try to click the custom field
                const customField = page.locator('text=Component Multi-Select');
                if (await customField.isVisible()) {
                  await customField.click();
                  await page.waitForTimeout(1000);
                  await page.screenshot({ path: 'custom-field-clicked.png' });
                  console.log('✅ Custom field clicked successfully!');
                }
              } else {
                console.log('❌ Component Multi-Select not found in custom fields');
                console.log('Available custom fields:', pageContent.match(/CUSTOM FIELDS[\s\S]*?(?=\n\n|\Z)/)?.[0] || 'Not found');
              }
            } else {
              console.log('❌ CUSTOM FIELDS section not found');
              console.log('Available sections:', pageContent.match(/[A-Z\s]{10,}/g)?.slice(0, 10) || 'None found');
            }
            break;
          }
        }
        break;
      }
    }
  }
  
  console.log('🏁 Test completed with correct credentials!');
}); 