// Passive Content Script - Auto-detect and extract scam data
console.log('🔍 Rate Crawler content script loaded on:', window.location.href);

// Gentle popup handling - only try once, don't interfere with manual closing
function handleDiscordPopup() {
  console.log('🔍 Checking for Discord popup...');
  
  try {
    // Only try to close popup automatically if it's been there for a while
    // Don't interfere with user's manual attempts
    const buttons = document.querySelectorAll('button');
    
    buttons.forEach((button) => {
      const buttonText = button.textContent || '';
      
      // Only auto-click if button contains specific text and is visible
      if (buttonText.includes('Không hiển thị lại') && 
          button.offsetParent !== null && 
          !button.hasAttribute('data-crawler-handled')) {
        
        console.log(`Found Discord popup button: "${buttonText.trim()}"`);
        
        // Mark as handled to avoid repeated clicks
        button.setAttribute('data-crawler-handled', 'true');
        
        // Click after a delay to avoid interfering with user actions
        setTimeout(() => {
          if (button.offsetParent !== null) { // Still visible
            button.click();
            console.log('✅ Auto-clicked Discord popup button');
          }
        }, 2000);
      }
    });
    
  } catch (error) {
    console.error('❌ Error handling popup:', error);
  }
}

// Check if current page has scam data
function detectScamData() {
  const url = window.location.href;
  
  // Check if we're on a scam listing page
  const isScamPage = 
    url.includes('danh-sanh-scam') ||
    url.includes('checkscam') ||
    document.querySelector('.scam-list, .scammer-info, .post-content, article, .entry') !== null;
    
  if (!isScamPage) {
    console.log('❌ Not a scam data page');
    return false;
  }
  
  console.log('✅ Scam data page detected');
  return true;
}

