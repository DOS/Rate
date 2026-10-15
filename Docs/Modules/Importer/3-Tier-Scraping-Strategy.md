# 3-Tier Scraping Strategy

**Updated**: October 2025
**Status**: Implemented (Tier 1 ✅, Tier 2-3 in progress)

## Overview

Rate Platform sử dụng **3-tier fallback scraping strategy** để thu thập specs cho Items (phones, tablets, laptops, smartwatches). Strategy này cân bằng giữa **cost**, **quality**, và **reliability**.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    3-TIER SCRAPING STRATEGY                      │
└─────────────────────────────────────────────────────────────────┘

Tier 1: Direct Scraping (Free, Fast, High Quality)
├─ PhoneArena → Playwright scraper ✅
├─ GSMArena → Playwright scraper ⏳
└─ Official sites → HTTP scraper ⏳

         ↓ (If failed/blocked)

Tier 2: LLM Web Scraping (Flexible, ~$0.01/product)
├─ FlareSolverr + HTML fetch (bypass Cloudflare)
├─ Clean HTML (remove noise)
├─ OpenAI GPT-4o-mini extract
└─ Cache results (30 days TTL)

         ↓ (If failed/no data)

Tier 3: Paid APIs (Reliable, ~$0.05/product)
├─ TechSpecs.io API
├─ Other spec APIs
└─ Cache results (90 days TTL)
```

## Tier Comparison

| Tier | Method | Cost/Product | Quality | Speed | Anti-Scrape | Use Case |
|------|--------|--------------|---------|-------|-------------|----------|
| **Tier 1** | Direct scraping | $0 | ⭐⭐⭐⭐⭐ | Fast | ❌ Some sites block | Known sites (PhoneArena, GSMArena) |
| **Tier 2** | LLM extraction | ~$0.01 | ⭐⭐⭐⭐⭐ | Medium | ✅ Bypass | Unknown sites, fallback |
| **Tier 3** | Paid APIs | ~$0.05 | ⭐⭐⭐⭐⭐ | Fast | ✅ Official | Critical products, last resort |

## Data Source Analysis

### PhoneArena vs GSMArena

**PhoneArena** (Preferred):
```json
{
  "specs": {
    "Design": {
      "Dimensions": "151.1 x 71.8 x 8.1 mm",
      "Weight": "191.0 g",
      "Materials": "Back: Glass Frame: Aluminum",
      "Resistance": "Water, Dust; IP68",
      "Colors": "Black, Blue, Pink, White"
    },
    "Display": {
      "Size": "6.3-inch, 89.41% screen-to-body",
      "Type": "AMOLED, 120Hz, Dolby Vision, 3500 nits",
      "Resolution": "2656x1220px, 19.5:5 ratio, 464 PPI"
    },
    "Camera": {
      "Main camera": "50 MP Aperture: F1.7 Focal: 23mm Sensor: 1/1.31\"",
      "Video recording": "8K UHD (30 fps), 4K UHD (60 fps)"
    }
  }
}
```

**Advantages**:
- ✅ Logical categories (Design, Display, Hardware, Camera)
- ✅ Human-friendly field names
- ✅ Pricing information included
- ✅ Complete camera details in one field
- ✅ Consistent structure across all phones

**GSMArena**:
- More technical field names (Body, Platform, Comms)
- Less structured camera specs
- No pricing info
- Higher reliability but less user-friendly

**Conclusion**: PhoneArena preferred for better UX and structure.

## Tier 1: Direct Scraping

### Implementation

**Location**: `apps/importer/phonearena/`

**Files**:
```
apps/importer/phonearena/
├── crawl-phonearena-list.ts    # Crawl danh sách phones
├── crawl-single.ts             # Crawl 1 phone
└── import.ts                   # Import vào Strapi
```

**Flow**:
```
1. Playwright navigate to PhoneArena
2. Extract specs from HTML tables
3. Map to Strapi Item structure
4. Validate data
5. Push to Strapi via REST API
```

**Status**: ✅ **Working** (imported 15 phones successfully)

**Example**:
```bash
# Crawl list
yarn tsx apps/importer/phonearena/crawl-phonearena-list.ts

# Import to Strapi
yarn tsx apps/importer/phonearena/import.ts Data/crawled/phonearena-*.json
```

### Challenges

- ❌ Some sites have anti-scraping (Cloudflare, rate limiting)
- ❌ HTML structure changes break scrapers
- ✅ Solution: Fallback to Tier 2

## Tier 2: LLM Web Scraping

### Why LLM?

**Problems with traditional scraping**:
- Anti-scraping protection (Cloudflare, bot detection)
- HTML structure varies across sites
- Maintenance overhead (scrapers break)

**LLM advantages**:
- ✅ Flexible (works with any HTML structure)
- ✅ Bypass anti-scraping (fetch HTML → LLM extract)
- ✅ Universal (no need for site-specific scrapers)
- ✅ Reasonable cost (~$0.01/product with gpt-4o-mini)

### Implementation

**Location**: `packages/importer/src/scrapers/tier2/`

**Method**: FlareSolverr → HTML → Clean → LLM Extract

**Flow**:
```
1. User provides URL
2. Fetch HTML via FlareSolverr (bypass Cloudflare)
3. Clean HTML (remove scripts, ads, keep specs)
4. Send to OpenAI GPT-4o-mini
5. Extract structured JSON
6. Cache result (30 days)
```

**Code Structure**:
```typescript
class PhoneArenaLLMScraper implements IScraper {
  tier = 2;

