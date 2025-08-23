# System Patterns - Rate Importer

## Architecture Patterns

### Microservices Pattern
- Each validation component as independent service
- Docker containers for isolation
- Shared PostgreSQL database
- Communication via Docker network "Gateway"

### Environment Configuration Pattern
- All configs via environment variables
- .env files for local development
- Docker Compose environment sections
- No hardcoded credentials

### Monorepo Structure
```
Rate/
├── Modules/
│   └── Importer/
│       ├── memory-bank/
│       ├── .windsurf/rules/
│       ├── Splink/
│       ├── Validation/
│       └── docker-compose.yml
```

## Coding Standards

### Python Services
- FastAPI for REST APIs
- Type hints for all functions
- Pydantic for data validation
- Async/await for I/O operations

### Docker Best Practices
- Multi-stage builds when needed
- Minimal base images (alpine/slim)
- Non-root user execution
- Health checks for all services

### Error Handling
- Structured logging with context
- Graceful degradation
- Retry logic for external services
- Clear error messages

## Testing Patterns

### Unit Testing
- Pytest for Python services
- Mock external dependencies
- Test data fixtures

### Integration Testing
- Docker Compose test environment
- Database migrations in tests
- API contract testing

## Deployment Patterns

### Container Orchestration
- Docker Compose for local/dev
- Environment-specific compose files
- Volume mounts for development
- Named volumes for data persistence

### Database Patterns
- Connection pooling
- Prepared statements
- Transaction management
- Backup before migrations

---
[2025-06-07 16:04:00] - Initial system patterns documented
