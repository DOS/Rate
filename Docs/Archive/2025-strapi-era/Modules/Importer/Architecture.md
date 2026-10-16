# Rate-Importer Architecture

## System Overview

Rate-Importer is a comprehensive data ingestion system with three primary pipelines:

1. **Scam Data Pipeline**: Extract fraud reports from CheckScam.vn using FlareSolverr for Cloudflare bypass
2. **E-commerce Pipeline**: Browser extension for real-time product listing extraction from Shopee/Lazada/Tiki
3. **Item Seeding Pipeline**: Automated product database creation from authoritative sources (GSMArena, PhoneArena, Official Brand Sites) with AI-powered normalization

## Architecture Diagram

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                                 │
├─────────────────────────────────────────────────────────────────────┤
│  CheckScam.vn  │  Shopee/Lazada  │  GSMArena  │  PhoneArena  │ Official Sites  │
│  (Cloudflare)  │  (E-commerce)   │  (Specs)   │  (Backup)    │ (Apple/Samsung) │
└────────┬───────┴────────┬────────┴─────┬──────┴──────┬───────┴────────┬─────┘
         │                 │               │             │                │
         │ FlareSolverr   │ Extension    │ HTTP        │ HTTP          │ HTTP
         │                 │               │             │                │
┌────────▼─────────────────▼───────────────▼─────────────▼────────────▼─────┐
│                        RATE-IMPORTER SYSTEM                                │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ Scam Pipeline    │  │ Listing Pipeline │  │ Item Seeding Pipeline│    │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────────┤    │
│  │ • Link Extract   │  │ • Content Script │  │ • GSMArena Crawler   │    │
│  │ • Data Crawl     │  │ • Background Svc │  │ • PhoneArena Crawler │    │
│  │ • Validation     │  │ • API Client     │  │ • Official Crawlers  │    │
│  │ • Storage        │  │ • AI Processing  │  │ • Wikipedia API      │    │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────────┘    │
│           │                     │                      │                   │
│           └─────────────────────┼──────────────────────┘                   │
│                                 │                                          │
│                    ┌────────────▼─────────────┐                            │
│                    │   AI Processing Layer    │                            │
│                    │  (GPT-4o-mini + Redis)   │                            │
│                    │                           │                            │
│                    │ • Data Normalization     │                            │
│                    │ • Translation (vi/en)    │                            │
│                    │ • Quality Scoring        │                            │
│                    │ • Cache Management       │                            │
│                    └────────────┬─────────────┘                            │
│                                 │                                          │
└─────────────────────────────────┼──────────────────────────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │   Strapi 5 Backend        │
                    │   (PostgreSQL + Redis)    │
                    │                           │
                    │ • ScamReports            │
                    │ • Listings               │
                    │ • Items (NEW)            │
                    │ • Categories             │
                    └───────────────────────────┘
```

### Item Seeding Pipeline (Detailed) - 3-Tier Scraping Strategy

> **See detailed documentation**: [3-Tier Scraping Strategy](./3-Tier-Scraping-Strategy.md)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   3-TIER SCRAPING STRATEGY                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Tier 1: Direct Scraping (Free, Fast) ✅                            │
│  ├─ PhoneArena → Playwright scraper                                 │
│  ├─ GSMArena → Playwright scraper (planned)                         │
│  └─ Official sites → HTTP scraper (planned)                         │
│                                                                      │
│  Tier 2: LLM Web Scraping (~$0.01/product) ⏳                       │
│  ├─ FlareSolverr fetch HTML (bypass Cloudflare)                     │
│  ├─ Clean HTML (remove noise)                                       │
│  ├─ OpenAI GPT-4o-mini extract specs                                │
│  └─ Cache 30 days (LLM cost optimization)                           │
│                                                                      │
│  Tier 3: Paid APIs (~$0.05/product) ⏳                              │
│  ├─ TechSpecs.io API                                                │
│  └─ Cache 90 days (API cost optimization)                           │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────▼─────────┐
│ Orchestrator     │  ← Automatic fallback: Tier 1 → 2 → 3
│  (packages/      │
│   importer)      │
└────────┬─────────┘
         │
         ▼
┌────────▼─────────┐
│ Cache Manager    │  ← Redis cache with tier-based TTL
│  (Redis)         │     Tier 1: 7 days, Tier 2: 30 days, Tier 3: 90 days
└────────┬─────────┘
         │
         ▼
┌────────▼─────────┐
│ Data Mapper      │  ← PhoneArena → Strapi Item structure
│ (packages/       │
│  importer)       │
└────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ AI Normalizer    │
                │ (GPT-4o-mini)    │
                │                  │
                │ • Translate      │
                │ • Standardize    │
                │ • Extract Vars   │
                │ • Score Quality  │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ Quality Validator│
                │                  │
                │ • Completeness   │
                │ • Accuracy       │
                │ • Consistency    │
                │ • Min Score 70%  │
                └────────┬─────────┘
                         │
                    Pass │ Fail → Retry/Skip
                         ▼
                ┌─────────────────┐
                │  Create Item    │
                │  (vi + en)      │
                │                 │
                │ • documentId    │
                │ • specifications│
                │ • images        │
                │ • metadata      │
                └─────────────────┘
```

