/**
 * Scraper types and interfaces
 */

export interface ScraperConfig {
  tier: 1 | 2 | 3;
  name: string;
  enabled: boolean;
  priority: number; // Lower = higher priority
  timeout?: number;
  retries?: number;
}

export interface ScraperResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  source: string;
  tier: 1 | 2 | 3;
  cached?: boolean;
  timestamp: Date;
}

export interface IScraper<T = any> {
  name: string;
  tier: 1 | 2 | 3;
  canHandle(url: string): boolean;
  scrape(url: string): Promise<ScraperResult<T>>;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // seconds
  prefix: string;
}

export interface OrchestratorConfig {
  scrapers: ScraperConfig[];
  cache: CacheConfig;
  fallbackEnabled: boolean;
}

// TechSpecs.io specific types
export interface TechSpecsConfig {
  apiId: string;
  apiKey: string;
  baseUrl: string;
}

export interface TechSpecsDevice {
  brand: string;
  model: string;
  specs: Record<string, any>;
  category: 'phone' | 'tablet' | 'laptop' | 'smartwatch';
}