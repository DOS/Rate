# Database Architecture - Rate-Importer Project

## 🎉 REDIS STREAM INTEGRATION HOÀN THÀNH

**Cập nhật:** 2025-06-08 00:27:00  
**Trạng thái:** Production Ready với Redis Stream Processing

### ✅ Tích Hợp Redis Stream Thành Công

- **Real-time Processing:** Chuyển từ database polling sang Redis streams
- **Consumer Groups:** Fault-tolerant message processing
- **Enhanced Schema:** Thêm stream metadata và monitoring tables
- **Performance:** 217+ messages đã xử lý, 0 pending messages

## Overview

The Rate-Importer project uses a **microservices database architecture** with separate databases for different concerns, following the principle of database-per-service.

## Database Topology

```
┌─────────────────┐    ┌─────────────────┐
│   Strapi CMS    │    │  Validator      │
│   (Frontend)    │    │   Worker        │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          │                      │
          ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│  ratebox DB     │    │  validator DB   │
│  (PostgreSQL)   │    │  (PostgreSQL)   │
│                 │    │                 │
│ • Content Mgmt  │    │ • Raw Data      │
│ • User Mgmt     │    │ • Validation    │
│ • Reviews       │    │ • Error Logs    │
│ • Items         │    │                 │
└─────────────────┘    └─────────────────┘
```

## Database Details

### 1. Strapi Database (`ratebox`)

**Purpose**: Content Management System
**Owner**: `postgres`
**Tables**: 124 tables
**Key Entities**:
- `items` - Product/service items
- `reviews` - User reviews and ratings
- `listings` - Directory listings
- `up_users` - User accounts
- `strapi_*` - Strapi system tables

**Schema Highlights**:
```sql
-- Items table
items (
  id: integer,
  document_id: varchar,
  title: varchar,
  description: jsonb,
  is_active: boolean,
  item_type: varchar,
  ...
)

-- Reviews table  
reviews (
  id: integer,
  title: varchar,
  content: text,
  review_status: varchar,
  up_vote: integer,
  down_vote: integer,
  ...
)
```

### 2. Validator Database (`validator`)

**Purpose**: Data Validation Pipeline
**Owner**: `JOY`
**Tables**: 4 tables
**Key Entities**:
- `raw_items` - Raw data awaiting validation
- `raw_item_errors` - Validation error logs
- `stream_consumer_stats` - Stream consumer statistics
- `stream_processing_metrics` - Stream processing metrics

**Schema**:
```sql
-- Raw items table (Enhanced with Redis Stream metadata)
raw_items (
  id: uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  phone: varchar,
  bank_account: varchar,
  validation_state: varchar DEFAULT 'PENDING',
  created_at: timestamp DEFAULT NOW(),
  -- Redis Stream Integration fields
  stream_id: varchar,
  consumer_group: varchar,
  consumer_name: varchar,
  source: varchar DEFAULT 'manual',
  stream_metadata: jsonb
)

-- Validation errors table
raw_item_errors (
  id: uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  item_id: uuid REFERENCES raw_items(id),
  error_code: integer,
  field: varchar,
  occurred_at: timestamp DEFAULT NOW()
)

-- Stream consumer statistics
stream_consumer_stats (
  id: uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  consumer_group: varchar NOT NULL,
  consumer_name: varchar NOT NULL,
  last_seen: timestamp DEFAULT NOW(),
  messages_processed: integer DEFAULT 0,
  last_message_id: varchar,
  status: varchar DEFAULT 'active'
)

-- Stream processing metrics
stream_processing_metrics (
  id: uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  stream_name: varchar NOT NULL,
  consumer_group: varchar NOT NULL,
  messages_processed: integer DEFAULT 0,
  messages_failed: integer DEFAULT 0,
  processing_time_ms: integer,
  recorded_at: timestamp DEFAULT NOW()
)
```

## Design Decisions

### Why Separate Databases?

1. **Microservices Architecture**
   - Each service owns its data
   - Independent deployment and scaling
   - Clear service boundaries

2. **Performance Isolation**
   - Heavy validation workloads don't impact Strapi
   - Independent query optimization
   - Separate connection pools

3. **Security Isolation**
   - Validator only accesses necessary data
   - Principle of least privilege
   - Reduced attack surface

4. **Technology Flexibility**
   - Can use different DB engines per service
   - Independent schema evolution
   - Service-specific optimizations

5. **Operational Independence**
   - Separate backup/restore strategies
   - Independent monitoring
   - Service-specific maintenance windows

### Data Flow

```
Raw Data → Validator DB → Validation → Error Logs
                ↓
         Validated Data → Strapi DB (via API)
```

## Connection Details

### Strapi Connection
```
Host: localhost:5432
Database: ratebox
User: postgres
Schema: public
```

### Validator Connection
```
Host: localhost:5432
Database: validator
User: JOY
Password: ***REMOVED-SECRET***
Schema: public
```

## Future Architecture

As the system scales, the architecture will evolve to:

```
Strapi DB ← API ← Change Data Capture ← Kafka ← Splink ← Validator DB
```

This separation now prepares for this future microservices evolution.

## Performance Metrics

### Current Scale
- **Validator DB**: 9,058 items processed successfully
- **Processing Rate**: ~500 items/batch
- **Error Rate**: 100% (expected with synthetic data)
- **Validation Rules**: 4 error codes implemented

### Monitoring Queries

```sql
-- Check validation progress
SELECT validation_state, COUNT(*) 
FROM raw_items 
GROUP BY validation_state;

-- Check error distribution
SELECT error_code, field, COUNT(*) 
FROM raw_item_errors 
GROUP BY error_code, field;
```

## Maintenance

### Backup Strategy
- **Strapi DB**: Daily full backup + WAL archiving
- **Validator DB**: Hourly incremental + daily full

### Schema Migrations
- **Strapi**: Managed by Strapi migration system
- **Validator**: Custom migration scripts in `migrations.sql`

## Security

### Access Control
- **Strapi DB**: Multiple users with role-based access
- **Validator DB**: Single service user `JOY` with minimal permissions

### Network Security
- Both databases behind firewall
- Application-level authentication
- Encrypted connections in production
