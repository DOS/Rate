# Rate Importer Module

> ⚠️ **Tài liệu lỗi thời (thời Strapi CMS, 2025).** Trang này mô tả crawler cũ (CheckScam, FlareSolverr, Strapi, Splink) đã bị xóa khỏi `apps/importer` ở issue #137. Engine hiện tại là `@repo/crawlers`, xem [`apps/importer/README.md`](../../../../../apps/importer/README.md). Scraper và queue worker nằm trong repo private `DOS/Rate-Services`.

## 📋 Overview

The Rate Importer module is responsible for:

1. **Scam Data Extraction**: Crawling scam reports from CheckScam.vn and other fraud databases
2. **E-commerce Data Crawling**: Extracting product listings from Shopee, Lazada, Tiki (via Browser Extension)
3. **Item Database Seeding**: Building authoritative product database from trusted sources (GSMArena, PhoneArena, Official Brand Sites)

## 🏗️ Architecture

### Components

#### 1. Scam Data Pipeline

- **CheckScam Crawler**: Main crawler for checkscam.vn
- **FlareSolverr Integration**: Cloudflare bypass proxy
- **Core Validator**: Data validation and enrichment

#### 2. E-commerce Data Pipeline

- **Browser Extension**: Chrome/Edge extension for Shopee/Lazada/Tiki
- **Content Script**: Extract listing data from product pages
- **Background Service**: Send data to Strapi API

#### 3. Item Seeding Pipeline (NEW)

- **Trusted Source Crawlers**: GSMArena, PhoneArena, Official Sites
- **AI Normalizer**: GPT-4o-mini for data normalization & translation
- **Multi-source Merger**: Combine data from multiple sources by priority
- **Quality Validator**: Ensure data completeness before Item creation

### Data Flow

```
1. Scam Data:
   CheckScam.vn → FlareSolverr → Crawler → Validator → Strapi

2. Listing Data:
   Shopee/Lazada → Extension → Strapi API → AI Processing → Database

3. Item Seeding:
   GSMArena/PhoneArena/Official → Crawlers → AI Normalize → Merge → Validate → Strapi Items
```

## 🚀 Quick Start

### Prerequisites

```powershell
node --version      # 22.x
docker --version    # latest
docker compose version
```

### Setup (repo riêng của Importer)

```powershell
cd Rate-Importer
docker compose up -d         # FlareSolverr
npm install
Copy-Item .env.example .env  # cấu hình env
```

### Usage

#### Scam Data Crawling

```bash
# Extract scammer links
node crawl.js links

# Crawl detailed data
node crawl.js crawl

# Clean up project
node crawl.js cleanup
```

#### Item Database Seeding

```bash
# One-time initial seeding (5000 popular products)
yarn seed:items:initial

# Seed specific category
yarn seed:items:category phones
yarn seed:items:category laptops

# Add specific product
yarn seed:items:add "iPhone 16 Pro Max"

# Update existing items (weekly/monthly)
yarn seed:items:update --mode weekly   # Top 1000 popular
yarn seed:items:update --mode monthly  # All items

# Validate item database quality
yarn seed:items:validate
```

#### E-commerce Extension

```bash
# Load extension in browser
1. Open chrome://extensions/
2. Enable Developer Mode
3. Load unpacked: apps/extension/Crawler/
4. Navigate to Shopee/Lazada product page
5. Extension auto-extracts and sends to Strapi
```

## 📊 Current Status

### Scam Data Pipeline

- ✅ **Working**: CheckScam.vn crawler with FlareSolverr
- ✅ **Integrated**: Docker Compose setup
- ✅ **Documented**: Complete API and deployment docs

### E-commerce Data Pipeline

- ✅ **Working**: Shopee extension with auto-extraction
- ✅ **Integrated**: Strapi API integration
- ✅ **Working**: AI processing with GPT-4o-mini
- ✅ **Working**: Redis caching for AI results

### Item Seeding Pipeline

- 🔄 **In Progress**: Trusted source crawler design
- ⏳ **Planned**: GSMArena crawler implementation
- ⏳ **Planned**: PhoneArena crawler implementation
- ⏳ **Planned**: Official brand site crawlers
- ⏳ **Planned**: AI normalization service
- ⏳ **Planned**: Multi-source merger logic

## 🔗 Related Documentation

- [API](./API.md)
- [Deployment](./Deployment.md)
- [Architecture](./Architecture.md)
- [Roadmap](./Roadmap.md)

## 📁 Module Location

```
apps/importer/                      # Main importer app (legacy)
├── Scripts/                        # Scam data crawler scripts
├── Results/                        # Crawled data output
├── Logs/                           # Crawler logs
└── docker-compose.yml              # FlareSolverr setup

apps/extension/Crawler/             # Browser extension for e-commerce
├── manifest.json                   # Extension manifest
├── content-script.js               # Page data extraction
├── background.js                   # API communication
└── popup.html                      # Extension UI

apps/strapi/src/crawlers/          # NEW: Item seeding crawlers
├── gsmarena-crawler.ts             # GSMArena scraper
├── phonearena-crawler.ts           # PhoneArena scraper
├── official-crawler.ts             # Brand site scrapers
├── wikipedia-crawler.ts            # Wikipedia API
└── crawler-orchestrator.ts         # Multi-source coordinator

apps/strapi/src/services/
├── item-seeder.ts                  # Item seeding service
├── item-normalizer.ts              # AI data normalization
├── item-merger.ts                  # Multi-source merger
└── item-validator.ts               # Quality validation

apps/strapi/src/scripts/
├── seed-items-initial.ts           # One-time seeding
├── seed-items-category.ts          # Category-specific
├── seed-items-update.ts            # Periodic updates
└── validate-items.ts               # Database validation
```

