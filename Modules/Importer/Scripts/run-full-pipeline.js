#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 CheckScam Full Pipeline with Validation Integration\n');

// Configuration
const config = {
  strapiUrl: process.env.STRAPI_URL || 'http://localhost:1337',
  strapiToken: process.env.STRAPI_API_TOKEN,
  crawlDelay: process.env.CRAWL_DELAY || 3000,
  pushToValidation: process.env.PUSH_TO_VALIDATION !== 'false',
  useRedis: process.env.USE_REDIS !== 'false'
};

if (config.pushToValidation && !config.strapiToken) {
  console.error('❌ STRAPI_API_TOKEN is required when PUSH_TO_VALIDATION is enabled');
  console.log('Set it with: export STRAPI_API_TOKEN=your_token_here');
  process.exit(1);
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n📌 Running: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function findLatestFile(pattern) {
  const resultsDir = path.join(__dirname, '..', 'Results');
  const files = fs.readdirSync(resultsDir)
    .filter(f => f.startsWith(pattern) && f.endsWith('.json'))
    .sort()
    .reverse();
  
  return files.length > 0 ? path.join(resultsDir, files[0]) : null;
}

async function main() {
  try {
    // Step 1: Extract links
    console.log('📋 Step 1: Extracting scammer links from checkscam.vn...');
    await runCommand('node', ['crawl-with-flaresolverr.js']);
    
    // Find the latest links file
    const linksFile = await findLatestFile('scam_links_');
    if (!linksFile) {
      throw new Error('No links file found after extraction');
    }
    
    const linksData = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
    console.log(`\n✅ Found ${linksData.total_links} scammer links`);
    
    // Step 2: Crawl profiles
    console.log('\n📍 Step 2: Crawling scammer profiles...');
    const crawlArgs = [
      'CheckScamCrawlerV2.js',
      '--file', linksFile,
      '--delay', config.crawlDelay.toString()
    ];
    
    if (!config.useRedis) {
      crawlArgs.push('--no-redis');
    }
    
    if (config.pushToValidation) {
      crawlArgs.push('--push-validation');
      crawlArgs.push('--strapi-url', config.strapiUrl);
      if (config.strapiToken) {
        crawlArgs.push('--strapi-token', config.strapiToken);
      }
    }
    
    await runCommand('node', crawlArgs);
    
    // Find the results file
    const resultsFile = await findLatestFile('checkscam_crawl_');
    if (resultsFile) {
      const resultsData = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      console.log(`\n✅ Pipeline completed!`);
      console.log(`📊 Summary:`);
      console.log(`   - Total processed: ${resultsData.total_processed}`);
      console.log(`   - Successful: ${resultsData.successful}`);
      console.log(`   - Failed: ${resultsData.failed}`);
      console.log(`   - Results saved: ${path.basename(resultsFile)}`);
      
      if (config.pushToValidation) {
        console.log(`   - Data sent to validation pipeline`);
        console.log(`   - Clean data will be stored after validation`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Pipeline failed:', error.message);
    process.exit(1);
  }
}

// Show usage if --help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node run-full-pipeline.js

Environment Variables:
  STRAPI_URL         Strapi URL (default: http://localhost:1337)
  STRAPI_API_TOKEN   Strapi API token (required if PUSH_TO_VALIDATION=true)
  CRAWL_DELAY        Delay between crawls in ms (default: 3000)
  PUSH_TO_VALIDATION Send to validation pipeline (default: true)
  USE_REDIS          Use Redis for validation (default: true)

Example:
  export STRAPI_API_TOKEN=your_token_here
  node run-full-pipeline.js
  `);
  process.exit(0);
}

main();
