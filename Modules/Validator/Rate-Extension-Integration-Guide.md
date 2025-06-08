# Rate-Extension Redis Stream Integration Guide

## Overview
Guide để tích hợp Rate-Extension (browser extension) với Rate-Validator qua Redis Stream để xử lý real-time rate checking và validation.

## Architecture
```
Rate-Extension → Redis Stream → Rate-Validator → PostgreSQL → Response
```

## Use Cases

### Primary Functions
1. **Real-time Rate Checking**: User input phone/bank → instant validation
2. **Batch Processing**: Multiple entries from extension
3. **Background Sync**: Periodic data validation
4. **Cache Management**: Store validated results for quick lookup

## Data Format Standard

### Redis Stream Message Format
```json
{
  "request_id": "ext_req_1704723600_001",
  "user_id": "user_12345",
  "session_id": "session_abc123",
  "action": "rate_check",
  "data": {
    "name": "Nguyen Van A",
    "phone": "0123456789",
    "bank_account": "12345678901",
    "email": "example@email.com"
  },
  "source": "browser_extension",
  "extension_version": "1.2.0",
  "browser": "chrome",
  "timestamp": "2025-06-08T14:18:00Z",
  "priority": "high",
  "callback_stream": "extension_responses",
  "metadata": {
    "page_url": "https://example.com",
    "user_agent": "Mozilla/5.0...",
    "ip_address": "192.168.1.100"
  }
}
```

### Response Format
```json
{
  "request_id": "ext_req_1704723600_001",
  "status": "completed",
  "validation_result": {
    "overall_status": "VALID",
    "confidence_score": 0.85,
    "details": {
      "name": {"status": "VALID", "confidence": 0.9},
      "phone": {"status": "VALID", "confidence": 0.8},
      "bank_account": {"status": "VALID", "confidence": 0.9},
      "email": {"status": "VALID", "confidence": 0.7}
    },
    "risk_level": "LOW",
    "recommendations": ["Verify email domain", "Cross-check with additional sources"]
  },
  "processing_time_ms": 150,
  "timestamp": "2025-06-08T14:18:00.150Z"
}
```

## Rate-Extension Integration

### 1. Install Dependencies
```bash
# For Node.js extension
npm install redis ioredis

# For Python extension backend
pip install redis>=5.0.0 asyncio
```

### 2. Extension Redis Client
```javascript
// extension-redis-client.js
const Redis = require('ioredis');

class ExtensionRedisClient {
    constructor(redisUrl = 'redis://localhost:6379') {
        this.redis = new Redis(redisUrl);
        this.requestStream = 'validation_requests';
        this.responseStream = 'extension_responses';
        this.responseTimeout = 5000; // 5 seconds
    }

    async sendValidationRequest(userData, options = {}) {
        const requestId = `ext_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const message = {
            request_id: requestId,
            user_id: options.userId || 'anonymous',
            session_id: options.sessionId || this.generateSessionId(),
            action: 'rate_check',
            data: userData,
            source: 'browser_extension',
            extension_version: '1.2.0',
            browser: this.detectBrowser(),
            timestamp: new Date().toISOString(),
            priority: options.priority || 'high',
            callback_stream: this.responseStream,
            metadata: {
                page_url: window.location.href,
                user_agent: navigator.userAgent,
                ip_address: options.ipAddress || 'unknown'
            }
        };

        // Send to Redis Stream
        await this.redis.xadd(this.requestStream, '*', 'data', JSON.stringify(message));
        
        // Wait for response
        return this.waitForResponse(requestId);
    }

    async waitForResponse(requestId) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, this.responseTimeout);

            const checkResponse = async () => {
                try {
                    const responses = await this.redis.xread('STREAMS', this.responseStream, '$');
                    
                    for (const [stream, messages] of responses) {
                        for (const [messageId, fields] of messages) {
                            const data = JSON.parse(fields[1]); // fields[1] is the data
                            
                            if (data.request_id === requestId) {
                                clearTimeout(timeout);
                                resolve(data);
                                return;
                            }
                        }
                    }
                    
                    // Continue checking
                    setTimeout(checkResponse, 100);
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            };

            checkResponse();
        });
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    detectBrowser() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'chrome';
        if (userAgent.includes('Firefox')) return 'firefox';
        if (userAgent.includes('Safari')) return 'safari';
        if (userAgent.includes('Edge')) return 'edge';
        return 'unknown';
    }
}

// Usage Example
const client = new ExtensionRedisClient();

// Send validation request
const userData = {
    name: "Nguyen Van A",
    phone: "0123456789",
    bank_account: "12345678901",
    email: "test@example.com"
};

