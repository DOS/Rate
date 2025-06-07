// Scripts/shopee-review-api-demo.cjs
// Crawl review Shopee bằng API nội bộ của web Shopee (KHÔNG phải Open Platform API)
const axios = require('axios');

// Lấy URL sản phẩm hoặc API từ argv[2]
const PRODUCT_URL = process.argv[2];
if (!PRODUCT_URL) {
  console.error('⚠️  Thiếu URL sản phẩm Shopee!');
  process.exit(1);
}

let apiUrl = '';
if (/\/api\/v2\/item\/get_ratings/.test(PRODUCT_URL) || /get_ratings\?/.test(PRODUCT_URL)) {
  // Nếu là API URL, dùng luôn
  apiUrl = PRODUCT_URL.startsWith('http') ? PRODUCT_URL : `https://shopee.vn${PRODUCT_URL}`;
} else {
  // Tự động lấy itemid, shopid từ URL Shopee
  let itemid = null, shopid = null;
  const match = PRODUCT_URL.match(/-i\.(\d+)\.(\d+)/);
  if (match) {
    shopid = match[1];
    itemid = match[2];
  } else {
    console.error('❌ Không lấy được itemid/shopid từ URL Shopee');
    process.exit(1);
  }
  apiUrl = `https://shopee.vn/api/v2/item/get_ratings?itemid=${itemid}&shopid=${shopid}&limit=6&offset=0&type=0`;
}

// Hướng dẫn: Để vượt 403, bạn cần truyền cookie Shopee thật từ trình duyệt (Chrome)
// 1. Đăng nhập Shopee trên trình duyệt, vào DevTools > Application > Cookies > shopee.vn
// 2. Copy toàn bộ giá trị cookie (dạng: SPC_EC=...; SPC_F=...; ...)
// 3. Chạy script với biến môi trường hoặc đối số dòng lệnh:
//    - Cách 1: set COOKIE="<giá trị cookie>" && node Scripts/shopee-review-api-demo.cjs <url>
async function main() {
  // Ưu tiên lấy cookie từ biến môi trường hoặc argv[3]
  const fs = require('fs');
  let cookie = process.env.COOKIE || process.argv[3] || '';
  let customHeaders = null;

  // Nếu truyền file header.txt (copy từ browser), tự động đọc và parse
  if (cookie && cookie.endsWith('.txt') && fs.existsSync(cookie)) {
    try {
      const headerLines = fs.readFileSync(cookie, 'utf8').split(/\r?\n/).filter(Boolean);
      customHeaders = {};
      for (const line of headerLines) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          let key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          // Normalize key to lowercase for safety
          key = key.toLowerCase();
          customHeaders[key] = value;
        }
      }
      // Nếu có key 'Cookie' (viết hoa), chuyển sang 'cookie' (lowercase)
      if (customHeaders['Cookie']) {
        customHeaders['cookie'] = customHeaders['Cookie'];
        delete customHeaders['Cookie'];
      }
      console.log('📥 Đã đọc toàn bộ header từ file', process.argv[3]);
      console.log('customHeaders:', customHeaders);
      console.log('customHeaders[cookie]:', customHeaders['cookie']);
      cookie = customHeaders['cookie'] || '';
    } catch (e) {
      console.error('❌ Không đọc được file header:', e.message);
      process.exit(2);
    }
  }

  // Nếu truyền tên file (cookie.json), tự động đọc file
  if (cookie && cookie.endsWith('.json') && fs.existsSync(cookie)) {
    try {
      cookie = fs.readFileSync(cookie, 'utf8');
      console.log('📥 Đã đọc cookie từ file', process.argv[3]);
    } catch (e) {
      console.error('❌ Không đọc được file cookie:', e.message);
      process.exit(2);
    }
  }

  // Nếu cookie là JSON array (Cookie-Editor export), tự động convert sang cookie string
  if (cookie.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(cookie);
      cookie = arr.map(c => `${c.name}=${c.value}`).join('; ');
      console.log('✅ Đã tự động convert cookie JSON sang chuỗi cookie string!');
    } catch (e) {
      console.error('❌ Cookie JSON không hợp lệ:', e.message);
      process.exit(2);
    }
  }

  try {
    if (customHeaders) {
      // Nếu có customHeaders (tức là dùng header.txt), chỉ gửi đúng object này
      console.log('--- HEADER gửi lên Shopee API (từ file header.txt) ---');
      console.log(customHeaders);
      console.log('---------------------------------');
      const resp = await axios.get(apiUrl, { headers: customHeaders });
      if (resp.data && resp.data.data && resp.data.data.ratings) {
        console.log('✅ Lấy được', resp.data.data.ratings.length, 'review đầu tiên:');
        console.log(resp.data.data.ratings);
      } else {
        console.log('❌ Không lấy được review hoặc dữ liệu trả về không đúng!');
      }
      return;
    }
    // Nếu không có customHeaders thì chuẩn bị headers mặc định
    let csrftoken = '';
    if (cookie) {
      const match = cookie.match(/csrftoken=([^;]+)/i);
      if (match) {
        csrftoken = match[1];
      }
    }
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
    const headersToSend = {
      'User-Agent': userAgent,
      'Accept': 'application/json',
      'Referer': PRODUCT_URL,
      'Cookie': cookie, // optional, passed from env or arg
      'x-api-source': 'pc',
      'x-requested-with': 'XMLHttpRequest',
      ...(csrftoken ? { 'x-csrftoken': csrftoken } : {})
    };
    console.log('--- HEADER gửi lên Shopee API ---');
    console.log(headersToSend);
    console.log('---------------------------------');
    const resp = await axios.get(apiUrl, { headers: headersToSend });
    if (resp.data && resp.data.data && resp.data.data.ratings) {
      console.log('✅ Lấy được', resp.data.data.ratings.length, 'review đầu tiên:');
      console.log(resp.data.data.ratings);
    } else {
      console.log('❌ Không lấy được review hoặc dữ liệu trả về không đúng!');
    }
  } catch (e) {
    console.error('❌ Lỗi khi gọi API:', e.message);
    if (e.response && e.response.data) {
      console.error('Shopee trả về:', e.response.data);
    }
    if (!cookie) {
      console.error('⚠️ Bạn cần truyền cookie Shopee thật để vượt 403! Xem hướng dẫn đầu file.');
    }
    console.log('❌ Không có dữ liệu review');
  }
}

main();
