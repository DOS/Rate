# Deployment Guide

## Prerequisites

### System Requirements

- **OS**: Windows 11 (PowerShell 7+)
- **Node.js**: v22
- **Docker**: v20+ with Docker Compose v2+
- **Memory**: 4GB+ RAM
- **Storage**: 10GB+ free space

### Dependencies

```powershell
npm install
docker compose version
```

## Local Development

### 1. Setup Environment

```bash
# Copy environment template
copy .env.example .env

# Edit configuration
notepad .env
```

### 2. Start Services

```bash
# Start FlareSolverr (required for Cloudflare bypass)
docker compose up -d

# Verify service health
docker compose ps
docker compose logs flaresolverr
```

### 3. Test Crawler

```bash
# Test link extraction
node crawl.js links

# Test data crawling
node crawl.js crawl --max 1

# View results
dir Results\
```

## Production Deployment

### Docker Compose (Recommended)

```yaml
# docker-compose.prod.yml
version: "3.9"
services:
  flaresolverr:
    image: flaresolverr/flaresolverr:latest
    container_name: flaresolverr-prod
    environment:
      - LOG_LEVEL=info
      - LOG_HTML=false
      - CAPTCHA_SOLVER=none
    ports:
      - "8191:8191"
    restart: unless-stopped
    networks:
      - Rate-Importer

  rate-importer:
    build: .
    container_name: rate-importer-prod
    environment:
      - NODE_ENV=production
      - FLARESOLVERR_URL=http://flaresolverr:8191/v1
    volumes:
      - ./Results:/app/Results
      - ./Logs:/app/Logs
    depends_on:
      - flaresolverr
    restart: unless-stopped
    networks:
      - Rate-Importer

networks:
  Rate-Importer:
    driver: bridge
```

### Environment Configuration

```bash
# Production .env
NODE_ENV=production
FLARESOLVERR_URL=http://flaresolverr:8191/v1
FLARESOLVERR_TIMEOUT=120000
CRAWLER_DELAY_MS=10000
CRAWLER_MAX_RETRIES=5
LOG_LEVEL=info
```

## Monitoring

### Health Checks

```bash
# Check FlareSolverr health
curl http://localhost:8191/v1

# Check crawler status
node crawl.js links --dry-run

# Monitor logs
docker compose logs -f flaresolverr
```

### Performance Monitoring

```bash
# Resource usage
docker stats

# Disk usage
du -sh Results/
du -sh Logs/

# Success rates
grep "Success:" Logs/crawler.log | wc -l
grep "Failed:" Logs/crawler.log | wc -l
```

## Scaling

### Horizontal Scaling

```yaml
# Multiple crawler instances
services:
  rate-importer-1:
    # ... config
  rate-importer-2:
    # ... config
  rate-importer-3:
    # ... config
```

### Load Balancing

```yaml
# Nginx load balancer
nginx:
  image: nginx:alpine
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf
  ports:
    - "80:80"
  depends_on:
    - rate-importer-1
    - rate-importer-2
```

## Backup & Recovery

### Data Backup

```bash
# Backup results
tar -czf backup-$(date +%Y%m%d).tar.gz Results/

# Backup configuration
copy .env .env.backup
copy docker-compose.yml docker-compose.yml.backup
```

### Recovery Procedures

```bash
# Restore from backup
tar -xzf backup-20250605.tar.gz

# Restart services
docker compose down
docker compose up -d
```

## Security

### Network Security

```yaml
# Restrict external access
services:
  flaresolverr:
    ports:
      - "127.0.0.1:8191:8191" # Localhost only
```

### Data Security

```bash
# Encrypt sensitive data
gpg --cipher-algo AES256 --compress-algo 1 --symmetric Results/sensitive-data.json

# Secure file permissions
chmod 600 .env
chmod 700 Results/
```

## Troubleshooting

### Common Issues

#### FlareSolverr Not Starting

```bash
# Check port conflicts
netstat -an | findstr 8191

# Remove old containers
docker rm -f flaresolverr
docker compose up -d
```

#### Network Connectivity

```bash
# Test FlareSolverr connectivity
curl -X POST http://localhost:8191/v1 -H "Content-Type: application/json" -d '{"cmd":"request.get","url":"https://checkscam.vn"}'

# Check network configuration
docker network ls
docker network inspect Rate-Importer_Rate-Importer
```

#### Performance Issues

```bash
# Increase timeouts
set FLARESOLVERR_TIMEOUT=180000
set CRAWLER_DELAY_MS=15000

# Monitor resource usage
docker stats --no-stream
```

### Logs Analysis

```bash
# View recent errors
docker compose logs --tail 50 flaresolverr | findstr ERROR

# Crawler performance
node -e "console.log(JSON.stringify(require('./Modules/Rate-Extension/latest.json'), null, 2))"
```

## Maintenance

### Regular Tasks

```bash
# Weekly cleanup
node crawl.js cleanup

# Log rotation
forfiles /p Logs /m *.log /d -7 /c "cmd /c del @path"

# Update dependencies
npm update
docker compose pull
```

### Updates

```bash
# Update Rate-Importer
git pull origin main
npm install
docker compose build --no-cache

# Update FlareSolverr
docker compose pull flaresolverr
docker compose up -d
```
