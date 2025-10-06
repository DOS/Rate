/**
 * Shared types for Item Seeding Crawlers
 */

export interface PhoneData {
  name: string;
  images: string[];
  specifications: Record<string, Record<string, string>>;
  quickSpecs?: string[];
  metadata: {
    releaseDate?: string;
    status?: string;
    popularity?: string;
    sourceUrl: string;
    scrapedAt: string;
  };
}

export interface CrawledData {
  source: string;
  rank: number;
  reliability: number;
  data: PhoneData;
}

export interface QueueItem {
  name: string;
  brand: string;
  model?: string;
  category: 'phones' | 'laptops' | 'appliances' | 'electronics';
  forceUpdate?: boolean;
}

export interface SourceConfig {
  rank: number;
  source: string;
  reliability: number;
  coverage: string;
  updateFrequency: string;
  use: string;
  crawlMethod: 'web_scraping' | 'api' | 'playwright';
}

export interface MergedData {
  name: string;
  brand: string;
  specifications: Record<string, Record<string, string>>;
  images: string[];
  description?: string;
  quickSpecs?: string[];
  sources: Array<{
    name: string;
    url: string;
    reliability: number;
  }>;
  metadata?: Record<string, any>;
}

export interface NormalizedItemData {
  vi: {
    name: string;
    slug: string;
    description: string;
    shortDescription: string;
    brand: string;
    model: string;
    category: string;
    specifications: Record<string, Record<string, string>>;
    keyFeatures: string[];
    variants?: Array<{ name: string; value: string }>;
    images: string[];
    metadata: Record<string, any>;
  };
  en: {
    name: string;
    slug: string;
    description: string;
    shortDescription: string;
    brand: string;
    model: string;
    category: string;
    specifications: Record<string, Record<string, string>>;
    keyFeatures: string[];
    variants?: Array<{ name: string; value: string }>;
    images: string[];
    metadata: Record<string, any>;
  };
  quality: {
    completeness: number; // 0-1
    confidence: number; // 0-1
    missingFields: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  score: number; // 0-1
  issues: string[];
  warnings: string[];
}

export interface SeedingProgress {
  total: number;
  processed: number;
  created: number;
  failed: number;
  skipped: number;
  startTime: string;
  checkpoints: Array<{
    timestamp: string;
    processed: number;
  }>;
}
