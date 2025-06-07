# Rate Platform - System Architecture (Hybrid Approach)

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCES                               │
├─────────────────┬─────────────────┬─────────────────┬──────────────┤
│  Web Scrapers   │ Browser Extensions│   User Forms    │  APIs/Import │
│  (Playwright)   │  (Chrome Ext)     │  (Next.js)      │  (CSV/JSON)  │
└────────┬────────┴────────┬────────┴────────┬────────┴──────┬───────┘
         │                 │                 │                │
         ▼                 ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ADAPTER LAYER                                 │
├─────────────────┬─────────────────┬─────────────────┬──────────────┤
│ WebAdapter.js   │ ExtAdapter.js   │ FormAdapter.js  │ FileAdapter.js│
└────────┬────────┴────────┬────────┴────────┬────────┴──────┬───────┘
         │                 │                 │                │
         └─────────────────┴─────────────────┴────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VALIDATION PIPELINE                             │
├─────────────────────────────────────────────────────────────────────┤
│  1. Schema Validation → 2. Business Rules → 3. Enrichment → 4. Dedup│
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         STORAGE LAYER                                │
├──────────────────┬──────────────────┬───────────────────────────────┤
│   PostgreSQL     │   Redis Cache    │      File Storage (S3)        │
│   (Strapi DB)    │  (Temp/Queue)    │    (Images/Documents)         │
└──────────────────┴──────────────────┴───────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          API LAYER                                   │
├──────────────────┬──────────────────┬───────────────────────────────┤
│   Strapi CMS     │  Custom APIs     │      WebSocket/SSE            │
│  (CRUD/Admin)    │  (Validation)    │    (Real-time updates)        │
└──────────────────┴──────────────────┴───────────────────────────────┘
```

## 📁 Project Structure

```
rate-platform/
├── packages/
│   ├── core-validator/          # Shared validation logic
│   │   ├── src/
│   │   │   ├── validators/
│   │   │   │   ├── schema.validator.js
│   │   │   │   ├── business.validator.js
│   │   │   │   └── fraud.validator.js
│   │   │   ├── enrichers/
│   │   │   │   ├── phone.enricher.js
│   │   │   │   ├── location.enricher.js
│   │   │   │   └── category.enricher.js
│   │   │   ├── utils/
│   │   │   │   ├── bank.mapper.js
│   │   │   │   ├── amount.parser.js
│   │   │   │   └── duplicate.checker.js
│   │   │   └── index.js
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── adapters/               # Source-specific adapters
│   │   ├── web-adapter/
│   │   │   ├── src/
│   │   │   │   ├── parsers/
│   │   │   │   │   ├── checkscam.parser.js
│   │   │   │   │   ├── canhbao.parser.js
│   │   │   │   │   └── base.parser.js
│   │   │   │   ├── cleaners/
│   │   │   │   │   ├── html.cleaner.js
│   │   │   │   │   └── encoding.fixer.js
│   │   │   │   └── index.js
│   │   │   └── package.json
│   │   │
│   │   ├── extension-adapter/
│   │   │   ├── src/
│   │   │   │   ├── processors/
│   │   │   │   │   ├── image.processor.js
│   │   │   │   │   └── content.processor.js
│   │   │   │   └── index.js
│   │   │   └── package.json
│   │   │
│   │   ├── form-adapter/
│   │   │   ├── src/
│   │   │   │   ├── validators/
│   │   │   │   │   ├── realtime.validator.js
│   │   │   │   │   └── autocomplete.js
│   │   │   │   └── index.js
│   │   │   └── package.json
│   │   │
│   │   └── file-adapter/
│   │       ├── src/
│   │       │   ├── parsers/
│   │       │   │   ├── csv.parser.js
│   │       │   │   ├── excel.parser.js
│   │       │   │   └── json.parser.js
│   │       │   └── index.js
│   │       └── package.json
│   │
│   ├── queue-processor/        # Background job processing
│   │   ├── src/
│   │   │   ├── workers/
│   │   │   │   ├── validation.worker.js
│   │   │   │   ├── enrichment.worker.js
│   │   │   │   └── notification.worker.js
│   │   │   ├── queues/
│   │   │   │   ├── bull.config.js
│   │   │   │   └── queue.manager.js
│   │   │   └── index.js
│   │   └── package.json
│   │
│   └── api-gateway/           # API orchestration
│       ├── src/
│       │   ├── routes/
│       │   │   ├── validation.routes.js
│       │   │   ├── import.routes.js
│       │   │   └── export.routes.js
│       │   ├── middleware/
│       │   │   ├── auth.middleware.js
│       │   │   ├── rate-limit.js
│       │   │   └── validation.middleware.js
│       │   └── index.js
│       └── package.json
│
├── apps/
│   ├── strapi/                # CMS Backend
│   │   ├── api/
│   │   │   └── scam-report/
│   │   │       ├── models/
│   │   │       ├── controllers/
│   │   │       └── services/
│   │   └── config/
│   │
│   ├── web/                   # Next.js Frontend
│   │   ├── pages/
│   │   │   ├── reports/
│   │   │   │   ├── new.js    # User input form
│   │   │   │   └── [id].js   # Report detail
│   │   │   └── admin/
│   │   │       └── validation-queue.js
│   │   └── components/
│   │       ├── forms/
│   │       │   └── ScamReportForm.js
│   │       └── validation/
│   │           └── RealtimeValidator.js
│   │
│   └── crawler/              # Standalone crawlers
│       ├── playwright/
│       │   ├── crawlers/
│       │   │   ├── checkscam.crawler.js
│       │   │   └── canhbao.crawler.js
│       │   └── scheduler.js
│       └── extensions/
│           └── rate-crawler/
│
├── docker-compose.yml
├── package.json              # Monorepo root
└── turbo.json               # Turborepo config
```

## 🔧 Implementation Details

### 1. Core Validator Package
```javascript
// packages/core-validator/src/index.js
export class CoreValidator {
  constructor(config) {
    this.schemaValidator = new SchemaValidator(config.schema);
    this.businessValidator = new BusinessValidator(config.rules);
    this.fraudDetector = new FraudDetector(config.fraudRules);
    this.enrichmentPipeline = new EnrichmentPipeline(config.enrichers);
    this.duplicateChecker = new DuplicateChecker(config.db);
  }

