# System Patterns - Rate-Extension

## Coding Patterns

### Selector Fallback Pattern
```javascript
// Primary selector first, then fallbacks
let reviewNodes = document.querySelectorAll('.primary-selector');
if (reviewNodes.length === 0) {
  reviewNodes = document.querySelectorAll('.fallback-selector-1, .fallback-selector-2');
}
if (reviewNodes.length === 0) {
  // Check shadow DOM
  const shadowElements = checkShadowDOM(selectors);
  reviewNodes = shadowElements;
}
```

### Safe Text Extraction Pattern
```javascript
// Always trim and provide default
const text = (element?.textContent || '').trim();
```

### Platform Detection Pattern
```javascript
const url = window.location.href;
const isShopee = url.includes('shopee.');
const isLazada = url.includes('lazada.');
```

## Architecture Patterns

### Message Passing Pattern
```javascript
// Content script → Background → Popup
chrome.runtime.sendMessage({ 
  type: 'extract-result', 
  data: reviews 
});
```

### Enriched Data Pattern
Each review includes full context:
- Review-specific data (content, rating, media)
- Product context (name, price, categories)
- Seller context (name, ratings, followers)

## Testing Patterns

### Console Logging for Debugging
```javascript
console.log(`[Platform] Selector results: primary=${primary.length}, fallback=${fallback.length}`);
```

### Graceful Failure Pattern
```javascript
try {
  // Extraction logic
} catch (error) {
  console.warn('[Platform] Extraction failed:', error);
  return []; // Return empty array, not null/undefined
}
```

## DOM Patterns

### Shadow DOM Traversal
```javascript
function findInShadowDOM(selector) {
  const allElements = Array.from(document.querySelectorAll('*'));
  for (const el of allElements) {
    if (el.shadowRoot) {
      const found = el.shadowRoot.querySelectorAll(selector);
      if (found.length > 0) return Array.from(found);
    }
  }
  return [];
}
```

### Multi-line Content Extraction
```javascript
// Preserve line breaks from multiple div elements
const contentDivs = element.querySelectorAll('div');
const content = Array.from(contentDivs)
  .map(div => div.textContent.trim())
  .filter(text => text.length > 0)
  .join('\n');
```

## Export Patterns

### JSON Structure Standard
```javascript
{
  timestamp: new Date().toISOString(),
  platform: 'shopee',
  url: window.location.href,
  reviews: [...],
  metadata: {
    extractionVersion: '1.0',
    reviewCount: reviews.length
  }
}
```

---
*Last updated: 2025-06-07*
