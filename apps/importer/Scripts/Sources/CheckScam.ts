import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

import ValidationPusher from '../push-to-validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type StorageMode = 'daily_unified' | 'timestamp_file';

interface CrawlerOptions {
  flaresolverrUrl?: string;
  timeout?: number;
  delayMs?: number;
  maxRetries?: number;
  outputDir?: string;
  source?: string;
  storageMode?: StorageMode;
  retentionDays?: number;
  useRedis?: boolean;
  streamName?: string;
  pushToValidation?: boolean;
  validationOptions?: any;
}

interface ScamRecord {
  id?: string;
  url: string;
  title: string;
  description: string;
  category: string;
  reportCount: number;
  lastReported: string;
  status: string;
  tags: string[];
  metadata: {
    source: string;
    crawledAt: string;
    batch?: string;
    [key: string]: any;
  };
}

interface CrawlBatch {
  batchId: string;
  source: string;
  startTime: string;
  endTime?: string;
  totalRecords: number;
  successCount: number;
  failureCount: number;
  status: 'running' | 'completed' | 'failed';
  errors?: string[];
}

interface DailyMetadata {
  date: string;
  totalRecords: number;
  sources: Record<string, number>;
  batches: CrawlBatch[];
  lastUpdated: string;
}

interface FlaresolverrRequest {
  cmd: string;
  url: string;
  maxTimeout?: number;
}

interface FlaresolverrResponse {
  status: string;
  message: string;
  solution?: {
    status: number;
    response: string;
    cookies: any[];
    userAgent: string;
  };
}

export default class CheckScamCrawler {
  private flaresolverrUrl: string;
  private timeout: number;
  private delayMs: number;
  private maxRetries: number;
  private outputDir: string;
  private source: string;
  private storageMode: StorageMode;
  private retentionDays: number;
  private archiveDir: string;
  private useRedis: boolean;
  private streamName: string;
  private redis?: Redis;
  private validationPusher?: any;