  async validate(data, options = {}) {
    const pipeline = [
      // Step 1: Schema validation
      () => this.schemaValidator.validate(data),
      
      // Step 2: Business rules
      () => this.businessValidator.validate(data),
      
      // Step 3: Fraud detection
      () => this.fraudDetector.analyze(data),
      
      // Step 4: Data enrichment
      () => this.enrichmentPipeline.enrich(data),
      
      // Step 5: Duplicate check
      () => this.duplicateChecker.check(data),
    ];

    const results = await this.runPipeline(pipeline, data, options);
    return this.formatResults(results);
  }
}
```

### 2. Adapter Example
```javascript
// packages/adapters/web-adapter/src/index.js
export class WebScraperAdapter {
  constructor(parser) {
    this.parser = parser;
    this.cleaner = new HTMLCleaner();
    this.encoder = new EncodingFixer();
  }

  async transform(rawData) {
    // 1. Clean HTML
    const cleanedData = this.cleaner.clean(rawData);
    
    // 2. Fix encoding
    const fixedData = this.encoder.fix(cleanedData);
    
    // 3. Parse with site-specific parser
    const parsedData = await this.parser.parse(fixedData);
    
    // 4. Add metadata
    return {
      ...parsedData,
      _meta: {
        source: 'web_scraper',
        parser: this.parser.name,
        crawled_at: new Date(),
        raw_data: options.keepRaw ? rawData : undefined
      }
    };
  }
}
```

### 3. Queue Processing
```javascript
// packages/queue-processor/src/workers/validation.worker.js
export class ValidationWorker {
  constructor(validator, adapters) {
    this.validator = validator;
    this.adapters = adapters;
  }

  async process(job) {
    const { data, source, options } = job.data;
    
    try {
      // 1. Get appropriate adapter
      const adapter = this.adapters[source];
      if (!adapter) throw new Error(`Unknown source: ${source}`);
      
      // 2. Transform data
      const transformed = await adapter.transform(data);
      
      // 3. Validate
      const validation = await this.validator.validate(transformed, options);
      
      // 4. Handle results
      if (validation.isValid) {
        await this.saveToDatabase(validation.data);
        await this.notifySuccess(job.id, validation);
      } else {
        await this.handleErrors(job.id, validation);
      }
      
      return validation;
      
    } catch (error) {
      await this.handleError(job.id, error);
      throw error;
    }
  }
}
```

### 4. API Gateway
```javascript
// packages/api-gateway/src/routes/validation.routes.js
export const validationRoutes = (app, services) => {
  // Validate single item
  app.post('/api/validate', async (req, res) => {
    const { data, source } = req.body;
    
    // Quick validation for immediate response
    const quickCheck = await services.validator.quickValidate(data);
    
    if (quickCheck.hasErrors) {
      return res.status(400).json(quickCheck);
    }
    
    // Queue for full processing
    const job = await services.queue.add('validation', {
      data,
      source,
      userId: req.user.id
    });
    
    res.json({
      jobId: job.id,
      status: 'processing',
      quickCheck
    });
  });
  
  // Bulk import
  app.post('/api/import', upload.single('file'), async (req, res) => {
    const file = req.file;
    const { source } = req.body;
    
    // Parse file
    const items = await services.fileAdapter.parse(file);
    
    // Queue all items
    const jobs = await services.queue.addBulk(
      items.map(item => ({
        name: 'validation',
        data: { data: item, source }
      }))
    );
    
    res.json({
      jobIds: jobs.map(j => j.id),
      count: items.length,
      status: 'processing'
    });
  });
};
```

## 🚀 Deployment

### Docker Compose Setup
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: rate_platform
      POSTGRES_USER: rate_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

  strapi:
    build: ./apps/strapi
    depends_on:
      - postgres
    environment:
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: rate_platform
      DATABASE_USERNAME: rate_user
      DATABASE_PASSWORD: ${DB_PASSWORD}
    volumes:
      - ./apps/strapi:/srv/app
      - strapi_uploads:/srv/app/public/uploads

  queue-processor:
    build: ./packages/queue-processor
    depends_on:
      - redis
      - postgres
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgres://rate_user:${DB_PASSWORD}@postgres:5432/rate_platform
    deploy:
      replicas: 3

  api-gateway:
    build: ./packages/api-gateway
    depends_on:
      - strapi
      - redis
    ports:
      - "3001:3001"
    environment:
      STRAPI_URL: http://strapi:1337
      REDIS_URL: redis://redis:6379

  web:
    build: ./apps/web
    depends_on:
      - api-gateway
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001

volumes:
  postgres_data:
  redis_data:
  strapi_uploads:
```

## 📊 Benefits

1. **Scalability**
   - Horizontal scaling với queue workers
   - Cache layer với Redis
   - CDN cho static assets

2. **Maintainability**
   - Clear separation of concerns
   - Monorepo với shared packages
   - Type safety với TypeScript

3. **Flexibility**
   - Easy to add new sources
   - Pluggable validators/enrichers
   - API-first design

4. **Performance**
   - Async processing với queues
   - Batch operations
   - Efficient caching

5. **Reliability**
   - Retry mechanisms
   - Error tracking
   - Data backup
