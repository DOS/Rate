// Rate Crawler Background Script - Improved Multi-Product Storage
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

// IMPROVED: Store multiple products with deduplication
let shopeeProductsDatabase = {}; // Key: productUrl, Value: { product, reviews, lastUpdated, submitted }
let totalShopeeReviews = 0;

// Tính Rate Score đơn giản (có thể thay bằng gọi Strapi sau này)
function computeLocalRateScoreForUrl(productUrl) {
  try {
    const url = (productUrl || '').split('#')[0];
    
    // Check if we have this product
    if (shopeeProductsDatabase[url]) {
      const product = shopeeProductsDatabase[url];
      const reviews = product.reviews || [];
      
      if (reviews.length > 0) {
        const toStar = (r) => Number(r.starRate || r.starCount || 0) || 0;
        const avg = reviews.reduce((s, r) => s + toStar(r), 0) / reviews.length;
        const score = Math.round((avg * 2) * 10) / 10; // Map 0-5 stars to 0-10 score
        return { score, count: reviews.length };
      }
    }
    
    // Default score if no reviews
    return { score: 8.9, count: 22 };
    
  } catch (_) {
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
    // Prepare items from products database
    const items = [];
    const productsToSubmit = [];
    
    // Get products with new data to send
    for (const [productUrl, productData] of Object.entries(shopeeProductsDatabase)) {
      if (productData.hasNewData) {
        productsToSubmit.push(productUrl);
        
        // Get only unsubmitted reviews
        const product = productData.product || {};
        const submittedReviewIds = new Set(productData.submittedReviews || []);
        const newReviews = (productData.reviews || []).filter(r => {
          const reviewId = r.id || r.userId || (r.username + '|' + r.content);
          return !submittedReviewIds.has(reviewId);
        });
        
        // If we have new reviews, create one item per review
        if (newReviews.length > 0) {
          newReviews.forEach(review => {
            items.push({
              product: {
                url: product.productUrl || productUrl,
                title: product.productName || product.title || '',
                description: product.description || '',
                price: product.priceVND || product.price || 0,
                currency: product.currency || 'VND',
                category: Array.isArray(product.categories) ? product.categories.join(' > ') : (product.category || ''),
                brand: product.brand || '',
                images: product.images || [],
                variants: product.variants || [],
                stock: product.stock || 0,
                shipFrom: product.shipFrom || '',
                rating: product.rating || 0,
                soldCount: product.soldCount || 0,
                productReviewCount: product.productReviewCount || 0,
                likedCount: product.likedCount || 0
              },
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
              review: {
                id: review.id || '',
                username: review.username || review.owner || '',
                content: review.content || review.comment || '',
                starRate: review.starRate || review.starCount || 0,
                reviewVariant: review.reviewVariant || '',
                criteria: review.criteria || {},
                timestamp: review.timestamp || new Date().toISOString()
              },
              source: 'shopee_extension',
              crawledAt: new Date().toISOString()
            });
          });
        } else {
          // No reviews, just submit product info
          items.push({
            product: {
              url: product.productUrl || productUrl,
              title: product.productName || product.title || '',
              description: product.description || '',
              price: product.priceVND || product.price || 0,
              currency: product.currency || 'VND',
              category: Array.isArray(product.categories) ? product.categories.join(' > ') : (product.category || ''),
              brand: product.brand || '',
              images: product.images || [],
              stock: product.stock || 0,
              soldCount: product.soldCount || 0,
              rating: product.rating || 0
            },
            seller: {
              name: product.sellerName || '',
              rating: product.sellerRating || 0
            },
            source: 'shopee_extension',
            crawledAt: new Date().toISOString()
          });
        }
      }
    }
    
    if (items.length === 0) {
      console.log('[Background] No new products to submit');
      return { ok: true, status: 'no_new_products', count: 0 };
    }
    
    console.log(`[Background] Submitting ${items.length} items from ${productsToSubmit.length} products`);
    
    // Send to Strapi
    const url = `${strapiConfig.baseUrl}/api/listings/create?source=extension`;
    const payload = {
      items: items,
      priority: 'normal',
      source: 'extension'
    };
    
    console.log('[Background] Sending request to:', url);
    console.log('[Background] Payload items count:', items.length);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, {
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
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Background] Error response body:', errorText);
      throw new Error(`Strapi API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('[Background] Strapi API response:', result);
    
    // Mark reviews as submitted and clear new data flag
    if (result.success === true) {
      productsToSubmit.forEach(productUrl => {
        const productData = shopeeProductsDatabase[productUrl];
        
        // Mark all current reviews as submitted
        productData.reviews.forEach(review => {
          const reviewId = review.id || review.userId || (review.username + '|' + review.content);
          if (!productData.submittedReviews) {
            productData.submittedReviews = [];
          }
          if (!productData.submittedReviews.includes(reviewId)) {
            productData.submittedReviews.push(reviewId);
          }
        });
        
        // Clear new data flag
        productData.hasNewData = false;
      });
      await saveAccumulatedData();
      
      console.log('[Background] Successfully submitted and marked products as sent');
      
      return { 
        ok: true, 
        status: result.queued ? 'queued_for_processing' : 'processed_directly',
        count: items.length,
        products: productsToSubmit.length,
        requestId: result.requestId,
        listingId: result.listingId,
        message: result.message || 'Data successfully submitted to Strapi'
      };
    } else {
      throw new Error(`Unexpected response: ${JSON.stringify(result)}`);
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
    const result = await chrome.storage.local.get(['scamDatabase', 'totalRecordsFound', 'shopeeProductsDatabase', 'totalShopeeReviews']);
    scamDatabase = result.scamDatabase || [];
    totalRecordsFound = result.totalRecordsFound || 0;
    shopeeProductsDatabase = result.shopeeProductsDatabase || {};
    totalShopeeReviews = result.totalShopeeReviews || 0;
    
    const productCount = Object.keys(shopeeProductsDatabase).length;
    const submittedCount = Object.values(shopeeProductsDatabase).filter(p => p.submitted).length;
    
    console.log(`[Background] Loaded ${scamDatabase.length} accumulated scam records`);
    console.log(`[Background] Loaded ${productCount} Shopee products (${submittedCount} already submitted)`);
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
      shopeeProductsDatabase: shopeeProductsDatabase,
      totalShopeeReviews: totalShopeeReviews,
      lastUpdated: new Date().toISOString()
    });
    const productCount = Object.keys(shopeeProductsDatabase).length;
    console.log(`[Background] Saved ${scamDatabase.length} scam records, ${productCount} Shopee products`);
  } catch (error) {
    console.error('[Background] Error saving data:', error);
  }
}

// Update extension badge with record count
function updateBadge() {
  const count = scamDatabase.length;
  const productCount = Object.values(shopeeProductsDatabase).filter(p => p.hasNewData).length;
  
  let badgeText = '';
  if (count > 0 && productCount > 0) badgeText = `${count}+${productCount}`;
  else if (count > 0) badgeText = count.toString();
  else if (productCount > 0) badgeText = productCount.toString();
  
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: '#FF6B35' });
  
  if (count > 0 || productCount > 0) {
    chrome.action.setTitle({ 
      title: `Rate Crawler - ${count} scam records, ${productCount} unsubmitted products` 
    });
  }
}

// Handle new Shopee reviews from content script
async function handleShopeeReviewsFound(message, sender) {
  try {
    const { data, url } = message;
    if (!data || data.length === 0) {
      console.log('[Background] No Shopee reviews in message');
      return;
    }
    
    // Get product URL
    const productUrl = data[0]?.product?.productUrl;
    if (!productUrl) {
      console.log('[Background] No product URL found');
      return;
    }
    
    // Create or update product entry
    if (!shopeeProductsDatabase[productUrl]) {
      shopeeProductsDatabase[productUrl] = {
        product: data[0]?.product || {},
        reviews: [],
        submittedReviews: [], // Track which reviews were already sent
        lastUpdated: new Date().toISOString(),
        hasNewData: true // Flag to track if there's new data to send
      };
      console.log('[Background] New product added:', productUrl);
    }
    
    const productEntry = shopeeProductsDatabase[productUrl];
    
    // Update product info (might have more complete data on subsequent loads)
    productEntry.product = data[0]?.product || productEntry.product;
    
    // Dedupe and add reviews
    const existingReviewIds = new Set(productEntry.reviews.map(r => r.id || r.userId || ''));
    const existingReviewContents = new Set(productEntry.reviews.map(r => 
      (r.username || '') + '|' + (r.content || '') + '|' + (r.reviewVariant || '')
    ));
    
    const newReviews = data.filter(review => {
      const reviewId = review.id || review.userId || '';
      const reviewKey = (review.username || '') + '|' + (review.content || '') + '|' + (review.reviewVariant || '');
      
      if (reviewId && existingReviewIds.has(reviewId)) return false;
      if (existingReviewContents.has(reviewKey)) return false;
      return true;
    });
    
    if (newReviews.length > 0) {
      productEntry.reviews = [...productEntry.reviews, ...newReviews];
      productEntry.lastUpdated = new Date().toISOString();
      productEntry.hasNewData = true; // Mark as having new data to send
      console.log(`[Background] Added ${newReviews.length} reviews to ${productUrl}, marked for sending`);
    } else {
      console.log('[Background] No new reviews for product (reload/duplicate)');
    }
    
    // Update total count
    totalShopeeReviews = Object.values(shopeeProductsDatabase).reduce(
      (sum, product) => sum + product.reviews.length, 0
    );
    
    updateBadge();
    await saveAccumulatedData();
    
    // Notify popup
    try { chrome.runtime.sendMessage({ type: 'data-updated' }); } catch (e) {}
    
  } catch (error) {
    console.error('[Background] Error handling Shopee reviews:', error);
  }
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);

  // New: Handle submit reviews to Strapi
  if (message.type === 'submit_shopee_reviews_to_strapi') {
    console.log('[Background] Handling submit_shopee_reviews_to_strapi');
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
            // Fallback for older Chrome versions
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
      sendResponse({
        data: scamDatabase,
        totalRecords: totalRecordsFound,
        lastUpdated: new Date().toISOString()
      });
      break;
      
    case 'get-shopee-reviews':
      // Convert products database to flat reviews array for compatibility
      const allReviews = [];
      Object.values(shopeeProductsDatabase).forEach(productData => {
        if (productData.hasNewData) {
          // Only show new reviews that haven't been submitted
          const submittedReviewIds = new Set(productData.submittedReviews || []);
          productData.reviews.forEach(review => {
            const reviewId = review.id || review.userId || (review.username + '|' + review.content);
            if (!submittedReviewIds.has(reviewId)) {
              allReviews.push({
                ...review,
                product: productData.product
              });
            }
          });
        }
      });
      
      sendResponse({
        data: allReviews,
        totalShopeeReviews: allReviews.length,
        productsCount: Object.keys(shopeeProductsDatabase).filter(url => !shopeeProductsDatabase[url].submitted).length,
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
      exportAccumulatedData();
      sendResponse({ success: true });
      break;
      
    case 'export-shopee-reviews':
      exportShopeeReviews().then((ok) => {
        sendResponse(ok);
      });
      return true;
      
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
      // Fetch ratings JSON from Shopee
      (async () => {
        try {
          const url = message.url;
          if (!url) return sendResponse({ success: false, error: 'missing_url' });
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
  
  return true; // Keep message channel open
});

// Export Shopee reviews as JSON
async function exportShopeeReviews() {
  const unsubmittedProducts = Object.entries(shopeeProductsDatabase)
    .filter(([url, data]) => !data.submitted);
    
  if (unsubmittedProducts.length === 0) {
    console.log('[Background] No unsubmitted products to export');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Export Failed',
      message: 'No unsubmitted products to export.',
      priority: 1
    });
    return { success: false, error: 'No unsubmitted products to export.' };
  }

  try {
    const exportData = unsubmittedProducts.map(([url, data]) => ({
      productUrl: url,
      product: data.product,
      reviewCount: data.reviews.length,
      reviews: data.reviews,
      lastUpdated: data.lastUpdated
    }));
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `rate-crawler/shopee-products-${timestamp}.json`;
    const jsonString = JSON.stringify(exportData, null, 2);
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
        iconUrl: 'icon48.png',
        title: '✅ Export Successful!',
        message: `Exported ${exportData.length} products`,
        priority: 1
      });
      return { success: true };
    }
  } catch (error) {
    console.error('[Background] Error exporting:', error);
    return { success: false, error: error.message };
  }
}

// Clear all Shopee reviews
async function clearShopeeReviews() {
  // Clear products with new data
  Object.keys(shopeeProductsDatabase).forEach(url => {
    const product = shopeeProductsDatabase[url];
    if (product.hasNewData) {
      // Option 1: Delete entire product
      // delete shopeeProductsDatabase[url];
      
      // Option 2: Just mark as no new data (keep history)
      product.hasNewData = false;
      product.submittedReviews = product.reviews.map(r => 
        r.id || r.userId || (r.username + '|' + r.content)
      );
    }
  });
  
  totalShopeeReviews = Object.values(shopeeProductsDatabase).reduce(
    (sum, product) => sum + product.reviews.length, 0
  );
  
  updateBadge();
  await saveAccumulatedData();
  console.log('[Background] Cleared unsubmitted Shopee products');
}

// Clear all accumulated data
async function clearAccumulatedData() {
  scamDatabase = [];
  totalRecordsFound = 0;
  updateBadge();
  await saveAccumulatedData();
  console.log('[Background] Cleared all accumulated data');
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
    
    console.log(`[Background] Added ${uniqueData.length} new records`);
    
    // Update UI
    updateBadge();
    showNotification(uniqueData.length, url);
    
    // Save to storage
    await saveAccumulatedData();
    
  } catch (error) {
    console.error('[Background] Error handling scam data:', error);
  }
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

// Show notification when new data found
function showNotification(newRecordsCount, url) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon48.png',
    title: 'Scam Data Found!',
    message: `Found ${newRecordsCount} new records on ${new URL(url).hostname}`,
    priority: 1
  });
}

// Export accumulated data as JSON
async function exportAccumulatedData() {
  if (scamDatabase.length === 0) {
    console.log('[Background] No data to export');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: 'Export Failed',
      message: 'No data to export.',
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
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: `rate-crawler/${filename}`,
      saveAs: false
    });
    
    console.log(`[Background] Download started with ID: ${downloadId}`);
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: '✅ Export Successful!',
      message: `Exported ${scamDatabase.length} records`,
      priority: 1
    });
    
  } catch (error) {
    console.error('[Background] Error exporting data:', error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon48.png',
      title: '❌ Export Failed',
      message: `Error: ${error.message}`,
      priority: 2
    });
  }
}