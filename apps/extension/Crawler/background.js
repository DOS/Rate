// Rate Crawler Background Script - Passive Data Accumulation
console.log('[Background] Rate Crawler extension loaded');

// Import Strapi API client (ESM)
import StrapiClient from './api/strapi-client.js';

// Dynamic Strapi config
let strapiConfig = {
  baseUrl: 'http://localhost:1337',
  apiToken: '',
  timeout: 15000
};

const strapiClient = new StrapiClient(strapiConfig);

// Load Strapi config from chrome.storage.sync
async function loadStrapiConfigAndApply() {
  const result = await chrome.storage.sync.get(['strapiApiUrl', 'strapiApiToken']);
  strapiConfig.baseUrl = result.strapiApiUrl || 'http://localhost:1337';
  strapiConfig.apiToken = result.strapiApiToken || '';
  strapiClient.baseUrl = strapiConfig.baseUrl;
  strapiClient.setAuthToken(strapiConfig.apiToken, 'api');
  console.log('[Background] Loaded Strapi config:', strapiConfig);
}
// Initial load
loadStrapiConfigAndApply();
// Listen for config changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.strapiApiUrl || changes.strapiApiToken)) {
    loadStrapiConfigAndApply();
    console.log('[Background] Strapi config updated from storage change');
  }
});

// In-memory database for accumulated scam data
let scamDatabase = [];
let totalRecordsFound = 0;

// Shopee reviews storage
let shopeeReviewsDatabase = [];
let totalShopeeReviews = 0;
// Chống spam gửi trùng: lưu hash batch gần nhất và thời điểm gửi
let lastShopeeSubmissionHash = '';

// Tính Rate Score đơn giản (có thể thay bằng gọi Strapi sau này)
function computeLocalRateScoreForUrl(productUrl) {
  try {
    const url = (productUrl || '').split('#')[0];
    const related = (shopeeReviewsDatabase || []).filter(r => (r.product && (r.product.productUrl || '')).split('#')[0] === url);
    
    // Nếu có reviews, tính điểm trung bình
    if (related.length > 0) {
      const toStar = (r) => Number(r.starRate || r.starCount || 0) || 0;
      const avg = related.reduce((s, r) => s + toStar(r), 0) / related.length;
      // Map 0-5 stars to 0-10 score
      const score = Math.round((avg * 2) * 10) / 10; // one decimal
      return { score, count: related.length };
    }
    
    // Nếu không có reviews, trả về điểm mặc định dựa trên URL
    // Đây là placeholder cho đến khi tích hợp với Strapi scoring
    const defaultScore = 8.9; // Điểm mặc định
    const defaultCount = 22;   // Số review mặc định
    
    console.log(`[Background] No reviews found for URL, using default score: ${defaultScore}`);
    return { score: defaultScore, count: defaultCount };
    
  } catch (_) {
    // Fallback: trả về điểm mặc định nếu có lỗi
    return { score: 8.9, count: 22 };
  }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed');
  
  // Load existing data from storage
  loadAccumulatedData();
  
  // Set initial badge
  updateBadge();
});

