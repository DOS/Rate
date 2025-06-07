---
trigger: always_on
---

# Rate-Extension Workspace Rules

## Project Context
Rate-Extension is a Chrome extension for extracting and crawling reviews from e-commerce platforms (Shopee, Lazada, TikTok Shop).

## Architecture Overview
- **Manifest V3** Chrome Extension
- **Content Scripts**: DOM scraping with defensive selectors and shadow DOM support
- **Background Service Worker**: Message handling and tab management
- **Popup UI**: Manual trigger interface for review extraction
- **Export**: JSON format with enriched product and seller data

## Development Standards

### Code Organization
- Use modular functions for each platform (scrapeShopeeVisibleReviews, scrapeLazadaReviews, etc.)
- Defensive programming with fallback selectors for DOM changes
- Comprehensive logging with platform-specific prefixes ([Shopee], [Lazada], etc.)
- Handle shadow DOM and iframe cases gracefully

### Naming Conventions
- **Files**: kebab-case (content-script.js, background.js, popup.js)
- **Functions**: camelCase (getShopeeProductAndSellerInfo, extractScamData)
- **Variables**: camelCase with descriptive names
- **Documentation**: Pascal-Case for folders and files (Docs/, Progress.md)
- **CSS Classes**: kebab-case
- **Constants**: UPPER_SNAKE_CASE

### Review Data Structure
Each review must include:
```javascript
{
  avatar: string,
  username: string,
  starCount: number,
  timeType: string, // includes timestamp and possibly variant info
  content: string, // multi-line support
  images: array,
  videos: array,
  likes: string,
  reviewVariant: string, // extracted from "Phân loại hàng: ..."
  product: {
    productName, price, productUrl, productId,
    categories, brand,
    sellerName, sellerLink, sellerAvatar, 
    sellerReviewCount, sellerFollowerCount
  }
}
```

### Platform-Specific Rules

#### Shopee
- Primary selectors: `.shopee-product-rating`, `.product-rating-item`, `.rG6jF7`
- Check shadow DOM if no reviews found in regular DOM
- Extract reviewVariant from timeType field
- Price selectors with multiple fallbacks

#### Lazada
- Primary selectors: `.mod-reviews`, `.review-item`
- Handle lazy loading and pagination
- Extract seller info from sidebar

#### TikTok Shop
- Primary selectors: `.review-list`, `.review-item-container`
- Handle dynamic content loading
- Extract video reviews properly

### Error Handling
- Always use try-catch blocks in scraping functions
- Log selector match counts for debugging
- Provide meaningful console warnings when data not found
- Return empty arrays/objects rather than throwing errors

### Git Workflow
- Commit messages must follow commitlint convention
- Use `--no-verify` if pre-commit hooks fail
- Format: `feat(module): description` or `fix(module): description`

### Testing & Debugging
- Test on actual product pages with reviews
- Verify all fields are correctly extracted
- Check console logs for selector match info
- Export and validate JSON structure

### Performance Considerations
- Limit DOM queries by caching selectors
- Use querySelector over getElementsBy* when possible
- Avoid repeated shadow DOM scans
- Process only visible reviews, not entire page

### Security & Privacy
- No external API calls without user consent
- No data storage beyond export
- Respect user privacy - don't track or log personal data
- Only extract publicly visible review data

### Future Enhancements
- Auto-pagination support
- Bulk export across multiple products
- Review sentiment analysis
- Duplicate review detection
- Export format options (CSV, Excel)

## Common Issues & Solutions

### Selector Not Found
1. Check if platform changed DOM structure
2. Add new fallback selectors
3. Check shadow DOM
4. Log all attempted selectors

### Export Data Incomplete
1. Verify all fields have fallback extractors
2. Check console for extraction warnings
3. Ensure product/seller info loads before reviews

### Performance Issues
1. Limit review count per extraction
2. Implement pagination
3. Optimize selector queries

## Memory Bank Integration
- Track selector updates in decisionLog.md
- Document new platform patterns in systemPatterns.md
- Update progress.md with extraction milestones

## Quick Commands
- `npm test` - Run tests
- `npm run build` - Build extension
- `npm run watch` - Development mode
- Export reviews: Click extension icon → Export JSON

---
*Last updated: 2025-06-07*
*Extension version: Rate Crawler 1.0*
