// Popup script for passive Rate Crawler
console.log('🎯 Rate Crawler popup loaded');

// === TOOLTIP LOGIC ===
document.addEventListener('DOMContentLoaded', function() {
  const helpIcon = document.getElementById('helpIcon');
  const tooltip = document.getElementById('tooltip');
  
  if (helpIcon && tooltip) {
    helpIcon.addEventListener('mouseenter', function() {
      tooltip.style.display = 'block';
      helpIcon.style.color = 'white';
    });
    
    helpIcon.addEventListener('mouseleave', function() {
      tooltip.style.display = 'none';
      helpIcon.style.color = 'rgba(255,255,255,0.8)';
    });
    
    // For mobile/touch devices
    helpIcon.addEventListener('click', function(e) {
      e.stopPropagation();
      if (tooltip.style.display === 'none' || !tooltip.style.display) {
        tooltip.style.display = 'block';
        helpIcon.style.color = 'white';
      } else {
        tooltip.style.display = 'none';
        helpIcon.style.color = 'rgba(255,255,255,0.8)';
      }
    });
    
    // Hide tooltip when clicking outside
    document.addEventListener('click', function(e) {
      if (!helpIcon.contains(e.target) && !tooltip.contains(e.target)) {
        tooltip.style.display = 'none';
        helpIcon.style.color = 'rgba(255,255,255,0.8)';
      }
    });
  }
});

// === API CONFIG LOGIC ===
const apiUrlInput = document.getElementById('apiUrl');
const apiTokenInput = document.getElementById('apiToken');
const apiConfigStatus = document.getElementById('apiConfigStatus');
const apiConfigForm = document.getElementById('apiConfigForm');

// Load config from chrome.storage
function loadApiConfig() {
  chrome.storage.sync.get(['strapiApiUrl', 'strapiApiToken'], (result) => {
    apiUrlInput.value = result.strapiApiUrl || 'http://localhost:1337';
    apiTokenInput.value = result.strapiApiToken || '';
  });
}

// Save config to chrome.storage
apiConfigForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const url = apiUrlInput.value.trim();
  const token = apiTokenInput.value.trim();
  chrome.storage.sync.set({ strapiApiUrl: url, strapiApiToken: token }, function() {
    if (chrome.runtime.lastError) {
      apiConfigStatus.textContent = '❌ Lưu thất bại!';
      apiConfigStatus.style.color = '#DC3545';
    } else {
      apiConfigStatus.textContent = '✅ Đã lưu cấu hình!';
      apiConfigStatus.style.color = '#28A745';
      setTimeout(() => { apiConfigStatus.textContent = ''; }, 1800);
    }
  });
});

// Khi mở popup, load config
if (apiUrlInput && apiTokenInput) loadApiConfig();
// === END API CONFIG LOGIC ===

// === TEST CONNECTION LOGIC ===
const testApiBtn = document.getElementById('testApiBtn');
const apiTestStatus = document.getElementById('apiTestStatus');

if (testApiBtn) {
  testApiBtn.addEventListener('click', async function() {
    apiTestStatus.textContent = '⏳ Đang kiểm tra kết nối...';
    apiTestStatus.style.color = '#FFE066';
    const url = apiUrlInput.value.trim() || 'http://localhost:1337';
    try {
      const resp = await fetch(url.replace(/\/$/, '') + '/api/validation/ping', {
        method: 'GET',
        timeout: 10000
      });
      if (resp.ok) {
        apiTestStatus.textContent = '✅ Kết nối thành công!';
        apiTestStatus.style.color = '#28A745';
      } else {
        apiTestStatus.textContent = `❌ Lỗi: ${resp.status} ${resp.statusText}`;
        apiTestStatus.style.color = '#DC3545';
      }
    } catch (e) {
      apiTestStatus.textContent = '❌ Không kết nối được tới API!';
      apiTestStatus.style.color = '#DC3545';
    }
  });
}
// === END TEST CONNECTION LOGIC ===