// Extract scam data from current page
function extractScamData() {
  console.log('🔍 Extracting scam data from current page...');
  
  const results = [];
  
  try {
    // More comprehensive selectors for checkscam.vn
    const selectors = [
      // WordPress/blog selectors
      'article',
      '.post', '.post-content', '.entry-content', '.entry',
      '.content', '.main-content',
      
      // Scam-specific selectors
      '.scam-item', '.scammer-info', '.scam-list',
      
      // Generic content selectors
      'div[class*="post"]', 'div[class*="content"]', 'div[class*="entry"]',
      'div[class*="item"]', 'div[class*="scam"]',
      
      // Broader selectors
      'main div', '.container div', '#content div',
      'div p', 'section', '.widget',
      
      // Last resort - any div with substantial text
      'div'
    ];
    
    let articles = [];
    
    // Try each selector until we find content
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`Selector "${selector}": ${elements.length} elements`);
      
      if (elements.length > 0) {
        // Filter elements with meaningful content
        const meaningfulElements = Array.from(elements).filter(el => {
          const text = el.textContent || '';
          return text.length > 100 && // At least 100 characters
                 text.length < 5000 && // Not too long (avoid full page content)
                 !el.querySelector('script, style'); // Avoid script/style containers
        });
        
        if (meaningfulElements.length > 0) {
          articles = meaningfulElements;
          console.log(`✅ Using selector: ${selector} (${meaningfulElements.length} meaningful elements)`);
          break;
        }
      }
    }
    
    if (articles.length === 0) {
      console.log('❌ No content elements found, trying page-wide extraction...');
      
      // Fallback: extract from entire page text
      const pageText = document.body.textContent || '';
      const phoneMatches = pageText.match(/(?:\+84|84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-689]|9[0-46-9])[0-9]{7}/g) || [];
      
      if (phoneMatches.length > 0) {
        console.log(`Found ${phoneMatches.length} phone numbers in page text`);
        phoneMatches.slice(0, 10).forEach((phone, index) => { // Limit to 10
          results.push({
            id: `page-wide-${Date.now()}-${index}`,
            title: `Phone found on page`,
            owner: phone,
            phone: phone,
            account: '',
            bank: 'Unknown',
            amount: '',
            content: `Phone number extracted from page: ${phone}`,
            url: window.location.href,
            extractedAt: new Date().toISOString(),
            source: 'passive-extension-pagewide'
          });
        });
      }
      
      return results;
    }
    
    // Để lọc trùng, tạo set lưu dấu vết đã gặp
    const seenKeys = new Set();

    // Extract data từ từng article/content block
    articles.forEach((article, index) => {
      try {
        const text = article.textContent || '';
        const html = article.innerHTML || '';
        
        console.log(`📄 Processing article ${index}: ${text.length} chars`);
        
        // Enhanced phone number extraction
        const phoneMatches = text.match(/(?:\+84|84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-689]|9[0-46-9])[0-9]{7}/g) || [];
        
        // Enhanced bank account extraction
        const accountMatches = text.match(/\b\d{8,16}\b/g) || [];
        
        // Enhanced amount extraction
        const amountMatches = text.match(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*(?:đ|VND|vnđ|triệu|tỷ|k|K)/gi) || [];
        
        // Bank name extraction
        const bankMatches = text.match(/(?:Vietcombank|VCB|Techcombank|TCB|BIDV|Agribank|ACB|MB|VPBank|Sacombank|VietinBank|TPBank|HDBank|OCB|MSB|Nam A Bank|LienVietPostBank|SeABank|BacABank|VIB|SHB|Eximbank|PVcomBank|NCB|Kienlongbank|GPBank|ABBank|VRB|BVBank|CBBank|DongA Bank|OceanBank|UnitedOverseas|HSBC|Standard Chartered|ANZ|Citibank)/gi) || [];
        
        // Scam keywords detection
        const scamKeywords = ['scam', 'lừa', 'chiếm đoạt', 'lừa đảo', 'cảnh báo', 'tố cáo', 'báo cáo'];
        const hasScamKeywords = scamKeywords.some(keyword => 
          text.toLowerCase().includes(keyword)
        );
        
        // Only include if we found relevant scam indicators
        if (phoneMatches.length > 0 || accountMatches.length > 0 || 
            amountMatches.length > 0 || hasScamKeywords) {
          
          console.log(`📊 Article ${index}: ${phoneMatches.length} phones, ${accountMatches.length} accounts, ${amountMatches.length} amounts, scam keywords: ${hasScamKeywords}`);
          
          // Extract title from various possible elements
          let title = '';
          const titleSelectors = ['h1', 'h2', 'h3', '.title', '.post-title', '.entry-title'];
          for (const sel of titleSelectors) {
            const titleEl = article.querySelector(sel) || document.querySelector(sel);
            if (titleEl && titleEl.textContent.trim()) {
              title = titleEl.textContent.trim();
              break;
            }
          }
          
          // Nếu không có title, tạo một title từ nội dung
          if (!title) {
            const firstLine = text.split('\n')[0].trim();
            title = firstLine.length > 10 ? firstLine.substring(0, 50) + '...' : 'Scam Report';
          }
          
          // Chỉ giữ bản ghi có ít nhất 1 trường quan trọng
          const hasPhone = phoneMatches.length > 0;
          const hasAccount = accountMatches.length > 0;
          const hasContent = text && text.length > 30; // Nội dung đủ dài
          if (!(hasPhone || hasAccount || hasContent)) {
            // Bỏ qua noise rõ ràng
            return;
          }
          // Lọc trùng theo key: phone|account|url
          const dedupKey = `${phoneMatches[0] || ''}|${accountMatches[0] || ''}|${window.location.href}`;
          if (seenKeys.has(dedupKey)) {
            // Đã gặp rồi, bỏ qua
            return;
          }
          seenKeys.add(dedupKey);
          // Tích hợp validation cơ bản cho VN
          let rawRecord = {
            id: `passive-${Date.now()}-${index}`,
            title: title,
            owner: phoneMatches[0] || accountMatches[0] || 'Unknown',
            phone: phoneMatches.join(', '),
            account: accountMatches.join(', '),
            bank: bankMatches.join(', ') || 'Unknown',
            amount: amountMatches.join(', '),
            content: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
            url: window.location.href,
            extractedAt: new Date().toISOString(),
            source: 'passive-extension'
          };
          // Gọi hàm validation (chỉ cho VN)
          let validated = window.basicValidate ? window.basicValidate(rawRecord, { country: 'VN' }) : rawRecord;
          // Nếu score < 60 thì gắn thêm flag 'NEEDS_REVIEW'
          if (validated.score !== undefined && validated.score < 60) {
            validated.flags = validated.flags || [];
            if (!validated.flags.includes('NEEDS_REVIEW')) validated.flags.push('NEEDS_REVIEW');
          }
          results.push(validated);
        }
      } catch (error) {
        console.error(`❌ Error processing article ${index}:`, error);
      }
    });
    
    console.log(`✅ Extracted ${results.length} scam records from current page`);
    return results;
    
  } catch (error) {
    console.error('❌ Error extracting scam data:', error);
    return results;
  }
}

