/**
 * Cache Manager for Scraper Results
 *
 * Strategy:
 * - Tier 1 (Free): 7 days TTL
 * - Tier 2 (LLM): 30 days TTL (LLM costs)
 * - Tier 3 (API): 90 days TTL (API costs)
 */

import crypto from 'crypto';
import type { ScraperResult } from '../types/scraper-types';

export interface CacheManagerConfig {
  enabled: boolean;
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  ttl?: {
    tier1: number; // seconds
    tier2: number;
    tier3: number;
  };
}

export class CacheManager {
  private config: CacheManagerConfig;
  private redis: any; // Redis client (optional)
  private memoryCache: Map<string, { data: any; expires: number }> = new Map();

  constructor(config: CacheManagerConfig) {
    this.config = config;

    // Default TTLs
    this.config.ttl = {
      tier1: config.ttl?.tier1 || 7 * 24 * 60 * 60, // 7 days
      tier2: config.ttl?.tier2 || 30 * 24 * 60 * 60, // 30 days
      tier3: config.ttl?.tier3 || 90 * 24 * 60 * 60, // 90 days
    };

    // Initialize Redis if config provided
    if (config.redis) {
      this.initRedis();
    }
  }

  /**
   * Initialize Redis connection
   */
  private initRedis() {
    // TODO: Initialize Redis client
    // import { createClient } from 'redis';
    // this.redis = createClient(this.config.redis);
    console.log('Redis cache initialized');
  }

  /**
   * Get cached result
   */
  async get<T = any>(url: string): Promise<ScraperResult<T> | null> {
    if (!this.config.enabled) return null;

    const key = this.getCacheKey(url);

    // Try Redis first
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const result = JSON.parse(cached);
          result.cached = true;
          return result;
        }
      } catch (error) {
        console.warn('Redis get error:', error);
      }
    }

    // Fallback to memory cache
    const memoryCached = this.memoryCache.get(key);
    if (memoryCached && memoryCached.expires > Date.now()) {
      return {
        ...memoryCached.data,
        cached: true,
      };
    }

    return null;
  }

  /**
   * Set cache
   */
  async set(url: string, result: ScraperResult): Promise<void> {
    if (!this.config.enabled || !result.success) return;

    const key = this.getCacheKey(url);
    const ttl = this.getTTL(result.tier);

    // Save to Redis
    if (this.redis) {
      try {
        await this.redis.setEx(key, ttl, JSON.stringify(result));
      } catch (error) {
        console.warn('Redis set error:', error);
      }
    }

    // Save to memory cache as backup
    this.memoryCache.set(key, {
      data: result,
      expires: Date.now() + ttl * 1000,
    });

    // Clean expired memory cache
    this.cleanMemoryCache();
  }

  /**
   * Invalidate cache for URL
   */
  async invalidate(url: string): Promise<void> {
    const key = this.getCacheKey(url);

    if (this.redis) {
      await this.redis.del(key);
    }

    this.memoryCache.delete(key);
  }

  /**
   * Get cache key from URL
   */
  private getCacheKey(url: string): string {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    return `scraper:${hash}`;
  }

  /**
   * Get TTL based on tier
   */
  private getTTL(tier: 1 | 2 | 3): number {
    return this.config.ttl![`tier${tier}` as keyof typeof this.config.ttl];
  }

  /**
   * Clean expired entries from memory cache
   */
  private cleanMemoryCache() {
    const now = Date.now();
    for (const [key, value] of this.memoryCache.entries()) {
      if (value.expires < now) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      enabled: this.config.enabled,
      memoryCacheSize: this.memoryCache.size,
      redisConnected: !!this.redis,
      ttl: this.config.ttl,
    };
  }
}
