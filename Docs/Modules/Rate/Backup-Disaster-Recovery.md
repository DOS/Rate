# Backup & Disaster Recovery Procedures

## 🔄 Backup Strategy

### Automated Backup System

#### Daily Backup Schedule

- **Database**: 02:00 AM UTC daily
- **Redis**: 02:30 AM UTC daily
- **File uploads**: 03:00 AM UTC daily
- **Retention**: 30 days rolling window

#### Backup Components

1. **PostgreSQL Database**

   - Full database dump with pg_dump
   - Compressed with gzip
   - Includes all schemas and data

2. **Redis Cache**

   - RDB snapshot
   - AOF backup for point-in-time recovery

3. **File Storage**
   - All uploaded media files
   - User avatars and documents
   - Compressed archives

### Backup Scripts

#### PowerShell Backup Script (Windows)

```powershell
# scripts/backup.ps1
param(
    [string]$BackupDir = "D:\Backups\Rate",
    [string]$S3Bucket = "rate-backups"
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "$BackupDir\$timestamp"

# Create backup directory
New-Item -ItemType Directory -Force -Path $backupPath

Write-Host "🔄 Starting backup at $timestamp" -ForegroundColor Green

try {
    # 1. Backup PostgreSQL
    Write-Host "📊 Backing up database..." -ForegroundColor Yellow
    & pg_dump $env:DATABASE_URL | gzip > "$backupPath\postgres_$timestamp.sql.gz"

    # 2. Backup Redis
    Write-Host "💾 Backing up Redis..." -ForegroundColor Yellow
    & redis-cli --rdb "$backupPath\redis_$timestamp.rdb"

    # 3. Backup uploads
    Write-Host "📁 Backing up uploads..." -ForegroundColor Yellow
    Compress-Archive -Path ".\public\uploads\*" -DestinationPath "$backupPath\uploads_$timestamp.zip"

    # 4. Upload to S3
    Write-Host "☁️ Uploading to S3..." -ForegroundColor Yellow
    & aws s3 sync $backupPath s3://$S3Bucket/$timestamp/ --storage-class GLACIER

    # 5. Cleanup old backups (keep 30 days)
    Write-Host "🧹 Cleaning old backups..." -ForegroundColor Yellow
    Get-ChildItem $BackupDir -Directory |
        Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-30) } |
        Remove-Item -Recurse -Force

    Write-Host "✅ Backup completed successfully!" -ForegroundColor Green

} catch {
    Write-Host "❌ Backup failed: $_" -ForegroundColor Red
    exit 1
}
```

#### Bash Backup Script (Linux/Docker)

```bash
#!/bin/bash
# scripts/backup.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/${TIMESTAMP}"
S3_BUCKET="rate-backups"

mkdir -p ${BACKUP_DIR}

echo "🔄 Starting backup at ${TIMESTAMP}"

# 1. Backup PostgreSQL
echo "📊 Backing up database..."
pg_dump ${DATABASE_URL} | gzip > "${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"

# 2. Backup Redis
echo "💾 Backing up Redis..."
redis-cli --rdb "${BACKUP_DIR}/redis_${TIMESTAMP}.rdb"

# 3. Backup uploads
echo "📁 Backing up uploads..."
tar -czf "${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz" ./public/uploads/

# 4. Create backup manifest
cat > "${BACKUP_DIR}/manifest.json" << EOF
{
  "timestamp": "${TIMESTAMP}",
  "components": {
    "database": "postgres_${TIMESTAMP}.sql.gz",
    "redis": "redis_${TIMESTAMP}.rdb",
    "uploads": "uploads_${TIMESTAMP}.tar.gz"
  },
  "version": "1.0.0"
}
EOF

# 5. Upload to S3
echo "☁️ Uploading to S3..."
aws s3 sync ${BACKUP_DIR} s3://${S3_BUCKET}/${TIMESTAMP}/ --storage-class GLACIER

# 6. Cleanup old backups
find /backups -type d -mtime +30 -exec rm -rf {} +

echo "✅ Backup completed!"
```

