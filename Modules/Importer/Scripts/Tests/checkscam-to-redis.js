import CheckScamCrawlerV2 from '../CheckScamCrawlerV2.js';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

class CheckScamToRedis {
    constructor(options = {}) {
        this.crawler = new CheckScamCrawlerV2(options.crawler || {});
        this.redis = new Redis({
            host: options.redis?.host || 'localhost',
            port: options.redis?.port || 6379,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
        });
        this.streamName = options.streamName || 'validation_requests';
        this.batchId = `checkscam_${Date.now()}`;
        this.sequence = 0;
    }

    async sendToRedis(scammerData) {
        try {
            this.sequence++;
            
            // Transform crawler data to validation format
            const validationData = {
                // Required fields for validation
                phone: scammerData.phone || '',
                bank_account: scammerData.bankAccount || '',
                email: scammerData.email || '',
                name: scammerData.name || scammerData.title || '',
                
                // Source tracking
                source: 'checkscam_crawler',
                scrape_url: scammerData.url,
                batch_id: this.batchId,
                sequence: this.sequence,
                timestamp: new Date().toISOString(),
                
                // Additional checkscam data
                scam_type: scammerData.scamType,
                description: scammerData.description,
                reported_date: scammerData.reportedDate,
                status: scammerData.status,
                
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
            console.log(`📊 Data: ${scammerData.name || scammerData.title} | Phone: ${scammerData.phone} | Bank: ${scammerData.bankAccount}`);
            
            return messageId;
        } catch (error) {
            console.error('❌ Failed to send to Redis:', error.message);
            throw error;
        }
    }

    async crawlAndSend(urls) {
        console.log(`🚀 Starting CheckScam crawl and Redis integration`);
        console.log(`📡 Redis stream: ${this.streamName}`);
        console.log(`🔢 Batch ID: ${this.batchId}`);
        console.log(`📋 URLs to crawl: ${urls.length}`);
        
        const results = {
            success: 0,
            failed: 0,
            sent_to_redis: 0,
            errors: []
        };

        for (const url of urls) {
            try {
                console.log(`\n🔍 Crawling: ${url}`);
                
                // Crawl the URL
                const scammerData = await this.crawler.crawlSingle(url);
                
                if (scammerData && Object.keys(scammerData).length > 0) {
                    // Send to Redis stream
                    await this.sendToRedis(scammerData);
                    results.success++;
                    results.sent_to_redis++;
                } else {
                    console.log(`⚠️ No data extracted from ${url}`);
                    results.failed++;
                }
                
                // Delay between requests
                if (this.crawler.delayMs > 0) {
                    console.log(`⏳ Waiting ${this.crawler.delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.crawler.delayMs));
                }
                
            } catch (error) {
                console.error(`❌ Error processing ${url}:`, error.message);
                results.failed++;
                results.errors.push({ url, error: error.message });
            }
        }

        console.log(`\n📊 Final Results:`);
        console.log(`✅ Success: ${results.success}`);
        console.log(`❌ Failed: ${results.failed}`);
        console.log(`📡 Sent to Redis: ${results.sent_to_redis}`);
        console.log(`🔢 Batch ID: ${this.batchId}`);

        return results;
    }

    async close() {
        await this.redis.quit();
        console.log('🔌 Redis connection closed');
    }
}

// CLI support
if (process.argv[1] && process.argv[1].endsWith('checkscam-to-redis.js')) {
    const urls = process.argv.slice(2);
    
    if (urls.length === 0) {
        console.log(`
🚀 CheckScam to Redis Integration

Usage: node checkscam-to-redis.js <url1> [url2] [url3] ...

Examples:
  node checkscam-to-redis.js "https://checkscam.com/scammer/123"
  node checkscam-to-redis.js "https://checkscam.com/scammer/123" "https://checkscam.com/scammer/456"

Environment Variables:
  FLARESOLVERR_URL - FlareSolverr endpoint (default: http://localhost:8191/v1)
  REDIS_HOST - Redis host (default: localhost)
  REDIS_PORT - Redis port (default: 6379)
        `);
        process.exit(1);
    }

    const crawler = new CheckScamToRedis({
        crawler: {
            flaresolverrUrl: process.env.FLARESOLVERR_URL,
            delayMs: 3000, // 3 seconds between requests
            maxRetries: 3
        },
        redis: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT
        }
    });

    try {
        await crawler.crawlAndSend(urls);
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    } finally {
        await crawler.close();
    }
}

export default CheckScamToRedis;
