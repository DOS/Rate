# CURSOR SETTINGS TỐI ƯU CHO NON-CODER

## 🎛️ CURSOR SETTINGS CỤ THỂ

### Settings > General
```json
{
  "workbench.startupEditor": "none",
  "editor.fontSize": 14,
  "editor.lineHeight": 1.6,
  "editor.wordWrap": "on",
  "editor.minimap.enabled": false,
  "editor.renderWhitespace": "boundary",
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 1000
}
```

### Settings > Cursor Specific
```json
{
  "cursor.chat.defaultModel": "claude-3.5-sonnet",
  "cursor.general.enableCommandK": true,
  "cursor.general.enableChat": true,
  "cursor.general.enableComposer": true,
  "cursor.cpp.enableInlineCompletion": true,
  "cursor.cpp.enableCodeActions": true
}
```

### Settings > YOLO Mode (CRITICAL!)
```
✅ Enable YOLO Mode
Allow list commands:
yarn dev, yarn build, yarn test
npm run dev, npm run build, npm test
tsc, eslint, prettier
mkdir, touch, cp, mv, rm
netstat, ps, kill, taskkill
docker-compose up, docker-compose down
git add, git commit, git push
cd, ls, dir, pwd
```

## 📦 ESSENTIAL EXTENSIONS

### Core Development
```
MUST HAVE:
✅ TypeScript and JavaScript Language Features (built-in)
✅ PowerShell (ms-vscode.powershell)
✅ Docker (ms-azuretools.vscode-docker)
✅ GitLens (eamodio.gitlens)
✅ Prettier (esbenp.prettier-vscode)
✅ ESLint (dbaeumer.vscode-eslint)
```

### Project Organization  
```
HIGHLY RECOMMENDED:
✅ Todo Tree (gruntfuggly.todo-tree)
✅ Better Comments (aaron-bond.better-comments)
✅ Project Manager (alefragnani.project-manager)
✅ Path Intellisense (christian-kohler.path-intellisense)
✅ Auto Rename Tag (formulahendry.auto-rename-tag)
```

### Productivity Boosters
```
NICE TO HAVE:
✅ Thunder Client (rangav.vscode-thunder-client) # API testing
✅ REST Client (humao.rest-client) # Quick API calls
✅ Markdown All in One (yzhang.markdown-all-in-one)
✅ Material Icon Theme (pkief.material-icon-theme)
```

## 🎨 UI FRAMEWORK SETUP

### Since bạn không dùng Figma/Builder.io, focus vào:

#### Tailwind CSS (Recommended)
```json
// settings.json
{
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "javascript"
  },
  "tailwindCSS.experimental.classRegex": [
    "tw`([^`]*)",
    ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
```

#### Extension for UI
```
✅ Tailwind CSS IntelliSense (bradlc.vscode-tailwindcss)
✅ Auto Close Tag (formulahendry.auto-close-tag)
✅ Bracket Pair Colorizer (deprecated, built-in now)
```

## 🗂️ WORKSPACE CONFIGURATION

### .vscode/settings.json cho project
```json
{
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "**/.git": true,
    "**/test-results": true,
    "**/playwright-report": true
  },
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/dist/**": true,
    "**/build/**": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true
}
```

## 🧠 DOCS & MODULES MEMORY INTEGRATION

### Setup để AI access Docs/Modules:

#### .cursor/rules/004-docs-integration.mdc
```markdown
---
description: "Integration với existing Docs và Modules"
alwaysApply: true
---

# DOCS & MODULES INTEGRATION

## 📚 KNOWLEDGE SOURCES
- Primary docs: D:\Projects\JOY\Rate\Docs
- Modules reference: D:\Projects\JOY\Rate\Modules  
- Always check existing docs before creating new solutions

## 🔍 SEARCH PATTERN
When asked about implementation:
1. Search existing Docs for patterns
2. Check Modules for similar functionality  
3. Reference existing solutions before creating new
4. Update docs with new discoveries

## 📝 DOCUMENTATION UPDATES
After major implementations:
1. Update relevant files in /Docs
2. Create module documentation in /Modules  
3. Link related patterns across docs
4. Maintain consistency with existing style
```

## ⚡ PRODUCTIVITY SHORTCUTS

### Keyboard Shortcuts tối ưu:
```
Ctrl+Shift+P: Command Palette  
Ctrl+K: Inline edit (Cursor AI)
Ctrl+L: Chat with AI
Ctrl+I: Composer (Agent mode)
Ctrl+`: Terminal toggle
Ctrl+B: Sidebar toggle
Ctrl+Shift+E: Explorer
Ctrl+Shift+F: Search across files
Ctrl+G: Go to line
F2: Rename symbol
```

### Command K Terminal Patterns:
```
Productivity commands để save vào settings:
- "restart development server"
- "kill process on port 1337"  
- "check recent git commits"
- "run full test suite"
- "build and check for errors"
```

## 🔧 TROUBLESHOOTING SETUP

### Common Issues & Solutions:

#### Playwright MCP Disconnect Fix
```powershell
# Auto-restart script - save as restart-mcp.ps1
function Restart-PlaywrightMCP {
    $processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*playwright*mcp*"
    }
    
    if ($processes) {
        $processes | Stop-Process -Force
        Write-Host "Stopped Playwright MCP processes"
    }
    
    Start-Sleep 2
    Write-Host "Restarting Playwright MCP..."
    # Cursor sẽ tự restart MCP server
}
```

#### Memory Usage Optimization
```json
// settings.json
{
  "files.maxMemoryForLargeFilesMB": 4096,
  "search.maxResults": 20000,
  "typescript.disableAutomaticTypeAcquisition": false,
  "typescript.preferences.includePackageJsonAutoImports": "on"
}
```

## 🎯 WORKFLOW OPTIMIZATION

### Daily Startup Routine:
1. Open project với `Ctrl+Shift+P` → "Project Manager: Open"
2. Check MCP servers status  
3. Review /Docs cho context update
4. Start development với `yarn dev`
5. Enable Agent mode cho complex tasks

### Weekly Maintenance:
1. Update documentation trong /Docs
2. Review và optimize cursor rules
3. Clean up test files/screenshots  
4. Backup important cursor settings
5. Update MCP servers if needed 