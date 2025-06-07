// Rate Crawler Background Script - Passive Data Accumulation
console.log('[Background] Rate Crawler extension loaded');

// In-memory database for accumulated scam data
let scamDatabase = [];
let totalRecordsFound = 0;

// Shopee reviews storage
let shopeeReviewsDatabase = [];
let totalShopeeReviews = 0;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed');
  
  // Load existing data from storage
  loadAccumulatedData();
  
  // Set initial badge
  updateBadge();
});

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
  console.log('[Background] Message details:', message);
  
  switch (message.type) {
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `rate-crawler/shopee-reviews-${timestamp}.json`;
    const blob = new Blob([JSON.stringify(shopeeReviewsDatabase, null, 2)], { type: 'application/json' });
    let urlCreator = undefined;
    if (typeof self !== 'undefined' && self.URL && typeof self.URL.createObjectURL === 'function') {
      urlCreator = self.URL;
    } else if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      urlCreator = URL;
    }
    if (!urlCreator) {
      console.error('[Background] Không tìm thấy URL.createObjectURL ở môi trường background/service worker!');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        title: '❌ Export Failed',
        message: 'Không hỗ trợ export file: Không tìm thấy URL.createObjectURL trong môi trường background/service worker.',
        priority: 2
      });
      return { success: false, error: 'Không tìm thấy URL.createObjectURL trong môi trường background/service worker.' };
    }
    const url = urlCreator.createObjectURL(blob);
    return new Promise((resolve) => {
      chrome.downloads.download({
        url: url,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      }, (downloadId) => {
        URL.revokeObjectURL(url);
        if (downloadId) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            title: '✅ Export Successful!',
            message: `Exported ${shopeeReviewsDatabase.length} Shopee reviews to Downloads/rate-crawler/${filename}`,
            priority: 1
          });
          resolve({ success: true });
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            title: '❌ Export Failed',
            message: 'Could not save file. Check Downloads folder permissions.',
            priority: 2
          });
          resolve({ success: false, error: 'Could not save file.' });
        }
      });
    });
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

// Hàm lọc trùng review dựa trên id hoặc user+content
function dedupeReviews(reviews) {
  const seen = new Set();
  return reviews.filter(r => {
    const key = (r.id || '') + '|' + (r.user || r.owner || '') + '|' + (r.content || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
