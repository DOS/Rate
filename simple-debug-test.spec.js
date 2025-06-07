const { test, expect } = require('@playwright/test');

test('Simple Debug Test', async ({ page }) => {
  console.log('🚀 Starting simple debug test...');
  
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
  
  // Navigate to Content Manager
  console.log('📋 Navigating to Content Manager...');
  await page.goto('http://localhost:1337/admin/content-manager');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: 'content-manager.png', fullPage: true });
  console.log('📸 Content Manager screenshot saved');
  
  // Look for Item collection
  console.log('🔍 Looking for Item collection...');
  const itemLink = page.locator('text=Item').first();
  if (await itemLink.isVisible()) {
    console.log('✅ Found Item collection');
    await itemLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'item-collection.png', fullPage: true });
    console.log('📸 Item collection screenshot saved');
    
    // Look for Create button
    const createButton = page.locator('text=Create new entry').first();
    if (await createButton.isVisible()) {
      console.log('✅ Found Create button');
      await createButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000); // Wait longer for form to load
      
      await page.screenshot({ path: 'create-item-form.png', fullPage: true });
      console.log('📸 Create Item form screenshot saved');
      
      // Now analyze the form
      console.log('🔍 Analyzing form structure...');
      
      // Look for all form elements
      const allInputs = await page.locator('input, select, textarea').all();
      console.log(`Found ${allInputs.length} form elements:`);
      
      for (let i = 0; i < Math.min(allInputs.length, 20); i++) {
        const element = allInputs[i];
        const tagName = await element.evaluate(el => el.tagName).catch(() => 'unknown');
        const name = await element.getAttribute('name').catch(() => 'no-name');
        const type = await element.getAttribute('type').catch(() => 'no-type');
        const placeholder = await element.getAttribute('placeholder').catch(() => 'no-placeholder');
        const role = await element.getAttribute('role').catch(() => 'no-role');
        
        console.log(`  ${i}: ${tagName} name="${name}" type="${type}" role="${role}" placeholder="${placeholder}"`);
      }
      
      // Look for all labels
      const allLabels = await page.locator('label').all();
      console.log(`\nFound ${allLabels.length} labels:`);
      
      for (let i = 0; i < Math.min(allLabels.length, 15); i++) {
        const label = allLabels[i];
        const text = await label.textContent().catch(() => 'no-text');
        if (text && text.trim()) {
          console.log(`  Label ${i}: "${text.trim()}"`);
        }
      }
      
      // Look for all buttons
      const allButtons = await page.locator('button').all();
      console.log(`\nFound ${allButtons.length} buttons:`);
      
      for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
        const button = allButtons[i];
        const text = await button.textContent().catch(() => 'no-text');
        if (text && text.trim()) {
          console.log(`  Button ${i}: "${text.trim()}"`);
        }
      }
      
      // Look for specific text
      console.log('\n🔍 Looking for specific text...');
      const textToFind = ['ListingType', 'FieldGroup', 'Add component', 'Bank', 'Scammer'];
      
      for (const text of textToFind) {
        const elements = await page.locator(`text=${text}`).all();
        if (elements.length > 0) {
          console.log(`✅ Found "${text}" in ${elements.length} elements`);
        } else {
          console.log(`❌ "${text}" not found`);
        }
      }
      
    } else {
      console.log('❌ Create button not found');
    }
    
  } else {
    console.log('❌ Item collection not found');
  }
  
  console.log('✅ Debug test completed');
}); 