// Lắng nghe message từ popup để extract Shopee reviews thủ công
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'extract-shopee-reviews') {
    const reviews = scrapeShopeeVisibleReviews();
    // Gửi về background để lưu
    if (reviews && reviews.length > 0) {
      chrome.runtime.sendMessage({
        type: 'shopee-reviews-found',
        data: reviews,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }).then(() => {
        sendResponse({ success: true, data: reviews });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    } else {
      sendResponse({ success: false, data: [] });
    }
    return true; // Keep channel open for async
  }
});

// Lắng nghe thay đổi URL (SPA) để tự động extract lại Shopee reviews
let lastShopeeUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastShopeeUrl) {
    lastShopeeUrl = window.location.href;
    if (window.location.host.includes('shopee.vn')) {
      setTimeout(() => {
        const reviews = scrapeShopeeVisibleReviews();
        if (reviews && reviews.length > 0) {
          chrome.runtime.sendMessage({
            type: 'shopee-reviews-found',
            data: reviews,
            url: window.location.href,
            timestamp: new Date().toISOString()
          });
        }
      }, 4000); // Đợi 4s cho content Shopee load
    }
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// Lấy thông tin sản phẩm và seller trên trang Shopee
function getShopeeProductAndSellerInfo() {
  // --- PRODUCT INFO ---
  let productName = '';
  let price = '';
  let productId = '';
  let productUrl = window.location.href;
  let categories = [];
  let brand = '';
  let warehouse = '';

  // Tên sản phẩm
  const nameNode = document.querySelector('.vR6K3w')
    || document.querySelector('h1[data-sqe="name"]')
    || document.querySelector('._44qnta')
    || document.querySelector('.qaNIZv');
  if (nameNode) productName = nameNode.textContent.trim();
  else console.warn('[Shopee] Không tìm thấy tên sản phẩm');

  // Giá sản phẩm (nhiều khả năng Shopee đổi class)
  let priceNode = document.querySelector('.pmmxKx')
    || document.querySelector('.pmmxKx._2v0HOb')
    || document.querySelector('.pqTWkA')
    || document.querySelector('div[data-sqe="price"]');
  if (!priceNode) {
    // Fallback: tìm bất kỳ node nào có thuộc tính data-sqe='price' hoặc class chứa 'price'
    priceNode = Array.from(document.querySelectorAll('[data-sqe], [class*="price"]')).find(el => {
      return el.getAttribute('data-sqe') === 'price' || (el.className && el.className.includes('price'));
    });
  }
  if (priceNode) price = priceNode.textContent.trim();
  else console.warn('[Shopee] Không tìm thấy giá sản phẩm');

  // ProductId từ URL (Shopee dạng .../i.<shopid>.<itemid>)
  const idMatch = productUrl.match(/i\.(\d+)\.(\d+)/);
  if (idMatch && idMatch[2]) productId = idMatch[2];
  else productId = productUrl.split('.').pop().split('?')[0] || '';

  // Danh mục (category)
  const catNodes = document.querySelectorAll('.Gf4Ro0 .flex.items-center.idLK2l a');
  if (catNodes && catNodes.length > 0) {
    categories = Array.from(catNodes).map(a => a.textContent.trim());
  }

  // Thương hiệu (brand)
  const brandNode = document.querySelector('.Gf4Ro0 .Dgs_Bt');
  if (brandNode) brand = brandNode.textContent.trim();

  // Kho (warehouse)
  const warehouseNode = document.querySelector('.Gf4Ro0 .ybxj32:nth-child(4) div');
  if (warehouseNode) warehouse = warehouseNode.textContent.trim();

  // --- SELLER INFO ---
  let sellerName = '';
  let sellerLink = '';
  let sellerAvatar = '';
  let sellerReviewCount = '';
  let sellerFollowerCount = '';

  // Link shop + tên shop
  const sellerLinkNode = document.querySelector('section.page-product__shop a.lG5Xxv');
  if (sellerLinkNode) {
    sellerLink = sellerLinkNode.href;
    // Tên shop nằm ở .fV3TIn bên cạnh hoặc trong zone này
    const sellerNameNode = sellerLinkNode.parentElement?.parentElement?.querySelector('.fV3TIn')
      || document.querySelector('.fV3TIn');
    if (sellerNameNode) sellerName = sellerNameNode.textContent.trim();
    // Avatar shop
    const sellerAvatarNode = sellerLinkNode.querySelector('img.uXN1L5');
    if (sellerAvatarNode) sellerAvatar = sellerAvatarNode.src;
  } else {
    console.warn('[Shopee] Không tìm thấy link shop');
    const sellerNameNode = document.querySelector('.fV3TIn');
    if (sellerNameNode) sellerName = sellerNameNode.textContent.trim();
  }

  // Tổng số đánh giá shop
  let reviewCountNode = null;
  // KHÔNG dùng :contains, phải quét thủ công
  const reviewBlocks = document.querySelectorAll('section.page-product__shop .YnZi6x');
  for (const block of reviewBlocks) {
    const label = block.querySelector('label.ffHYws');
    if (label && label.textContent.includes('Đánh giá')) {
      reviewCountNode = label.nextElementSibling;
      break;
    }
  }
  if (!reviewCountNode) {
    // Fallback: lấy node .Cs6w3G nếu text cha chứa 'Đánh giá'
    for (const block of reviewBlocks) {
      if (block.textContent.includes('Đánh giá')) {
        const csNode = block.querySelector('.Cs6w3G');
        if (csNode) {
          reviewCountNode = csNode;
          break;
        }
      }
    }
  }
  if (reviewCountNode) sellerReviewCount = reviewCountNode.textContent.trim();


  // Số người theo dõi shop
  const followerNode = Array.from(document.querySelectorAll('section.page-product__shop .YnZi6x')).find(div => div.textContent.includes('Người theo dõi'));
  if (followerNode) {
    const val = followerNode.querySelector('.Cs6w3G');
    if (val) sellerFollowerCount = val.textContent.trim();
  }

  return {
    productName, price, productUrl, productId,
    categories, brand, warehouse,
    sellerName, sellerLink, sellerAvatar, sellerReviewCount, sellerFollowerCount
  };
}



// Hàm scrape review Shopee đang hiển thị trên DOM, gắn thêm info sản phẩm & seller
function scrapeShopeeVisibleReviews() {
  const productInfo = getShopeeProductAndSellerInfo();

  // Logging từng bước selector
  const ratingOld = document.querySelectorAll('.shopee-product-rating');
  const ratingNew = document.querySelectorAll('.product-rating-item, .rG6jF7');
  const divWithMain = Array.from(document.querySelectorAll('div')).filter(div => div.querySelector('.shopee-product-rating__main'));
  console.log(`[Shopee] .shopee-product-rating: ${ratingOld.length}, .product-rating-item/.rG6jF7: ${ratingNew.length}, div có .shopee-product-rating__main: ${divWithMain.length}`);

  // 1. Ưu tiên selector cũ
  let reviewNodes = Array.from(ratingOld);

  // 2. Nếu không có, fallback sang selector mới
  if (reviewNodes.length === 0) {
    reviewNodes = Array.from(ratingNew);
    if (reviewNodes.length === 0) {
      reviewNodes = divWithMain;
    }
  }

  // 3. Nếu vẫn không có, thử shadow DOM
  if (reviewNodes.length === 0) {
    let foundInShadow = [];
    const allElements = Array.from(document.querySelectorAll('*'));
    allElements.forEach(el => {
      if (el.shadowRoot) {
        const shadowRatings = el.shadowRoot.querySelectorAll('.shopee-product-rating, .product-rating-item, .rG6jF7, .shopee-product-rating__main');
        if (shadowRatings.length > 0) {
          foundInShadow = foundInShadow.concat(Array.from(shadowRatings));
        }
      }
    });
    if (foundInShadow.length > 0) {
      console.log(`[Shopee] Tìm thấy review trong shadow DOM: ${foundInShadow.length}`);
      reviewNodes = foundInShadow;
    }
  }

  if (reviewNodes.length === 0) {
    console.warn('[Shopee] Không tìm thấy review nào trên trang! Có thể review nằm trong iframe hoặc shadow DOM đặc biệt.');
    return [];
  }

  return reviewNodes.map(rating => {
    // Avatar
    let avatar = '';
    const avatarImg = rating.querySelector('.shopee-product-rating__avatar img, .shopee-avatar__img');
    if (avatarImg) avatar = avatarImg.src || '';

    // Username
    let username = '';
    const usernameNode = rating.querySelector('.shopee-product-rating__author-name') || rating.querySelector('.shopee-product-rating__main .shopee-product-rating__author-name') || rating.querySelector('.shopee-product-rating__main > div > div');
    if (usernameNode) username = usernameNode.textContent.trim();

    // Star
    let starCount = 0;
    const starNodes = rating.querySelectorAll('.shopee-product-rating__rating svg.icon-rating-solid--active, .shopee-product-rating__main .shopee-product-rating__rating svg.icon-rating-solid--active');
    if (starNodes) starCount = starNodes.length;

    // Time & loại hàng
    let timeType = '';
    const timeNode = rating.querySelector('.shopee-product-rating__time') || rating.querySelector('.shopee-product-rating__main .shopee-product-rating__time');
    if (timeNode) timeType = timeNode.textContent.trim();

    // Nội dung review (hỗ trợ nhiều dòng)
    let content = '';
    const contentBlock = rating.querySelector('.shopee-product-rating__main > div[style*="box-sizing: border-box"]')
      || rating.querySelector('.shopee-product-rating__main > div[style*="white-space: pre-wrap"]')
      || rating.querySelector('.shopee-product-rating__main > div');
    if (contentBlock) {
      // Lấy tất cả div con, nối lại
      const divs = Array.from(contentBlock.querySelectorAll('div'));
      if (divs.length > 0) {
        content = divs.map(d => d.textContent.trim()).filter(Boolean).join('\n');
      } else {
        content = contentBlock.textContent.trim();
      }
    }

    // Ảnh review
    let images = [];
    // Ảnh nhỏ
    images = Array.from(rating.querySelectorAll('.rating-media-list__image-wrapper--image, .rating-media-list__zoomed-image-item, .shopee-rating-media-list-image__content'))
      .map(img => img.src || img.style?.backgroundImage?.replace(/url\(["']?(.*?)["']?\)/, '$1'))
      .filter(Boolean);
    // Loại bỏ các giá trị undefined/null/rỗng
    images = images.map(url => url && url.startsWith('http') ? url : '').filter(Boolean);

    // Video review
    let videos = [];
    videos = Array.from(rating.querySelectorAll('.rating-media-list__zoomed-video-item, video.o5ubXd'))
      .map(video => video.src || (video.querySelector('source')?.src ?? ''))
      .filter(Boolean);

    // Số like
    let likes = '0';
    const likeNode = rating.querySelector('.shopee-product-rating__like-count');
    if (likeNode) likes = likeNode.textContent.trim();

    return {
      avatar, username, starCount, timeType, content, images, videos, likes,
      product: productInfo
    };
  });
}


// Wait for page to fully load, then check for scam data
function initPassiveCrawler() {
  // Gentle popup handling - only try once
  setTimeout(() => {
    handleDiscordPopup();
  }, 3000); // Wait longer before trying to auto-close
  
  // Then wait for dynamic content to load
  setTimeout(() => {
    // Shopee review scraping: chỉ scrape khi có review Shopee trên DOM
    const shopeeReviews = scrapeShopeeVisibleReviews();
    if (shopeeReviews && shopeeReviews.length > 0) {
      chrome.runtime.sendMessage({
        type: 'shopee-reviews-found',
        data: shopeeReviews,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }).then(() => {
        console.log(`📤 Sent ${shopeeReviews.length} Shopee reviews to background script`);
      }).catch(error => {
        console.error('❌ Error sending Shopee reviews to background:', error);
      });
    } else if (detectScamData()) {
      const data = extractScamData();
      if (data.length > 0) {
        // Send data to background script
        chrome.runtime.sendMessage({
          type: 'scam-data-found',
          data: data,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }).then(() => {
          console.log(`📤 Sent ${data.length} records to background script`);
        }).catch(error => {
          console.error('❌ Error sending data to background:', error);
        });
      } else {
        console.log('📭 No scam data found on this page');
      }
    }
  }, 5000); // Wait 5s for AJAX content
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPassiveCrawler);
} else {
  initPassiveCrawler();
}

// Also listen for navigation changes (SPA)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    console.log('🔄 Page navigation detected, re-checking for scam data...');
    initPassiveCrawler();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('🚀 Passive crawler initialized');
