(() => {
  const path = window.location.pathname;
  console.log('[Rate Crawler] Current path:', path);
  
  // Listing page
  if (/^\/scams\/?$/.test(path)) {
    console.log('[Rate Crawler] Detecting listing page...');
    const links = Array.from(document.querySelectorAll('a'))
      .map(a => a.href)
      .filter(h => /\/scams\/[^\/]+\.html$/.test(new URL(h).pathname));
    console.log('[Rate Crawler] Found links:', links.length, links);
    chrome.runtime.sendMessage({ action: 'links', links });
  }
  // Detail page
  else if (/^\/scams\/[^\/]+\.html$/.test(path)) {
    console.log('[Rate Crawler] Detecting detail page...');
    const data = { images: [], id: '' };
    data.id = path.split('/').pop().replace('.html', '');
    
    // Extract from text content (no table structure)
    const bodyText = document.body.innerText;
    
    // Extract owner name
    const ownerMatch = bodyText.match(/Chủ TK:\s*([^\n]+)/);
    data.owner = ownerMatch ? ownerMatch[1].trim() : '';
    
    // Extract account number
    const accountMatch = bodyText.match(/STK:\s*([^\n]+)/);
    data.account = accountMatch ? accountMatch[1].trim() : '';
    
    // Extract bank
    const bankMatch = bodyText.match(/Ngân hàng:\s*([^\n]+)/);
    data.bank = bankMatch ? bankMatch[1].trim() : '';
    
    // Extract amount
    const amountMatch = bodyText.match(/Số tiền chiếm đoạt:\s*([^\n]+)/);
    data.amount = amountMatch ? amountMatch[1].trim() : '';
    
    // Extract category
    const categoryMatch = bodyText.match(/Hạng mục:\s*([^\n]+)/);
    data.category = categoryMatch ? categoryMatch[1].trim() : '';
    
    // Extract content
    const contentMatch = bodyText.match(/Nội dung tố cáo:\s*([^]+?)(?=Tán thành:|$)/);
    data.content = contentMatch ? contentMatch[1].trim() : '';
    
    // Extract votes
    const voteUpMatch = bodyText.match(/Tán thành:\s*(\d+)/);
    const voteDownMatch = bodyText.match(/Không tán thành:\s*(\d+)/);
    data.votes_up = voteUpMatch ? voteUpMatch[1] : '0';
    data.votes_down = voteDownMatch ? voteDownMatch[1] : '0';
    
    // Extract images from scammer-content divs
    data.images = Array.from(document.querySelectorAll('.scammer-content img')).map(img => img.src);
    
    console.log('[Rate Crawler] Extracted data:', data);
    chrome.runtime.sendMessage({ action: 'data', data });
  }
})();