## Core Components

### Pipeline 1: Scam Data Components

#### 1.1 CLI Interface (`crawl.js`)
**Purpose**: Unified command-line interface for scam crawler operations

**Features**:
- Command routing (links, crawl, cleanup)
- Argument parsing and validation
- Progress reporting and logging
- Error handling and recovery

**Usage**:
```bash
node crawl.js links          # Extract scammer links
node crawl.js crawl --max 10 # Crawl scammer data
node crawl.js cleanup        # Clean obsolete files
```

#### 1.2 Link Extractor (`Scripts/crawl-with-flaresolverr.js`)
**Purpose**: Extract scammer profile links from CheckScam.vn

**Process**:
1. Fetch HTML via FlareSolverr proxy
2. Parse HTML for scammer links
3. Filter and validate URLs
4. Save links to JSON file

**Output**: `Results/scam_links_YYYY-MM-DDTHH-mm-ss-sssZ.json`

#### 1.3 Data Crawler (`Scripts/CheckScamCrawlerV2.js`)
**Purpose**: Extract detailed scammer information from individual pages

**Features**:
- Phone number extraction
- Bank account parsing
- Scam amount detection
- Content analysis
- Quality scoring

**Process**:
1. Load scammer links from JSON
2. Fetch individual pages via FlareSolverr
3. Parse and extract structured data
4. Validate and score data quality
5. Save results with metadata

#### 1.4 FlareSolverr Proxy
**Purpose**: Bypass Cloudflare protection on target websites

**Configuration**:
- **Port**: 8191
- **Network**: Rate (Docker network)
- **Health Check**: HTTP endpoint monitoring
- **Timeout**: Configurable (default 60s)

**API**:
```json
POST /v1
{
  "cmd": "request.get",
  "url": "https://checkscam.vn/...",
  "maxTimeout": 60000
}
```

### Pipeline 3: Item Seeding Components

#### 3.1 Source Crawlers (`apps/strapi/src/crawlers/`)

**GSMArena Crawler** (`gsmarena-crawler.ts`)
- **Method**: Web scraping with Cheerio
- **Rate Limit**: 2 seconds between requests
- **Process**:
  1. Search product by name
  2. Get first result URL
  3. Crawl specs page
  4. Extract: name, images, specifications (tables), metadata
- **Coverage**: 15,000+ phones
- **Reliability**: 95%

**PhoneArena Crawler** (`phonearena-crawler.ts`)
- **Method**: Web scraping + JSON-LD parsing
- **Rate Limit**: 2 seconds
- **Process**: Similar to GSMArena
- **Coverage**: 5,000+ popular models
- **Reliability**: 92%
- **Use**: Backup + cross-verification

**Official Brand Crawlers** (`official-crawler.ts`)
- **Brands**: Apple, Samsung, Xiaomi, Dell, HP, Lenovo
- **Method**:
  - Apple: Structured HTML + JSON-LD
  - Samsung: May need Playwright (dynamic content)
  - Others: Mixed approach
- **Coverage**: Current lineup only
- **Reliability**: 98%
- **Use**: Supplement official info + images

