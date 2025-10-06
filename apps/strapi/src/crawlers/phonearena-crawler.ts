/**
 * PhoneArena Crawler
 * Backup source for phone specifications
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { PhoneData } from './types';
import { CRAWLER_CONFIG, PHONEARENA_CONFIG } from './config';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class PhoneArenaCrawler {
  private baseUrl = PHONEARENA_CONFIG.BASE_URL;
  private rateLimitMs = CRAWLER_CONFIG.RATE_LIMIT_MS;
  private maxRetries = CRAWLER_CONFIG.MAX_RETRIES;

  /**
   * Search for phone on PhoneArena
   */
  async searchPhone(productName: string): Promise<string | null> {
    const searchUrl = `${this.baseUrl}${PHONEARENA_CONFIG.SEARCH_PATH}?term=${encodeURIComponent(productName)}`;

    console.log(`  🔍 Searching PhoneArena: ${productName}`);

    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': CRAWLER_CONFIG.USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: this.baseUrl,
        },
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      const $ = cheerio.load(response.data);

      // PhoneArena search results
      const firstResult = $(PHONEARENA_CONFIG.SELECTORS.searchResults).first();
      const phoneUrl = firstResult.attr('href');

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

  /**
   * Crawl phone specifications from PhoneArena page
   */
  async crawlPhoneSpecs(phoneUrl: string): Promise<PhoneData | null> {
    console.log(`  📥 Crawling specs from: ${phoneUrl}`);

    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const response = await axios.get(phoneUrl, {
          headers: {
            'User-Agent': CRAWLER_CONFIG.USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          timeout: CRAWLER_CONFIG.TIMEOUT_MS,
        });

        const $ = cheerio.load(response.data);

        // Try to get structured data from JSON-LD
        let structuredData = null;
        const jsonLd = $(PHONEARENA_CONFIG.SELECTORS.jsonLd).html();

        if (jsonLd) {
          try {
            structuredData = JSON.parse(jsonLd);
          } catch (e) {
            // JSON-LD parsing failed, continue with HTML scraping
          }
        }

        // 1. Phone name
        const name = $(PHONEARENA_CONFIG.SELECTORS.phoneTitle).text().trim() || structuredData?.name;

        if (!name) {
          throw new Error('Phone name not found');
        }

        // 2. Specifications
        const specifications: Record<string, Record<string, string>> = {};
        let currentCategory = '';

        $(PHONEARENA_CONFIG.SELECTORS.specTable).each((i, row) => {
          const category = $(row).find(PHONEARENA_CONFIG.SELECTORS.specCategory).text().trim();
          const label = $(row).find(PHONEARENA_CONFIG.SELECTORS.specLabel).text().trim();
          const value = $(row).find(PHONEARENA_CONFIG.SELECTORS.specValue).text().trim();

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

        // 3. Images
        const images: string[] = [];

        if (structuredData?.image) {
          // Prefer structured data images
          if (Array.isArray(structuredData.image)) {
            images.push(...structuredData.image);
          } else {
            images.push(structuredData.image);
          }
        }

        // Scrape from gallery
        $(PHONEARENA_CONFIG.SELECTORS.galleryImages).each((i, img) => {
          const src = $(img).attr('src') || $(img).attr('data-src');
          if (src && !images.includes(src)) {
            images.push(src);
          }
        });

        console.log(
          `    ✓ Crawled: ${Object.keys(specifications).length} spec categories, ${images.length} images`
        );

        await sleep(this.rateLimitMs);

        return {
          name,
          images,
          specifications,
          quickSpecs: [],
          metadata: {
            sourceUrl: phoneUrl,
            scrapedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        retries++;
        console.error(`    ❌ Attempt ${retries}/${this.maxRetries} failed:`, error.message);

        if (retries < this.maxRetries) {
          const backoff = this.rateLimitMs * Math.pow(2, retries);
          console.log(`    ⏳ Retrying in ${backoff}ms...`);
          await sleep(backoff);
        }
      }
    }

    console.error(`    ❌ Failed after ${this.maxRetries} attempts`);
    return null;
  }

  /**
   * Main method: Search + Crawl
   */
  async getPhoneData(productName: string): Promise<PhoneData | null> {
    const phoneUrl = await this.searchPhone(productName);
    if (!phoneUrl) return null;

    return await this.crawlPhoneSpecs(phoneUrl);
  }
}
