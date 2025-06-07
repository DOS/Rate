// Test checkscam.vn AJAX endpoints
async function testCheckscamVnAjax() {
  console.log('🔍 Testing checkscam.vn AJAX endpoints...\n');
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://checkscam.vn/category/danh-sanh-scam/'
  };
  
  // Common AJAX endpoints to try
  const ajaxEndpoints = [
    'https://checkscam.vn/wp-admin/admin-ajax.php',
    'https://checkscam.vn/ajax/load-posts',
    'https://checkscam.vn/api/scams',
    'https://checkscam.vn/wp-json/wp/v2/posts',
    'https://checkscam.vn/wp-json/wp/v2/posts?categories=scam',
    'https://checkscam.vn/category/danh-sanh-scam/?ajax=1',
    'https://checkscam.vn/category/danh-sanh-scam/?page=1&ajax=1'
  ];
  
  for (const endpoint of ajaxEndpoints) {
    try {
      console.log(`\n📡 Testing: ${endpoint}`);
      
      const response = await fetch(endpoint, { headers });
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        console.log(`Content-Type: ${contentType}`);
        
        const text = await response.text();
        console.log(`Length: ${text.length} chars`);
        
        if (text.length > 0) {
          // Check if it's JSON
          try {
            const json = JSON.parse(text);
            console.log('✅ Valid JSON response!');
            console.log('Keys:', Object.keys(json));
            
            // Save sample
            require('fs').writeFileSync(`ajax-response-${Date.now()}.json`, JSON.stringify(json, null, 2));
            
          } catch (e) {
            console.log('📄 HTML/Text response');
            console.log('Preview:', text.substring(0, 200));
            
            // Check for scam data
            const phoneCount = (text.match(/\b0\d{9,10}\b/g) || []).length;
            const linkCount = (text.match(/href="/g) || []).length;
            console.log(`Phone numbers: ${phoneCount}, Links: ${linkCount}`);
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  // Test with POST data (common for AJAX)
  console.log('\n📤 Testing POST requests...');
  
  const postData = [
    { action: 'load_posts', page: 1 },
    { action: 'get_scams', page: 1 },
    { page: 1, category: 'scam' },
    { paged: 1 }
  ];
  
  for (const data of postData) {
    try {
      const formData = new URLSearchParams(data);
      const response = await fetch('https://checkscam.vn/wp-admin/admin-ajax.php', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      });
      
      if (response.ok) {
        const text = await response.text();
        console.log(`\n📤 POST ${JSON.stringify(data)}: ${text.length} chars`);
        if (text.length > 100) {
          console.log('Preview:', text.substring(0, 200));
        }
      }
    } catch (error) {
      console.log(`❌ POST error: ${error.message}`);
    }
  }
}

testCheckscamVnAjax();
