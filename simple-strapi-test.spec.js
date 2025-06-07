const { test, expect } = require('@playwright/test');

test.describe('Simple Strapi Admin Test', () => {
  test('Check Strapi Admin Accessibility', async ({ page }) => {
    console.log('🔍 Checking Strapi admin accessibility...');
    
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot to see what we get
    await page.screenshot({ path: 'debug-strapi-admin-home.png' });
    
    // Check if we're on login page or already logged in
    const isLoginPage = await page.locator('input[name="email"]').isVisible();
    const isAdminDashboard = await page.locator('text=Welcome').isVisible();
    
    console.log(`📊 Is login page: ${isLoginPage}`);
    console.log(`📊 Is admin dashboard: ${isAdminDashboard}`);
    
    if (isLoginPage) {
      console.log('🔐 Need to login...');
      // Try to login with common credentials
      await page.fill('input[name="email"]', 'admin@example.com');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'debug-after-login.png' });
    }
    
    // Check current URL
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Look for main navigation elements
    const contentManager = await page.locator('text=Content Manager').isVisible();
    const contentTypeBuilder = await page.locator('text=Content-Type Builder').isVisible();
    
    console.log(`📊 Content Manager visible: ${contentManager}`);
    console.log(`📊 Content-Type Builder visible: ${contentTypeBuilder}`);
  });

  test('Check Plugin Registration', async ({ page }) => {
    console.log('🔍 Checking plugin registration...');
    
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    // Try to navigate to plugins or settings
    try {
      await page.click('text=Settings', { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'debug-settings-page.png' });
      
      // Look for our plugin
      const smartFilterPlugin = await page.locator('text=Smart Component Filter').isVisible();
      console.log(`📊 Smart Component Filter plugin visible: ${smartFilterPlugin}`);
      
    } catch (error) {
      console.log('❌ Could not access settings page');
    }
  });

  test('Check Content Types', async ({ page }) => {
    console.log('🔍 Checking content types...');
    
    await page.goto('http://localhost:1337/admin');
    await page.waitForLoadState('networkidle');
    
    try {
      // Navigate to Content-Type Builder
      await page.click('text=Content-Type Builder', { timeout: 5000 });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'debug-content-type-builder.png' });
      
      // Look for our content types
      const listingType = await page.locator('text=Listing Type').isVisible();
      const item = await page.locator('text=Item').isVisible();
      
      console.log(`📊 Listing Type visible: ${listingType}`);
      console.log(`📊 Item visible: ${item}`);
      
    } catch (error) {
      console.log('❌ Could not access Content-Type Builder');
    }
  });
}); 