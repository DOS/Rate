# RateBox Platform Glossary

## 📚 Terms and Definitions

### Platform Components

**RateBox Platform**
: Comprehensive fraud detection and review platform ecosystem consisting of multiple interconnected Modules for data collection, validation, and user protection.

**Rate-New**
: Core platform module built with Strapi CMS backend and Next.js frontend, providing the main API, database, and web dashboard for the RateBox ecosystem.

**Rate-Importer**
: Data crawler module responsible for automated collection and validation of fraud data from external Resources like CheckScam.vn.

**Rate-Extension**
: Browser extension module (planned) for real-time fraud detection and user reporting capabilities across web browsers.

### Architecture Terms

**MVP Architecture**
: Minimum Viable Product approach focusing on 6-8 week development timeline with core features, allowing for rapid deployment and iterative improvement.

**Modular Design**
: Architecture pattern where each component (Rate-New, Rate-Importer, Rate-Extension) operates independently while communicating through well-defined APIs.

**Monorepo**
: Single repository containing multiple related projects, managed using Turborepo for build orchestration and dependency management.

**Core Validator**
: Shared TypeScript package containing validation logic used across all platform Modules to ensure data consistency and quality.

### Data and Processing

**Scam Report**
: Structured data record containing information about fraudulent activities, including type (phone, website, social), identifier, description, and evidence.

**Data Validation Pipeline**
: Multi-stage process for verifying, enriching, and standardizing incoming data before storage in the platform database.

**Fraud Detection**
: Automated process of identifying potentially fraudulent activities using pattern matching, machine learning, and rule-based systems.

**Data Enrichment**
: Process of adding additional context, metadata, and related information to base scam reports to improve their usefulness.

### Technical Infrastructure

**FlareSolverr**
: Proxy server tool used to bypass Cloudflare protection and other anti-bot measures during web scraping operations.

**Strapi CMS**
: Headless content management system providing the backend API, admin interface, and database management for Rate-New.

**Next.js App Router**
: Modern React framework with App Router architecture used for building the Rate-New frontend dashboard.

**Docker Compose**
: Container orchestration tool used for local development and deployment of the complete RateBox platform stack.

### Development and Operations

**TypeScript**
: Primary programming language used across all platform Modules, providing type safety and improved developer experience.

**Turborepo**
: Build system and monorepo tool for managing multiple packages and applications within the RateBox ecosystem.

**PowerShell**
: Command-line shell and scripting language used for Windows development environment setup and automation.

**Environment Variables**
: Configuration settings stored separately from code, including API keys, database URLs, and service endpoints.

### Data Sources and Integration

**CheckScam.vn**
: Primary external data source for fraud reports, specifically focused on Vietnamese scam activities and phone number verification.

**Proxy Rotation**
: Technique of cycling through multiple IP addresses to avoid rate limiting and detection during web scraping operations.

**Captcha Solving**
: Automated process of bypassing CAPTCHA challenges using services like 2Captcha during data collection.

**API Integration**
: Process of connecting different Modules and external services through standardized REST API endpoints.

### User Interface and Experience

**Admin Dashboard**
: Web-based interface for platform administrators to manage data, monitor system health, and configure platform settings.

**Real-time Detection**
: Immediate fraud identification and alerting as users browse the web, implemented through the browser extension.

**User Reporting**
: Feature allowing end users to submit fraud reports directly through the browser extension or web interface.

**Data Visualization**
: Graphical representation of fraud data, trends, and statistics within the admin dashboard.

### Security and Compliance

**JWT (JSON Web Token)**
: Authentication mechanism used for secure API access and user session management across platform Modules.

**OIDC (OpenID Connect)**
: Authentication protocol planned for integration with external identity providers like Zitadel.

**Rate Limiting**
: Security measure to prevent API abuse by limiting the number of requests from a single source within a time period.

**Data Encryption**
: Security practice of encoding sensitive data both in transit and at rest to protect user privacy and comply with regulations.

### Performance and Scaling

**Queue Processing**
: Asynchronous task management system for handling large volumes of data processing without blocking user interactions.

**Database Indexing**
: Optimization technique for improving query performance on frequently accessed data fields.

**Caching**
: Temporary storage of frequently accessed data to reduce database load and improve response times.

**Load Balancing**
: Distribution of incoming requests across multiple server instances to ensure optimal performance and availability.

### Development Workflow

**Continuous Integration (CI)**
: Automated testing and building of code changes to ensure quality and prevent regressions.

**Continuous Deployment (CD)**
: Automated deployment of tested code changes to production environments.

**Version Control**
: Git-based system for tracking code changes, managing branches, and coordinating team development.

**Code Review**
: Peer review process for ensuring code quality, security, and adherence to platform standards.

### Business and Domain

**Fraud Pattern**
: Recognizable sequence or characteristic of fraudulent activities that can be detected and prevented.

**Scam Category**
: Classification system for different types of fraudulent activities (phone scams, website fraud, social media scams, financial fraud).

**Risk Score**
: Numerical assessment of the likelihood that a particular entity (phone number, website, etc.) is associated with fraudulent activity.

**False Positive**
: Legitimate entity incorrectly identified as fraudulent by the detection system.

**False Negative**
: Fraudulent entity that was not detected by the system and incorrectly classified as legitimate.

### Integration Patterns

**Event-Driven Architecture**
: Design pattern where Modules communicate through events, allowing for loose coupling and scalability.

**API-First Design**
: Development approach where APIs are designed and documented before implementation, ensuring consistent interfaces.

**Microservices**
: Architectural pattern where applications are built as a collection of small, independent services.

**Service Mesh**
: Infrastructure layer for handling service-to-service communication in a microservices architecture.

---

## 📖 Acronyms and Abbreviations

| Acronym | Full Form | Description |
|---------|-----------|-------------|
| **API** | Application Programming Interface | Set of protocols for building software applications |
| **CMS** | Content Management System | Software for creating and managing digital content |
| **CRUD** | Create, Read, Update, Delete | Basic database operations |
| **CSS** | Cascading Style Sheets | Stylesheet language for web presentation |
| **DB** | Database | Organized collection of structured information |
| **DNS** | Domain Name System | Internet naming system |
| **E2E** | End-to-End | Complete workflow testing |
| **HTTP** | HyperText Transfer Protocol | Web communication protocol |
| **JSON** | JavaScript Object Notation | Data interchange format |
| **JWT** | JSON Web Token | Compact token format for secure transmission |
| **MVP** | Minimum Viable Product | Product with core features for early adoption |
| **OIDC** | OpenID Connect | Authentication layer on OAuth 2.0 |
| **ORM** | Object-Relational Mapping | Database abstraction technique |
| **REST** | Representational State Transfer | Architectural style for web services |
| **SPA** | Single Page Application | Web app that loads single HTML page |
| **SQL** | Structured Query Language | Database query language |
| **SSR** | Server-Side Rendering | Rendering web pages on the server |
| **UI** | User Interface | Point of interaction between user and system |
| **UX** | User Experience | Overall experience of using a product |
| **UUID** | Universally Unique Identifier | 128-bit identifier standard |

---

## 🔗 Related Documentation

- **[Platform Overview](../Platform/overview.md)** - System architecture and components
- **[MVP Architecture](../Platform/mvp-architecture.md)** - Development strategy and timeline
- **[Integration Guide](../Platform/integration-guide.md)** - Module integration patterns
- **[Development Setup](../Guides/development-setup.md)** - Environment configuration
- **[Contributing Guide](contributing.md)** - Contribution guidelines and standards

---

**Last Updated**: 2025-06-06  
**Maintained by**: RateBox Documentation Team
