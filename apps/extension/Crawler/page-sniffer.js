(() => {
  if (window.__rateShopeeSnifferInstalled) return;
  window.__rateShopeeSnifferInstalled = true;
  try { console.log('[RateSniffer] Installed'); } catch {}
  const isRatingUrl = (u) => { try { return /get_ratings|get_rating_list|rating|review/.test(String(u)); } catch { return false; } };
  const isPdpUrl = (u) => { try { return /pdp\/get_pc|item\/get/.test(String(u)); } catch { return false; } };

  const pickRatings = (obj) => {
    try {
      if (!obj || typeof obj !== 'object') return [];
      const direct = (obj.data && (obj.data.ratings || obj.data.list)) || obj.ratings || obj.list;
      if (Array.isArray(direct)) return direct;
      const gql = obj.data && obj.data.data && (obj.data.data.item?.ratings || obj.data.data.ratings || obj.data.data.list);
      if (Array.isArray(gql)) return gql;
    } catch {}
    return [];
  };

  const postRatings = (data) => {
    try {
      const ratings = pickRatings(data);
      if (Array.isArray(ratings) && ratings.length > 0) {
        window.postMessage({ type: 'EXT_SHOPEE_RATINGS_SNIFFED', ratings }, '*');
      }
    } catch {}
  };

  const postPdpData = (data) => {
    try {
      const item = data?.data?.item || data?.data;
      if (!item || !item.item_id) return;
      const product = {
        itemId: String(item.item_id),
        shopId: String(item.shop_id),
        title: item.title || '',
        priceMin: (item.price_min || item.price || 0) / 100000,
        priceMax: (item.price_max || item.price || 0) / 100000,
        priceBeforeDiscount: (item.price_before_discount || 0) / 100000,
        currency: item.currency || 'VND',
        historicalSold: item.historical_sold || 0,
        stock: item.stock || 0,
        ratingStar: item.item_rating?.rating_star || 0,
        ratingCount: item.item_rating?.rating_count ? item.item_rating.rating_count[0] : 0,
        images: Array.isArray(item.images) ? item.images.map(img => img.startsWith('http') ? img : `https://down-vn.img.susercontent.com/file/${img}`) : [],
        models: (item.models || []).map(m => ({
          modelId: String(m.model_id),
          name: m.name,
          price: (m.price || 0) / 100000,
          stock: m.stock || 0
        })),
        attributes: (item.attributes || []).map(a => ({
          name: a.name,
          value: a.value
        })),
        description: item.description || '',
        shop: {
          shopId: String(data?.data?.shop_detailed?.shopid || item.shop_id),
          name: data?.data?.shop_detailed?.name || '',
          isMall: Boolean(data?.data?.shop_detailed?.is_shopee_verified || data?.data?.shop_detailed?.is_official_shop),
          ratingStar: data?.data?.shop_detailed?.rating_star || 0,
          followerCount: data?.data?.shop_detailed?.follower_count || 0
        },
        url: window.location.href,
        timestamp: new Date().toISOString()
      };
      console.log('[RateSniffer] ✅ Sniffed Shopee PDP:', product.title);
      window.postMessage({ type: 'EXT_SHOPEE_PDP_SNIFFED', product }, '*');
    } catch (e) {
      console.error('[RateSniffer] PDP Parse error:', e);
    }
  };

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = (args && args[0] && (args[0].url || args[0])) || '';
      if (isRatingUrl(url)) {
        const clone = res.clone();
        clone.json().then(postRatings).catch(() => {});
      } else if (isPdpUrl(url)) {
        const clone = res.clone();
        clone.json().then(postPdpData).catch(() => {});
      }
    } catch {}
    return res;
  };

  const OrigXHR = window.XMLHttpRequest;
  function WrappedXHR() {
    const xhr = new OrigXHR();
    let _url = '';
    const origOpen = xhr.open;
    xhr.open = function(method, url) { _url = url; return origOpen.apply(xhr, arguments); };
    xhr.addEventListener('load', function() {
      try {
        if (isRatingUrl(_url)) {
          try { postRatings(JSON.parse(xhr.responseText)); } catch {}
        } else if (isPdpUrl(_url)) {
          try { postPdpData(JSON.parse(xhr.responseText)); } catch {}
        }
      } catch {}
    });
    return xhr;
  }
  WrappedXHR.UNSENT = OrigXHR.UNSENT; WrappedXHR.OPENED = OrigXHR.OPENED; WrappedXHR.HEADERS_RECEIVED = OrigXHR.HEADERS_RECEIVED; WrappedXHR.LOADING = OrigXHR.LOADING; WrappedXHR.DONE = OrigXHR.DONE;
  window.XMLHttpRequest = WrappedXHR;
})();


