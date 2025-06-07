#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';

console.log('🚀 Rate-Importer - CheckScam Crawler');
console.log('====================================');

const args = process.argv.slice(2);
const command = args[0] || 'help';

const scripts = {
    'links': {
        file: 'Scripts/crawl-with-flaresolverr.js',
        description: 'Extract scammer links from CheckScam.vn'
    },
    'crawl': {
        file: 'Scripts/crawl-main.js', 
        description: 'Crawl detailed scammer data using FlareSolverr'
    },
    'cleanup': {
        file: 'Scripts/cleanup.js',
        description: 'Clean up project structure'
    }
};

function showHelp() {
    console.log('\n📋 Available commands:');
    console.log('');
    Object.entries(scripts).forEach(([cmd, info]) => {
        console.log(`  ${cmd.padEnd(10)} - ${info.description}`);
    });
    console.log('');
    console.log('💡 Examples:');
    console.log('  node crawl.js links     # Get scammer links');
    console.log('  node crawl.js crawl     # Crawl detailed data');
    console.log('  node crawl.js cleanup   # Clean up project');
    console.log('');
}

function runScript(scriptPath, scriptArgs = []) {
    console.log(`🎯 Running: ${scriptPath}`);
    console.log('');
    
    const child = spawn('node', [scriptPath, ...scriptArgs], {
        stdio: 'inherit',
        shell: true
    });
    
    child.on('error', (error) => {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
    });
    
    child.on('close', (code) => {
        if (code === 0) {
            console.log(`\n✅ Script completed successfully`);
        } else {
            console.log(`\n❌ Script failed with code ${code}`);
            process.exit(code);
        }
    });
}

// Handle commands
switch (command) {
    case 'help':
    case '--help':
    case '-h':
        showHelp();
        break;
        
    case 'links':
        runScript(scripts.links.file, args.slice(1));
        break;
        
    case 'crawl':
        runScript(scripts.crawl.file, args.slice(1));
        break;
        
    case 'cleanup':
        runScript(scripts.cleanup.file, args.slice(1));
        break;
        
    default:
        console.log(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
}