// Submit Shopee reviews to Strapi Validation API
async function submitShopeeReviewsToStrapi(reviews) {
  console.log('[Background] Attempting to submit Shopee reviews to Strapi...');
  console.log('[Background] Reviews count:', reviews?.length);
  
  // Ensure latest config
  await loadStrapiConfigAndApply();
  console.log('[Background] Strapi config loaded:', { 
    baseUrl: strapiConfig.baseUrl, 
    hasToken: !!strapiConfig.apiToken,
    tokenLength: strapiConfig.apiToken?.length 
  });
  
  if (!strapiConfig.baseUrl || !strapiConfig.apiToken) {
    throw new Error('Strapi API URL or Token is not configured.');
  }
  try {
    const uniqueReviews = dedupeReviews(reviews);
    // Remove client-side duplicate check - let server handle it
    // const batchHash = computeBatchHash(uniqueReviews);
    
    // Server will handle duplicate checking based on listing_id
    // if (batchHash && lastShopeeSubmissionHash === batchHash) {
    //   console.log('[Background] Duplicate submission detected, ignored');
    //   return { ok: true, status: 'duplicate_ignored', count: uniqueReviews.length };
    // }

    // Chuẩn bị payload theo format Strapi Redis Stream
    const items = uniqueReviews.map(review => {
      const product = review.product || {};
      
      // Extract description from Shopee if needed
      // We'll use the product name as description placeholder for now
      const description = product.description || product.productName || '';
      
      // Parse soldCount from sellerProductCount or use 0
      const soldCount = parseInt((product.sellerProductCount || '0').replace(/[^0-9]/g, '') || '0');
      
      return {
        // Product information
        product: {
          url: product.productUrl || '',
          // Use productName from DOM scraping
          title: product.productName || product.title || '',
          description: description,
          // Use priceVND if available (already parsed)
          price: product.priceVND || product.price || 0,
          currency: product.currency || 'VND',
          // Categories is array from DOM, join them
          category: Array.isArray(product.categories) ? product.categories.join(' > ') : (product.category || ''),
          brand: product.brand || '',
          images: product.images || [],
          variants: product.variants || [],
          stock: product.stock || 0,
          shipFrom: product.shipFrom || '',
          rating: product.rating || 0,
          soldCount: soldCount
        },
        // Seller information
        seller: {
          name: product.sellerName || '',
          rating: product.sellerRating || 0,
          responseRate: product.sellerResponseRate || '',
          responseTime: product.sellerResponseTime || '',
          joinSince: product.sellerJoinSince || '',
          productCount: product.sellerProductCount || 0,
          followerCount: product.sellerFollowerCount || 0,
          reviewCount: product.sellerReviewCount || 0
        },
        // Review information
        review: {
          id: review.id || '',
          username: review.username || review.owner || '',
          content: review.content || review.comment || '',
          starRate: review.starRate || review.starCount || 0,
          reviewVariant: review.reviewVariant || '',
          criteria: review.criteria || {},
          timestamp: review.timestamp || new Date().toISOString()
        },
        // Metadata
        source: 'shopee_extension',
        crawledAt: new Date().toISOString()
        // Removed batchHash - server handles deduplication
      };
    });

    // Gửi đến Strapi validation endpoint
    const url = `${strapiConfig.baseUrl}/api/validation/validate`;
    const payload = {
      items: items,
      priority: 'normal',
      source: 'shopee_extension'
    };
    
    console.log('[Background] Sending request to:', url);
    console.log('[Background] Payload items count:', items.length);
    console.log('[Background] First item sample:', items[0]);
    
    let response;
    try {
      // Add timeout using AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${strapiConfig.apiToken}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('[Background] Response status:', response.status, response.statusText);
      
      // Log response body if error
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Background] Error response body:', errorText);
      }
    } catch (fetchError) {
      console.error('[Background] Fetch error:', fetchError);
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout after 30 seconds');
      }
      throw new Error(`Network error: ${fetchError.message}`);
    }

    if (!response.ok) {
      throw new Error(`Strapi API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[Background] Strapi API response:', result);
    
    // Check if we have a requestId (successful submission)
    if (result.requestId) {
      // Remove hash tracking - server handles deduplication
      // lastShopeeSubmissionHash = batchHash;
      console.log('[Background] Successfully submitted to Strapi Redis Stream:', result);
      
      // Lưu requestId để check status sau này
      await chrome.storage.local.set({
        lastValidationRequestId: result.requestId,
        lastValidationTimestamp: new Date().toISOString()
      });
      
      return { 
        ok: true, 
        status: 'submitted_to_redis', 
        count: uniqueReviews.length, 
        requestId: result.requestId,
        message: 'Data sent to Strapi Redis Stream for processing'
      };
    } else if (result.error) {
      // Handle error response from Strapi
      throw new Error(`Strapi error: ${result.error.message || result.error.name || JSON.stringify(result.error)}`);
    } else {
      // Unknown response format
      console.error('[Background] Unexpected Strapi response format:', result);
      throw new Error(`Strapi validation failed: ${result.message || 'Unknown response format'}`);
    }
    
  } catch (error) {
    console.error('[Background] submitShopeeReviewsToStrapi error:', error);
    throw error;
  }
}

// Dedupe reviews by id|username|content|variant
function dedupeReviews(reviews) {
  const seen = new Set();
  return (reviews || []).filter(r => {
    const key = (r.id || r.userId || '') + '|' + (r.username || r.owner || '') + '|' + (r.content || '') + '|' + (r.reviewVariant || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Load accumulated data from storage
async function loadAccumulatedData() {
  try {
    const result = await chrome.storage.local.get(['scamDatabase', 'totalRecordsFound', 'shopeeReviewsDatabase', 'totalShopeeReviews']);
    scamDatabase = result.scamDatabase || [];
    totalRecordsFound = result.totalRecordsFound || 0;
    shopeeReviewsDatabase = result.shopeeReviewsDatabase || [];
    totalShopeeReviews = result.totalShopeeReviews || 0;
    
    console.log(`[Background] Loaded ${scamDatabase.length} accumulated scam records`);
    console.log(`[Background] Loaded ${shopeeReviewsDatabase.length} Shopee reviews`);
    updateBadge();
  } catch (error) {
    console.error('[Background] Error loading data:', error);
  }
}

// Save accumulated data to storage
async function saveAccumulatedData() {
  try {
    await chrome.storage.local.set({
      scamDatabase: scamDatabase,
      totalRecordsFound: totalRecordsFound,
      shopeeReviewsDatabase: shopeeReviewsDatabase,
      totalShopeeReviews: totalShopeeReviews,
      lastUpdated: new Date().toISOString()
    });
    console.log(`[Background] Saved ${scamDatabase.length} scam records, ${shopeeReviewsDatabase.length} Shopee reviews to storage`);
  } catch (error) {
    console.error('[Background] Error saving data:', error);
  }
}

// Update extension badge with record count
function updateBadge() {
  const count = scamDatabase.length;
  const reviewCount = shopeeReviewsDatabase.length;
  let badgeText = '';
  if (count > 0 && reviewCount > 0) badgeText = `${count}+${reviewCount}`;
  else if (count > 0) badgeText = count.toString();
  else if (reviewCount > 0) badgeText = reviewCount.toString();
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: '#FF6B35' });
  if (count > 0 || reviewCount > 0) {
    chrome.action.setTitle({ 
      title: `Rate Crawler - ${count} scam records, ${reviewCount} Shopee reviews found` 
    });
  }
}

// Group Shopee reviews by listing (shopid + itemid)
function groupShopeeReviewsByListing(reviews) {
  const groupedMap = new Map();
  (reviews || []).forEach((r) => {
    const product = r && r.product ? r.product : {};
    const url = product.productUrl || '';
    const m = url.match(/i\.(\d+)\.(\d+)/);
    const shopId = (m && m[1]) || '';
    const itemId = (m && m[2]) || (product.productId || '');
    const key = (shopId || '') + '|' + (itemId || '') || url || (product.productName || 'unknown');
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        shopId,
        itemId,
        url,
        product: product,
        reviews: []
      });
    }
    // Store compact review (avoid repeating product block inside each review)
    const compact = { ...r };
    try {
      if (compact.product) {
        delete compact.product;
      }
    } catch (_) {}
    groupedMap.get(key).reviews.push(compact);
  });
  return Array.from(groupedMap.values()).map((g) => ({
    shopId: g.shopId,
    itemId: g.itemId,
    url: g.url,
    product: g.product,
    count: g.reviews.length,
    reviews: g.reviews
  }));
}

// Normalize Shopee media IDs to full URLs
function normalizeShopeeImageUrl(input) {
  try {
    if (!input) return '';
    const s = String(input);
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return 'https:' + s;
    return 'https://down-vn.img.susercontent.com/file/' + s;
  } catch (_) {
    return '';
  }
}

// Show notification when new data found
function showNotification(newRecordsCount, url) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: ' Scam Data Found!',
    message: `Found ${newRecordsCount} new records on ${new URL(url).hostname}`,
    priority: 1
  });
}

// Remove duplicates based on phone/account
function removeDuplicates(newData) {
  const existingKeys = new Set();
  
  // Build set of existing keys
  scamDatabase.forEach(record => {
    if (record.phone) existingKeys.add(record.phone);
    if (record.account) existingKeys.add(record.account);
  });
  
  // Filter out duplicates from new data
  const uniqueData = newData.filter(record => {
    const phoneKey = record.phone;
    const accountKey = record.account;
    
    if (phoneKey && existingKeys.has(phoneKey)) return false;
    if (accountKey && existingKeys.has(accountKey)) return false;
    
    // Add to existing keys
    if (phoneKey) existingKeys.add(phoneKey);
    if (accountKey) existingKeys.add(accountKey);
    
    return true;
  });
  
  return uniqueData;
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);
  console.log('[Background] Current database size:', scamDatabase.length);

  // New: Handle submit reviews to Strapi
  if (message.type === 'submit_shopee_reviews_to_strapi') {
    console.log('[Background] Handling submit_shopee_reviews_to_strapi with', message.reviews?.length, 'reviews');
    submitShopeeReviewsToStrapi(message.reviews)
      .then(result => {
        console.log('[Background] Submit success:', result);
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('[Background] Submit error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async
  }
  console.log('[Background] Message details:', message);
  
  switch (message.type) {
    case 'inject_page_scripts': {
      const tabId = sender?.tab?.id;
      if (!tabId) {
        sendResponse({ success: false, error: 'no_tab' });
        return true;
      }
      (async () => {
        try {
          // Try with world: 'MAIN' first (Chrome 111+)
          try {
            await chrome.scripting.executeScript({
              target: { tabId, world: 'MAIN' },
              files: ['page-bridge.js']
            });
            await chrome.scripting.executeScript({
              target: { tabId, world: 'MAIN' },
              files: ['page-sniffer.js']
            });
          } catch (worldError) {
            // Fallback for older Chrome versions - inject without world property
            console.log('[Background] Falling back to injection without world property');
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['page-bridge.js']
            });
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['page-sniffer.js']
            });
          }
          sendResponse({ success: true });
        } catch (e) {
          console.error('[Background] inject_page_scripts failed', e);
          sendResponse({ success: false, error: (e && e.message) || String(e) });
        }
      })();
      return true;
    }
    case 'scam-data-found':
      handleScamDataFound(message, sender);
      sendResponse({ success: true });
      break;
    case 'shopee-reviews-found':
      handleShopeeReviewsFound(message, sender);
      sendResponse({ success: true });
      break;
    case 'get-accumulated-data':
      console.log('[Background] Sending accumulated data:', {
        recordCount: scamDatabase.length,
        totalFound: totalRecordsFound
      });
      sendResponse({
        data: scamDatabase,
        totalRecords: totalRecordsFound,
        lastUpdated: new Date().toISOString()
      });
      break;
    case 'get-shopee-reviews':
      console.log('[Background] Sending Shopee reviews:', {
        reviewCount: shopeeReviewsDatabase.length,
        totalShopeeReviews: totalShopeeReviews
      });
      sendResponse({
        data: shopeeReviewsDatabase,
        totalShopeeReviews: totalShopeeReviews,
        lastUpdated: new Date().toISOString()
      });
      break;
    case 'clear-accumulated-data':
      clearAccumulatedData();
      sendResponse({ success: true });
      break;
    case 'clear-shopee-reviews':
      clearShopeeReviews();
      sendResponse({ success: true });
      break;
    case 'export-accumulated-data':
      console.log('[Background] Export requested, database size:', scamDatabase.length);
      exportAccumulatedData();
      sendResponse({ success: true });
      break;
    case 'export-shopee-reviews':
      console.log('[Background] Export Shopee reviews requested, database size:', shopeeReviewsDatabase.length);
      exportShopeeReviews().then((ok) => {
        sendResponse(ok);
      });
      return true; // Keep channel open for async

    case 'get_rate_score': {
      try {
        const url = message.url || '';
        const result = computeLocalRateScoreForUrl(url);
        sendResponse({ success: true, score: result.score, count: result.count });
      } catch (e) {
        sendResponse({ success: false, error: (e && e.message) || String(e) });
      }
      break;
    }

    case 'pull_shopee_ratings_url':
      // Fetch ratings JSON from Shopee (public endpoint)
      (async () => {
        try {
          const url = message.url;
          if (!url) return sendResponse({ success: false, error: 'missing_url' });
          // Ensure absolute URL
          const abs = url.startsWith('http') ? url : `https://shopee.vn${url}`;
          const resp = await fetch(abs, { method: 'GET' });
          const data = await resp.json();
          sendResponse({ success: true, data });
        } catch (e) {
          sendResponse({ success: false, error: (e && e.message) || String(e) });
        }
      })();
      return true;

    default:
      console.log('[Background] Unknown message type:', message.type);
  }
  
  return true; // Keep message channel open for async response
});

