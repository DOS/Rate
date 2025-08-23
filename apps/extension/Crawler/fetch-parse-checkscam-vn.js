// Fetch and parse checkscam.vn directly
const fs = require('fs');

async function fetchAndParseCheckscamVN() {
  console.log('🚀 Fetching checkscam.vn with proper headers...\n');
  
  try {
    // Fetch with browser-like headers
    const response = await fetch('https://checkscam.vn/category/danh-sanh-scam/', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Content Type:', response.headers.get('content-type'));
    
    const html = await response.text();
    console.log('📊 Response Length:', html.length, 'bytes');
    
    // Save full response
    fs.writeFileSync('checkscam-vn-full.html', html);
    console.log('💾 Saved full response to checkscam-vn-full.html\n');
    
    // Parse the content
    console.log('🔍 Parsing content...\n');
    
    // Extract title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      console.log('📄 Page Title:', titleMatch[1]);
    }
    
    // Look for posts/articles
    const postPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
      /<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      /<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a><\/h2>/gi,
      /<a[^>]*class="[^"]*entry-title[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi
    ];
    
    let foundPosts = false;
    postPatterns.forEach((pattern, index) => {
      const matches = [...html.matchAll(pattern)];
      if (matches.length > 0) {
        foundPosts = true;
        console.log(`✅ Pattern ${index + 1}: Found ${matches.length} matches`);
        
        // Show first few matches
        matches.slice(0, 3).forEach((match, i) => {
          if (match[2]) { // If it's a link pattern
            console.log(`  ${i + 1}. Title: ${match[2]}`);
            console.log(`     URL: ${match[1]}`);
          } else {
            console.log(`  ${i + 1}. Content preview: ${match[0].substring(0, 100)}...`);
          }
        });
      }
    });
    
    if (!foundPosts) {
      console.log('❌ No post patterns found');
    }
    
    // Extract all links
    console.log('\n🔗 Extracting all links...');
    const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    const allLinks = [...html.matchAll(linkRegex)];
    console.log(`Total links found: ${allLinks.length}`);
    
    // Filter for potential scam report links
    const scamLinks = allLinks.filter(([full, href, text]) => {
      const lowerHref = href.toLowerCase();
      const lowerText = text.toLowerCase();
      return (
        lowerHref.includes('/20') || // Year in URL
        lowerHref.includes('scam') ||
        lowerHref.includes('report') ||
        lowerText.match(/\d{9,11}/) || // Phone number in text
        lowerText.includes('lừa đảo') ||
        lowerText.includes('scam')
      );
    });
    
    console.log(`\n✨ Found ${scamLinks.length} potential scam report links:`);
    scamLinks.slice(0, 10).forEach(([full, href, text], i) => {
      console.log(`${i + 1}. ${text.trim()}`);
      console.log(`   URL: ${href}`);
    });
    
    // Extract phone numbers from entire page
    const phoneRegex = /\b(0|84|\\+84)\d{9,10}\b/g;
    const phones = html.match(phoneRegex) || [];
    const uniquePhones = [...new Set(phones)];
    console.log(`\n📱 Found ${uniquePhones.length} unique phone numbers:`);
    if (uniquePhones.length > 0) {
      console.log(uniquePhones.slice(0, 10));
    }
    
    // Check for specific content indicators
    console.log('\n📊 Content Analysis:');
    console.log('Has "Danh sách Scam":', html.includes('Danh sách Scam'));
    console.log('Has "lừa đảo":', html.includes('lừa đảo'));
    console.log('Has "checkscam":', html.includes('checkscam'));
    console.log('Has WordPress:', html.includes('wp-content'));
    console.log('Has posts:', html.includes('post-') || html.includes('article'));
    
    // Try to find pagination
    const paginationRegex = /<a[^>]*class="[^"]*page[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    const pagination = [...html.matchAll(paginationRegex)];
    if (pagination.length > 0) {
      console.log(`\n📄 Found pagination: ${pagination.length} pages`);
    }
    
    // Save parsed results
    const results = {
      url: 'https://checkscam.vn/category/danh-sanh-scam/',
      title: titleMatch ? titleMatch[1] : null,
      totalLinks: allLinks.length,
      scamLinks: scamLinks.map(([full, href, text]) => ({ href, text: text.trim() })),
      phoneNumbers: uniquePhones,
      hasWordPress: html.includes('wp-content'),
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('checkscam-vn-results.json', JSON.stringify(results, null, 2));
    console.log('\n💾 Saved results to checkscam-vn-results.json');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Run the fetcher
fetchAndParseCheckscamVN();
