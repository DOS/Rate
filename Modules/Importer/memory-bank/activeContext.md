# Active Context - Rate Importer

## Current Focus
- Triển khai MVP Validator Service (Strapi → Redis → Python Worker → PostgreSQL)
- Benchmark throughput, latency, và monitoring
- Chuẩn bị checklist triển khai 2 tuần

## Recent Changes
- Paused Splink PostgreSQL integration due to compatibility issues
- Updated global Windsurf rules for automation preferences
- Created memory-bank structure for Rate-Importer

## Current Objectives
1. Implement validation backend service
2. Setup .windsurf/rules/ with project-specific workflows
3. Configure Strapi or alternative backend for data validation
4. Create comprehensive project documentation

## Open Questions/Issues
- **Splink Compatibility**: Splink 3.9.x has broken PostgreSQL backend support on PyPI
- **Backend Choice**: Strapi vs custom backend for validation service
- **Validation Rules**: Need to define specific validation criteria for rate data

## Session Notes
- User prefers proactive automation with minimal interruptions
- Splink folder kept for future updates when PostgreSQL support improves
- Docker environment already configured with Gateway network

---
[2025-06-07 16:04:00] - Active context initialized
