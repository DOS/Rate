# Changelog

All notable changes to Rate-Importer CheckScam Crawler will be documented in this file.

## [2.1.0] - 2025-06-06

### 🚀 Shopee.vn/Any URL Dynamic Crawling Support

#### Added
- **crawl-url-with-flaresolverr.cjs**: New script to crawl any URL (Shopee.vn, Tiki, etc.) via FlareSolverr, saving HTML result. CommonJS for compatibility. Tested successfully with Shopee.vn product page.
- **Usage**: `node Scripts/crawl-url-with-flaresolverr.cjs <url>`

#### Notes
- Allows flexible scraping of any site protected by Cloudflare/JS challenge, not just checkscam.vn.
- Output: HTML file with timestamp in project root.

---

## [2.0.0] - 2025-06-05

### 🎉 Major Release - Consolidated CheckScam Crawler

#### Added
- **FlareSolverr Integration**: Complete Cloudflare bypass solution
- **Two-Stage Crawling**: Separate link extraction and detailed crawling
- **CLI Interface**: Simple `crawl.js` command runner with `links`, `crawl`, `cleanup` commands
- **Data Validation**: Quality scoring system for extracted scammer data
- **Organized Structure**: All scripts moved to `/Scripts` directory
- **Environment Configuration**: Comprehensive `.env.example` with FlareSolverr settings
- **Enhanced Documentation**: Complete README with troubleshooting and performance metrics

#### Changed
- **Project Structure**: Reorganized all crawler scripts into `/Scripts` directory
- **Command Interface**: Unified commands via `crawl.js` instead of direct script execution
- **Output Format**: Enhanced JSON structure with quality scores and metadata
- **Error Handling**: Improved error messages and retry mechanisms

#### Removed
- **Legacy Scripts**: Cleaned up old crawler implementations
- **CheckScamCrawler Project**: Consolidated separate project into Rate-Importer
- **Obsolete Dependencies**: Removed unused packages and configurations

#### Performance
- **Success Rate**: 94.4% (17/18 successful crawls)
- **High Quality Data**: 4/17 scammers with 100% quality score
- **Processing Speed**: ~5 minutes for 18 scammers
- **FlareSolverr Bypass**: 100% Cloudflare challenge success

#### Technical Details
- **Core Class**: `CheckScamCrawlerV2.js` with enhanced parsing
- **Link Extraction**: `crawl-with-flaresolverr.js` for initial scammer links
- **Main Crawler**: `crawl-main.js` for detailed data extraction
- **Cleanup Utility**: `cleanup.js` for project maintenance
- **Results Directory**: Timestamped JSON outputs in `/Results`

#### Migration Notes
- Old CheckScamCrawler project has been removed
- All functionality consolidated into Rate-Importer
- New command structure: `node crawl.js [command]`
- FlareSolverr service required for operation

---

## [1.x.x] - Previous Versions

### Legacy Implementation
- Basic crawler without Cloudflare bypass
- Multiple separate projects and scripts
- Manual configuration and execution
- Limited success rate due to protection mechanisms

---

**Note**: This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.
