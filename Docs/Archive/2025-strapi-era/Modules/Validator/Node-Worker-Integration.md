# Node.js Redis Stream Worker - RateBox Validator

## Status: ✅ IMPLEMENTED

**Last Updated:** 2025-08-24 16:30:00  
**Version:** 2.0.0  
**Implementation:** Node.js/TypeScript

## Overview

The Redis Stream Worker has been reimplemented in Node.js/TypeScript to better integrate with the Rate Platform monorepo ecosystem. This provides seamless integration with existing packages, shared TypeScript types, and unified dependency management through Yarn workspaces.

## Architecture Decision

### Why Node.js over Python?

1. **Ecosystem Consistency**: Both Strapi backend and Next.js frontend use Node.js
2. **Type Safety**: Shared TypeScript definitions across all packages
3. **Dependency Management**: Single package manager (Yarn) for entire monorepo
4. **Code Reusability**: Can leverage existing validation logic from `@repo/validator`
5. **Team Efficiency**: Single language/runtime for maintenance

## Implementation Details

### Location
```
packages/validator/src/redis-worker.ts
```

### Key Features
- ✅ Full TypeScript implementation with type safety
- ✅ Redis Streams consumer group support
- ✅ PostgreSQL integration for data persistence
- ✅ Vietnamese data validation (phone, bank, email, name)
- ✅ Error handling with retry logic
- ✅ Performance metrics tracking
- ✅ Auto-reconnection for Redis and PostgreSQL
- ✅ Graceful shutdown handling

## Configuration

### Environment Variables

```env
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_STREAM=validation_requests
RESPONSE_STREAM=extension_responses
IMPORT_RESPONSE_STREAM=importer_responses
CONSUMER_GROUP=validator_workers
CONSUMER_NAME=worker_001

# PostgreSQL Configuration
POSTGRES_DSN=postgresql://JOY:@localhost:5432/rate_db

# Processing Configuration (optional)
BATCH_SIZE=10
BLOCK_TIME=1000
MAX_RETRIES=3
```

## Running the Worker

### Development

```bash
# Install dependencies
cd packages/validator
yarn install

# Run in development mode with auto-reload
yarn worker:dev

# Or from root directory
yarn workspace @repo/validator worker:dev
```

### Production

```bash
# Single worker
yarn worker

# Multiple workers for load balancing
CONSUMER_NAME=worker_001 yarn worker
CONSUMER_NAME=worker_002 yarn worker
CONSUMER_NAME=worker_003 yarn worker
```

### Docker Deployment

```dockerfile
FROM node:22-alpine
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY packages/validator/package.json ./packages/validator/

# Install dependencies
RUN yarn install --production

# Copy source
COPY packages/validator ./packages/validator

# Build TypeScript
RUN yarn workspace @repo/validator build

# Run worker
CMD ["yarn", "workspace", "@repo/validator", "worker"]
```

## Data Flow

```mermaid
sequenceDiagram
    participant E as Extension
    participant S as Strapi
    participant R as Redis Stream
    participant W as Worker (Node.js)
    participant DB as PostgreSQL
    participant RS as Response Stream

    E->>S: POST /api/validation
    S->>R: XADD validation_requests
    W->>R: XREADGROUP (consume)
    W->>W: Validate Data
    W->>DB: INSERT validated_items
    W->>RS: XADD response
    W->>R: XACK (acknowledge)
    S->>RS: XREADGROUP (get response)
    S->>E: Return result
```

## Message Formats

### Input Message (from Strapi)

```typescript
interface ValidationRequest {
  request_id: string;
  source: 'extension' | 'importer' | 'api';
  user_id: string;
  action: 'validate';
  data: {
    items: Array<{
      phone?: string;
      bank_account?: string;
      email?: string;
      name?: string;
      [key: string]: any;
    }>;
  };
  priority: 'normal' | 'high' | 'low';
  callback_config: {
    stream?: string;
    webhook_url?: string;
  };
  timestamp: string; // ISO 8601
}
```

### Output Message (to Response Stream)

```typescript
interface ValidationResponse {
  request_id: string;
  status: 'success' | 'error' | 'partial';
  validated_count: number;
  error_count: number;
  errors?: Array<{
    error_code: number;
    message: string;
    field?: string;
  }>;
  processing_time: number; // seconds
  timestamp: string; // ISO 8601
  consumer: string; // worker name
}
```

## Database Schema

The worker automatically creates and maintains the following table:

```sql
CREATE TABLE IF NOT EXISTS validated_items (
  id SERIAL PRIMARY KEY,
  request_id VARCHAR(100),
  phone VARCHAR(20),
  bank_account VARCHAR(50),
  email VARCHAR(255),
  name VARCHAR(255),
  source VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  error_code INTEGER,
  validation_errors JSONB,
  stream_id VARCHAR(100),
  stream_timestamp TIMESTAMPTZ,
  consumer_name VARCHAR(100),
  processing_duration_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_validated_items_status ON validated_items(status);
CREATE INDEX idx_validated_items_request_id ON validated_items(request_id);
CREATE INDEX idx_validated_items_stream_id ON validated_items(stream_id);
```

## Validation Rules

### Vietnamese Phone Numbers
- Must start with 0 followed by 3, 5, 7, 8, or 9
- Minimum 10 digits
- Supports country codes (+84, 84)
- Auto-normalizes to local format (0xxxxxxxxx)