**Wikipedia Crawler** (`wikipedia-crawler.ts`)
- **Method**: Wikipedia API (no scraping)
- **Process**:
  1. Search article
  2. Get page content
  3. Parse infobox (may use AI)
- **Coverage**: Flagship models only
- **Reliability**: 85%
- **Use**: Fallback when others fail

#### 3.2 Crawler Orchestrator (`crawler-orchestrator.ts`)
**Purpose**: Coordinate multi-source crawling with priority logic

**Features**:
- Sequential crawl by source priority
- Early stopping (stop after 2 high-quality sources)
- Error handling per source
- Rate limiting enforcement
- Result aggregation

**Priority Logic**:
```
1. Try Rank 1 source (GSMArena)
2. Try Rank 2 source (PhoneArena)
3. If 2 sources succeeded → stop
4. Try Rank 3 (Official) if flagship brand
5. Try Rank 4 (Wikipedia) if all failed
```

#### 3.3 Data Merger (`apps/strapi/src/services/item-merger.ts`)
**Purpose**: Merge data from multiple sources intelligently

**Strategy**:
- Start with highest reliability source
- Merge specifications from all sources
- Prefer higher reliability for conflicts
- Track source for each field
- Deduplicate images

**Output**:
```typescript
{
  name: "from most reliable",
  specifications: {
    // merged from all sources
    "Display": {
      "Size": "6.7 inch" // from source with highest reliability
    }
  },
  images: [...], // deduplicated
  sources: [
    { name: "GSMArena", reliability: 0.95, url: "..." },
    { name: "PhoneArena", reliability: 0.92, url: "..." }
  ]
}
```

#### 3.4 AI Normalizer (`apps/strapi/src/services/item-normalizer.ts`)
**Purpose**: Use GPT-4o-mini to normalize and translate data

**Tasks**:
1. Create Vietnamese and English versions
2. Standardize specification format
3. Extract variants (colors, storage options)
4. Generate SEO-friendly slug
5. Categorize product
6. Extract key features (top 5-7)
7. Create descriptions (short + long)

**Caching**: Redis cache (90%+ hit rate)

**Quality Scoring**:
```typescript
{
  completeness: 0-1,  // % of fields filled
  confidence: 0-1,    // AI confidence
  missingFields: []   // List of missing fields
}
```

#### 3.5 Quality Validator (`apps/strapi/src/services/item-validator.ts`)
**Purpose**: Validate data quality before Item creation

**Checks**:
- Specifications: min 3 categories
- Images: min 1 image
- Translations: both vi + en exist
- Name: not empty
- Category: valid value

**Scoring**:
- Pass: ≥70% completeness
- Fail: <70% → retry or skip

#### 3.6 Item Seeder Scripts (`apps/strapi/src/scripts/`)

**seed-items-initial.ts**
- One-time seeding of 5000 products
- Progress tracking with checkpoints
- Batch processing (50 items/batch)
- Retry failed items

**seed-items-category.ts**
- Category-specific seeding
- Usage: `yarn seed:items:category phones`

**seed-items-update.ts**
- Periodic updates
- Modes: weekly (top 1000), monthly (all)
- Update strategy: re-crawl + merge

**validate-items.ts**
- Quality check entire database
- Generate quality report
- Output issues to JSON for review

## Data Flow

### Pipeline 1: Scam Data Flow

#### 1. Link Extraction Flow
```
CheckScam.vn → FlareSolverr → Link Extractor → JSON File
```

1. **Request**: CLI triggers link extraction
2. **Fetch**: FlareSolverr fetches HTML from CheckScam.vn
3. **Parse**: Extract scammer links using regex patterns
4. **Filter**: Remove navigation and system links
5. **Save**: Store links in timestamped JSON file

#### 2. Data Crawling Flow
```
JSON Links → FlareSolverr → Data Crawler → Structured Data → JSON File
```

1. **Load**: Read latest scammer links file
2. **Iterate**: Process each link with delay
3. **Fetch**: Get individual page via FlareSolverr
4. **Extract**: Parse structured data (phone, bank, amount, etc.)
5. **Validate**: Check data quality and completeness
6. **Save**: Store results with metadata

### Pipeline 3: Item Seeding Flow

