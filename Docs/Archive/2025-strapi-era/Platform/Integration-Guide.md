# RateBox Module Integration Guide

## 🎯 Overview

This guide explains how to integrate RateBox modules together to create a cohesive platform ecosystem.

## 🏗️ Integration Architecture

### Module Dependencies

```
Rate-New (Core Platform)
    ↑
    ├── Rate-Importer (Data Provider)
    ├── Rate-Extension (Data Collector)
    └── Shared Packages (Common Logic)
```

### Data Flow Integration

```
External Sources → Rate-Importer → Validation → Rate-New → Rate-Extension
     ↓                ↓              ↓           ↓            ↓
CheckScam.vn     Data Processing  Core Validator  API Server   Browser
User Reports     Proxy Handling   Schema Check    Database     Real-time
Manual Entry     Captcha Solving  Business Rules  Dashboard    Protection
```

## 📦 Shared Packages

### Core Validator Package

**Location**: `packages/core-validator/`

```typescript
// Shared validation logic
export interface ValidationResult {
  isValid: boolean;
  data: any;
  errors: ValidationError[];
  metadata: ValidationMetadata;
}

export class CoreValidator {
  async validate(data: any, options?: ValidationOptions): Promise<ValidationResult> {
    // Implementation
  }
}
```

**Usage in Rate-Importer**:
```typescript
import { CoreValidator } from '@ratebox/core-validator';

const validator = new CoreValidator(config);
const result = await validator.validate(crawledData);
```

**Usage in Rate-New**:
```typescript
import { CoreValidator } from '@ratebox/core-validator';

// API endpoint validation
app.post('/api/reports', async (req, res) => {
  const result = await validator.validate(req.body);
  if (!result.isValid) {
    return res.status(400).json(result.errors);
  }
  // Process valid data
});
```

### Shared Data Types

**Location**: `packages/shared-types/`

```typescript
// Common data structures
export interface ScamReport {
  id: string;
  type: 'phone' | 'website' | 'social' | 'financial';
  identifier: string;
  description: string;
  evidence: Evidence[];
  metadata: ReportMetadata;
}

export interface ValidationConfig {
  schema: SchemaDefinition;
  rules: BusinessRule[];
  enrichers: DataEnricher[];
}
```

## 🔌 API Integration

### Rate-Importer → Rate-New

**Data Submission Endpoint**:
```typescript
// Rate-New API endpoint
POST /api/crawler/submit
Content-Type: application/json

{
  "source": "checkscam",
  "batch_id": "batch_2025_06_06_001",
  "data": [
    {
      "type": "phone",
      "identifier": "0901234567",
      "description": "Scammer profile",
      "evidence": [...],
      "metadata": {
        "crawled_at": "2025-06-06T00:00:00Z",
        "source_url": "https://checkscam.vn/...",
        "confidence": 0.95
      }
    }
  ]
}
```

**Rate-Importer Integration**:
```typescript
// In Rate-Importer
import { ApiClient } from '@ratebox/api-client';

class CrawlerIntegration {
  private apiClient: ApiClient;

  async submitData(crawledData: CrawledData[]) {
    const validatedData = await this.validator.validate(crawledData);
    
    if (validatedData.isValid) {
      await this.apiClient.post('/api/crawler/submit', {
        source: 'checkscam',
        batch_id: this.generateBatchId(),
        data: validatedData.data
      });
    }
  }
}
```

### Rate-Extension → Rate-New

**Real-time Report Endpoint**:
```typescript
// Rate-New API endpoint
POST /api/reports/realtime
Content-Type: application/json
Authorization: Bearer <extension_token>

{
  "type": "website",
  "url": "https://suspicious-site.com",
  "user_id": "user_123",
  "evidence": {
    "screenshot": "base64_data",
    "html_content": "...",
    "network_requests": [...]
  },
  "metadata": {
    "browser": "Chrome 120",
    "timestamp": "2025-06-06T00:00:00Z",
    "user_agent": "..."
  }
}
```

## 🔄 Event-Driven Integration

### Event System

```typescript
// Shared event types
export interface PlatformEvent {
  type: string;
  source: string;
  timestamp: Date;
  data: any;
  metadata?: any;
}

// Event handlers
export interface EventHandler {
  handle(event: PlatformEvent): Promise<void>;
}
```

### Event Flow

```typescript
// Rate-Importer publishes events
eventBus.publish({
  type: 'data.crawled',
  source: 'rate-importer',
  data: { batch_id: 'batch_001', count: 150 }
});

// Rate-New subscribes to events
eventBus.subscribe('data.crawled', async (event) => {
  await this.processCrawledData(event.data);
  
  // Notify dashboard
  websocket.broadcast({
    type: 'crawler.update',
    data: event.data
  });
});
```

## 🗄️ Database Integration

### Shared Database Schema

```sql
-- Core tables used by multiple modules
CREATE TABLE scam_reports (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  identifier VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB
);

CREATE TABLE validation_results (
  id UUID PRIMARY KEY,
  report_id UUID REFERENCES scam_reports(id),
  validator_version VARCHAR(20),
  is_valid BOOLEAN,
  confidence DECIMAL(3,2),
  errors JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Database Access Patterns

```typescript
// Shared database client
export class DatabaseClient {
  async insertReport(report: ScamReport): Promise<string> {
    // Implementation
  }
  
