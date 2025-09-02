// Passive Content Script - Auto-detect and extract scam data
console.log('🔍 Rate Crawler content script loaded on:', window.location.href);
// Ensure bridge/sniffer are available ASAP on Shopee
try { if (location.host.includes('shopee.vn')) { injectShopeeApiBridge(); injectShopeeSniffer(); } } catch {}

// Bridge: inject external script (avoids CSP inline)
function injectShopeeApiBridge() {
  try {
    if (document.getElementById('rate-shopee-bridge')) return;
    try { chrome.runtime && chrome.runtime.sendMessage && chrome.runtime.sendMessage({ type: 'inject_page_scripts' }); } catch {}
    const script = document.createElement('script');
    script.id = 'rate-shopee-bridge';
    script.src = chrome.runtime.getURL('page-bridge.js');
    (document.documentElement || document.head || document.body).appendChild(script);
  } catch (_) {}
}

// Inject a network sniffer in page context via external script (avoids CSP inline)
function injectShopeeSniffer() {
  try {
    if (document.getElementById('rate-shopee-sniffer')) return;
    try { chrome.runtime && chrome.runtime.sendMessage && chrome.runtime.sendMessage({ type: 'inject_page_scripts' }); } catch {}
    const script = document.createElement('script');
    script.id = 'rate-shopee-sniffer';
    script.src = chrome.runtime.getURL('page-sniffer.js');
    (document.documentElement || document.head || document.body).appendChild(script);
  } catch {}
}

function getShopeeIdsFromUrl() {
  const url = window.location.href;
  const m = url.match(/i\.(\d+)\.(\d+)/);
  if (m) {
    return { shopId: m[1], itemId: m[2] };
  }
  return { shopId: '', itemId: '' };
}

// Canonicalize Shopee PDP URL to https://shopee.vn/i.<shopId>.<itemId>
function canonicalProductUrl(url) {
  try {
    const m = String(url || window.location.href).match(/i\.(\d+)\.(\d+)/);
    if (m) return `https://shopee.vn/i.${m[1]}.${m[2]}`;
    return (url || '').split('#')[0].split('?')[0];
  } catch (_) { return url; }
}

// Parse VND numeric amount from text like "46.990.000" → 46990000
function parsePriceVNDFromText(text) {
  try {
    const digits = (text || '').replace(/[^0-9]/g, '');
    if (!digits) return 0;
    return Number(digits);
  } catch (_) { return 0; }
}

// Convert Shopee raw integer price into VND number (handles different multipliers)
function convertRawShopeePriceToVND(raw) {
  const n = Number(raw || 0);
  if (!n) return 0;
  if (n > 1e10) return Math.round(n / 100000);
  if (n > 1e9) return Math.round(n / 1000);
  if (n > 1e6) return Math.round(n / 100);
  return n;
}

