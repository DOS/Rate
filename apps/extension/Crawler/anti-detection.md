# Anti-Detection Strategies

## 1. Rate Limiting
- Delay 1-3 giây random giữa requests
- Crawl theo batch (10-20 items/lần)
- Dùng exponential backoff khi gặp lỗi

## 2. Headers giả lập
```javascript
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  'Referer': 'https://checkscam.com/'
};
```

## 3. Cloudflare Detection
- checkscam.com hiện KHÔNG có Cloudflare
- checkscam.vn CÓ Cloudflare (cần Playwright/Puppeteer)

## 4. IP Rotation (nếu cần)
- Dùng proxy services
- VPN switching
- Residential proxies

## 5. Browser Fingerprinting
- Chrome Extension có fingerprint khác browser thường
- Có thể bị detect qua navigator.webdriver
- Solution: inject scripts để mask fingerprint