#### Full Item Seeding Flow
```
Product Name → Orchestrator → Multi-Source Crawl → Merger → AI Normalize → Validate → Create Item (vi+en)
```

**Detailed Steps**:

1. **Preparation** (one-time)
   ```
   Build Product List (5000 items)
   ├─ Popular products 2024
   ├─ Best sellers Vietnam
   ├─ Brand catalogs (Apple, Samsung, etc.)
   └─ Market research data

   ↓

   Create Crawl Queue (SQLite)
   ├─ Prioritize by popularity
   ├─ Group by category
   └─ Add metadata (brand, model)
   ```

2. **Queue Processing** (batch)
   ```
   For each product in queue:

   ┌─────────────────────────────────┐
   │  Check if Item exists           │
   │  (by name or documentId)        │
   └───────┬─────────────────────────┘
           │
           ├─ Exists & !forceUpdate → Skip
           │
           ▼
   ┌─────────────────────────────────┐
   │  Orchestrator: Multi-crawl      │
   │  (GSMArena + PhoneArena + ...)  │
   └───────┬─────────────────────────┘
           │
           ▼
   ┌─────────────────────────────────┐
   │  Merger: Combine sources        │
   │  (priority-based merge)         │
   └───────┬─────────────────────────┘
           │
           ▼
   ┌─────────────────────────────────┐
   │  AI Normalizer: GPT-4o-mini     │
   │  • Translate (vi + en)          │
   │  • Standardize specs            │
   │  • Extract variants             │
   │  • Score quality                │
   └───────┬─────────────────────────┘
           │
           ▼
   ┌─────────────────────────────────┐
   │  Quality Validator              │
   │  (min 70% completeness)         │
   └───────┬─────────────────────────┘
           │
           ├─ Pass (≥70%)
           │   ↓
           │   ┌──────────────────────┐
           │   │  Create Item (vi)    │
           │   │  Create Item (en)    │
           │   │  Link by documentId  │
           │   └──────────────────────┘
           │
           └─ Fail (<70%) → Add to retry queue
   ```

3. **Error Handling**
   ```
   Error at any step:
   ├─ Source crawl failed → Try next source
   ├─ All sources failed → Add to retry queue
   ├─ AI failed → Retry with backoff
   ├─ Validation failed → Log + skip
   └─ Strapi create failed → Log + retry
   ```

4. **Progress Tracking**
   ```
   Checkpoint every 50 items:
   ├─ Save progress to file
   ├─ Log statistics
   │   ├─ Processed: 500/5000
   │   ├─ Created: 450
   │   ├─ Failed: 30
   │   └─ Skipped: 20
   └─ Can resume from checkpoint
   ```

#### Auto-growth Flow (Phase 2)
```
New Listing → Auto-Item-Creator → Find Similar → Create or Link
```

**Process**:
1. **Trigger**: New listing created in Strapi
2. **Check**: Does matching Item exist?
   - Exact match (SKU, externalId)
   - AI similarity search (>85% threshold)
3. **Decision**:
   - **Match found** → Link Listing to Item
   - **No match** → Extract Item data with AI
4. **Confidence Check**:
   - **≥95%** → Auto-create Item
   - **80-95%** → Add to review queue
   - **<80%** → Skip, just keep Listing

#### Enhancement Flow (Phase 3)
```
Existing Item → Item-Enhancer → Aggregate Listings → AI Merge → Update Item
```

**Process**:
1. **Trigger**: Scheduled job or manual
2. **Aggregate**: Collect all Listings for this Item
3. **AI Analysis**:
   - Compare specs across Listings
   - Find missing data
   - Detect inconsistencies
4. **Merge Strategy**:
   - Specifications: Union of all fields
   - Description: Pick best quality
   - Images: Collect all
   - Price: Min-max range
5. **Update**: Apply changes to Item

#### Update Schedule Flow
```
Cron Jobs:
├─ Daily (2 AM): Check new flagship products
├─ Weekly (Sunday 3 AM): Update top 1000
└─ Monthly (1st, 4 AM): Full refresh all items
```

### Pipeline 1 & 3: Error Handling Flow
```
Error → Retry Logic → Fallback → Logging → Continue/Abort
```

