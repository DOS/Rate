#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting MCP Playwright Server with auto-restart...');

const configPath = path.join(__dirname, 'playwright-mcp-config.json');
const port = '8931';

console.log(`📁 Config path: ${configPath}`);
console.log(`🔌 Port: ${port}`);

const mcp = spawn('npx', [
  '@playwright/mcp@latest',
  '--port', port,
  '--config', configPath
], {
  stdio: 'inherit',
  shell: true
});

mcp.on('close', (code) => {
  console.log(`💥 MCP process exited with code ${code}`);
  if (code !== 0) {
    console.log('❌ MCP crashed, will be restarted by nodemon...');
  }
});

mcp.on('error', (err) => {
  console.error('🚨 MCP startup error:', err);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  mcp.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  mcp.kill('SIGTERM');
  process.exit(0);
}); 