const { test, expect } = require('@playwright/test');

test.describe('Find All ListingTypes', () => {
  test('should find all ListingTypes in the system', async ({ page }) => {
    console.log('🧪 Finding all ListingTypes in system...');
    
    // Test a range of IDs to find all existing ListingTypes
    const testIds = Array.from({length: 20}, (_, i) => i + 1); // Test IDs 1-20
    const foundListingTypes = [];
    
    for (const id of testIds) {
      try {
        console.log(`🔍 Testing ListingType ID: ${id}`);
        
        const response = await page.request.get(`http://localhost:1337/api/smart-component-filter/listing-type/${id}/components`);
        
        if (response.ok()) {
          const data = await response.json();
          if (data.success) {
            foundListingTypes.push({
              id: id,
              name: data.data.listingTypeName || 'Unknown',
              components: data.data.allowedComponents.length,
              allowedComponents: data.data.allowedComponents
            });
            console.log(`✅ Found ListingType ID ${id}: "${data.data.listingTypeName}" (${data.data.allowedComponents.length} components)`);
          }
        }
      } catch (error) {
        // Continue to next ID
      }
    }
    
    console.log('\n📋 Summary of all ListingTypes found:');
    console.log('=====================================');
    
    foundListingTypes.forEach(lt => {
      console.log(`ID: ${lt.id} | Name: "${lt.name}" | Components: ${lt.components}`);
      if (lt.components > 0) {
        console.log(`   └─ Allowed: ${lt.allowedComponents.join(', ')}`);
      } else {
        console.log(`   └─ ⚠️  No components (should hide all)`);
      }
      console.log('');
    });
    
    console.log(`📊 Total ListingTypes found: ${foundListingTypes.length}`);
    
    // Test dynamic detection capability
    console.log('\n🎯 Testing dynamic detection capability:');
    console.log('=======================================');
    
    const hasEmptyListingTypes = foundListingTypes.some(lt => lt.components === 0);
    const hasNonEmptyListingTypes = foundListingTypes.some(lt => lt.components > 0);
    
    console.log(`✅ Has ListingTypes with components: ${hasNonEmptyListingTypes}`);
    console.log(`✅ Has ListingTypes without components: ${hasEmptyListingTypes}`);
    
    if (foundListingTypes.length > 0) {
      console.log('✅ Plugin API is working correctly');
      console.log('✅ Ready for dynamic detection testing');
    } else {
      console.log('❌ No ListingTypes found - check API or database');
    }
  });
}); 