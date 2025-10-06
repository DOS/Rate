/**
 * Strapi REST API client
 */

import axios, { type AxiosInstance } from 'axios';
import type { MappedItem, StrapiConfig } from '../types';

export class StrapiClient {
  private client: AxiosInstance;
  private config: StrapiConfig;

  constructor(config: StrapiConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Find existing Item by platform identifier
   */
  async findItemByPlatformId(platformId: string, platform: string): Promise<any | null> {
    try {
      // Get all items and filter in-memory (Strapi 5 JSON field filter limitation)
      const response = await this.client.get('/api/items', {
        params: {
          'pagination[pageSize]': 100, // Limit for performance
        },
      });

      const items = response.data.data;
      if (!items || items.length === 0) return null;

      // Find item with matching platform ID (Strapi 5 flat structure)
      for (const item of items) {
        const platformIds = item.PlatformIdentifiers || {};
        if (platformIds[platform] === platformId) {
          return item;
        }
      }

      return null;
    } catch (error: any) {
      console.error('Error finding item:', error.message);
      return null;
    }
  }

  /**
   * Create new Item
   */
  async createItem(itemData: MappedItem): Promise<any> {
    try {
      const response = await this.client.post('/api/items', {
        data: itemData,
      });

      return response.data.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Strapi API Error:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Update existing Item
   */
  async updateItem(documentId: string, itemData: Partial<MappedItem>): Promise<any> {
    try {
      const response = await this.client.put(`/api/items/${documentId}`, {
        data: itemData,
      });

      return response.data.data;
    } catch (error: any) {
      if (error.response?.data) {
        console.error('Strapi API Error:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Import items (create or update)
   */
  async importItems(
    items: MappedItem[],
    options: {
      onProgress?: (current: number, total: number, item: MappedItem) => void;
      onError?: (item: MappedItem, error: Error) => void;
    } = {}
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      try {
        options.onProgress?.(i + 1, items.length, item);

        // Check if exists by platform ID
        const platformId =
          item.PlatformIdentifiers.phonearena || item.PlatformIdentifiers.gsmarena;
        const platform = item.PlatformIdentifiers.phonearena ? 'phonearena' : 'gsmarena';

        if (!platformId) {
          console.warn(`Item "${item.Title}" missing platform ID, skipping`);
          skipped++;
          continue;
        }

        const existing = await this.findItemByPlatformId(platformId, platform);

        if (existing) {
          // Update
          await this.updateItem(existing.documentId, item);
          updated++;
        } else {
          // Create
          await this.createItem(item);
          created++;
        }
      } catch (error: any) {
        console.error(`Error importing "${item.Title}":`, error.message);
        options.onError?.(item, error);
        skipped++;
      }
    }

    return { created, updated, skipped };
  }
}
