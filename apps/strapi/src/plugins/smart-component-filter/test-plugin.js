// Test script cho Smart Component Filter Plugin
const { chromium } = require('playwright');

async function testSmartComponentFilterPlugin() {
  console.log('🚀 Starting Smart Component Filter Plugin Tests...');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000 // Slow down để dễ observe
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const page = await context.newPage();
  
  try {
    // === Phase 1: Login vào Strapi Admin ===
    console.log('\n📋 Phase 1: Login to Strapi Admin...');
    await page.goto('http://localhost:1337/admin/auth/login');
    
    // Fill login form với credentials đã biết
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', '!CkLdz_28@HH');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForURL('**/admin');
    console.log('✅ Login successful!');
    await page.waitForTimeout(2000);
    
    // === Phase 2: Test Custom Field trong Content-Type Builder ===
    console.log('\n🏗️ Phase 2: Testing Custom Field in Content-Type Builder...');
    
    // Navigate to Content-Type Builder
    await page.click('text=Content-Type Builder');
    await page.waitForTimeout(2000);
    
    // Click on Listing Type
    await page.click('text=Listing Type');
    await page.waitForTimeout(2000);
    
    // Look for Add field button
    const addFieldButton = page.locator('text=Add field');
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
          
          // Click to add field
          await componentMultiSelect.click();
          await page.waitForTimeout(1000);
          
          // Fill field name
          await page.fill('input[name="name"]', 'TestComponents');
          
          // Click Add Field
          await page.click('button:has-text("Add Field")');
          await page.waitForTimeout(2000);
          
          console.log('✅ Custom field added successfully!');
        } else {
          console.log('❌ Component Multi-Select not found');
        }
      } else {
        console.log('❌ CUSTOM FIELDS section not found');
      }
      
      // Cancel/close field selector
      const cancelButton = page.locator('button:has-text("Cancel")');
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }
    }
    
    // === Phase 3: Test trong Content Manager ===
    console.log('\n📝 Phase 3: Testing in Content Manager...');
    
    // Navigate to Content Manager
    await page.click('text=Content Manager');
    await page.waitForTimeout(2000);
    
    // Click on Listing Types
    await page.click('text=Listing Types');
    await page.waitForTimeout(2000);
    
    // Edit an existing listing type hoặc create new
    const editButtons = page.locator('button:has-text("Edit")');
    if (await editButtons.first().isVisible()) {
      await editButtons.first().click();
      await page.waitForTimeout(3000);
      
      // Look for TestComponents field
      const testComponentsField = page.locator('text=TestComponents');
      if (await testComponentsField.isVisible()) {
        console.log('🎉 TestComponents field found in edit form!');
        
        // Click on the dropdown
        const dropdown = page.locator('[data-testid="select-input"]').or(page.locator('div:has-text("Chọn components")'));
        if (await dropdown.first().isVisible()) {
          await dropdown.first().click();
          await page.waitForTimeout(1000);
          
          // Look for Vietnamese component options
          const vietnameseOptions = [
            'Thông Tin Cơ Bản',
            'Địa Chỉ', 
            'Mạng Xã Hội',
            'Chi Tiết Lừa Đảo'
          ];
          
          let foundOptions = 0;
          for (const option of vietnameseOptions) {
            const optionElement = page.locator(`text=${option}`);
            if (await optionElement.isVisible()) {
              console.log(`✅ Found Vietnamese option: ${option}`);
              foundOptions++;
            }
          }
          
          if (foundOptions > 0) {
            console.log(`🎉 Found ${foundOptions}/${vietnameseOptions.length} Vietnamese options!`);
            
            // Try to select one option
            const firstOption = page.locator('text=Thông Tin Cơ Bản');
            if (await firstOption.isVisible()) {
              await firstOption.click();
              console.log('✅ Selected "Thông Tin Cơ Bản" option');
            }
          } else {
            console.log('❌ No Vietnamese options found');
          }
        }
      } else {
        console.log('❌ TestComponents field not found');
      }
    }
    
    // === Phase 4: Test Enhanced Filter trong Items ===
    console.log('\n🧠 Phase 4: Testing Enhanced Filter in Items...');
    
    // Navigate to Items
    await page.click('text=Items');
    await page.waitForTimeout(2000);
    
    // Create new item
    await page.click('button:has-text("Create new entry")');
    await page.waitForTimeout(3000);
    
    // Look for Enhanced Filter sidebar
    const enhancedFilter = page.locator('text=ENHANCED SMART FILTER');
    if (await enhancedFilter.isVisible()) {
      console.log('🧠 Enhanced Smart Filter found in sidebar!');
      
      // Look for filter status
      const filterStatus = page.locator('text=Waiting for ListingType detection').or(page.locator('text=Active:'));
      if (await filterStatus.isVisible()) {
        console.log('✅ Filter status display working');
      }
    } else {
      console.log('❌ Enhanced Smart Filter not found');
    }
    
    // Try to select a ListingType
    const listingTypeDropdown = page.locator('select').or(page.locator('[data-testid="select-input"]'));
    if (await listingTypeDropdown.first().isVisible()) {
      await listingTypeDropdown.first().click();
      await page.waitForTimeout(1000);
      
      // Look for Bank/Scammer options
      const bankOption = page.locator('text=Bank').or(page.locator('text=Scammer'));
      if (await bankOption.first().isVisible()) {
        await bankOption.first().click();
        console.log('✅ Selected ListingType');
        await page.waitForTimeout(2000);
        
        // Check if filter updated
        const activeFilter = page.locator('text=Active:');
        if (await activeFilter.isVisible()) {
          console.log('🎉 Enhanced filter activated!');
        }
      }
    }
    
    // Try to open component picker
    const addComponentButton = page.locator('button:has-text("Add a component")').or(page.locator('text=Add component'));
    if (await addComponentButton.first().isVisible()) {
      await addComponentButton.first().click();
      await page.waitForTimeout(2000);
      
      // Check if modal opened
      const modalTitle = page.locator('text=Pick one component');
      if (await modalTitle.isVisible()) {
        console.log('🎯 Component picker modal opened!');
        
        // Check console logs for filter activity
        await page.waitForTimeout(3000);
        console.log('✅ Check browser console for filter logs!');
      }
    }
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    console.log('\n⏱️ Keeping browser open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);
    await browser.close();
  }
}

// Run tests
testSmartComponentFilterPlugin().catch(console.error); 