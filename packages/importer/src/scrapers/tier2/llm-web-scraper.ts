/**
 * Tier 2: LLM Web Scraper
 *
 * Strategy:
 * 1. Fetch HTML from URL (with anti-bot bypass if needed)
 * 2. Clean HTML (remove scripts, ads, keep main content)
 * 3. Use LLM to extract structured specs
 * 4. Validate and normalize output
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import type { IScraper, ScraperResult } from '../../types/scraper-types';

export interface LLMScraperConfig {
  openaiApiKey: string;
  model?: string; // default: gpt-4o-mini
  flaresolverrUrl?: string; // for anti-bot bypass
  maxTokens?: number;
}

export class LLMWebScraper implements IScraper {
  name = 'LLM Web Scraper';
  tier: 1 | 2 | 3 = 2;

  private config: LLMScraperConfig;
  private openai: any; // OpenAI client

  constructor(config: LLMScraperConfig) {
    this.config = config;
    // TODO: Initialize OpenAI client
  }

  canHandle(url: string): boolean {
    // LLM scraper chỉ handle unknown sites (fallback)
    // Nếu Tier 1 scrapers đã handle → LLM không cần thiết

    // Skip known sites (có scraper/extension rồi)
    const knownSites = [
      'phonearena.com',
      'gsmarena.com',
      'shopee.vn',
      'tiki.vn',
      'lazada.vn',
    ];

    const isKnownSite = knownSites.some((site) => url.includes(site));

    // LLM chỉ handle unknown sites
    return !isKnownSite;
  }

  async scrape(url: string): Promise<ScraperResult> {
    try {
      // Step 1: Fetch HTML
      const html = await this.fetchHTML(url);

      // Step 2: Clean HTML (keep only main content)
      const cleanHtml = this.cleanHTML(html);

      // Step 3: LLM extract structured data
      const specs = await this.extractWithLLM(cleanHtml, url);

      return {
        success: true,
        data: specs,
        source: this.name,
        tier: this.tier,
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        source: this.name,
        tier: this.tier,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Fetch HTML with optional anti-bot bypass
   */
  private async fetchHTML(url: string): Promise<string> {
    // Try direct fetch first
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });
      return response.data;
    } catch (error) {
      // If blocked, use FlareSolverr
      if (this.config.flaresolverrUrl) {
        return this.fetchWithFlareSolverr(url);
      }
      throw error;
    }
  }

  /**
   * Fetch via FlareSolverr (anti-Cloudflare)
   */
  private async fetchWithFlareSolverr(url: string): Promise<string> {
    const response = await axios.post(this.config.flaresolverrUrl!, {
      cmd: 'request.get',
      url,
      maxTimeout: 60000,
    });

    if (response.data.status === 'ok') {
      return response.data.solution.response;
    }

    throw new Error('FlareSolverr failed');
  }

  /**
   * Clean HTML - Remove noise, keep main content
   */
  private cleanHTML(html: string): string {
    const $ = cheerio.load(html);

    // Remove scripts, styles, ads, navigation
    $('script, style, nav, header, footer, aside, .ad, .advertisement').remove();

    // Get main content area (heuristic)
    const mainContent = $('main, article, .content, #content, .specs, .specifications').html();

    if (mainContent) {
      return mainContent;
    }

    // Fallback: return body without noise
    return $('body').html() || html;
  }

  /**
   * Extract specs using LLM
   */
  private async extractWithLLM(html: string, url: string): Promise<any> {
    const prompt = `
Extract product specifications from the following HTML content.
URL: ${url}

Return a JSON object with this structure:
{
  "name": "Product name",
  "brand": "Brand name",
  "category": "phone|tablet|laptop|smartwatch",
  "specs": {
    "display": "Display specs",
    "processor": "CPU/Chipset",
    "memory": "RAM/Storage",
    "camera": "Camera specs",
    "battery": "Battery capacity",
    "os": "Operating system",
    // ... other relevant specs
  },
  "announced_date": "ISO date string",
  "price": "Price if available"
}

HTML Content:
${html.slice(0, 8000)} // Limit token usage

Return only valid JSON, no explanation.
`;

    // TODO: Call OpenAI API
    // const response = await this.openai.chat.completions.create({
    //   model: this.config.model || 'gpt-4o-mini',
    //   messages: [{ role: 'user', content: prompt }],
    //   response_format: { type: 'json_object' },
    // });

    // For now, return mock
    return {
      name: 'Extracted via LLM',
      specs: {},
    };
  }
}