// DOM elements
const recordCountEl = document.getElementById('recordCount');
const lastUpdatedEl = document.getElementById('lastUpdated');
const crawlStatusEl = document.getElementById('crawlStatus');
const dataPreviewEl = document.getElementById('dataPreview');
const dataListEl = document.getElementById('dataList');
const loadingEl = document.getElementById('loading');
const exportBtn = document.getElementById('exportBtn');
const refreshBtn = document.getElementById('refreshBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const debugBtn = document.getElementById('debugBtn');
// Shopee review elements
const shopeeReviewCountEl = document.getElementById('shopeeReviewCount');
const exportShopeeBtn = document.getElementById('exportShopeeBtn');
const clearShopeeBtn = document.getElementById('clearShopeeBtn');
const shopeePreviewEl = document.getElementById('shopeePreview');
const shopeeListEl = document.getElementById('shopeeList');

// Current data
let currentData = [];
let currentShopeeReviews = [];

// Helper: detect domain type
function getCurrentTabDomain(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs && tabs.length > 0) {
      try {
        const url = new URL(tabs[0].url);
        cb(url.hostname);
      } catch {
        cb('');
      }
    } else {
      cb('');
    }
  });
}

// Initialize popup
// Chỉ hiện phần phù hợp với domain
function initPopup() {
  getCurrentTabDomain(function(domain) {
    if (domain.includes('shopee.vn')) {
      document.getElementById('shopeeSection').style.display = '';
      document.getElementById('scamSection').style.display = 'none';
      loadShopeeReviews();
    } else if (domain.includes('checkscam.vn')) {
      document.getElementById('shopeeSection').style.display = 'none';
      document.getElementById('scamSection').style.display = '';
      loadAccumulatedData();
    } else {
      document.getElementById('shopeeSection').style.display = 'none';
      document.getElementById('scamSection').style.display = 'none';
    }
    setupEventListeners(domain);
  });
}
document.addEventListener('DOMContentLoaded', initPopup);

