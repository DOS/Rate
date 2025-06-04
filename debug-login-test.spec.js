import { test, expect } from '@playwright/test';

test('Debug Strapi login form', async ({ page }) => {
  console.log('🔍 Debugging Strapi login form...');
  
  // Navigate to Strapi admin
  await page.goto('http://localhost:1337/admin');
  console.log('✅ Navigated to Strapi admin');
  
  // Take screenshot của login page
  await page.screenshot({ path: 'login-page-debug.png', fullPage: true });
  console.log('📸 Screenshot saved: login-page-debug.png');
  
  // Get page content to understand structure
  const pageContent = await page.textContent('body');
  console.log('📋 Page contains:', pageContent.substring(0, 500));
  
  // Try to find all input fields
  const inputs = await page.$$('input');
  console.log(`🔍 Found ${inputs.length} input fields`);
  
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const type = await input.getAttribute('type');
    const name = await input.getAttribute('name');
    const placeholder = await input.getAttribute('placeholder');
    const ariaLabel = await input.getAttribute('aria-label');
    console.log(`Input ${i+1}: type=${type}, name=${name}, placeholder=${placeholder}, aria-label=${ariaLabel}`);
  }
  
  // Try to find all buttons
  const buttons = await page.$$('button');
  console.log(`🔍 Found ${buttons.length} buttons`);
  
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    const text = await button.textContent();
    const type = await button.getAttribute('type');
    console.log(`Button ${i+1}: text="${text}", type=${type}`);
  }
  
  // Try different login strategies
  console.log('🧪 Testing different login approaches...');
  
  // Try by name attributes
  const emailInput = await page.$('input[name="email"]');
  const passwordInput = await page.$('input[name="password"]');
  
  if (emailInput && passwordInput) {
    console.log('✅ Found inputs by name attributes');
    await emailInput.fill('joy@joy.vn');
    await passwordInput.fill('!CkLdz_28@HH');
  } else {
    console.log('❌ Could not find inputs by name attributes');
    
    // Try by type
    const emailByType = await page.$('input[type="email"]');
    const passwordByType = await page.$('input[type="password"]');
    
    if (emailByType && passwordByType) {
      console.log('✅ Found inputs by type attributes');
      await emailByType.fill('joy@joy.vn');
      await passwordByType.fill('!CkLdz_28@HH');
    }
  }
  
  // Try to find login button
  let loginButton = await page.$('button[type="submit"]');
  if (!loginButton) {
    loginButton = await page.$('button:has-text("Log in")');
  }
  if (!loginButton) {
    loginButton = await page.$('button:has-text("Login")');
  }
  if (!loginButton) {
    loginButton = await page.$('button:has-text("Sign in")');
  }
  
  if (loginButton) {
    const buttonText = await loginButton.textContent();
    console.log(`✅ Found login button: "${buttonText}"`);
    
    // Take screenshot before clicking
    await page.screenshot({ path: 'before-login-click.png', fullPage: true });
    
    await loginButton.click();
    console.log('✅ Clicked login button');
    
    // Wait a bit and take another screenshot
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'after-login-click.png', fullPage: true });
    
  } else {
    console.log('❌ Could not find login button');
  }
}); 