async function fetchShopeeProductViaAPI() {
  try {
    const { shopId, itemId } = getShopeeIdsFromUrl();
    if (!shopId || !itemId) return null;
    // Ensure bridge ready
    try {
      injectShopeeApiBridge();
      await new Promise((resolve) => {
        let resolved = false;
        const t = setTimeout(() => { if (!resolved) resolve(); }, 500);
        const onMsg = (e) => { if (e && e.data && e.data.type === 'EXT_BRIDGE_READY') { resolved = true; clearTimeout(t); window.removeEventListener('message', onMsg); resolve(); } };
        window.addEventListener('message', onMsg);
      });
    } catch {}
    // Try bridge first to avoid 403
    let j = null;
    try {
      const requestId = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      j = await new Promise((resolve) => {
        const onMsg = (e) => {
          const m = e && e.data;
          if (!m || m.requestId !== requestId) return;
          window.removeEventListener('message', onMsg);
          if (m.type === 'EXT_SHOPEE_ITEM_DATA') return resolve(m.data);
          return resolve(null);
        };
        window.addEventListener('message', onMsg);
        window.postMessage({ type: 'EXT_REQUEST_SHOPEE_ITEM_GET', requestId, shopId, itemId }, '*');
      });
      if (!j) throw new Error('bridge_failed');
    } catch (_) {
      // Last resort: direct (may 403)
      try {
        const resp = await fetch(`/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`, { credentials: 'include' });
        if (resp.ok) j = await resp.json();
      } catch {}
    }
    const item = j?.data?.item || j?.item || j?.data;
    if (!item) return null;
    const priceMinNum = convertRawShopeePriceToVND(item.price_min || item.price || 0);
    const priceMaxNum = convertRawShopeePriceToVND(item.price_max || item.price || 0);
    const priceRange = priceMaxNum && priceMaxNum !== priceMinNum
      ? { min: priceMinNum, max: priceMaxNum }
      : { min: priceMinNum, max: priceMinNum };
    const categories = Array.isArray(item.categories) ? item.categories.map(c => c?.display_name || c?.name).filter(Boolean) : [];
    const brand = item.brand || '';
    // Variants/models mapping
    const models = Array.isArray(item.models) ? item.models : [];
    const variantsFromModels = models.map(m => {
      const name = m?.name || m?.model_name || '';
      const vMin = convertRawShopeePriceToVND(m?.price_min || m?.price || 0);
      const vMax = convertRawShopeePriceToVND(m?.price_max || m?.price || 0);
      return {
        name,
        price: vMin,
        priceMin: vMin,
        priceMax: vMax
      };
    }).filter(v => v.name);
    // Fallback: tier variations (options)
    let variants = variantsFromModels;
    try {
      if ((!variants || variants.length === 0) && Array.isArray(item.tier_variations)) {
        const names = [];
        item.tier_variations.forEach(tv => {
          (tv?.options || []).forEach(opt => { if (opt) names.push(opt); });
        });
        const basePrice = convertRawShopeePriceToVND(item.price_min || item.price || 0);
        variants = names.map(n => ({ name: n, price: basePrice, priceMin: basePrice, priceMax: basePrice }));
      }
    } catch {}
    return {
      productName: item.name || '',
      price: priceMinNum,
      priceRange,
      productUrl: canonicalProductUrl(window.location.href),
      productId: String(item.itemid || itemId),
      categories,
      brand,
      variants,
      stock: Number(item.stock || item.normal_stock || 0),
      shipFrom: item.shop_location || item.shop_loca || ''
    };
  } catch (_) { return null; }
}

function triggerShopeeRatingsLoad() {
  try {
    injectShopeeSniffer();
    const tryClick = () => {
      const candidates = Array.from(document.querySelectorAll('a, button, div'))
        .slice(0, 500);
      for (const el of candidates) {
        const t = (el.textContent || '').trim();
        if (!t) continue;
        if (/đánh giá/i.test(t)) {
          el.click();
          break;
        }
      }
    };
    // Gentle: chỉ click, KHÔNG auto-scroll để tránh captcha/anti-bot
    tryClick();
    // Try click again after some DOM updates
    setTimeout(tryClick, 1200);
  } catch (_) {}
}

