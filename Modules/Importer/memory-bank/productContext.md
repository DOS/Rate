# Product Context - Rate Importer

## Overview
Rate Importer is a modular data import and validation system designed to process and validate rate data from various sources before storing in PostgreSQL database.

## Project Components
- **Splink Integration** (paused): Deduplication service using Splink library
- **Validation Backend**: Data validation service (considering Strapi)
- **PostgreSQL Database**: Primary data storage with pgvector extension
- **Docker Environment**: Containerized microservices architecture

## Architecture
- Monorepo structure under JOY/Rate
- Microservices communicate via Docker network "Gateway"
- Each module is independently deployable
- Environment variables managed via .env files

### [2025-06-07] - Validator MVP Architecture & Plan

**MVP Stack:**
- Strapi 5.15 (Node 22) → Redis 7.2 stream → Python worker 3.12 (validate đơn giản) → PostgreSQL 17.4 (uuid_v7, bảng raw_item_errors).

**Flow:**
1. Strapi afterCreate hook → XADD vào Redis stream `raw_items` (maxlen ~1M).
2. Python worker đọc batch 500 từ Redis, validate, ghi verdict/error_code vào Postgres.
3. Postgres lưu bảng raw_items (uuid_v7 PK) & raw_item_errors (partition theo occurred_at).

**Validation logic MVP:**
- Check trùng phone/bank_account bằng unique index tạm thời.
- Thiếu trường bắt buộc: error_code=100.
- validation_state = 'DONE'.

**Gate chuyển phase:**
- Khi queue backlog > 5 phút hoặc tổng bản ghi > 3 triệu, chuyển sang CDC/Kafka/Splink/partition.

**Monitoring:**
- Prometheus, Grafana, alert p95, queue length, memory.

**Kế hoạch 2 tuần:**
- Ngày 1: pnpm lock, nâng Strapi, build lại.
- Ngày 2: Bật pg_uuidv7, tách bảng lỗi.
- Ngày 3: Viết worker.py (aioredis + psycopg3), Dockerfile healthcheck.
- Ngày 4–5: Sinh 1M dữ liệu, benchmark throughput & latency.
- Tuần 2: Monitoring, alert, go/no-go gate.

## Technology Stack
- **Backend**: Python (for ML/processing), Node.js (for APIs)
- **Database**: PostgreSQL with pgvector
- **Containerization**: Docker & Docker Compose
- **Potential Backend**: Strapi CMS for validation UI

## Standards
- Docker-first development
- Environment-based configuration
- Modular architecture
- Git version control

---
[2025-06-07 16:04:00] - Initial product context created
