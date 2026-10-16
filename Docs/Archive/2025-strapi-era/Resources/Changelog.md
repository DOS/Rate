# RateBox Platform Changelog

## 📋 Overview

This changelog tracks major updates, features, and changes across the RateBox platform ecosystem.

## 🏷️ Version Format

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR.MINOR.PATCH** (e.g., 1.2.3)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

## 📅 Changelog

### [Unreleased]

#### Platform
- **MVP Architecture Implementation** - 6-8 week development plan
- **Centralized Documentation** - Dedicated RateBox-Docs repository
- **Module Integration Design** - Cross-Modules communication patterns

#### Rate-New (Core Platform)
- **MVP Foundation** - Express.js + SQLite → Strapi + PostgreSQL
- **Next.js 14+ Dashboard** - App Router with Tailwind CSS
- **Authentication System** - JWT + OIDC integration planning
- **Admin Interface** - Data management and monitoring

#### Rate-Importer (Crawler)
- **Enhanced Crawler** - Proxy rotation and captcha solving
- **Stealth Features** - Canvas fingerprint protection, WebGL spoofing
- **2Captcha Integration** - Cloudflare Turnstile bypass
- **Docker Support** - Complete containerization
- **FlareSolverr Integration** - Cloudflare bypass solution

#### Rate-Extension (Browser Extension)
- **Architecture Planning** - Real-time fraud detection design
- **Cross-browser Support** - Chrome, Firefox, Edge compatibility
- **Data Collection** - User reporting interface design

---

### [0.4.0] - 2025-08-25

#### Added
- **Shopee Integration** - Redis Stream integration for real-time data processing
- **Smart Duplicate Detection** - Check duplicates by shopId + productId instead of URL
- **Permanent URL System** - Generate canonical URLs: `https://shopee.vn/product/{shop_id}/{product_id}`
- **Enhanced Listing Schema** - Added metadata, shopeeProductId, shopeeShopId fields

#### Changed  
- **ListingProcessor Service** - Improved duplicate detection using product/shop IDs
- **URL Normalization** - Use permanent URLs to avoid redirect issues
- **Locale Support** - Ensure Vietnamese locale (vi) for listings
- **Database Schema** - Extended listings table with Shopee-specific fields

#### Fixed
- **Duplicate Listings** - Fixed issue creating duplicate listings from same Shopee product
- **URL Stability** - Resolved URL changes causing duplicate entries
- **Locale Assignment** - Fixed listings appearing in English instead of Vietnamese

#### Technical
- **Redis Stream Consumer** - Process Shopee data from browser extension
- **Database Fields** - Added metadata (JSON), shopeeProductId, shopeeShopId
- **URL Format** - Standardized to `https://shopee.vn/product/{shop_id}/{product_id}`
- **Duplicate Prevention** - Query by shopId + productId pair

---

### [0.3.0] - 2025-06-06

#### Added
- **Documentation Repository** - Centralized docs at RateBox-Docs
- **Platform Architecture** - Complete system overview and integration guide
- **MVP Development Plan** - 6-8 week implementation roadmap
- **Development Guides** - Setup, quick start, and troubleshooting guides

#### Changed
- **Documentation Structure** - Moved from Rate-New to dedicated repository
- **Cross-references** - Updated all documentation links
- **Project Organization** - Modular documentation approach

#### Technical
- **Technology Stack** - Latest packages preference established
- **Architecture Decision** - MVP-first approach vs full enterprise
- **Development Timeline** - Phased implementation plan

---

### [0.2.0] - 2025-06-05

#### Rate-Importer
- **CheckScam Crawler** - Functional crawler with data extraction
- **FlareSolverr Integration** - Cloudflare bypass capability
- **Enhanced Features** - Proxy management and captcha solving
- **Data Validation** - Basic validation pipeline
- **Docker Deployment** - Complete containerization

#### Added
- **Web Scraping** - CheckScam.vn data extraction
- **Proxy Rotation** - ProxyManager for IP rotation
- **Captcha Solving** - 2Captcha API integration
- **Phone Number Validation** - Vietnamese phone format support
- **Data Schemas** - Structured data output formats

#### Technical
- **TypeScript Implementation** - Full type safety
- **Testing Framework** - Unit and integration tests
- **Comprehensive Logging** - Debug and monitoring capabilities
- **Environment Configuration** - Flexible deployment options

---

### [0.1.0] - 2025-06-04

#### Initial Release
- **Project Foundation** - RateBox platform concept and planning
- **Requirements Analysis** - Fraud detection platform requirements
- **Architecture Design** - Modular platform architecture
- **Documentation Setup** - Initial documentation structure

#### Rate-New (Core Platform)
- **Project Structure** - Strapi + Next.js foundation
- **Database Design** - PostgreSQL schema planning
- **Authentication Planning** - User management system design

#### Rate-Importer (Crawler)
- **Crawler Foundation** - Basic web scraping capabilities
- **Target Identification** - CheckScam.vn as primary source
- **Development Environment** - Local development setup

#### Planning
- **Roadmap Creation** - 4-phase development plan
- **MVP Definition** - Minimum viable product scope
- **Technology Selection** - Modern tech stack choices

---

## Statistics

### Development Metrics
- **Total Commits**: 150+
- **Contributors**: 2
- **Modules**: 3 (Rate-New, Rate-Importer, Rate-Extension)
- **Documentation Files**: 25+
- **Test Coverage**: 80%+ (target)

### Platform Capabilities
- **Data Sources**: 1 (CheckScam.vn)
- **Supported Formats**: Phone numbers, websites, social profiles
- **Processing Rate**: 100+ records/hour
- **Success Rate**: 85%+ (with proxy/captcha)

## Upcoming Milestones

### Q2 2025 (Current)
- **MVP Foundation** - Core validator package
- **API Development** - Express.js server with SQLite
- **Dashboard Creation** - Next.js 14+ interface
- **Module Integration** - Cross-Modules communication

### Q3 2025
- **Production Deployment** - Scalable infrastructure
- **ML Integration** - Intelligent fraud detection
- **Mobile Support** - Progressive web app
- **Multi-language** - Internationalization

### Q4 2025
- 🔍 **Advanced Analytics** - Fraud pattern analysis
- 🤝 **API Ecosystem** - Third-party integrations
- 🛡️ **Enterprise Security** - Advanced security features
- 📈 **Performance Optimization** - High-scale processing

## 🔗 Related Links

- **[Platform Overview](../Platform/overview.md)** - Complete system architecture
- **[MVP Architecture](../Platform/mvp-architecture.md)** - Development strategy
- **[Development Setup](../Guides/development-setup.md)** - Environment setup
- **[Contributing Guide](contributing.md)** - How to contribute

---

**Maintained by**: RateBox Development Team  
**Last Updated**: 2025-06-06  
**Next Update**: Weekly during active development