// Setup event listeners
function setupEventListeners(domain) {
  if (domain && domain.includes('shopee.vn')) {

    exportShopeeBtn.addEventListener('click', async function() {
      // Khi export, luôn extract lại review mới nhất từ trang
      let extractedReviews = [];
      try {
        extractedReviews = await new Promise((resolve, reject) => {
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs || !tabs[0]) return resolve([]);
            chrome.tabs.sendMessage(tabs[0].id, {type: 'extract-shopee-reviews'}, function(response) {
              if (chrome.runtime.lastError) return resolve([]);
              if (response && response.data) return resolve(response.data);
              resolve([]);
            });
          });
        });
      } catch (e) { extractedReviews = []; }
      // Lọc trùng trước khi export Shopee reviews (kèm reviewVariant)
      const uniqueReviews = dedupeReviews(extractedReviews);
      // Nhóm theo listing (shopid+itemid) cho batch hiện tại
      const groupedBatch = groupByListing(uniqueReviews);

      // Thêm nút gửi Shopee review qua API (nếu có nút, hoặc gắn vào exportShopeeBtn cho demo)
      const sendShopeeBtn = document.getElementById('sendShopeeBtn');
      if (sendShopeeBtn) {
        sendShopeeBtn.addEventListener('click', function() {
          sendBatchDataToAPI(currentShopeeReviews, 'shopee');
        });
      }
      exportShopeeBtn.disabled = true;
      exportShopeeBtn.textContent = '⏳ Extracting...';
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        if (tabs && tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'extract-shopee-reviews' }, function(response) {
            if (response && response.success && response.data && response.data.length > 0) {
              // Đã extract xong, tiến hành export ngay tại popup (không qua background)
              exportShopeeBtn.textContent = '⏳ Exporting...';
              try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `shopee-reviews-${timestamp}.json`;
                const blob = new Blob([JSON.stringify(groupedBatch, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }, 100);
                exportShopeeBtn.disabled = false;
                exportShopeeBtn.textContent = '📥 Export Shopee Reviews (JSON)';
                // Hiển thị status inline thay vì alert
                const shopeeStatusEl = document.getElementById('shopeeStatus');
                if (shopeeStatusEl) {
                  shopeeStatusEl.style.display = 'block';
                  shopeeStatusEl.className = 'status active';
                  shopeeStatusEl.textContent = `✅ Đã export ${groupedBatch.length} listings (${uniqueReviews.length} reviews)`;
                  setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2000);
                }
              } catch (err) {
                exportShopeeBtn.disabled = false;
                exportShopeeBtn.textContent = '📥 Export Shopee Reviews (JSON)';
                const shopeeStatusEl = document.getElementById('shopeeStatus');
                if (shopeeStatusEl) {
                  shopeeStatusEl.style.display = 'block';
                  shopeeStatusEl.className = 'status inactive';
                  shopeeStatusEl.textContent = `❌ Export thất bại: ${err?.message || 'Không rõ'}`;
                  setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2500);
                }
              }
            } else {
              exportShopeeBtn.disabled = false;
              exportShopeeBtn.textContent = '📥 Export Shopee Reviews (JSON)';
              const shopeeStatusEl = document.getElementById('shopeeStatus');
              if (shopeeStatusEl) {
                shopeeStatusEl.style.display = 'block';
                shopeeStatusEl.className = 'status inactive';
                shopeeStatusEl.textContent = '❌ Không tìm thấy review Shopee nào trên trang này!';
                setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2500);
              }
            }
          });
        } else {
          exportShopeeBtn.disabled = false;
          exportShopeeBtn.textContent = '📥 Export Shopee Reviews (JSON)';
          const shopeeStatusEl = document.getElementById('shopeeStatus');
          if (shopeeStatusEl) {
            shopeeStatusEl.style.display = 'block';
            shopeeStatusEl.className = 'status inactive';
            shopeeStatusEl.textContent = '❌ Không thể lấy thông tin tab hiện tại!';
            setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2500);
          }
        }
      });
    });
    clearShopeeBtn.addEventListener('click', clearShopeeReviews);

    // Auto-extract fresh reviews when popup opens on Shopee
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, { type: 'extract-shopee-reviews' }, function(response) {
            if (response && response.data && Array.isArray(response.data)) {
              currentShopeeReviews = response.data;
              updateShopeeUI({ data: currentShopeeReviews, totalShopeeReviews: currentShopeeReviews.length });
            }
          });
        }
      } catch (_) {}
    })();

    // Bind send to Strapi if button exists
    const sendShopeeBtn = document.getElementById('sendShopeeBtn');
    if (sendShopeeBtn) {
      sendShopeeBtn.addEventListener('click', submitShopeeReviewsToStrapiFromPopup);
    }

    // Add debug pull button if exists
    const debugPullBtn = document.getElementById('debugPullBtn');
    if (debugPullBtn) {
      debugPullBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        // Ensure page scripts injected (avoid CSP inline)
        await chrome.runtime.sendMessage({ type: 'inject_page_scripts' });
        const m = tab.url.match(/i\.(\d+)\.(\d+)/);
        if (!m) return;
        const url = `/api/v2/item/get_ratings?filter=0&flag=1&limit=20&offset=0&type=0&exclude_filter=1&filter_size=0&fold_filter=0&relevant_reviews=false&request_source=2&shopid=${m[1]}&itemid=${m[2]}`;
        const resp = await chrome.runtime.sendMessage({ type: 'pull_shopee_ratings_url', url });
        if (resp && resp.success) {
          const productInfo = { productUrl: m.input };
          const ratings = (resp.data?.data?.ratings || resp.data?.ratings || resp.data?.data?.list || resp.data?.list) || [];
          const mapped = ratings.map(r => ({ username: r.author_username, content: r.comment, starCount: r.rating_star, product: productInfo })).filter(x => x.username || x.content);
          if (mapped.length) {
            currentShopeeReviews = dedupeReviews([...(currentShopeeReviews||[]), ...mapped]);
            updateShopeeUI({ data: currentShopeeReviews, totalShopeeReviews: currentShopeeReviews.length });
          }
        }
      });
    }
  }
  if (domain && domain.includes('checkscam.vn')) {
    exportBtn.addEventListener('click', exportData);
    // Thêm nút gửi batch data qua API (nếu có nút, hoặc gắn vào exportBtn cho demo)
    const sendBatchBtn = document.getElementById('sendBatchBtn');
    if (sendBatchBtn) {
      sendBatchBtn.addEventListener('click', function() {
        sendBatchDataToAPI(currentData, 'checkscam');
      });
    }
    refreshBtn.addEventListener('click', refreshData);
    clearBtn.addEventListener('click', clearData);
    debugBtn.addEventListener('click', debugExtract);
  }
}

// Load accumulated data from background
async function loadAccumulatedData() {
  try {
    showLoading(true);
    
    const response = await chrome.runtime.sendMessage({
      type: 'get-accumulated-data'
    });
    
    console.log('Received data:', response);
    
    if (response && response.data) {
      currentData = response.data;
      updateUI(response);
    } else {
      console.log('No data received');
      updateUI({ data: [], totalRecords: 0 });
    }
    
  } catch (error) {
    console.error('Error loading data:', error);
    showError('Failed to load data');
  } finally {
    showLoading(false);
  }
}

