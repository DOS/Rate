// background-stealth.js - Crawl ngầm không mở tab
let crawlResults = [];

async function stealthCrawl() {
  console.log('[Stealth] Starting silent crawl...');
  
  try {
    // 1. Fetch listing page
    const listingResponse = await fetch('https://checkscam.com/scams');
    const listingHtml = await listingResponse.text();
    
    // Parse links using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(listingHtml, 'text/html');
    const links = Array.from(doc.querySelectorAll('a'))
      .map(a => a.href)
      .filter(h => /\/scams\/[^\/]+\.html$/.test(h));
    
    console.log('[Stealth] Found links:', links.length);
    
    // 2. Crawl each detail page
    for (let i = 0; i < links.length; i++) {
      console.log(`[Stealth] Crawling ${i + 1}/${links.length}`);
      
      const detailResponse = await fetch(links[i]);
      const detailHtml = await detailResponse.text();
      const detailDoc = parser.parseFromString(detailHtml, 'text/html');
      
      // Extract data
      const bodyText = detailDoc.body.innerText;
      const data = {
        id: links[i].split('/').pop().replace('.html', ''),
        owner: bodyText.match(/Chủ TK:\s*([^\n]+)/)?.[1]?.trim() || '',
        account: bodyText.match(/STK:\s*([^\n]+)/)?.[1]?.trim() || '',
        bank: bodyText.match(/Ngân hàng:\s*([^\n]+)/)?.[1]?.trim() || '',
        amount: bodyText.match(/Số tiền chiếm đoạt:\s*([^\n]+)/)?.[1]?.trim() || '',
        category: bodyText.match(/Hạng mục:\s*([^\n]+)/)?.[1]?.trim() || '',
        content: bodyText.match(/Nội dung tố cáo:\s*([^]+?)(?=Tán thành:|$)/)?.[1]?.trim() || '',
        votes_up: bodyText.match(/Tán thành:\s*(\d+)/)?.[1] || '0',
        votes_down: bodyText.match(/Không tán thành:\s*(\d+)/)?.[1] || '0',
        images: Array.from(detailDoc.querySelectorAll('.scammer-content img')).map(img => img.src)
      };
      
      crawlResults.push(data);
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    }
    
    // Save results
    saveResults();
    
  } catch (error) {
    console.error('[Stealth] Error:', error);
  }
}

function saveResults() {
  const jsonContent = JSON.stringify(crawlResults, null, 2);
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonContent);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  chrome.downloads.download({
    url: dataUrl,
    filename: `rate-crawler/checkscam-stealth-${timestamp}.json`,
    conflictAction: 'uniquify'
  });
}

// Listen for start command
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'start-stealth') {
    crawlResults = [];
    stealthCrawl();
  }
});
