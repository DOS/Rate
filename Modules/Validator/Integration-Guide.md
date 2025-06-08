# Redis Stream Integration Guide

## Overview
Guide để tích hợp Rate-Importer (crawler) với Rate-Validator (validator) qua Redis Stream.

## Architecture
```
Rate-Importer → Redis Stream → Rate-Validator → PostgreSQL
```

## Data Format Standard

### Redis Stream Message Format
```json
{
  "name": "Nguyen Van A",
  "phone": "0123456789", 
  "bank_account": "12345678901",
  "email": "example@email.com",
  "source": "checkscam_scrape",
  "batch_id": "checkscam_2025_06_08_001",
  "scraped_at": "2025-06-08T09:30:00Z",
  "metadata": {
    "url": "https://checkscam.com/page/123",
    "scraper_version": "1.0.0"
  }
}
```

## Rate-Importer Integration

### 1. Install Redis Dependency
```bash
pip install redis>=5.0.0
```

### 2. Redis Stream Publisher Code
```python
import redis
import json
from datetime import datetime

class ValidationStreamPublisher:
    def __init__(self, redis_url="redis://localhost:6379"):
        self.redis_client = redis.Redis.from_url(redis_url)
        self.stream_name = "validation_requests"
    
    def publish_scraped_data(self, scraped_items, source="checkscam_scrape"):
        """
        Publish scraped data to validation stream
        
        Args:
            scraped_items: List of scraped data dictionaries
            source: Source identifier for tracking
        """
        batch_id = f"{source}_{datetime.now().strftime('%Y_%m_%d_%H%M%S')}"
        
        for item in scraped_items:
            message = {
                "name": item.get("name", ""),
                "phone": item.get("phone", ""),
                "bank_account": item.get("bank_account", ""),
                "email": item.get("email", ""),
                "source": source,
                "batch_id": batch_id,
                "scraped_at": datetime.utcnow().isoformat() + "Z",
                "metadata": {
                    "url": item.get("url", ""),
                    "scraper_version": "1.0.0"
                }
            }
            
            # Send to Redis Stream
            message_id = self.redis_client.xadd(self.stream_name, message)
            print(f"Published: {item.get('name', 'Unknown')} -> {message_id}")
        
        return batch_id

# Usage Example
publisher = ValidationStreamPublisher()

# Sample scraped data
scraped_data = [
    {
        "name": "Nguyen Van A",
        "phone": "0123456789",
        "bank_account": "12345678901",
        "email": "test@example.com",
        "url": "https://checkscam.com/page/123"
    }
]

batch_id = publisher.publish_scraped_data(scraped_data)
print(f"Published batch: {batch_id}")
```

## Connection Configuration

### Redis Connection Settings
- **Host**: `localhost` (or Docker container name)
- **Port**: `6379`
- **Stream**: `validation_requests`
- **No authentication** (local development)

### Production Settings
```python
# For production with authentication
REDIS_URL = "redis://username:password@redis-host:6379"
```

## Integration Steps

### Step 1: Add to Rate-Importer
1. Copy the `ValidationStreamPublisher` class
2. Import vào scraper script
3. Sau khi scrape xong, call `publish_scraped_data()`

### Step 2: Test Integration
```python
# Test script để verify connection
import redis

client = redis.Redis(host='localhost', port=6379)
client.ping()  # Should return True
print("Redis connection OK")
```

### Step 3: Monitor Processing
- Rate-Validator sẽ tự động consume messages
- Check database `raw_items` table để verify
- Monitor với `redis_stream_monitor.py`

## Error Handling

### Publisher Side (Rate-Importer)
```python
try:
    batch_id = publisher.publish_scraped_data(scraped_data)
    print(f"✅ Published batch: {batch_id}")
except redis.RedisError as e:
    print(f"❌ Redis error: {e}")
    # Fallback: save to file for later retry
except Exception as e:
    print(f"❌ Unexpected error: {e}")
```

### Consumer Side (Rate-Validator)
- Automatic retry với consumer groups
- Error logging trong PostgreSQL
- Health checks và monitoring

## Monitoring & Debugging

### Check Stream Status
```bash
# Redis CLI commands
redis-cli XINFO STREAM validation_requests
redis-cli XINFO GROUPS validation_requests
```

### Check Processing Results
```sql
-- PostgreSQL queries
SELECT source, validation_state, COUNT(*) 
FROM raw_items 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY source, validation_state;
```

## Performance Considerations

### Batch Size
- Recommended: 100-1000 items per batch
- Large batches: Split into smaller chunks

### Rate Limiting
```python
import time

# Add delay between batches if needed
time.sleep(0.1)  # 100ms delay
```

## Security Notes

### Data Sanitization
- Validate data trước khi publish
- Remove sensitive information
- Escape special characters

### Network Security
- Use Redis AUTH trong production
- SSL/TLS cho remote connections
- Firewall rules cho Redis port

## Next Steps

1. **Implement** publisher trong Rate-Importer
2. **Test** với small batch
3. **Monitor** processing results
4. **Scale** theo needs

## Support

- Redis Stream documentation: https://redis.io/docs/data-types/streams/
- Rate-Validator logs: Check container logs
- Database monitoring: Use provided SQL queries