// Update UI with current data
function updateUI(dataResponse) {
  const { data = [], totalRecords = 0, lastUpdated } = dataResponse;
  
  // Update stats
  recordCountEl.textContent = data.length;
  
  if (lastUpdated) {
    const date = new Date(lastUpdated);
    lastUpdatedEl.textContent = date.toLocaleTimeString('vi-VN');
  } else {
    lastUpdatedEl.textContent = 'Never';
  }
  
  // Update status
  if (data.length > 0) {
    crawlStatusEl.textContent = `${data.length} records collected`;
    statusEl.textContent = `✅ ${data.length} records found - Keep browsing!`;
    statusEl.className = 'status active';
    exportBtn.disabled = false;
  } else {
    crawlStatusEl.textContent = 'Waiting for data...';
    statusEl.textContent = '⏳ Browse checkscam.vn to start collecting data';
    statusEl.className = 'status inactive';
    exportBtn.disabled = true;
  }
  
  // Update data preview
  updateDataPreview(data);
}

// Update data preview list
function updateDataPreview(data) {
  if (data.length === 0) {
    dataPreviewEl.style.display = 'none';
    return;
  }
  
  dataPreviewEl.style.display = 'block';
  
  // Show latest 5 records
  const recentData = data.slice(-5).reverse();
  
  dataListEl.innerHTML = recentData.map(record => `
    <div class="data-item">
      <div style="font-weight: 600; margin-bottom: 3px;">
        ${record.title || 'Scam Record'}
      </div>
      <div style="font-size: 11px; opacity: 0.8;">
        📱 ${record.phone || 'No phone'} | 
        🏦 ${record.bank || 'No bank'} | 
        💰 ${record.amount || 'No amount'}
      </div>
      <div style="font-size: 10px; opacity: 0.6; margin-top: 2px;">
        ${new Date(record.extractedAt).toLocaleString('vi-VN')}
      </div>
    </div>
  `).join('');
}

// Show/hide loading state
function showLoading(show) {
  loadingEl.style.display = show ? 'block' : 'none';
  exportBtn.disabled = show;
  refreshBtn.disabled = show;
  clearBtn.disabled = show;
  debugBtn.disabled = show;
}

// Show error message
function showError(message) {
  statusEl.textContent = `❌ ${message}`;
  statusEl.className = 'status inactive';
}

// Export data to JSON
async function exportData() {
  if (currentData.length === 0) {
    showError('No data to export');
    return;
  }
  try {
    showLoading(true);
    await chrome.runtime.sendMessage({ type: 'export-accumulated-data' });
    // Show success feedback
    const originalText = exportBtn.textContent;
    exportBtn.textContent = '✅ Exported!';
    exportBtn.style.background = '#28A745';
    setTimeout(() => {
      exportBtn.textContent = originalText;
      exportBtn.style.background = '#FF6B35';
    }, 2000);
    console.log('Export initiated');
  } catch (error) {
    console.error('Export error:', error);
    showError('Export failed');
  } finally {
    showLoading(false);
  }
}

