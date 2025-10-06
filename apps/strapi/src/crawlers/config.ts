/**
 * Configuration for Item Seeding Crawlers
 */

import type { SourceConfig } from './types';

export const SOURCE_PRIORITY: Record<string, SourceConfig[]> = {
  phones: [
    {
      rank: 1,
      source: 'GSMArena',
      reliability: 0.95,
      coverage: 'Comprehensive (15,000+ phones)',
      updateFrequency: 'daily',
      use: 'PRIMARY - detailed specs, images, all models',
      crawlMethod: 'web_scraping',
    },
    {
      rank: 2,
      source: 'PhoneArena',
      reliability: 0.92,
      coverage: 'Popular models (5,000+)',
      updateFrequency: 'weekly',
      use: 'BACKUP - cross-verify specs, benchmarks',
      crawlMethod: 'web_scraping',
    },
    {
      rank: 3,
      source: 'Official Brand Website',
      reliability: 0.98,
      coverage: 'Current products only',
      updateFrequency: 'weekly',
      use: 'SUPPLEMENT - official images, latest info',
      crawlMethod: 'web_scraping',
    },
    {
      rank: 4,
      source: 'Wikipedia',
      reliability: 0.85,
      coverage: 'Flagship models',
      updateFrequency: 'monthly',
      use: 'FALLBACK - general info if others fail',
      crawlMethod: 'api',
    },
  ],
  laptops: [
    {
      rank: 1,
      source: 'NotebookCheck',
      reliability: 0.94,
      coverage: 'Extensive (10,000+ laptops)',
      updateFrequency: 'weekly',
      use: 'PRIMARY - detailed reviews, benchmarks',
      crawlMethod: 'web_scraping',
    },
    {
      rank: 2,
      source: 'Official Brand Website',
      reliability: 0.98,
      coverage: 'Current lineup',
      updateFrequency: 'weekly',
      use: 'SUPPLEMENT - official specs',
      crawlMethod: 'web_scraping',
    },
  ],
};

export const CRAWLER_CONFIG = {
  RATE_LIMIT_MS: 2000, // 2 seconds between requests
  MAX_RETRIES: 3,
  TIMEOUT_MS: 15000,
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  BATCH_SIZE: 50,
  CHECKPOINT_INTERVAL: 50, // Save checkpoint every 50 items
};

export const GSMARENA_CONFIG = {
  BASE_URL: 'https://www.gsmarena.com',
  SEARCH_PATH: '/res.php3',
  SELECTORS: {
    searchResults: '.makers li a',
    phoneName: '.specs-phone-name-title',
    mainImage: '.specs-photo-main img',
    galleryImages: '#pictures-list img',
    specTables: '#specs-list table',
    specCategory: 'th',
    specRow: 'tr',
    specKey: '.ttl',
    specValue: '.nfo',
    quickSpecs: '.specs-brief li',
    popularity: '.help-popularity span',
  },
};

export const PHONEARENA_CONFIG = {
  BASE_URL: 'https://www.phonearena.com',
  SEARCH_PATH: '/search',
  SELECTORS: {
    searchResults: '.s-search-result-item .s-hover-title',
    phoneTitle: 'h1.phone-title',
    specTable: '.specs-table tr',
    specCategory: '.specs-table-category',
    specLabel: '.specs-table-label',
    specValue: '.specs-table-value',
    galleryImages: '.phone-gallery img',
    jsonLd: 'script[type="application/ld+json"]',
  },
};

export const OFFICIAL_BRANDS = {
  Apple: {
    baseUrl: 'https://www.apple.com/vn',
    specsPath: '/{slug}/specs/',
    selectors: {
      jsonLd: 'script[type="application/ld+json"]',
      specColumns: '.specs-column',
      specHeadline: '.specs-headline',
      specItems: '.spec-item',
      specLabel: '.spec-label',
      specValue: '.spec-value',
      images: '.specs-hero-image img, .specs-gallery img',
    },
  },
  Samsung: {
    baseUrl: 'https://www.samsung.com/vn',
    specsPath: '/smartphones/{slug}/specs/',
    // Samsung may need Playwright due to dynamic content
    requiresPlaywright: true,
  },
  Xiaomi: {
    baseUrl: 'https://www.mi.com/vn',
    specsPath: '/{slug}/specs',
  },
};

/**
 * Core specs that must be filled for each category
 * Completeness = (filled core specs / total core specs) * 100%
 */
export const CORE_SPECS_BY_CATEGORY = {
  phones: [
    'Network', // 2G/3G/4G/5G bands
    'Body', // Dimensions, weight, build
    'Display', // Type, size, resolution
    'Platform', // OS, chipset, CPU, GPU
    'Memory', // RAM, storage options
    'Main Camera', // Specs, features
    'Selfie camera', // Front camera specs
    'Battery', // Capacity, charging
    'Misc', // Colors, models, pricing (optional)
  ], // 9 core categories
  laptops: [
    'Platform', // Processor, chipset
    'Memory', // RAM type and size
    'Storage', // SSD/HDD capacity
    'Display', // Screen size, resolution, panel type
    'Graphics', // GPU (integrated or dedicated)
    'Battery', // Capacity, battery life
    'Body', // Dimensions, weight, build material
    'Connectivity', // Ports, WiFi, Bluetooth
  ], // 8 core categories
  appliances: [
    'Type', // Appliance type
    'Power', // Wattage, voltage
    'Capacity', // Volume, size
    'Dimensions', // Physical size
    'Features', // Key features
  ], // 5 core categories
  electronics: [
    'Type', // Product type
    'Specifications', // General specs
    'Connectivity', // Ports, wireless
    'Power', // Power requirements
    'Dimensions', // Size, weight
  ], // 5 core categories
};

export const QUALITY_THRESHOLDS = {
  MIN_COMPLETENESS: 0.4, // 40% minimum of core specs
  AUTO_CREATE_CONFIDENCE: 0.6, // 60% for auto-create
  REVIEW_QUEUE_CONFIDENCE: 0.4, // 40-60% for review queue
  MIN_SPEC_CATEGORIES: 3,
  MIN_IMAGES: 1,
};
