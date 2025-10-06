/**
 * Scraper Orchestrator - 3-Tier Fallback Strategy
 *
 * Tier 1: Direct scraping (PhoneArena, GSMArena) - Free, fast
 * Tier 2: LLM web scraping - Moderate cost, flexible
 * Tier 3: Paid APIs (techspecs.io) - Reliable, expensive
 */

import type { IScraper, ScraperResult, OrchestratorConfig } from '../types/scraper-types';
import { CacheManager } from './cache-manager';

export class ScraperOrchestrator {
  private scrapers: Map<number, IScraper[]> = new Map();
  private config: OrchestratorConfig;
  private cache: CacheManager;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.scrapers.set(1, []);
    this.scrapers.set(2, []);
    this.scrapers.set(3, []);

    // Initialize cache
    this.cache = new CacheManager({
      enabled: config.cache.enabled,
      ttl: {
        tier1: config.cache.ttl || 7 * 24 * 60 * 60,
        tier2: config.cache.ttl ? config.cache.ttl * 4 : 30 * 24 * 60 * 60,
        tier3: config.cache.ttl ? config.cache.ttl * 12 : 90 * 24 * 60 * 60,
      },
    });
  }

  /**
   * Register scraper
   */
  registerScraper(scraper: IScraper) {
    const tierScrapers = this.scrapers.get(scraper.tier) || [];
    tierScrapers.push(scraper);
    this.scrapers.set(scraper.tier, tierScrapers);
    console.log(`✅ Registered scraper: ${scraper.name} (Tier ${scraper.tier})`);
  }

  /**
   * Scrape with fallback strategy
   */
  async scrape<T = any>(url: string): Promise<ScraperResult<T>> {
    console.log(`\n🔍 Starting scrape for: ${url}`);

    // Check cache first
    const cached = await this.cache.get<T>(url);
    if (cached) {
      console.log(`✅ Cache hit! (Tier ${cached.tier})`);
      return cached;
    }

    // Try each tier in order
    for (let tier = 1; tier <= 3; tier++) {
      const tierScrapers = this.scrapers.get(tier) || [];

      if (tierScrapers.length === 0) {
        console.log(`⚠️  Tier ${tier}: No scrapers available, skipping`);
        continue;
      }

      console.log(`\n📍 Trying Tier ${tier} scrapers...`);

      for (const scraper of tierScrapers) {
        if (!scraper.canHandle(url)) {
          console.log(`  ⏭️  ${scraper.name}: Cannot handle this URL`);
          continue;
        }

        try {
          console.log(`  🚀 ${scraper.name}: Attempting scrape...`);
          const result = await scraper.scrape(url);

          if (result.success && result.data) {
            console.log(`  ✅ ${scraper.name}: Success!`);

            // Cache the result
            await this.cache.set(url, result);

            return result;
          }

          console.log(`  ❌ ${scraper.name}: Failed - ${result.error || 'No data'}`);
        } catch (error: any) {
          console.log(`  ❌ ${scraper.name}: Error - ${error.message}`);
        }
      }

      // If not fallback enabled, stop after first tier
      if (!this.config.fallbackEnabled) {
        break;
      }
    }

    // All tiers failed
    console.log(`\n❌ All scraping tiers failed for: ${url}`);
    return {
      success: false,
      error: 'All scraping methods failed',
      source: 'orchestrator',
      tier: 3,
      timestamp: new Date(),
    };
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      scrapers: {
        tier1: this.scrapers.get(1)?.length || 0,
        tier2: this.scrapers.get(2)?.length || 0,
        tier3: this.scrapers.get(3)?.length || 0,
        total: Array.from(this.scrapers.values()).reduce((sum, arr) => sum + arr.length, 0),
      },
      cache: this.cache.getStats(),
    };
  }
}
