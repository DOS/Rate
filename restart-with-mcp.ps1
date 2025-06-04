# Restart Strapi + Auto Restart MCP Script
param(
    [switch]$RestartStrapi,
    [switch]$RestartMCP
)

Write-Host "🔄 Smart Restart Script" -ForegroundColor Cyan

if ($RestartStrapi) {
    Write-Host "🛑 Stopping Strapi/NextJS processes..." -ForegroundColor Yellow
    
    # Get specific processes
    $strapiProcess = Get-Process node -ErrorAction SilentlyContinue | Where-Object { 
        (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*@strapi*" 
    }
    
    $nextProcess = Get-Process node -ErrorAction SilentlyContinue | Where-Object { 
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
        $cmdLine -like "*next*" -or $cmdLine -like "*apps\ui*"
    }
    
    $turboProcess = Get-Process node -ErrorAction SilentlyContinue | Where-Object { 
        (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*turbo*" 
    }
    
    # Kill processes
    @($strapiProcess, $nextProcess, $turboProcess) | ForEach-Object {
        if ($_) {
            Write-Host "  🗑️ Killing PID: $($_.Id)" -ForegroundColor Red
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
    }
    
    Write-Host "✅ Processes stopped" -ForegroundColor Green
    Start-Sleep -Seconds 2
    
    Write-Host "🚀 Starting Strapi..." -ForegroundColor Green
    Start-Process -FilePath "yarn" -ArgumentList "dev" -NoNewWindow
    
    Write-Host "⏳ Waiting for Strapi to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}

if ($RestartMCP) {
    Write-Host "🛑 Stopping MCP Playwright server..." -ForegroundColor Yellow
    
    # Find MCP process
    $mcpProcess = Get-Process node -ErrorAction SilentlyContinue | Where-Object { 
        (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*@playwright/mcp*" 
    }
    
    if ($mcpProcess) {
        Write-Host "  🗑️ Killing MCP PID: $($mcpProcess.Id)" -ForegroundColor Red
        Stop-Process -Id $mcpProcess.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
    
    Write-Host "🚀 Starting MCP Playwright server..." -ForegroundColor Green
    Start-Process -FilePath "npx" -ArgumentList "@playwright/mcp@latest", "--port", "8931", "--config", "D:\Projects\JOY\Rate-New\playwright-mcp-config.json" -NoNewWindow
    
    Write-Host "⏳ Waiting for MCP to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    Write-Host "💡 REMINDER: Toggle Playwright in MCP Tools UI to reconnect" -ForegroundColor Magenta
}

Write-Host "✅ Restart complete!" -ForegroundColor Green

# Usage examples:
# .\restart-with-mcp.ps1 -RestartStrapi
# .\restart-with-mcp.ps1 -RestartMCP  
# .\restart-with-mcp.ps1 -RestartStrapi -RestartMCP 