### Backup Automation

#### Windows Task Scheduler

```xml
<!-- backup-task.xml -->
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2025-01-01T02:00:00</StartBoundary>
      <ExecutionTimeLimit>PT4H</ExecutionTimeLimit>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-ExecutionPolicy Bypass -File D:\Projects\JOY\Rate-New\scripts\backup.ps1</Arguments>
    </Exec>
  </Actions>
</Task>
```

#### Docker Compose Cron

```yaml
# docker-compose.backup.yml
version: "3.9"

services:
  backup:
    build:
      context: .
      dockerfile: Dockerfile.backup
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - S3_BUCKET=rate-backups
    volumes:
      - ./backups:/backups
      - ./public/uploads:/app/public/uploads:ro
    labels:
      - "ofelia.enabled=true"
      - "ofelia.job-exec.backup.schedule=0 2 * * *"
      - "ofelia.job-exec.backup.command=sh /app/scripts/backup.sh"
```

## 🚨 Disaster Recovery

### Recovery Time Objectives

- **RTO** (Recovery Time Objective): < 4 hours
- **RPO** (Recovery Point Objective): < 24 hours

### Recovery Procedures

#### 1. Quick Recovery Script

```javascript
// scripts/disaster-recovery.js
const { exec } = require("child_process")
const { promisify } = require("util")
const execAsync = promisify(exec)
const fs = require("fs").promises

async function recoverFromBackup(backupDate) {
  console.log(`🚨 Starting disaster recovery from ${backupDate}`)

  const steps = [
    {
      name: "Download backup from S3",
      command: `aws s3 sync s3://rate-backups/${backupDate}/ /tmp/restore/`,
    },
    {
      name: "Stop current services",
      command: "docker compose down",
    },
    {
      name: "Restore database",
      command: "gunzip -c /tmp/restore/postgres_*.sql.gz | psql $DATABASE_URL",
    },
    {
      name: "Restore Redis",
      command: "redis-cli --pipe < /tmp/restore/redis_*.rdb",
    },
    {
      name: "Restore uploads",
      command: "tar -xzf /tmp/restore/uploads_*.tar.gz -C ./public/",
    },
    {
      name: "Run migrations",
      command: "yarn strapi migration:run",
    },
    {
      name: "Rebuild and start services",
      command: "docker compose up -d --build",
    },
  ]

  for (const step of steps) {
    console.log(`\n📍 ${step.name}...`)
    try {
      const { stdout, stderr } = await execAsync(step.command)
      if (stdout) console.log(stdout)
      if (stderr) console.error(stderr)
      console.log(`✅ ${step.name} completed`)
    } catch (error) {
      console.error(`❌ ${step.name} failed:`, error.message)
      throw error
    }
  }

  console.log("\n🎉 Recovery completed successfully!")
}

// Usage
const backupDate = process.argv[2]
if (!backupDate) {
  console.error("Usage: node disaster-recovery.js YYYYMMDD_HHMMSS")
  process.exit(1)
}

recoverFromBackup(backupDate).catch((err) => {
  console.error("Recovery failed:", err)
  process.exit(1)
})
```

#### 2. Manual Recovery Steps

##### A. Database Recovery

```bash
# 1. Download backup
aws s3 cp s3://rate-backups/20250528_020000/postgres_20250528_020000.sql.gz .

# 2. Drop existing database (CAREFUL!)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3. Restore database
gunzip -c postgres_20250528_020000.sql.gz | psql $DATABASE_URL

# 4. Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM identities;"
```

##### B. Redis Recovery

```bash
# 1. Stop Redis
redis-cli SHUTDOWN

# 2. Replace dump file
cp /tmp/restore/redis_20250528_020000.rdb /var/lib/redis/dump.rdb

# 3. Start Redis
redis-server /etc/redis/redis.conf

# 4. Verify
redis-cli PING
```

##### C. Application Recovery

```bash
# 1. Restore uploads
tar -xzf uploads_20250528_020000.tar.gz -C ./public/

