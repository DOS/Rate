# MCP Auto Test Rule

## Rule: Tự động dùng MCP Server Playwright test sau khi build xong

### Khi nào áp dụng:
- Sau khi build plugin Smart Component Filter
- Sau khi sửa code liên quan đến real-time filtering
- Sau khi fix cache issues

### Commands:
1. **Kiểm tra MCP server**: `netstat -an | findstr 8931`
2. **Chạy debug test**: `npx playwright test debug-cache-fix-mcp.spec.js --headed`
3. **Chạy full test**: `npx playwright test test-cache-fix-mcp.spec.js --headed`

### Test files:
- `debug-cache-fix-mcp.spec.js` - Debug test với console logs
- `test-cache-fix-mcp.spec.js` - Full functional test

### Expected results:
- Plugin registration: `🚀 Smart Component Filter plugin registering`
- ListingType detection: `🎯 Found Bank button, returning ID: 7`
- Form state changes: `🔄 FORM STATE: Current ListingType: 7 - Stored: 1`
- Real-time filtering: `🔄🔄🔄 REAL-TIME: Re-filtering open component picker`

### Success criteria:
- Plugin detects ListingType changes correctly
- No cached values used (always reads from form state)
- Real-time filtering works when component picker is open 