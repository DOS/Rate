/**
 * Tier 1: PhoneArena Direct Scraper
 *
 * Adapter cho PhoneArena crawler hiện tại (apps/importer/phonearena/)
 * để tích hợp vào ScraperOrchestrator
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BaseTier1Scraper } from './base';
import type { ScraperResult } from '../../types/scraper-types';
import type { PhoneArenaRawData } from '../../types';

const execAsync = promisify(exec);

export interface PhoneArenaScraperConfig {
  scriptsPath?: string; // Path to apps/importer/phonearena/
  outputPath?: string; // Path to save crawled data
}

export class PhoneArenaScraper extends BaseTier1Scraper<PhoneArenaRawData> {
  name = 'PhoneArena Direct Scraper';
  tier: 1 | 2 | 3 = 1;

  private config: PhoneArenaScraperConfig;

  constructor(config: PhoneArenaScraperConfig = {}) {
    super();
    this.config = {
      scriptsPath: config.scriptsPath || path.join(process.cwd(), 'apps/importer/phonearena'),
      outputPath: config.outputPath || path.join(process.cwd(), 'apps/strapi/Data/crawled'),
    };
  }

  canHandle(url: string): boolean {
    return url.includes('phonearena.com/phones/');
  }

  async scrape(url: string): Promise<ScraperResult<PhoneArenaRawData>> {
    try {
      console.log(`  🎯 PhoneArena scraper: ${url}`);

      // Extract phone ID from URL
      // https://www.phonearena.com/phones/Xiaomi-17_id12857 → 12857
      const phoneId = this.extractPhoneId(url);
      if (!phoneId) {
        return this.error('Cannot extract phone ID from URL');
      }

      // Run crawl script
      const crawlScript = path.join(this.config.scriptsPath!, 'crawl-single.ts');
      const outputFile = await this.runCrawlScript(crawlScript, url);

      // Read crawled data
      const rawData = await this.readCrawledData(outputFile);

      return this.success(rawData);
    } catch (error: any) {
      return this.error(error.message);
    }
  }

  /**
   * Extract phone ID from PhoneArena URL
   */
  private extractPhoneId(url: string): string | null {
    const match = url.match(/_id(\d+)$/);
    return match ? match[1] : null;
  }

  /**
   * Run PhoneArena crawl script
   */
  private async runCrawlScript(scriptPath: string, url: string): Promise<string> {
    // Generate output filename
    const timestamp = Date.now();
    const outputFile = path.join(this.config.outputPath!, `phonearena-single-${timestamp}.json`);

    // Run crawl script via tsx
    const command = `yarn tsx ${scriptPath} ${url} ${outputFile}`;

    console.log(`  🚀 Running: ${command}`);

    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 60000, // 60s timeout
    });

    if (stderr && !stderr.includes('warning')) {
      console.warn('  ⚠️  Crawler stderr:', stderr);
    }

    console.log(`  ✅ Crawled to: ${outputFile}`);

    return outputFile;
  }

  /**
   * Read crawled data from JSON file
   */
  private async readCrawledData(filePath: string): Promise<PhoneArenaRawData> {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    // Handle array or single object
    if (Array.isArray(data)) {
      if (data.length === 0) {
        throw new Error('No data in crawled file');
      }
      return data[0];
    }

    return data;
  }
}
