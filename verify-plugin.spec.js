const { test, expect } = require('@playwright/test');

test('Verify Plugin Working', async ({ page }) => {
  console.log('🔍 Verifying Smart Component Filter Plugin...');
  
  // Login
  await page.goto('http://localhost:1337/admin');
  await page.waitForTimeout(2000);
  
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  console.log('✅ Logged in');
  
  // Go to Content-Type Builder
  await page.goto('http://localhost:1337/admin/content-type-builder');
  await page.waitForTimeout(2000);
  
  console.log('🏗️ On Content-Type Builder');
  await page.screenshot({ path: 'verify-ctb.png' });
  
  // Check if we can see Listing Type
  const pageText = await page.textContent('body');
  
  if (pageText.includes('Listing Type')) {
    console.log('✅ Listing Type found');
    
    // Try to click using JavaScript
    const clicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent && el.textContent.includes('Listing Type') && el.tagName !== 'SCRIPT'
      );
      
      for (let el of elements) {
        if (el.click) {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    if (clicked) {
      console.log('✅ Clicked Listing Type');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'verify-listing-type.png' });
      
      // Look for Add field
      const hasAddField = await page.locator('button').filter({ hasText: /Add.*field/i }).isVisible();
      
      if (hasAddField) {
        console.log('✅ Add field button found');
        await page.locator('button').filter({ hasText: /Add.*field/i }).click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'verify-add-field.png' });
        
        // Check for custom fields
        const modalText = await page.textContent('body');
        
        if (modalText.includes('CUSTOM FIELDS')) {
          console.log('🎯 CUSTOM FIELDS section found!');
          
          if (modalText.includes('Component Multi-Select')) {
            console.log('🎉 SUCCESS! Component Multi-Select custom field is working!');
            await page.screenshot({ path: 'verify-success.png' });
            
            // Final verification - try to use the custom field
            const customFieldElement = page.locator('text=Component Multi-Select');
            if (await customFieldElement.isVisible()) {
              await customFieldElement.click();
              await page.waitForTimeout(1000);
              console.log('🔥 Custom field is clickable and functional!');
              await page.screenshot({ path: 'verify-final.png' });
            }
          } else {
            console.log('❌ Component Multi-Select not found');
            console.log('Available custom fields:', modalText.substring(modalText.indexOf('CUSTOM FIELDS'), modalText.indexOf('CUSTOM FIELDS') + 200));
          }
        } else {
          console.log('❌ CUSTOM FIELDS section not found');
          console.log('Modal content:', modalText.substring(0, 300));
        }
      } else {
        console.log('❌ Add field button not found');
      }
    } else {
      console.log('❌ Could not click Listing Type');
    }
  } else {
    console.log('❌ Listing Type not found on page');
    console.log('Page content preview:', pageText.substring(0, 300));
  }
  
  console.log('🔍 Verification completed!');
}); 