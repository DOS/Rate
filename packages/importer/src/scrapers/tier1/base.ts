/**
 * Base scraper for Tier 1 (Direct scraping)
 */

import type { IScraper, ScraperResult } from '../../types/scraper-types';

export abstract class BaseTier1Scraper<T = any> implements IScraper<T> {
  abstract name: string;
  tier: 1 | 2 | 3 = 1;

  abstract canHandle(url: string): boolean;
  abstract scrape(url: string): Promise<ScraperResult<T>>;

  /**
   * Create success result
   */
  protected success(data: T, cached = false): ScraperResult<T> {
    return {
      success: true,
      data,
      source: this.name,
      tier: this.tier,
      cached,
      timestamp: new Date(),
    };
  }

  /**
   * Create error result
   */
  protected error(error: string): ScraperResult<T> {
    return {
      success: false,
      error,
      source: this.name,
      tier: this.tier,
      timestamp: new Date(),
    };
  }
}
