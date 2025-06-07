const { test } = require('@playwright/test');

test('find add component button', async ({ page }) => {
  console.log('🔍 Find add component button...');
  
  // Login
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.waitForLoadState('networkidle');
  await page.fill('input[name="email"]', 'joy@joy.vn');
  await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForURL('**/admin', { timeout: 30000 });
  } catch (e) {
    if (page.url().includes('/admin')) console.log('✅ At admin page');
  }
  console.log('✅ Login successful');
  
  // Listen to plugin logs
  page.on('console', msg => {
    if (msg.text().includes('Plugin Version') || 
        msg.text().includes('Strategy 0') || 
        msg.text().includes('Found ID') || 
        msg.text().includes('Bank') || 
        msg.text().includes('filterComponentPicker') ||
        msg.text().includes('REAL-TIME') ||
        msg.text().includes('FORM STATE')) {
      console.log('🎯 Plugin:', msg.text());
    }
  });
  
  // Go to item create page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  // Select Bank in ListingType
  const listingTypeLabel = page.locator('label:has-text("ListingType")').first();
  const parentContainer = listingTypeLabel.locator('xpath=..').first();
  const combobox = parentContainer.locator('[role="combobox"]').first();
  
  await combobox.click();
  await page.waitForTimeout(2000);
  
  const bankOption = page.locator('text=Bank').first();
  await bankOption.click();
  await page.waitForTimeout(3000);
  console.log('✅ Bank selected');
  
  // Click Dynamic Zone button
  const dzButton = page.locator('button:has-text("Add a component to FieldGroup")').first();
  await dzButton.click();
  await page.waitForTimeout(3000);
  console.log('✅ Dynamic Zone button clicked');
  
  // Look for "Pick one component" text
  const pickText = page.locator('text=Pick one component').first();
  if (await pickText.isVisible()) {
    console.log('✅ Found "Pick one component" text');
    
    // Find all elements around this text
    console.log('🔍 Looking for component buttons around "Pick one component"...');
    
    // Get the parent of "Pick one component" text
    const pickParent = pickText.locator('xpath=..').first();
    const pickGrandParent = pickText.locator('xpath=../..').first();
    const pickGreatGrandParent = pickText.locator('xpath=../../..').first();
    
    // Check each level for component buttons
    const levels = [
      { name: 'parent', element: pickParent },
      { name: 'grandparent', element: pickGrandParent },
      { name: 'great-grandparent', element: pickGreatGrandParent }
    ];
    
    for (const level of levels) {
      console.log(`🔍 Checking ${level.name} level...`);
      
      const buttons = await level.element.locator('button').count();
      console.log(`   - ${buttons} buttons found`);
      
      if (buttons > 0) {
        // Look for component categories
        const contactCount = await level.element.locator('text=contact').count();
        const violationCount = await level.element.locator('text=violation').count();
        const infoCount = await level.element.locator('text=info').count();
        const utilitiesCount = await level.element.locator('text=utilities').count();
        const mediaCount = await level.element.locator('text=media').count();
        const reviewCount = await level.element.locator('text=review').count();
        const ratingCount = await level.element.locator('text=rating').count();
        
        console.log(`   📊 Component categories in ${level.name}:`);
        console.log(`      - contact: ${contactCount}`);
        console.log(`      - violation: ${violationCount}`);
        console.log(`      - info: ${infoCount}`);
        console.log(`      - utilities: ${utilitiesCount}`);
        console.log(`      - media: ${mediaCount}`);
        console.log(`      - review: ${reviewCount}`);
        console.log(`      - rating: ${ratingCount}`);
        
        // If we found component categories, this is likely the picker
        if (contactCount > 0 || violationCount > 0 || infoCount > 0) {
          console.log(`✅ Found component picker at ${level.name} level!`);
          
          // Test smart loading
          if (contactCount > 0 && violationCount === 0) {
            console.log('🎉 SUCCESS: Smart loading working! Bank shows contact but no violation');
          } else if (violationCount > 0) {
            console.log('❌ FAILED: Smart loading not working - Bank showing violation components');
          } else {
            console.log('⚠️ UNCLEAR: Need to check component filtering');
          }
          
          await page.screenshot({ path: `find-add-component-button-${level.name}.png` });
          break;
        }
      }
    }
    
    // Also try to find components by looking for specific component names
    console.log('🔍 Looking for specific component names...');
    
    const componentNames = [
      'contact.contact-form',
      'contact.contact-info', 
      'violation.violation-form',
      'violation.violation-info',
      'info.basic-info',
      'utilities.social-links',
      'media.image-gallery',
      'review.review-form',
      'rating.star-rating'
    ];
    
    let foundComponents = [];
    for (const componentName of componentNames) {
      const componentElement = page.locator(`text=${componentName}`).first();
      if (await componentElement.isVisible()) {
        foundComponents.push(componentName);
      }
    }
    
    console.log(`📊 Found specific components: ${foundComponents.join(', ')}`);
    
    if (foundComponents.length > 0) {
      const hasContact = foundComponents.some(c => c.includes('contact'));
      const hasViolation = foundComponents.some(c => c.includes('violation'));
      
      if (hasContact && !hasViolation) {
        console.log('🎉 SUCCESS: Smart loading working! Bank shows contact but no violation');
      } else if (hasViolation) {
        console.log('❌ FAILED: Smart loading not working - Bank showing violation components');
      }
    }
    
  } else {
    console.log('❌ "Pick one component" text not found');
  }
}); 