# 2. Rebuild application
yarn install
yarn build

# 3. Run migrations
yarn strapi migration:run

# 4. Start services
yarn start
```

### Disaster Scenarios

#### Scenario 1: Database Corruption

```bash
# 1. Stop application
docker compose stop strapi

# 2. Restore last known good backup
node scripts/disaster-recovery.js 20250528_020000

# 3. Verify data integrity
yarn test:db-integrity
```

#### Scenario 2: Ransomware Attack

```bash
# 1. Isolate affected systems
# 2. Restore from offline/air-gapped backup
# 3. Change all credentials
# 4. Run security audit
```

#### Scenario 3: Region Outage

```bash
# 1. Failover to DR region
kubectl config use-context dr-region

# 2. Update DNS
aws route53 change-resource-record-sets --hosted-zone-id Z123 \
  --change-batch file://failover-dns.json

# 3. Restore from cross-region backup
```

## 📋 Recovery Checklist

### Pre-Recovery

- [ ] Identify root cause of failure
- [ ] Document incident timeline
- [ ] Notify stakeholders
- [ ] Prepare recovery environment

### During Recovery

- [ ] Execute recovery procedures
- [ ] Monitor recovery progress
- [ ] Test basic functionality
- [ ] Verify data integrity

### Post-Recovery

- [ ] Full system validation
- [ ] Performance testing
- [ ] Update documentation
- [ ] Conduct post-mortem

## 🧪 Testing Procedures

### Monthly DR Drill

```bash
# 1. Create test environment
docker compose -f docker-compose.test.yml up -d

# 2. Restore backup to test env
DATABASE_URL=$TEST_DB node scripts/disaster-recovery.js 20250528_020000

# 3. Run validation suite
yarn test:dr-validation

# 4. Document results
```

### Backup Verification

```javascript
// scripts/verify-backup.js
async function verifyBackup(backupDate) {
  const checks = [
    { name: "Database backup exists", file: `postgres_${backupDate}.sql.gz` },
    { name: "Redis backup exists", file: `redis_${backupDate}.rdb` },
    { name: "Uploads backup exists", file: `uploads_${backupDate}.tar.gz` },
    { name: "Manifest exists", file: "manifest.json" },
  ]

  for (const check of checks) {
    const exists = await s3FileExists(
      `rate-backups/${backupDate}/${check.file}`
    )
    console.log(`${exists ? "✅" : "❌"} ${check.name}`)
  }
}
```

## 📞 Emergency Contacts

### Escalation Path

1. **On-Call Engineer**: Check PagerDuty
2. **Team Lead**: [Contact Info]
3. **Database Admin**: [Contact Info]
4. **AWS Support**: [Support Plan Details]

### Communication Templates

```
INCIDENT ALERT: Production database failure detected
Time: [TIMESTAMP]
Impact: [USER IMPACT]
Actions: Initiating disaster recovery procedures
ETA: 4 hours for full recovery
Updates: Every 30 minutes
```

## 📊 Monitoring Recovery

### Key Metrics

```promql
# Recovery progress
rate_recovery_progress{stage="download|restore|validate"}

# Data integrity
rate_recovery_validation{check="row_count|checksum"}

# Service health
up{job="strapi|postgres|redis"}
```

### Recovery Dashboard

- Backup status overview
- Recovery progress tracker
- System health indicators
- User impact metrics

---

**Last Updated**: 2025-05-28
**Version**: 1.0.0
**Approved By**: [Security Team]

## 🛡️ Rate-New Specific Backup Procedures

### Identity Data Protection

#### Encrypted Field Backup Strategy

```bash
#!/bin/bash
# scripts/backup-identity-encrypted.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/identity/${TIMESTAMP}"
mkdir -p ${BACKUP_DIR}

echo "🔐 Starting encrypted identity data backup..."

