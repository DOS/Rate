# Test Scripts

This directory contains test and development scripts for the CheckScam Crawler project.

## Files

### `test-checkscam-redis-integration.js`
- **Purpose**: Comprehensive test for CheckScam crawler Redis integration
- **Features**: 
  - Tests Redis connection
  - Tests crawler with/without Redis
  - Verifies messages in Redis stream
- **Usage**: `node test-checkscam-redis-integration.js`

### `checkscam-to-redis.js` (LEGACY)
- **Purpose**: Standalone Redis integration script (before built-in integration)
- **Status**: No longer needed - Redis is now built into CheckScamCrawlerV2.js
- **Note**: Kept for reference only

## Running Tests

```bash
# Run Redis integration test
cd Tests
node test-checkscam-redis-integration.js

# Or from Scripts directory
node Tests/test-checkscam-redis-integration.js
```

## Production Scripts

For production use, use the main scripts in the parent directory:
- `CheckScamCrawlerV2.js` - Main crawler with built-in Redis integration
- `CheckScamLinksCollector.js` - Collect scam links from CheckScam.vn

## Cleanup

These test scripts can be safely deleted once the production system is stable and well-tested.