  async scrape(url: string): Promise<ScraperResult> {
    // 1. Fetch via FlareSolverr
    const html = await fetchWithFlareSolverr(url);

    // 2. Clean HTML
    const cleanHtml = removeNoise(html);

    // 3. LLM extract
    const specs = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Extract phone specs from HTML:\n${cleanHtml}`
      }],
      response_format: { type: 'json_object' }
    });

    return { success: true, data: specs };
  }
}
```

**Cache Strategy**:
```typescript
Redis Cache:
├─ Key: scraper:tier2:{url_hash}
├─ TTL: 30 days (LLM costs justify longer cache)
└─ Value: JSON specs
```

**Status**: ⏳ **In Progress** (skeleton implemented, needs OpenAI API key)

**Cost Estimate**:
- Input: ~8,000 tokens (cleaned HTML)
- Output: ~500 tokens (JSON specs)
- Total: ~8,500 tokens × $0.15/1M = **$0.00128/product**

## Tier 3: Paid APIs

### TechSpecs.io Integration

**API Details**:
```
API ID: 68df4042df2a5a5447b6c193
API Key: 3cd3d6de-6380-4d72-8e61-a1e8abdec083
Base URL: https://api.techspecs.io/v4
```

**Coverage**:
- Phones, tablets, laptops, smartwatches
- 50,000+ devices
- Official specs from manufacturers

**Pricing**: ~$0.05/request (estimated)

**Flow**:
```
1. Extract brand/model from URL
2. Search device via TechSpecs API
3. Fetch full specs by device ID
4. Map to Strapi structure
5. Cache result (90 days - expensive!)
```

**Implementation**:
```typescript
class TechSpecsAPIScraper implements IScraper {
  tier = 3;

  async scrape(url: string): Promise<ScraperResult> {
    const { brand, model } = extractProductInfo(url);

    // Search device
    const results = await axios.get('/search', {
      params: { brand, model }
    });

    // Get specs
    const specs = await axios.get(`/devices/${results[0].id}`);

    return { success: true, data: specs };
  }
}
```

**Cache Strategy**:
```typescript
Redis Cache:
├─ Key: scraper:tier3:{url_hash}
├─ TTL: 90 days (API costs justify longest cache)
└─ Value: JSON specs
```

**Status**: ⏳ **Skeleton only** (needs API testing)

## Orchestrator

### ScraperOrchestrator

**Location**: `packages/importer/src/orchestrator/scraper-orchestrator.ts`

**Purpose**: Coordinate 3-tier fallback strategy

**Flow**:
```typescript
async scrape(url: string): Promise<ScraperResult> {
  // 1. Check cache (all tiers)
  const cached = await cache.get(url);
  if (cached) return cached;

  // 2. Try Tier 1 scrapers
  for (const scraper of tier1Scrapers) {
    if (scraper.canHandle(url)) {
      const result = await scraper.scrape(url);
      if (result.success) {
        await cache.set(url, result, 7_DAYS);
        return result;
      }
    }
  }

  // 3. Fallback to Tier 2 (LLM)
  if (fallbackEnabled) {
    const result = await tier2Scraper.scrape(url);
    if (result.success) {
      await cache.set(url, result, 30_DAYS);
      return result;
    }
  }

  // 4. Last resort: Tier 3 (API)
  const result = await tier3Scraper.scrape(url);
  await cache.set(url, result, 90_DAYS);
  return result;
}
```

**Features**:
- ✅ Automatic fallback
- ✅ Cache with tier-based TTL
- ✅ Progress logging
- ✅ Error handling per tier

**Status**: ✅ **Implemented** (needs integration testing)

## Cache Strategy

### TTL by Tier

| Tier | TTL | Reason |
|------|-----|--------|
| Tier 1 | 7 days | Free, can re-scrape easily |
| Tier 2 | 30 days | LLM costs, balance freshness vs cost |
| Tier 3 | 90 days | API costs high, cache longest |

### Redis Structure

```
scraper:{tier}:{url_hash}
├─ Value: JSON { success, data, source, tier, timestamp }
├─ TTL: tier-based
└─ Size: ~5-10 KB per entry
```

### Cache Hit Rate Target

- Overall: 90%+
- Tier 1: 70%
- Tier 2: 95% (expensive, cache longer)
- Tier 3: 99% (very expensive, cache longest)

## Use Cases

### Scenario 1: Bulk Scraping 1000 Phones

**Strategy**: Tier 1 only (free)

```bash
# Crawl PhoneArena list
yarn tsx apps/importer/phonearena/crawl-phonearena-list.ts

# Import all
yarn tsx apps/importer/phonearena/import.ts Data/crawled/*.json
```

**Cost**: $0
**Time**: ~2 hours (rate limiting)

### Scenario 2: User Pastes Unknown URL

**Strategy**: Orchestrator with fallback

```typescript
const result = await orchestrator.scrape(unknownUrl);
// Try Tier 1 → Tier 2 → Tier 3
```

**Cost**: $0 (if Tier 1 works) or $0.01 (if fallback to Tier 2)

### Scenario 3: Critical Product, Need Data ASAP

**Strategy**: Skip Tier 1, go straight to Tier 2 or 3

```typescript
const result = await tier3Scraper.scrape(url);
```

**Cost**: $0.05 (TechSpecs API)
**Time**: <5 seconds

## Configuration

### Mode Selection

```typescript
// Cheap mode - Tier 1 only
const orchestrator = new ScraperOrchestrator({
  fallbackEnabled: false
});

// Balanced mode - Tier 1 → 2 (skip Tier 3)
const orchestrator = new ScraperOrchestrator({
  fallbackEnabled: true
});
// Don't register Tier 3 scraper

// Premium mode - All tiers
const orchestrator = new ScraperOrchestrator({
  fallbackEnabled: true
});
orchestrator.registerScraper(tier1);
orchestrator.registerScraper(tier2);
orchestrator.registerScraper(tier3);
```

### Environment Variables

```bash
# Tier 1: Direct scraping
# (No config needed)

# Tier 2: LLM scraping
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
FLARESOLVERR_URL=http://localhost:8191/v1

# Tier 3: Paid APIs
TECHSPECS_API_ID=68df4042df2a5a5447b6c193
TECHSPECS_API_KEY=3cd3d6de-6380-4d72-8e61-a1e8abdec083

# Cache
REDIS_URL=redis://localhost:6379
CACHE_ENABLED=true
```

## Package Structure

### packages/importer/

Shared logic package cho tất cả crawlers:

```
packages/importer/
├── src/
│   ├── types/
│   │   ├── index.ts              # MappedItem, PhoneArenaRawData
│   │   └── scraper-types.ts      # IScraper, ScraperResult, Config
│   ├── mappers/
│   │   └── phonearena.ts         # PhoneArena → Strapi Item
│   ├── validators/
│   │   └── item-validator.ts     # Data validation
│   ├── api/
│   │   └── strapi-client.ts      # REST API client (create/update)
│   ├── orchestrator/
│   │   ├── scraper-orchestrator.ts  # 3-tier coordinator
│   │   └── cache-manager.ts         # Redis cache manager
│   └── scrapers/
│       ├── tier1/
│       │   └── base.ts           # Base class for Tier 1
│       ├── tier2/
│       │   ├── llm-web-scraper.ts       # HTML → LLM
│       │   └── llm-websearch-scraper.ts # WebSearch → LLM
│       └── tier3/
│           └── techspecs-api.ts  # TechSpecs.io client
├── package.json                  # @repo/importer
└── README.md
```

### apps/importer/

Crawler scripts hub:

```
apps/importer/
├── phonearena/
│   ├── crawl-phonearena-list.ts  # List crawler
│   ├── crawl-single.ts           # Single phone crawler
│   └── import.ts                 # Import script (uses @repo/importer)
├── scripts/
│   └── create-strapi-token.ts    # Helper scripts
└── test-llm-scraper.ts           # Test LLM scraper
```

## Roadmap

### Phase 1: Core (Current)
- ✅ Tier 1: PhoneArena scraper
- ✅ Orchestrator architecture
- ✅ Cache manager
- ⏳ Tier 2: LLM scraper (needs OpenAI key)
- ⏳ Tier 3: TechSpecs.io (needs testing)

### Phase 2: Expansion
- ⏳ GSMArena Tier 1 scraper
- ⏳ Official sites scrapers (Apple, Samsung)
- ⏳ WebSearch fallback for unknown sites

### Phase 3: Optimization
- ⏳ Redis cache implementation
- ⏳ Batch processing optimization
- ⏳ Cost monitoring dashboard

## Metrics & Monitoring

### Target Metrics

- **Tier 1 success rate**: >90%
- **Tier 2 success rate**: >95%
- **Tier 3 success rate**: 100% (paid, guaranteed)
- **Cache hit rate**: >90%
- **Average cost/product**: <$0.005
- **Average time/product**: <30 seconds

### Logging

```typescript
console.log(`
🔍 Scraping: ${url}
├─ Tier 1: PhoneArena scraper
│   ✅ Success (cached from 2 days ago)
├─ Data quality: ⭐⭐⭐⭐⭐
├─ Cost: $0
└─ Time: 120ms
`);
```

## Conclusion

3-tier strategy cung cấp:
- ✅ **Cost optimization**: Free Tier 1 for bulk, paid tiers for fallback
- ✅ **Reliability**: Multiple fallback layers
- ✅ **Flexibility**: LLM works with any site
- ✅ **Quality**: PhoneArena data structure optimal for UX
- ✅ **Scalability**: Can add more scrapers/APIs easily
