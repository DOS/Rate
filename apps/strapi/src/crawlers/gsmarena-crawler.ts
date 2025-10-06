/**
 * GSMArena Crawler
 * Primary source for phone specifications
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { PhoneData } from './types';
import { CRAWLER_CONFIG, GSMARENA_CONFIG } from './config';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class GSMArenaCrawler {
  private baseUrl = GSMARENA_CONFIG.BASE_URL;
  private rateLimitMs = CRAWLER_CONFIG.RATE_LIMIT_MS;
  private maxRetries = CRAWLER_CONFIG.MAX_RETRIES;

  /**
   * Search for phone on GSMArena
   * @param productName - Product name to search
   * @returns Phone page URL or null if not found
   */
  async searchPhone(productName: string): Promise<string | null> {
    const searchUrl = `${this.baseUrl}${GSMARENA_CONFIG.SEARCH_PATH}?sSearch=${encodeURIComponent(productName)}`;

    console.log(`  🔍 Searching GSMArena: ${productName}`);

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

      // Get first result (most relevant)
      const firstResult = $(GSMARENA_CONFIG.SELECTORS.searchResults).first();
      const phoneUrl = firstResult.attr('href');

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
   * Crawl phone specifications from GSMArena page
   * @param phoneUrl - Full URL to phone page
   * @returns Phone data or null if failed
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

        // 1. Phone name
        const name = $(GSMARENA_CONFIG.SELECTORS.phoneName).text().trim();

        if (!name) {
          throw new Error('Phone name not found');
        }

        // 2. Images
        const images: string[] = [];

        // Main image
        const mainImg = $(GSMARENA_CONFIG.SELECTORS.mainImage).attr('src');
        if (mainImg) {
          images.push(mainImg.startsWith('//') ? 'https:' + mainImg : mainImg);
        }

        // Gallery images
        $(GSMARENA_CONFIG.SELECTORS.galleryImages).each((i, img) => {
          const src = $(img).attr('src');
          if (src) {
            // Convert thumbnail to large
            const largeSrc = src.replace('thumb', 'big');
            images.push(largeSrc.startsWith('//') ? 'https:' + largeSrc : largeSrc);
          }
        });

        // 3. Specifications (most important)
        const specifications: Record<string, Record<string, string>> = {};

        $(GSMARENA_CONFIG.SELECTORS.specTables).each((i, table) => {
          // Each table is a category (Launch, Body, Display, Platform, etc.)
          const categoryName = $(table).find(GSMARENA_CONFIG.SELECTORS.specCategory).first().text().trim();
          const specs: Record<string, string> = {};

          $(table)
            .find(GSMARENA_CONFIG.SELECTORS.specRow)
            .each((j, row) => {
              const cells = $(row).find('td');
              if (cells.length === 2) {
                const key = $(cells[0]).text().trim();
                const value = $(cells[1]).text().trim();

                if (key && value) {
                  specs[key] = value;
                }
              }
            });

          if (Object.keys(specs).length > 0 && categoryName) {
            specifications[categoryName] = specs;
          }
        });

        // 4. Quick specs (highlights)
        const quickSpecs: string[] = [];
        $(GSMARENA_CONFIG.SELECTORS.quickSpecs).each((i, li) => {
          const text = $(li).text().trim();
          if (text) quickSpecs.push(text);
        });

        // 5. Metadata
        const releaseDate = specifications['Launch']?.['Announced'];
        const status = specifications['Launch']?.['Status'];

        // 6. Popularity score (if available)
        const popularity = $(GSMARENA_CONFIG.SELECTORS.popularity).text().trim();

        console.log(
          `    ✓ Crawled: ${Object.keys(specifications).length} spec categories, ${images.length} images`
        );

        await sleep(this.rateLimitMs);

        return {
          name,
          images,
          specifications,
          quickSpecs,
          metadata: {
            releaseDate,
            status,
            popularity,
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
   * @param productName - Product name to search and crawl
   * @returns Phone data or null
   */
  async getPhoneData(productName: string): Promise<PhoneData | null> {
    const phoneUrl = await this.searchPhone(productName);
    if (!phoneUrl) return null;

    return await this.crawlPhoneSpecs(phoneUrl);
  }
}