// Hàm lọc trùng review dựa trên id hoặc user+content
function dedupeReviews(reviews) {
  const seen = new Set();
  return reviews.filter(r => {
    // Ưu tiên id, fallback về user+content
    const key = (r.id || '') + '|' + (r.user || r.owner || r.username || '') + '|' + (r.content || '') + '|' + (r.reviewVariant || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Group reviews by listing (shopid + itemid)
function groupByListing(reviews) {
  const map = new Map();
  (reviews || []).forEach((r) => {
    const product = r && r.product ? r.product : {};
    const url = product.productUrl || '';
    const m = url.match(/i\.(\d+)\.(\d+)/);
    const shopId = (m && m[1]) || '';
    const itemId = (m && m[2]) || (product.productId || '');
    const key = (shopId || '') + '|' + (itemId || '') || url || (product.productName || 'unknown');
    if (!map.has(key)) {
      map.set(key, {
        shopId,
        itemId,
        url,
        product,
        reviews: []
      });
    }
    // Push compact review to avoid duplicating product block per review
    const compact = { ...r };
    try {
      // Remove heavy duplicated product info inside each review (kept at group level)
      if (compact.product) {
        delete compact.product;
      }
    } catch (_) {}
    map.get(key).reviews.push(compact);
  });
  return Array.from(map.values()).map(g => ({
    shopId: g.shopId,
    itemId: g.itemId,
    url: g.url,
    product: g.product,
    count: g.reviews.length,
    reviews: g.reviews
  }));
}

// Gửi batch data qua API backend (luôn lọc trùng trước khi gửi)
async function sendBatchDataToAPI(data, source = 'checkscam') {
  if (!Array.isArray(data) || data.length === 0) {
    alert('Không có dữ liệu để gửi!');
    return;
  }
  const uniqueData = dedupeReviews(data);
  try {
    // Có thể đổi endpoint này khi backend thật sẵn sàng
    const res = await fetch('https://your-backend-domain/api/extension/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviews: uniqueData, source })
    });
    const result = await res.json();
    if (result.success) {
      alert(`✅ Đã gửi thành công ${result.validated || uniqueData.length} records!`);
    } else {
      alert(`❌ Lỗi gửi data: ${result.errors?.map(e => e.reason).join(', ') || result.error}`);
    }
  } catch (err) {
    alert('❌ Lỗi kết nối server!');
  }
}


// Refresh data from background
async function refreshData() {
  console.log('Refreshing data...');
  await loadAccumulatedData();
}

// Clear all accumulated data
async function clearData() {
  if (!confirm('Are you sure you want to clear all accumulated data? This cannot be undone.')) {
    return;
  }
  
  try {
    showLoading(true);
    
    await chrome.runtime.sendMessage({
      type: 'clear-accumulated-data'
    });
    
    // Reset UI
    currentData = [];
    updateUI({ data: [], totalRecords: 0 });
    
    // Show feedback
    statusEl.textContent = '🗑️ All data cleared';
    statusEl.className = 'status inactive';
    
    console.log('Data cleared');
    
  } catch (error) {
    console.error('Clear error:', error);
    showError('Failed to clear data');
  } finally {
    showLoading(false);
  }
}

// Debug function to manually trigger extraction on current tab
async function debugExtract() {
  try {
    console.log('🐛 Debug: Manually triggering extraction...');
    
    // Get current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      console.error('No active tab found');
      return;
    }
    
    console.log('🐛 Current tab:', tab.url);
    
    // Inject and execute content script manually
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        console.log('🐛 Manual extraction triggered on:', window.location.href);
        
        // Force re-run extraction
        if (window.initPassiveCrawler) {
          window.initPassiveCrawler();
        } else {
          console.log('🐛 initPassiveCrawler not found, running inline extraction...');
          
          // Inline extraction for debug
          const text = document.body.textContent || '';
          const phoneMatches = text.match(/(?:\+84|84|0)(?:3[2-9]|5[689]|7[06-9]|8[1-689]|9[0-46-9])[0-9]{7}/g) || [];
          
          console.log('🐛 Found phones:', phoneMatches);
          
          if (phoneMatches.length > 0) {
            const debugData = phoneMatches.slice(0, 5).map((phone, index) => ({
              id: `debug-${Date.now()}-${index}`,
              title: `Debug extraction`,
              owner: phone,
              phone: phone,
              account: '',
              bank: 'Debug',
              amount: '',
              content: `Debug extraction from ${window.location.href}`,
              url: window.location.href,
              extractedAt: new Date().toISOString(),
              source: 'debug-manual'
            }));
            
            // Send to background
            chrome.runtime.sendMessage({
              type: 'scam-data-found',
              data: debugData,
              url: window.location.href,
              timestamp: new Date().toISOString()
            });
            
            console.log('🐛 Sent debug data:', debugData);
          }
        }
      }
    });
    
    console.log('🐛 Debug extraction completed');
    
    // Refresh data after a delay
    setTimeout(() => {
      loadAccumulatedData();
    }, 2000);
    
  } catch (error) {
    console.error('🐛 Debug extraction error:', error);
  }
}

// Shopee reviews logic
async function loadShopeeReviews() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'get-shopee-reviews' });
    if (resp && resp.data) {
      currentShopeeReviews = resp.data;
      updateShopeeUI(resp);
    } else {
      currentShopeeReviews = [];
      updateShopeeUI({ data: [] });
    }
  } catch (err) {
    currentShopeeReviews = [];
    updateShopeeUI({ data: [] });
  }
}