client.sendValidationRequest(userData, {
    userId: 'user_123',
    priority: 'high'
}).then(result => {
    console.log('Validation result:', result);
    // Update extension UI with result
}).catch(error => {
    console.error('Validation error:', error);
});
```

### 3. Python Backend Integration
```python
# extension_backend.py
import redis
import json
import asyncio
from datetime import datetime
import uuid

class ExtensionRedisClient:
    def __init__(self, redis_url="redis://localhost:6379"):
        self.redis_client = redis.Redis.from_url(redis_url)
        self.request_stream = "validation_requests"
        self.response_stream = "extension_responses"
        self.response_timeout = 5.0  # seconds
    
    async def send_validation_request(self, user_data, options=None):
        if options is None:
            options = {}
        
        request_id = f"ext_req_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:8]}"
        
        message = {
            "request_id": request_id,
            "user_id": options.get("user_id", "anonymous"),
            "session_id": options.get("session_id", self.generate_session_id()),
            "action": "rate_check",
            "data": user_data,
            "source": "browser_extension",
            "extension_version": "1.2.0",
            "browser": options.get("browser", "unknown"),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "priority": options.get("priority", "high"),
            "callback_stream": self.response_stream,
            "metadata": options.get("metadata", {})
        }
        
        # Send to Redis Stream
        message_id = self.redis_client.xadd(self.request_stream, message)
        print(f"Sent request: {request_id} -> {message_id}")
        
        # Wait for response
        return await self.wait_for_response(request_id)
    
    async def wait_for_response(self, request_id):
        start_time = datetime.now()
        
        while (datetime.now() - start_time).total_seconds() < self.response_timeout:
            try:
                # Read latest messages from response stream
                messages = self.redis_client.xread({self.response_stream: '$'}, count=10, block=100)
                
                for stream, stream_messages in messages:
                    for message_id, fields in stream_messages:
                        data = json.loads(fields[b'data'])
                        
                        if data.get('request_id') == request_id:
                            return data
                
            except Exception as e:
                print(f"Error waiting for response: {e}")
                await asyncio.sleep(0.1)
        
        raise TimeoutError(f"No response received for request {request_id}")
    
    def generate_session_id(self):
        return f"session_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:8]}"

