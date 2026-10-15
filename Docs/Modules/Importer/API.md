# Rate-Importer API Documentation

## Overview
Rate-Importer provides APIs for crawling and managing scammer data from CheckScam.vn and other sources.

## CLI Commands

### Link Extraction
```bash
# Extract scammer links from CheckScam.vn
node Rate-Importer/crawl.js links
node crawl.js links

# Extract from specific URL
node crawl.js links --url "https://checkscam.vn/category/danh-sach-scam/"
```

### Data Crawling
```bash
# Crawl all available scammer data
node crawl.js crawl

# Crawl with limits
node crawl.js crawl --max 10 --delay 3000

# Crawl specific file
node crawl.js crawl --file "Results/scam_links_2025-06-05.json"
```

### Cleanup
```bash
# Clean obsolete files and directories
node crawl.js cleanup
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLARESOLVERR_URL` | `http://localhost:8191/v1` | FlareSolverr proxy URL |
| `FLARESOLVERR_TIMEOUT` | `60000` | Request timeout (ms) |
| `CHECKSCAM_BASE_URL` | `https://checkscam.vn` | Base URL for CheckScam |
| `CRAWLER_DELAY_MS` | `5000` | Delay between requests |
| `CRAWLER_MAX_RETRIES` | `3` | Max retry attempts |
| `CRAWLER_TIMEOUT_MS` | `30000` | Individual request timeout |

## Data Schema

### Scammer Link
```json
{
  "name": "060180153252",
  "url": "https://checkscam.vn/?qh_ss=060180153252"
}
```

### Scammer Data
```json
{
  "id": "060180153252",
  "title": "[ CHECKSCAM.VN ] Kiểm tra, tố cáo thông tin lừa đảo",
  "phone": "06018015325",
  "bank": "",
  "scam": "tiền",
  "content": "Detailed scam report...",
  "url": "https://checkscam.vn/?qh_ss=060180153252",
  "quality": "medium",
  "timestamp": "2025-06-05T17:15:17.560Z"
}
```

## Error Handling

### Common Errors
- **FlareSolverr not running**: Start with `docker compose up -d`
- **No links found**: Check URL and website structure
- **Timeout errors**: Increase `FLARESOLVERR_TIMEOUT`
- **Rate limiting**: Increase `CRAWLER_DELAY_MS`

### Status Codes
- `0`: Success
- `1`: General error
- `2`: Configuration error
- `3`: Network error
- `4`: Parsing error

## Integration

### With Strapi (Planned)
```javascript
// Auto-import crawled data
const results = await crawlScammers();
await importToStrapi(results);
```

### With Rate Platform (Planned)
```javascript
// Real-time validation
const validatedData = await validateScammerData(rawData);
await saveToDatabase(validatedData);
```

## Performance

### Benchmarks
- **Link extraction**: ~2-5 seconds
- **Single scammer crawl**: ~3-8 seconds
- **Batch crawling**: ~5-10 seconds per item
- **Success rate**: ~95% with FlareSolverr

### Optimization Tips
- Use appropriate delays to avoid rate limiting
- Monitor FlareSolverr health regularly
- Batch process for large datasets
- Implement retry logic for failed requests