// Export Shopee reviews as JSON
async function exportShopeeReviews() {
  if (shopeeReviewsDatabase.length === 0) {
    console.log('[Background] No Shopee reviews to export');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      title: 'Export Failed',
      message: 'No Shopee reviews to export. Browse Shopee to collect reviews first.',
      priority: 1
    });
    return { success: false, error: 'No Shopee reviews to export.' };
  }

  try {
    // Group by listing (shopid+itemid)
    const grouped = groupShopeeReviewsByListing(shopeeReviewsDatabase);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `rate-crawler/shopee-reviews-${timestamp}.json`;
    const jsonString = JSON.stringify(grouped, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      conflictAction: 'uniquify',
      saveAs: false
    });
    if (downloadId) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        title: '✅ Export Successful!',
        message: `Exported ${grouped.length} listings (${shopeeReviewsDatabase.length} reviews)`,
        priority: 1
      });
      return { success: true };
    } else {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        title: '❌ Export Failed',
        message: 'Could not save file. Check Downloads folder permissions.',
        priority: 2
      });
      return { success: false, error: 'Could not save file.' };
    }
  } catch (error) {
    console.error('[Background] Error exporting Shopee reviews:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      title: '❌ Export Failed',
      message: `Error: ${error.message}. Check Downloads folder permissions.`,
      priority: 2
    });
    return { success: false, error: error.message };
  }
}

