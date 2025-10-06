/**
 * Crawler Orchestrator
 * Coordinates multi-source crawling with priority logic
 */

import type { CrawledData, QueueItem, PhoneData } from './types.js';
import { SOURCE_PRIORITY } from './config.js';
import { GSMArenaPlaywrightCrawler } from './gsmarena-playwright-crawler.js';
import { PhoneArenaPlaywrightCrawler } from './phonearena-playwright-crawler.js';
import { OfficialBrandCrawler } from './official-crawler.js';

export class CrawlerOrchestrator {
  private gsmarena = new GSMArenaPlaywrightCrawler(); // Using Playwright version
  private phonearena = new PhoneArenaPlaywrightCrawler(); // Using Playwright version
  private official = new OfficialBrandCrawler();

  /**
   * Crawl phone from multiple sources with priority
   * @param item - Queue item with product information
   * @returns Array of crawled data from successful sources
   */
  async crawlPhone(item: QueueItem): Promise<CrawledData[]> {
    const results: CrawledData[] = [];
    const productName = item.name;
    const brand = item.brand;
    const category = item.category;

    console.log(`\n📱 Crawling: ${productName} (${brand}, ${category})`);

    // Get source priority for this category
    const sources = SOURCE_PRIORITY[category] || SOURCE_PRIORITY.phones;

    // Priority 1: GSMArena (for phones)
    if (category === 'phones') {
      try {
        console.log(`  [1/4] Trying GSMArena...`);
        const gsmarenaData = await this.gsmarena.getPhoneData(productName);

        if (gsmarenaData && this.validateData(gsmarenaData)) {
          results.push({
            source: 'GSMArena',
            rank: 1,
            reliability: 0.95,
            data: gsmarenaData,
          });
          console.log(`  ✅ GSMArena: SUCCESS`);
        } else {
          console.log(`  ❌ GSMArena: NO DATA`);
        }
      } catch (error) {
        console.log(`  ❌ GSMArena: FAILED - ${error.message}`);
      }
    }

    // Priority 2: PhoneArena (for phones)
    if (category === 'phones') {
      try {
        console.log(`  [2/4] Trying PhoneArena...`);
        const phonearenaData = await this.phonearena.getPhoneData(productName);

        if (phonearenaData && this.validateData(phonearenaData)) {
          results.push({
            source: 'PhoneArena',
            rank: 2,
            reliability: 0.92,
            data: phonearenaData,
          });
          console.log(`  ✅ PhoneArena: SUCCESS`);
        } else {
          console.log(`  ❌ PhoneArena: NO DATA`);
        }
      } catch (error) {
        console.log(`  ❌ PhoneArena: FAILED - ${error.message}`);
      }
    }

    // Early stopping: If we have data from top 2 sources, stop
    if (results.length >= 2 && results[0].rank <= 2) {
      console.log(`  ✓ Enough data from ${results.length} sources (early stop)`);
      return results;
    }

    // Priority 3: Official Brand Website (if flagship brand)
    const flagshipBrands = ['Apple', 'Samsung', 'Xiaomi', 'Dell', 'HP', 'Lenovo'];
    if (flagshipBrands.includes(brand)) {
      try {
        console.log(`  [3/4] Trying ${brand} Official...`);
        const slug = this.official.generateSlug(productName, brand);
        const officialData = await this.official.crawlBrand(brand, slug);

        if (officialData && this.validateData(officialData)) {
          results.push({
            source: `${brand} Official`,
            rank: 3,
            reliability: 0.98,
            data: officialData,
          });
          console.log(`  ✅ ${brand} Official: SUCCESS`);
        } else {
          console.log(`  ❌ ${brand} Official: NO DATA`);
        }
      } catch (error) {
        console.log(`  ❌ ${brand} Official: FAILED - ${error.message}`);
      }
    }

    // Priority 4: Wikipedia (fallback - not implemented yet)
    if (results.length === 0) {
      console.log(`  [4/4] All sources failed, would try Wikipedia as fallback`);
      console.log(`  ⚠️  Wikipedia crawler not implemented yet`);
    }

    if (results.length === 0) {
      console.log(`  ❌ NO DATA from any source`);
    } else {
      console.log(`  ✅ Got data from ${results.length} source(s)`);
    }

    return results;
  }

  /**
   * Crawl laptop from multiple sources
   * @param item - Queue item with product information
   * @returns Array of crawled data
   */
  async crawlLaptop(item: QueueItem): Promise<CrawledData[]> {
    // TODO: Implement laptop-specific crawlers (NotebookCheck, etc.)
    console.log(`⚠️  Laptop crawling not implemented yet`);
    return [];
  }

  /**
   * Main method: Route to appropriate crawler based on category
   * @param item - Queue item
   * @returns Array of crawled data
   */
  async crawl(item: QueueItem): Promise<CrawledData[]> {
    switch (item.category) {
      case 'phones':
        return await this.crawlPhone(item);
      case 'laptops':
        return await this.crawlLaptop(item);
      default:
        console.log(`⚠️  Category ${item.category} not supported yet`);
        return [];
    }
  }

  /**
   * Validate crawled data has minimum required fields
   */
  private validateData(data: PhoneData): boolean {
    if (!data.name) return false;
    if (!data.specifications || Object.keys(data.specifications).length === 0) return false;
    if (!data.images || data.images.length === 0) return false;
    return true;
  }
}
