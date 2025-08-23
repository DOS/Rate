#!/bin/bash

# Database backup script for Rate Platform
# Usage: ./backup-db.sh

CONTAINER_ID="0bb0bcdc8306"
DB_NAME="rate_db"
DB_USER="JOY"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/rate_db_backup_${TIMESTAMP}.sql"

# Create backup directory if not exists
mkdir -p ${BACKUP_DIR}

echo "🔄 Starting database backup..."

# Create backup
docker exec ${CONTAINER_ID} pg_dump -U ${DB_USER} ${DB_NAME} > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo "✅ Backup successful: ${BACKUP_FILE}"
    echo "📊 File size: $(du -h ${BACKUP_FILE} | cut -f1)"
    
    # Keep only last 10 backups
    ls -t ${BACKUP_DIR}/*.sql | tail -n +11 | xargs -r rm
    echo "🧹 Cleaned old backups (keeping last 10)"
else
    echo "❌ Backup failed!"
    exit 1
fi