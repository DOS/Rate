const { test, expect } = require('@playwright/test');

test.describe('Custom Field Test', () => {
  test('Check Custom Field Registration', async ({ page }) => {
    console.log('🎯 Testing Custom Field registration...');
    
    // Go to admin and login
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Login if needed
    const emailInput = await page.locator('input[name="email"]').isVisible();
    if (emailInput) {
      await page.fill('input[name="email"]', 'joy@joy.vn');
      await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }
    
    // Go directly to Content-Type Builder
    await page.goto('http://localhost:1337/admin/plugins/content-type-builder');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-ctb-home.png' });
    
    // Check if we can see content types
    const bodyText = await page.textContent('body');
    console.log('📊 Page content includes:');
    console.log('- Listing Type:', bodyText.includes('Listing Type'));
    console.log('- Item:', bodyText.includes('Item'));
    console.log('- Collection Types:', bodyText.includes('Collection Types'));
    
    // Try to find and click Listing Type
    const listingTypeExists = await page.locator('text=Listing Type').first().isVisible();
    console.log(`📊 Listing Type visible: ${listingTypeExists}`);
    
    if (listingTypeExists) {
      // Try force click to bypass overlay
      await page.locator('text=Listing Type').first().click({ force: true });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'test-listing-type-page.png' });
      
      // Look for Add field button
      const addFieldExists = await page.locator('button:has-text("Add another field")').isVisible();
      console.log(`📊 Add field button visible: ${addFieldExists}`);
      
      if (addFieldExists) {
        await page.click('button:has-text("Add another field")');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: 'test-field-types-modal.png' });
        
        // Check all available field types
        const modalText = await page.textContent('body');
        console.log('📊 Available field types:');
        
        const fieldTypes = [
          'Text',
          'Rich Text',
          'Number',
          'Date',
          'Boolean',
          'Email',
          'Password',
          'Enumeration',
          'Media',
          'JSON',
          'Component Multi-Select'  // Our custom field
        ];
        
        fieldTypes.forEach(type => {
          const exists = modalText.includes(type);
          console.log(`- ${type}: ${exists ? '✅' : '❌'}`);
        });
        
        // Specifically check for our custom field
        const customFieldExists = modalText.includes('Component Multi-Select');
        if (customFieldExists) {
          console.log('🎉 SUCCESS: Component Multi-Select custom field is registered!');
          
          // Try to click on it
          await page.click('text=Component Multi-Select');
          await page.waitForLoadState('networkidle');
          await page.screenshot({ path: 'test-custom-field-config.png' });
          
          // Check if configuration form loads
          const configFormExists = await page.locator('input[name="name"]').isVisible();
          console.log(`📊 Custom field config form loaded: ${configFormExists}`);
          
          if (configFormExists) {
            console.log('🎉 PERFECT: Custom field configuration form is working!');
          }
        } else {
          console.log('❌ Component Multi-Select field not found');
          console.log('Available text in modal:', modalText.substring(0, 1000));
        }
      }
    } else {
      console.log('❌ Listing Type not found in Content-Type Builder');
      console.log('Available content:', bodyText.substring(0, 500));
    }
  });
}); 