# Usage Example
async def main():
    client = ExtensionRedisClient()
    
    user_data = {
        "name": "Nguyen Van A",
        "phone": "0123456789",
        "bank_account": "12345678901",
        "email": "test@example.com"
    }
    
    try:
        result = await client.send_validation_request(user_data, {
            "user_id": "user_123",
            "priority": "high",
            "browser": "chrome"
        })
        
        print("Validation result:", result)
        
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
```

## Rate-Validator Modifications

### 1. Enhanced Message Processing
```python
# Add to worker.py
async def process_extension_request(self, stream_entry):
    """Process extension-specific validation requests"""
    message_id, fields = stream_entry
    data = json.loads(fields[b'data'])
    
    request_id = data.get('request_id')
    callback_stream = data.get('callback_stream', 'extension_responses')
    
    try:
        # Process validation
        validation_result = await self.validate_user_data(data['data'])
        
        # Prepare response
        response = {
            "request_id": request_id,
            "status": "completed",
            "validation_result": validation_result,
            "processing_time_ms": self.calculate_processing_time(),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        # Send response back
        await self.send_response(callback_stream, response)
        
        # Acknowledge message
        await self.redis_client.xack(self.stream_name, self.consumer_group, message_id)
        
    except Exception as e:
        # Send error response
        error_response = {
            "request_id": request_id,
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        await self.send_response(callback_stream, error_response)

async def send_response(self, stream_name, response_data):
    """Send response to callback stream"""
    await self.redis_client.xadd(stream_name, {'data': json.dumps(response_data)})
```

## Stream Configuration

### Redis Streams Setup
```bash
# Create streams if not exist
redis-cli XGROUP CREATE validation_requests extension_workers $ MKSTREAM
redis-cli XGROUP CREATE extension_responses extension_consumers $ MKSTREAM
```

### Stream Names
- **Request Stream**: `validation_requests`
- **Response Stream**: `extension_responses`
- **Consumer Group**: `extension_workers`

## Performance Considerations

### Batch Processing
```javascript
// Batch multiple requests
async function batchValidation(userDataArray) {
    const promises = userDataArray.map(userData => 
        client.sendValidationRequest(userData)
    );
    
    return Promise.all(promises);
}
```

### Caching Strategy
```javascript
// Cache results for quick lookup
class ValidationCache {
    constructor(ttl = 300000) { // 5 minutes
        this.cache = new Map();
        this.ttl = ttl;
    }
    
    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }
    
    generateKey(userData) {
        return `${userData.phone}_${userData.bank_account}`;
    }
}
```

## Security Considerations

### Data Sanitization
```javascript
function sanitizeUserData(userData) {
    return {
        name: userData.name?.trim().substring(0, 100),
        phone: userData.phone?.replace(/[^0-9+]/g, ''),
        bank_account: userData.bank_account?.replace(/[^0-9]/g, ''),
        email: userData.email?.trim().toLowerCase()
    };
}
```

### Rate Limiting
```javascript
class RateLimiter {
    constructor(maxRequests = 10, windowMs = 60000) {
        this.requests = new Map();
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    
    canMakeRequest(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId) || [];
        
        // Remove old requests
        const validRequests = userRequests.filter(
            timestamp => now - timestamp < this.windowMs
        );
        
        if (validRequests.length >= this.maxRequests) {
            return false;
        }
        
        validRequests.push(now);
        this.requests.set(userId, validRequests);
        return true;
    }
}
```

## Error Handling

### Extension Side
```javascript
async function safeValidationRequest(userData) {
    try {
        const result = await client.sendValidationRequest(userData);
        return { success: true, data: result };
    } catch (error) {
        console.error('Validation failed:', error);
        return { 
            success: false, 
            error: error.message,
            fallback: 'offline_validation' 
        };
    }
}
```

### Offline Fallback
```javascript
function offlineValidation(userData) {
    // Basic client-side validation
    const result = {
        overall_status: "UNKNOWN",
        confidence_score: 0.3,
        details: {
            name: { status: userData.name ? "VALID" : "INVALID" },
            phone: { status: /^\d{10,11}$/.test(userData.phone) ? "VALID" : "INVALID" },
            bank_account: { status: /^\d{8,20}$/.test(userData.bank_account) ? "VALID" : "INVALID" },
            email: { status: /\S+@\S+\.\S+/.test(userData.email) ? "VALID" : "INVALID" }
        },
        risk_level: "UNKNOWN",
        source: "offline_validation"
    };
    
    return result;
}
```

## Monitoring & Analytics

### Extension Metrics
```javascript
class ExtensionMetrics {
    constructor() {
        this.metrics = {
            requests_sent: 0,
            responses_received: 0,
            errors: 0,
            avg_response_time: 0
        };
    }
    
    recordRequest() {
        this.metrics.requests_sent++;
    }
    
    recordResponse(responseTime) {
        this.metrics.responses_received++;
        this.metrics.avg_response_time = 
            (this.metrics.avg_response_time + responseTime) / 2;
    }
    
    recordError() {
        this.metrics.errors++;
    }
    
    getMetrics() {
        return { ...this.metrics };
    }
}
```

## Deployment

### Environment Variables
```bash
# Extension configuration
REDIS_URL=redis://localhost:6379
REQUEST_STREAM=validation_requests
RESPONSE_STREAM=extension_responses
RESPONSE_TIMEOUT=5000
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW=60000
```

### Docker Integration
```yaml
# Add to docker-compose.yml
extension-backend:
  build: ./extension-backend
  environment:
    - REDIS_URL=redis://redis:6379
  depends_on:
    - redis
    - validator-worker
```

## Testing

### Unit Tests
```javascript
// test-extension-integration.js
describe('Extension Redis Integration', () => {
    let client;
    
    beforeEach(() => {
        client = new ExtensionRedisClient('redis://localhost:6379');
    });
    
    test('should send validation request', async () => {
        const userData = {
            name: "Test User",
            phone: "0123456789",
            bank_account: "12345678901",
            email: "test@example.com"
        };
        
        const result = await client.sendValidationRequest(userData);
        
        expect(result.status).toBe('completed');
        expect(result.validation_result).toBeDefined();
    });
    
    test('should handle timeout', async () => {
        client.responseTimeout = 100; // 100ms timeout
        
        const userData = { name: "Test" };
        
        await expect(
            client.sendValidationRequest(userData)
        ).rejects.toThrow('Request timeout');
    });
});
```

## Next Steps

1. **Implement** ExtensionRedisClient trong Rate-Extension
2. **Modify** Rate-Validator để handle extension requests
3. **Test** integration với real extension
4. **Deploy** và monitor performance
5. **Optimize** based on usage patterns

## Support

- Redis Streams: https://redis.io/docs/data-types/streams/
- Extension APIs: Browser-specific documentation
- Rate-Validator: Current workspace documentation