# 1. Export identity data with encrypted fields
psql ${DATABASE_URL} -c "
COPY (
  SELECT
    id, user_id, organization_id, is_primary,
    display_name, avatar_url, bio, language, timezone, theme,
    ssn, ssn_version, tax_id, tax_id_version,
    last_login, created_at, updated_at
  FROM identities
  ORDER BY created_at
) TO '${BACKUP_DIR}/identities_encrypted.csv'
WITH (FORMAT CSV, HEADER true, DELIMITER ',', QUOTE '\"');
"

# 2. Create encryption key backup (without actual keys)
cat > "${BACKUP_DIR}/encryption_metadata.json" << EOF
{
  "timestamp": "${TIMESTAMP}",
  "key_versions": {
    "current": 2,
    "available": [1, 2, 3],
    "rotation_history": []
  },
  "encrypted_fields": ["ssn", "tax_id"],
  "backup_type": "full"
}
EOF

# 3. Test encryption/decryption integrity
node -e "
const fs = require('fs');
const { encrypt, decrypt } = require('../src/utils/encryption-enhanced');

// Test encryption works with current keys
try {
  const testData = 'test-encryption-integrity';
  const encrypted = encrypt(testData);
  const decrypted = decrypt(encrypted);

  if (testData === decrypted) {
    console.log('✅ Encryption integrity test passed');
    fs.writeFileSync('${BACKUP_DIR}/encryption_test_passed', '');
  } else {
    throw new Error('Decryption mismatch');
  }
} catch (error) {
  console.error('❌ Encryption integrity test failed:', error);
  process.exit(1);
}
"

echo "✅ Identity backup completed with encryption verification"
```

#### Key Rotation Backup

```powershell
# scripts/backup-key-rotation.ps1
param(
    [string]$BackupDir = "D:\Backups\Rate\Keys",
    [string]$VaultPath = "vault:kv/rate/encryption"
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$keyBackupPath = "$BackupDir\$timestamp"

New-Item -ItemType Directory -Force -Path $keyBackupPath

Write-Host "🔑 Backing up encryption key metadata..." -ForegroundColor Green

# 1. Export key metadata (not actual keys)
$keyMetadata = @{
    timestamp = $timestamp
    current_version = $env:ENCRYPTION_CURRENT_VERSION
    available_versions = @(1, 2, 3)
    vault_path = $VaultPath
    rotation_schedule = "quarterly"
} | ConvertTo-Json -Depth 3

$keyMetadata | Out-File "$keyBackupPath\key_metadata.json"

# 2. Test key availability
$testResults = @()
foreach ($version in 1..3) {
    $keyVar = "ENCRYPTION_KEY_V$version"
    $keyExists = [Environment]::GetEnvironmentVariable($keyVar) -ne $null

    $testResults += @{
        version = $version
        available = $keyExists
        length = if ($keyExists) { ([Environment]::GetEnvironmentVariable($keyVar)).Length } else { 0 }
    }
}

$testResults | ConvertTo-Json | Out-File "$keyBackupPath\key_availability.json"

Write-Host "✅ Key metadata backup completed" -ForegroundColor Green
```

### Organization Data Backup

#### Multi-Organization Backup Strategy

```javascript
// scripts/backup-organizations.js
const fs = require("fs").promises
const path = require("path")

async function backupOrganizationData() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupDir = path.join("/backups/organizations", timestamp)

  await fs.mkdir(backupDir, { recursive: true })

  console.log("🏢 Starting organization data backup...")

  // 1. Export all organizations with their identities
  const organizations = await strapi.db
    .query("api::identity.identity")
    .findMany({
      select: ["organization_id"],
      groupBy: ["organization_id"],
      where: { organization_id: { $notNull: true } },
    })

  for (const org of organizations) {
    const orgId = org.organization_id
    console.log(`📋 Backing up organization: ${orgId}`)

    // Get all identities for this organization
    const identities = await strapi.db
      .query("api::identity.identity")
      .findMany({
        where: { organization_id: orgId },
        orderBy: { created_at: "asc" },
      })

    // Export organization data
    const orgData = {
      organization_id: orgId,
      backup_timestamp: timestamp,
      identity_count: identities.length,
      identities: identities.map((identity) => ({
        ...identity,
        // Mark encrypted fields for special handling
        _encrypted_fields: ["ssn", "tax_id"],
      })),
    }

    await fs.writeFile(
      path.join(backupDir, `org_${orgId.replace(/[^a-zA-Z0-9]/g, "_")}.json`),
      JSON.stringify(orgData, null, 2)
    )
  }

  // 2. Create backup manifest
  const manifest = {
    timestamp,
    type: "organization_backup",
    organizations: organizations.map((o) => o.organization_id),
    total_organizations: organizations.length,
  }

  await fs.writeFile(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  )

  console.log("✅ Organization backup completed")
  return backupDir
}

