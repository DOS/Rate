// Parse the saved HTML response from checkscam.vn
const fs = require('fs');

function parseCheckscamVN() {
  console.log('📄 Parsing checkscam.vn response...\n');
  
  try {
    // Read the saved HTML
    const html = fs.readFileSync('checkscam-vn-response.html', 'utf8');
    console.log('File size:', html.length, 'bytes');
    
    // Check what we got
    if (html.includes('Error 1020')) {
      console.log('❌ Error 1020: Access denied by Cloudflare');
      return;
    }
    
    if (html.includes('<!DOCTYPE html>')) {
      console.log('✅ Got real HTML content!');
    }
    
    // Extract title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      console.log('Page title:', titleMatch[1]);
    }
    
    // Look for scam entries
    console.log('\n🔍 Looking for scam entries...');
    
    // Method 1: Find links with phone numbers
    const phoneInLinkRegex = /<a[^>]*href="[^"]*"[^>]*>([^<]*\b(0|84)\d{9,10}\b[^<]*)<\/a>/gi;
    const phoneLinks = [];
    let match;
    while ((match = phoneInLinkRegex.exec(html)) !== null) {
      phoneLinks.push({
        text: match[1].trim(),
        phone: match[2] + match[0].match(/\d{9,10}/)[0]
      });
    }
    console.log(`Found ${phoneLinks.length} links with phone numbers`);
    if (phoneLinks.length > 0) {
      console.log('Sample phone links:', phoneLinks.slice(0, 5));
    }
    
    // Method 2: Find article/post structures
    const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    const articles = html.match(articleRegex) || [];
    console.log(`\nFound ${articles.length} article elements`);
    
    // Method 3: Look for specific patterns
    const patterns = [
      /href="[^"]*\/([0-9]{9,11})\/?"/gi,  // URLs with phone numbers
      /class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/\w+>/gi,  // Post elements
      /<h\d[^>]*>([^<]*\b(0|84)\d{9,10}\b[^<]*)<\/h\d>/gi,  // Headers with phones
    ];
    
    patterns.forEach((pattern, index) => {
      const matches = html.match(pattern) || [];
      console.log(`Pattern ${index + 1}: Found ${matches.length} matches`);
      if (matches.length > 0) {
        console.log('Sample:', matches[0].substring(0, 100) + '...');
      }
    });
    
    // Method 4: Extract all text content and find phones
    const textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const allPhones = textContent.match(/\b(0|84)\d{9,10}\b/g) || [];
    const uniquePhones = [...new Set(allPhones)];
    console.log(`\n📱 Found ${uniquePhones.length} unique phone numbers in text`);
    if (uniquePhones.length > 0) {
      console.log('Phone numbers:', uniquePhones.slice(0, 10));
    }
    
    // Look for bank/account info
    const bankKeywords = ['ngân hàng', 'bank', 'stk', 'số tài khoản', 'account'];
    const hasFinancialInfo = bankKeywords.some(keyword => 
      textContent.toLowerCase().includes(keyword)
    );
    console.log('\n💰 Has financial keywords:', hasFinancialInfo);
    
    // Save parsed data
    const parsedData = {
      title: titleMatch ? titleMatch[1] : 'Unknown',
      phoneNumbers: uniquePhones,
      phoneLinks: phoneLinks,
      hasArticles: articles.length > 0,
      hasFinancialInfo: hasFinancialInfo,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('checkscam-vn-parsed.json', JSON.stringify(parsedData, null, 2));
    console.log('\n💾 Saved parsed data to checkscam-vn-parsed.json');
    
  } catch (error) {
    console.error('❌ Error parsing:', error.message);
  }
}

// Run parser
parseCheckscamVN();