function normalizeShopeeImageUrl(s) {
  try {
    if (!s) return '';
    const str = String(s);
    if (/^https?:\/\//i.test(str)) return str;
    if (str.startsWith('//')) return 'https:' + str;
    // Shopee image id -> full URL
    return 'https://down-vn.img.susercontent.com/file/' + str;
  } catch (_) {
    return '';
  }
}

function mapShopeeApiRatingToReview(r, productInfo) {
  if (!r) return null;
  const username = r.author_username || r.author_shopid || r.author_name || '';
  const userId = r.userid || r.user_id || r.author_userid || r.author_user_id || '';
  const starRate = r.rating_star || r.rating || 0;
  const comment = (r.comment || '').trim();
  const images = Array.isArray(r.images)
    ? r.images.map(i => normalizeShopeeImageUrl(i && (i.url || i.image_url || i)))
    : [];
  const videos = Array.isArray(r.videos) ? r.videos.map(v => (v && (v.url || v.video_url || v))) : [];
  const likes = String(r.like_count || r.helpful_count || '0');
  const ts = r.ctime || r.timestamp || 0;
  const timeType = ts ? new Date(ts * 1000).toISOString() : '';
  let reviewVariant = '';
  if (Array.isArray(r.product_items) && r.product_items[0] && r.product_items[0].model_name) {
    reviewVariant = r.product_items[0].model_name || '';
  } else if (r.model_name) {
    reviewVariant = r.model_name;
  }
  // Extract structured criteria
  const criteria = {};
  try {
    const lines = (comment || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    lines.forEach((ln) => {
      const idx = ln.indexOf(':');
      if (idx <= 0) return;
      const key = ln.slice(0, idx).toLowerCase();
      const val = ln.slice(idx + 1).trim();
      if (key.includes('chất lượng sản phẩm')) criteria.quality = val;
      else if (key.includes('tính năng nổi bật')) criteria.features = val;
      else if (key.includes('đúng với mô tả')) criteria.matchesDescription = val;
      else if (key.startsWith('sản phẩm')) criteria.productTags = val.split(/,\s*/).filter(Boolean);
    });
  } catch {}
  return {
    avatar: normalizeShopeeImageUrl(r.author_portrait || r.author_portrait_url || r.author_portrait_thumb || ''),
    username,
    userId,
    isUsernameMasked: typeof username === 'string' ? /\*/.test(username) : false,
    starRate,
    timeType,
    comment,
    // Backward compatible fields
    starCount: starRate,
    content: comment,
    images: images.filter(Boolean),
    videos: videos.filter(Boolean),
    likes,
    reviewVariant,
    criteria,
    product: productInfo
  };
}

async function fetchShopeeReviewsViaPageApi(maxPages = 3) {
  try {
    injectShopeeApiBridge();
    const { shopId, itemId } = getShopeeIdsFromUrl();
    if (!shopId || !itemId) return [];
    // Build enriched product info before mapping any review
    let productInfo = getShopeeProductAndSellerInfo();
    try {
      const apiInfo = await fetchShopeeProductViaAPI();
      if (apiInfo) {
        productInfo = {
          ...productInfo,
          productName: productInfo.productName || apiInfo.productName,
          price: productInfo.price || apiInfo.price,
          priceRange: productInfo.priceRange || apiInfo.priceRange,
          categories: (productInfo.categories && productInfo.categories.length ? productInfo.categories : apiInfo.categories) || [],
          brand: productInfo.brand || apiInfo.brand,
          productId: productInfo.productId || apiInfo.productId,
          variants: apiInfo.variants || productInfo.variants
        };
      }
    } catch {}
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const collected = [];
    return await new Promise((resolve) => {
      try {
        const onMsg = (e) => {
          const m = e && e.data;
          if (!m || m.requestId !== requestId) return;
          if (m.type === 'EXT_SHOPEE_RATINGS_CHUNK' && Array.isArray(m.ratings)) {
            m.ratings.forEach((raw) => {
              const review = mapShopeeApiRatingToReview(raw, productInfo);
              if (review) collected.push(review);
            });
          } else if (m.type === 'EXT_SHOPEE_RATINGS_DONE') {
            window.removeEventListener('message', onMsg);
            if (collected.length === 0) {
              (async () => {
                try {
                  let offset = 0;
                  for (let p = 0; p < maxPages; p++) {
                    const v4 = await fetch(`/api/v4/pdp/get_rating_list?itemid=${itemId}&shopid=${shopId}&limit=20&offset=${offset}`, { credentials: 'include' });
                    const jd = await v4.json();
                    const list = (jd && (jd.data?.list || jd.list || jd.data?.ratings)) || [];
                    if (Array.isArray(list)) {
                      list.forEach(raw => {
                        const review = mapShopeeApiRatingToReview(raw, productInfo);
                        if (review) collected.push(review);
                      });
                      if (list.length < 20) break;
                      offset += 20;
                    } else {
                      break;
                    }
                  }
                } catch {}
                resolve(collected);
              })();
            } else {
              resolve(collected);
            }
          } else if (m.type === 'EXT_SHOPEE_RATINGS_ERROR') {
            window.removeEventListener('message', onMsg);
            resolve(collected);
          }
        };
        window.addEventListener('message', onMsg);
        window.postMessage({ type: 'EXT_REQUEST_SHOPEE_RATINGS', requestId, shopId, itemId, pages: maxPages, limit: 20 }, '*');
      } catch (_) {
        resolve([]);
      }
    });
  } catch (_) { return []; }
}

// Final fallback: fetch directly from content-script (same-origin, cookies should apply)
async function fetchShopeeDirectFromContentScript(maxPages = 3) {
  try {
    const { shopId, itemId } = getShopeeIdsFromUrl();
    if (!shopId || !itemId) return [];
    let productInfo = getShopeeProductAndSellerInfo();
    // Enrich product via API if DOM missing fields
    const apiInfo = await fetchShopeeProductViaAPI();
    if (apiInfo) {
      productInfo = {
        ...productInfo,
        productName: productInfo.productName || apiInfo.productName,
        price: productInfo.price || apiInfo.price,
        categories: (productInfo.categories && productInfo.categories.length ? productInfo.categories : apiInfo.categories) || [],
        brand: productInfo.brand || apiInfo.brand,
        productId: productInfo.productId || apiInfo.productId
      };
    }
    const all = [];
    let offset = 0;
    for (let p = 0; p < maxPages; p++) {
      const q = `filter=0&flag=1&itemid=${itemId}&shopid=${shopId}&limit=20&offset=${offset}&type=0&exclude_filter=1&filter_size=0&fold_filter=0&relevant_reviews=false&request_source=2`;
      const url = `/api/v2/item/get_ratings?${q}`;
      const resp = await fetch(url, { credentials: 'include' });
      const data = await resp.json();
      const list = (data && (data.data?.ratings || data.ratings || data.data?.list || data.list)) || [];
      if (Array.isArray(list)) {
        list.forEach(raw => {
          const review = mapShopeeApiRatingToReview(raw, productInfo);
          if (review) all.push(review);
        });
        if (list.length < 20) break;
        offset += 20;
      } else {
        break;
      }
    }
    return all;
  } catch (_) { return []; }
}

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
    const domReviews = scrapeShopeeVisibleReviews();
    const proceed = (finalReviews) => {
      if (finalReviews && finalReviews.length > 0) {
        chrome.runtime.sendMessage({
          type: 'shopee-reviews-found',
          data: finalReviews,
          url: window.location.href,
          timestamp: new Date().toISOString()
        }).then(() => {
          sendResponse({ success: true, data: finalReviews });
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, data: [] });
      }
    };
    if (domReviews && domReviews.length > 0) {
      // Enrich DOM-scraped reviews with product variants/price
      enrichReviewsWithVariants(domReviews).then(proceed).catch(() => proceed(domReviews));
    } else {
      fetchShopeeReviewsViaPageApi(5).then(apiReviews => {
        if (apiReviews && apiReviews.length > 0) return proceed(apiReviews);
        // Final fallback: direct fetch in content-script
        fetchShopeeDirectFromContentScript(5).then(direct => proceed(direct));
      });
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
  let productUrl = canonicalProductUrl(window.location.href);
  let categories = [];
  let brand = '';
  let shipFrom = '';
  let stock = 0;

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
    || document.querySelector('div[data-sqe="price"]')
    || document.querySelector('[data-sqe="price"]')
    || document.querySelector('[class*="price" i]');
  if (!priceNode) {
    // Fallback: tìm trong khu vực tiêu đề/giá sản phẩm
    const scope = document.querySelector('div[data-sqe="price"], section.page-product, main, body') || document;
    priceNode = Array.from(scope.querySelectorAll('span, div, strong'))
      .find(el => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        // text có ký tự tiền tệ hoặc mẫu số tiền
        return /₫|VND|vnđ|\d{1,3}(?:[.,]\d{3}){1,3}/.test(t);
      });
  }
  if (priceNode) {
    const raw = (priceNode.textContent || '').replace(/\s+/g, ' ').trim();
    // Lấy số lớn nhất trong chuỗi (thường là giá hiện tại)
    const matches = raw.match(/\d{1,3}(?:[.,]\d{3}){1,3}/g);
    if (matches && matches.length) {
      // Ưu tiên số có giá trị lớn nhất để tránh giá gạch
      const toNumber = (s) => Number(s.replace(/[.,]/g, ''));
      const best = matches.reduce((a, b) => (toNumber(b) > toNumber(a) ? b : a));
      price = best;
    } else {
      // Nếu không parse được, dùng nguyên văn
      price = raw;
    }
  } else {
    console.warn('[Shopee] Không tìm thấy giá sản phẩm');
  }

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
  
  // Mô tả sản phẩm (product description)
  let description = '';
  
  // Strategy 1: Tìm theo class chính xác từ HTML thực
  const descriptionDiv = document.querySelector('.e8lZp3');
  if (descriptionDiv) {
    // Lấy tất cả text từ các p tags
    const paragraphs = descriptionDiv.querySelectorAll('.QN2lPu');
    description = Array.from(paragraphs)
      .map(p => p.textContent.trim())
      .filter(text => text.length > 0)
      .join('\n');
    console.log('[Shopee] Mô tả sản phẩm (by class):', description.substring(0, 200) + '...');
  }
  
  // Strategy 2: Tìm section có heading "MÔ TẢ SẢN PHẨM"
  if (!description) {
    const sections = document.querySelectorAll('section.I_DV_3');
    for (const section of sections) {
      const heading = section.querySelector('h2.WjNdTR');
      if (heading && heading.textContent.includes('MÔ TẢ SẢN PHẨM')) {
        const contentDiv = section.querySelector('.Gf4Ro0 > div');
        if (contentDiv) {
          description = contentDiv.textContent.trim();
          console.log('[Shopee] Mô tả sản phẩm (by heading):', description.substring(0, 200) + '...');
          break;
        }
      }
    }
  }
  
  // Strategy 3: Fallback - tìm bằng text content
  if (!description) {
    const allElements = Array.from(document.querySelectorAll('*'));
    for (const el of allElements) {
      if (el.textContent && el.textContent.includes('MÔ TẢ SẢN PHẨM')) {
        const nextDiv = el.nextElementSibling;
        if (nextDiv && nextDiv.tagName === 'DIV') {
          description = nextDiv.textContent.trim();
          console.log('[Shopee] Mô tả (fallback):', description.substring(0, 200) + '...');
          break;
        }
      }
    }
  }
  
  // Số lượng đã bán (sold count) - Tìm theo text content thay vì class
  let soldCount = 0;
  
  // Strategy 1: Tìm tất cả elements có text "Đã bán"
  const allElements = Array.from(document.querySelectorAll('*'));
  let soldElement = null;
  
  for (const el of allElements) {
    const text = el.textContent || '';
    // Tìm element có text "Đã bán" nhưng không có child elements (leaf node)
    if (text.includes('Đã bán') && el.children.length === 0) {
      // Tìm số gần nhất sau text "Đã bán"
      const parent = el.parentElement;
      if (parent) {
        // Tìm trong siblings hoặc children của parent
        const spans = parent.querySelectorAll('span');
        for (const span of spans) {
          const spanText = span.textContent || '';
          // Check if contains number
          if (/^\d+([,.]?\d+)*k?$/i.test(spanText.trim())) {
            soldElement = span;
            break;
          }
        }
      }
      if (soldElement) break;
    }
  }
  
  // Strategy 2: Regex search cho pattern "Đã bán {number}"
  if (!soldElement) {
    const bodyText = document.body.innerText || '';
    const soldMatch = bodyText.match(/Đã bán\s+(\d+(?:[,.]?\d+)*k?)/i);
    if (soldMatch && soldMatch[1]) {
      const soldText = soldMatch[1];
      // Find element containing this exact text
      for (const el of allElements) {
        if (el.textContent?.trim() === soldText && el.children.length === 0) {
          soldElement = el;
          break;
        }
      }
    }
  }
  
  // Strategy 3: Fallback to class-based selectors
  if (!soldElement) {
    soldElement = document.querySelector('.aleSBU .AcmPRb') 
      || document.querySelector('.flex.mnzVGI .aleSBU span')
      || document.querySelector('[class*="sold"] span');
  }
    
  if (soldElement) {
    const soldText = soldElement.textContent.trim();
    // Parse số từ text (có thể format như "71", "1,2k", "1.2k", "1.234")
    if (soldText.match(/k$/i)) {
      // Convert "1.2k" or "1,2k" to 1200
      soldCount = Math.round(parseFloat(soldText.replace(/,/g, '.').replace(/k$/i, '')) * 1000);
    } else {
      // Normal number "71" or "1,234" or "1.234"
      soldCount = parseInt(soldText.replace(/[^\d]/g, '') || '0');
    }
    console.log('[Shopee] Đã bán:', soldCount, 'từ element:', soldElement);
  } else {
    console.warn('[Shopee] Không tìm thấy số lượng đã bán - page structure may have changed');
  }

  // Product details: stock and shipFrom
  try {
    const rows = Array.from(document.querySelectorAll('section div, .product-detail div'));
    rows.forEach((el) => {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) return;
      if (/^Kho(\s|$)/i.test(t)) {
        const val = (el.nextElementSibling ? el.nextElementSibling.textContent : t).replace(/[^0-9]/g, '');
        const n = Number(val);
        if (n) stock = n;
      }
      if (/^Gửi từ/i.test(t)) {
        const val = (el.nextElementSibling ? el.nextElementSibling.textContent : '').trim();
        if (val) shipFrom = val;
      }
    });
  } catch {}

  // --- SELLER INFO ---
  let sellerName = '';
  let sellerLink = '';
  let sellerAvatar = '';
  let sellerReviewCount = '';
  let sellerFollowerCount = '';
  let sellerResponseRate = '';
  let sellerResponseTime = '';
  let sellerJoinSince = '';
  let sellerProductCount = '';

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

  // Tổng số đánh giá shop + các chỉ số khác
  let reviewCountNode = null;
  // KHÔNG dùng :contains, phải quét thủ công
  const reviewBlocks = document.querySelectorAll('section.page-product__shop .YnZi6x');
  for (const block of reviewBlocks) {
    const label = block.querySelector('label.ffHYws');
    if (label && label.textContent.includes('Đánh giá')) {
      reviewCountNode = label.nextElementSibling;
      break;
    }
    const text = (block.textContent || '').trim();
    const valueNode = block.querySelector('.Cs6w3G');
    if (/Tỉ\s*Lệ\s*Phản\s*Hồi/i.test(text) && valueNode) sellerResponseRate = valueNode.textContent.trim();
    if (/Thời\s*Gian\s*Phản\s*Hồi/i.test(text) && valueNode) sellerResponseTime = valueNode.textContent.trim();
    if (/Tham\s*Gia/i.test(text) && valueNode) sellerJoinSince = valueNode.textContent.trim();
    if (/Sản\s*Phẩm/i.test(text) && valueNode) sellerProductCount = valueNode.textContent.trim();
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
    productName,
    description,
    price,
    priceVND: parsePriceVNDFromText(price),
    productUrl,
    productId,
    categories,
    brand,
    shipFrom,
    stock,
    soldCount,
    sellerName,
    sellerLink,
    sellerAvatar,
    sellerReviewCount,
    sellerFollowerCount,
    sellerResponseRate,
    sellerResponseTime,
    sellerJoinSince,
    sellerProductCount
  };
}