function updateShopeeUI(resp) {
  const { data = [], totalShopeeReviews = 0, lastUpdated } = resp;
  shopeeReviewCountEl.textContent = data.length;
  exportShopeeBtn.disabled = data.length === 0;
  clearShopeeBtn.disabled = data.length === 0;
  // Preview 2 latest reviews
  if (data.length === 0) {
    shopeePreviewEl.style.display = 'none';
    shopeeListEl.innerHTML = '';
    return;
  }
  shopeePreviewEl.style.display = 'block';
  const latest = data.slice(-2).reverse();
  shopeeListEl.innerHTML = latest.map(r => `
    <div class="data-item" style="display:flex;align-items:flex-start;gap:8px;">
      <img src="${r.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'" />
      <div style="flex:1;">
        <div style="font-weight:600;font-size:13px;">${r.username || 'User'}</div>
        <div style="font-size:12px;color:#FFE066;">${'★'.repeat(r.starCount)}${'☆'.repeat(5 - r.starCount)}</div>
        <div style="font-size:12px;opacity:0.8;margin:2px 0 0 0;max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.content?.split('\n')[0] || ''}</div>
      </div>
    </div>
  `).join('');
}

async function exportShopeeReviews() {
  if (!currentShopeeReviews.length) return;
  exportShopeeBtn.disabled = true;
  exportShopeeBtn.textContent = '⏳ Exporting...';
  await chrome.runtime.sendMessage({ type: 'export-shopee-reviews' });
  exportShopeeBtn.textContent = '✅ Exported!';
  exportShopeeBtn.style.background = '#28A745';
  setTimeout(() => {
    exportShopeeBtn.textContent = '📥 Export Shopee Reviews (JSON)';
    exportShopeeBtn.style.background = '#FF6B35';
    exportShopeeBtn.disabled = false;
  }, 2000);
}

async function clearShopeeReviews() {
  if (!confirm('Clear all Shopee reviews?')) return;
  clearShopeeBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: 'clear-shopee-reviews' });
  currentShopeeReviews = [];
  updateShopeeUI({ data: [] });
  shopeeReviewCountEl.textContent = '0';
  clearShopeeBtn.disabled = false;
}

// Send Shopee reviews to Strapi from popup (delegates to background)
async function submitShopeeReviewsToStrapiFromPopup() {
  // Extract again to ensure freshness
  let extracted = await new Promise((resolve) => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs[0]) return resolve([]);
      chrome.tabs.sendMessage(tabs[0].id, {type: 'extract-shopee-reviews'}, function(response) {
        if (chrome.runtime.lastError) return resolve([]);
        if (response && response.data) return resolve(response.data);
        resolve([]);
      });
    });
  });
  if (!Array.isArray(extracted) || extracted.length === 0) {
    extracted = currentShopeeReviews || [];
  }
  const unique = dedupeReviews(extracted);
  const shopeeStatusEl = document.getElementById('shopeeStatus');
  if (!unique.length) {
    if (shopeeStatusEl) {
      shopeeStatusEl.style.display = 'block';
      shopeeStatusEl.className = 'status inactive';
      shopeeStatusEl.textContent = '❌ Không có review để gửi';
      setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2000);
    }
    return;
  }
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'submit_shopee_reviews_to_strapi', reviews: unique });
    if (resp && resp.success) {
      if (shopeeStatusEl) {
        shopeeStatusEl.style.display = 'block';
        shopeeStatusEl.className = 'status active';
        shopeeStatusEl.textContent = '✅ Đã gửi reviews lên Strapi';
        setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2000);
      }
    } else {
      if (shopeeStatusEl) {
        shopeeStatusEl.style.display = 'block';
        shopeeStatusEl.className = 'status inactive';
        shopeeStatusEl.textContent = `❌ Gửi thất bại: ${resp?.error || 'Unknown'}`;
        setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2500);
      }
    }
  } catch (e) {
    if (shopeeStatusEl) {
      shopeeStatusEl.style.display = 'block';
      shopeeStatusEl.className = 'status inactive';
      shopeeStatusEl.textContent = `❌ Lỗi: ${e?.message || 'Unknown'}`;
      setTimeout(() => { shopeeStatusEl.style.display = 'none'; }, 2500);
    }
  }
}

// Listen for real-time updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'data-updated') {
    console.log('Real-time data update received');
    loadAccumulatedData();
    loadShopeeReviews();
  }
});

// Auto-refresh every 10 seconds when popup is open
setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadAccumulatedData();
  }
}, 10000);

console.log('🚀 Popup initialized in passive mode');
