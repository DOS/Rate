# Rate Platform - Overview

## Current Issues (2025-09-02)

### Redis Worker Problem
- **Issue**: Worker cannot read messages from Redis stream using xReadGroup
- **Root Cause**: ioredis xReadGroup syntax incompatibility
- **Messages in Queue**: 1 validation request with Samsung S25 Ultra data
- **Status**: Not processing, needs complete rewrite

### What's Working
- Extension successfully sends data to Strapi API
- Data is stored in Redis stream `validation_requests`
- Consumer group `strapi-workers` exists
- Manual reading with redis-cli works

### What's NOT Working
- Worker cannot read messages (always returns 0)
- No validation processing happening
- No listings being created in database

## System Architecture

### Data Flow (Intended)
```
1. Browser Extension collects data
2. Sends to POST /api/validation/validate
3. Strapi publishes to Redis stream
4. Worker reads from stream (BROKEN)
5. Worker validates data
6. Worker creates listings
```

### Current State
- Extension → Strapi → Redis ✅
- Redis → Worker ❌
- Worker → Database ❌

## Technical Stack

- **Strapi**: 5.23.1 on Node.js 22.19.0
- **Redis**: Alpine version in Docker
- **PostgreSQL**: 17 in Docker (user: JOY, db: rate_db)
- **Worker**: TypeScript in Strapi (redisWorker.ts)

## Debug Commands

```bash
# Check Redis stream
docker exec redis redis-cli XLEN validation_requests

# Read message manually
docker exec redis redis-cli XREADGROUP GROUP strapi-workers test COUNT 1 STREAMS validation_requests ">"

# Check consumer group
docker exec redis redis-cli XINFO GROUPS validation_requests

# Check database
docker exec DB psql -U JOY -d rate_db -c "SELECT COUNT(*) FROM listings;"
```

## Next Steps

1. **Option A**: Fix ioredis xReadGroup syntax
   - Current attempts failed
   - May need different Redis client library

2. **Option B**: Use Python Validator module
   - Already exists in Modules/Validator
   - More reliable Redis stream handling

3. **Option C**: Simple polling approach
   - Use XRANGE instead of xReadGroup
   - Less efficient but simpler