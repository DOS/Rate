# MVP Validator Service

## Purpose
Async Python worker service that validates raw data items from PostgreSQL database and logs validation errors.

## Structure
- `worker.py` - Main async validation worker
- `generate_test_data.py` - Generate synthetic test data
- `migrations.sql` - Database schema with UUID v7 support
- `requirements.txt` - Python dependencies (redis, psycopg)
- `Dockerfile` - Container configuration

## Quick Start

### Local Development
```bash
# Install dependencies
pip install -r requirements.txt
# Run worker
python worker.py
```

### Docker Deployment
```bash
# Build image
docker build -t validator-worker .
# Run container
docker run -e POSTGRES_DSN="postgresql://JOY:***REMOVED-SECRET***@host.docker.internal:5432/validator" validator-worker
```

## Environment Variables
- `POSTGRES_DSN` - PostgreSQL connection string (default: `postgresql://JOY:***REMOVED-SECRET***@localhost:5432/validator`)
- `REDIS_URL` - Redis connection string (default: `redis://localhost:6379/0`)
- `REDIS_STREAM` - Redis stream name (default: `validation_requests`)
- `BATCH_SIZE` - Processing batch size (default: 10)
- `CONSUMER_GROUP` - Redis consumer group (default: `validator_workers`)
- `CONSUMER_NAME` - Redis consumer name (default: `worker_1`)
- `MAX_RETRIES` - Maximum retry attempts (default: 3)
- `LOG_LEVEL` - Logging level (default: `INFO`)

## Database Configuration
The service requires PostgreSQL database named `validator` with the following schema:
- `raw_items` table with UUID primary key and JSONB data column
- `raw_item_errors` table for validation error logging
- User `JOY` with appropriate permissions

### Database Setup
```sql
-- Create database and user
CREATE DATABASE validator WITH OWNER=JOY;
CREATE ROLE JOY WITH LOGIN PASSWORD 'your_password' SUPERUSER CREATEDB;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Validation Rules
- **Error Code 100**: Missing phone number
- **Error Code 101**: Invalid phone number (< 10 chars)
- **Error Code 200**: Missing bank account
- **Error Code 201**: Invalid bank account (< 8 chars)

## Test Results 
- **Total Items Processed**: 9,058
- **Validation State**: All ERROR (as expected with synthetic data)
- **Error Breakdown**:
  - Error 100 (Missing Phone): 9,058 items
  - Error 200 (Missing Bank Account): 9,058 items
- **Performance**: ~500 items/batch, completed in seconds

## Health Check
```bash
# Check pending items
docker exec DB psql -U JOY -d validator -c "SELECT validation_state, COUNT(*) FROM raw_items GROUP BY validation_state;"
# Check error details
docker exec DB psql -U JOY -d validator -c "SELECT error_code, field, COUNT(*) FROM raw_item_errors GROUP BY error_code, field;"
```

## MVP Deployment Checklist 
- [x] PostgreSQL database `validator` created
- [x] User `JOY` with proper permissions
- [x] UUID v7 extension installed and working
- [x] Database schema migrated successfully
- [x] 10,000 synthetic test records generated
- [x] Python async worker implemented and tested
- [x] Redis client compatibility resolved (redis-py)
- [x] Windows async compatibility fixed
- [x] All 9,058 items processed successfully
- [x] Validation errors logged correctly
- [x] Performance verified (batch processing)
