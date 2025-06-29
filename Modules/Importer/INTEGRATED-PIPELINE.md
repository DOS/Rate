# Integrated Crawl → Validate → Import Pipeline

## 🎯 Overview

This pipeline integrates CheckScam crawler with TypeScript validator and Strapi import to ensure high-quality data.

## 🔄 Workflow

```
1. Crawl Data (CheckScam)
   ↓
2. Validate with TypeScript Validator
   - Schema validation
   - Business rules (Vietnamese)
   - Data enrichment
   ↓
3. Import to Strapi
   - Via Importer API
   - Redis Stream queue
   - Store validated data
```

## 🚀 Quick Start

### Prerequisites

1. **Strapi API Token**

   ```bash
   # Generate in Strapi admin panel
   export STRAPI_API_TOKEN=your_token_here
   ```

2. **TypeScript Validator Package**
   ```bash
   # Already installed as dependency
   @ratebox/core-validator
   ```

### Test with Sample Data

```bash
# Run test pipeline
node Scripts/test-integrated-pipeline.js
```

### Run with Real Data

```bash
# 1. Crawl CheckScam data
node Scripts/CheckScamCrawlerV2.js

# 2. Process crawled data with validation
node Scripts/crawl-validate-import.js Results/checkscam_crawl_*.json
```

## 📊 Validation Features

The TypeScript validator adds:

- **Phone Validation**: Vietnamese format, carrier detection
- **Bank Validation**: 30+ Vietnamese banks mapping
- **Risk Score**: 0-100 based on amount, content, evidence
- **Quality Score**: Data completeness and reliability
- **Location Enrichment**: Province code, region mapping
- **Content Categorization**: Investment, gaming, romance scams, etc.
- **Trust Indicators**: Multiple validation signals

## 🔧 Configuration

### Environment Variables

```bash
# Required
STRAPI_API_TOKEN=your_token_here

# Optional
STRAPI_URL=http://localhost:1337  # Default
BATCH_SIZE=100                     # Default
VALIDATE=true                      # Default
```

### Sample Validated Output

```json
{
  "url": "https://checkscam.vn/profile/0903123456",
  "title": "Nguyễn Văn A",
  "description": "Lừa đảo đầu tư forex...",
  "source_id": "cs_0903123456",
  "metadata": {
    "phone_normalized": "0903123456",
    "phone_carrier": "MobiFone",
    "bank_normalized": "Vietcombank",
    "bank_code": "VCB",
    "risk_score": 75,
    "quality_score": 85,
    "completeness_score": 90,
    "content_category": "Đầu tư",
    "province_code": "HN",
    "region": "Miền Bắc",
    "trust_indicators": {
      "has_phone": true,
      "has_bank": true,
      "has_evidence": true,
      "verified_phone": true,
      "verified_bank": true,
      "high_completeness": true
    }
  }
}
```

## 📈 Pipeline Statistics

After processing, you'll see:

```
📊 Pipeline Summary:
   Total items: 100
   ✅ Validated: 85
   ❌ Invalid: 15
   📤 Imported: 85
   Results saved: validated_import_2025-01-01T10-00-00.json
```

## 🐛 Troubleshooting

### Common Issues

1. **STRAPI_API_TOKEN not set**
   - Generate token in Strapi admin panel
   - Set in environment or .env file

2. **Validation failures**
   - Check phone format (Vietnamese)
   - Verify bank names
   - Ensure minimum content length

3. **Import errors**
   - Verify Strapi is running
   - Check API token permissions
   - Review Redis connection

### Debug Mode

```bash
# Enable detailed logging
DEBUG=* node Scripts/crawl-validate-import.js data.json
```

## 🔗 Related Documentation

- [TypeScript Validator README](../Packages/Validator/README.md)
- [Strapi Importer API](../../apps/strapi/src/api/importer/README.md)
- [CheckScam Crawler](./Scripts/CheckScamCrawlerV2.js)

## 📊 Data Quality Metrics

The integrated pipeline ensures:

- **Schema Compliance**: 100% valid structure
- **Business Rules**: Vietnamese-specific validation
- **Data Enrichment**: +15 additional fields
- **Deduplication**: Automatic duplicate detection
- **Quality Scoring**: Objective data quality metrics

## 🚦 Next Steps

1. **Monitor imports** in Strapi admin panel
2. **Check validation reports** in Results folder
3. **Analyze quality metrics** for improvements
4. **Scale up** with larger datasets
