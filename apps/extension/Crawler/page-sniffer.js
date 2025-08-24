(() => {
  if (window.__rateShopeeSnifferInstalled) return;
  window.__rateShopeeSnifferInstalled = true;
  try { console.log('[RateSniffer] Installed'); } catch {}
  const isRatingUrl = (u) => { try { return /get_ratings|get_rating_list|rating|review/.test(String(u)); } catch { return false; } };
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
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = (args && args[0] && (args[0].url || args[0])) || '';
      if (isRatingUrl(url)) {
        const clone = res.clone();
        clone.json().then(postRatings).catch(() => {});
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
      try { if (isRatingUrl(_url)) { try { postRatings(JSON.parse(xhr.responseText)); } catch {} } } catch {}
    });
    return xhr;
  }
  WrappedXHR.UNSENT = OrigXHR.UNSENT; WrappedXHR.OPENED = OrigXHR.OPENED; WrappedXHR.HEADERS_RECEIVED = OrigXHR.HEADERS_RECEIVED; WrappedXHR.LOADING = OrigXHR.LOADING; WrappedXHR.DONE = OrigXHR.DONE;
  window.XMLHttpRequest = WrappedXHR;
})();


