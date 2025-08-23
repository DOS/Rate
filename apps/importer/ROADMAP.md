# Rate-Importer Roadmap 🗺️

## 📍 **Current Status** (Completed ✅)
- [x] **CheckScam Crawler Integration**: Hợp nhất CheckScamCrawler vào Rate-Importer
- [x] **FlareSolverr Setup**: Docker Compose cho Cloudflare bypass
- [x] **Project Structure**: Tổ chức lại Scripts/, Results/, cleanup obsolete files
- [x] **CLI Interface**: Unified `crawl.js` với commands: links, crawl, cleanup
- [x] **Documentation**: README, CHANGELOG, setup.ps1 cho Windows PowerShell
- [x] **Basic Functionality**: Extract links + crawl scammer data working

---

## 📈 Recent Progress (2025-06-09)

- [x] **Redis Stream Integration:** Đã hoàn thành, production-ready, Validator Worker xử lý realtime, không lưu rác vào CMS
- [x] **Validator Worker:** Đã validate 9,000+ items, Docker production OK, logic dedupe/enrich hoạt động tốt
- [x] **Strapi Importer API:** Đã hoạt động đúng chuẩn forward-only, chỉ forward lên Redis, không lưu raw vào CMS
- [x] **Push-to-validation CLI:** Đã tạo script gửi batch từ crawler vào validation pipeline, không lưu trực tiếp vào CMS
- [x] **Docs:** Đã cập nhật kiến trúc ingest mới (forward-only gateway), best practice, và flow chuẩn
- [ ] **core-validator package:** Chưa tách thành package TypeScript độc lập, validation logic vẫn nằm trong Python/JS scripts
- [ ] **JS/TS migration:** Chưa migrate toàn bộ business logic sang JS/TS, vẫn còn nhiều ở Python worker
- [ ] **Enrichment pipeline:** Chưa có pipeline độc lập, mới chỉ inline trong worker/crawler
- [ ] **Testing (Jest):** Chưa có testing coverage đầy đủ cho validation logic JS/TS

## 🚀 MVP Phase: Foundation Platform (6-8 weeks)

### **Milestone 1: Core Validation Foundation** (Week 1-2)
**Goal**: Extract and enhance validation logic into shared package

**Tasks**:
- [ ] Setup monorepo structure với Turborepo
- [ ] Create `packages/core-validator` với TypeScript
- [ ] Migrate current validation logic từ crawler
- [ ] Add comprehensive schema validation
- [ ] Implement business rules validation
- [ ] Create data enrichment pipeline
- [ ] Add duplicate detection logic
- [ ] Setup testing framework với Jest

**Deliverable**: Working validation package với API

---

### **Milestone 2: Simple API Server** (Week 3-4)
**Goal**: Create lightweight API for data management

**Tasks**:
- [ ] Setup Express.js API server
- [ ] Implement SQLite database với migrations
- [ ] Create CRUD endpoints cho scam reports
- [ ] Add validation endpoint `/api/validate`
- [ ] Implement bulk import functionality
- [ ] Add basic error handling và logging
- [ ] Create health check endpoints
- [ ] Setup environment configuration

**Deliverable**: API server với database integration

---

### **Milestone 3: Enhanced Crawler Integration** (Week 5-6)
**Goal**: Integrate current crawler với new validation system

**Tasks**:
- [ ] Create CheckScam adapter trong `apps/crawler`
- [ ] Integrate core-validator với crawler
- [ ] Update crawler để save data via API
- [ ] Add retry logic và error handling
- [ ] Implement progress tracking
- [ ] Create CLI commands cho validation
- [ ] Add data export functionality
- [ ] Update Docker setup

**Deliverable**: Crawler saving validated data to API

---

### **Milestone 4: Web Dashboard** (Week 7-8)
**Goal**: Create simple web interface for data viewing

**Tasks**:
- [ ] Setup Next.js 14+ với App Router
- [ ] Create dashboard với basic stats
- [ ] Implement reports listing page
- [ ] Add report detail views
- [ ] Create validation status indicators
- [ ] Add export functionality (JSON/CSV)
- [ ] Implement basic search và filtering
- [ ] Add responsive design với Tailwind CSS

**Deliverable**: Working web dashboard

---

## 🎯 **Phase 1: Core Optimization** (Next 1-2 weeks)

### 1.1 **Data Quality Enhancement**
- [ ] **Improve Link Extraction**: 
  - Tìm thêm scammer links từ multiple pages/categories
  - Support pagination crawling
  - Filter quality links better
- [ ] **Enhanced Data Parsing**:
  - Better regex patterns cho phone/bank/amount
  - Extract more fields (location, report date, category)
  - Improve content cleaning và normalization
- [ ] **Validation Pipeline**:
  - Schema validation cho crawled data
  - Duplicate detection và deduplication
  - Data quality scoring và filtering

### 1.2 **Performance & Reliability**
- [ ] **Error Handling**:
  - Retry mechanisms cho failed requests
  - Better error logging và recovery
  - Graceful handling của rate limits
- [ ] **Monitoring**:
  - Success rate tracking
  - Performance metrics
  - Health checks cho FlareSolverr
- [ ] **Configuration**:
  - Environment-based configs
  - Tunable parameters (delays, timeouts, limits)

---

## 🚀 **Phase 2: Integration & Automation** (Next 2-4 weeks)

