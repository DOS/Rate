const { test } = require('@playwright/test');

test('find ListingType field', async ({ page }) => {
  console.log('🔍 Finding ListingType field...');
  
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
  
  // Go to item create page
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::item.item/create?plugins%5Bi18n%5D%5Blocale%5D=en');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  // Look for all text containing "ListingType"
  console.log('🔍 Looking for text containing "ListingType"...');
  const listingTypeTexts = await page.locator('text=ListingType').count();
  console.log(`Found ${listingTypeTexts} elements with "ListingType" text`);
  
  if (listingTypeTexts > 0) {
    for (let i = 0; i < listingTypeTexts; i++) {
      const element = page.locator('text=ListingType').nth(i);
      const text = await element.textContent();
      console.log(`  ${i + 1}. "${text}"`);
    }
  }
  
  // Look for all labels
  console.log('🔍 Looking for all labels...');
  const labels = await page.locator('label').all();
  console.log(`Found ${labels.length} labels`);
  
  for (let i = 0; i < Math.min(labels.length, 20); i++) {
    const labelText = await labels[i].textContent();
    console.log(`  Label ${i + 1}: "${labelText}"`);
  }
  
  // Look for combobox elements
  console.log('🔍 Looking for combobox elements...');
  const comboboxes = await page.locator('[role="combobox"]').count();
  console.log(`Found ${comboboxes} combobox elements`);
  
  if (comboboxes > 0) {
    for (let i = 0; i < comboboxes; i++) {
      const combobox = page.locator('[role="combobox"]').nth(i);
      const text = await combobox.textContent();
      const placeholder = await combobox.getAttribute('placeholder');
      console.log(`  Combobox ${i + 1}: text="${text}", placeholder="${placeholder}"`);
    }
  }
  
  // Look for buttons that might open dropdowns
  console.log('🔍 Looking for dropdown buttons...');
  const buttons = await page.locator('button').all();
  
  for (let i = 0; i < Math.min(buttons.length, 30); i++) {
    const buttonText = await buttons[i].textContent();
    if (buttonText && (buttonText.includes('Add') || buttonText.includes('Select') || buttonText.includes('Choose') || buttonText.trim().length < 50)) {
      console.log(`  Button ${i + 1}: "${buttonText}"`);
    }
  }
}); 