// SiteStrategyResolver: chọn giải pháp crawl ưu tiên cho từng domain
// Đọc mapping từ site_strategy.json
const fs = require('fs');
const path = require('path');

const strategyPath = path.join(__dirname, 'site_strategy.json');
let strategy = {};
try {
  strategy = JSON.parse(fs.readFileSync(strategyPath, 'utf8'));
} catch (e) {
  console.error('Không đọc được site_strategy.json:', e.message);
}

/**
 * Lấy danh sách giải pháp ưu tiên cho domain
 * @param {string} domain
 * @returns {string[]} Mảng tên giải pháp ưu tiên (vd: ["playwright", "flaresolverr"])
 */
function getStrategiesForDomain(domain) {
  return strategy[domain] || [];
}

module.exports = { getStrategiesForDomain };
