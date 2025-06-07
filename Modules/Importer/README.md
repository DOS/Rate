# 🚀 Rate-Importer - CheckScam Crawler

**Consolidated CheckScam.vn crawler with FlareSolverr integration for bypassing Cloudflare protection.**

## ✨ Features

- 🔥 **FlareSolverr Integration**: Bypass Cloudflare protection automatically
- 🎯 **Two-Stage Crawling**: Extract links first, then crawl detailed data
- 📊 **Data Validation**: Quality scoring and validation for extracted data
- 🗂️ **Organized Output**: Timestamped JSON files in Results directory
- 🎮 **CLI Interface**: Simple commands via `crawl.js` runner
- ⚡ **Rate Limiting**: Configurable delays to avoid detection
- 🛡️ **Error Handling**: Robust error handling and retry mechanisms

---

## 🧩 Splink Deduplication Microservice (`/Splink`)

A dedicated microservice for duplicate content detection using [Splink](https://moj-analytical-services.github.io/splink/) and PostgreSQL, shared across all modules (Rate-Importer, Rate-Extension, etc.).

**Location:** `D:/Projects/JOY/Rate-Importer/Splink/`

- **Runs as a standalone Docker service** (connects to your main PostgreSQL container)
- **REST API** for deduplication: `/resolve`
- **Designed for easy integration and future expansion** (add more microservices to `/Splink`)

### Example API Usage
```http
POST http://localhost:8090/resolve
Content-Type: application/json
{
  "id": 123,
  "title": "Scam Example",
  "phone": "0912345678",
  "bank_account": "123456789",
  "name": "Nguyen Van A"
}
```
**Response:**
```json
{"cluster_id": 1}
```

**To start the service:**
```bash
cd Splink
# Build and run Splink dedup microservice
# (Ensure your main PostgreSQL container is running on port 5432)
docker compose up -d --build
```

> **Note:** All future shared microservices should be placed in `/Splink` for consistency and easy maintenance.

---

## 🔧 Prerequisites

### 1. FlareSolverr (Required)

**Option A: Using Docker Compose (Recommended)**
```bash
# Start FlareSolverr service
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs flaresolverr

# Stop service
docker compose down
```

**Option B: Using Docker Run**
```bash
# Using Docker (Alternative)
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest
```

**Verify FlareSolverr is running:**
```bash
# Test endpoint
curl http://localhost:8191/v1

# Or check in browser
# http://localhost:8191/v1
```

### 2. Node.js Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
# Copy and configure environment variables
cp .env.example .env

# Edit .env file with your settings
# FLARESOLVERR_URL=http://localhost:8191/v1
```

## 🚀 Usage

### Quick Start (Recommended)
```bash
# Get scammer links
node crawl.js links

# Crawl detailed data  
node crawl.js crawl

# Clean up project
node crawl.js cleanup
```

### Direct Script Usage
```bash
# Step 1: Get Scammer Links
node Scripts/crawl-with-flaresolverr.js

# Step 2: Crawl Detailed Data
node Scripts/crawl-main.js
```

### Advanced Usage
```bash
# Crawl specific number of scammers
node Scripts/CheckScamCrawlerV2.js --file ../Results/scam_links_latest.json --max 20
```

## 📁 File Structure

```
Rate-Importer/
├── crawl.js                      # Main command runner
├── Scripts/                      # All crawler scripts
│   ├── crawl-main.js            # Main crawler script
│   ├── crawl-with-flaresolverr.js # Initial link extraction
│   ├── CheckScamCrawlerV2.js    # Core crawler class
│   └── cleanup.js               # Project cleanup
├── Results/                      # Output directory
│   ├── scam_links_*.json       # Extracted scammer links
│   └── checkscam_crawl_*.json  # Detailed scammer data
├── .env.example                 # Environment configuration template
└── package.json
```

## 📊 Output Format

### Scammer Links (`scam_links_*.json`)
```json
{
  "timestamp": "2025-06-05T16:45:30.123Z",
  "source": "https://checkscam.vn/category/danh-sach-scam/",
  "total_links": 18,
  "links": [
    {
      "name": "NGUYEN TIEN CONG",
      "url": "https://checkscam.vn/nguyen-tien-cong-3/"
    }
  ]
}
```

### Detailed Scammer Data (`checkscam_crawl_*.json`)
```json
{
  "timestamp": "2025-06-05T16:50:36.137Z",
  "total_processed": 18,
  "successful": 17,
  "failed": 1,
  "scammers": [
    {
      "name": "NGUYEN TIEN CONG",
      "phone": "N/A",
      "bank": "MB Bank 278962",
      "scam_amount": "N/A",
      "content": "...",
      "url": "https://checkscam.vn/nguyen-tien-cong-3/",
      "quality_score": 100
    }
  ],
  "summary": {
    "high_quality": 4,
    "medium_quality": 5,
    "low_quality": 8
  }
}
```

## 📚 Documentation

> **📍 All documentation has moved to the dedicated RateBox-Docs repository**
> 
> **Location**: `D:\Projects\JOY\RateBox-Docs\`  
> **GitHub**: https://github.com/RateBox/Docs

### 📖 Rate-Importer Documentation

All module-specific documentation is now located in the centralized docs repository:

- **[📋 Module Overview](../RateBox-Docs/modules/rate-importer/README.md)** - Complete crawler documentation
- **[📡 API Reference](../RateBox-Docs/modules/rate-importer/api.md)** - CLI commands and data schemas  
- **[🏛️ Architecture](../RateBox-Docs/modules/rate-importer/architecture.md)** - Technical implementation details
- **[🚀 Deployment](../RateBox-Docs/modules/rate-importer/deployment.md)** - Setup and deployment guide
- **[🗺️ Roadmap](../RateBox-Docs/modules/rate-importer/roadmap.md)** - Development phases and milestones

### 🏗️ Platform Documentation

- **[🎯 Platform Overview](../RateBox-Docs/platform/overview.md)** - Complete RateBox system architecture
- **[📋 MVP Architecture](../RateBox-Docs/platform/mvp-architecture.md)** - 6-8 week development plan
- **[🔗 Integration Guide](../RateBox-Docs/platform/integration-guide.md)** - Module integration patterns

### 🚀 Quick Access

```powershell
# Navigate to documentation
cd D:\Projects\JOY\RateBox-Docs

# View crawler docs
cat modules/rate-importer/README.md

# View platform overview  
cat platform/overview.md

# Development setup
cat guides/development-setup.md
```

**Migration Details**: See [DOCS-MOVED.md](./DOCS-MOVED.md) for complete migration information.

## ⚙️ Configuration

### Environment Variables (.env)
```bash
# FlareSolverr Configuration (Required)
FLARESOLVERR_URL=http://localhost:8191/v1
FLARESOLVERR_TIMEOUT=60000

# CheckScam Crawler Configuration  
CHECKSCAM_BASE_URL=https://checkscam.vn
CRAWLER_DELAY_MS=5000       # Delay between requests
CRAWLER_MAX_RETRIES=3       # Max retry attempts
CRAWLER_TIMEOUT_MS=60000    # Request timeout
```

### Script Parameters
```bash
# CheckScamCrawlerV2 CLI options
--file <path>     # Input file with scammer links
--max <number>    # Maximum number of scammers to crawl
--delay <ms>      # Delay between requests (default: 5000)
--output <dir>    # Output directory (default: ../Results)
```

## 🔍 Troubleshooting

### Common Issues

#### 1. FlareSolverr Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:8191
```
**Solution**: Ensure FlareSolverr is running on port 8191
```bash
# Using Docker Compose
docker compose ps
docker compose up -d

# Using Docker Run
docker ps | grep flaresolverr
curl http://localhost:8191/v1
```

#### 2. Cloudflare Challenge Failed
```
Error: FlareSolverr failed to solve challenge
```
**Solution**: 
```bash
# Using Docker Compose
docker compose logs flaresolverr
docker compose restart flaresolverr

# Using Docker Run  
docker logs flaresolverr
docker restart flaresolverr
```
- Increase timeout in .env: `FLARESOLVERR_TIMEOUT=120000`

#### 3. No Scammer Links Found
```
No scam link files found in Results directory
```
**Solution**: Run link extraction first:
```bash
node crawl.js links
```

#### 4. Rate Limiting / IP Blocked
```
Multiple 403/429 errors
```
**Solution**: 
- Increase delay: `CRAWLER_DELAY_MS=10000`
- Use different IP/VPN
- Wait before retrying

### Performance Tips

1. **Optimal Settings**:
   - Delay: 5-10 seconds between requests
   - Timeout: 60-120 seconds for FlareSolverr
   - Batch size: 10-20 scammers per run

2. **Success Rate**:
   - Expected: 80-95% with FlareSolverr
   - Factors: Cloudflare difficulty, network stability
   - Monitor: Check Results files for actual success rate

3. **Resource Usage**:
   - FlareSolverr: ~200-500MB RAM
   - Chrome instances: ~100-200MB each
   - Disk: ~1-5MB per 100 scammers crawled

## 📈 Performance Metrics

Recent test results:
- **Success Rate**: 94.4% (17/18 successful)
- **High Quality Data**: 4 scammers with 100% score
- **Processing Time**: ~5 minutes for 18 scammers
- **FlareSolverr Bypass**: 100% success rate

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**⚠️ Disclaimer**: This tool is for educational and research purposes only. Please respect CheckScam.vn's terms of service and use responsibly.