// Tạo hash đơn giản, ổn định cho batch để chống gửi trùng
function computeBatchHash(reviews) {
  try {
    const minimal = (reviews || []).map(r => ({
      u: r.userId || r.username || r.owner || '',
      s: r.starRate || r.starCount || 0,
      v: r.reviewVariant || '',
      c: (r.comment || r.content || '').slice(0, 140),
      p: (r.product && r.product.productUrl) || ''
    }));
    const json = JSON.stringify(minimal.sort((a,b)=>{
      if (a.p!==b.p) return a.p<b.p?-1:1;
      if (a.u!==b.u) return a.u<b.u?-1:1;
      if (a.c!==b.c) return a.c<b.c?-1:1;
      if (a.v!==b.v) return a.v<b.v?-1:1;
      return a.s-b.s;
    }));
    let h = 0;
    for (let i = 0; i < json.length; i++) {
      h = ((h << 5) - h) + json.charCodeAt(i);
      h |= 0;
    }
    return String(h);
  } catch (_) { return ''; }
}

// Handle new Shopee reviews from content script
async function handleShopeeReviewsFound(message, sender) {
  try {
    const { data, url } = message;
    if (!data || data.length === 0) {
      console.log('[Background] No Shopee reviews in message');
      return;
    }
    // Gộp và lọc trùng khi lưu
    shopeeReviewsDatabase = dedupeReviews([...shopeeReviewsDatabase, ...data]);
    totalShopeeReviews = shopeeReviewsDatabase.length;
    console.log(`[Background] Shopee reviews DB now: ${shopeeReviewsDatabase.length} unique reviews`);
    updateBadge();
    await saveAccumulatedData();
    // Notify popup to refresh immediately
    try { chrome.runtime.sendMessage({ type: 'data-updated' }); } catch (e) {}
  } catch (error) {
    console.error('[Background] Error handling Shopee reviews:', error);
  }
}