// Hàm scrape review Shopee đang hiển thị trên DOM, gắn thêm info sản phẩm & seller
function scrapeShopeeVisibleReviews() {
  const productInfo = getShopeeProductAndSellerInfo();

  // Check if this is a livestream page
  const isLivestream = window.location.pathname.includes('Livestream') || document.querySelector('[class*="live-stream"], [class*="livestream"]');
  
  // Logging từng bước selector - thêm selectors cho livestream
  const ratingOld = document.querySelectorAll('.shopee-product-rating');
  const ratingNew = document.querySelectorAll('.product-rating-item, .rG6jF7');
  const livestreamReviews = document.querySelectorAll('[class*="comment"], [class*="review-item"], [class*="rating-item"]');
  const divWithMain = Array.from(document.querySelectorAll('div')).filter(div => div.querySelector('.shopee-product-rating__main'));
  
  console.log(`[Shopee] Page type: ${isLivestream ? 'Livestream' : 'Regular'}`);
  console.log(`[Shopee] .shopee-product-rating: ${ratingOld.length}, .product-rating-item/.rG6jF7: ${ratingNew.length}, livestream reviews: ${livestreamReviews.length}, div có .shopee-product-rating__main: ${divWithMain.length}`);

  // 1. Ưu tiên selector cũ
  let reviewNodes = Array.from(ratingOld);

  // 2. Nếu không có, fallback sang selector mới
  if (reviewNodes.length === 0) {
    reviewNodes = Array.from(ratingNew);
    if (reviewNodes.length === 0) {
      // Try livestream selectors if on livestream page
      if (isLivestream && livestreamReviews.length > 0) {
        reviewNodes = Array.from(livestreamReviews);
      } else {
        reviewNodes = divWithMain;
      }
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
    // Avatar - expand selectors for livestream
    let avatar = '';
    const avatarImg = rating.querySelector('.shopee-product-rating__avatar img, .shopee-avatar__img, [class*="avatar"] img, img[class*="user"]');
    if (avatarImg) avatar = avatarImg.src || '';

    // Username - expand selectors for livestream
    let username = '';
    const usernameNode = rating.querySelector('.shopee-product-rating__author-name') 
      || rating.querySelector('.shopee-product-rating__main .shopee-product-rating__author-name') 
      || rating.querySelector('.shopee-product-rating__main > div > div')
      || rating.querySelector('[class*="username"], [class*="author"], [class*="user-name"]');
    if (usernameNode) username = usernameNode.textContent.trim();

    // Star
    let starRate = 0;
    const starNodes = rating.querySelectorAll('.shopee-product-rating__rating svg.icon-rating-solid--active, .shopee-product-rating__main .shopee-product-rating__rating svg.icon-rating-solid--active');
    if (starNodes) starRate = starNodes.length;

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

    // Extract variant (phân loại hàng) từ timeType nếu có
    let reviewVariant = '';
    if (timeType && timeType.includes('Phân loại hàng:')) {
      // Ví dụ: "2025-02-10 11:34 | Phân loại hàng: Titan Sa Mạc"
      const match = timeType.match(/Phân loại hàng:\s*([^|]+)/);
      if (match) reviewVariant = match[1].trim();
    }

    // Chuẩn hóa criteria
    const criteria = {};
    try {
      const lines = (content || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
      lines.forEach((ln) => {
        const idx = ln.indexOf(':');
        if (idx <= 0) return;
        const key = ln.slice(0, idx).toLowerCase();
        const val = ln.slice(idx + 1).trim();
        if (key.includes('chất lượng sản phẩm')) criteria.quality = val;
        else if (key.includes('tính năng nổi bật')) criteria.features = val;
        else if (key.includes('đúng với mô tả')) criteria.matchesDescription = val;
        else if (key.startsWith('sản phẩm')) criteria.productTags = val.split(/,\s*/).filter(Boolean);
      });
    } catch {}

    const comment = content;
    return {
      avatar, username, starRate, timeType, comment, images, videos, likes,
      // Backward compatible
      starCount: starRate,
      content: comment,
      reviewVariant,
      criteria,
      product: productInfo
    };
  }).filter(review => {
    // Filter out invalid/noise data
    // A valid review should have at least username or content
    const hasValidContent = review.username || review.content;
    const isNotPageNoise = !review.content?.includes('<!DOCTYPE') && !review.content?.includes('<html');
    
    return hasValidContent && isNotPageNoise;
  });
}

// Enrich existing reviews array with product variants and variantPrice
async function enrichReviewsWithVariants(reviews) {
  if (!Array.isArray(reviews) || reviews.length === 0) return reviews;
  try {
    const apiInfo = await fetchShopeeProductViaAPI();
    if (!apiInfo || !Array.isArray(apiInfo.variants) || apiInfo.variants.length === 0) return reviews;
    const nameToPrice = new Map();
    apiInfo.variants.forEach(v => {
      const key = (v.name || '').toLowerCase();
      if (key) nameToPrice.set(key, v.price || v.priceMin || '');
    });
    return reviews.map(r => {
      const vName = (r.reviewVariant || '').toLowerCase();
      const variantPrice = vName && nameToPrice.has(vName) ? nameToPrice.get(vName) : (r.variantPrice || '');
      return {
        ...r,
        variantPrice,
        product: {
          ...(r.product || {}),
          priceRange: (r.product && r.product.priceRange) || apiInfo.priceRange || (r.product && r.product.price) || '',
          variants: apiInfo.variants
        }
      };
    });
  } catch {
    return reviews;
  }
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
    } else if (window.location.host.includes('shopee.vn')) {
      // Inject sniffer to capture network-driven review loads
      injectShopeeSniffer();
      // Force load ratings in one-page by scrolling and attempting to click any visible "Đánh giá" section trigger
      triggerShopeeRatingsLoad();
      // Fallback: dùng page API bridge khi DOM không có review
      fetchShopeeReviewsViaPageApi(5).then((apiReviews) => {
        const push = (arr) => arr && arr.length > 0 && chrome.runtime.sendMessage({ type: 'shopee-reviews-found', data: arr, url: window.location.href, timestamp: new Date().toISOString() });
        if (apiReviews && apiReviews.length > 0) {
          push(apiReviews);
        } else {
          fetchShopeeDirectFromContentScript(5).then(push);
        }
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
    // Hiển thị Rate Score trên Shopee PDP (sau tiêu đề rating/sales)
    if (window.location.host.includes('shopee.vn')) {
      try { renderRateScoreBadge(); } catch(_) {}
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
    if (window.location.host.includes('shopee.vn')) {
      injectShopeeSniffer();
    }
    initPassiveCrawler();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

console.log('🚀 Passive crawler initialized');

// Listen ratings sniffed from page and forward to background immediately
window.addEventListener('message', (e) => {
  try {
    const m = e && e.data;
    if (!m) return;
    // Trigger direct v2 fetch from content script
    if (m.type === 'EXT_REQUEST_DIRECT_V2') {
      fetchShopeeDirectFromContentScript(5).then((arr) => {
        if (arr && arr.length) {
          chrome.runtime.sendMessage({
            type: 'shopee-reviews-found',
            data: arr,
            url: window.location.href,
            timestamp: new Date().toISOString()
          });
        }
      });
      return;
    }
    // Sniffer bulk stream
    if (m.type === 'EXT_SHOPEE_RATINGS_SNIFFED') {
      const productInfo = getShopeeProductAndSellerInfo();
      const reviews = Array.isArray(m.ratings) ? m.ratings.map(r => mapShopeeApiRatingToReview(r, productInfo)).filter(Boolean) : [];
      if (reviews.length > 0) {
        chrome.runtime.sendMessage({
          type: 'shopee-reviews-found',
          data: reviews,
          url: window.location.href,
          timestamp: new Date().toISOString()
        });
      }
      return;
    }
    // Bridge chunked flow (from EXT_REQUEST_SHOPEE_RATINGS[_URL])
    if (m.type === 'EXT_SHOPEE_RATINGS_CHUNK') {
      window.__rateChunk = window.__rateChunk || [];
      const productInfo = getShopeeProductAndSellerInfo();
      const reviews = Array.isArray(m.ratings) ? m.ratings.map(r => mapShopeeApiRatingToReview(r, productInfo)).filter(Boolean) : [];
      if (reviews.length) {
        window.__rateChunk.push(...reviews);
      }
      return;
    }
    if (m.type === 'EXT_SHOPEE_RATINGS_DONE') {
      const chunk = Array.isArray(window.__rateChunk) ? window.__rateChunk : [];
      if (chunk.length) {
        chrome.runtime.sendMessage({
          type: 'shopee-reviews-found',
          data: chunk,
          url: window.location.href,
          timestamp: new Date().toISOString()
        });
        window.__rateChunk = [];
      }
      return;
    }
  } catch (_) {}
}, false);

// Render Rate Score badge near rating line (after sales count)
async function renderRateScoreBadge() {
  try {
    // Tìm vùng chứa "Đã bán" để chèn Rate Score badge
    const soldSection = document.querySelector('.flex.asFzUa .flex.mnzVGI .aleSBU');
    if (!soldSection) {
      console.log('🔍 Không tìm thấy vùng "Đã bán"');
      return;
    }

    // Kiểm tra xem đã có badge chưa
    if (document.querySelector('.rate-score-badge')) {
      return;
    }

    // Lấy điểm từ background script
    const productUrl = window.location.href;
    chrome.runtime.sendMessage({ type: 'get_rate_score', url: productUrl }, (response) => {
      if (response && response.score !== undefined) {
        const score = response.score;
        const count = response.count || 0;
        
        // Tính màu sắc theo thang điểm (0-10)
        let backgroundColor, textColor, borderColor;
        if (score >= 8.5) {
          // Xanh lá đậm cho điểm cao
          backgroundColor = '#10b981';
          textColor = '#ffffff';
          borderColor = '#059669';
        } else if (score >= 7.0) {
          // Xanh lá nhạt cho điểm trung bình cao
          backgroundColor = '#34d399';
          textColor = '#ffffff';
          borderColor = '#10b981';
        } else if (score >= 5.5) {
          // Vàng cho điểm trung bình
          backgroundColor = '#fbbf24';
          textColor = '#1f2937';
          borderColor = '#f59e0b';
        } else if (score >= 4.0) {
          // Cam cho điểm thấp
          backgroundColor = '#fb923c';
          textColor = '#ffffff';
          borderColor = '#ea580c';
        } else {
          // Đỏ cho điểm rất thấp
          backgroundColor = '#ef4444';
          textColor = '#ffffff';
          borderColor = '#dc2626';
        }

        // Tạo badge
        const badge = document.createElement('div');
        badge.className = 'rate-score-badge';
        badge.style.cssText = `
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          margin-left: 12px;
          background-color: ${backgroundColor};
          color: ${textColor};
          border: 1px solid ${borderColor};
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          line-height: 1;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        `;

        // Tạo icon sao nhỏ
        const starIcon = document.createElement('span');
        starIcon.innerHTML = '⭐';
        starIcon.style.fontSize = '10px';

        // Tạo text
        const scoreText = document.createElement('span');
        scoreText.textContent = `Rate Score: ${score}`;
        scoreText.style.fontWeight = '600';

        // Tạo count trong ngoặc
        const countText = document.createElement('span');
        countText.textContent = `(${count})`;
        countText.style.fontWeight = '400';
        countText.style.opacity = '0.9';

        // Ghép các phần tử
        badge.appendChild(starIcon);
        badge.appendChild(scoreText);
        badge.appendChild(countText);

        // Chèn vào sau vùng "Đã bán"
        soldSection.parentNode.insertBefore(badge, soldSection.nextSibling);

        console.log('✅ Đã render Rate Score badge:', { score, count, color: backgroundColor });
      }
    });
  } catch (error) {
    console.error('❌ Lỗi render Rate Score badge:', error);
  }
}