  constructor(options: CrawlerOptions = {}) {
    this.flaresolverrUrl = options.flaresolverrUrl || process.env.FLARESOLVERR_URL || 'http://localhost:8191/v1';
    this.timeout = options.timeout || 60000;
    this.delayMs = options.delayMs || 5000;
    this.maxRetries = options.maxRetries || 3;
    this.outputDir = options.outputDir || path.join(__dirname, '../../Results');
    this.source = options.source || 'checkscam.vn';
    this.storageMode = options.storageMode || 'daily_unified';
    this.retentionDays = Number.isInteger(options.retentionDays) ? options.retentionDays! : 30;
    this.archiveDir = path.join(this.outputDir, 'archive');
    this.useRedis = options.useRedis || false;
    this.streamName = options.streamName || 'validation_requests';

    // Validation pipeline integration
    this.validationPusher = options.pushToValidation !== false ? new ValidationPusher(options.validationOptions) : null;

    // Redis setup for real-time streaming
    if (this.useRedis) {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 100, 2000)
      });
    }
  }

  async crawl(): Promise<ScamRecord[]> {
    const batchId = `${this.source}_${Date.now()}`;
    const batch: CrawlBatch = {
      batchId,
      source: this.source,
      startTime: new Date().toISOString(),
      totalRecords: 0,
      successCount: 0,
      failureCount: 0,
      status: 'running'
    };

    console.log(`🚀 Starting crawl batch: ${batchId}`);
    
    try {
      const results = await this.crawlCheckScamVN();
      
      batch.totalRecords = results.length;
      batch.successCount = results.length;
      batch.endTime = new Date().toISOString();
      batch.status = 'completed';
      
      console.log(`✅ Crawl completed: ${results.length} records`);
      
      // Save results with unified storage
      await this.saveResults(results, batch);
      
      // Push to validation pipeline
      if (this.validationPusher) {
        console.log('📤 Pushing to validation pipeline...');
        await this.validationPusher.pushBatch(results, { batchId, source: this.source });
      }
      
      return results;
      
    } catch (error) {
      batch.status = 'failed';
      batch.endTime = new Date().toISOString();
      batch.errors = [error instanceof Error ? error.message : String(error)];
      
      console.error('❌ Crawl failed:', error);
      
      // Save failed batch metadata
      await this.saveFailedBatch(batch);
      throw error;
    }
  }

  private async crawlCheckScamVN(): Promise<ScamRecord[]> {
    const baseUrl = 'https://checkscam.vn';
    const results: ScamRecord[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages && page <= 10) { // Limit to 10 pages for safety
      console.log(`📄 Crawling page ${page}...`);
      
      try {
        const pageUrl = `${baseUrl}/page/${page}`;
        const html = await this.fetchWithFlaresolverr(pageUrl);
        
        if (!html) {
          console.log(`⚠️  No content for page ${page}, stopping`);
          break;
        }

        const pageResults = this.parseCheckScamPage(html);
        
        if (pageResults.length === 0) {
          console.log(`📭 No results on page ${page}, stopping`);
          hasMorePages = false;
        } else {
          results.push(...pageResults);
          console.log(`✅ Page ${page}: ${pageResults.length} records`);
          page++;
          
          // Delay between requests
          await this.delay(this.delayMs);
        }
        
      } catch (error) {
        console.error(`❌ Error on page ${page}:`, error);
        hasMorePages = false;
      }
    }

    return results;
  }

  private async fetchWithFlaresolverr(url: string): Promise<string | null> {
    const payload: FlaresolverrRequest = {
      cmd: 'request.get',
      url: url,
      maxTimeout: this.timeout
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${this.maxRetries} for ${url}`);
        
        const response = await axios.post<FlaresolverrResponse>(this.flaresolverrUrl, payload, {
          timeout: this.timeout + 5000,
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.data.status === 'ok' && response.data.solution) {
          return response.data.solution.response;
        } else {
          throw new Error(`Flaresolverr error: ${response.data.message}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`⚠️  Attempt ${attempt} failed:`, lastError.message);
        
        if (attempt < this.maxRetries) {
          await this.delay(2000 * attempt); // Exponential backoff
        }
      }
    }

    console.error(`❌ All attempts failed for ${url}:`, lastError?.message);
    return null;
  }

  private parseCheckScamPage(html: string): ScamRecord[] {
    const results: ScamRecord[] = [];
    
    // Simple regex-based parsing (in production, use proper HTML parser like cheerio)
    const postRegex = /<article[^>]*class="[^"]*post[^"]*"[^>]*>(.*?)<\/article>/gs;
    const titleRegex = /<h[1-6][^>]*class="[^"]*entry-title[^"]*"[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/s;
    const contentRegex = /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>(.*?)<\/div>/s;
    const categoryRegex = /<span[^>]*class="[^"]*cat-links[^"]*"[^>]*>.*?<a[^>]*>(.*?)<\/a>/s;

    let match;
    while ((match = postRegex.exec(html)) !== null) {
      const postHtml = match[1];
      
      const titleMatch = titleRegex.exec(postHtml);
      const contentMatch = contentRegex.exec(postHtml);
      const categoryMatch = categoryRegex.exec(postHtml);

      if (titleMatch) {
        const url = titleMatch[1];
        const title = this.stripHtml(titleMatch[2]);
        const description = contentMatch ? this.stripHtml(contentMatch[1]).substring(0, 500) : '';
        const category = categoryMatch ? this.stripHtml(categoryMatch[1]) : 'Uncategorized';

        const record: ScamRecord = {
          url,
          title,
          description,
          category,
          reportCount: 1, // Default, would need additional parsing
          lastReported: new Date().toISOString(),
          status: 'active',
          tags: [category.toLowerCase()],
          metadata: {
            source: this.source,
            crawledAt: new Date().toISOString()
          }
        };

        results.push(record);
      }
    }

    return results;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  private async saveResults(results: ScamRecord[], batch: CrawlBatch): Promise<void> {
    switch (this.storageMode) {
      case 'daily_unified':
        await this.saveToDailyUnified(results, batch);
        break;
      case 'timestamp_file':
        await this.saveToTimestampFile(results, batch);
        break;
      default:
        throw new Error(`Unknown storage mode: ${this.storageMode}`);
    }

    // Auto-cleanup old files
    await this.cleanupOldFiles();
  }

  private async saveToDailyUnified(results: ScamRecord[], batch: CrawlBatch): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const dailyDir = path.join(this.outputDir, today);
    
    // Ensure daily directory exists
    await fs.mkdir(dailyDir, { recursive: true });
    
    const crawlResultsFile = path.join(dailyDir, 'crawl_results.json');
    const metadataFile = path.join(dailyDir, 'metadata.json');
    
    // Load existing data
    let existingResults: ScamRecord[] = [];
    let metadata: DailyMetadata;
    
    try {
      const existingData = await fs.readFile(crawlResultsFile, 'utf-8');
      existingResults = JSON.parse(existingData);
    } catch {
      // File doesn't exist yet, start fresh
    }
    
    try {
      const metadataData = await fs.readFile(metadataFile, 'utf-8');
      metadata = JSON.parse(metadataData);
    } catch {
      // Initialize metadata
      metadata = {
        date: today,
        totalRecords: 0,
        sources: {},
        batches: [],
        lastUpdated: new Date().toISOString()
      };
    }
    
    // Add batch ID to results
    results.forEach(result => {
      result.metadata.batch = batch.batchId;
    });
    
    // Merge results (avoid duplicates by URL)
    const existingUrls = new Set(existingResults.map(r => r.url));
    const newResults = results.filter(r => !existingUrls.has(r.url));
    
    const allResults = [...existingResults, ...newResults];
    
    // Update metadata
    metadata.totalRecords = allResults.length;
    metadata.sources[this.source] = (metadata.sources[this.source] || 0) + newResults.length;
    metadata.batches.push(batch);
    metadata.lastUpdated = new Date().toISOString();
    
    // Save files
    await fs.writeFile(crawlResultsFile, JSON.stringify(allResults, null, 2));
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));
    
    console.log(`💾 Saved ${newResults.length} new records to ${dailyDir}`);
    console.log(`📊 Daily total: ${allResults.length} records from ${Object.keys(metadata.sources).length} sources`);
  }

  private async saveToTimestampFile(results: ScamRecord[], batch: CrawlBatch): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${this.source}_crawl_${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);
    
    const output = {
      batch,
      results,
      metadata: {
        crawledAt: new Date().toISOString(),
        source: this.source,
        totalRecords: results.length
      }
    };
    
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(output, null, 2));
    
    console.log(`💾 Saved ${results.length} records to ${filepath}`);
  }

  private async saveFailedBatch(batch: CrawlBatch): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const dailyDir = path.join(this.outputDir, today);
    const failedFile = path.join(dailyDir, 'failed_crawls.json');
    
    await fs.mkdir(dailyDir, { recursive: true });
    
    let failedBatches: CrawlBatch[] = [];
    try {
      const existingData = await fs.readFile(failedFile, 'utf-8');
      failedBatches = JSON.parse(existingData);
    } catch {
      // File doesn't exist yet
    }
    
    failedBatches.push(batch);
    await fs.writeFile(failedFile, JSON.stringify(failedBatches, null, 2));
    
    console.log(`❌ Saved failed batch to ${failedFile}`);
  }

  private async cleanupOldFiles(): Promise<void> {
    if (this.retentionDays <= 0) return;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
    
    try {
      const entries = await fs.readdir(this.outputDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const folderDate = new Date(entry.name);
          
          if (folderDate < cutoffDate) {
            const folderPath = path.join(this.outputDir, entry.name);
            const archivePath = path.join(this.archiveDir, entry.name);
            
            await fs.mkdir(this.archiveDir, { recursive: true });
            await fs.rename(folderPath, archivePath);
            
            console.log(`🗂️  Archived old folder: ${entry.name}`);
          }
        }
      }
    } catch (error) {
      console.warn('⚠️  Cleanup failed:', error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  const crawler = new CheckScamCrawler({
    storageMode: 'daily_unified',
    pushToValidation: true
  });
  
  crawler.crawl()
    .then(results => {
      console.log(`🎉 Crawl completed successfully: ${results.length} records`);
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Crawl failed:', error);
      process.exit(1);
    })
    .finally(() => {
      crawler.close();
    });
}
