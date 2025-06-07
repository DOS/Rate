const { test, expect } = require('@playwright/test');

test('Manual Plugin Test', async ({ page }) => {
  console.log('🔧 Manual test for Smart Component Filter Plugin...');
  
  // Login
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(2000);
  
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  console.log('✅ Logged in');
  await page.screenshot({ path: 'manual-dashboard.png' });
  
  // Get current URL and check what's available
  console.log('📍 Current URL:', page.url());
  
  // Look for all links on the page
  const allLinks = await page.locator('a').allTextContents();
  console.log('🔗 Available links:', allLinks.filter(text => text.trim()));
  
  // Try to find Settings or Content-Type Builder
  const menuItems = await page.locator('nav a, aside a, [role="navigation"] a').allTextContents();
  console.log('📋 Menu items:', menuItems.filter(text => text.trim()));
  
  // Try clicking on different menu items
  const possibleMenus = ['Settings', 'Content-Type Builder', 'Content Types', 'Builder'];
  
  for (const menuText of possibleMenus) {
    const menuElement = page.locator(`text=${menuText}`);
    if (await menuElement.isVisible()) {
      console.log(`✅ Found menu: ${menuText}`);
      await menuElement.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `manual-${menuText.toLowerCase().replace(/\s+/g, '-')}.png` });
      
      // Check if we're on the right page
      const currentUrl = page.url();
      console.log(`📍 After clicking ${menuText}, URL: ${currentUrl}`);
      
      if (currentUrl.includes('content-type-builder') || currentUrl.includes('settings')) {
        console.log(`🎯 Successfully navigated to ${menuText}`);
        
        // Look for Listing Type
        const pageContent = await page.textContent('body');
        if (pageContent.includes('Listing Type')) {
          console.log('✅ Listing Type found!');
          
          // Try to click it
          const listingTypeClicked = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*')).filter(el => 
              el.textContent && el.textContent.trim() === 'Listing Type'
            );
            
            for (let el of elements) {
              try {
                el.click();
                return true;
              } catch (e) {
                continue;
              }
            }
            return false;
          });
          
          if (listingTypeClicked) {
            console.log('✅ Clicked Listing Type');
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'manual-listing-type-clicked.png' });
            
            // Look for Add field button
            const addFieldButtons = await page.locator('button').allTextContents();
            console.log('🔘 Available buttons:', addFieldButtons.filter(text => text.trim()));
            
            const addFieldButton = page.locator('button').filter({ hasText: /Add.*field/i });
            if (await addFieldButton.isVisible()) {
              console.log('✅ Add field button found');
              await addFieldButton.click();
              await page.waitForTimeout(2000);
              await page.screenshot({ path: 'manual-add-field-modal.png' });
              
              // Check modal content
              const modalContent = await page.textContent('body');
              
              if (modalContent.includes('CUSTOM FIELDS')) {
                console.log('🎯 CUSTOM FIELDS section found!');
                
                if (modalContent.includes('Component Multi-Select')) {
                  console.log('🎉 SUCCESS! Component Multi-Select custom field found!');
                  await page.screenshot({ path: 'manual-plugin-success.png' });
                  
                  // Try to click the custom field
                  const customField = page.locator('text=Component Multi-Select');
                  if (await customField.isVisible()) {
                    await customField.click();
                    await page.waitForTimeout(1000);
                    console.log('🔥 Custom field clicked successfully!');
                    await page.screenshot({ path: 'manual-custom-field-form.png' });
                    
                    console.log('🎊 PLUGIN TEST COMPLETELY SUCCESSFUL!');
                    return; // Exit the test successfully
                  }
                } else {
                  console.log('❌ Component Multi-Select not found in custom fields');
                  const customFieldsSection = modalContent.substring(
                    modalContent.indexOf('CUSTOM FIELDS'), 
                    modalContent.indexOf('CUSTOM FIELDS') + 500
                  );
                  console.log('Available custom fields:', customFieldsSection);
                }
              } else {
                console.log('❌ CUSTOM FIELDS section not found');
                console.log('Modal content preview:', modalContent.substring(0, 500));
              }
            } else {
              console.log('❌ Add field button not found');
            }
          } else {
            console.log('❌ Could not click Listing Type');
          }
        } else {
          console.log('❌ Listing Type not found on this page');
        }
        break; // Exit the loop if we found a working menu
      }
    }
  }
  
  console.log('🔧 Manual test completed!');
}); 