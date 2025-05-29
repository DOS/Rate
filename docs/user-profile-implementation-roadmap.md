# User Profile System - Implementation Roadmap

## 🎯 Quick Start Guide

### Prerequisites

- Strapi v5 project đã setup
- PostgreSQL database
- Redis server
- Zitadel instance (hoặc OIDC provider khác)

## 📋 Implementation Checklist

### Week 0: Pre-Implementation Setup

#### Day -2 to -1: Schema Migration

- [ ] **Backup current database**
  ```bash
  pg_dump $DATABASE_URL | gzip > backup-pre-migration.sql.gz
  ```
- [ ] **Create migration script**
  ```bash
  npx strapi generate migration migrate-identity-schema
  ```
- [ ] **Run schema migration in staging**
  ```bash
  yarn strapi migration:run
  ```
- [ ] **Verify existing data preserved**
- [ ] **Test rollback procedure**

#### Day -1: Environment Setup

- [ ] **Configure Zitadel OIDC Application**
  - Create new Web Application in Zitadel Console
  - Set redirect URIs for dev/prod environments
  - Configure scopes: `openid profile email offline_access`
  - Generate client credentials
- [ ] **Update environment variables**
  - Add Zitadel OIDC settings to `.env`
  - Configure encryption keys (V1, V2, V3)
  - Set frontend callback URLs
- [ ] **Install additional dependencies**
  ```bash
  yarn add dataloader opossum ioredis joi next-auth
  ```

### Week 1: Core Implementation

#### Day 1-2: Setup & Configuration

- [ ] Install required packages
  ```bash
  yarn add dataloader opossum ioredis joi
  yarn add @strapi/plugin-documentation
  ```
- [ ] Configure Zitadel OIDC in `config/plugins.js`
- [ ] Setup environment variables
- [ ] Configure middleware stack

#### Day 3-4: Identity System

- [ ] **Run schema migration in production**
  ```bash
  # Coordinate with team for maintenance window
  yarn strapi migration:run
  ```
- [ ] **Update Identity content-type**
  - Add new fields từ migration
  - Configure proper validations
  - Test with existing data
- [ ] **Implement enhanced lifecycle hooks**
  - Add encryption for sensitive fields
  - Implement error handling
  - Add audit logging

#### Day 5: Authentication Flow

- [ ] Create custom auth routes
- [ ] Implement refresh token endpoint
- [ ] Add logout với token revocation
- [ ] Setup cookie configuration

### Week 2: Security & Performance

#### Day 6-7: Security Hardening

- [ ] **Implement enhanced encryption**
  - Deploy encryption-enhanced.js with key rotation support
  - Test encryption/decryption with multiple key versions
  - Setup key rotation procedures
- [ ] **Add organization validation**
  - Create validate-organization.js policy
  - Test multi-organization access controls
  - Implement organization audit logging
- [ ] **Configure circuit breaker**
  - Setup circuit breaker for Zitadel API calls
  - Test failover scenarios
  - Configure monitoring alerts

#### Day 8-9: Frontend Integration

- [ ] **Setup NextAuth.js in UI app**
  ```bash
  cd apps/ui && yarn add next-auth
  ```
- [ ] **Configure Zitadel provider**
  - Implement auth.js configuration
  - Test OIDC flow with Zitadel
  - Setup session management
- [ ] **Create auth components**
  - Login/logout buttons
  - Protected route components
  - Error boundary for auth errors
- [ ] **Connect frontend to Strapi**
  - Implement Strapi API calls with auth tokens
  - Test identity creation/update flow
  - Handle token refresh scenarios

#### Day 10: Testing & Documentation

- [ ] **Comprehensive testing**
  - Unit tests for encryption/decryption
  - Integration tests for OIDC flow
  - E2E tests for complete auth journey
  - Load testing with multiple concurrent users
- [ ] **Frontend-Backend integration tests**
  - Test login flow from UI to Strapi
  - Verify token validation and renewal
  - Test error handling scenarios

### Week 3: Production Deployment

#### Day 11-12: Infrastructure & Frontend

- [ ] **Deploy frontend with auth**
  - Build and deploy UI app with NextAuth
  - Configure production environment variables
  - Test production OIDC flow
- [ ] **Setup frontend monitoring**
  - Add error tracking for auth failures
  - Monitor session duration and renewal
  - Track user engagement metrics

#### Day 13-14: Full System Testing

- [ ] **End-to-end system testing**
  - Test complete user journey: Login → Profile → Logout
  - Verify data consistency between Zitadel and Strapi
  - Test organization switching flows
- [ ] **Performance testing**
  - Load test with realistic user patterns
  - Monitor database performance under load
  - Test circuit breaker activation/recovery

#### Day 15: Go Live & Monitoring

- [ ] **Production deployment**
  - Deploy both Strapi and UI to production
  - Configure production monitoring
  - Setup alerting for auth failures
- [ ] **User onboarding**
  - Create user guides for new auth flow
  - Setup support procedures for auth issues
  - Monitor user adoption and feedback

## 🚀 Quick Commands

### Development

