import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import CheckScamCrawlerV2 from './CheckScamCrawlerV2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findLatestScamLinksFile() {
    try {
        const resultsDir = path.join(__dirname, '../Results');
        const files = await fs.readdir(resultsDir);
        
        // Filter scam links files
        const scamLinksFiles = files.filter(file => 
            file.startsWith('scam_links_') && file.endsWith('.json')
        );
        
        if (scamLinksFiles.length === 0) {
            throw new Error('No scam links files found in Results directory');
        }
        
        // Sort by filename (which includes timestamp)
        scamLinksFiles.sort().reverse();
        const latestFile = scamLinksFiles[0];
        
        console.log(`📁 Using latest scam links file: ${latestFile}`);
        return path.join(resultsDir, latestFile);
        
    } catch (error) {
        console.error('❌ Error finding scam links file:', error.message);
        throw error;
    }
}

async function loadScammerLinks(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        const links = data.links || data;
        if (!Array.isArray(links)) {
            throw new Error('Invalid file format: expected array of links');
        }
        
        console.log(`✅ Loaded ${links.length} scammer links`);
        return links;
        
    } catch (error) {
        console.error('❌ Error loading scammer links:', error.message);
        throw error;
    }
}

async function main() {
    try {
        console.log('🚀 CheckScam Crawler - Main Script\n');
        
        // Find and load latest scam links file
        const scamLinksFile = await findLatestScamLinksFile();
        const scammerLinks = await loadScammerLinks(scamLinksFile);
        
        if (scammerLinks.length === 0) {
            console.log('⚠️ No scammer links to process');
            return;
        }
        
        // Parse command line arguments
        const args = process.argv.slice(2);
        const maxIndex = args.indexOf('--max');
        const delayIndex = args.indexOf('--delay');
        
        const maxCrawl = maxIndex !== -1 ? parseInt(args[maxIndex + 1]) : 10;
        const delay = delayIndex !== -1 ? parseInt(args[delayIndex + 1]) : 5000;
        
        console.log(`🎯 Crawling ${Math.min(maxCrawl, scammerLinks.length)} scammers with ${delay}ms delay\n`);
        
        // Initialize crawler
        const crawler = new CheckScamCrawlerV2({
            delayMs: delay
        });
        
        // Crawl scammers
        const results = await crawler.crawlMultiple(scammerLinks, {
            max: maxCrawl,
            delay: delay
        });
        
        // Save results
        await crawler.saveResults(results);
        
        // Display summary
        const successful = results.filter(r => r.success);
        const highQuality = results.filter(r => r.quality_level === 'high');
        const mediumQuality = results.filter(r => r.quality_level === 'medium');
        const lowQuality = results.filter(r => r.quality_level === 'low');
        
        console.log('\n📊 Crawl Summary:');
        console.log(`   Total processed: ${results.length}`);
        console.log(`   Successful: ${successful.length} (${(successful.length/results.length*100).toFixed(1)}%)`);
        console.log(`   Failed: ${results.length - successful.length}`);
        console.log(`   High quality: ${highQuality.length}`);
        console.log(`   Medium quality: ${mediumQuality.length}`);
        console.log(`   Low quality: ${lowQuality.length}`);
        
        console.log('\n✅ Crawl completed successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🚀 CheckScam Crawler - Main Script

Usage:
  node crawl-main.js [options]

Options:
  --max <number>    Maximum number of scammers to crawl (default: 10)
  --delay <ms>      Delay between requests in milliseconds (default: 5000)
  --help, -h        Show this help

Examples:
  node crawl-main.js --max 5 --delay 10000
  node crawl-main.js --max 20
    `);
    process.exit(0);
}

// Run the script
main();
