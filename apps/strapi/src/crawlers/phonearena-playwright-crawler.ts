/**
 * PhoneArena Crawler (Playwright Version)
 * Backup source with Playwright for anti-scraping protection
 */

import { chromium, type Browser } from 'playwright';
import type { PhoneData } from './types.js';
import { CRAWLER_CONFIG, PHONEARENA_CONFIG } from './config.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PhoneArenaPlaywrightCrawler {
  private browser: Browser | null = null;
  private baseUrl = PHONEARENA_CONFIG.BASE_URL;
  private rateLimitMs = CRAWLER_CONFIG.RATE_LIMIT_MS;

  async init() {
    if (this.browser) return;
    console.log(`  🌐 Launching browser (PhoneArena)...`);
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async searchPhone(productName: string): Promise<string | null> {
    await this.init();

    const searchUrl = `${this.baseUrl}${PHONEARENA_CONFIG.SEARCH_PATH}?term=${encodeURIComponent(productName)}`;
    console.log(`  🔍 Searching PhoneArena (Playwright): ${productName}`);

    try {
      const page = await this.browser!.newPage();
      await page.setExtraHTTPHeaders({ 'User-Agent': CRAWLER_CONFIG.USER_AGENT });

      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      await page.waitForSelector('.s-search-result-item, .no-results', { timeout: 5000 }).catch(() => {});

      const phoneUrl = await page.evaluate(() => {
        const firstLink = document.querySelector('.s-search-result-item .s-hover-title');
        return firstLink ? firstLink.getAttribute('href') : null;
      });

      await page.close();

      if (!phoneUrl) {
        console.log(`    ❌ Not found on PhoneArena`);
        return null;
      }

      const fullUrl = phoneUrl.startsWith('http') ? phoneUrl : `${this.baseUrl}${phoneUrl}`;
      console.log(`    ✓ Found: ${fullUrl}`);

      await sleep(this.rateLimitMs);
      return fullUrl;
    } catch (error) {
      console.error(`    ❌ PhoneArena search failed:`, error.message);
      return null;
    }
  }

  async crawlPhoneSpecs(phoneUrl: string): Promise<PhoneData | null> {
    await this.init();
    console.log(`  📥 Crawling specs from: ${phoneUrl}`);

    try {
      const page = await this.browser!.newPage();
      await page.setExtraHTTPHeaders({ 'User-Agent': CRAWLER_CONFIG.USER_AGENT });

      await page.goto(phoneUrl, {
        waitUntil: 'domcontentloaded',
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      await page.waitForSelector('h1.phone-title, .specs-table', { timeout: 5000 });

      const data = await page.evaluate(() => {
        const name = document.querySelector('h1.phone-title')?.textContent?.trim() || '';

        const specifications: Record<string, Record<string, string>> = {};
        let currentCategory = '';

        document.querySelectorAll('.specs-table tr').forEach((row) => {
          const category = row.querySelector('.specs-table-category')?.textContent?.trim();
          const label = row.querySelector('.specs-table-label')?.textContent?.trim();
          const value = row.querySelector('.specs-table-value')?.textContent?.trim();

          if (category) {
            currentCategory = category;
            if (!specifications[currentCategory]) {
              specifications[currentCategory] = {};
            }
          }

          if (currentCategory && label && value) {
            specifications[currentCategory][label] = value;
          }
        });

        const images: string[] = [];
        document.querySelectorAll('.phone-gallery img').forEach((img) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src');
          if (src && !images.includes(src)) images.push(src);
        });

        // Try JSON-LD
        const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
        let structuredData = null;
        if (jsonLdScript?.textContent) {
          try {
            structuredData = JSON.parse(jsonLdScript.textContent);
            if (structuredData?.image) {
              const jsonImages = Array.isArray(structuredData.image)
                ? structuredData.image
                : [structuredData.image];
              jsonImages.forEach((img) => {
                if (!images.includes(img)) images.push(img);
              });
            }
          } catch (e) {}
        }

        return { name, specifications, images };
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
        quickSpecs: [],
        metadata: {
          sourceUrl: phoneUrl,
          scrapedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error(`    ❌ Failed to crawl specs:`, error.message);
      return null;
    }
  }

  async getPhoneData(productName: string): Promise<PhoneData | null> {
    try {
      const phoneUrl = await this.searchPhone(productName);
      if (!phoneUrl) return null;
      return await this.crawlPhoneSpecs(phoneUrl);
    } finally {
      await this.close();
    }
  }
}