## 🎯 Item Seeding Roadmap

### Phase 1: Foundation (Week 1-2)

**Goal**: Build initial Item database with 5000 popular products

- [ ] Implement GSMArena crawler with search + specs extraction
- [ ] Implement PhoneArena crawler as backup source
- [ ] Implement Official brand crawlers (Apple, Samsung, Xiaomi)
- [ ] Create AI normalization service (GPT-4o-mini)
- [ ] Create multi-source merger with priority logic
- [ ] Create quality validator with completeness scoring
- [ ] Build product list (5000 items: phones, laptops, appliances)
- [ ] Run initial seeding script
- [ ] Validate database quality (>90% completeness target)

### Phase 2: Auto-growth (Week 3-4)

**Goal**: Automatically create Items from incoming Listings

- [ ] Implement auto-item-creator service
- [ ] Add similarity matching for existing Items
- [ ] Create review queue for low-confidence Items
- [ ] Add confidence threshold system (>95% auto-create, 80-95% review, <80% skip)
- [ ] Integrate into listing processor workflow
- [ ] Add admin dashboard for review queue

### Phase 3: Enhancement (Month 2)

**Goal**: Continuously improve Item quality

- [ ] Implement item-enhancer service
- [ ] Aggregate specs from multiple Listings
- [ ] Fix missing data in existing Items
- [ ] Add alternative names/variations
- [ ] Schedule periodic enhancement jobs
- [ ] Track Item improvement metrics

### Phase 4: Maintenance (Ongoing)

**Goal**: Keep Item database fresh and accurate

- [ ] Daily: Check for new flagship products
- [ ] Weekly: Update top 1000 popular Items
- [ ] Monthly: Full refresh of all Items
- [ ] Quarterly: Re-validate entire database
- [ ] Add monitoring dashboard for data quality
- [ ] Alert on quality degradation

## 🔧 Configuration

### Environment Variables

```bash
# FlareSolverr (for Scam crawler)
FLARESOLVERR_URL=http://localhost:8191/v1
FLARESOLVERR_TIMEOUT=60000

# CheckScam
CHECKSCAM_BASE_URL=https://checkscam.vn
CRAWLER_DELAY_MS=2000
CRAWLER_MAX_RETRIES=3

# Item Seeding Crawlers
GSMARENA_BASE_URL=https://www.gsmarena.com
PHONEARENA_BASE_URL=https://www.phonearena.com
CRAWLER_RATE_LIMIT_MS=2000  # 2 seconds between requests
CRAWLER_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36

# AI Processing (for Item normalization)
OPENAI_API_KEY=sk-proj-xxxxx
OPENAI_MODEL=gpt-4o-mini
AI_CACHE_ENABLED=true

# Item Seeding Settings
ITEM_SEED_BATCH_SIZE=50
ITEM_SEED_AUTO_CREATE_THRESHOLD=0.95
ITEM_SEED_REVIEW_THRESHOLD=0.80
ITEM_QUALITY_MIN_SCORE=0.70
```

### Docker Network

```yaml
# Uses 'Rate' network for integration
networks:
  Rate:
    driver: bridge
```

## 📈 Performance Metrics

### Scam Data Crawler

- **Success Rate**: ~85% with FlareSolverr
- **Speed**: ~100 records/hour
- **Accuracy**: 95%+ data validation
- **Reliability**: Auto-retry with exponential backoff

### Item Seeding Crawler

- **Throughput**: 50-100 items/hour (with multi-source crawl)
- **Success Rate**: ~90% (GSMArena primary, fallback to others)
- **Data Quality**: >90% completeness target
- **Rate Limiting**: 2s between requests per source
- **Cache Hit Rate**: 90%+ for AI normalization (Redis)

### E-commerce Extension

- **Extraction Speed**: Real-time on page load
- **Success Rate**: 95%+ for Shopee
- **Data Quality**: High (structured API data)
- **AI Processing**: 2-5s per listing

## 🐛 Troubleshooting

### Common Issues

1. **FlareSolverr not responding**: Check Docker container status
2. **Cloudflare blocking**: Verify proxy configuration
3. **Data validation errors**: Check schema compatibility
4. **Network timeouts**: Adjust timeout settings

### Debug Commands

```bash
# Check FlareSolverr health
curl http://localhost:8191/v1

# Test crawler with debug
DEBUG=true node crawl.js links

# View recent logs
tail -f Logs/crawler.log
```

---

_This module is part of the Rate Platform ecosystem. For system-wide documentation, see [Rate Platform Overview](../README.md)._
