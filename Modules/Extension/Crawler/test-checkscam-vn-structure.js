// Quick test to check checkscam.vn structure
async function testCheckscamVn() {
  console.log('🔍 Testing checkscam.vn structure...\n');
  
  try {
    const response = await fetch('https://checkscam.vn/category/danh-sanh-scam/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      console.log(`❌ HTTP ${response.status}: ${response.statusText}`);
      return;
    }
    
    const html = await response.text();
    console.log(`✅ Got response: ${html.length} characters`);
    
    // Check for common patterns
    console.log('\n📊 Analysis:');
    console.log('Contains "scam":', html.toLowerCase().includes('scam'));
    console.log('Contains "lừa đảo":', html.includes('lừa đảo'));
    console.log('Contains ".html":', html.includes('.html'));
    
    // Extract all .html links
    const htmlLinks = Array.from(html.matchAll(/href="([^"]*\.html)"/g));
    console.log(`\n🔗 Found ${htmlLinks.length} .html links:`);
    htmlLinks.slice(0, 10).forEach((match, i) => {
      console.log(`${i + 1}. ${match[1]}`);
    });
    
    // Look for specific patterns
    const patterns = [
      { name: 'Scam detail pages', regex: /href="([^"]*scam[^"]*\.html)"/gi },
      { name: 'Number ending pages', regex: /href="([^"]*-\d+\.html)"/g },
      { name: 'Date-based URLs', regex: /href="(\/\d{4}\/\d{2}\/[^"]+\.html)"/g },
      { name: 'Category pages', regex: /href="([^"]*category[^"]*\.html)"/g }
    ];
    
    patterns.forEach(({ name, regex }) => {
      const matches = Array.from(html.matchAll(regex));
      console.log(`\n${name}: ${matches.length} found`);
      matches.slice(0, 3).forEach((match, i) => {
        console.log(`  ${i + 1}. ${match[1]}`);
      });
    });
    
    // Save sample for analysis
    const fs = require('fs');
    fs.writeFileSync('checkscam-vn-sample.html', html);
    console.log('\n💾 Saved sample to checkscam-vn-sample.html');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCheckscamVn();