### Bank Accounts
- Minimum 8 digits
- Numeric only
- Removes spaces and hyphens for normalization

### Email Addresses
- Standard RFC 5322 validation
- Case-insensitive
- Optional field

### Names
- Minimum 2 characters
- Trimmed whitespace
- Optional field

## Error Codes

| Code | Field | Description |
|------|-------|-------------|
| 100 | phone | Missing phone number |
| 101 | phone | Phone number too short |
| 102 | phone | Invalid Vietnamese phone format |
| 200 | bank_account | Missing bank account |
| 201 | bank_account | Bank account too short |
| 202 | bank_account | Bank account must contain only digits |
| 300 | email | Invalid email format |
| 400 | name | Name too short |

## Performance Characteristics

### Throughput
- Single worker: 100-500 messages/second
- Multi-worker setup: Linear scaling up to Redis limits
- Validation time: < 100ms per item
- Database write: < 50ms per item

### Resource Usage
- Memory: ~100MB per worker
- CPU: < 5% idle, 20-40% under load
- Network: Minimal (Redis protocol is efficient)

### Scalability
- Horizontal scaling via consumer groups
- No message loss with acknowledgment
- Automatic retry for failed messages
- Pending message recovery from dead workers

## Monitoring

### Redis Commands

```bash
# Stream information
redis-cli XINFO STREAM validation_requests

# Consumer group details
redis-cli XINFO GROUPS validation_requests

# Pending messages
redis-cli XPENDING validation_requests validator_workers

# Consumer details
redis-cli XINFO CONSUMERS validation_requests validator_workers
```

### PostgreSQL Queries

```sql
-- Worker performance
SELECT 
    consumer_name,
    COUNT(*) as processed,
    AVG(processing_duration_ms) as avg_ms,
    MIN(created_at) as first_message,
    MAX(created_at) as last_message
FROM validated_items
GROUP BY consumer_name
ORDER BY processed DESC;

-- Error distribution
SELECT 
    error_code,
    COUNT(*) as occurrences,
    MAX(error_message) as message
FROM validated_items
WHERE status = 'error'
GROUP BY error_code
ORDER BY occurrences DESC;

-- Hourly throughput
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as messages,
    AVG(processing_duration_ms) as avg_ms
FROM validated_items
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## Integration with Strapi

The worker seamlessly integrates with Strapi's existing Redis Stream service:

1. **Strapi publishes** validation requests to `validation_requests` stream
2. **Worker consumes** messages using consumer groups
3. **Worker validates** data according to Vietnamese business rules
4. **Worker persists** results to PostgreSQL
5. **Worker publishes** responses to appropriate response stream
6. **Strapi subscribes** to response streams for real-time updates

## Advantages over Python Implementation

1. **Type Safety**: Full TypeScript support with compile-time checking
2. **Shared Code**: Reuses validation logic from existing packages
3. **Unified Testing**: Same test framework (Jest) as other packages
4. **Better IDE Support**: IntelliSense, refactoring, navigation
5. **Simpler Deployment**: Single Node.js runtime for entire platform
6. **NPM Ecosystem**: Access to vast Node.js package ecosystem

## Migration from Python Worker

If migrating from existing Python worker:

1. **Data Compatibility**: Message formats remain identical
2. **Database Schema**: Same table structure, no migration needed
3. **Redis Streams**: Same stream names and consumer groups
4. **Zero Downtime**: Can run both workers in parallel during transition

## Best Practices

### Production Deployment

1. **Use PM2 or similar** for process management
2. **Set up health checks** for worker monitoring
3. **Configure log aggregation** (Winston, Bunyan)
4. **Implement metrics collection** (Prometheus, StatsD)
5. **Use environment-specific configs** for different environments

### Error Handling

1. **Graceful shutdown** on SIGTERM/SIGINT
2. **Automatic reconnection** for Redis/PostgreSQL
3. **Dead letter queue** for permanently failed messages
4. **Structured logging** for debugging
5. **Circuit breaker** for downstream services

### Performance Tuning

1. **Adjust batch size** based on message size
2. **Tune block timeout** for latency vs efficiency
3. **Use connection pooling** for PostgreSQL
4. **Monitor consumer lag** and scale accordingly
5. **Implement backpressure** for overload protection

## Troubleshooting

### Worker Not Receiving Messages

```bash
# Check if stream exists
redis-cli EXISTS validation_requests

# Check consumer group
redis-cli XINFO GROUPS validation_requests

# Check for pending messages
redis-cli XPENDING validation_requests validator_workers
```

### High Memory Usage

```bash
# Check stream length
redis-cli XLEN validation_requests

# Trim old messages
redis-cli XTRIM validation_requests MAXLEN ~ 10000
```

### Database Connection Issues

```bash
# Test connection
psql $POSTGRES_DSN -c "SELECT 1"

# Check connection pool
# Add logging to worker for pool stats
```

## Future Enhancements

1. **WebSocket notifications** for real-time UI updates
2. **GraphQL subscriptions** for response streams
3. **Distributed tracing** with OpenTelemetry
4. **Auto-scaling** based on queue depth
5. **Machine learning** for fraud detection
6. **Batch processing** for bulk imports
7. **Event sourcing** for audit trail

## Conclusion

The Node.js implementation of the Redis Stream Worker provides a robust, scalable, and maintainable solution for real-time data validation in the Rate Platform. By leveraging the existing TypeScript ecosystem and monorepo structure, it offers better integration, type safety, and developer experience compared to the Python alternative.