### 2.1 **Rate Platform Integration**
- [ ] **Strapi Integration**:
  - Auto-import crawled data vào Rate CMS
  - Content type definitions cho scammer data
  - API endpoints cho data management
- [ ] **Database Integration**:
  - PostgreSQL storage cho crawled data
  - Proper indexing và search capabilities
  - Data archiving và retention policies
- [ ] **API Development**:
  - REST APIs cho external access
  - GraphQL endpoints cho complex queries
  - Webhook support cho real-time updates

### 2.2 **Automation & Scheduling**
- [ ] **Scheduled Crawling**:
  - Cron jobs cho daily/weekly crawls
  - Incremental crawling (chỉ crawl new data)
  - Auto-cleanup old data
- [ ] **CI/CD Pipeline**:
  - GitHub Actions cho automated testing
  - Docker image builds và deployment
  - Environment promotion (dev → staging → prod)

---

## 🔧 **Phase 3: Advanced Features** (Next 1-2 months)

### 3.1 **Multi-Source Support**
- [ ] **Additional Sources**:
  - Support thêm websites khác (scam.vn, etc.)
  - Social media monitoring (Facebook groups, etc.)
  - Government databases integration
- [ ] **Unified Data Model**:
  - Common schema cho multiple sources
  - Source attribution và credibility scoring
  - Cross-reference validation

### 3.2 **Intelligence & Analytics**
- [ ] **Pattern Recognition**:
  - ML models để detect scam patterns
  - Fraud risk scoring algorithms
  - Trend analysis và reporting
- [ ] **Real-time Alerts**:
  - Notification system cho new high-risk scammers
  - Integration với messaging platforms (Telegram, Discord)
  - Email alerts cho stakeholders

### 3.3 **User Interface**
- [ ] **Admin Dashboard**:
  - Web interface cho crawler management
  - Data visualization và analytics
  - Manual review và approval workflows
- [ ] **Public API**:
  - Rate limiting và authentication
  - Developer documentation
  - SDK development cho easy integration

---

## 🏗️ **Phase 4: Scale & Production** (Next 2-3 months)

### 4.1 **Scalability**
- [ ] **Distributed Crawling**:
  - Multiple crawler instances
  - Load balancing và job distribution
  - Horizontal scaling với Kubernetes
- [ ] **Performance Optimization**:
  - Caching strategies (Redis)
  - Database optimization
  - CDN cho static assets

### 4.2 **Production Readiness**
- [ ] **Security**:
  - API authentication và authorization
  - Data encryption at rest và in transit
  - Security audit và compliance
- [ ] **Monitoring & Observability**:
  - Comprehensive logging (ELK stack)
  - Metrics và alerting (Prometheus/Grafana)
  - Distributed tracing
- [ ] **Backup & Recovery**:
  - Automated backups
  - Disaster recovery procedures
  - Data migration tools

---

## 🎯 **Immediate Next Steps** (This Week)

### **Priority 1: Data Quality**
1. **Improve Link Extraction**:
   ```bash
   # Test different URLs và categories
   node crawl.js links --url "https://checkscam.vn/category/danh-sach-scam/"
   node crawl.js links --url "https://checkscam.vn/category/scam-online/"
   ```

2. **Enhanced Parsing**:
   - Update `CheckScamCrawlerV2.js` với better regex patterns
   - Add more data fields extraction
   - Improve content cleaning logic

3. **Validation Pipeline**:
   - Create data validation schema
   - Add duplicate detection
   - Implement quality scoring

### **Priority 2: Monitoring**
1. **Add Logging**:
   - Structured logging với timestamps
   - Success/failure rate tracking
   - Performance metrics collection

2. **Health Checks**:
   - FlareSolverr health monitoring
   - Crawler status dashboard
   - Alert system cho failures

### **Priority 3: Configuration**
1. **Environment Management**:
   - Production-ready `.env` template
   - Configuration validation
   - Environment-specific settings

---

## 📊 **Success Metrics**

### **Phase 1 Targets**:
- **Data Quality**: >90% valid records
- **Coverage**: >100 scammer records/day
- **Reliability**: >95% uptime
- **Performance**: <10s average crawl time

### **Phase 2 Targets**:
- **Integration**: Full Strapi integration
- **Automation**: 24/7 automated crawling
- **API**: Public API với documentation

### **Phase 3 Targets**:
- **Multi-source**: 3+ data sources
- **Intelligence**: ML-powered fraud detection
- **Scale**: 1000+ records/day processing

---

## 🤝 **Team & Resources**

### **Current Team**: 
- **Developer**: You (full-stack development)
- **Infrastructure**: Docker, FlareSolverr, PostgreSQL
- **Platform**: Rate Platform (Strapi + Next.js)

### **Needed Resources**:
- **Phase 2**: DevOps engineer cho CI/CD
- **Phase 3**: Data scientist cho ML models
- **Phase 4**: Security engineer cho production hardening

---

## 📝 **Notes**

- **Technology Stack**: Node.js, TypeScript, Docker, PostgreSQL, Redis
- **Deployment**: Docker Compose → Kubernetes (later)
- **Monitoring**: Prometheus + Grafana (later)
- **CI/CD**: GitHub Actions
- **Documentation**: Markdown + API docs

---

**Next Action**: Chọn 1-2 items từ Priority 1 để implement trong tuần này! 🚀
