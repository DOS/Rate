/**
 * Tier 3: TechSpecs.io API Integration
 *
 * Paid API for reliable device specs
 * API ID: ***REMOVED-SECRET***
 * API Key: ***REMOVED-SECRET***
 */

import axios, { type AxiosInstance } from 'axios';
import type { IScraper, ScraperResult, TechSpecsConfig } from '../../types/scraper-types';

export class TechSpecsAPIScraper implements IScraper {
  name = 'TechSpecs.io API';
  tier: 1 | 2 | 3 = 3;

  private client: AxiosInstance;
  private config: TechSpecsConfig;

  constructor(config: TechSpecsConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.techspecs.io/v4',
      headers: {
        'x-api-id': config.apiId,
        'x-api-key': config.apiKey,
      },
      timeout: 15000,
    });
  }

  canHandle(url: string): boolean {
    // Can handle if we can extract brand/model from URL
    return this.extractProductInfo(url) !== null;
  }

  async scrape(url: string): Promise<ScraperResult> {
    try {
      const productInfo = this.extractProductInfo(url);

      if (!productInfo) {
        return {
          success: false,
          error: 'Cannot extract product info from URL',
          source: this.name,
          tier: this.tier,
          timestamp: new Date(),
        };
      }

      // Search for device
      const specs = await this.searchDevice(productInfo.brand, productInfo.model);

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
   * Extract brand and model from URL
   */
  private extractProductInfo(url: string): { brand: string; model: string } | null {
    // PhoneArena: https://www.phonearena.com/phones/Xiaomi-17_id12857
    const phoneArenaMatch = url.match(/phonearena\.com\/phones\/([^_]+)_id/);
    if (phoneArenaMatch) {
      const fullName = phoneArenaMatch[1].replace(/-/g, ' ');
      const parts = fullName.split(' ');
      return {
        brand: parts[0],
        model: parts.slice(1).join(' '),
      };
    }

    // GSMArena: https://www.gsmarena.com/xiaomi_17-12345.php
    const gsmArenaMatch = url.match(/gsmarena\.com\/([^-]+)-([^-]+)-/);
    if (gsmArenaMatch) {
      return {
        brand: gsmArenaMatch[1].replace(/_/g, ' '),
        model: gsmArenaMatch[2].replace(/_/g, ' '),
      };
    }

    return null;
  }

  /**
   * Search device via TechSpecs API
   */
  private async searchDevice(brand: string, model: string): Promise<any> {
    try {
      // Search endpoint (adjust based on actual API)
      const response = await this.client.get('/search', {
        params: {
          brand,
          model,
          category: 'smartphone', // or detect from context
        },
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        // Get first match
        const deviceId = response.data.results[0].id;

        // Fetch full specs
        return this.getDeviceSpecs(deviceId);
      }

      throw new Error('Device not found in TechSpecs.io');
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Device not found: ${brand} ${model}`);
      }
      throw error;
    }
  }

  /**
   * Get full device specs by ID
   */
  private async getDeviceSpecs(deviceId: string): Promise<any> {
    const response = await this.client.get(`/devices/${deviceId}`);
    return response.data;
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/status');
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
