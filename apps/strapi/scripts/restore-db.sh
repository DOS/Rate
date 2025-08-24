#!/bin/bash

# Database restore script for Rate Platform
# Usage: ./restore-db.sh [backup_file]

CONTAINER_ID="0bb0bcdc8306"
DB_NAME="rate_db"
DB_USER="JOY"
BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "❌ Usage: ./restore-db.sh <backup_file>"
    echo "Available backups:"
    ls -la ./backups/*.sql
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "⚠️  WARNING: This will replace all data in the database!"
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Restore cancelled"
    exit 1
fi

echo "🔄 Starting database restore..."

# Drop and recreate database
docker exec ${CONTAINER_ID} psql -U ${DB_USER} -c "DROP DATABASE IF EXISTS ${DB_NAME};"
docker exec ${CONTAINER_ID} psql -U ${DB_USER} -c "CREATE DATABASE ${DB_NAME};"

# Restore backup
docker exec -i ${CONTAINER_ID} psql -U ${DB_USER} ${DB_NAME} < ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo "✅ Restore successful from: ${BACKUP_FILE}"
else
    echo "❌ Restore failed!"
    exit 1
fi