const { test, expect } = require('@playwright/test');

test('Kiểm tra và sync database với ItemField đúng', async ({ page }) => {
  test.setTimeout(60000);
  
  console.log('🔍 Kiểm tra database hiện tại...');
  
  // Đăng nhập vào Strapi admin
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.waitForLoadState('networkidle');
  
  await page.fill('input[name="email"]', 'admin@ratebox.vn');
  await page.fill('input[name="password"]', 'Abc@123456');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForURL('**/admin', { timeout: 30000 });
  } catch (error) {
    if (page.url().includes('/admin')) {
      console.log('✅ Đã ở admin page');
    } else {
      throw error;
    }
  }
  
  console.log('✅ Đăng nhập thành công');
  
  // Kiểm tra API trực tiếp cho tất cả ListingTypes
  console.log('📡 Kiểm tra API cho tất cả ListingTypes...');
  
  const listingTypes = [
    { id: 1, name: 'Scammer' },
    { id: 7, name: 'Bank' }, 
    { id: 20, name: 'Scammer' },
    { id: 22, name: 'Seller' },
    { id: 23, name: 'Seller' }
  ];
  
  for (const listingType of listingTypes) {
    console.log(`\n🔍 Kiểm tra ${listingType.name} (ID: ${listingType.id})...`);
    
    const apiResponse = await page.request.get(`http://localhost:1337/api/smart-component-filter/listing-type/${listingType.id}/components`);
    const apiData = await apiResponse.json();
    
    console.log(`📦 API Response cho ${listingType.name}:`, JSON.stringify(apiData, null, 2));
    
    if (apiData.success && apiData.data.allowedComponents.length > 0) {
      console.log(`✅ ${listingType.name} có ${apiData.data.allowedComponents.length} components`);
    } else {
      console.log(`❌ ${listingType.name} có 0 components - ItemField có thể null`);
    }
  }
  
  // Kiểm tra trực tiếp ListingType trong Content Manager
  console.log('\n🔍 Kiểm tra ListingType trong Content Manager...');
  
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::listing-type.listing-type');
  await page.waitForLoadState('networkidle');
  
  // Tìm và click vào Seller để kiểm tra ItemField
  const sellerRow = page.locator('tr').filter({ hasText: 'Seller' }).first();
  if (await sellerRow.isVisible()) {
    await sellerRow.click();
    await page.waitForLoadState('networkidle');
    
    // Kiểm tra xem có field ItemField không
    const itemFieldExists = await page.locator('[data-strapi-field="ItemField"]').isVisible();
    console.log(`📋 ItemField field exists: ${itemFieldExists}`);
    
    if (itemFieldExists) {
      const itemFieldValue = await page.locator('[data-strapi-field="ItemField"]').textContent();
      console.log(`📋 ItemField value: ${itemFieldValue}`);
    }
  }
});

test('Kiểm tra database trực tiếp qua API', async ({ page }) => {
  console.log('🔍 Kiểm tra database trực tiếp...');
  
  // Đăng nhập
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.waitForLoadState('networkidle');
  
  await page.fill('input[name="email"]', 'admin@ratebox.vn');
  await page.fill('input[name="password"]', 'Abc@123456');
  await page.click('button[type="submit"]');
  
  try {
    await page.waitForURL('**/admin', { timeout: 30000 });
  } catch (error) {
    if (page.url().includes('/admin')) {
      console.log('✅ Đã ở admin page');
    }
  }
  
  // Gọi API để lấy tất cả ListingTypes
  const allListingTypesResponse = await page.request.get('http://localhost:1337/api/listing-types?populate=*');
  const allListingTypesData = await allListingTypesResponse.json();
  
  console.log('📋 Tất cả ListingTypes trong database:');
  
  if (allListingTypesData.data) {
    allListingTypesData.data.forEach(listingType => {
      console.log(`- ID: ${listingType.id}, Name: ${listingType.name}, ItemField: ${listingType.ItemField ? 'CÓ' : 'NULL'}`);
      
      if (listingType.ItemField) {
        console.log(`  ItemField components: ${listingType.ItemField.length} items`);
      }
    });
  }
}); 