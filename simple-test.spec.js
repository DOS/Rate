const { test, expect } = require('@playwright/test');

test('Smart Component Filter Plugin Test', async ({ page }) => {
  console.log('🚀 Testing Smart Component Filter Plugin...');
  
  // Navigate to Strapi admin
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(3000);
  
  // Login if needed
  try {
    await page.fill('input[name="email"]', 'admin@ratebox.com', { timeout: 5000 });
    await page.fill('input[name="password"]', 'Ratebox2024!');
    await page.click('button[type="submit"]');
    console.log('✅ Logged in');
  } catch (e) {
    console.log('ℹ️ Already logged in or login not needed');
  }
  
  await page.waitForTimeout(3000);
  
  // Navigate to Content Manager
  await page.click('text=Content Manager');
  await page.waitForTimeout(2000);
  
  // Click on Item
  await page.click('text=Item');
  await page.waitForTimeout(2000);
  
  // Click on first item
  const firstRow = page.locator('table tbody tr').first();
  await firstRow.click();
  await page.waitForTimeout(3000);
  
  console.log('✅ Opened item edit page');
  
  // Scroll to bottom to find FieldGroup
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  
  // Look for Add component button
  const addButton = page.locator('text=Add a component to FieldGroup');
  
  if (await addButton.isVisible()) {
    console.log('🎯 Found Add component button');
    
    // Listen for console logs from the plugin
    page.on('console', msg => {
      if (msg.text().includes('Smart Component Filter') || 
          msg.text().includes('🔍') || 
          msg.text().includes('✅') || 
          msg.text().includes('🚫') ||
          msg.text().includes('Allowed components')) {
        console.log(`[BROWSER] ${msg.text()}`);
      }
    });
    
    // Click to open component picker
    await addButton.click();
    await page.waitForTimeout(2000);
    
    console.log('🔍 Component picker opened');
    
    // Check categories
    const categories = await page.locator('h3[role="button"]').allTextContents();
    console.log('📋 All categories found:', categories);
    
    // Check which categories are visible
    const visibleCategories = [];
    for (const category of categories) {
      const categoryElement = page.locator(`h3[role="button"]:has-text("${category}")`);
      const isVisible = await categoryElement.isVisible();
      const style = await categoryElement.evaluate(el => el.style.display);
      
      if (isVisible && style !== 'none') {
        visibleCategories.push(category);
      }
    }
    
    console.log('✅ Visible categories:', visibleCategories);
    console.log('🚫 Hidden categories:', categories.filter(c => !visibleCategories.includes(c)));
    
    // Test result
    if (visibleCategories.length === 1 && visibleCategories.includes('info')) {
      console.log('🎉 SUCCESS: Plugin working! Only "info" category visible');
    } else if (visibleCategories.length > 1) {
      console.log('❌ FAIL: Plugin not working - multiple categories visible');
    } else {
      console.log('❌ FAIL: No categories visible or wrong category');
    }
    
    // Close picker
    await page.keyboard.press('Escape');
    
  } else {
    console.log('❌ Add component button not found');
  }
  
  console.log('🏁 Test completed');
}); 