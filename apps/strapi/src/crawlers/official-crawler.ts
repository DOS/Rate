/**
 * Official Brand Website Crawlers
 * Supplement official specifications from brand websites
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { PhoneData } from './types';
import { CRAWLER_CONFIG, OFFICIAL_BRANDS } from './config';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class OfficialBrandCrawler {
  private rateLimitMs = CRAWLER_CONFIG.RATE_LIMIT_MS;

  /**
   * Crawl Apple official specs
   * @param productSlug - URL slug (e.g., "iphone-16-pro")
   */
  async crawlApple(productSlug: string): Promise<PhoneData | null> {
    const config = OFFICIAL_BRANDS.Apple;
    const url = `${config.baseUrl}${config.specsPath.replace('{slug}', productSlug)}`;

    console.log(`  🍎 Crawling Apple: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': CRAWLER_CONFIG.USER_AGENT,
        },
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      const $ = cheerio.load(response.data);

      // Apple has JSON-LD structured data
      let jsonData = null;
      const jsonLdScript = $(config.selectors.jsonLd).html();

      if (jsonLdScript) {
        try {
          jsonData = JSON.parse(jsonLdScript);
        } catch (e) {
          // JSON-LD parsing failed
        }
      }

      // Crawl specs from HTML
      const specifications: Record<string, Record<string, string>> = {};

      $(config.selectors.specColumns).each((i, column) => {
        const category = $(column).find(config.selectors.specHeadline).text().trim();
        const specs: Record<string, string> = {};

        $(column)
          .find(config.selectors.specItems)
          .each((j, item) => {
            const label = $(item).find(config.selectors.specLabel).text().trim();
            const value = $(item).find(config.selectors.specValue).text().trim();
            if (label) specs[label] = value;
          });

        if (Object.keys(specs).length > 0) {
          specifications[category] = specs;
        }
      });

      // Images
      const images: string[] = [];
      if (jsonData?.image) {
        images.push(...(Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image]));
      }

      $(config.selectors.images).each((i, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src');
        if (src) {
          images.push(src.startsWith('//') ? 'https:' + src : src);
        }
      });

      const name = $(config.selectors.specHeadline).first().text().trim() || jsonData?.name;

      console.log(`    ✓ Apple: ${Object.keys(specifications).length} categories`);

      await sleep(this.rateLimitMs);

      return {
        name,
        images,
        specifications,
        quickSpecs: [],
        metadata: {
          sourceUrl: url,
          scrapedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.log(`    ❌ Apple crawl failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Crawl Samsung official specs
   * Note: Samsung may require Playwright due to dynamic content
   */
  async crawlSamsung(productSlug: string): Promise<PhoneData | null> {
    const config = OFFICIAL_BRANDS.Samsung;

    if (config.requiresPlaywright) {
      console.log(`    ⚠️  Samsung requires Playwright - not implemented yet`);
      return null;
    }

    const url = `${config.baseUrl}${config.specsPath.replace('{slug}', productSlug)}`;

    console.log(`  📱 Crawling Samsung: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': CRAWLER_CONFIG.USER_AGENT,
        },
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      // TODO: Implement Samsung scraping
      // Samsung uses dynamic content, may need to find API endpoint
      // or use Playwright

      console.log(`    ⚠️  Samsung scraping not fully implemented`);
      return null;
    } catch (error) {
      console.log(`    ❌ Samsung crawl failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Crawl Xiaomi official specs
   */
  async crawlXiaomi(productSlug: string): Promise<PhoneData | null> {
    const config = OFFICIAL_BRANDS.Xiaomi;
    const url = `${config.baseUrl}${config.specsPath.replace('{slug}', productSlug)}`;

    console.log(`  📱 Crawling Xiaomi: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': CRAWLER_CONFIG.USER_AGENT,
        },
        timeout: CRAWLER_CONFIG.TIMEOUT_MS,
      });

      // TODO: Implement Xiaomi scraping
      // Need to inspect Xiaomi's website structure

      console.log(`    ⚠️  Xiaomi scraping not fully implemented`);
      return null;
    } catch (error) {
      console.log(`    ❌ Xiaomi crawl failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Main method: Crawl from official brand website
   * @param brand - Brand name (Apple, Samsung, Xiaomi)
   * @param productSlug - URL slug for the product
   */
  async crawlBrand(brand: string, productSlug: string): Promise<PhoneData | null> {
    switch (brand.toLowerCase()) {
      case 'apple':
        return await this.crawlApple(productSlug);
      case 'samsung':
        return await this.crawlSamsung(productSlug);
      case 'xiaomi':
        return await this.crawlXiaomi(productSlug);
      default:
        console.log(`    ⚠️  Brand ${brand} not supported`);
        return null;
    }
  }

  /**
   * Generate official website slug from product name
   * @param productName - Product name (e.g., "iPhone 16 Pro")
   * @param brand - Brand name
   */
  generateSlug(productName: string, brand: string): string {
    // Convert "iPhone 16 Pro" -> "iphone-16-pro"
    return productName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }
}
