# Redis Stream Validator Worker - Production Docker Image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY enhanced_redis_worker.py ./
COPY apply_redis_migrations.py ./
COPY redis_stream_migrations_fixed.sql ./
COPY redis_stream_producer.py ./
COPY end_to_end_test.py ./

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash validator
RUN chown -R validator:validator /app
USER validator

# Environment variables with defaults
ENV REDIS_URL=redis://localhost:6379
ENV REDIS_STREAM=validation_requests
ENV CONSUMER_GROUP=validator_workers
ENV CONSUMER_NAME=worker_1
ENV POSTGRES_DSN=postgresql://JOY:password@localhost:5432/validator
ENV BATCH_SIZE=10
ENV BLOCK_TIME=1000
ENV MAX_RETRIES=3
ENV LOG_LEVEL=INFO

# Health check for container monitoring
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import redis; import psycopg; r=redis.Redis.from_url('${REDIS_URL}'); r.ping(); print('Redis OK')" || exit 1

# Default command - run Redis Stream Worker
CMD ["python", "enhanced_redis_worker.py"]
