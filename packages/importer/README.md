# @repo/importer

Shared data import logic với 3-tier scraping fallback strategy.

## Architecture

### 3-Tier Scraping Strategy

```
Tier 1: Direct Scraping (Free, Fast)
├─ PhoneArena scraper
├─ GSMArena scraper
└─ Other direct scrapers

Tier 2: LLM Web Scraping (Moderate cost, Flexible)
├─ Fetch HTML from URL
├─ Clean HTML (remove noise)
└─ LLM extract structured data

Tier 3: Paid APIs (Reliable, Expensive)
├─ TechSpecs.io API
└─ Other spec APIs
```

### Cache Strategy

```
Tier 1: 7 days TTL   (free, can re-scrape)
Tier 2: 30 days TTL  (LLM costs)
Tier 3: 90 days TTL  (API costs, cache longest)
```

## Usage

### Basic Setup

```typescript
import { ScraperOrchestrator } from '@repo/importer';
import { PhoneArenaScraper } from '@repo/importer/scrapers/tier1/phonearena';
import { LLMWebScraper } from '@repo/importer/scrapers/tier2/llm-web-scraper';
import { TechSpecsAPIScraper } from '@repo/importer/scrapers/tier3/techspecs-api';

// Create orchestrator
const orchestrator = new ScraperOrchestrator({
  fallbackEnabled: true,
  cache: {
    enabled: true,
    ttl: 7 * 24 * 60 * 60, // Base TTL
    prefix: 'scraper',
  },
  scrapers: [],
});

// Register scrapers
orchestrator.registerScraper(new PhoneArenaScraper());
orchestrator.registerScraper(new LLMWebScraper({
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
}));
orchestrator.registerScraper(new TechSpecsAPIScraper({
  apiId: process.env.TECHSPECS_API_ID,
  apiKey: process.env.TECHSPECS_API_KEY,
  baseUrl: 'https://api.techspecs.io/v4',
}));

// Scrape with fallback
const result = await orchestrator.scrape('https://www.phonearena.com/phones/Xiaomi-17_id12857');

if (result.success) {
  console.log('Specs:', result.data);
  console.log('Source:', result.source);
  console.log('Tier:', result.tier);
  console.log('Cached:', result.cached);
}
```

### Data Mapping & Import

```typescript
import { mapPhoneArenaToItem, StrapiClient } from '@repo/importer';

// Map to Strapi format
const mappedItem = mapPhoneArenaToItem(result.data);

// Import to Strapi
const client = new StrapiClient({
  apiUrl: 'http://localhost:1337',
  apiToken: process.env.STRAPI_API_TOKEN,
});

await client.importItems([mappedItem]);
```

## API

### ScraperOrchestrator

- `registerScraper(scraper)` - Register scraper
- `scrape(url)` - Scrape với fallback strategy
- `getStats()` - Get scraper & cache stats

### Scrapers

All scrapers implement `IScraper` interface:

```typescript
interface IScraper<T = any> {
  name: string;
  tier: 1 | 2 | 3;
  canHandle(url: string): boolean;
  scrape(url: string): Promise<ScraperResult<T>>;
}
```

## Environment Variables

```bash
# LLM Scraping (Tier 2)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# TechSpecs.io API (Tier 3)
TECHSPECS_API_ID=***REMOVED-SECRET***
TECHSPECS_API_KEY=***REMOVED-SECRET***

# Strapi
STRAPI_URL=http://localhost:1337
STRAPI_API_TOKEN=...
```

## Best Practices

### Cost Optimization

1. **Enable caching** - Avoid redundant API calls
2. **Use Tier 1 first** - Free scrapers for bulk operations
3. **Reserve Tier 3 for critical data** - Paid APIs for high-priority products

### Error Handling

```typescript
const result = await orchestrator.scrape(url);

if (!result.success) {
  console.error('All tiers failed:', result.error);
  // Handle fallback (manual input, skip, etc.)
}
```

### Mode Selection

```typescript
// Cheap mode - Tier 1 only
const orchestrator = new ScraperOrchestrator({
  fallbackEnabled: false, // Stop after Tier 1
});

// Balanced mode - Tier 1 → 2
// (Default behavior, skip Tier 3 if no TechSpecs scraper registered)

// Premium mode - All tiers
// (Register all scrapers)
```
