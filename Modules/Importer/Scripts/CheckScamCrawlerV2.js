import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CheckScamCrawlerV2 {
    constructor(options = {}) {
        this.flaresolverrUrl = options.flaresolverrUrl || process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
        this.timeout = options.timeout || 60000;
        this.delayMs = options.delayMs || 5000;
        this.maxRetries = options.maxRetries || 3;
        this.outputDir = options.outputDir || path.join(__dirname, '../Results');
        
        // Redis integration
        this.enableRedis = options.enableRedis !== false; // Default: enabled
        this.redis = null;
        this.streamName = options.streamName || 'validation_requests';
        this.batchId = `checkscam_${Date.now()}`;
        this.sequence = 0;
        
        // Initialize Redis if enabled
        if (this.enableRedis) {
            this.redis = new Redis({
                host: options.redis?.host || process.env.REDIS_HOST || 'localhost',
                port: options.redis?.port || process.env.REDIS_PORT || 6379,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
            });
        }
    }

    async fetchWithFlareSolverr(url) {
        const payload = {
            cmd: 'request.get',
            url: url,
            maxTimeout: this.timeout
        };

        try {
            console.log(`🔥 FlareSolverr fetching: ${url}`);
            const response = await axios.post(this.flaresolverrUrl, payload, {
                timeout: this.timeout + 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.status === 'ok') {
                console.log(`✅ FlareSolverr success: ${response.data.solution.response.length} chars`);
                return response.data.solution.response;
            } else {
                throw new Error(`FlareSolverr error: ${response.data.message}`);
            }
        } catch (error) {
            console.error(`❌ FlareSolverr failed for ${url}:`, error.message);
            throw error;
        }
    }

    parseScammerInfo(html, url) {
        try {
            // Extract title
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

            // Extract scammer name from title or content
            let name = 'Unknown';
            if (title && title !== 'Unknown') {
                // Remove common prefixes/suffixes
                name = title.replace(/^(Thông tin|Info|Report)\s*/i, '')
                           .replace(/\s*-.*$/, '')
                           .replace(/\s*trên.*$/i, '')
                           .trim();
            }

            // Extract phone numbers
            const phoneRegex = /(?:0|\+84)[0-9]{8,10}/g;
            const phoneMatches = html.match(phoneRegex) || [];
            const phone = phoneMatches.length > 0 ? phoneMatches[0] : 'N/A';

            // Extract bank information
            const bankRegex = /((?:Vietcombank|VCB|Techcombank|TCB|BIDV|VietinBank|MB Bank|MBBank|Sacombank|ACB|TPBank|VP Bank|VPBank|Agribank|OCB|SHB|HDBank|LienVietPostBank|VIB|MSB|SeABank|BacABank|KienLongBank|VietABank|NamABank|PGBank|GPBank|VietCapitalBank|BaoVietBank|DongABank|CBBank|ABBank|NCB|OceanBank|UnitedOverseas|PublicBank|ANZ|HSBC|StandardChartered|Citibank|DBS|Maybank|Shinhan|Woori)\s*(?:Bank)?\s*[:\-]?\s*(?:STK|Account|Số tài khoản|TK)?[:\-]?\s*([0-9\-\s]+))/gi;
            const bankMatches = html.match(bankRegex) || [];
            let bank = '';
            if (bankMatches.length > 0) {
                bank = bankMatches[0].replace(/\s+/g, ' ').trim();
            }

            // Extract scam amount
            const amountRegex = /(?:số tiền|amount|tiền|money)[:\-\s]*([0-9,\.]+)\s*(?:VND|đồng|vnđ|triệu|million|nghìn|thousand)?/gi;
            const amountMatches = html.match(amountRegex) || [];
            const scamAmount = amountMatches.length > 0 ? amountMatches[0] : 'N/A';

            // Extract main content
            const contentMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*?)<\/div>/s) ||
                               html.match(/<div[^>]*class="[^"]*post-content[^"]*"[^>]*>(.*?)<\/div>/s) ||
                               html.match(/<article[^>]*>(.*?)<\/article>/s);
            
            let content = '';
            if (contentMatch) {
                content = contentMatch[1]
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            // Extract hidden content
            const hiddenMatch = html.match(/<div[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>(.*?)<\/div>/s);
            let hiddenContent = '';
            if (hiddenMatch) {
                hiddenContent = hiddenMatch[1]
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
            }

            // Extract evidence images (URLs)
            const imageUrls = [];
            const imgTagRegex = /<img[^>]+src=["']([^"'>]+)["'][^>]*>/g;
            let imgMatch;
            const htmlToScan = contentMatch ? contentMatch[1] : html;
            while ((imgMatch = imgTagRegex.exec(htmlToScan)) !== null) {
                imageUrls.push(imgMatch[1]);
            }

            // Extract bank account name (nếu có)
            let bankAccountName = '';
            // Tìm các cụm như "Tên TK", "Chủ tài khoản", "Account name", ...
            const bankNameRegex = /(Tên\s*(?:TK|tài khoản)|Chủ\s*tài khoản|Account name|Tên chủ khoản):?\s*([A-ZÀ-Ỹa-zà-ỹ\s]+)/i;
            const bankNameMatch = (contentMatch ? contentMatch[1] : html).match(bankNameRegex);
            if (bankNameMatch && bankNameMatch[2]) {
                bankAccountName = bankNameMatch[2].trim();
            }

            return {
                name: name,
                bank_account_name: bankAccountName,
                phone: phone,
                bank: bank,
                scam_amount: scamAmount,
                content: content || hiddenContent || 'No content found',
                evidence_images: imageUrls,
                url: url,
                timestamp: new Date().toISOString(),
                success: true
            };

        } catch (error) {
            console.error(`❌ Parse error for ${url}:`, error.message);
            return {
                name: 'Unknown',
                bank_account_name: '',
                phone: 'N/A',
                bank: '',
                scam_amount: 'N/A',
                content: '',
                evidence_images: [],
                url: url,
                timestamp: new Date().toISOString(),
                success: false,
                error: error.message
            };
        }
    }

    validateScammerData(scammer) {
        let score = 0;
        let issues = [];

        // Name validation (20 points)
        if (scammer.name && scammer.name !== 'Unknown' && scammer.name.length > 2) {
            score += 20;
        } else {
            issues.push('Missing or invalid name');
        }

        // Phone validation (25 points)
        if (scammer.phone && scammer.phone !== 'N/A' && /^(?:0|\+84)[0-9]{8,10}$/.test(scammer.phone.replace(/\s/g, ''))) {
            score += 25;
        } else {
            issues.push('Missing or invalid phone number');
        }

        // Bank validation (25 points)
        if (scammer.bank && scammer.bank.trim().length > 5) {
            score += 25;
        } else {
            issues.push('Missing bank information');
        }

        // Content validation (20 points)
        if (scammer.content && scammer.content.length > 50) {
            score += 20;
        } else {
            issues.push('Insufficient content');
        }

        // URL validation (10 points)
        if (scammer.url && scammer.url.startsWith('https://checkscam.vn/')) {
            score += 10;
        } else {
            issues.push('Invalid URL');
        }

        return {
            score: score,
            quality: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
            issues: issues
        };
    }

    async sendToRedis(scammerData) {
        if (!this.enableRedis || !this.redis) {
            console.log('⚠️ Redis disabled, skipping stream publish');
            return null;
        }

        try {
            this.sequence++;
            
            // Transform crawler data to validation format
            const validationData = {
                // Required fields for validation
                phone: scammerData.phone || '',
                bank_account: scammerData.bank_account_name || '',
                email: scammerData.email || '',
                name: scammerData.name || '',
                
                // Source tracking
                source: 'checkscam_crawler',
                scrape_url: scammerData.url,
                batch_id: this.batchId,
                sequence: this.sequence,
                timestamp: new Date().toISOString(),
                
                // Additional checkscam data
                scam_type: scammerData.scam_type || 'Unknown',
                bank: scammerData.bank || '',
                scam_amount: scammerData.scam_amount || '',
                content: scammerData.content || '',
                evidence_images: scammerData.evidence_images || [],
                quality: scammerData.quality || 'low',
                score: scammerData.score || 0,
                issues: scammerData.issues || [],
                
                // Raw data for reference
                raw_data: JSON.stringify(scammerData)
            };

            const messageId = await this.redis.xadd(
                this.streamName,
                '*',
                'data', JSON.stringify(validationData),
                'source', 'checkscam_crawler',
                'timestamp', validationData.timestamp,
                'scrape_url', scammerData.url,
                'batch_id', this.batchId,
                'sequence', this.sequence
            );

            console.log(`✅ Sent to Redis stream ${this.streamName}: ${messageId}`);
            console.log(`📊 Data: ${scammerData.name} | Phone: ${scammerData.phone} | Bank: ${scammerData.bank_account_name}`);
            
            return messageId;
        } catch (error) {
            console.error('❌ Failed to send to Redis:', error.message);
            throw error;
        }
    }

    async cleanup() {
        if (this.redis) {
            try {
                await this.redis.quit();
                console.log('✅ Redis connection closed');
            } catch (error) {
                console.error('⚠️ Error closing Redis connection:', error.message);
            }
        }
    }

    async crawlScammer(url) {
        try {
            const html = await this.fetchWithFlareSolverr(url);
            const scammerData = this.parseScammerInfo(html, url);

            // --- Basic Validation Integration ---
            let basicValidation;
            try {
                basicValidation = (await import('./basicValidation.js')).applyBasicValidation;
            } catch {
                basicValidation = (record) => ({ ...record, flag: 'skip_basic_validation', score: 1 });
            }
            const validated = basicValidation({
                link: scammerData.url,
                content: scammerData.content
            }, [], []);
            scammerData.flag = validated.flag;
            scammerData.basic_score = validated.score;
            // --- End Basic Validation ---

            const validation = this.validateScammerData(scammerData);
            
            scammerData.quality = validation.quality;
            scammerData.issues = validation.issues;
            scammerData.score = validation.score;
            
            // Send to Redis stream if enabled
            if (this.enableRedis && scammerData.success !== false) {
                try {
                    await this.sendToRedis(scammerData);
                } catch (redisError) {
                    console.error('⚠️ Redis publish failed, continuing with crawl:', redisError.message);
                    scammerData.redis_error = redisError.message;
                }
            }
            
            return scammerData;
        } catch (error) {
            console.error(`❌ Crawl error for ${url}:`, error.message);
            return {
                url: url,
                success: false,
                error: error.message,
                quality_level: 'low'
            };
        }
    }

    async crawlMultiple(scammerLinks, options = {}) {
        const maxCrawl = options.max || scammerLinks.length;
        const delay = options.delay || this.delayMs;
        const results = [];
        
        console.log(`🎯 Starting crawl of ${Math.min(maxCrawl, scammerLinks.length)} scammers...\n`);
        
        for (let i = 0; i < Math.min(maxCrawl, scammerLinks.length); i++) {
            const link = scammerLinks[i];
            console.log(`📍 Processing ${i + 1}/${Math.min(maxCrawl, scammerLinks.length)}: ${link.name || link.url}`);
            console.log(`🎯 Crawling: ${link.url}`);
            
            const result = await this.crawlScammer(link.url);
            results.push(result);
            
            if (result.success) {
                console.log(`✅ Success: ${result.name}`);
                console.log(`   Phone: ${result.phone}`);
                console.log(`   Bank: ${result.bank}`);
                console.log(`   Scam: ${result.scam_amount}`);
                console.log(`   Content: ${result.content.length} chars`);
            } else {
                console.log(`❌ Failed: ${result.error}`);
            }
            
            // Delay between requests
            if (i < Math.min(maxCrawl, scammerLinks.length) - 1) {
                console.log(`⏳ Waiting ${delay / 1000}s...\n`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        return results;
    }

    async saveResults(results, filename = null) {
        try {
            await fs.mkdir(this.outputDir, { recursive: true });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFile = filename || `checkscam_crawl_${timestamp}.json`;
            const outputPath = path.join(this.outputDir, outputFile);
            
            const successful = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            
            const output = {
                timestamp: new Date().toISOString(),
                total_processed: results.length,
                successful: successful.length,
                failed: failed.length,
                scammers: results,
                summary: {
                    high_quality: results.filter(r => r.quality_level === 'high').length,
                    medium_quality: results.filter(r => r.quality_level === 'medium').length,
                    low_quality: results.filter(r => r.quality_level === 'low').length
                }
            };
            
            await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
            console.log(`📁 Results saved: ${outputPath}`);
            
            return outputPath;
        } catch (error) {
            console.error(`❌ Failed to save results:`, error.message);
            throw error;
        }
    }
}

export default CheckScamCrawlerV2;

// CLI support
if (process.argv[1].endsWith('CheckScamCrawlerV2.js')) {
    const args = process.argv.slice(2);
    const crawler = new CheckScamCrawlerV2();
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🚀 CheckScamCrawlerV2 CLI

Usage:
  node CheckScamCrawlerV2.js [options]

Options:
  --file <path>       Input file with scammer links
  --max <number>      Maximum number of scammers to crawl
  --delay <ms>        Delay between requests (default: 5000)
  --output <dir>      Output directory (default: ../Results)
  --no-redis          Disable Redis stream publishing
  --redis-host <host> Redis host (default: localhost)
  --redis-port <port> Redis port (default: 6379)
  --stream <name>     Redis stream name (default: validation_requests)
  --help, -h          Show this help

Examples:
  node CheckScamCrawlerV2.js --file ../Results/scam_links_latest.json --max 10
  node CheckScamCrawlerV2.js --file ../Results/scam_links_latest.json --delay 10000
  node CheckScamCrawlerV2.js --file ../Results/scam_links_latest.json --no-redis
  node CheckScamCrawlerV2.js --file ../Results/scam_links_latest.json --redis-host redis.example.com --redis-port 6380
        `);
        process.exit(0);
    }
    
    // Parse CLI arguments
    const fileIndex = args.indexOf('--file');
    const maxIndex = args.indexOf('--max');
    const delayIndex = args.indexOf('--delay');
    const outputIndex = args.indexOf('--output');
    const noRedisIndex = args.indexOf('--no-redis');
    const redisHostIndex = args.indexOf('--redis-host');
    const redisPortIndex = args.indexOf('--redis-port');
    const streamIndex = args.indexOf('--stream');
    
    const inputFile = fileIndex !== -1 ? args[fileIndex + 1] : null;
    const maxCrawl = maxIndex !== -1 ? parseInt(args[maxIndex + 1]) : null;
    const delay = delayIndex !== -1 ? parseInt(args[delayIndex + 1]) : 5000;
    const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : null;
    const noRedis = noRedisIndex !== -1;
    const redisHost = redisHostIndex !== -1 ? args[redisHostIndex + 1] : null;
    const redisPort = redisPortIndex !== -1 ? parseInt(args[redisPortIndex + 1]) : null;
    const streamName = streamIndex !== -1 ? args[streamIndex + 1] : null;
    
    if (!inputFile) {
        console.error('❌ Error: --file parameter is required');
        process.exit(1);
    }
    
    try {
        const fileContent = await fs.readFile(inputFile, 'utf8');
        const data = JSON.parse(fileContent);
        const links = data.links || data;
        
        if (!Array.isArray(links) || links.length === 0) {
            console.error('❌ Error: No valid links found in input file');
            process.exit(1);
        }
        
        const crawlerOptions = { delayMs: delay };
        if (outputDir) crawlerOptions.outputDir = outputDir;
        if (noRedis) crawlerOptions.enableRedis = false;
        if (redisHost) crawlerOptions.redis = { host: redisHost };
        if (redisPort) crawlerOptions.redis = { ...crawlerOptions.redis, port: redisPort };
        if (streamName) crawlerOptions.streamName = streamName;
        
        const crawlerInstance = new CheckScamCrawlerV2(crawlerOptions);
        const results = await crawlerInstance.crawlMultiple(links, { max: maxCrawl, delay });
        await crawlerInstance.saveResults(results);
        
        console.log(`\n✅ Crawl completed!`);
        console.log(`📊 Results: ${results.filter(r => r.success).length}/${results.length} successful`);
        
        // Cleanup Redis connection
        await crawlerInstance.cleanup();
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}
