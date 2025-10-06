/**
 * GSMArena Crawler (Playwright Version)
 * Uses Playwright to bypass anti-scraping protection
 */

import { chromium, type Browser, type Page } from 'playwright';
import type { PhoneData } from './types.js';
import { CRAWLER_CONFIG, GSMARENA_CONFIG } from './config.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GSMArenaPlaywrightCrawler {
  private browser: Browser | null = null;
  private baseUrl = GSMARENA_CONFIG.BASE_URL;
  private rateLimitMs = CRAWLER_CONFIG.RATE_LIMIT_MS;

  /**
   * Initialize browser
   */
  async init() {
    if (this.browser) return;

    console.log(`  🌐 Launching browser...`);
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Search for phone on GSMArena
   */
  async searchPhone(productName: string): Promise<string | null> {
    await this.init();

    const searchUrl = `${this.baseUrl}${GSMARENA_CONFIG.SEARCH_PATH}?sSearch=${encodeURIComponent(productName)}`;

    console.log(`  🔍 Searching GSMArena (Playwright): ${productName}`);

    try {
      const page = await this.browser!.newPage();

      // Set user agent
      await page.setExtraHTTPHeaders({
        'User-Agent': CRAWLER_CONFIG.USER_AGENT,
      });

      // Navigate to search page
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      // Wait for results to load
      await page.waitForSelector('.makers, .no-results', { timeout: 5000 }).catch(() => {
        // Selector might not exist
      });

      // Get first result
      const phoneUrl = await page.evaluate(() => {
        const firstLink = document.querySelector('.makers li a');
        return firstLink ? firstLink.getAttribute('href') : null;
      });

      await page.close();

      if (!phoneUrl) {
        console.log(`    ❌ Not found on GSMArena`);
        return null;
      }

      const fullUrl = `${this.baseUrl}/${phoneUrl}`;
      console.log(`    ✓ Found: ${fullUrl}`);

      await sleep(this.rateLimitMs);
      return fullUrl;
    } catch (error) {
      console.error(`    ❌ GSMArena search failed:`, error.message);
      return null;
    }
  }

  /**
   * Crawl phone specifications from phone page
   */
  async crawlPhoneSpecs(phoneUrl: string): Promise<PhoneData | null> {
    await this.init();

    console.log(`  📥 Crawling specs from: ${phoneUrl}`);

    try {
      const page = await this.browser!.newPage();

      // Set user agent
      await page.setExtraHTTPHeaders({
        'User-Agent': CRAWLER_CONFIG.USER_AGENT,
      });

      // Navigate to phone page
      await page.goto(phoneUrl, {
        waitUntil: 'domcontentloaded',
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      // Wait for specs to load
      await page.waitForSelector('.specs-phone-name-title, #specs-list', { timeout: 5000 });

      // Extract data using page.evaluate
      const data = await page.evaluate(() => {
        // 1. Phone name
        const nameEl = document.querySelector('.specs-phone-name-title');
        const name = nameEl?.textContent?.trim() || '';

        // 2. Images
        const images: string[] = [];

        // Main image
        const mainImg = document.querySelector('.specs-photo-main img');
        if (mainImg) {
          let src = mainImg.getAttribute('src') || '';
          if (src.startsWith('//')) src = 'https:' + src;
          if (src) images.push(src);
        }

        // Gallery images
        document.querySelectorAll('#pictures-list img').forEach((img) => {
          let src = img.getAttribute('src') || '';
          if (src) {
            // Convert thumbnail to large
            src = src.replace('thumb', 'big');
            if (src.startsWith('//')) src = 'https:' + src;
            images.push(src);
          }
        });

        // 3. Specifications
        const specifications: Record<string, Record<string, string>> = {};

        document.querySelectorAll('#specs-list table').forEach((table) => {
          // Category name
          const categoryEl = table.querySelector('th');
          const categoryName = categoryEl?.textContent?.trim() || '';

          const specs: Record<string, string> = {};

          // Spec rows
          table.querySelectorAll('tr').forEach((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 2) {
              const key = cells[0].textContent?.trim() || '';
              const value = cells[1].textContent?.trim() || '';

              if (key && value) {
                specs[key] = value;
              }
            }
          });

          if (Object.keys(specs).length > 0 && categoryName) {
            specifications[categoryName] = specs;
          }
        });

        // 4. Quick specs
        const quickSpecs: string[] = [];
        document.querySelectorAll('.specs-brief li').forEach((li) => {
          const text = li.textContent?.trim();
          if (text) quickSpecs.push(text);
        });

        // 5. Metadata
        const popularity = document.querySelector('.help-popularity span')?.textContent?.trim() || '';

        return {
          name,
          images,
          specifications,
          quickSpecs,
          popularity,
        };
      });

      await page.close();

      if (!data.name) {
        throw new Error('Phone name not found');
      }

      console.log(
        `    ✓ Crawled: ${Object.keys(data.specifications).length} spec categories, ${data.images.length} images`
      );

      await sleep(this.rateLimitMs);

      return {
        name: data.name,
        images: data.images,
        specifications: data.specifications,
        quickSpecs: data.quickSpecs,
        metadata: {
          releaseDate: data.specifications['Launch']?.['Announced'],
          status: data.specifications['Launch']?.['Status'],
          popularity: data.popularity,
          sourceUrl: phoneUrl,
          scrapedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error(`    ❌ Failed to crawl specs:`, error.message);
      return null;
    }
  }

  /**
   * Main method: Search + Crawl
   */
  async getPhoneData(productName: string): Promise<PhoneData | null> {
    try {
      const phoneUrl = await this.searchPhone(productName);
      if (!phoneUrl) return null;

      return await this.crawlPhoneSpecs(phoneUrl);
    } finally {
      // Always close browser when done
      await this.close();
    }
  }
}
