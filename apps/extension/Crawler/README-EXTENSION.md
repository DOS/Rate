# Rate Crawler Chrome Extension

## 🚀 Overview
Chrome Extension để crawl dữ liệu scammer từ checkscam.com với validation pipeline 2 lớp.

## ✨ Features
- **Normal Mode**: Mở tab browser để crawl (user có thể monitor)
- **Stealth Mode**: Crawl ngầm không mở tab (sử dụng fetch API)
- **Validation Pipeline**: Extension Adapter + Core Validator
- **Auto Save**: Lưu validated data vào Chrome storage và download JSON
- **Scheduled Crawling**: Tự động crawl hàng ngày
- **Pagination Support**: Crawl nhiều trang (stealth mode)

## 📁 Project Structure
```
Rate-Extension/Crawler/
├── manifest.json           # Extension manifest v3
├── background.js          # Service worker với crawl logic
├── content_script.js      # Extract data từ pages
├── popup.html/js          # Extension UI
├── extension-adapter.js   # Transform checkscam.com data
├── core-validator-v1.js   # Core validation logic
└── data-validator.js      # Legacy validator (still used)
```

## 🔧 Installation

1. **Load Extension vào Chrome:**
   - Mở Chrome và vào `chrome://extensions/`
   - Bật "Developer mode" (góc trên bên phải)
   - Click "Load unpacked"
   - Chọn folder `D:\Projects\JOY\Rate-Extension\Crawler`

2. **Test Extension:**
   - Click icon extension trên toolbar
   - Chọn "Start Normal Crawl" hoặc "Start Stealth Crawl"
   - Check console của service worker để xem logs

## 📊 Data Flow

```
checkscam.com → Content Script → Background Script
                                       ↓
                              Extension Adapter
                                       ↓
                               Core Validator
                                       ↓
                            Chrome Storage + JSON File
```

## 🎯 Usage

### Normal Crawl
- Mở tabs để crawl
- User có thể thấy progress
- Phù hợp cho debug

### Stealth Crawl
- Không mở tabs
- Sử dụng fetch API
- Support pagination
- Phù hợp cho production

### Scheduled Crawl
- Toggle trong popup UI
- Tự động chạy stealth crawl hàng ngày
- Thời gian có thể config

## 📝 Output Format

```json
{
  "metadata": {
    "crawled_at": "2025-06-05T15:30:00Z",
    "source": "checkscam.com",
    "mode": "stealth",
    "extension_version": "1.0.0",
    "stats": {
      "valid": 45,
      "invalid": 5,
      "duplicates": 3
    }
  },
  "data": [
    {
      "owner": "NGUYEN VAN A",
      "account": "1234567890",
      "bank": "Vietcombank",
      "amount": 5500000,
      "category": "Mua bán online",
      "fraudScore": 0.2,
      "phone": "0912345678",
      "_meta": {
        "source": "browser_extension",
        "validated_at": "2025-06-05T15:30:00Z"
      }
    }
  ]
}
```

## 🐛 Debugging

1. **View Service Worker logs:**
   - chrome://extensions/ → Details → Service Worker "Inspect"

2. **Check Chrome Storage:**
   - F12 → Application → Storage → Local Storage

3. **Common Issues:**
   - Nếu extension không load: Check manifest.json syntax
   - Nếu crawl fail: Check network, site có thể down
   - Nếu validation fail: Check console logs

## 🔄 Updates

### Latest (v1.0.0)
- Integrated 2-layer validation pipeline
- Added Extension Adapter for data transformation
- Core Validator với fraud scoring
- Improved duplicate detection
- Better error handling

### Planned
- Support thêm sources (checkscam.vn)
- Real-time sync với backend
- Advanced fraud detection
- Multi-language support
