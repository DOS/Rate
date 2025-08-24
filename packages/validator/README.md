# @ratebox/core-validator

Advanced TypeScript validator for scam report validation with Vietnamese-specific business rules.

## Features

### Schema Validation (Zod)

- Multi-source support: checkscam, extension, manual, import
- Flexible field validation with TypeScript types
- Source-specific schemas with inheritance

### Business Validation

- **Vietnamese Phone**: Normalize và detect carriers (Viettel, MobiFone, Vinaphone, etc.)
- **Vietnamese Banks**: Normalize và validate 30+ banks với code mapping
- **Amount Validation**: Min/max limits và suspicious threshold detection
- **Content Analysis**: Keyword detection và auto-categorization

### Data Enrichment

- **Risk Scoring**: Calculate risk based on amount, content, evidence
- **Quality Scoring**: Measure data completeness và reliability
- **Location Enrichment**: Province/region mapping với fuzzy search
- **Trust Indicators**: Multi-factor trust assessment
- **Unique ID Generation**: Source-prefixed IDs

## Installation

```bash
yarn add @ratebox/core-validator
```

## Usage

```typescript
import { validateScamReport } from "@ratebox/core-validator"

// Basic validation
const result = await validateScamReport({
  phone: "0903123456",
  name: "Nguyễn Văn A",
  bank: "Vietcombank",
  amount: 5000000,
  content: "Lừa đảo đầu tư forex",
})

// With options
const result = await validateScamReport(data, {
  source: "checkscam",
  stopOnError: true,
  enrichData: true,
  checkDuplicates: false,
})
```

## API

### validateScamReport(data, config?)

Main validation function that runs all validators in sequence.

**Parameters:**

- `data`: Report data object
- `config`: Optional configuration
  - `source`: Data source type
  - `stopOnError`: Stop validation on first error
  - `enrichData`: Enable/disable data enrichment
  - `checkDuplicates`: Enable duplicate checking

**Returns:** `ValidationResult`

```typescript
{
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  data: EnrichedData;
}
```

## Validators

### SchemaValidator

- Validates data structure using Zod schemas
- Source-specific validation rules
- Type-safe validation

### BusinessValidator

- Vietnamese phone normalization và carrier detection
- Bank name normalization với code mapping
- Amount validation với suspicious threshold
- Content keyword analysis và categorization

### EnrichmentValidator

- Risk score calculation (0-100)
- Quality score based on completeness
- Location enrichment với province mapping
- Trust indicators generation
- Unique ID generation

## Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run tests
yarn test

# Clean build
yarn clean
```

## File Structure (PascalCase)

```
src/
├── Index.ts              # Main export và validation function
├── Index.test.ts         # Test suite
├── ScamReportSchema.ts   # Zod schemas
├── validators/
│   ├── SchemaValidator.ts
│   ├── BusinessValidator.ts
│   └── EnrichmentValidator.ts
└── utils/
    ├── Phone.ts          # Vietnamese phone utilities
    └── Bank.ts           # Vietnamese bank utilities
```

## 📋 Schema Support

### Base Schema

All sources share these common fields:

- `phone`, `name`, `bank`, `bank_account`, `amount`
- `content`, `email`, `facebook`, `website`
- `province`, `district`, `category`
- `evidence_images`, `reported_date`

### Source-specific Schemas

**CheckScam**

```typescript
{
  source: 'checkscam',
  checkscam_id: string,
  checkscam_url: string,
  views?: number,
  comments_count?: number
}
```

**Extension**

```typescript
{
  source: 'extension',
  user_agent: string,
  page_url: string,
  detected_at: string
}
```

**Manual**

```typescript
{
  source: 'manual',
  reporter_name: string,
  reporter_phone?: string,
  reporter_email?: string
}
```

## 🎯 Validation Pipeline

1. **Schema Validation** - Validates data structure
2. **Business Rules** - Vietnamese-specific validation
3. **Data Enrichment** - Adds metadata and scores

### Enriched Fields

```typescript
{
  // Normalized data
  phone_normalized: string,    // 0903123456
  phone_carrier: string,       // Viettel, Vinaphone, etc.
  bank_normalized: string,     // Vietcombank
  bank_code: string,          // VCB

  // Location
  province_code: string,      // HN, HCM, DN
  region: string,            // Miền Bắc, Miền Nam, Miền Trung

  // Scores
  risk_score: number,        // 0-100 (higher = more risk)
  quality_score: number,     // 0-100 (higher = better quality)
  completeness_score: number,// 0-100 (% fields filled)

  // Trust indicators
  trust_indicators: {
    has_phone: boolean,
    has_bank: boolean,
    has_evidence: boolean,
    has_multiple_identifiers: boolean,
    has_detailed_content: boolean,
    verified_phone: boolean,
    verified_bank: boolean,
    high_completeness: boolean
  },

  // Category
  content_category: string,  // Đầu tư, Game, Vay tiền, etc.

  // System
  id: string,               // Unique identifier
  createdAt: string,        // ISO datetime
  updatedAt: string         // ISO datetime
}
```

## 🏦 Supported Banks

Full support for all major Vietnamese banks:

- Vietcombank (VCB), Techcombank (TCB), BIDV
- Vietinbank (CTG), MB Bank, Sacombank (STB)
- ACB, TPBank, VPBank, Agribank
- And 20+ other banks

## 📱 Phone Validation

Supports all Vietnamese carriers:

- **Viettel**: 032-039, 070, 076-079, 086, 096-098
- **Vinaphone**: 081-085, 088, 091, 094
- **MobiFone**: 089, 090, 093
- **Vietnamobile**: 056, 058, 092
- **Gmobile**: 059, 099

## 🔍 Content Categories

Automatic categorization based on keywords:

- **Đầu tư**: Investment, forex, crypto
- **Game**: Game accounts, top-up
- **Vay tiền**: Loans, credit
- **Bán hàng**: E-commerce, shopping
- **Tình cảm**: Romance scams
- **Việc làm**: Job scams
- **Cờ bạc**: Gambling, lottery

## 📊 Risk Score Calculation

Risk score (0-100) based on:

- Amount size (higher amount = higher risk)
- Content category (investment/gambling = higher risk)
- Evidence availability (evidence = lower risk)
- Number of identifiers (more = lower risk)

## 🛠️ Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Run tests
yarn test

# Type checking
yarn tsc --noEmit
```

## 📝 License

MIT
