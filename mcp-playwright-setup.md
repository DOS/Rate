# Playwright MCP Server Setup Guide

## 1. Thêm vào Cursor Settings

Mở Cursor Settings > Features > MCP > Add new MCP server:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

## 2. Tools Available

### Console & Network Debugging:
- `browser_console_messages` - Lấy tất cả console logs
- `browser_network_requests` - Lấy network requests
- `browser_snapshot` - Capture page state (accessibility tree)
- `browser_take_screenshot` - Chụp screenshot

### Navigation & Interaction:
- `browser_navigate` - Navigate đến URL
- `browser_click` - Click elements
- `browser_type` - Type text
- `browser_wait_for` - Wait for conditions

### Tab Management:
- `browser_tab_list` - List tabs
- `browser_tab_new` - Open new tab
- `browser_tab_select` - Switch tabs

## 3. Usage Examples

### Lấy Console Logs:
```
"Check the console logs on this page for any errors"
```

### Debug Network Issues:
```
"Show me all network requests and check for failed requests"
```

### Full Page Analysis:
```
"Take a screenshot and show me console logs and network requests"
```

## 4. Configuration Options

### Headless Mode (cho server):
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    }
  }
}
```

### Specific Browser:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--browser", "chrome"]
    }
  }
}
```

## 5. Ưu Điểm vs Browser-Tools-Server

✅ **Không cần Chrome extension**
✅ **Không cần middleware server** 
✅ **Tích hợp sẵn console logs**
✅ **Cross-browser support**
✅ **Chính thức từ Microsoft**
✅ **Active development**

## 6. Workflow

1. Mở website trong browser
2. Hỏi Cursor: "Check console logs and network requests on this page"
3. Playwright MCP sẽ tự động:
   - Capture console messages
   - Capture network requests  
   - Analyze page state
   - Provide structured data

No manual extension toggle needed! 