# 🤖 AI Integration for Validator Module

## Overview

The Validator module integrates AI capabilities to enhance scam detection, spam identification, and fake review analysis for the Rate Platform. This document outlines the complete AI integration architecture, implementation guide, and API reference.

## Table of Contents
- [Architecture](#architecture)
- [Provider System](#provider-system)
- [Implementation Guide](#implementation-guide)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Monitoring](#monitoring)

## Architecture

### System Flow
```
Input Data → Rules Engine → AI Analysis → Scoring Engine → Database
                ↓              ↓              ↓
            (< 10ms)      (200-500ms)    Combined Result
```

### Component Architecture
```
┌─────────────────────────────────────────────────────┐
│                  AI Analysis Layer                   │
├─────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐│
│  │ Rules Engine │  │ NLP Service  │  │ ML Models  ││
│  │ - Keywords   │  │ - PhoBERT    │  │ - Fraud    ││
│  │ - Patterns   │  │ - Sentiment  │  │ - Spam     ││
│  │ - Blacklist  │  │ - Entity     │  │ - Fake     ││
│  └──────────────┘  └──────────────┘  └────────────┘│
│         ↓                ↓                 ↓        │
│  ┌──────────────────────────────────────────────┐  │
│  │           Scoring & Decision Engine          │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Provider System

### Provider Interface
```typescript
interface AIProvider {
  name: string;
  analyze(text: string): Promise<AnalysisResult>;
  detectSpam(data: SpamCheckData): Promise<SpamResult>;
  checkFakeReview(review: string): Promise<FakeReviewResult>;
  analyzeSentiment(text: string): Promise<SentimentResult>;
}
```

### Supported Providers

#### OpenAI (MVP - Default)
- **Model**: GPT-4 Turbo
- **Cost**: $0.01-0.03 per request
- **Latency**: 200-500ms
- **Setup Time**: 5 minutes

#### Self-Hosted (Future)
- **Models**: PhoBERT (Vietnamese NLP), Llama 3
- **Cost**: Infrastructure only
- **Latency**: 50-200ms
- **Setup Time**: 2-3 days

### Provider Configuration
```env
# MVP Configuration (OpenAI)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-xxxxx
OPENAI_MODEL=gpt-4-turbo-preview
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=2000

# Future Self-Hosted Configuration
# AI_PROVIDER=selfhosted
# PHOBERT_URL=http://localhost:5000
# LLAMA_URL=http://localhost:8080
```

## Implementation Guide

### Installation

```bash
# Add AI dependencies to validator package
yarn workspace @repo/validator add openai ioredis
yarn workspace @repo/validator add -D @types/node
```

### Basic Implementation

```typescript
// packages/validator/src/ai/ai-service.ts
import { OpenAIProvider } from './providers/openai';
import { RulesEngine } from './rules-engine';
import Redis from 'ioredis';

export class AIAnalysisService {
  private provider: AIProvider;
  private rulesEngine: RulesEngine;
  private redis: Redis;
  
  constructor() {
    this.provider = this.initializeProvider();
    this.rulesEngine = new RulesEngine();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: 6379
    });
  }
  
  async analyzeContent(data: {
    type: 'phone' | 'website' | 'review' | 'transaction';
    content: any;
    source: string;
  }): Promise<AnalysisResult> {
    // 1. Check cache
    const cacheKey = `ai:analysis:${this.hashContent(data)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    // 2. Run rules engine (fast check)
    const rulesResult = await this.rulesEngine.check(data);
    
    // 3. Run AI analysis if needed
    if (rulesResult.confidence < 0.95) {
      const aiResult = await this.provider.analyze(data.content);
      return this.combineResults(rulesResult, aiResult);
    }
    
    return this.formatRulesResult(rulesResult);
  }
}
```

### Rules Engine

```typescript
// packages/validator/src/ai/rules-engine.ts
export class RulesEngine {
  private rules = {
    phone: {
      patterns: [
        { regex: /^(1900|1800)/, score: 0.8, indicator: 'Premium number' },
        { regex: /(\d)\1{4,}/, score: 0.6, indicator: 'Sequential digits' }
      ]
    },
    keywords: {
      high_risk: {
        words: ['lừa đảo', 'scam', 'hack', 'chiếm đoạt'],
        score: 0.9
      },
      medium_risk: {
        words: ['khẩn cấp', 'OTP', 'mã xác thực'],
        score: 0.6
      }
    }
  };
  
  async check(data: any): Promise<RuleCheckResult> {
    // Implementation here
  }
}
```

## API Reference

### Endpoints

#### POST `/api/ai-analysis/analyze`
Analyze single content for scam indicators.

**Request:**
```json
{
  "type": "phone|website|review|transaction",
  "content": "string or object",
  "source": "crawler|user|api"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isScam": true,
    "confidence": 0.85,
    "category": "financial",
    "severity": "high",
    "indicators": ["keyword:lừa đảo", "pattern:urgent"],
    "sentiment": "negative",
    "explanation": "Phát hiện dấu hiệu lừa đảo tài chính..."
  }
}
```

#### POST `/api/ai-analysis/batch`
Batch analyze multiple items.

**Request:**
```json
{
  "items": [
    { "type": "phone", "content": "0901234567" },
    { "type": "review", "content": "Sản phẩm rất tốt..." }
  ]
}
```

#### GET `/api/ai-analysis/stats`
Get analysis statistics.

**Response:**
```json
{
  "total_analyzed": 1523,
  "scam_detected": 342,
  "by_category": {
    "financial": 123,
    "phishing": 89,
    "fake_goods": 130
  },
  "by_severity": {
    "critical": 45,
    "high": 120,
    "medium": 177
  }
}
```

## Database Schema

### AI Analysis Table
```sql
CREATE TABLE ai_analysis (
  id UUID PRIMARY KEY,
  source_type VARCHAR(50) NOT NULL,
  source_id VARCHAR(255) NOT NULL,
  source_content TEXT,
  
  -- Analysis results
  is_scam BOOLEAN NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  category VARCHAR(50),
  severity VARCHAR(20),
  
  -- NLP results
  sentiment VARCHAR(20),
  indicators TEXT[],
  keywords TEXT[],
  explanation TEXT,
  
  -- Metadata
  provider VARCHAR(50),
  model_version VARCHAR(50),
  processing_time_ms INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_confidence (confidence DESC),
  INDEX idx_category (category),
  INDEX idx_source (source_type, source_id)
);
```

### Spam Phones Table
```sql
CREATE TABLE spam_phones (
  phone VARCHAR(20) PRIMARY KEY,
  normalized_phone VARCHAR(20) NOT NULL,
  spam_score DECIMAL(3,2) DEFAULT 0,
  report_count INTEGER DEFAULT 0,
  call_frequency INTEGER DEFAULT 0,
  last_analysis_id UUID REFERENCES ai_analysis(id),
  is_confirmed_spam BOOLEAN DEFAULT FALSE,
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_analyzed TIMESTAMP
);
```

## Deployment

### MVP Deployment (OpenAI)

1. **Setup OpenAI Account**
   - Create account at platform.openai.com
   - Generate API key
   - Set billing limits

2. **Configure Environment**
   ```bash
   # Add to .env
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-proj-xxxxx
   ```

3. **Deploy Service**
   ```bash
   # Build and deploy
   yarn build
   yarn deploy
   ```

### Future Self-Hosted Deployment

```yaml
# docker-compose.yml
services:
  phobert:
    image: vinai/phobert:latest
    ports: [5000]
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
  
  llama:
    image: ollama/ollama:latest
    ports: [8080]
    volumes:
      - ./models:/models
```

## Monitoring

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Response Time | < 1s | > 2s |
| Accuracy | > 80% | < 70% |
| Cache Hit Rate | > 90% | < 80% |
| API Cost | < $100/mo | > $150/mo |
| Error Rate | < 1% | > 5% |

### Dashboard Queries

```typescript
// Get real-time metrics
const getMetrics = async () => {
  const redis = new Redis();
  
  return {
    avgResponseTime: await redis.get('metrics:avg_response'),
    cacheHitRate: await redis.get('metrics:cache_hit_rate'),
    dailyRequests: await redis.get('metrics:daily_requests'),
    monthlyApiCost: await redis.get('metrics:monthly_cost')
  };
};
```

### Logging

```typescript
// Structured logging for AI operations
logger.info('AI analysis completed', {
  requestId: uuid(),
  provider: 'openai',
  responseTime: 234,
  cacheHit: false,
  result: {
    isScam: true,
    confidence: 0.85
  }
});
```

## Performance Optimization

### Caching Strategy
- Cache all AI responses for 1 hour
- Use Redis with automatic expiration
- Cache key: `ai:analysis:{md5_hash}`

### Batch Processing
- Group requests in 10-item batches
- Process in parallel when possible
- Use queue for async processing

### Cost Optimization
- Rules engine filters 30-40% of requests
- Aggressive caching reduces API calls by 90%
- Estimated cost: < $100/month for 100K analyses

## Security Considerations

### Input Validation
- Max input length: 10,000 characters
- Sanitize HTML/scripts
- Validate content types

### API Security
- Rate limiting: 100 req/hour (public)
- API key rotation every 30 days
- Encrypted storage for sensitive data

### Privacy
- No PII in logs
- Data retention: 30 days
- GDPR compliant processing

## Migration Path

### Phase 1: MVP (Weeks 1-2)
- ✅ OpenAI integration
- ✅ Basic rules engine
- ✅ Caching with Redis
- ✅ API endpoints

### Phase 2: Enhancement (Weeks 3-4)
- Batch processing
- Admin dashboard
- A/B testing
- Performance tuning

### Phase 3: Self-Hosted (Future)
- Deploy PhoBERT
- Setup GPU infrastructure
- Implement provider switching
- Gradual migration

## Troubleshooting

### Common Issues

1. **High Latency**
   - Check Redis connection
   - Verify cache is working
   - Monitor OpenAI API status

2. **Low Accuracy**
   - Review rules engine thresholds
   - Check prompt engineering
   - Analyze false positives/negatives

3. **High Costs**
   - Increase cache TTL
   - Optimize rules engine
   - Batch more requests

## Support

For issues or questions:
- Check logs in `logs/ai-analysis.log`
- Monitor dashboard at `/admin/ai-stats`
- Contact: admin@rate.vn