/**
 * @repo/importer - Shared data import logic
 */

// Mappers
export { mapPhoneArenaToItem } from './mappers/phonearena';

// Validators
export { validateItem, findDuplicates } from './validators/item-validator';

// API Client
export { StrapiClient } from './api/strapi-client';

// Orchestrator
export { ScraperOrchestrator } from './orchestrator/scraper-orchestrator';
export { CacheManager } from './orchestrator/cache-manager';

// Scrapers
export { BaseTier1Scraper } from './scrapers/tier1/base';
export { PhoneArenaScraper } from './scrapers/tier1/phonearena-scraper';
export { LLMWebScraper } from './scrapers/tier2/llm-web-scraper';
export { LLMWebSearchScraper } from './scrapers/tier2/llm-websearch-scraper';
export { TechSpecsAPIScraper } from './scrapers/tier3/techspecs-api';

// Types
export type {
  PhoneArenaRawData,
  MappedItem,
  MappedListing,
  ValidationResult,
  StrapiConfig,
} from './types';

export type {
  IScraper,
  ScraperResult,
  ScraperConfig,
  OrchestratorConfig,
  CacheConfig,
  TechSpecsConfig,
  TechSpecsDevice,
} from './types/scraper-types';
