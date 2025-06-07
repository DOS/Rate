// Scripts/shopee-review-api-demo.js
// Crawl review Shopee bằng API nội bộ của web Shopee (KHÔNG phải Open Platform API)
const axios = require('axios');

// Ví dụ URL sản phẩm Shopee
const productUrl = process.argv[2] || 'https://shopee.vn/%C4%90i%E1%BB%87n-tho%E1%BA%A1i-Apple-iPhone-16-Pro-Max-256GB-i.88201679.29560903606';

// Extract itemid và shopid từ URL Shopee
function extractIds(url) {
  const match = url.match(/-i\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return { shopid: match[1], itemid: match[2] };
}

const ids = extractIds(productUrl);
if (!ids) {
  console.error('❌ Không lấy được itemid/shopid từ URL Shopee');
  process.exit(1);
}

async function main() {
  const apiUrl = `https://shopee.vn/api/v2/item/get_ratings?itemid=${ids.itemid}&shopid=${ids.shopid}&limit=6&offset=0&type=0`;
  try {
    const resp = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': productUrl
      }
    });
    if (resp.data && resp.data.data && resp.data.data.ratings) {
      console.log('✅ Lấy được', resp.data.data.ratings.length, 'review đầu tiên:');
      resp.data.data.ratings.forEach((r, i) => {
        console.log(`--- Review #${i+1} ---`);
        console.log('User:', r.author_username);
        console.log('Rating:', r.rating_star);
        console.log('Comment:', r.comment);
        console.log('Time:', new Date(r.ctime * 1000).toLocaleString());
        console.log('---');
      });
    } else {
      console.log('❌ Không có dữ liệu review');
    }
  } catch (e) {
    console.error('❌ Lỗi khi gọi API:', e.message);
  }
}

main();
