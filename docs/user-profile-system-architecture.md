# User Profile System Architecture

## 📋 Mục Tiêu (Objectives)

Thiết kế hệ thống quản lý user profile trong Strapi phân biệt rõ ràng giữa:

1. **Unified Profile** (Zitadel) - Thông tin identity do Zitadel quản lý
2. **Local Profile** (Strapi) - Dữ liệu app-specific lưu trong Strapi
3. **Multi-tenancy Support** - Cho phép user quản lý nhiều organization

## 🏗️ Kiến Trúc Tổng Quan

### Component Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Strapi API    │────▶│    Zitadel      │
│  (Next.js/SPA)  │     │                 │     │   (OIDC IdP)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                        │
         │                       ▼                        │
         │              ┌─────────────────┐              │
         │              │   PostgreSQL    │              │
         │              │                 │              │
         │              │ ┌─────────────┐ │              │
         └──────────────▶│ │  Identity   │ │◀─────────────┘
                        │ │  Collection │ │
                        │ └─────────────┘ │
                        └─────────────────┘
```

### Authentication Flow

```mermaid
sequenceDiagram
    User->>Frontend: Login Request
    Frontend->>Zitadel: Redirect to OIDC
    Zitadel->>Frontend: Return with code
    Frontend->>Strapi: Exchange code for token
    Strapi->>Zitadel: Validate token
    Strapi->>Strapi: Create/Update Identity
    Strapi->>Frontend: Return JWT + Profile
