# Extension API Documentation V2 (Updated)

## Overview

Extension sử dụng StrapiClient để communicate với backend. Có 2 APIs:
- **OLD API** (deprecated): `/api/validation/validate` 
- **NEW API** (recommended): `/api/listings/create-from-shopee`

## API Client Usage

### Initialize Client
```javascript
import StrapiClient from './api/strapi-client.js';

const client = new StrapiClient({
  baseUrl: 'http://localhost:1337',
  timeout: 30000
});
```

### NEW API: Create From Shopee (Recommended)

```javascript
// Single item
const response = await client.createFromShopee({
  product: {
    productUrl: 'https://shopee.vn/...',
    title: 'Product Name',
    price: 100000,
    // ... other fields
  },
  seller: {
    shop_id: '12345',
    name: 'Shop Name'
  }
});

// Multiple items (auto-queue if > 5)
const response = await client.createFromShopee([
  { product: {...}, seller: {...} },
  { product: {...}, seller: {...} },
  // ...
], {
  source: 'extension',
  queue: 'auto' // auto, true, false
});

// Response
{
  success: true,
  queued: false, // or true if queued
  listingId: "123", // if direct processing
  jobId: "456", // if queued
  warnings: ["Price seems low"]
}
```

### OLD API: Validate (Deprecated - still works)

```javascript
// Legacy validation API
const response = await client.validate(items, {
  priority: 'normal',
  webhookUrl: null
});

// Response
{
  requestId: "req_123",
  status: "queued"
}
```

## API Endpoints

### 1. Create From Shopee (NEW)
```
POST /api/listings/create-from-shopee
Query params:
  - source: "extension" | "crawler" | "manual"
  - queue: "auto" | "true" | "false"
Body:
{
  items: [
    {
      product: {...},
      seller: {...},
      review: {...}
    }
  ]
}
```

### 2. Queue Status
```
GET /api/queue/stats
Response:
{
  waiting: 10,
  active: 2,
  completed: 100,
  failed: 3
}
```

### 3. Get Job Status
```
GET /api/queue/job/:jobId
Response:
{
  id: "456",
  status: "completed",
  result: {...}
}
```

## Processing Flow

```
Extension captures data
         ↓
    Format data
         ↓
Check item count
         ↓
< 5 items → Direct API → Immediate response
≥ 5 items → Queue API → Job ID returned
                ↓
         Poll for status
                ↓
         Get final result
```

## Error Handling

```javascript
try {
  const result = await client.createFromShopee(items);
  
  if (result.queued) {
    // Poll for result
    const finalResult = await pollForJobResult(result.jobId);
  } else {
    // Use result directly
    console.log('Created listing:', result.listingId);
  }
} catch (error) {
  if (error.message.includes('validation')) {
    // Validation errors
    console.error('Invalid data:', error);
  } else if (error.message.includes('timeout')) {
    // Timeout error
    console.error('Request timeout:', error);
  } else {
    // Other errors
    console.error('Unexpected error:', error);
  }
}
```

## Migration Guide

### From OLD to NEW API

**Before (OLD):**
```javascript
// Using validation API
const response = await client.validate(items);
const requestId = response.requestId;
// Poll for status...
```

**After (NEW):**
```javascript
// Using new direct API
const response = await client.createFromShopee(items);
if (response.success) {
  console.log('Success!', response.listingId);
}
```

## Rate Limiting

The new API includes built-in rate limiting:
- Max 100 requests per minute per IP
- Max 10 concurrent jobs per user
- Auto-queue for large batches

## Benefits of NEW API

1. **Faster Response**: Direct processing for small batches
2. **Better Validation**: Unified validation service
3. **Smart Queueing**: Auto-queue only when needed
4. **Clear Errors**: Detailed error messages
5. **Scalable**: BullMQ handles high load

## Testing

```javascript
// Test connection
const isConnected = await client.testConnection();

// Test with sample data
const testData = {
  product: {
    productUrl: 'https://shopee.vn/test',
    title: 'Test Product',
    price: 100000
  },
  seller: {
    shop_id: 'test_shop',
    name: 'Test Shop'
  }
};

const result = await client.createFromShopee(testData);
console.log('Test result:', result);
```

## Debugging

Enable debug logs:
```javascript
// In background.js or content-script.js
console.log('[Extension] Sending to API:', items);
console.log('[Extension] API Response:', response);
```

Check Strapi logs:
```bash
# View Strapi logs
yarn workspace @repo/strapi develop

# Look for:
[BullMQ] Processing job 123
[CreateFromShopee] Success! Created listing: xyz
```

## Support

- **Docs**: `/Docs/Guides/System-Architecture-Flow-V2.md`
- **Issues**: GitHub Issues
- **Logs**: Check browser console & Strapi logs