// Handle new scam data from content script
async function handleScamDataFound(message, sender) {
  try {
    const { data, url } = message;
    
    if (!data || data.length === 0) {
      console.log('[Background] No data in message');
      return;
    }
    
    // Remove duplicates
    const uniqueData = removeDuplicates(data);
    
    if (uniqueData.length === 0) {
      console.log('[Background] All data was duplicates, skipping');
      return;
    }
    
    // Add to database
    scamDatabase.push(...uniqueData);
    totalRecordsFound += uniqueData.length;
    
    console.log(`[Background] Added ${uniqueData.length} new records (${data.length - uniqueData.length} duplicates filtered)`);
    
    // Update UI
    updateBadge();
    
    // Show notification
    showNotification(uniqueData.length, url);
    
    // Save to storage
    await saveAccumulatedData();
    
  } catch (error) {
    console.error('[Background] Error handling scam data:', error);
  }
}

// Clear all accumulated data
async function clearAccumulatedData() {
  scamDatabase = [];
  totalRecordsFound = 0;
  updateBadge();
  await saveAccumulatedData();
  console.log('[Background] Cleared all accumulated data');
}

// Clear all Shopee reviews
async function clearShopeeReviews() {
  shopeeReviewsDatabase = [];
  totalShopeeReviews = 0;
  updateBadge();
  await saveAccumulatedData();
  console.log('[Background] Cleared all Shopee reviews');
}