```

## 🔐 Security Architecture

### 1. Authentication & Authorization

- **OIDC Integration** với Zitadel
- **JWT Validation** trên mỗi request
- **Refresh Token Rotation** với HttpOnly cookies
- **Device Fingerprinting** để phát hiện token theft

### 2. Data Protection

- **Field-level Encryption** cho dữ liệu nhạy cảm (SSN, Tax ID)
- **Key Versioning** cho encryption key rotation
- **TLS Everywhere** cho mọi kết nối
- **CSRF Protection** cho stateful endpoints

### 3. Access Control

- **Policy-based** authorization
- **Owner validation** ở cả policy và service layer
- **Rate limiting** cho auth endpoints
- **Audit logging** cho mọi action

## 📊 Database Schema

### Identity Collection

```javascript
{
  // Core fields
  "user_id": "string", // Zitadel user ID
  "organization_id": "string", // For multi-tenancy
  "is_primary": "boolean", // Primary identity flag

  // Profile data
  "display_name": "string",
  "avatar_url": "string",
  "bio": "text",

  // Preferences
  "language": "string",
  "timezone": "string",
  "theme": "enum", // light/dark

  // Sensitive data (encrypted)
  "ssn": "string",
  "ssn_version": "integer",
  "tax_id": "string",
  "tax_id_version": "integer",

  // Metadata
  "last_login": "datetime",
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Database Indexes

```sql
-- Performance indexes
CREATE INDEX idx_identity_user_id ON identities(user_id);
CREATE INDEX idx_identity_org_user ON identities(organization_id, user_id);
CREATE INDEX idx_identity_primary ON identities(user_id, is_primary);

-- Audit log indexes
CREATE INDEX idx_audit_user_time ON audit_logs(user_id, timestamp);
CREATE INDEX idx_audit_action ON audit_logs(action, success, timestamp);
```

## 🚀 Implementation Plan

### Phase 1: Core MVP (3-5 ngày)

- [ ] Cài đặt và config OIDC plugin
- [ ] Tạo Identity collection schema
- [ ] Implement lifecycle hooks cho auto-create profile
- [ ] Custom refresh/logout endpoints
- [ ] Basic error handling

### Phase 2: Security Hardening (1 tuần - song song)

- [ ] Field-level encryption
- [ ] Rate limiting setup
- [ ] Audit logging với queue
- [ ] CSRF protection
- [ ] Device fingerprinting

### Phase 3: Production Ready (1-2 tuần)

- [ ] Database indexes optimization
- [ ] Redis caching layer
- [ ] Health/readiness probes
- [ ] Monitoring & alerting
- [ ] Load testing

## 💻 Code Implementation

### 1. OIDC Configuration

```javascript
// config/plugins.js
module.exports = {
  "users-permissions": {
    config: {
      providers: {
        zitadel: {
          enabled: true,
          icon: "zitadel",
          key: process.env.ZITADEL_CLIENT_ID,
          secret: process.env.ZITADEL_CLIENT_SECRET,
          callback: "/api/auth/zitadel/callback",
          scope: ["openid", "profile", "email", "offline_access"],
          authorize_url: `${process.env.ZITADEL_ISSUER}/oauth/v2/authorize`,
          access_url: `${process.env.ZITADEL_ISSUER}/oauth/v2/token`,
          oauth: 2,
          profile_url: `${process.env.ZITADEL_ISSUER}/oidc/v1/userinfo`,
          profile: (profile) => {
            return {
              username: profile.preferred_username || profile.email,
              email: profile.email,
              name: profile.name,
              sub: profile.sub, // Zitadel user ID
            }
          },
        },
      },
    },
  },
}
```

### 2. Identity Service

```javascript
// src/api/identity/services/identity.js
const DataLoader = require("dataloader")
const { encrypt, decrypt } = require("../../../utils/encryption")

module.exports = ({ strapi }) => {
  // DataLoader for batch queries
  const identityLoader = new DataLoader(async (userIds) => {
    const identities = await strapi.entityService.findMany(
      "api::identity.identity",
      {
        filters: {
          user_id: { $in: userIds },
          is_primary: true,
        },
      }
    )
    return userIds.map((id) => identities.find((i) => i.user_id === id) || null)
  })

  return {
    async getOrCreateIdentity(userId, data = {}) {
      let identity = await strapi.entityService.findMany(
        "api::identity.identity",
        {
          filters: {
            user_id: { $eq: userId },
            is_primary: true,
          },
          limit: 1,
        }
      )

      if (!identity || identity.length === 0) {
        identity = await strapi.entityService.create("api::identity.identity", {
          data: {
            user_id: userId,
            is_primary: true,
            ...data,
          },
        })
      } else {
        identity = identity[0]
      }

      return identity
    },

    getPrimaryIdentity: (userId) => identityLoader.load(userId),
    clearCache: (userId) => identityLoader.clear(userId),
  }
}
```

### 3. Refresh Token Endpoint

```javascript
// src/api/auth/controllers/auth.js
const { ForbiddenError, UnauthorizedError } = require("@strapi/utils").errors

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",
  domain: process.env.COOKIE_DOMAIN || undefined,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
}

module.exports = {
  async refresh(ctx) {
    try {
      const refreshToken = ctx.cookies.get("refreshToken")
      if (!refreshToken) {
        throw new UnauthorizedError("No refresh token provided")
      }

      const { accessToken, newRefreshToken } = await strapi
        .service("api::auth.zitadel")
        .rotateTokens(refreshToken)

      // Set new refresh token
      ctx.cookies.set("refreshToken", newRefreshToken, COOKIE_OPTIONS)

      // Audit log
      await strapi.service("api::audit.audit").log({
        action: "token_refresh",
        userId: ctx.state.user?.id,
        success: true,
      })

      ctx.send({ accessToken })
    } catch (error) {
      await strapi.service("api::audit.audit").log({
        action: "token_refresh",
        error: error.message,
        success: false,
      })

      if (error.code === "TOKEN_EXPIRED" || error.code === "TOKEN_REVOKED") {
        throw new UnauthorizedError("Invalid refresh token")
      }
      throw error
    }
  },

  async logout(ctx) {
    const refreshToken = ctx.cookies.get("refreshToken")

    if (refreshToken) {
      try {
        await strapi.service("api::auth.zitadel").revokeToken(refreshToken)
      } catch (error) {
        strapi.log.error("Token revocation failed:", error)
      }
    }

    ctx.cookies.set("refreshToken", null, { maxAge: 0 })
    ctx.send({ message: "Logged out successfully" })
  },
}
```

### 4. Encryption Utils

```javascript
// src/utils/encryption.js
const crypto = require("crypto")

const CURRENT_VERSION = 2
const KEYS = {
  1: process.env.ENCRYPTION_KEY_V1,
  2: process.env.ENCRYPTION_KEY_V2,
}

module.exports = {
  encrypt(text) {
    const key = KEYS[CURRENT_VERSION]
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      iv
    )

    let encrypted = cipher.update(text, "utf8", "hex")
    encrypted += cipher.final("hex")

    const authTag = cipher.getAuthTag()

    return {
      data:
        iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted,
      version: CURRENT_VERSION,
    }
  },

  decrypt(encryptedData) {
    const { data, version } = encryptedData
    const key = KEYS[version]

    if (!key) throw new Error(`No key for version ${version}`)

    const parts = data.split(":")
    const iv = Buffer.from(parts[0], "hex")
    const authTag = Buffer.from(parts[1], "hex")
    const encrypted = parts[2]

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      iv
    )
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
  },
}
```

### 5. Lifecycle Hooks

```javascript
// src/api/identity/content-types/identity/lifecycles.js
const { encrypt, decrypt } = require("../../../../utils/encryption")

const ENCRYPTED_FIELDS = ["ssn", "tax_id"]

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params

    for (const field of ENCRYPTED_FIELDS) {
      if (data[field]) {
        const encrypted = encrypt(data[field])
        data[field] = encrypted.data
        data[`${field}_version`] = encrypted.version
      }
    }
  },

  async beforeUpdate(event) {
    const { data } = event.params

    for (const field of ENCRYPTED_FIELDS) {
      if (data[field] && !data[field].includes(":")) {
        const encrypted = encrypt(data[field])
        data[field] = encrypted.data
        data[`${field}_version`] = encrypted.version
      }
    }
  },

  async afterFindOne(event) {
    const { result } = event
    if (!result) return

    for (const field of ENCRYPTED_FIELDS) {
      if (result[field]) {
        try {
          result[field] = decrypt({
            data: result[field],
            version: result[`${field}_version`] || 1,
          })
        } catch (error) {
          strapi.log.error(`Failed to decrypt ${field}:`, error)
          result[field] = "[ENCRYPTED]"
        }
      }
    }
  },

  async afterFindMany(event) {
    const { result } = event

    for (const item of result) {
      for (const field of ENCRYPTED_FIELDS) {
        if (item[field]) {
          try {
            item[field] = decrypt({
              data: item[field],
              version: item[`${field}_version`] || 1,
            })
          } catch (error) {
            strapi.log.error(`Failed to decrypt ${field}:`, error)
            item[field] = "[ENCRYPTED]"
          }
        }
      }
    }
  },
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Zitadel OIDC
ZITADEL_ISSUER=https://auth.yourdomain.com
ZITADEL_CLIENT_ID=your-client-id
ZITADEL_CLIENT_SECRET=your-client-secret

# Security
JWT_SECRET=your-jwt-secret-min-32-chars
REFRESH_TOKEN_SECRET=your-refresh-secret-min-32-chars
CSRF_SECRET=your-csrf-secret-min-32-chars
COOKIE_DOMAIN=.yourdomain.com

# Encryption
ENCRYPTION_KEY_V1=64-hex-chars
ENCRYPTION_KEY_V2=64-hex-chars

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/strapi
DATABASE_SSL=true

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_TLS=true

# Monitoring
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.yourdomain.com
```

### Middleware Configuration

```javascript
// config/middlewares.js
module.exports = [
  "strapi::errors",
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "script-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:", "https:"],
        },
      },
      hsts: {
        enabled: true,
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: "deny" },
      xssFilter: true,
      noSniff: true,
    },
  },
  {
    name: "strapi::cors",
    config: {
      origin: (ctx) => {
        const allowedOrigins = [
          process.env.FRONTEND_URL,
          process.env.ADMIN_URL,
        ].filter(Boolean)

        const origin = ctx.get("Origin")
        return allowedOrigins.includes(origin) ? origin : false
      },
      credentials: true,
    },
  },
  {
    name: "strapi::rateLimit",
    config: {
      api: {
        max: 100,
        timeWindow: 60000,
      },
      auth: {
        max: 5,
        timeWindow: 60000,
      },
    },
  },
  "strapi::csrf",
  // ... other middlewares
]
```

## 📊 Monitoring & Observability

### Prometheus Metrics

```javascript
// Key metrics to track
- http_request_duration_seconds{handler="auth.*"}
- http_requests_total{status="4xx|5xx"}
- identity_creation_total
- encryption_operations_total{operation="encrypt|decrypt"}
- queue_jobs_total{queue="audit-log", status="completed|failed"}
```

### Health Checks

```javascript
// GET /healthz - Basic health
// GET /readyz - Ready to serve traffic
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "auth": "ok"
  }
}
```

### Alert Rules

```yaml
groups:
  - name: auth_alerts
    rules:
      - alert: HighAuthErrorRate
        expr: rate(http_requests_total{handler="auth.refresh",status=~"4.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High auth error rate detected"

      - alert: HighAuthLatency
        expr: histogram_quantile(0.95, http_request_duration_seconds{handler=~"auth.*"}) > 2
        for: 5m
        labels:
          severity: warning
```

## 🧪 Testing Strategy

### Unit Tests

- Encryption/decryption functions
- Identity service methods
- Policy validations

### Integration Tests

- OIDC flow with Zitadel
- Token refresh mechanism
- Profile creation lifecycle

### E2E Tests

```javascript
describe("Auth Flow", () => {
  test("Complete auth flow", async () => {
    // 1. Login
    // 2. Token refresh
    // 3. Get identity
    // 4. Update profile
    // 5. Logout
  })
})
```

### Load Testing

```bash
# K6 script for auth endpoints
k6 run --vus 100 --duration 30s auth-load-test.js
```

## 🚢 Deployment

### Docker Setup

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build
EXPOSE 1337
CMD ["yarn", "start"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: strapi-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: strapi-api
  template:
    metadata:
      labels:
        app: strapi-api
    spec:
      containers:
        - name: strapi
          image: rate/strapi:latest
          ports:
            - containerPort: 1337
          env:
            - name: NODE_ENV
              value: "production"
          livenessProbe:
            httpGet:
              path: /healthz
              port: 1337
          readinessProbe:
            httpGet:
              path: /readyz
              port: 1337
```

## 📚 References

- [Strapi Documentation](https://docs.strapi.io)
- [Zitadel OIDC](https://zitadel.com/docs/guides/integrate/login/oidc)
- [OWASP Security Guidelines](https://owasp.org/www-project-api-security/)
- [12 Factor App](https://12factor.net/)

## 🔄 Maintenance

### Regular Tasks

1. **Daily**: Check backup completion
2. **Weekly**: Review audit logs
3. **Monthly**: Rotate encryption keys
4. **Quarterly**: Security audit

### Emergency Procedures

1. **Token Compromise**: Revoke all tokens, force re-login
2. **Data Breach**: Execute encryption key rotation
3. **Service Down**: Failover to DR region

---

**Last Updated**: 2025-05-28
**Version**: 1.0.0
**Status**: Ready for Implementation

## 🛠️ Rate-New Specific Implementation

### Current Identity Schema Migration

#### Existing Schema Analysis

```json
// Current Rate-New Identity schema
{
  "Name": "string", // → display_name
  "Type": "enum", // → organization_type (if needed)
  "Slug": "string", // → keep for SEO
  "Avatar": "media" // → avatar_url
}
```

#### Migration Strategy

```javascript
// scripts/migrate-identity-schema.js
module.exports = {
  async up() {
    // 1. Add new columns
    await strapi.db.connection.schema.table("identities", (table) => {
      table.string("user_id").index()
      table.string("organization_id").nullable().index()
      table.boolean("is_primary").defaultTo(true)
      table.string("display_name").nullable()
      table.string("avatar_url").nullable()
      table.string("bio", 2000).nullable()
      table.string("language").defaultTo("vi")
      table.string("timezone").defaultTo("Asia/Ho_Chi_Minh")
      table.enum("theme", ["light", "dark"]).defaultTo("light")
      table.text("ssn").nullable()
      table.integer("ssn_version").defaultTo(1)
      table.text("tax_id").nullable()
      table.integer("tax_id_version").defaultTo(1)
      table.timestamp("last_login").nullable()
    })

    // 2. Migrate existing data
    const existingIdentities = await strapi.entityService.findMany(
      "api::identity.identity"
    )

    for (const identity of existingIdentities) {
      await strapi.entityService.update("api::identity.identity", identity.id, {
        data: {
          display_name: identity.Name,
          user_id: `legacy_${identity.id}`, // Temporary until OIDC setup
          organization_id:
            identity.Type === "Organization" ? `org_${identity.id}` : null,
          // Keep existing fields for backward compatibility
        },
      })
    }

    // 3. Create indexes for performance
    await strapi.db.connection.raw(`
      CREATE INDEX CONCURRENTLY idx_identity_user_org ON identities(user_id, organization_id);
      CREATE INDEX CONCURRENTLY idx_identity_primary ON identities(user_id, is_primary) WHERE is_primary = true;
      CREATE INDEX CONCURRENTLY idx_identity_last_login ON identities(last_login DESC);
    `)
  },

  async down() {
    // Rollback migration if needed
    await strapi.db.connection.schema.table("identities", (table) => {
      table.dropColumns([
        "user_id",
        "organization_id",
        "is_primary",
        "display_name",
        "avatar_url",
        "bio",
        "language",
        "timezone",
        "theme",
        "ssn",
        "ssn_version",
        "tax_id",
        "tax_id_version",
        "last_login",
      ])
    })
  },
}
```

### Zitadel Configuration for Rate-New

#### Zitadel Client Setup

```bash
# 1. Create new OIDC Application in Zitadel
# Name: Rate-New
# Type: Web Application
# Redirect URIs:
#   - http://localhost:3000/auth/callback (dev)
#   - https://rate.yourdomain.com/auth/callback (prod)
# Post Logout URIs:
#   - http://localhost:3000/ (dev)
#   - https://rate.yourdomain.com/ (prod)
# Scopes: openid, profile, email, offline_access

# 2. Configure in Zitadel Console
ZITADEL_DOMAIN=auth.joy.box
CLIENT_ID=your-generated-client-id
CLIENT_SECRET=your-generated-client-secret
```

#### Rate-New Environment Variables

```bash
# Rate-New/.env.local (Next.js)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-min-32-chars

# OIDC Provider (Zitadel)
ZITADEL_ISSUER=https://auth.joy.box
ZITADEL_CLIENT_ID=your-client-id
ZITADEL_CLIENT_SECRET=your-client-secret

# Strapi API
STRAPI_API_URL=http://localhost:1337
STRAPI_API_TOKEN=your-strapi-api-token

# Rate-New/apps/strapi/.env (additional)
# Frontend callback URLs
FRONTEND_URL=http://localhost:3000
FRONTEND_PROD_URL=https://rate.yourdomain.com

# Rate-New specific settings
ORGANIZATION_DOMAIN=rate.yourdomain.com
DEFAULT_ORGANIZATION_ID=rate-main
ENABLE_MULTI_ORG=true
```

## 🔒 Enhanced Security & Error Handling

### Organization Validation Policy

```javascript
// src/policies/validate-organization.js
module.exports = async (policyContext, config, { strapi }) => {
  const { user } = policyContext.state
  const { organization_id } = policyContext.request.body || {}

  if (!user) {
    return false
  }

  // If organization_id provided, validate user has access
  if (organization_id) {
    const hasAccess = await strapi
      .service("api::identity.identity")
      .checkOrganizationAccess(user.id, organization_id)

    if (!hasAccess) {
      strapi.log.warn(
        `Unauthorized org access attempt: user=${user.id}, org=${organization_id}`
      )
      return false
    }
  }

  return true
}
```

### Encryption Key Rotation Error Handling

```javascript
// src/utils/encryption-enhanced.js
const crypto = require("crypto")

const CURRENT_VERSION = 2
const KEYS = {
  1: process.env.ENCRYPTION_KEY_V1,
  2: process.env.ENCRYPTION_KEY_V2,
  3: process.env.ENCRYPTION_KEY_V3, // For future rotation
}

module.exports = {
  encrypt(text, version = CURRENT_VERSION) {
    const key = KEYS[version]
    if (!key) {
      throw new Error(`Encryption key version ${version} not configured`)
    }

    try {
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        Buffer.from(key, "hex"),
        iv
      )

      let encrypted = cipher.update(text, "utf8", "hex")
      encrypted += cipher.final("hex")

      const authTag = cipher.getAuthTag()

      return {
        data:
          iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted,
        version: version,
      }
    } catch (error) {
      strapi.log.error("Encryption failed:", error)
      throw new Error("Failed to encrypt sensitive data")
    }
  },

  decrypt(encryptedData) {
    if (!encryptedData || !encryptedData.data || !encryptedData.version) {
      throw new Error("Invalid encrypted data format")
    }

    const { data, version } = encryptedData
    const key = KEYS[version]

    if (!key) {
      strapi.log.error(`Missing encryption key for version ${version}`)
      throw new Error(`Encryption key version ${version} not available`)
    }

    try {
      const parts = data.split(":")
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format")
      }

      const iv = Buffer.from(parts[0], "hex")
      const authTag = Buffer.from(parts[1], "hex")
      const encrypted = parts[2]

      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        Buffer.from(key, "hex"),
        iv
      )
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(encrypted, "hex", "utf8")
      decrypted += decipher.final("utf8")

      return decrypted
    } catch (error) {
      strapi.log.error("Decryption failed:", { version, error: error.message })
      throw new Error("Failed to decrypt sensitive data")
    }
  },

  // Key rotation utility
  async rotateEncryptedField(entityName, fieldName, fromVersion, toVersion) {
    const entities = await strapi.db.query(entityName).findMany({
      where: { [`${fieldName}_version`]: fromVersion },
    })

    let successCount = 0
    let errorCount = 0

    for (const entity of entities) {
      try {
        // Decrypt with old version
        const decrypted = this.decrypt({
          data: entity[fieldName],
          version: fromVersion,
        })

        // Re-encrypt with new version
        const reencrypted = this.encrypt(decrypted, toVersion)

        // Update entity
        await strapi.db.query(entityName).update({
          where: { id: entity.id },
          data: {
            [fieldName]: reencrypted.data,
            [`${fieldName}_version`]: reencrypted.version,
          },
        })

        successCount++
      } catch (error) {
        strapi.log.error(
          `Key rotation failed for ${entityName}:${entity.id}`,
          error
        )
        errorCount++
      }
    }

    return { successCount, errorCount }
  },
}
```

### Circuit Breaker for External APIs

```javascript
// src/utils/circuit-breaker.js
const CircuitBreaker = require("opossum")

