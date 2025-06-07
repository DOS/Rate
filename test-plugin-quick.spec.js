const { test, expect } = require('@playwright/test');

test('Test Smart Component Filter Plugin', async ({ page }) => {
  console.log('🚀 Starting Smart Component Filter Plugin Test...');
  
  // === Phase 1: Login to Strapi Admin ===
  console.log('\n🔐 Phase 1: Login to Strapi Admin...');
  
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(2000);
  
  // Check if already logged in
  const isLoggedIn = await page.locator('text=Content Manager').isVisible();
  
  if (!isLoggedIn) {
    console.log('📝 Logging in...');
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', '!CkLdz_28@HH');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  }
  
  console.log('✅ Successfully logged in to Strapi Admin');
  
  // === Phase 2: Test Content-Type Builder ===
  console.log('\n🏗️ Phase 2: Testing Content-Type Builder...');
  
  // Navigate to Content-Type Builder
  await page.click('text=Content-Type Builder');
  await page.waitForTimeout(2000);
  
  // Click on Listing Type
  await page.click('text=Listing Type');
  await page.waitForTimeout(1000);
  
  // Look for Add field button
  const addFieldButton = page.locator('button:has-text("Add field")');
  if (await addFieldButton.isVisible()) {
    await addFieldButton.click();
    await page.waitForTimeout(1000);
    
    // Look for CUSTOM FIELDS section
    const customFieldsSection = page.locator('text=CUSTOM FIELDS');
    if (await customFieldsSection.isVisible()) {
      console.log('✅ CUSTOM FIELDS section found!');
      
      // Look for Component Multi-Select
      const componentMultiSelect = page.locator('text=Component Multi-Select');
      if (await componentMultiSelect.isVisible()) {
        console.log('🎉 Component Multi-Select custom field FOUND!');
        
        // Take screenshot
        await page.screenshot({ path: 'test-custom-field-found.png' });
        
        // Click to test field creation
        await componentMultiSelect.click();
        await page.waitForTimeout(1000);
        
        // Fill field name
        await page.fill('input[name="name"]', 'TestComponents');
        
        // Click Add Field
        await page.click('button:has-text("Add Field")');
        await page.waitForTimeout(2000);
        
        console.log('✅ Custom field added successfully!');
        
        // Save the content type
        await page.click('button:has-text("Save")');
        await page.waitForTimeout(3000);
        
        console.log('✅ Content type saved!');
        
      } else {
        console.log('❌ Component Multi-Select not found');
        await page.screenshot({ path: 'test-custom-field-missing.png' });
      }
    } else {
      console.log('❌ CUSTOM FIELDS section not found');
      await page.screenshot({ path: 'test-no-custom-fields.png' });
    }
  }
  
  // === Phase 3: Test in Content Manager ===
  console.log('\n📝 Phase 3: Testing in Content Manager...');
  
  // Navigate to Content Manager
  await page.click('text=Content Manager');
  await page.waitForTimeout(2000);
  
  // Click on Listing Types
  await page.click('text=Listing Types');
  await page.waitForTimeout(2000);
  
  // Edit an existing listing type
  const editButtons = page.locator('button:has-text("Edit")');
  if (await editButtons.first().isVisible()) {
    await editButtons.first().click();
    await page.waitForTimeout(2000);
    
    // Look for TestComponents field
    const testField = page.locator('text=TestComponents');
    if (await testField.isVisible()) {
      console.log('✅ TestComponents field found in edit form!');
      
      // Look for multi-select dropdown
      const multiSelect = page.locator('[placeholder*="Chọn components"]');
      if (await multiSelect.isVisible()) {
        console.log('✅ Multi-select dropdown found!');
        
        // Click to open dropdown
        await multiSelect.click();
        await page.waitForTimeout(1000);
        
        // Look for Vietnamese options
        const contactOption = page.locator('text=Thông Tin Cơ Bản');
        if (await contactOption.isVisible()) {
          console.log('🎉 Vietnamese component options found!');
          
          // Select some options
          await contactOption.click();
          await page.waitForTimeout(500);
          
          const reviewOption = page.locator('text=Đánh Giá Sao');
          if (await reviewOption.isVisible()) {
            await reviewOption.click();
            await page.waitForTimeout(500);
          }
          
          console.log('✅ Components selected successfully!');
          
          // Take final screenshot
          await page.screenshot({ path: 'test-plugin-success.png' });
          
        } else {
          console.log('❌ Vietnamese options not found');
          await page.screenshot({ path: 'test-no-vietnamese-options.png' });
        }
      } else {
        console.log('❌ Multi-select dropdown not found');
        await page.screenshot({ path: 'test-no-multiselect.png' });
      }
    } else {
      console.log('❌ TestComponents field not found');
      await page.screenshot({ path: 'test-no-test-field.png' });
    }
  }
  
  console.log('\n🎯 Test completed! Check screenshots for results.');
}); 