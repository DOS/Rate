# Product Context - Rate-Extension

## Project Overview
Rate-Extension is a Chrome extension designed to extract and crawl reviews from major e-commerce platforms in Southeast Asia.

## Core Components
- **Chrome Extension (Manifest V3)**: Modern extension architecture with service workers
- **Content Scripts**: DOM scraping with defensive programming approach
- **Background Service Worker**: Message handling and tab management
- **Popup Interface**: Manual trigger for review extraction
- **Export System**: JSON format with enriched data

## Target Platforms
1. **Shopee** - Primary focus with robust selector fallbacks
2. **Lazada** - Secondary platform support
3. **TikTok Shop** - Tertiary platform support

## Key Features
- Shadow DOM support for modern web apps
- Multiple fallback selectors for resilience
- Enriched review data with product and seller info
- Review variant tracking (user-selected product variations)
- Multi-line content support with images/videos
- Defensive error handling and logging

## Technical Architecture
```
Rate-Extension/
├── Crawler/
│   ├── manifest.json (Manifest V3)
│   ├── content-script.js (DOM scraping)
│   ├── background.js (Service worker)
│   ├── popup.html/js (UI)
│   └── icons/
├── Docs/
│   └── Modules/
└── memory-bank/
```

## Data Standards
- Review structure includes: avatar, username, starCount, timeType, content, images, videos, likes, reviewVariant
- Product info: name, price, URL, ID, categories, brand
- Seller info: name, link, avatar, review count, follower count

## Development Philosophy
- Minimal user interruption
- Automatic fallback handling
- Comprehensive logging for debugging
- Future-proof selector strategies

---
*Last updated: 2025-06-07*