const zitadelBreaker = new CircuitBreaker(
  async (url, options) => {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response
  },
  {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    fallback: () => ({
      error: "Zitadel service temporarily unavailable",
      retry_after: 30,
    }),
  }
)

zitadelBreaker.on("open", () => {
  strapi.log.error("Zitadel circuit breaker opened")
})

zitadelBreaker.on("halfOpen", () => {
  strapi.log.info("Zitadel circuit breaker half-open")
})

module.exports = { zitadelBreaker }
```

## 📱 Frontend Integration Architecture

### NextAuth.js Configuration

```javascript
// Rate-New/apps/ui/lib/auth.js
import NextAuth from "next-auth"

export const authOptions = {
  providers: [
    {
      id: "zitadel",
      name: "Zitadel",
      type: "oauth",
      authorization: {
        url: `${process.env.ZITADEL_ISSUER}/oauth/v2/authorize`,
        params: {
          scope: "openid profile email offline_access",
          response_type: "code",
        },
      },
      token: `${process.env.ZITADEL_ISSUER}/oauth/v2/token`,
      userinfo: `${process.env.ZITADEL_ISSUER}/oidc/v1/userinfo`,
      clientId: process.env.ZITADEL_CLIENT_ID,
      clientSecret: process.env.ZITADEL_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        }
      },
    },
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account.provider === "zitadel") {
        // Create/update identity in Strapi
        await fetch(`${process.env.STRAPI_API_URL}/api/auth/oidc/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: profile.sub,
            email: profile.email,
            name: profile.name,
            avatar_url: profile.picture,
            access_token: account.access_token,
          }),
        })
      }
      return true
    },
    async jwt({ token, account, user }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
      return session
    },
  },
}
```

### Error Boundary Components

```typescript
// Rate-New/apps/ui/components/error-boundary.tsx
'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AuthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Auth error:', error, errorInfo);

    // Report to monitoring service
    if (typeof window !== 'undefined') {
      fetch('/api/error-report', {
        method: 'POST',
        body: JSON.stringify({ error: error.message, stack: error.stack })
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="auth-error">
          <h2>Authentication Error</h2>
          <p>Please try refreshing the page or contact support.</p>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```
