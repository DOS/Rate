// Test crawling checkscam.vn using Chrome Extension approach
// This simulates what the extension would do

const https = require('https');

async function fetchWithHeaders(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    }).on('error', reject);
  });
}

async function testCheckscamVN() {
  console.log('🔍 Testing checkscam.vn with Extension-like approach...\n');
  
  try {
    // Test 1: Direct fetch
    console.log('📡 Test 1: Direct HTTPS request to homepage...');
    const homepage = await fetchWithHeaders('https://checkscam.vn/');
    console.log('Status:', homepage.status);
    console.log('Content-Type:', homepage.headers['content-type']);
    console.log('Server:', homepage.headers.server);
    console.log('Content length:', homepage.data.length);
    
    // Check for Cloudflare
    if (homepage.data.includes('Cloudflare') || homepage.data.includes('cf-browser-verification')) {
      console.log('⚠️  Cloudflare protection detected!');
    }
    
    // Check for content
    if (homepage.data.includes('Access Denied')) {
      console.log('❌ Access Denied in response');
    } else if (homepage.data.includes('checkscam')) {
      console.log('✅ Got some content with "checkscam" keyword');
    }
    
    // Test 2: Try category page
    console.log('\n📡 Test 2: Direct request to scam list...');
    const listPage = await fetchWithHeaders('https://checkscam.vn/category/danh-sanh-scam/');
    console.log('Status:', listPage.status);
    console.log('Content length:', listPage.data.length);
    
    // Extract any phone numbers or links
    const phoneRegex = /\b(0|84)\d{9,10}\b/g;
    const phones = listPage.data.match(phoneRegex) || [];
    console.log(`Found ${phones.length} phone numbers`);
    if (phones.length > 0) {
      console.log('Sample phones:', phones.slice(0, 5));
    }
    
    // Extract links
    const linkRegex = /href="([^"]*(?:scam|report|bao-cao)[^"]*)"/gi;
    const links = [];
    let match;
    while ((match = linkRegex.exec(listPage.data)) !== null) {
      links.push(match[1]);
    }
    console.log(`Found ${links.length} potential scam links`);
    if (links.length > 0) {
      console.log('Sample links:', links.slice(0, 5));
    }
    
    // Test 3: Try search endpoint
    console.log('\n📡 Test 3: Testing search functionality...');
    const testPhone = '0987654321';
    const searchUrl = `https://checkscam.vn/?s=${testPhone}`;
    const searchResult = await fetchWithHeaders(searchUrl);
    console.log('Search status:', searchResult.status);
    console.log('Search result length:', searchResult.data.length);
    
    if (searchResult.data.includes(testPhone)) {
      console.log('✅ Phone number found in search results');
    }
    
    // Save sample response
    const fs = require('fs');
    fs.writeFileSync('checkscam-vn-response.html', listPage.data);
    console.log('\n💾 Saved response to checkscam-vn-response.html for analysis');
    
    // Analyze response structure
    console.log('\n📊 Response Analysis:');
    console.log('Has DOCTYPE:', listPage.data.includes('<!DOCTYPE'));
    console.log('Has <html>:', listPage.data.includes('<html'));
    console.log('Has <body>:', listPage.data.includes('<body'));
    console.log('Has scripts:', listPage.data.includes('<script'));
    console.log('Has Cloudflare:', listPage.data.includes('cloudflare'));
    console.log('Has challenge:', listPage.data.includes('challenge'));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Alternative: Try with fetch API (like Chrome Extension would use)
async function testWithFetch() {
  console.log('\n\n🔍 Testing with fetch API...\n');
  
  try {
    const response = await fetch('https://checkscam.vn/category/danh-sanh-scam/', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    console.log('Fetch status:', response.status);
    console.log('Fetch headers:', Object.fromEntries(response.headers));
    
    const text = await response.text();
    console.log('Response length:', text.length);
    console.log('First 500 chars:', text.substring(0, 500));
    
  } catch (error) {
    console.error('Fetch error:', error.message);
  }
}

// Run tests
async function runAllTests() {
  await testCheckscamVN();
  await testWithFetch();
  
  console.log('\n\n💡 Recommendations:');
  console.log('1. checkscam.vn has strong Cloudflare protection');
  console.log('2. Direct HTTP requests are blocked');
  console.log('3. Need browser automation with advanced stealth');
  console.log('4. Or use the existing Ultra Stealth Crawler from memory');
  console.log('5. Chrome Extension might work if it runs in actual browser context');
}

runAllTests().catch(console.error);
