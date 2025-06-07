const { test, expect } = require('@playwright/test');

test('Debug Seller ItemField trong database', async ({ page }) => {
  test.setTimeout(60000); // Tăng timeout lên 60 giây
  
  console.log('🔍 Bắt đầu debug ItemField của Seller...');
  
  // Đăng nhập vào Strapi admin
  console.log('🔐 Đang đăng nhập...');
  await page.goto('http://localhost:1337/admin/auth/login');
  
  // Đợi trang load
  await page.waitForLoadState('networkidle');
  
  await page.fill('input[name="email"]', 'admin@ratebox.vn');
  await page.fill('input[name="password"]', 'Abc@123456');
  await page.click('button[type="submit"]');
  
  // Đợi redirect với timeout dài hơn
  try {
    await page.waitForURL('**/admin', { timeout: 30000 });
    console.log('✅ Đăng nhập thành công');
  } catch (error) {
    console.log('❌ Login timeout, thử kiểm tra URL hiện tại...');
    console.log('Current URL:', page.url());
    
    // Nếu đã ở admin page thì tiếp tục
    if (page.url().includes('/admin')) {
      console.log('✅ Đã ở admin page, tiếp tục...');
    } else {
      throw error;
    }
  }
  
  // Kiểm tra API trực tiếp cho Seller (ID: 22)
  console.log('📡 Kiểm tra API cho Seller (ID: 22)...');
  
  const apiResponse = await page.request.get('http://localhost:1337/api/smart-component-filter/listing-type/22/components');
  const apiData = await apiResponse.json();
  
  console.log('📦 API Response Status:', apiResponse.status());
  console.log('📦 API Response Data:', JSON.stringify(apiData, null, 2));
  
  // Kiểm tra dữ liệu thô của Seller từ database
  console.log('🔍 Kiểm tra dữ liệu thô của Seller từ database...');
  
  const sellerResponse = await page.request.get('http://localhost:1337/api/listing-types/22?fields=id,Name,ItemField');
  const sellerData = await sellerResponse.json();
  
  console.log('📦 Seller Database Data:', JSON.stringify(sellerData, null, 2));
  
  // So sánh với Bank (ID: 7) để thấy sự khác biệt
  console.log('🔍 So sánh với Bank (ID: 7)...');
  
  const bankResponse = await page.request.get('http://localhost:1337/api/listing-types/7?fields=id,Name,ItemField');
  const bankData = await bankResponse.json();
  
  console.log('📦 Bank Database Data:', JSON.stringify(bankData, null, 2));
  
  // Kiểm tra tất cả ListingTypes để thấy pattern
  console.log('🔍 Kiểm tra tất cả ListingTypes...');
  
  const allResponse = await page.request.get('http://localhost:1337/api/listing-types?fields=id,Name,ItemField&pagination[limit]=25');
  const allData = await allResponse.json();
  
  console.log('📦 All ListingTypes:');
  allData.data.forEach(item => {
    console.log(`  - ID: ${item.id}, Name: ${item.Name}, ItemField: ${JSON.stringify(item.ItemField)}`);
  });
  
  // Kiểm tra xem có ListingType nào có ItemField không null
  const withItemField = allData.data.filter(item => item.ItemField !== null && item.ItemField !== undefined);
  console.log(`📊 ListingTypes có ItemField: ${withItemField.length}/${allData.data.length}`);
  
  withItemField.forEach(item => {
    console.log(`  ✅ ${item.Name} (ID: ${item.id}): ${JSON.stringify(item.ItemField)}`);
  });
  
  const withoutItemField = allData.data.filter(item => item.ItemField === null || item.ItemField === undefined);
  console.log(`📊 ListingTypes không có ItemField: ${withoutItemField.length}/${allData.data.length}`);
  
  withoutItemField.forEach(item => {
    console.log(`  ❌ ${item.Name} (ID: ${item.id}): ${JSON.stringify(item.ItemField)}`);
  });
}); 