(() => {
  if (window.__rateShopeeBridgeInstalled) return;
  window.__rateShopeeBridgeInstalled = true;
  try { console.log('[RateBridge] Installed'); } catch {}
  window.addEventListener('message', async (e) => {
    try {
      const msg = e && e.data;
      if (!msg) return;
      if (msg.type === 'EXT_REQUEST_SHOPEE_RATINGS') {
        const { requestId, shopId, itemId, pages = 3, limit = 20 } = msg;
        let offset = 0;
        for (let p = 0; p < pages; p++) {
          const q = 'filter=0&flag=1&itemid=' + itemId + '&shopid=' + shopId +
                    '&limit=' + limit + '&offset=' + offset + '&type=0&exclude_filter=1&filter_size=0&fold_filter=0&relevant_reviews=false&request_source=2&tag_filter=&variation_filters=&fe_toggle=%5B2%2C3%5D&preferred_item_shop_id=' + shopId + '&preferred_item_item_id=' + itemId + '&preferred_item_include_type=1';
          const url = '/api/v2/item/get_ratings?' + q;
          try {
            const resp = await fetch(url, { credentials: 'include' });
            const data = await resp.json();
            const ratings = (data && (data.data?.ratings || data.ratings)) || [];
            window.postMessage({ type: 'EXT_SHOPEE_RATINGS_CHUNK', requestId, ratings }, '*');
            if (!Array.isArray(ratings) || ratings.length < limit) break;
            offset += limit;
          } catch (err) {
            window.postMessage({ type: 'EXT_SHOPEE_RATINGS_ERROR', requestId, error: String((err && err.message) || err) }, '*');
            break;
          }
        }
        window.postMessage({ type: 'EXT_SHOPEE_RATINGS_DONE', requestId }, '*');
      } else if (msg.type === 'EXT_REQUEST_SHOPEE_RATINGS_URL' && msg.url) {
        const { requestId, url } = msg;
        try {
          const resp = await fetch(url, { credentials: 'include' });
          const data = await resp.json();
          const ratings = (data && (data.data?.ratings || data.data?.list || data.ratings || data.list)) || [];
          window.postMessage({ type: 'EXT_SHOPEE_RATINGS_CHUNK', requestId, ratings }, '*');
        } catch (err) {
          window.postMessage({ type: 'EXT_SHOPEE_RATINGS_ERROR', requestId, error: String((err && err.message) || err) }, '*');
        } finally {
          window.postMessage({ type: 'EXT_SHOPEE_RATINGS_DONE', requestId }, '*');
        }
      }
    } catch {}
  }, false);
})();


