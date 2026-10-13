# Validation Module - Technical Documentation

## Current Problem Analysis

### Issue: Redis Worker Cannot Read Stream
**Date**: 2025-09-02
**Status**: CRITICAL - Blocking entire validation pipeline

### Root Cause
The `redisWorker.ts` in Strapi cannot properly read from Redis stream due to ioredis library's xReadGroup implementation differences.

### Attempted Solutions
1. **Original approach**: Used object-based parameters - FAILED
2. **Raw command syntax**: Used string parameters - FAILED  
3. **Consumer group recreation**: Deleted and recreated - FAILED

### Evidence
```javascript
// This doesn't work in ioredis
const messages = await client.xReadGroup(
  'GROUP', this.consumerGroup, this.consumerName,
  'COUNT', '10',
  'BLOCK', '5000',
  'STREAMS', 'validation_requests', '>'
);
// Always returns null or empty array
```

But direct Redis CLI works:
```bash
docker exec redis redis-cli XREADGROUP GROUP strapi-workers test COUNT 1 STREAMS validation_requests ">"
# Successfully returns message
```

## Message Structure in Redis

Current message in stream (Samsung S25 Ultra):
```json
{
  "request_id": "req_1756828704839_8obo9q",
  "source": "extension",
  "action": "validate",
  "data": {
    "items": [
      {
        "product": {
          "url": "https://shopee.vn/i.65589552.27084669548",
          "title": "[Livestream] Điện Thoại Samsung Galaxy S25 Ultra 256GB",
          "price": 33990000,
          "currency": "VND",
          "category": "Shopee > Điện Thoại & Phụ Kiện > Điện thoại > Samsung",
          "brand": "SAMSUNG"
        },
        "seller": {
          "name": "SAMSUNG OFFICIAL STORE",
          "followerCount": "581,7k",
          "reviewCount": "106,8k"
        },
        "review": {
          "username": "trunghuynh3789",
          "content": "Máy đẹp, mua shop chính hãng...",
          "starRate": 5,
          "reviewVariant": "Black"
        },
        "source": "shopee_extension",
        "crawledAt": "2025-09-02T15:58:24.487Z"
      }
      // ... 23 more reviews
    ]
  },
  "priority": "normal",
  "timestamp": "2025-09-02T15:58:24.839Z"
}
```

## Validation Logic (Intended)

### 1. Data Quality Checks
- **Completeness**: Check required fields
- **Format**: Validate data types and formats
- **Consistency**: Cross-check related fields

### 2. Scoring Algorithm
```python
def calculate_quality_score(item):
    score = 100
    
    # Product checks
    if not item['product']['title']: score -= 10
    if not item['product']['price']: score -= 15
    if not item['product']['url']: score -= 20
    
    # Review checks
    if not item['review']['content']: score -= 10
    if len(item['review']['content']) < 10: score -= 5
    
    # Seller checks
    if not item['seller']['name']: score -= 10
    
    return max(0, score)
```

### 3. Validation Results
Should create entries in `validation_results` table:
- `request_id`: Link to original request
- `item_id`: Individual item identifier
- `quality_score`: 0-100
- `validation_errors`: JSON array of issues
- `is_valid`: Boolean pass/fail

## Alternative Solutions

### Option 1: Python Validator (Recommended)
```python
# Modules/Validator/worker.py
import redis
import asyncio

async def consume_stream():
    r = redis.Redis(host='localhost', port=6379)
    while True:
        messages = r.xreadgroup(
            'strapi-workers', 
            'python-worker',
            {'validation_requests': '>'},
            count=10,
            block=5000
        )
        # Python redis library works correctly
```

### Option 2: Simple Polling
```javascript
// Use XRANGE instead of xReadGroup
const messages = await client.xrange(
  'validation_requests',
  '-',
  '+',
  'COUNT', 10
);
// Then manually track processed messages
```

### Option 3: Different Node.js Redis Client
```javascript
// Use node-redis instead of ioredis
const redis = require('redis');
const client = redis.createClient();
// node-redis has different xReadGroup syntax
```

## Impact Analysis

### Current Impact
- ❌ No validation processing
- ❌ No listings created
- ❌ Extension data stuck in queue
- ❌ 2 days of development time lost

### Business Impact
- Users cannot see validated reviews
- Scam detection not working
- Data pipeline completely blocked

## Recommendation

**IMMEDIATE ACTION**: Switch to Python Validator module
1. It already exists in codebase
2. Python redis library works correctly
3. Can be deployed independently
4. Proven to work with Redis streams

**LONG TERM**: Investigate alternative Node.js solutions
- Research ioredis xReadGroup issues
- Consider node-redis library
- Implement proper error handling