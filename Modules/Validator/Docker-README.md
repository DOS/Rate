# Redis Stream Validator - Docker Deployment Guide

## 🐳 Overview

Complete Docker containerization for Redis Stream Validator Worker with production-ready configuration, monitoring, and deployment automation.

## 📦 Container Stack

```text
┌─ Redis Stream Validator Stack ─┐
│                                 │
│  ┌─ Redis Server ─┐             │
│  │ Port: 6379     │             │
│  │ Persistence    │             │
│  └────────────────┘             │
│                                 │
│  ┌─ PostgreSQL DB ─┐            │
│  │ Port: 5432      │            │
│  │ Auto Migration  │            │
│  └─────────────────┘            │
│                                 │
│  ┌─ Validator Worker ─┐         │
│  │ Redis Streams      │         │
│  │ Real-time Process  │         │
│  └────────────────────┘         │
│                                 │
│  ┌─ Optional Services ─┐        │
│  │ Stream Producer     │        │
│  │ Stream Monitor      │        │
│  └─────────────────────┘        │
└─────────────────────────────────┘
```

## 🚀 Quick Start

### 1. Prerequisites

- Docker Desktop installed and running
- PowerShell (Windows) or Bash (Linux/Mac)
- At least 2GB RAM available

### 2. Configuration

```powershell
# Copy environment template
Copy-Item .env.example .env

# Edit .env file with your settings
notepad .env
```

### 3. Deploy Stack

```powershell
# Start the complete stack
.\docker-deploy.ps1 start

# Or start with fresh build
.\docker-deploy.ps1 start -Build
```

### 4. Verify Deployment

```powershell
# Check service status
.\docker-deploy.ps1 status

# View logs
.\docker-deploy.ps1 logs
```

## 📋 Management Commands

### Basic Operations

```powershell
# Start services
.\docker-deploy.ps1 start

# Stop services  
.\docker-deploy.ps1 stop

# Restart services
.\docker-deploy.ps1 restart

# View service status
.\docker-deploy.ps1 status

# View logs (follow mode)
.\docker-deploy.ps1 logs
```

### Testing & Monitoring

```powershell
# Start test producer
.\docker-deploy.ps1 test

# Start stream monitor
.\docker-deploy.ps1 monitor

# Clean up everything
.\docker-deploy.ps1 clean
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `password` | PostgreSQL password |
| `POSTGRES_DB` | `validator` | PostgreSQL database name |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `REDIS_STREAM` | `validation_requests` | Stream name |
| `CONSUMER_GROUP` | `validator_workers` | Consumer group |
| `CONSUMER_NAME` | `worker_1` | Consumer identifier |
| `BATCH_SIZE` | `10` | Processing batch size |
| `BLOCK_TIME` | `1000` | Stream blocking time (ms) |
| `MAX_RETRIES` | `3` | Maximum retry attempts |
| `LOG_LEVEL` | `INFO` | Logging level |

### Database Configuration

The service requires PostgreSQL database named `validator`:

```bash
# Database connection string format:
POSTGRES_DSN=postgresql://JOY:password@DB:5432/validator

# For external database:
POSTGRES_DSN=postgresql://username:password@host:port/validator
```

### Docker Compose Profiles

```yaml
# Default: Core services only
docker-compose up -d

# Testing: Include test producer
docker-compose --profile testing up -d

# Monitoring: Include stream monitor  
docker-compose --profile monitoring up -d

# All services
docker-compose --profile testing --profile monitoring up -d
```

## 📊 Monitoring & Health Checks

### Service Health

All services include health checks:

- **Redis**: `redis-cli ping`
- **PostgreSQL**: `pg_isready`
- **Validator Worker**: Python import test

### Resource Limits

```yaml
validator-worker:
  deploy:
    resources:
      limits:
        memory: 256M
        cpus: '0.5'
```

### Monitoring Dashboard

```powershell
# Start monitor service
.\docker-deploy.ps1 monitor

# View monitor logs
docker-compose logs -f stream-monitor
```

## 🔍 Troubleshooting

### Common Issues

1. **Services won't start**
   ```powershell
   # Check Docker status
   docker ps -a
   
   # View specific service logs
   docker-compose logs redis
   docker-compose logs postgres
   docker-compose logs validator-worker
   ```

2. **Database connection issues**
   ```powershell
   # Check PostgreSQL health
   docker-compose exec postgres pg_isready -U JOY -d validator
   
   # View database logs
   docker-compose logs postgres
   ```

3. **Redis connection issues**
   ```powershell
   # Test Redis connection
   docker-compose exec redis redis-cli ping
   
   # View Redis logs
   docker-compose logs redis
   ```

### Debug Mode

```powershell
# Run with debug logging
$env:LOG_LEVEL="DEBUG"
.\docker-deploy.ps1 restart
```

## 🚀 Production Deployment

### Security Considerations

1. **Change default passwords**
   ```bash
   # Generate secure password
   POSTGRES_PASSWORD=$(openssl rand -base64 32)
   ```

2. **Network security**
   - Use custom Docker networks
   - Restrict port exposure
   - Enable TLS for Redis/PostgreSQL

3. **Resource monitoring**
   - Set up container monitoring
   - Configure log aggregation
   - Set up alerting

### Scaling

```yaml
# Scale validator workers
docker-compose up -d --scale validator-worker=3
```

### Backup Strategy

```powershell
# Database backup
docker-compose exec postgres pg_dump -U JOY validator > backup.sql

# Redis backup
docker-compose exec redis redis-cli BGSAVE
```

## 📈 Performance Tuning

### Redis Configuration

```yaml
redis:
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### PostgreSQL Configuration

```yaml
postgres:
  environment:
    POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=C"
```

### Worker Configuration

```yaml
validator-worker:
  environment:
    BATCH_SIZE: 20        # Increase for higher throughput
    BLOCK_TIME: 500       # Decrease for lower latency
    MAX_RETRIES: 5        # Increase for better reliability
```

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Redis Streams Guide](https://redis.io/topics/streams-intro)
- [PostgreSQL Docker Hub](https://hub.docker.com/_/postgres)
- [Production Deployment Best Practices](../Docs/Production-Deployment.md)