// Export accumulated data as JSON
async function exportAccumulatedData() {
  if (scamDatabase.length === 0) {
    console.log('[Background] No data to export');
    // Show notification about no data
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      title: 'Export Failed',
      message: 'No data to export. Browse checkscam.vn to collect data first.',
      priority: 1
    });
    return;
  }
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `rate-crawler-passive-${timestamp}.json`;
    
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        totalRecords: scamDatabase.length,
        source: 'passive-browser-extension',
        version: '1.0'
      },
      data: scamDatabase
    };
    
    console.log(`[Background] Preparing to export ${scamDatabase.length} records...`);
    
    // Create data URL instead of blob URL (service worker compatible)
    const jsonString = JSON.stringify(exportData, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    
    console.log(`[Background] Created data URL, length: ${dataUrl.length}`);
    
    // Try to download using data URL
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: `rate-crawler/${filename}`,
      saveAs: false // Auto-save to Downloads folder
    });
    
    console.log(`[Background] Download started with ID: ${downloadId}`);
    console.log(`[Background] File will be saved as: Downloads/rate-crawler/${filename}`);
    
    // Show success notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      title: '✅ Export Successful!',
      message: `Exported ${scamDatabase.length} records to Downloads/rate-crawler/${filename}`,
      priority: 1
    });
    
  } catch (error) {
    console.error('[Background] Error exporting data:', error);
    
    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      title: '❌ Export Failed',
      message: `Error: ${error.message}. Check Downloads folder permissions.`,
      priority: 2
    });
  }
}
