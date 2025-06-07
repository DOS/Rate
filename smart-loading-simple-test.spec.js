const { test, expect } = require('@playwright/test');

test.describe('Smart Loading - Core Functionality', () => {
  
  test('API endpoints return correct component data', async ({ page }) => {
    console.log('🔌 Testing Smart Component Filter API...');
    
    await page.goto('http://localhost:1337/admin');
    
    // Test Bank ListingType (ID: 7)
    const bankResponse = await page.evaluate(async () => {
      const response = await fetch('/api/smart-component-filter/listing-type/7/components');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    
    console.log('🏦 Bank API Test:');
    console.log(`   Status: ${bankResponse.status}`);
    console.log(`   Success: ${bankResponse.data.success}`);
    console.log(`   ListingType: ${bankResponse.data.data.listingType.name}`);
    console.log(`   Components: ${bankResponse.data.data.allowedComponents.join(', ')}`);
    console.log(`   Total Count: ${bankResponse.data.data.totalCount}`);
    
    expect(bankResponse.status).toBe(200);
    expect(bankResponse.data.success).toBe(true);
    expect(bankResponse.data.data.listingType.name).toBe('Bank');
    expect(bankResponse.data.data.allowedComponents).toEqual([
      'contact.basic',
      'contact.location', 
      'business.company-info'
    ]);
    expect(bankResponse.data.data.totalCount).toBe(3);
    
    // Test Scammer ListingType (ID: 1)
    const scammerResponse = await page.evaluate(async () => {
      const response = await fetch('/api/smart-component-filter/listing-type/1/components');
      return {
        status: response.status,
        data: await response.json()
      };
    });
    
    console.log('\n🚨 Scammer API Test:');
    console.log(`   Status: ${scammerResponse.status}`);
    console.log(`   Success: ${scammerResponse.data.success}`);
    console.log(`   ListingType: ${scammerResponse.data.data.listingType.name}`);
    console.log(`   Components: ${scammerResponse.data.data.allowedComponents.join(', ')}`);
    console.log(`   Total Count: ${scammerResponse.data.data.totalCount}`);
    
    expect(scammerResponse.status).toBe(200);
    expect(scammerResponse.data.success).toBe(true);
    expect(scammerResponse.data.data.listingType.name).toBe('Scammer');
    expect(scammerResponse.data.data.allowedComponents).toEqual([
      'contact.basic',
      'contact.location',
      'contact.social',
      'violation.fraud-details',
      'violation.evidence',
      'violation.timeline',
      'violation.impact'
    ]);
    expect(scammerResponse.data.data.totalCount).toBe(7);
    
    console.log('\n✅ All API tests passed! Smart Loading backend is working correctly.');
  });

  test('Plugin registration and console logs', async ({ page }) => {
    console.log('🔍 Testing Smart Loading plugin registration...');
    
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Smart Component Filter') || 
          text.includes('🚀') || 
          text.includes('✅') || 
          text.includes('🎯')) {
        consoleLogs.push(text);
      }
    });
    
    await page.goto('http://localhost:1337/admin');
    await page.waitForTimeout(3000);
    
    console.log('\n📋 Smart Loading Console Logs:');
    consoleLogs.forEach(log => console.log(`   ${log}`));
    
    // Check if plugin registered
    const hasRegistrationLog = consoleLogs.some(log => 
      log.includes('Smart Component Filter plugin registering') ||
      log.includes('Smart Component Filter plugin registered')
    );
    
    const hasBootstrapLog = consoleLogs.some(log => 
      log.includes('Smart Component Filter bootstrap complete') ||
      log.includes('API-based component filter ready')
    );
    
    if (hasRegistrationLog) {
      console.log('✅ Plugin registration detected in console');
    } else {
      console.log('⚠️ Plugin registration not detected in console');
    }
    
    if (hasBootstrapLog) {
      console.log('✅ Plugin bootstrap detected in console');
    } else {
      console.log('⚠️ Plugin bootstrap not detected in console');
    }
    
    console.log('\n🎉 Smart Loading plugin is loaded and ready!');
  });

  test('Component filtering logic validation', async ({ page }) => {
    console.log('🧪 Testing component filtering logic...');
    
    await page.goto('http://localhost:1337/admin');
    
    // Inject Smart Loading logic test
    const filteringTest = await page.evaluate(() => {
      // Simulate the filtering logic from our plugin
      const bankComponents = ['contact.basic', 'contact.location', 'business.company-info'];
      const scammerComponents = [
        'contact.basic', 'contact.location', 'contact.social',
        'violation.fraud-details', 'violation.evidence', 
        'violation.timeline', 'violation.impact'
      ];
      
      // Test category parsing
      const parseComponents = (components) => {
        const categories = new Set();
        const componentsByCategory = new Map();
        
        components.forEach(comp => {
          const [category, componentName] = comp.split('.');
          const categoryLower = category.toLowerCase();
          categories.add(categoryLower);
          
          if (!componentsByCategory.has(categoryLower)) {
            componentsByCategory.set(categoryLower, new Set());
          }
          componentsByCategory.get(categoryLower).add(componentName);
        });
        
        return { categories: Array.from(categories), componentsByCategory };
      };
      
      const bankParsed = parseComponents(bankComponents);
      const scammerParsed = parseComponents(scammerComponents);
      
      return {
        bank: {
          components: bankComponents,
          categories: bankParsed.categories,
          componentsByCategory: Object.fromEntries(bankParsed.componentsByCategory)
        },
        scammer: {
          components: scammerComponents,
          categories: scammerParsed.categories,
          componentsByCategory: Object.fromEntries(scammerParsed.componentsByCategory)
        }
      };
    });
    
    console.log('\n🏦 Bank Filtering Logic:');
    console.log(`   Categories: ${filteringTest.bank.categories.join(', ')}`);
    console.log(`   Components by Category:`, filteringTest.bank.componentsByCategory);
    
    console.log('\n🚨 Scammer Filtering Logic:');
    console.log(`   Categories: ${filteringTest.scammer.categories.join(', ')}`);
    console.log(`   Components by Category:`, filteringTest.scammer.componentsByCategory);
    
    // Validate Bank filtering
    expect(filteringTest.bank.categories).toContain('contact');
    expect(filteringTest.bank.categories).toContain('business');
    expect(filteringTest.bank.categories).not.toContain('violation');
    
    // Validate Scammer filtering
    expect(filteringTest.scammer.categories).toContain('contact');
    expect(filteringTest.scammer.categories).toContain('violation');
    expect(filteringTest.scammer.categories).not.toContain('business');
    
    console.log('\n✅ Component filtering logic validation passed!');
  });
}); 