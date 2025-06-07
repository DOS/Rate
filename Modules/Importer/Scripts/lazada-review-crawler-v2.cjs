// Lazada Review Crawler V2 - Dùng endpoint getReviewList mới nhất
// Usage: node lazada-review-crawler-v2.cjs <lazada_product_url_or_itemid> [maxPages]

const axios = require('axios');

function extractItemId(input) {
  if (/^https?:\/\//.test(input)) {
    const m = input.match(/-i(\d+)-s\d+/) || input.match(/itemId=(\d+)/);
    if (m) return m[1];
    const m2 = input.match(/-(\d+)\.html/);
    if (m2) return m2[1];
  }
  if (/^\d+$/.test(input)) return input;
  return null;
}

async function crawlLazadaReviews(itemId, maxPages = 10, pageSize = 20) {
  let page = 1;
  let allReviews = [];
  let hasMore = true;
  while (hasMore && page <= maxPages) {
    const apiUrl = `https://my.lazada.vn/pdp/review/getReviewList?itemId=${itemId}&pageSize=${pageSize}&filter=0&sort=0&pageNo=${page}`;
    try {
      const resp = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Connection': 'keep-alive',
          'Referer': `https://www.lazada.vn/products/pdp-i${itemId}.html`,
        },
      });
      const data = resp.data;
      if (!data || !data.model || !Array.isArray(data.model.items) || data.model.items.length === 0) {
        console.log(`Trang ${page}: Không có review hoặc hết dữ liệu.`);
        break;
      }
      allReviews.push(...data.model.items);
      console.log(`Trang ${page}: Lấy được ${data.model.items.length} review.`);
      hasMore = data.model.hasNextPage;
      page++;
    } catch (e) {
      console.error(`Lỗi khi gọi API Lazada:`, e.message);
      break;
    }
  }
  console.log(`\nTổng số review lấy được: ${allReviews.length}`);
  allReviews.slice(0, 3).forEach((r, i) => {
    console.log(`\n--- Review #${i + 1} ---`);
    console.log(`User: ${r.authorName}`);
    console.log(`Rating: ${r.rating}`);
    console.log(`Content: ${r.reviewContent}`);
    console.log(`Date: ${r.reviewTime}`);
  });
  if (allReviews.length === 0) {
    console.log('Không lấy được review nào. Có thể itemId sai hoặc sản phẩm chưa có review.');
  }
}

// MAIN
const input = process.argv[2];
if (!input) {
  console.log('Cách dùng: node lazada-review-crawler-v2.cjs <lazada_product_url_or_itemid> [maxPages] [pageSize]');
  process.exit(1);
}
const itemId = extractItemId(input);
if (!itemId) {
  console.error('Không tìm được itemId từ URL hoặc đầu vào.');
  process.exit(2);
}
const maxPages = parseInt(process.argv[3] || '10', 10);
let pageSize = parseInt(process.argv[4] || '20', 10);
if (pageSize > 50) pageSize = 50;
crawlLazadaReviews(itemId, maxPages, pageSize);