module.exports = { backupOrganizationData }
```

## 🚨 Identity-Specific Disaster Recovery

### Encrypted Data Recovery

```bash
#!/bin/bash
# scripts/recover-encrypted-identities.sh

BACKUP_DATE=${1:-"latest"}
BACKUP_DIR="/backups/identity/${BACKUP_DATE}"

if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ Backup directory not found: $BACKUP_DIR"
    exit 1
fi

echo "🔐 Starting encrypted identity data recovery..."

# 1. Verify encryption keys are available
node -e "
const { encrypt, decrypt } = require('./src/utils/encryption-enhanced');

// Test all key versions
for (let version = 1; version <= 3; version++) {
  try {
    const testData = 'recovery-test-v' + version;
    const encrypted = encrypt(testData, version);
    const decrypted = decrypt(encrypted);

    if (testData === decrypted) {
      console.log(\`✅ Key version \${version} working\`);
    } else {
      throw new Error('Decryption failed');
    }
  } catch (error) {
    console.error(\`❌ Key version \${version} failed: \${error.message}\`);
    process.exit(1);
  }
}
console.log('🔑 All encryption keys verified');
"

# 2. Import identity data
echo "📥 Importing identity data..."
psql ${DATABASE_URL} -c "
-- Create temp table for import
CREATE TEMP TABLE identities_import (LIKE identities);

-- Import from CSV
\copy identities_import FROM '${BACKUP_DIR}/identities_encrypted.csv' CSV HEADER;

-- Verify row count
SELECT COUNT(*) as imported_rows FROM identities_import;
"

# 3. Validate encrypted data integrity
node -e "
const db = require('./src/database/connection');

async function validateEncryptedData() {
  const identities = await db.query('SELECT id, ssn, ssn_version, tax_id, tax_id_version FROM identities_import WHERE ssn IS NOT NULL OR tax_id IS NOT NULL');

  let validCount = 0;
  let errorCount = 0;

  for (const identity of identities) {
    try {
      if (identity.ssn) {
        const decrypted = decrypt({
          data: identity.ssn,
          version: identity.ssn_version
        });
        if (decrypted) validCount++;
      }

      if (identity.tax_id) {
        const decrypted = decrypt({
          data: identity.tax_id,
          version: identity.tax_id_version
        });
        if (decrypted) validCount++;
      }
    } catch (error) {
      console.error(\`Validation failed for identity \${identity.id}: \${error.message}\`);
      errorCount++;
    }
  }

  console.log(\`✅ Validation completed: \${validCount} valid, \${errorCount} errors\`);

  if (errorCount > 0) {
    console.error('❌ Some encrypted data could not be validated');
    process.exit(1);
  }
}

validateEncryptedData();
"

echo "✅ Encrypted identity recovery completed"
```

### Organization Recovery Procedures

```javascript
// scripts/recover-organization-data.js
const fs = require("fs").promises
const path = require("path")

async function recoverOrganizationData(backupDate, organizationId = null) {
  const backupDir = path.join("/backups/organizations", backupDate)

  try {
    // 1. Read backup manifest
    const manifest = JSON.parse(
      await fs.readFile(path.join(backupDir, "manifest.json"), "utf8")
    )

    console.log(`🔄 Recovering from backup: ${manifest.timestamp}`)

    // 2. Get organizations to recover
    const orgsToRecover = organizationId
      ? [organizationId]
      : manifest.organizations

    for (const orgId of orgsToRecover) {
      console.log(`🏢 Recovering organization: ${orgId}`)

      // Read organization backup file
      const orgFile = `org_${orgId.replace(/[^a-zA-Z0-9]/g, "_")}.json`
      const orgData = JSON.parse(
        await fs.readFile(path.join(backupDir, orgFile), "utf8")
      )

      // 3. Restore identities for this organization
      for (const identity of orgData.identities) {
        try {
          // Check if identity already exists
          const existing = await strapi.db
            .query("api::identity.identity")
            .findOne({
              where: { user_id: identity.user_id },
            })

          if (existing) {
            // Update existing identity
            await strapi.db.query("api::identity.identity").update({
              where: { id: existing.id },
              data: {
                ...identity,
                id: undefined, // Don't update ID
                created_at: undefined, // Preserve original timestamps
                updated_at: new Date(),
              },
            })
            console.log(`✅ Updated identity: ${identity.user_id}`)
          } else {
            // Create new identity
            await strapi.db.query("api::identity.identity").create({
              data: {
                ...identity,
                id: undefined, // Let DB generate new ID
                created_at: new Date(),
                updated_at: new Date(),
              },
            })
            console.log(`✅ Created identity: ${identity.user_id}`)
          }
        } catch (error) {
          console.error(
            `❌ Failed to recover identity ${identity.user_id}: ${error.message}`
          )
        }
      }
    }

    console.log("✅ Organization recovery completed")
  } catch (error) {
    console.error(`❌ Recovery failed: ${error.message}`)
    throw error
  }
}

// CLI usage
if (require.main === module) {
  const [, , backupDate, organizationId] = process.argv

  if (!backupDate) {
    console.error(
      "Usage: node recover-organization-data.js <backup-date> [organization-id]"
    )
    process.exit(1)
  }

  recoverOrganizationData(backupDate, organizationId)
}

module.exports = { recoverOrganizationData }
```

## 🔍 Backup Validation & Testing

### Automated Backup Testing

```yaml
# .github/workflows/backup-validation.yml
name: Backup Validation

on:
  schedule:
    - cron: "0 6 * * *" # Daily at 6 AM
  workflow_dispatch:

jobs:
  validate-backup:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "18"

      - name: Install dependencies
        run: yarn install --frozen-lockfile

      - name: Validate latest backup
        run: |
          # Download latest backup from S3
          aws s3 sync s3://rate-backups/$(date +%Y%m%d)/ ./test-backup/

          # Run validation scripts
          node scripts/validate-backup.js ./test-backup/

      - name: Test encryption integrity
        run: |
          # Test encryption/decryption with backup data
          node scripts/test-encryption-integrity.js

      - name: Notify on failure
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'Backup Validation Failed',
              body: 'Automated backup validation failed. Please investigate.',
              labels: ['backup', 'critical']
            });
```

### Quarterly DR Testing

```bash
#!/bin/bash
# scripts/quarterly-dr-test.sh

echo "🧪 Starting quarterly DR test..."

# 1. Create test database
createdb rate_dr_test

# 2. Restore from latest backup
pg_restore -d rate_dr_test /backups/latest/postgres_*.sql.gz

# 3. Test application startup
export DATABASE_URL="postgres://user:pass@localhost:5432/rate_dr_test"
yarn build
yarn start &
APP_PID=$!

# 4. Test critical endpoints
sleep 30
curl -f http://localhost:1337/healthz || exit 1
curl -f http://localhost:1337/api/identities || exit 1

# 5. Test encryption/decryption
node -e "
const { encrypt, decrypt } = require('./src/utils/encryption-enhanced');
const test = encrypt('DR test data');
console.log('Encrypted:', test);
console.log('Decrypted:', decrypt(test));
"

# 6. Cleanup
kill $APP_PID
dropdb rate_dr_test

echo "✅ DR test completed successfully"
```
