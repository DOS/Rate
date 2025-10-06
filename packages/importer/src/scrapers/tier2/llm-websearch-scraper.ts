/**
 * Tier 2: LLM + WebSearch Scraper
 *
 * Strategy:
 * 1. WebSearch để tìm specs page URL (GSMArena, PhoneArena, Apple Support...)
 * 2. Fetch full HTML từ URL top result
 * 3. Clean HTML
 * 4. LLM extract structured specs
 *
 * Ưu điểm:
 * - Không cần viết scraper cho từng site
 * - Full specs (không bị limit snippet)
 * - 1 LLM call (cost thấp)
 * - Universal (work với bất kỳ product nào)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { IScraper, ScraperResult } from '../../types/scraper-types';

export interface LLMWebSearchScraperConfig {
  openaiApiKey: string;
  model?: string; // default: gpt-4o-mini
  webSearchTool: any; // WebSearch tool instance
  maxTokens?: number;
}

export class LLMWebSearchScraper implements IScraper {
  name = 'LLM WebSearch Scraper';
  tier: 1 | 2 | 3 = 2;

  private config: LLMWebSearchScraperConfig;
  private openai: any;

  constructor(config: LLMWebSearchScraperConfig) {
    this.config = config;
  }

  canHandle(url: string): boolean {
    // Can handle any URL (universal fallback)
    // But skip if Tier 1 scraper exists
    const knownSites = ['phonearena.com', 'gsmarena.com'];
    return !knownSites.some((site) => url.includes(site));
  }

  /**
   * Main scraping method
   */
  async scrape(url: string): Promise<ScraperResult> {
    try {
      // Step 1: Extract product name from URL
      const productName = this.extractProductName(url);

      // Step 2: WebSearch for specs page
      console.log(`  🔍 Searching for: "${productName} specifications"`);
      const specsUrl = await this.findSpecsPage(productName);

      if (!specsUrl) {
        return this.error('No specs page found via WebSearch');
      }

      console.log(`  📄 Found specs page: ${specsUrl}`);

      // Step 3: Fetch full HTML
      const html = await this.fetchHTML(specsUrl);

      // Step 4: Clean HTML
      const cleanHtml = this.cleanHTML(html);

      // Step 5: LLM extract structured data
      const specs = await this.extractWithLLM(cleanHtml, productName);

      return this.success(specs);
    } catch (error: any) {
      return this.error(error.message);
    }
  }

  /**
   * Extract product name from URL
   */
  private extractProductName(url: string): string {
    // Try extract from URL path
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;

      // Remove file extensions and clean up
      const cleaned = path
        .replace(/\.(html|php|asp)$/i, '')
        .split('/')
        .pop()
        ?.replace(/[-_]/g, ' ')
        .trim();

      return cleaned || url;
    } catch {
      return url;
    }
  }

  /**
   * Find specs page via WebSearch
   */
  private async findSpecsPage(productName: string): Promise<string | null> {
    // Priority sites for specs
    const prioritySites = [
      'gsmarena.com',
      'phonearena.com',
      'apple.com/specs',
      'samsung.com/specs',
      'support.apple.com',
    ];

    // Search query
    const query = `${productName} full specifications`;

    // TODO: Use WebSearch tool
    // const results = await this.config.webSearchTool.search(query);

    // Mock for now - in real implementation:
    // 1. Parse search results
    // 2. Prioritize GSMArena/PhoneArena URLs
    // 3. Return top result URL

    // For now, return null (will be implemented with actual WebSearch)
    return null;
  }

  /**
   * Fetch HTML from URL
   */
  private async fetchHTML(url: string): Promise<string> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    return response.data;
  }

  /**
   * Clean HTML - Keep only specs content
   */
  private cleanHTML(html: string): string {
    const $ = cheerio.load(html);

    // Remove noise
    $('script, style, nav, header, footer, aside, .ad, iframe').remove();

    // Try to find specs section
    const specsSelectors = [
      '.specs',
      '.specifications',
      '#specs',
      '[data-specs]',
      'table.specs',
      '.spec-table',
    ];

    for (const selector of specsSelectors) {
      const specsSection = $(selector).html();
      if (specsSection && specsSection.length > 200) {
        return specsSection;
      }
    }

    // Fallback: return main content
    return $('main, article, .content, body').html() || html;
  }

  /**
   * Extract specs using LLM
   */
  private async extractWithLLM(html: string, productName: string): Promise<any> {
    const prompt = `
Extract complete product specifications from the HTML below.

Product: ${productName}

Return JSON with this exact structure:
{
  "name": "Product full name",
  "brand": "Brand name",
  "category": "phone|tablet|laptop|smartwatch|other",
  "specs": {
    "display": {
      "size": "6.7 inches",
      "resolution": "2796 x 1290",
      "type": "OLED",
      "protection": "Ceramic Shield"
    },
    "processor": {
      "chipset": "Apple A17 Pro",
      "cpu": "Hexa-core",
      "gpu": "Apple GPU"
    },
    "memory": {
      "ram": "8GB",
      "storage": ["256GB", "512GB", "1TB"]
    },
    "camera": {
      "main": "48MP",
      "ultra_wide": "12MP",
      "telephoto": "12MP 5x optical",
      "front": "12MP"
    },
    "battery": {
      "capacity": "4441 mAh",
      "charging": "USB-C, MagSafe"
    },
    "os": "iOS 17",
    "dimensions": "159.9 x 76.7 x 8.25 mm",
    "weight": "221g",
    "colors": ["Natural Titanium", "Blue Titanium", "White Titanium", "Black Titanium"]
  },
  "announced_date": "2023-09-12",
  "release_date": "2023-09-22",
  "price": 1199
}

HTML Content:
${html.slice(0, 12000)}

Return ONLY valid JSON, no explanation.
`;

    // TODO: Call OpenAI API
    // const response = await this.openai.chat.completions.create({
    //   model: this.config.model || 'gpt-4o-mini',
    //   messages: [{ role: 'user', content: prompt }],
    //   response_format: { type: 'json_object' },
    // });

    // Mock response for now
    return {
      name: productName,
      source: 'LLM + WebSearch',
      specs: {},
    };
  }

  private success(data: any): ScraperResult {
    return {
      success: true,
      data,
      source: this.name,
      tier: this.tier,
      timestamp: new Date(),
    };
  }

  private error(error: string): ScraperResult {
    return {
      success: false,
      error,
      source: this.name,
      tier: this.tier,
      timestamp: new Date(),
    };
  }
}
