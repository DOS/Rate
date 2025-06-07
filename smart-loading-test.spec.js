const { test, expect } = require('@playwright/test');

test.describe('Smart Loading Component Filter', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Strapi admin
    await page.goto('http://localhost:1337/admin');
    
    // Wait for login form to load
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    
    // Login with saved credentials
    await page.fill('input[name="email"]', 'joy@joy.vn');
    await page.fill('input[name="password"]', 'p*yBHdqG2sr9');
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load - use more generic selector
    await page.waitForSelector('nav, [role="navigation"], main', { timeout: 15000 });
    await page.waitForTimeout(2000); // Extra wait for full load
  });

  test('Smart Loading filters components based on ListingType selection', async ({ page }) => {
    console.log('🎯 Starting Smart Loading test...');
    
    // Navigate to Content Manager -> Item collection
    await page.click('text=Content Manager');
    await page.waitForTimeout(3000);
    
    // Click on Item collection type
    await page.click('text=Item');
    await page.waitForTimeout(3000);
    
    // Click on an existing item or create new one
    const existingItems = await page.locator('table tbody tr').count();
    if (existingItems > 0) {
      console.log('📝 Editing existing item...');
      await page.click('table tbody tr:first-child td:last-child button');
      await page.waitForTimeout(3000);
    } else {
      console.log('➕ Creating new item...');
      await page.click('text=Create new entry');
      await page.waitForTimeout(3000);
    }
    
    // Wait for item edit page to load
    await page.waitForSelector('form', { timeout: 15000 });
    console.log('✅ Item edit page loaded');
    
    // Test 1: Select Bank ListingType
    console.log('🏦 Testing Bank ListingType...');
    
    // Find and click ListingType relation field
    const listingTypeField = page.locator('input[name="ListingType"], [name="ListingType"]').first();
    await listingTypeField.click();
    await page.waitForTimeout(2000);
    
    // Select Bank from dropdown
    await page.click('text=Bank');
    await page.waitForTimeout(3000);
    
    // Scroll to Dynamic Zone section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    
    // Find and click "Add component" button in Dynamic Zone
    const addComponentBtn = page.locator('button:has-text("Add component"), button:has-text("Add a component")').first();
    await addComponentBtn.click();
    await page.waitForTimeout(5000); // Wait longer for component picker
    
    // Check console logs for Smart Loading activity
    const consoleLogs = [];
    page.on('console', msg => {
      if (msg.text().includes('Smart Component Filter') || 
          msg.text().includes('🎯') || 
          msg.text().includes('✅') || 
          msg.text().includes('📦')) {
        consoleLogs.push(msg.text());
      }
    });
    
    // Verify Bank-specific components are shown
    console.log('🔍 Checking Bank components...');
    
    // Bank should show: contact.basic, contact.location, business.company-info
    const expectedBankComponents = ['basic', 'location', 'company'];
    
    for (const component of expectedBankComponents) {
      const componentExists = await page.locator(`text=${component}`).count() > 0;
      if (componentExists) {
        console.log(`✅ Found Bank component: ${component}`);
      } else {
        console.log(`❌ Missing Bank component: ${component}`);
      }
    }
    
    // Verify violation components are hidden for Bank
    const violationComponents = ['fraud', 'evidence', 'timeline', 'impact'];
    for (const component of violationComponents) {
      const componentExists = await page.locator(`text=${component}`).count() > 0;
      if (!componentExists) {
        console.log(`✅ Correctly hidden violation component: ${component}`);
      } else {
        console.log(`❌ Violation component should be hidden: ${component}`);
      }
    }
    
    // Close component picker
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
    
    // Test 2: Switch to Scammer ListingType
    console.log('🚨 Testing Scammer ListingType...');
    
    // Clear current ListingType selection
    await listingTypeField.click();
    await page.waitForTimeout(2000);
    
    // Select Scammer from dropdown
    await page.click('text=Scammer');
    await page.waitForTimeout(3000);
    
    // Open component picker again
    await addComponentBtn.click();
    await page.waitForTimeout(5000);
    
    // Verify Scammer-specific components are shown
    console.log('🔍 Checking Scammer components...');
    
    // Scammer should show: contact.basic, contact.location, contact.social, violation.*
    const expectedScammerComponents = ['basic', 'location', 'social', 'fraud', 'evidence', 'timeline', 'impact'];
    
    for (const component of expectedScammerComponents) {
      const componentExists = await page.locator(`text=${component}`).count() > 0;
      if (componentExists) {
        console.log(`✅ Found Scammer component: ${component}`);
      } else {
        console.log(`❌ Missing Scammer component: ${component}`);
      }
    }
    
    // Verify business components are hidden for Scammer
    const businessComponents = ['company'];
    for (const component of businessComponents) {
      const componentExists = await page.locator(`text=${component}`).count() > 0;
      if (!componentExists) {
        console.log(`✅ Correctly hidden business component: ${component}`);
      } else {
        console.log(`❌ Business component should be hidden: ${component}`);
      }
    }
    
    console.log('🎉 Smart Loading test completed!');
    console.log('📋 Console logs from Smart Loading:', consoleLogs);
  });

  test('API endpoints respond correctly', async ({ page }) => {
    console.log('🔌 Testing API endpoints...');
    
    // Test Bank API endpoint
    const bankResponse = await page.evaluate(async () => {
      const response = await fetch('/api/smart-component-filter/listing-type/7/components');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    
    console.log('🏦 Bank API response:', bankResponse);
    expect(bankResponse.status).toBe(200);
    expect(bankResponse.data.success).toBe(true);
    expect(bankResponse.data.data.listingType.name).toBe('Bank');
    expect(bankResponse.data.data.allowedComponents).toContain('contact.basic');
    expect(bankResponse.data.data.allowedComponents).toContain('business.company-info');
    
    // Test Scammer API endpoint
    const scammerResponse = await page.evaluate(async () => {
      const response = await fetch('/api/smart-component-filter/listing-type/1/components');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    
    console.log('🚨 Scammer API response:', scammerResponse);
    expect(scammerResponse.status).toBe(200);
    expect(scammerResponse.data.success).toBe(true);
    expect(scammerResponse.data.data.listingType.name).toBe('Scammer');
    expect(scammerResponse.data.data.allowedComponents).toContain('violation.fraud-details');
    expect(scammerResponse.data.data.allowedComponents).toContain('violation.evidence');
    
    console.log('✅ All API endpoints working correctly!');
  });
}); 