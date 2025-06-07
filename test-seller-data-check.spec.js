const { test, expect } = require('@playwright/test');

test('Kiểm tra dữ liệu Seller trong database và API', async ({ page }) => {
  console.log('🔍 Bắt đầu kiểm tra dữ liệu Seller...');
  
  // Đăng nhập vào Strapi admin
  await page.goto('http://localhost:1337/admin/auth/login');
  await page.fill('input[name="email"]', 'admin@ratebox.vn');
  await page.fill('input[name="password"]', 'Abc@123456');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
  
  console.log('✅ Đăng nhập thành công');
  
  // Kiểm tra API trực tiếp cho Seller (ID: 22)
  console.log('📡 Kiểm tra API cho Seller (ID: 22)...');
  
  const apiResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/22/components');
  const apiData = await apiResponse.json();
  
  console.log('📦 API Response Status:', apiResponse.status());
  console.log('📦 API Response Data:', JSON.stringify(apiData, null, 2));
  
  // Kiểm tra dữ liệu ListingType trực tiếp
  console.log('🔍 Kiểm tra dữ liệu ListingType Seller...');
  
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::listing-type.listing-type');
  await page.waitForLoadState('networkidle');
  
  // Tìm Seller trong danh sách
  const sellerRow = page.locator('tr').filter({ hasText: 'Seller' });
  if (await sellerRow.count() > 0) {
    console.log('✅ Tìm thấy Seller trong danh sách ListingType');
    
    // Click vào Seller để xem chi tiết
    await sellerRow.click();
    await page.waitForLoadState('networkidle');
    
    // Kiểm tra field ItemField
    const itemFieldSection = page.locator('[data-strapi-field="ItemField"]');
    if (await itemFieldSection.count() > 0) {
      console.log('✅ Tìm thấy field ItemField');
      
      // Lấy giá trị của ItemField
      const itemFieldValue = await itemFieldSection.textContent();
      console.log('📋 ItemField value:', itemFieldValue);
      
      // Kiểm tra xem có components nào được chọn không
      const selectedComponents = page.locator('[data-strapi-field="ItemField"] .selected, [data-strapi-field="ItemField"] [data-selected="true"]');
      const componentCount = await selectedComponents.count();
      console.log('📊 Số components được chọn:', componentCount);
      
      if (componentCount > 0) {
        for (let i = 0; i < componentCount; i++) {
          const componentText = await selectedComponents.nth(i).textContent();
          console.log(`📦 Component ${i + 1}:`, componentText);
        }
      } else {
        console.log('⚠️ Không có components nào được chọn cho Seller');
      }
    } else {
      console.log('❌ Không tìm thấy field ItemField');
    }
  } else {
    console.log('❌ Không tìm thấy Seller trong danh sách');
  }
  
  // So sánh với Bank (ID: 7) để thấy sự khác biệt
  console.log('\n🔍 So sánh với Bank (ID: 7)...');
  
  const bankApiResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/7/components');
  const bankApiData = await bankApiResponse.json();
  
  console.log('📦 Bank API Response:', JSON.stringify(bankApiData, null, 2));
  
  // Kiểm tra Bank trong admin
  await page.goto('http://localhost:1337/admin/content-manager/collection-types/api::listing-type.listing-type');
  await page.waitForLoadState('networkidle');
  
  const bankRow = page.locator('tr').filter({ hasText: 'Bank' });
  if (await bankRow.count() > 0) {
    await bankRow.click();
    await page.waitForLoadState('networkidle');
    
    const bankItemField = page.locator('[data-strapi-field="ItemField"]');
    if (await bankItemField.count() > 0) {
      const bankItemFieldValue = await bankItemField.textContent();
      console.log('📋 Bank ItemField value:', bankItemFieldValue);
      
      const bankSelectedComponents = page.locator('[data-strapi-field="ItemField"] .selected, [data-strapi-field="ItemField"] [data-selected="true"]');
      const bankComponentCount = await bankSelectedComponents.count();
      console.log('📊 Bank components được chọn:', bankComponentCount);
    }
  }
  
  console.log('\n🎯 Kết luận:');
  console.log('- Seller API trả về:', apiData?.data?.allowedComponents?.length || 0, 'components');
  console.log('- Bank API trả về:', bankApiData?.data?.allowedComponents?.length || 0, 'components');
  
  if (apiData?.data?.allowedComponents?.length === 0) {
    console.log('❌ VẤN ĐỀ: Seller không có components nào được cấu hình trong ItemField!');
    console.log('💡 Giải pháp: Cần vào admin và cấu hình ItemField cho Seller');
  } else {
    console.log('✅ Seller có components được cấu hình');
  }
}); 