  async getReports(filters: ReportFilters): Promise<ScamReport[]> {
    // Implementation
  }
  
  async updateReport(id: string, updates: Partial<ScamReport>): Promise<void> {
    // Implementation
  }
}
```

## 🔧 Configuration Management

### Centralized Configuration

```typescript
// packages/config/src/index.ts
export interface PlatformConfig {
  database: DatabaseConfig;
  api: ApiConfig;
  crawler: CrawlerConfig;
  validation: ValidationConfig;
  security: SecurityConfig;
}

export function loadConfig(): PlatformConfig {
  return {
    database: {
      url: process.env.DATABASE_URL,
      pool_size: parseInt(process.env.DB_POOL_SIZE || '10')
    },
    api: {
      base_url: process.env.API_BASE_URL,
      timeout: parseInt(process.env.API_TIMEOUT || '30000')
    },
    crawler: {
      flaresolverr_url: process.env.FLARESOLVERR_URL,
      delay_ms: parseInt(process.env.CRAWLER_DELAY_MS || '2000')
    }
  };
}
```

### Module-Specific Configuration

```typescript
// Rate-Importer configuration
const config = loadConfig();
const crawlerConfig = {
  ...config.crawler,
  sources: ['checkscam'],
  output_format: 'json'
};

// Rate-New configuration
const apiConfig = {
  ...config.api,
  cors_origins: ['http://localhost:3000'],
  rate_limit: 100
};
```

## 🔐 Security Integration

### Authentication & Authorization

```typescript
// Shared authentication
export interface AuthToken {
  user_id: string;
  permissions: string[];
  expires_at: Date;
}

export class AuthService {
  async validateToken(token: string): Promise<AuthToken | null> {
    // Implementation
  }
  
  async hasPermission(token: AuthToken, permission: string): Promise<boolean> {
    return token.permissions.includes(permission);
  }
}
```

### API Security

```typescript
// Rate-New middleware
app.use('/api/crawler', async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const authToken = await authService.validateToken(token);
  
  if (!authToken || !await authService.hasPermission(authToken, 'crawler.submit')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = authToken;
  next();
});
```

## 📊 Monitoring Integration

### Health Checks

```typescript
// Shared health check interface
export interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  details?: any;
  timestamp: Date;
}

// Module health checks
export class ModuleHealthChecker {
  async checkHealth(): Promise<HealthCheck[]> {
    return [
      await this.checkDatabase(),
      await this.checkExternalServices(),
      await this.checkMemoryUsage()
    ];
  }
}
```

### Metrics Collection

```typescript
// Shared metrics
export interface Metric {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: Date;
}

// Usage in modules
metrics.increment('crawler.records_processed', 1, {
  source: 'checkscam',
  status: 'success'
});

metrics.gauge('api.response_time', responseTime, {
  endpoint: '/api/reports',
  method: 'POST'
});
```

## 🚀 Deployment Integration

### Docker Compose Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  rate-new-api:
    build: ./Rate-New
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/ratebox
    depends_on:
      - db
    networks:
      - ratebox

  rate-importer:
    build: ./Rate-Importer
    environment:
      - API_BASE_URL=http://rate-new-api:3000
      - FLARESOLVERR_URL=http://flaresolverr:8191
    depends_on:
      - rate-new-api
      - flaresolverr
    networks:
      - ratebox

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=ratebox
      - POSTGRES_USER=ratebox
      - POSTGRES_PASSWORD=password
    networks:
      - ratebox

networks:
  ratebox:
    driver: bridge
```

### Environment Management

```bash
# Shared environment variables
DATABASE_URL=postgresql://user:pass@localhost:5432/ratebox
API_BASE_URL=http://localhost:3000
FLARESOLVERR_URL=http://localhost:8191

# Module-specific variables
CRAWLER_DELAY_MS=2000
CRAWLER_MAX_RETRIES=3
API_RATE_LIMIT=100
API_CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

## 🧪 Testing Integration

### Integration Tests

```typescript
// tests/integration/crawler-api.test.ts
describe('Crawler API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
    await startTestServices();
  });

  test('should submit crawler data to API', async () => {
    const crawlerData = generateTestCrawlerData();
    const response = await apiClient.post('/api/crawler/submit', crawlerData);
    
    expect(response.status).toBe(200);
    expect(response.data.batch_id).toBeDefined();
    
    // Verify data in database
    const reports = await db.getReports({ batch_id: response.data.batch_id });
    expect(reports).toHaveLength(crawlerData.data.length);
  });
});
```

### End-to-End Tests

```typescript
// tests/e2e/platform.test.ts
describe('Platform E2E', () => {
  test('should process data from crawler to dashboard', async () => {
    // 1. Trigger crawler
    await crawler.crawl('https://checkscam.vn/test-page');
    
    // 2. Wait for data processing
    await waitFor(() => 
      dashboard.getRecentReports().length > 0
    );
    
    // 3. Verify data appears in dashboard
    const reports = await dashboard.getRecentReports();
    expect(reports).toContainEqual(
      expect.objectContaining({
        source: 'checkscam',
        type: 'phone'
      })
    );
  });
});
```

---

**Integration Strategy**: API-first, event-driven, shared packages  
**Security**: Token-based auth, permission system  
**Monitoring**: Health checks, metrics, logging  
**Deployment**: Docker Compose, environment management