1. **Detection**: Catch network, parsing, or validation errors
2. **Retry**: Attempt request up to max retries
3. **Fallback**: Use alternative extraction methods
4. **Logging**: Record error details for debugging
5. **Decision**: Continue with next item or abort batch

## Configuration Management

### Environment Variables
```bash
# Core settings
NODE_ENV=development
LOG_LEVEL=info

# FlareSolverr configuration
FLARESOLVERR_URL=http://localhost:8191/v1
FLARESOLVERR_TIMEOUT=60000

# Crawler settings
CHECKSCAM_BASE_URL=https://checkscam.vn
CRAWLER_DELAY_MS=5000
CRAWLER_MAX_RETRIES=3
CRAWLER_TIMEOUT_MS=30000

# Output settings
RESULTS_DIR=Results
LOGS_DIR=Logs
```

### Docker Configuration
```yaml
# docker-compose.yml
services:
  flaresolverr:
    image: flaresolverr/flaresolverr:latest
    environment:
      - LOG_LEVEL=info
      - LOG_HTML=false
    ports:
      - "8191:8191"
    networks:
      - Rate

networks:
  Rate:
    driver: bridge
```

## Data Models

### Scammer Link Schema
```typescript
interface ScammerLink {
  name: string;        // Identifier (phone/account)
  url: string;         // Full URL to scammer page
}
```

### Scammer Data Schema
```typescript
interface ScammerData {
  id: string;          // Unique identifier
  title: string;       // Page title
  phone: string;       // Phone number
  bank: string;        // Bank name
  scam: string;        // Scam type/amount
  content: string;     // Detailed description
  url: string;         // Source URL
  quality: 'high' | 'medium' | 'low';  // Data quality score
  timestamp: string;   // ISO timestamp
}
```

### Batch Result Schema
```typescript
interface CrawlResult {
  metadata: {
    startTime: string;
    endTime: string;
    totalProcessed: number;
    successful: number;
    failed: number;
    qualityDistribution: {
      high: number;
      medium: number;
      low: number;
    };
  };
  data: ScammerData[];
}
```

## Performance Characteristics

### Throughput
- **Link extraction**: 1-5 links/second
- **Data crawling**: 0.1-0.2 pages/second (with delays)
- **Batch processing**: 10-50 records/minute

### Resource Usage
- **Memory**: 100-500MB (depending on batch size)
- **CPU**: Low (I/O bound operations)
- **Network**: 1-10 MB/hour (depending on activity)
- **Storage**: 1-10 MB/day (JSON files)

### Scalability Limits
- **Single instance**: ~1000 records/hour
- **Rate limiting**: Constrained by target website
- **FlareSolverr**: Single proxy instance bottleneck
- **Memory**: Limited by Node.js heap size

## Security Considerations

### Network Security
- FlareSolverr runs in isolated Docker network
- No direct exposure of internal services
- Configurable timeouts prevent hanging connections

### Data Security
- No sensitive credentials stored in code
- Environment-based configuration
- Local file storage (no external transmission)

### Privacy
- Only public scammer data collected
- No personal information beyond reported scams
- Compliance with robots.txt and rate limiting

## Future Architecture

### Planned Enhancements

#### 1. Database Integration
```
JSON Files → PostgreSQL/MongoDB
- Structured storage
- Query capabilities
- Data relationships
- Backup/recovery
```

#### 2. API Layer
```
REST/GraphQL APIs
- External integrations
- Real-time access
- Authentication
- Rate limiting
```

#### 3. Message Queue
```
Redis/RabbitMQ
- Async processing
- Job scheduling
- Retry mechanisms
- Horizontal scaling
```

#### 4. Monitoring
```
Prometheus/Grafana
- Performance metrics
- Health monitoring
- Alerting
- Dashboards
```

## Deployment Patterns

### Development
```
Local Node.js + Docker Compose
- Fast iteration
- Easy debugging
- Local file storage
```

### Staging
```
Docker Containers + Shared Storage
- Production-like environment
- Integration testing
- Performance validation
```

### Production
```
Kubernetes + Persistent Volumes
- High availability
- Auto-scaling
- Load balancing
- Monitoring integration
```