```bash
# Start development with logging
yarn develop 2>&1 | tee -a logs/strapi-dev.log

# Run tests
yarn test:unit
yarn test:e2e

# Build for production
yarn build
```

### Database

```bash
# Run migrations
yarn strapi migration:run

# Create new migration
npx strapi generate migration add-identity-indexes

# Backup database
pg_dump $DATABASE_URL | gzip > backup.sql.gz
```

### Monitoring

```bash
# Check health
curl http://localhost:1337/healthz

# Check readiness
curl http://localhost:1337/readyz

# View metrics
curl http://localhost:1337/metrics
```

## 📊 Success Metrics

### Technical KPIs

- [ ] Auth endpoint latency < 200ms (p95)
- [ ] Token refresh success rate > 99.9%
- [ ] Zero security vulnerabilities
- [ ] 99.95% uptime SLA

### Business KPIs

- [ ] User profile completion rate > 80%
- [ ] SSO adoption rate > 90%
- [ ] Support tickets < 1% of users
- [ ] User satisfaction > 4.5/5

## ⚠️ Common Pitfalls

1. **CORS Issues**

   - Always configure allowed origins explicitly
   - Don't use wildcard (\*) in production

2. **Token Management**

   - Never store tokens in localStorage
   - Always use HttpOnly cookies for refresh tokens

3. **Encryption**

   - Never commit encryption keys
   - Always version your keys
   - Test key rotation in staging first

4. **Performance**
   - Don't forget database indexes
   - Implement caching from day 1
   - Monitor query performance

## 🆘 Troubleshooting

### Issue: 403 on Identity endpoints

```bash
# Check user permissions
SELECT * FROM up_permissions WHERE name LIKE '%identity%';

# Verify policy is applied
curl -H "Authorization: Bearer $TOKEN" /api/identities/me
```

### Issue: Encryption errors

```bash
# Check key versions
SELECT DISTINCT ssn_version, tax_id_version FROM identities;

# Run migration if needed
node scripts/migrate-encryption.js
```

### Issue: High latency

```bash
# Check slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;

# Verify Redis connection
redis-cli ping
```

## 📞 Support Contacts

- **Technical Lead**: [Your Name]
- **DevOps**: [DevOps Contact]
- **Security**: [Security Team]
- **On-call**: [PagerDuty/OpsGenie]

## 📅 Post-Launch Tasks

### Week 4+

- [ ] Implement multi-organization support
- [ ] Add profile import/export
- [ ] Enhanced audit reporting
- [ ] Mobile app integration
- [ ] Advanced analytics dashboard

### Quarter 2

- [ ] GraphQL API support
- [ ] Webhooks for profile updates
- [ ] Advanced permission system
- [ ] Profile versioning
- [ ] GDPR compliance tools

## 🔄 Schema Migration Specific Steps

### Pre-Migration Checklist

```bash
# 1. Verify current data
SELECT COUNT(*) FROM identities;
SELECT "Name", "Type", "Slug" FROM identities LIMIT 5;

# 2. Create backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d_%H%M%S).sql

# 3. Check for constraints
SELECT * FROM information_schema.table_constraints
WHERE table_name = 'identities';
```

### Migration Execution

```bash
# 1. Generate and run migration
npx strapi generate migration migrate-identity-schema
yarn strapi migration:run

# 2. Verify migration success
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'identities';

# 3. Check data integrity
SELECT COUNT(*) as total,
       COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as with_user_id,
       COUNT(CASE WHEN display_name IS NOT NULL THEN 1 END) as with_display_name
FROM identities;
```

### Post-Migration Validation

```bash
# 1. Test API endpoints
curl -X GET http://localhost:1337/api/identities

# 2. Verify encryption works
node -e "
const { encrypt, decrypt } = require('./src/utils/encryption-enhanced');
const test = encrypt('test data');
console.log('Encrypted:', test);
console.log('Decrypted:', decrypt(test));
"

# 3. Check indexes created
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'identities';
```

## 🧪 Frontend Integration Testing

### NextAuth Testing Checklist

- [ ] **OIDC Provider Configuration**
  ```bash
  # Test Zitadel endpoints are accessible
  curl ${ZITADEL_ISSUER}/.well-known/openid-configuration
  ```
- [ ] **Auth Flow Testing**
  - Login redirects to Zitadel correctly
  - Successful login creates session
  - Token refresh works automatically
  - Logout clears session completely
- [ ] **Strapi Integration**
  - Identity created in Strapi on first login
  - Subsequent logins update existing identity
  - Token validation works for API calls
  - Error handling for expired tokens

### Common Integration Issues

1. **CORS Configuration**

   ```bash
   # Test CORS headers
   curl -H "Origin: http://localhost:3000" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: X-Requested-With" \
        -X OPTIONS http://localhost:1337/api/auth/oidc/callback
   ```

2. **Cookie Configuration**

   - Verify HttpOnly cookies set correctly
   - Check SameSite and Secure flags
   - Test cross-domain cookie behavior

3. **Token Validation**
   ```bash
   # Test JWT validation
   curl -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        http://localhost:1337/api/identities/me
   ```

---

**Created**: 2025-05-28
**Last Updated**: 2025-05-28
**Status**: Ready to Implement
